import { describe, it, expect } from "bun:test"
import { CATALOG, fallbacksFor, isRateLimited, rank, rankedDefault, type Entry } from "@/provider/fallback"

function make(id: string, providers: string[], extra?: Partial<Entry>): Entry {
  return {
    id,
    codingScore: 8.0,
    agenticScore: 7.0,
    contextWindow: 32768,
    tier: "strong",
    providers,
    concrete: Object.fromEntries(providers.map((p) => [p, `${p}/${id}`])),
    ...extra,
  }
}

describe("ProviderFallback catalog", () => {
  it("ports OliveCode scores and tiers verbatim", () => {
    const byId = Object.fromEntries(CATALOG.map((e) => [e.id, e]))
    // Free-only catalog: paid/unserved OliveCode entries were removed,
    // and ModelScope was evaluated and rejected (mandatory payment
    // card on account creation). qwen3-coder tracks the genuinely free
    // cohere/north-mini-code:free with carried-over scores; gpt-oss-120b
    // tracks Groq's $0-by-tier Free plan the same way, as does codestral
    // for Mistral Free mode (re-benchmark pending for all carried-over
    // scores). kimi-k2.6 tracks NVIDIA NIM's $0-by-tier trial: it is live-served,
    // snapshot-present (flagged deprecated, hence the static-hook status
    // override), and snapshot-$0; deepseek-v4-pro-0813 is the stronger
    // coder, absent from the snapshot, resolving via the same static hook
    // with upstream-pinned limits.
    expect(Object.keys(byId)).toEqual(["qwen3-coder", "gpt-oss-120b", "codestral", "kimi-k2.6", "deepseek-v4-pro"])
    expect(byId["deepseek-v4-pro"]).toMatchObject({
      codingScore: 9.5,
      agenticScore: 9.3,
      contextWindow: 1000000,
      tier: "strong",
    })
    expect(byId["deepseek-v4-pro"].providers).toEqual(["nvidia"])
    expect(byId["kimi-k2.6"]).toMatchObject({
      codingScore: 9.4,
      agenticScore: 9.0,
      contextWindow: 262144,
      tier: "strong",
    })
    expect(byId["kimi-k2.6"].providers).toEqual(["nvidia"])
    expect(byId["qwen3-coder"]).toMatchObject({
      codingScore: 9.4,
      agenticScore: 9.0,
      contextWindow: 256000,
      tier: "strong",
    })
    expect(byId["qwen3-coder"].providers).toEqual(["openrouter"])
    expect(byId["gpt-oss-120b"]).toMatchObject({
      codingScore: 9.4,
      agenticScore: 9.0,
      contextWindow: 131072,
      tier: "strong",
    })
    expect(byId["gpt-oss-120b"].providers).toEqual(["groq"])
    expect(byId["codestral"]).toMatchObject({
      codingScore: 9.4,
      agenticScore: 9.0,
      contextWindow: 131072,
      tier: "strong",
    })
    expect(byId["codestral"].providers).toEqual(["mistral"])
  })

  it("ranks by coding, then agentic, then context", () => {
    expect(rank(CATALOG).map((e) => e.id)).toEqual([
      "deepseek-v4-pro",
      "kimi-k2.6",
      "qwen3-coder",
      "gpt-oss-120b",
      "codestral",
    ])
  })
})

describe("fallbacksFor", () => {
  it("tries the same logical model on another provider before downgrading", () => {
    const targets = fallbacksFor("openrouter", "openrouter/glm", new Set(), [
      make("glm", ["openrouter", "siliconflow"], { codingScore: 8.0 }),
      make("other", ["openrouter"], { codingScore: 7.0 }),
    ])
    expect(targets[0]).toEqual({ providerID: "siliconflow", modelID: "siliconflow/glm" })
    expect(targets.map((t) => t.modelID)).toContain("openrouter/other")
  })

  it("downgrades only after every provider for the model is tried", () => {
    const tried = new Set(["openrouter/openrouter/glm", "siliconflow/siliconflow/glm"])
    const targets = fallbacksFor("openrouter", "openrouter/glm", tried, [
      make("glm", ["openrouter", "siliconflow"], { codingScore: 8.0 }),
      make("other", ["openrouter"], { codingScore: 7.0 }),
    ])
    expect(targets).toEqual([{ providerID: "openrouter", modelID: "openrouter/other" }])
  })

  it("returns [] for a model with no catalog entry", () => {
    expect(fallbacksFor("openai", "gpt-5", new Set())).toEqual([])
  })

  it("returns [] when every candidate is exhausted", () => {
    const entries = [make("m1", ["openrouter"])]
    expect(fallbacksFor("openrouter", "openrouter/m1", new Set(["openrouter/openrouter/m1"]), entries)).toEqual(
      [],
    )
  })

  it("prefers the requested tier before falling back across tiers", () => {
    const targets = fallbacksFor("openrouter", "openrouter/fast-m", new Set(), [
      make("fast-m", ["openrouter"], { codingScore: 7.0, tier: "fast" }),
      make("strong-m", ["siliconflow"], { codingScore: 9.0, tier: "strong" }),
    ], "fast")
    expect(targets[0]).toEqual({ providerID: "siliconflow", modelID: "siliconflow/strong-m" })
  })
})

