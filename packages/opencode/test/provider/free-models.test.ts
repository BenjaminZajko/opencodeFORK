import { expect, test } from "bun:test"
import { Effect } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { freeModel } from "@opencode-ai/core/olivecode/models"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Provider } from "../../src/provider/provider"
import { testEffect } from "../lib/effect"

test("unknown prices, paid aliases, trial-only providers and Ollama cloud models are rejected", () => {
  expect(freeModel("openrouter", "example:free")).toBe(false)
  expect(freeModel("openrouter", "example:free", { cost: { input: 0, output: 1 } })).toBe(false)
  expect(freeModel("openrouter", "example:free", { api: { id: "paid-model" }, cost: { input: 0, output: 0 } })).toBe(false)
  expect(freeModel("openrouter", "example:free", { cost: { input: 0, output: 0 } })).toBe(true)
  expect(freeModel("nvidia", "moonshotai/kimi-k2.6", { cost: { input: 0, output: 0 } })).toBe(false)
  expect(freeModel("opencode", "big-pickle", { cost: { input: 0, output: 0 } })).toBe(false)
  expect(freeModel("ollama", "qwen3:8b")).toBe(true)
  expect(freeModel("ollama", "gpt-oss:120b-cloud")).toBe(false)
  expect(freeModel("groq", "openai/gpt-oss-120b")).toBe(true)
  expect(freeModel("groq", "future-unknown-model")).toBe(false)
})

const it = testEffect(LayerNode.compile(Provider.node))
it.instance("paid config and small-model overrides cannot bypass the free catalog", () => Effect.gen(function* () {
  const provider = yield* Provider.Service
  const all = yield* provider.list()
  expect(Object.keys(all)).toEqual(["groq"])
  expect(Object.keys(all[ProviderV2.ID.make("groq")].models)).toContain("openai/gpt-oss-120b")
  const selected = yield* provider.defaultModel()
  expect(selected.providerID).toBe(ProviderV2.ID.make("groq"))
  expect(freeModel(selected.providerID, selected.modelID)).toBe(true)
  expect(yield* provider.getSmallModel(ProviderV2.ID.make("groq"))).toBeUndefined()
  const denied = yield* provider.getModel(ProviderV2.ID.openai, ModelV2.ID.make("gpt-5")).pipe(Effect.exit)
  expect(denied._tag).toBe("Failure")
}), { config: {
  model: "opencode/big-pickle",
  small_model: "openai/gpt-5",
  provider: {
    groq: { options: { apiKey: "local-test-key" } },
    openai: { options: { apiKey: "local-test-key" } },
    opencode: { options: { apiKey: "local-test-key" } },
  },
} })
