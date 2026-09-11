import { describe, it, expect } from "bun:test"
import { Llm7AuthPlugin, LLM7_BASE_URL } from "@/plugin/llm7"
import type { PluginInput } from "@opencode-ai/plugin"

describe("Llm7AuthPlugin", () => {
  const mockInput: PluginInput = {
    client: {} as any,
    project: {} as any,
    worktree: "/tmp",
    directory: "/tmp",
    experimental_workspace: { register: () => {} },
    get serverUrl() { return new URL("http://localhost:4096") },
    $: {} as any,
  }

  it("uses the documented OpenAI-compatible base URL", () => {
    expect(LLM7_BASE_URL).toBe("https://api.llm7.io/v1")
  })

  it("offers manual API key only, no OAuth", async () => {
    const plugin = await Llm7AuthPlugin(mockInput)
    const methods = plugin.auth!.methods
    expect(methods).toHaveLength(1)
    expect(methods[0].type).toBe("api")
  })

  it("discloses free-token limits and billing with the key URL", async () => {
    const plugin = await Llm7AuthPlugin(mockInput)
    const method = plugin.auth!.methods[0]
    if (method.type !== "api") throw new Error("expected api method")
    expect(method.prompts).toHaveLength(1)
    const prompt = method.prompts![0]
    if (prompt.type !== "select") throw new Error("expected select prompt")
    expect(prompt.key).toBe("acknowledge")
    expect(prompt.message).toContain("https://dash.llm7.io")
    expect(prompt.message).toContain("1M tokens/day")
    expect(prompt.message).toContain("payment method")
    expect(prompt.options.map((o) => o.value)).toEqual(["continue", "cancel"])
  })

  it("registers no provider models hook (models.dev live list applies)", async () => {
    const plugin = await Llm7AuthPlugin(mockInput)
    expect(plugin.provider).toBeUndefined()
  })
})
