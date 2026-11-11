import { describe, expect, test } from "bun:test"
import { repeatedFailure, selectRescue, worthPlanning } from "../../src/session/coordination"
import type { Provider } from "../../src/provider/provider"
import type { SessionV1 } from "@opencode-ai/core/v1/session"

const bash = (output: string, status: "completed" | "error" = "completed") => ({
  info: { role: "assistant", time: { created: 1 } },
  parts: [{ type: "tool", tool: "bash", state: status === "completed" ? { status, output, input: {}, title: "", metadata: {}, time: { start: 1, end: 2 } } : { status, error: output, input: {}, time: { start: 1, end: 2 } } }],
}) as unknown as SessionV1.WithParts

const model = (providerID: string, id: string) =>
  ({ providerID, id, name: id, api: { id }, cost: { input: 0, output: 0 }, capabilities: { toolcall: true } }) as unknown as Provider.Model

describe("Teamwork planning", () => {
  test("plans real work, not questions or lookups", () => {
    expect(worthPlanning("Fix the failing tests in mathx.py")).toBe(true)
    expect(worthPlanning("Add a discount command to the CLI with tests")).toBe(true)
    expect(worthPlanning("Go to https://en.wikipedia.org/wiki/Olive_oil and tell me the article's first sentence.")).toBe(false)
    expect(worthPlanning("What does this project do?")).toBe(false)
    expect(worthPlanning("How do I run the tests?")).toBe(false)
  })
})

describe("Teamwork hand-off", () => {
  test("detects three identical failures, ignoring timings", () => {
    const failing = (time: string) => bash(`FAILED tests/test_x.py::test_a - AssertionError\n3 failed, 5 passed in ${time}`)
    expect(repeatedFailure([failing("0.43s"), failing("0.41s"), failing("0.52s")])).toContain("3 failed")
    expect(repeatedFailure([failing("0.43s"), failing("0.41s")])).toBeUndefined()
    expect(repeatedFailure([failing("0.4s"), bash("FAILED other\n1 failed in 0.1s"), failing("0.5s")])).toBeUndefined()
    expect(repeatedFailure([bash("8 passed in 0.1s"), bash("8 passed in 0.2s"), bash("8 passed in 0.3s")])).toBeUndefined()
  })

  test("hands off to the strongest other free model, preferring another provider", () => {
    const models = [model("groq", "openai/gpt-oss-120b"), model("groq", "openai/gpt-oss-20b"), model("openrouter", "nvidia/nemotron-3-ultra-550b-a55b:free"), model("mistral", "codestral-latest")]
    expect(String(selectRescue(models, models[0]!, new Set())?.id)).toBe("nvidia/nemotron-3-ultra-550b-a55b:free")
    expect(String(selectRescue(models, models[0]!, new Set(["openrouter/nvidia/nemotron-3-ultra-550b-a55b:free"]))?.id)).toBe("codestral-latest")
    expect(String(selectRescue([model("ollama", "qwen3:8b"), ...models], model("ollama", "llama3.2:1b"), new Set())?.id)).toBe("qwen3:8b")
  })
})
