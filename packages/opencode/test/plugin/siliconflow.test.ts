import { describe, it, expect } from "bun:test"
import { SiliconFlowAuthPlugin, SILICONFLOW_BASE_URL } from "@/plugin/siliconflow"
import type { PluginInput } from "@opencode-ai/plugin"

describe("SiliconFlowAuthPlugin", () => {
  const mockInput: PluginInput = {
    client: {} as any,
    project: {} as any,
    worktree: "/tmp",
    directory: "/tmp",
    experimental_workspace: { register: () => {} },
    get serverUrl() { return new URL("http://localhost:4096") },
    $: {} as any,
  }

  it("uses the international base URL, not the .cn variant", () => {
    expect(SILICONFLOW_BASE_URL).toBe("https://api.siliconflow.com/v1")
  })

  it("offers manual API key only, no OAuth", async () => {
    const plugin = await SiliconFlowAuthPlugin(mockInput)
    const methods = plugin.auth!.methods
    expect(methods).toHaveLength(1)
    expect(methods[0].type).toBe("api")
  })

  it("discloses Chinese infrastructure routing via a select prompt", async () => {
    const plugin = await SiliconFlowAuthPlugin(mockInput)
    const method = plugin.auth!.methods[0]
    if (method.type !== "api") throw new Error("expected api method")
    expect(method.prompts).toHaveLength(1)
    const prompt = method.prompts![0]
    if (prompt.type !== "select") throw new Error("expected select prompt")
    expect(prompt.key).toBe("acknowledge")
    expect(prompt.message).toContain("China")
    expect(prompt.options.map((o) => o.value)).toEqual(["continue", "cancel"])
  })

  it("points at the token creation page in the pre-key prompt", async () => {
    const plugin = await SiliconFlowAuthPlugin(mockInput)
    const method = plugin.auth!.methods[0]
    if (method.type !== "api") throw new Error("expected api method")
    const prompt = method.prompts![method.prompts!.length - 1]
    if (prompt.type !== "select") throw new Error("expected select prompt")
    expect(prompt.message).toContain("https://cloud.siliconflow.com/account/ak")
  })

  it("registers no provider models hook (models.dev live list applies)", async () => {
    const plugin = await SiliconFlowAuthPlugin(mockInput)
    expect(plugin.provider).toBeUndefined()
  })
})
