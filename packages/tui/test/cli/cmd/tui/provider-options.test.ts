import { describe, expect, test } from "bun:test"
import { normalizeCustomProviderID, providerOptions } from "../../../../src/component/dialog-provider"

describe("providerOptions", () => {
  test("excludes paid, trial-only and arbitrary custom providers", () => {
    expect(providerOptions([
      { id: "openai", name: "OpenAI" }, { id: "opencode", name: "OpenCode" },
      { id: "nvidia", name: "NVIDIA" }, { id: "custom", name: "Custom" },
    ])).toEqual([])
  })

  test("groups supported connections under Free providers", () => {
    expect(providerOptions([{ id: "mistral", name: "Mistral" }])[0]?.category).toBe("Free providers")
  })

  test("orders free connections consistently without an upsell or Other escape hatch", () => {
    expect(providerOptions([
      { id: "mistral", name: "Mistral" }, { id: "groq", name: "Groq" },
      { id: "openrouter", name: "OpenRouter" }, { id: "anthropic", name: "Anthropic" },
    ]).map((option) => option.value)).toEqual(["openrouter", "groq", "mistral"])
  })

  test("does not collide with a configured provider named other", () => {
    const values = providerOptions([{ id: "other", name: "Other Provider" }]).map((option) => option.value)
    expect(new Set(values).size).toBe(values.length)
  })

  test("normalizes and validates custom provider ids", () => {
    expect(normalizeCustomProviderID("  custom-provider  ")).toBe("custom-provider")
    expect(normalizeCustomProviderID("custom_provider")).toBe("custom_provider")
    expect(normalizeCustomProviderID("@ai-sdk/custom-provider")).toBe("custom-provider")
    expect(normalizeCustomProviderID("-custom-provider")).toBeUndefined()
    expect(normalizeCustomProviderID("Custom Provider")).toBeUndefined()
  })
})
