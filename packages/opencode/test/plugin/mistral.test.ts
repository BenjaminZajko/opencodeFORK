import { describe, it, expect } from "bun:test"
import { MistralAuthPlugin, MISTRAL_BASE_URL } from "@/plugin/mistral"
import type { PluginInput } from "@opencode-ai/plugin"

describe("MistralAuthPlugin", () => {
  const mockInput: PluginInput = {
    client: {} as any,
    project: {} as any,
    worktree: "/tmp",
    directory: "/tmp",
    experimental_workspace: { register: () => {} },
    get serverUrl() { return new URL("http://localhost:4096") },
    $: {} as any,
  }

  it("uses the documented base URL", () => {
    expect(MISTRAL_BASE_URL).toBe("https://api.mistral.ai/v1")
  })

  it("offers manual API key only, no OAuth", async () => {
    const plugin = await MistralAuthPlugin(mockInput)
    const methods = plugin.auth!.methods
    expect(methods).toHaveLength(1)
    expect(methods[0].type).toBe("api")
  })

  it("discloses Free-mode limits and billing with the key URL", async () => {
    const plugin = await MistralAuthPlugin(mockInput)
    const method = plugin.auth!.methods[0]
    if (method.type !== "api") throw new Error("expected api method")
    expect(method.prompts).toHaveLength(1)
    const prompt = method.prompts![0]
    if (prompt.type !== "select") throw new Error("expected select prompt")
    expect(prompt.key).toBe("acknowledge")
    expect(prompt.message).toContain("https://console.mistral.ai")
    expect(prompt.message).toContain("rate-limited")
    expect(prompt.message).toContain("payment method")
    expect(prompt.options.map((o) => o.value)).toEqual(["continue", "cancel"])
  })

  it("registers no provider models hook (models.dev live list applies)", async () => {
    const plugin = await MistralAuthPlugin(mockInput)
    expect(plugin.provider).toBeUndefined()
  })
})