describe("rankedDefault", () => {
  it("returns undefined with no providers connected", () => {
    expect(rankedDefault(new Set())).toBeUndefined()
  })

  it("openrouter-only users start on the free qwen3-coder", () => {
    expect(rankedDefault(new Set(["openrouter"]))).toEqual({
      providerID: "openrouter",
      modelID: "cohere/north-mini-code:free",
    })
  })

  it("returns undefined when no catalog entry serves a connected provider", () => {
    expect(rankedDefault(new Set(["siliconflow"]))).toBeUndefined()
  })

  it("groq-only users start on the free gpt-oss-120b", () => {
    expect(rankedDefault(new Set(["groq"]))).toEqual({
      providerID: "groq",
      modelID: "openai/gpt-oss-120b",
    })
  })

  it("mistral-only users start on the free codestral", () => {
    expect(rankedDefault(new Set(["mistral"]))).toEqual({
      providerID: "mistral",
      modelID: "codestral-latest",
    })
  })

  it("nvidia-only users start on the top-ranked free entry", () => {
    expect(rankedDefault(new Set(["nvidia"]))).toEqual({
      providerID: "nvidia",
      modelID: "deepseek-ai/deepseek-v4-pro-0813",
    })
  })

  it("falls back across tiers when the preferred tier has no entry", () => {
    expect(rankedDefault(new Set(["openrouter"]), CATALOG, "fast")).toEqual({
      providerID: "openrouter",
      modelID: "cohere/north-mini-code:free",
    })
  })
})

describe("isRateLimited", () => {
  it("matches 429 status codes", () => {
    expect(isRateLimited({ data: { statusCode: 429 } })).toBe(true)
    expect(isRateLimited({ data: { statusCode: 500 } })).toBe(false)
  })

  it("matches rate-limit messages and bodies", () => {
    expect(isRateLimited({ data: { message: "Too Many Requests" } })).toBe(true)
    expect(isRateLimited({ data: { responseBody: "rate_limit_exceeded" } })).toBe(true)
    expect(isRateLimited({ data: { message: "no_kv_space" } })).toBe(false)
    expect(isRateLimited({})).toBe(false)
  })
})

describe("concrete ids against models-api.json", () => {
  it("every listed-provider concrete id exists verbatim in the fixture", async () => {
    const fixture = await Bun.file(new URL("../tool/fixtures/models-api.json", import.meta.url)).json()
    for (const entry of CATALOG) {
      for (const providerID of entry.providers) {
        // nvidia concretes resolve via the NvidiaAuthPlugin static hook,
        // not the snapshot (deepseek-v4-pro-0813 is absent there) — covered
        // by the live-fixture guard and the static-hook test instead.
        if (providerID === "nvidia") continue
        const modelID = entry.concrete[providerID]
        expect(modelID).toBeDefined()
        const models = fixture[providerID]?.models ?? {}
        expect(Object.hasOwn(models, modelID)).toBe(true)
      }
    }
  })

  it("every openrouter concrete id is genuinely free (cost 0/0)", async () => {
    const fixture = await Bun.file(new URL("../tool/fixtures/models-api.json", import.meta.url)).json()
    const models = fixture["openrouter"]?.models ?? {}
    for (const entry of CATALOG) {
      const modelID = entry.concrete["openrouter"]
      if (!modelID) continue
      const cost = models[modelID]?.cost ?? {}
      expect({ modelID, cost }).toMatchObject({ modelID, cost: { input: 0, output: 0 } })
    }
  })

  it("every groq concrete id is in the live-cached served list", async () => {
    const served = await Bun.file(new URL("../tool/fixtures/groq-models.json", import.meta.url)).json()
    const servedIDs = new Set((served.models as { id: string }[]).map((m) => m.id))
    for (const entry of CATALOG) {
      const modelID = entry.concrete["groq"]
      if (!modelID) continue
      expect(servedIDs.has(modelID)).toBe(true)
    }
  })

  it("every mistral concrete id is in the live-cached served list", async () => {
    const served = await Bun.file(new URL("../tool/fixtures/mistral-models.json", import.meta.url)).json()
    const servedIDs = new Set((served.models as { id: string }[]).map((m) => m.id))
    for (const entry of CATALOG) {
      const modelID = entry.concrete["mistral"]
      if (!modelID) continue
      expect(servedIDs.has(modelID)).toBe(true)
    }
  })

  it("every nvidia concrete id is in the live-cached served list", async () => {
    const served = await Bun.file(new URL("../tool/fixtures/nvidia-nim-models.json", import.meta.url)).json()
    const servedIDs = new Set((served.models as { id: string }[]).map((m) => m.id))
    for (const entry of CATALOG) {
      const modelID = entry.concrete["nvidia"]
      if (!modelID) continue
      expect(servedIDs.has(modelID)).toBe(true)
    }
  })
})
