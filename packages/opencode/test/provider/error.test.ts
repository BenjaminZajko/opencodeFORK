import { describe, expect, test } from "bun:test"
import { ProviderError } from "@/provider/error"
import { APICallError } from "ai"
import { ProviderV2 } from "@opencode-ai/core/provider"

test("Groq's hard request token allowance is not a compact-and-retry context error", () => {
  const result = ProviderError.parseAPICallError({
    providerID: ProviderV2.ID.make("groq"),
    error: new APICallError({
      message: "Request too large for model openai/gpt-oss-120b on tokens per minute (TPM): Limit 8000, Requested 15259",
      url: "https://api.groq.com/openai/v1/chat/completions",
      requestBodyValues: {}, statusCode: 413, isRetryable: true,
    }),
  })
  expect(result.type).toBe("api_error")
  if (result.type !== "api_error") throw new Error("Expected actionable provider limit")
  expect(result.isRetryable).toBe(false)
  expect(result.message).toContain("15259")
  expect(result.message).toContain("8000")
  expect(result.message).not.toContain("Upgrade")
})

test("a temporary Groq 429 still permits backoff, while ordinary context overflow can compact", () => {
  const error = (statusCode: number, message: string) => ProviderError.parseAPICallError({
    providerID: ProviderV2.ID.make("groq"),
    error: new APICallError({ message, statusCode, url: "https://api.groq.com/openai/v1/chat/completions", requestBodyValues: {}, isRetryable: true }),
  })
  expect(error(429, "Rate limit reached on tokens per minute (TPM). Please try again in 2 seconds.")).toMatchObject({ type: "api_error", isRetryable: true })
  expect(error(413, "request entity too large").type).toBe("context_overflow")
})

describe("provider stream errors", () => {
  test("retries provider stream errors without a code", () => {
    const messages = [
      "The model is currently at capacity due to high demand. Please try again in a few minutes, or use a higher service tier for priority processing: https://docs.x.ai/developers/advanced-api-usage/priority-processing",
      "The model is temporarily unavailable.",
    ]

    for (const message of messages)
      expect(
        ProviderError.parseStreamError({
          type: "error",
          error: { message },
        }),
      ).toEqual({
        type: "api_error",
        message,
        isRetryable: true,
        responseBody: JSON.stringify({ type: "error", error: { message } }),
      })
  })
})
