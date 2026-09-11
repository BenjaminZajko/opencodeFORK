import { describe, it, expect } from "bun:test"
import {
  BYTES_PER_PARAM,
  CLOUD_MODELS,
  DEFAULT_QUANT,
  LOCAL_MODELS,
  catalogFind,
  catalogFromJson,
  catalogToJson,
  createCatalog,
  effectiveMemoryGb,
  entryFromJson,
  entryToJson,
  estimatedRamGb,
  localSortedByCoding,
  recommend,
  viable,
  type ModelCatalog,
  type ModelEntry,
} from "../../src/onboarding/reasoning"
import {
  appleSilicon,
  cpuOnly,
  localEntry,
  macStudio,
  nvidiaBox,
  tinyCatalog,
  unknownHost,
} from "./helpers"

// Port of OliveCode tests/test_reasoning.py + tests/test_model_catalog.py.
// Python mocks reasoning.llm for 3 narration tests; the TS port is
// deterministic (no llm module), so those map to determinism/purity
// assertions instead — noted per test.

function recommendTiny(profile: Parameters<typeof recommend>[0]) {
  return recommend(profile, tinyCatalog())
}

describe("effective memory", () => {
  it("subtracts small headroom on apple silicon", () => {
    expect(effectiveMemoryGb(appleSilicon(24))).toBeCloseTo(20.0)
  })

  it("adds vram plus ram offload slice on nvidia", () => {
    expect(effectiveMemoryGb(nvidiaBox(12.0, 32.0))).toBeCloseTo(30.8)
  })

  it("subtracts os headroom on cpu-only", () => {
    expect(effectiveMemoryGb(cpuOnly(16.0))).toBeCloseTo(13.0)
  })

  it("keeps minimum headroom on tiny boxes", () => {
    expect(effectiveMemoryGb(cpuOnly(4.0))).toBeCloseTo(2.0)
  })

  it("signals no information for unknown hosts", () => {
    expect(effectiveMemoryGb(unknownHost())).toBe(-1.0)
  })
})

describe("viability", () => {
  it("rejects too-big models", () => {
    expect(viable(appleSilicon(8), localEntry("x", 1.0, 42.0), 6.0)).toBe(false)
  })

  it("allows squeezed models", () => {
    expect(viable(appleSilicon(24), localEntry("q", 1.0, 18.0), 20.0)).toBe(true)
  })

  it("gates server class on 150gb pools", () => {
    const m = { ...localEntry("srv", 1.0, 290.0), serverClass: true }
    expect(viable(macStudio(64), m, 60.0)).toBe(false)
    expect(viable(macStudio(256), m, 252.0)).toBe(true)
  })

  it("applies the server gate before fit classification", () => {
    const m = { ...localEntry("srv", 1.0, 290.0), serverClass: true }
    expect(viable(macStudio(256), m, 252.0)).toBe(true)
  })

  it("trusts only tiny models on unknown hosts", () => {
    expect(viable(unknownHost(), localEntry("t", 1.0, 1.2), -1)).toBe(true)
    expect(viable(unknownHost(), localEntry("t", 1.0, 5.0), -1)).toBe(false)
  })
})

