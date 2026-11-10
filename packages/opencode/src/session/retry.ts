import type { NamedError } from "@opencode-ai/core/util/error"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Cause, Clock, Duration, Effect, Schedule } from "effect"
import { MessageV2 } from "./message-v2"
import { iife } from "@/util/iife"
import { isRecord } from "@/util/record"
import { ProviderFallback } from "@/provider/fallback"

export type Err = ReturnType<NamedError["toObject"]>

export const GO_UPSELL_MESSAGE = "Free usage exceeded, subscribe to Go"
export const GO_UPSELL_URL = "https://opencode.ai/go"
export type RetryReason = "free_tier_limit" | "account_rate_limit" | (string & {})

export type Retryable = {
  message: string
  action?: {
    reason: RetryReason
    provider: string
    title: string
    message: string
    label: string
    link?: string
  }
}

export const RETRY_INITIAL_DELAY = 2000
export const RETRY_BACKOFF_FACTOR = 2
export const RETRY_JITTER_FACTOR = 0.25
export const RETRY_MAX_DELAY_NO_HEADERS = 30_000 // 30 seconds
export const RETRY_MAX_DELAY = 2_147_483_647 // max 32-bit signed integer for setTimeout
export const RETRY_MAX_RETRIES = 5
export const MAX_MODEL_SWITCHES = 8
// Free tiers have per-minute caps that always clear; waiting beats losing the
// work done so far. ~5 minutes of backoff, shown with a countdown and stoppable.
export const RATE_LIMIT_MAX_RETRIES = 12

const RETRYABLE_MESSAGE_PATTERNS = [
  /429|500|502|503|504|524/i,
  /rate increased too quickly|rate limit|rate-limit|rate_limit|too many requests/i,
  /overloaded|service unavailable|service_unavailable|service-unavailable|internal error|internal_error|internal server error|server error|server_error|server-error|provider returned error|provider_returned_error|provider-returned-error/i,
  /terminated|fetch failed|failed to fetch|network[-_\s]error|upstream connect|connection error|connection refused|connection lost|socket connection was closed|socket hang up|reset before headers|getaddrinfo|enotfound|eai_again|econnrefused|econnreset|etimedout/i,
  /^timeout$|\b(?:request|response|connection|network|stream|read) (?:timeout|timed out|time out)\b/i,
  /try your request again|retry your request|resource exhausted|resource_exhausted/i,
  /\btry again (?:later|in\b)|\b(?:currently|temporarily) at capacity\b/i,
]

export function toolValidationFailure(error: Err) {
  if (SessionV1.APIError.isInstance(error) && error.data.statusCode !== undefined && error.data.statusCode !== 400) return false
  const data = isRecord(error.data) ? error.data : {}
  const detail = [data.message, data.responseBody].filter((value) => typeof value === "string").join("\n")
  return /tool call validation failed/i.test(detail) && /(?:attempted to call tool|not in request\.tools|did not match schema|missing propert)/i.test(detail)
}

/** The provider rejected a call to a real tool because its arguments were invalid. */
export function toolArgumentsInvalid(error: Err) {
  const data = isRecord(error.data) ? error.data : {}
  return [data.message, data.responseBody].some((value) => typeof value === "string" && /did not match schema|missing propert/i.test(value))
}

function cap(ms: number) {
  return Math.min(ms, RETRY_MAX_DELAY)
}

export function delay(attempt: number, error?: SessionV1.APIError, random = Math.random()) {
  if (error) {
    const headers = error.data.responseHeaders
    if (headers) {
      const retryAfterMs = headers["retry-after-ms"]
      if (retryAfterMs) {
        const parsedMs = Number.parseFloat(retryAfterMs)
        if (!Number.isNaN(parsedMs)) {
          return cap(parsedMs)
        }
      }

      // Mistral's free tier (2 requests/minute) reports an empty minute window
      // without retry-after; waiting a few seconds would only fail again.
      if (headers["x-ratelimit-remaining-req-minute"] === "0") return cap(60_000)

      const retryAfter = headers["retry-after"]
      if (retryAfter) {
        const parsedSeconds = Number.parseFloat(retryAfter)
        if (!Number.isNaN(parsedSeconds)) {
          // convert seconds to milliseconds
          return cap(Math.ceil(parsedSeconds * 1000))
        }
        // Try parsing as HTTP date format
        const parsed = Date.parse(retryAfter) - Date.now()
        if (!Number.isNaN(parsed) && parsed > 0) {
          return cap(Math.ceil(parsed))
        }
      }

      return cap(exponential(attempt, random))
    }
  }

  return cap(Math.min(exponential(attempt, random), RETRY_MAX_DELAY_NO_HEADERS))
}

