import { describe, it, expect } from "bun:test"
import { staticModels } from "@/plugin/static-models"

describe("staticModels", () => {
  it("maps spec fields onto the Model record", async () => {
    const records = staticModels("nvidia", "https://integrate.api.nvidia.com/v1", [
      {
        id: "deepseek-ai/deepseek-v4-pro-0813",
        name: "DeepSeek V4 Pro 0813",
        family: "deepseek-thinking",
        context: 1000000,
        output: 384000,
        toolcall: true,
        reasoning: true,
      },
    ])
    const record = records["deepseek-ai/deepseek-v4-pro-0813"]
    expect(record.id).toBe("deepseek-ai/deepseek-v4-pro-0813")
    expect(record.providerID).toBe("nvidia")
    expect(record.limit).toEqual({ context: 1000000, output: 384000 })
    expect(record.api).toMatchObject({
      id: "deepseek-ai/deepseek-v4-pro-0813",
      url: "https://integrate.api.nvidia.com/v1",
      npm: "@ai-sdk/openai-compatible",
    })
    expect(record.capabilities.toolcall).toBe(true)
    expect(record.capabilities.reasoning).toBe(true)
  })

  it("bakes in the FREE-ONLY discipline (zero cost, active status)", async () => {
    const records = staticModels("nvidia", "https://integrate.api.nvidia.com/v1", [
      { id: "m", name: "M", family: "f", context: 1, output: 1 },
    ])
    expect(records["m"].cost).toMatchObject({ input: 0, output: 0 })
    expect(records["m"].status).toBe("active")
  })

  it("defaults to text-only conservative capabilities unless declared", async () => {
    const records = staticModels("nvidia", "https://integrate.api.nvidia.com/v1", [
      {
        id: "m",
        name: "M",
        family: "f",
        context: 1,
        output: 1,
        attachment: true,
        mediaInput: { image: true, video: true },
      },
    ])
    const caps = records["m"].capabilities
    expect(caps.attachment).toBe(true)
    expect(caps.input).toMatchObject({ text: true, image: true, video: true, audio: false })
    expect(caps.output).toMatchObject({ text: true, image: false })
  })
})