describe("recommendation matrix", () => {
  it("picks the comfortable quality model on a mid mac", () => {
    const r = recommendTiny(appleSilicon(24))
    expect(r.primaryLocal?.model.id).toBe("mid:14b")
    expect(r.primaryLocal?.fit).toBe("comfortable")
  })

  it("prefers comfortable over tight flagship on a big mac", () => {
    const r = recommendTiny(appleSilicon(64))
    expect(r.primaryLocal?.model.id).toBe("mid:14b")
    expect(r.alternates.map((a) => a.model.id)).toContain("big:70b")
  })

  it("gives small-ram machines small models", () => {
    const r = recommendTiny(cpuOnly(8))
    expect(r.primaryLocal?.model.id).toBe("tiny:1b")
    expect(r.primaryLocal?.fit).toBe("comfortable")
    const alt = r.alternates.find((a) => a.model.id === "small:7b")!
    expect(alt.fit).toBe("squeezed")
  })

  it("picks mid on an nvidia box", () => {
    const r = recommendTiny(nvidiaBox())
    expect(r.primaryLocal?.model.id).toBe("mid:14b")
  })

  it("keeps server class off consumer machines", () => {
    for (const prof of [appleSilicon(24), appleSilicon(64), nvidiaBox(), cpuOnly(32)]) {
      const r = recommendTiny(prof)
      expect(r.primaryLocal?.model.id).not.toBe("server:480b")
      expect(r.alternates.map((a) => a.model.id)).not.toContain("server:480b")
    }
  })

  it("offers server class on huge unified memory", () => {
    const r = recommendTiny(macStudio(256))
    const ids = new Set([r.primaryLocal?.model.id, ...r.alternates.map((a) => a.model.id)])
    expect(ids.has("server:480b")).toBe(true)
  })

  it("picks free cloud when free exists", () => {
    const r = recommendTiny(nvidiaBox())
    expect(r.primaryCloud).toBeDefined()
    expect(r.primaryCloud?.model.freeTier).toBe(true)
    expect(r.alternates.map((a) => a.model.id)).not.toContain(r.primaryCloud?.model.id)
  })

  it("picks paid with warning when only paid exists", () => {
    const paidOnly: ModelCatalog = {
      local: tinyCatalog().local,
      cloud: [
        {
          id: "paid-x",
          family: "claude",
          kind: "cloud",
          contextWindow: 200000,
          codingScore: 9.0,
          agenticScore: 9.0,
          speedScore: 9.0,
          freeTier: false,
        },
      ],
    }
    const r = recommend(nvidiaBox(), paidOnly)
    expect(r.primaryCloud?.model.id).toBe("paid-x")
    expect(r.primaryCloud?.reasons.some((x) => x.includes("Not on a free tier"))).toBe(true)
  })

  it("falls back to smallest when nothing viable on unknown host", () => {
    const bigOnly: ModelCatalog = {
      local: [localEntry("large-a", 1.0, 20.0), localEntry("large-b", 1.0, 42.0)],
      cloud: tinyCatalog().cloud,
    }
    const r = recommend(unknownHost(), bigOnly)
    expect(r.primaryLocal).toBeDefined()
    expect(r.primaryLocal?.fit).toBe("fallback")
    expect(r.primaryLocal?.model.id).toBe("large-a")
  })

  it("picks a run-anywhere model for unknown hosts", () => {
    const r = recommendTiny(unknownHost())
    expect(r.primaryLocal?.model.id).toBe("tiny:1b")
    expect(r.primaryLocal?.fit).toBe("unknown")
  })

  it("admits empty local catalogs without crashing", () => {
    const empty: ModelCatalog = { local: [], cloud: tinyCatalog().cloud }
    const r = recommend(nvidiaBox(), empty)
    expect(r.primaryLocal).toBeUndefined()
    expect(r.primaryCloud).toBeDefined()
  })

  it("never duplicates primaries in alternates", () => {
    const r = recommendTiny(appleSilicon(32))
    const altIds = r.alternates.map((a) => a.model.id)
    expect(new Set(altIds).size).toBe(altIds.length)
    if (r.primaryLocal) expect(altIds).not.toContain(r.primaryLocal.model.id)
    if (r.primaryCloud) expect(altIds).not.toContain(r.primaryCloud?.model.id)
  })

  it("sorts alternates by score descending", () => {
    const r = recommendTiny(appleSilicon(48))
    const scores = r.alternates.map((a) => a.score)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
  })

  it("gives every ranked entry reasons, fit, and nonneg score", () => {
    const r = recommendTiny(nvidiaBox(24.0, 64.0))
    const entries = [r.primaryLocal, r.primaryCloud, ...r.alternates].filter((e) => e !== undefined)
    for (const entry of entries) {
      expect(entry.reasons).toBeInstanceOf(Array)
      expect(entry.fit).toBeTruthy()
      expect(entry.score).toBeGreaterThanOrEqual(0.0)
    }
  })

  it("is deterministic", () => {
    const a = recommendTiny(appleSilicon(24))
    const b = recommendTiny(appleSilicon(24))
    expect(a.explanation).toBe(b.explanation)
    expect(a.alternates.map((x) => x.model.id)).toEqual(b.alternates.map((x) => x.model.id))
  })
})