function exponential(attempt: number, random: number) {
  const base = RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1)
  return Math.ceil(base + base * RETRY_JITTER_FACTOR * random)
}

/** The provider refused this request size outright (e.g. Groq's free tokens-per-minute cap). Another model may accept it. */
export function oversized(error: Err) {
  return SessionV1.APIError.isInstance(error) && error.data.statusCode === 413 && !error.data.isRetryable
}

export function retryable(error: Err, provider: string) {
  // context overflow errors should not be retried
  if (SessionV1.ContextOverflowError.isInstance(error)) return undefined
  if (toolValidationFailure(error)) return { message: "Correcting the model’s tool call" }
  if (SessionV1.APIError.isInstance(error)) {
    const status = error.data.statusCode
    // A single request larger than the per-minute token cap can never fit, even
    // though its body says "rate limit"; retrying it only stalls the session.
    if (oversized(error)) return undefined
    // 5xx errors are transient server failures and should always be retried,
    // even when the provider SDK doesn't explicitly mark them as retryable.
    if (
      !error.data.isRetryable &&
      !(status !== undefined && status >= 500) &&
      !matchesRetryableMessage(error.data.message) &&
      !matchesRetryableMessage(error.data.responseBody)
    )
      return undefined
    if (error.data.responseBody?.includes("FreeUsageLimitError")) {
      return {
        message: GO_UPSELL_MESSAGE,
        action: {
          reason: "free_tier_limit",
          provider,
          title: "Free limit reached",
          message: "Subscribe to OpenCode Go for reliable access to the best open-source models for $10/month.",
          label: "subscribe",
          link: GO_UPSELL_URL,
        },
      }
    }
    if (error.data.responseBody?.includes("GoUsageLimitError")) {
      const body = parseJSON(error.data.responseBody)
      const workspace = str(body?.metadata?.workspace)
      const limitName = str(body?.metadata?.limitName)
      const retryAfter = num(error.data.responseHeaders?.["retry-after"])
      const resetIn = iife(() => {
        if (retryAfter === undefined) return ""
        const seconds = Math.max(0, Math.ceil(retryAfter))
        const days = Math.floor(seconds / 86_400)
        const hours = Math.floor((seconds % 86_400) / 3_600)
        const minutes = Math.ceil((seconds % 3_600) / 60)
        const unit = (value: number, name: string) => `${value} ${name}${value === 1 ? "" : "s"}`

        if (days > 0) return hours > 0 ? `${unit(days, "day")} ${unit(hours, "hour")}` : unit(days, "day")
        if (hours > 0) return minutes > 0 ? `${unit(hours, "hour")} ${unit(minutes, "minute")}` : unit(hours, "hour")
        return minutes > 0 ? unit(minutes, "minute") : "less than a minute"
      })

      const message = `${limitName ? `${limitName} usage limit` : "Usage limit"} reached. It will reset in ${resetIn}. To continue using this model now, enable usage from your available balance`

      const link = `https://opencode.ai/workspace/${workspace}/go`
      return {
        message: `${message} - ${link}`,
        action: {
          reason: "account_rate_limit",
          provider,
          title: "Go limit reached",
          message,
          label: "open settings",
          link,
        },
      }
    }
    return { message: error.data.message.includes("Overloaded") ? "Provider is overloaded" : error.data.message }
  }

  const message = isRecord(error.data) ? error.data.message : undefined
  if (typeof message !== "string") return undefined
  const lower = message.toLowerCase()
  if (lower.includes("too_many_requests")) return { message: "Too Many Requests" }
  if (lower.includes("exhausted") || lower.includes("unavailable")) return { message: "Provider is overloaded" }
  if (matchesRetryableMessage(message)) return { message }
  return undefined
}

