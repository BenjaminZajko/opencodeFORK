import { describe, expect, test } from "bun:test"
import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { CEREBRAS_BASE_URL, CerebrasAuthPlugin, CerebrasPlugin } from "../../src/plugin/cerebras"

type ChatParams = NonNullable<Hooks["chat.params"]>

function input(npm: string) {
  return {
    model: { api: { npm } },
  } as Parameters<ChatParams>[0]
}

function output(options: Record<string, unknown>) {
  return {
    maxOutputTokens: 32_000,
    options,
  } as Parameters<ChatParams>[1]
}

describe("CerebrasPlugin", () => {
  test("omits the generic output cap when max_completion_tokens is configured", async () => {
    const hook = (await CerebrasPlugin({} as PluginInput))["chat.params"]!
    const params = output({ max_completion_tokens: 64 })

    await hook(input("@ai-sdk/cerebras"), params)

    expect(params.maxOutputTokens).toBeUndefined()
  })

  test("preserves the generic output cap without max_completion_tokens", async () => {
    const hook = (await CerebrasPlugin({} as PluginInput))["chat.params"]!
    const params = output({})

    await hook(input("@ai-sdk/cerebras"), params)

    expect(params.maxOutputTokens).toBe(32_000)
  })

  test("does not change other providers", async () => {
    const hook = (await CerebrasPlugin({} as PluginInput))["chat.params"]!
    const params = output({ max_completion_tokens: 64 })

    await hook(input("@ai-sdk/openai"), params)

    expect(params.maxOutputTokens).toBe(32_000)
  })
})

describe("CerebrasAuthPlugin", () => {
  const mockInput: PluginInput = {
    client: {} as any,
    project: {} as any,
    worktree: "/tmp",
    directory: "/tmp",
    experimental_workspace: { register: () => {} },
    get serverUrl() {
      return new URL("http://localhost:4096")
    },
    $: {} as any,
  }

  test("uses the documented base URL", () => {
    expect(CEREBRAS_BASE_URL).toBe("https://api.cerebras.ai/v1")
  })

  test("offers manual API key only, no OAuth", async () => {
    const plugin = await CerebrasAuthPlugin(mockInput)
    const methods = plugin.auth!.methods
    expect(methods).toHaveLength(1)
    expect(methods[0].type).toBe("api")
  })

  test("discloses payment gating and trial bounds with the key URL", async () => {
    const plugin = await CerebrasAuthPlugin(mockInput)
    const method = plugin.auth!.methods[0]
    if (method.type !== "api") throw new Error("expected api method")
    expect(method.prompts).toHaveLength(1)
    const prompt = method.prompts![0]
    if (prompt.type !== "select") throw new Error("expected select prompt")
    expect(prompt.key).toBe("acknowledge")
    expect(prompt.message).toContain("https://cloud.cerebras.ai")
    expect(prompt.message).toContain("verified payment method")
    expect(prompt.options.map((o) => o.value)).toEqual(["continue", "cancel"])
  })
})