describe("cloud-first tiebreak", () => {
  it("leads with cloud when local fit is not comfortable", () => {
    // unknown host: tiny:1b is viable with fit "unknown", so cloud leads.
    const r = recommendTiny(unknownHost())
    expect(r.primary).toBe("cloud")
  })

  it("leads with local on a strictly-winning comfortable fit", () => {
    // apple_silicon(24): mid:14b comfortable outscores the cloud pick.
    const r = recommendTiny(appleSilicon(24))
    expect(r.primary).toBe("local")
  })

  it("leads with local when no cloud exists", () => {
    const r = recommend(nvidiaBox(), { local: tinyCatalog().local, cloud: [] })
    expect(r.primary).toBe("local")
    expect(r.primaryCloud).toBeUndefined()
  })
})

describe("apple silicon narrative", () => {
  it("mentions gpu, never cpu-only", () => {
    const cat = tinyCatalog()
    for (const m of cat.local) m.needsDedicatedGpu = "sometimes"
    const r = recommend(appleSilicon(24), cat)
    const joined = r.primaryLocal!.reasons.join(" ").toLowerCase()
    expect(joined).not.toContain("no dedicated gpu detected")
    expect(joined).toContain("apple silicon gpu")
  })

  it("makes no cpu claim for gpu-indifferent mac models", () => {
    const r = recommendTiny(appleSilicon(24))
    const joined = r.primaryLocal!.reasons.join(" ").toLowerCase()
    expect(joined).not.toContain("cpu")
  })

  it("warns about offload on oversized discrete-gpu picks", () => {
    const m = localEntry("huge:70b", 1.0, 42.0)
    const r = recommend(nvidiaBox(8.0, 64.0), { local: [m], cloud: [] })
    expect(r.primaryLocal?.fit).toBe("squeezed")
    expect(r.primaryLocal!.reasons.join(" ").toLowerCase()).toContain("offload")
  })
})

describe("explanations", () => {
  it("names the cloud provider correctly", () => {
    const cat = tinyCatalog()
    cat.cloud[0] = { ...cat.cloud[0], family: "gemini" }
    const r = recommend(appleSilicon(24), cat)
    expect(r.explanation).toContain("Google runs it")
    expect(r.explanation).not.toContain("Anthropic runs it")
  })

  it("is nonempty for all machine classes", () => {
    for (const prof of [appleSilicon(8), appleSilicon(64), nvidiaBox(), cpuOnly(8), unknownHost()]) {
      expect(recommendTiny(prof).explanation.trim()).toBeTruthy()
    }
  })

  it("is pure local text with no network surface", () => {
    // The Python original's LLM-narration tests (mocked api_key +
    // anthropic_completion) have no counterpart: the TS port is
    // deterministic by construction — recommend is synchronous and takes
    // no credentials. This pins that contract.
    const r = recommendTiny(appleSilicon(24))
    expect(r).not.toBeInstanceOf(Promise)
    expect(r.explanation.trim()).toBeTruthy()
  })
})

