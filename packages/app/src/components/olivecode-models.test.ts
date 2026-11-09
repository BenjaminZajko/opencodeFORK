import { describe, expect, test } from "bun:test"
import { localModelConfig, localModelName } from "./olivecode-models"

describe("local model boundary", () => {
  test("accepts Ollama and Hugging Face GGUF identifiers", () => {
    for (const value of ["qwen3:8b", "hf.co/author/repository:Q4_K_M", "my-model:latest"]) {
      expect(localModelName(value)).toBe(true)
    }
  })
  test("rejects cloud aliases, shell syntax and CLI flags", () => {
    for (const value of ["", "--help", "gemma4:31b-cloud", "model:cloud", "model;whoami", "$(id)", "a b", "a\nb"]) {
      expect(localModelName(value)).toBe(false)
    }
  })
  test("preserves inspected limits and capabilities without enabling other disabled providers", () => {
    const config = localModelConfig(
      { id: "mine", baseURL: "http://127.0.0.1:11434/v1", context: 4096, tools: true, vision: false, reasoning: true },
      ["ollama", "other"],
    )
    expect(config.disabled_providers).toEqual(["other"])
    expect(config.provider.ollama.models.mine.limit).toEqual({ context: 4096, output: 1024 })
    expect(config.provider.ollama.models.mine.modalities.input).toEqual(["text"])
    expect(config.provider.ollama.models.mine.tool_call).toBe(true)
    expect(config.model).toBe("ollama/mine")
  })
})
