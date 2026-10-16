import { describe, expect, test } from "bun:test"
import { cloudModelEntries } from "../../src/component/dialog-cloud"

function provider(
  id: string,
  name: string,
  models: Record<
    string,
    { name?: string; status?: string; cost?: { input?: number; output?: number }; release_date?: string; capabilities?: { input?: { image?: boolean } } }
  >,
) {
  return { id, name, models }
}

describe("cloudModelEntries", () => {
  test("labels image-capable free models without admitting paid image models", () => {
    const entries = cloudModelEntries([provider("openrouter", "OpenRouter", {
      "vision:free": { cost: { input: 0, output: 0 }, capabilities: { input: { image: true } } },
      "text:free": { cost: { input: 0, output: 0 }, capabilities: { input: { image: false } } },
      "paid-vision": { cost: { input: 1, output: 1 }, capabilities: { input: { image: true } } },
    })], ["openrouter"])
    expect(entries.find((entry) => entry.modelID === "vision:free")?.footer).toBe("Free · Images")
    expect(entries.find((entry) => entry.modelID === "text:free")?.footer).toBe("Free")
    expect(entries.find((entry) => entry.modelID === "paid-vision")).toBeUndefined()
  })
  test("only explicitly zero input and output prices earn a Free label, including OpenRouter", () => {
    const entries = cloudModelEntries(
      [
        provider("openrouter", "OpenRouter", {
          "model:free": { cost: { input: 0, output: 0 } },
          outputCharged: { cost: { input: 0, output: 1 } },
          unknown: {},
        }),
      ],
      ["openrouter"],
    )
    expect(entries.find((entry) => entry.modelID === "model:free")?.footer).toBe("Free")
    expect(entries.find((entry) => entry.modelID === "outputCharged")).toBeUndefined()
    expect(entries.find((entry) => entry.modelID === "unknown")).toBeUndefined()
  })
  test("lists connected providers only, skipping ollama and disconnected entries", () => {
    const entries = cloudModelEntries(
      [
        provider("openrouter", "OpenRouter", {
          "cohere/north-mini-code:free": { cost: { input: 0, output: 0 }, release_date: "2026-01-01" },
        }),
        provider("ollama", "Ollama", { "qwen3:8b": { release_date: "2026-01-01" } }),
        provider("groq", "Groq", { "openai/gpt-oss-120b": { release_date: "2026-01-01" } }),
      ],
      ["openrouter", "ollama"],
    )

    expect(entries.map((entry) => `${entry.providerID}/${entry.modelID}`)).toEqual([
      "openrouter/cohere/north-mini-code:free",
    ])
  })

  test("excludes deprecated models and the featured top pick", () => {
    const entries = cloudModelEntries(
      [
        provider("groq", "Groq", {
          "openai/gpt-oss-120b": { release_date: "2026-02-01" },
          "old-model": { status: "deprecated", release_date: "2024-01-01" },
        }),
      ],
      ["groq"],
      { providerID: "groq", modelID: "openai/gpt-oss-120b" },
    )

    expect(entries).toEqual([])
  })

  test("excludes all upstream paid and promotional models", () => {
    const entries = cloudModelEntries(
      [
        provider("opencode", "opencode", {
          "paid-model": { release_date: "2026-03-01", cost: { input: 1 } },
          "free-model": { release_date: "2025-01-01", cost: { input: 0, output: 0 } },
          "x-nano": { release_date: "2026-04-01", cost: { input: 0, output: 0 } },
        }),
      ],
      ["opencode"],
    )

    expect(entries).toEqual([])
  })
})