describe("baseline invariants", () => {
  it("keeps local ids unique", () => {
    const ids = LOCAL_MODELS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("keeps cloud ids unique", () => {
    const ids = CLOUD_MODELS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("keeps kinds consistent with their lists", () => {
    for (const m of LOCAL_MODELS) expect(m.kind).toBe("local")
    for (const m of CLOUD_MODELS) expect(m.kind).toBe("cloud")
  })

  it("keeps scores in range", () => {
    for (const m of [...LOCAL_MODELS, ...CLOUD_MODELS]) {
      for (const field of ["codingScore", "agenticScore", "speedScore"] as const) {
        expect(m[field] ?? 5).toBeGreaterThanOrEqual(0.0)
        expect(m[field] ?? 5).toBeLessThanOrEqual(10.0)
      }
    }
  })

  it("keeps context windows positive", () => {
    for (const m of [...LOCAL_MODELS, ...CLOUD_MODELS]) expect(m.contextWindow).toBeGreaterThan(0)
  })

  it("always ships a free cloud", () => {
    expect(CLOUD_MODELS.some((m) => m.freeTier)).toBe(true)
  })

  it("covers tiny to huge on the size ladder", () => {
    const needs = LOCAL_MODELS.map((m) => m.ramQ4Gb ?? 0.0).sort((a, b) => a - b)
    expect(needs[0]).toBeLessThanOrEqual(2.0)
    const biggest = LOCAL_MODELS.reduce((a, b) => ((b.ramQ4Gb ?? 0) > (a.ramQ4Gb ?? 0) ? b : a))
    expect(biggest.serverClass).toBe(true)
  })

  it("flags server-class entries", () => {
    for (const m of LOCAL_MODELS) {
      if ((m.ramQ4Gb ?? 0) > 150.0) expect(m.serverClass).toBe(true)
    }
  })
})

describe("estimated ram", () => {
  function entry(overrides: Partial<ModelEntry>): ModelEntry {
    return { id: "x", family: "f", kind: "local", paramsB: 7.0, contextWindow: 8192, ...overrides }
  }

  it("uses explicit ram at default quant", () => {
    expect(estimatedRamGb(entry({ ramQ4Gb: 5.0 }))).toBeCloseTo(5.0)
  })

  it("computes from params for other quants", () => {
    const m = entry({ ramQ4Gb: 5.0, defaultQuant: "Q8_0" })
    expect(estimatedRamGb(m)).toBeCloseTo(Math.round(((7.0 * BYTES_PER_PARAM["Q8_0"]) / 8.0) * 100) / 100)
  })

  it("sizes moe on total params, not active", () => {
    const m = entry({ paramsB: 30.0, activeParamsB: 3.0, ramQ4Gb: undefined })
    expect(estimatedRamGb(m)).toBeCloseTo(Math.round(((30.0 * BYTES_PER_PARAM[DEFAULT_QUANT]) / 8.0) * 100) / 100)
  })

  it("gives zero for unknown params", () => {
    expect(estimatedRamGb(entry({ kind: "cloud", paramsB: undefined, ramQ4Gb: undefined }))).toBe(0.0)
  })
})

describe("serialisation round trip", () => {
  it("preserves every field through json", () => {
    const m = LOCAL_MODELS[0]
    const clone = entryFromJson(entryToJson(m) as Record<string, unknown>)
    expect(entryToJson(clone)).toEqual(entryToJson(m))
  })

  it("round-trips the catalog", () => {
    const cat = createCatalog()
    const clone = catalogFromJson(catalogToJson(cat))
    expect(clone.local.map((m) => m.id)).toEqual(cat.local.map((m) => m.id))
    expect(clone.cloud.map((m) => m.id)).toEqual(cat.cloud.map((m) => m.id))
  })

  it("ignores unknown keys", () => {
    const d = { ...entryToJson(LOCAL_MODELS[0]), brand_new_future_field: 42 } as Record<string, unknown>
    const clone = entryFromJson(d)
    expect(clone.id).toBe(LOCAL_MODELS[0].id)
    expect("brand_new_future_field" in clone).toBe(false)
  })

  it("fills missing fields with defaults", () => {
    const clone = entryFromJson({ id: "some-cloud", family: "claude", kind: "cloud", contextWindow: 200000 })
    expect(clone.paramsB).toBeUndefined()
    expect(clone.freeTier).toBe(true)
    expect(clone.defaultQuant).toBe(DEFAULT_QUANT)
  })

  it("falls back on malformed sides", () => {
    const cat = catalogFromJson({ local: "not-a-list", cloud: [{ id: "c" }] })
    expect(cat.local.length).toBe(LOCAL_MODELS.length)
    expect(cat.cloud.map((m) => m.id)).toEqual(["c"])
  })

  it("survives a json string round trip", () => {
    // Stands in for the published-catalog.json load test: what matters is
    // JSON-compatibility of the schema, not OliveCode's file.
    const cat = createCatalog()
    const clone = catalogFromJson(JSON.parse(JSON.stringify(catalogToJson(cat))))
    expect(clone.local.length).toBeGreaterThan(0)
    expect(clone.cloud.length).toBeGreaterThan(0)
  })
})

describe("catalog access", () => {
  it("finds entries by id", () => {
    const cat = createCatalog()
    expect(catalogFind(cat, "qwen2.5-coder:7b")?.family).toBe("qwen2.5-coder")
    expect(catalogFind(cat, "nope")).toBeUndefined()
  })

  it("sorts locals by coding score", () => {
    const sorted = localSortedByCoding(createCatalog())
    expect(sorted[0].id).toBe("qwen3-coder:480b-a35b")
  })
})
