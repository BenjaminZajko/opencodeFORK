import { describe, expect, test } from "bun:test"
import { SystemPrompt } from "../../src/session/system"
import { compactDescription } from "../../src/tool/compact"
import type { Provider } from "../../src/provider/provider"

const model = (providerID: string, id: string) => ({ providerID, id, api: { id } }) as unknown as Provider.Model

describe("OliveCode system prompts", () => {
  test("introduce the agent as OliveCode and link OliveCode's issue tracker", () => {
    for (const prompt of [model("mistral", "codestral-latest"), model("openrouter", "nvidia/nemotron-3-ultra-550b-a55b:free"), model("openrouter", "openai/gpt-5:free")].flatMap(SystemPrompt.provider)) {
      expect(prompt).toContain("OliveCode")
      expect(prompt).not.toMatch(/\bopencode\b/i)
      expect(prompt).not.toContain("anomalyco")
    }
  })

  test("small-budget providers get the compact prompt", () => {
    expect(SystemPrompt.compact(model("groq", "openai/gpt-oss-120b"))).toBe(true)
    expect(SystemPrompt.compact(model("ollama", "qwen3:8b"))).toBe(true)
    expect(SystemPrompt.compact(model("mistral", "codestral-latest"))).toBe(false)
    const [prompt] = SystemPrompt.provider(model("groq", "openai/gpt-oss-120b"))
    expect(prompt!.length).toBeLessThan(2000)
    expect(prompt).toStartWith("You are OliveCode")
  })

  test("compact tool descriptions are short and keep the edit rules", () => {
    expect(compactDescription("edit", "long")).toContain("Read the file first")
    expect(compactDescription("unknown_tool", "First paragraph.\n\nSecond paragraph.")).toBe("First paragraph.")
  })
})
