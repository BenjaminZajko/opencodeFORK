import { describe, it, expect } from "bun:test"
import { NvidiaAuthPlugin, NVIDIA_BASE_URL } from "@/plugin/nvidia"
import type { PluginInput } from "@opencode-ai/plugin"

describe("NvidiaAuthPlugin", () => {
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

  it("uses the documented shared endpoint", () => {
    expect(NVIDIA_BASE_URL).toBe("https://integrate.api.nvidia.com/v1")
  })

  it("offers manual API key only, no OAuth", async () => {
    const plugin = await NvidiaAuthPlugin(mockInput)
    const methods = plugin.auth!.methods
    expect(methods).toHaveLength(1)
    expect(methods[0].type).toBe("api")
  })

  it("discloses phone verification and trial terms with the key URL", async () => {
    const plugin = await NvidiaAuthPlugin(mockInput)
    const method = plugin.auth!.methods[0]
    if (method.type !== "api") throw new Error("expected api method")
    expect(method.prompts).toHaveLength(1)
    const prompt = method.prompts![0]
    if (prompt.type !== "select") throw new Error("expected select prompt")
    expect(prompt.key).toBe("acknowledge")
    expect(prompt.message).toContain("https://build.nvidia.com/settings")
    expect(prompt.message).toContain("phone verification")
    expect(prompt.message).toContain("no credit card")
    expect(prompt.options.map((o) => o.value)).toEqual(["continue", "cancel"])
  })

  it("pins provider-level baseURL to the shared endpoint (dispatch prefers it over model api.url)", async () => {
    const plugin = await NvidiaAuthPlugin(mockInput)
    const options = await plugin.auth!.loader!(async () => ({ type: "api", key: "k" }) as any, {} as any)
    expect(options["baseURL"]).toBe("https://integrate.api.nvidia.com/v1")
  })

  it("serves the fallback catalog concretes via the static hook", async () => {
    const plugin = await NvidiaAuthPlugin(mockInput)
    if (!plugin.provider?.models) throw new Error("expected provider models hook")
    const models = await plugin.provider.models({} as any, {} as any)
    for (const id of ["moonshotai/kimi-k2.6"]) {
      expect(Object.hasOwn(models, id)).toBe(true)
      expect(models[id].status).toBe("active")
      expect(models[id].cost).toMatchObject({ input: 0, output: 0 })
    }
    expect(models["deepseek-ai/deepseek-v4-pro-0813"]).toBeUndefined()
    expect(models["moonshotai/kimi-k2.6"].limit).toEqual({ context: 262144, output: 262144 })
  })
})