function matchesRetryableMessage(value: unknown) {
  return typeof value === "string" && RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(value))
}

function str(value: unknown) {
  if (value === undefined || value === null) return ""
  return String(value)
}

function num(value: unknown) {
  const parsed = Number.parseFloat(str(value))
  if (Number.isNaN(parsed)) return undefined
  return parsed
}

function parseJSON(value: unknown) {
  return iife(() => {
    try {
      if (typeof value !== "string") return undefined
      return JSON.parse(value)
    } catch {
      return undefined
    }
  })
}

export function policy(opts: {
  provider: string
  parse: (error: unknown) => Err
  set: (input: {
    attempt: number
    message: string
    action?: Retryable["action"]
    next: number
    error: Err
  }) => Effect.Effect<void>
  /**
   * Called after `set` for each retryable error. Resolves true when a different
   * model will serve the retry immediately, a number of milliseconds when the
   * chosen model is cooling down briefly, and false/void when nothing changed.
   */
  switchModel?: (error: Err, attempt: number) => Effect.Effect<boolean | number | void>
  toolValidationRecovery?: boolean
}) {
  // Same-model retries and model switches have separate budgets: walking a
  // fallback chain must not use up the retries of the model that finally answers.
  let toolRepairs = 0
  let retries = 0
  let switches = 0
  return Schedule.fromStepWithMetadata(
    Effect.succeed((meta: Schedule.InputMetadata<unknown>) => {
      const error = opts.parse(meta.input)
      const repair = toolValidationFailure(error)
      if (repair && (opts.toolValidationRecovery === false || toolRepairs >= 2)) return Cause.done(meta.attempt)
      if (oversized(error)) {
        const switchModel = opts.switchModel
        if (!switchModel || switches >= MAX_MODEL_SWITCHES) return Cause.done(meta.attempt)
        return Effect.gen(function* () {
          const switched = yield* switchModel(error, meta.attempt)
          if (switched === false || switched === undefined) return yield* Cause.done(meta.attempt)
          switches++
          const wait = typeof switched === "number" ? switched : 0
          const now = yield* Clock.currentTimeMillis
          yield* opts.set({ attempt: meta.attempt, message: "Request too large for this provider's free allowance · switching to another free model", next: now + wait, error })
          return [meta.attempt, Duration.millis(wait)] as [number, Duration.Duration]
        })
      }
      const retry = retryable(error, opts.provider)
      if (!retry) return Cause.done(meta.attempt)
      const switchModel = switches < MAX_MODEL_SWITCHES ? opts.switchModel : undefined
      const maxRetries = ProviderFallback.isRateLimited(error) ? RATE_LIMIT_MAX_RETRIES : RETRY_MAX_RETRIES
      if (!repair && !switchModel && retries >= maxRetries) return Cause.done(meta.attempt)
      return Effect.gen(function* () {
        const failed = repair ? 0 : delay(retries + 1, SessionV1.APIError.isInstance(error) ? error : undefined)
        const now = yield* Clock.currentTimeMillis
        // `set` runs before switching so it still identifies the failed model.
        yield* opts.set({ attempt: meta.attempt, message: retry.message, action: retry.action, next: now + failed, error })
        if (repair) {
          toolRepairs++
          // switchModel adds the corrective tool list for this retry.
          if (opts.switchModel) yield* opts.switchModel(error, meta.attempt)
          return [meta.attempt, Duration.millis(0)] as [number, Duration.Duration]
        }
        const switched = switchModel ? yield* switchModel(error, meta.attempt) : false
        if (switched !== false && switched !== undefined) {
          switches++
          return [meta.attempt, Duration.millis(typeof switched === "number" ? switched : 0)] as [number, Duration.Duration]
        }
        retries++
        if (retries > maxRetries) return yield* Cause.done(meta.attempt)
        return [meta.attempt, Duration.millis(failed)] as [number, Duration.Duration]
      })
    }),
  )
}

export * as SessionRetry from "./retry"
