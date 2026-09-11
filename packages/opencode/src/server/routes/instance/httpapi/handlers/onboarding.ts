import { ProviderFallback } from "@/provider/fallback"
import { detectHardware } from "@/onboarding/hardware"
import { findOllamaBinary, ollamaStatus, pullOllamaModel } from "@/onboarding/ollama"
import { effectiveMemoryGb, modelMemoryNeedGb, recommend } from "@/onboarding/reasoning"

import { Effect, Queue, Stream } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { OnboardingApiError } from "../groups/onboarding"

function sseLine(data: string): string {
  return `data: ${data.replace(/\n/g, " ")}\n\n`
}

export const onboardingHandlers = HttpApiBuilder.group(InstanceHttpApi, "onboarding", (handlers) =>
  Effect.gen(function* () {
    const recommendation = Effect.fn("OnboardingHttpApi.recommendation")(function* () {
      const profile = yield* Effect.promise(() => detectHardware())
      const rec = recommend(profile)
      const poolGb = effectiveMemoryGb(profile)
      const gpu = profile.gpus.length > 0 ? profile.gpus[0] : undefined
      return {
        profile: {
          os: profile.osName,
          cpu: profile.cpuModel,
          ramGb: profile.ramTotalGb,
          gpu: gpu ? `${gpu.name}${gpu.vramGb ? ` (${gpu.vramGb} GB VRAM)` : ""}` : undefined,
          poolGb,
        },
        primaryLocal: rec.primaryLocal
          ? {
              id: rec.primaryLocal.model.id,
              kind: "local" as const,
              score: rec.primaryLocal.score,
              fit: rec.primaryLocal.fit,
              reasons: rec.primaryLocal.reasons,
              needGb: modelMemoryNeedGb(rec.primaryLocal.model),
            }
          : undefined,
        primaryCloud: rec.primaryCloud
          ? {
              id: rec.primaryCloud.model.id,
              kind: "cloud" as const,
              score: rec.primaryCloud.score,
              fit: rec.primaryCloud.fit,
              reasons: rec.primaryCloud.reasons,
            }
          : undefined,
        primary: rec.primary,
        alternates: rec.alternates.map((a) => ({
          id: a.model.id,
          kind: a.model.kind,
          score: a.score,
          fit: a.fit,
          reasons: a.reasons,
        })),
        explanation: rec.explanation,
      }
    })

    const ollama = Effect.fn("OnboardingHttpApi.ollama")(function* () {
      const status = yield* Effect.promise(() => ollamaStatus())
      return { installed: status.installed, models: status.models }
    })

    const pull = Effect.fn("OnboardingHttpApi.pull")(function* (ctx: {
      payload: { model: string }
    }) {
      const binary = yield* Effect.promise(() => findOllamaBinary())
      if (!binary) {
        return yield* new OnboardingApiError({ name: "OnboardingOllamaMissing", data: {} })
      }
      const queue = yield* Queue.unbounded<string>()
      const finish = (line: string) =>
        Queue.offer(queue, line).pipe(Effect.andThen(Queue.shutdown(queue)))
      yield* Effect.promise(() =>
        pullOllamaModel(binary, ctx.payload.model, (line) => {
          Queue.offerUnsafe(queue, sseLine(line))
        }),
      ).pipe(
        Effect.flatMap((result) =>
          finish(sseLine(JSON.stringify(result.ok ? { done: true } : { done: false, error: result.error }))),
        ),
        Effect.catchCause((cause) =>
          finish(sseLine(JSON.stringify({ done: false, error: "pull failed" }))).pipe(
            Effect.andThen(Effect.logWarning("onboarding pull failed", { cause })),
          ),
        ),
        Effect.forkScoped,
      )
      return HttpServerResponse.stream(Stream.encodeText(Stream.fromQueue(queue)), {
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache, no-transform" },
      })
    })

    const def = Effect.fn("OnboardingHttpApi.default")(function* (ctx: {
      payload: { connected: ReadonlyArray<string>; preferredTier?: string }
    }) {
      const target = ProviderFallback.rankedDefault(new Set(ctx.payload.connected), undefined, ctx.payload.preferredTier)
      if (!target) return undefined
      return { providerID: target.providerID, modelID: target.modelID }
    })

    return handlers
      .handle("recommendation", () => recommendation())
      .handle("ollama", () => ollama())
      .handle("pull", pull)
      .handle("default", def)
  }),
)
