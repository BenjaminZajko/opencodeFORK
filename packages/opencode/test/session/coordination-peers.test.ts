import { describe, expect, test } from "bun:test"
import { selectPeers } from "../../src/session/coordination"
import type { Provider } from "../../src/provider/provider"

const model = (providerID: string, id: string, cost = 0) =>
  ({ providerID, id, api: { id }, cost: { input: cost, output: cost } }) as unknown as Provider.Model

const all = [
  model("openrouter", "nvidia/nemotron-3-ultra-550b-a55b:free"),
  model("openrouter", "cohere/north-mini-code:free"),
  model("groq", "openai/gpt-oss-120b"),
  model("groq", "openai/gpt-oss-20b"),
  model("mistral", "codestral-latest"),
  model("mistral", "mistral-small-latest"),
]
const names = (peers: Provider.Model[]) => peers.map((peer) => `${peer.providerID}/${peer.id}`)

describe("Assist helper selection", () => {
  test("keeps OpenRouter's daily and Mistral's per-minute quotas for the lead model", () => {
    expect(names(selectPeers(all, all[4]!, new Set()))).toEqual(["groq/openai/gpt-oss-120b", "groq/openai/gpt-oss-20b"])
    expect(names(selectPeers(all, all[0]!, new Set()))).toEqual(["groq/openai/gpt-oss-120b", "groq/openai/gpt-oss-20b"])
  })

  test("uses OpenRouter helpers only when nothing else is available", () => {
    const cooling = new Set(["groq/openai/gpt-oss-120b", "groq/openai/gpt-oss-20b", "mistral/mistral-small-latest"])
    expect(names(selectPeers(all, all[4]!, cooling))).toEqual(["openrouter/nvidia/nemotron-3-ultra-550b-a55b:free", "openrouter/cohere/north-mini-code:free"])
  })
})
