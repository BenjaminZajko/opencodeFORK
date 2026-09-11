import {
  bestDedicatedVramGb,
  isAppleSilicon,
  type HardwareProfile,
} from "./hardware"

// Hardware-aware model recommendation. Port of OliveCode
// advisor/reasoning.py (+ advisor/model_catalog.py data).
//
// Method: filter the catalog by viability on this machine's usable memory
// pool, score each viable model (fit + coding + agentic + speed + context,
// weights shifting with hardware abundance), pick the best local and the
// best free cloud model. Local logic is the source of truth; the
// explanation is deterministic templated text (the Python original's
// optional LLM narration has no counterpart here).
//
// Cloud-first tiebreak (OliveCode decision): the one-screen UI leads with
// cloud unless local scoring strictly wins on a comfortable fit.
// `primary` carries that decision; both primaries are always returned.

// RAM multipliers: raw parameter count -> rough quantized footprint in
// bytes-per-parameter. Q4_K_M is the usual pick for general use.
export const BYTES_PER_PARAM: Record<string, number> = {
  Q2_K: 2.6,
  Q3_K_M: 3.3,
  Q4_K_M: 4.4,
  Q5_K_M: 5.4,
  Q6_K: 6.4,
  Q8_0: 8.5,
  F16: 16.0,
}

export const DEFAULT_QUANT = "Q4_K_M"

// Overhead the OS + IDE + runtime itself need on top of model weights.
// Generous on purpose: a model that "fits" but swaps the moment the user
// opens a browser is not a real fit.
export const RAM_HEADROOM_GB: Record<string, number> = {
  apple_silicon: 4.0,
  linux: 3.0,
  windows: 4.0,
  unknown: 4.0,
}

export const VRAM_HEADROOM_GB = 1.5 // CUDA context + activations + runtime

export interface ModelEntry {
  id: string
  family: string
  kind: "local" | "cloud"
  paramsB?: number // undefined for closed models that don't disclose it
  contextWindow: number
  activeParamsB?: number // MoE: params active per token (sized on total)
  ramQ4Gb?: number // footprint at Q4_K_M
  minRamGb?: number
  needsDedicatedGpu?: "no" | "sometimes" | "yes"
  defaultQuant?: string
  codingScore?: number
  agenticScore?: number
  speedScore?: number
  bestFor?: string
  watchOut?: string
  serverClass?: boolean // multi-GPU / huge unified memory only
  flagship?: boolean
  license?: string
  freeTier?: boolean
  signupRequired?: boolean
  notes?: string
}

export function estimatedRamGb(model: ModelEntry): number {
  // MoE weights all load into memory even if only a fraction is active
  // per token: size on paramsB, not activeParamsB.
  if (model.ramQ4Gb !== undefined && (model.defaultQuant ?? DEFAULT_QUANT) === DEFAULT_QUANT) {
    return model.ramQ4Gb
  }
  if (model.paramsB === undefined) return 0.0
  const bpp = BYTES_PER_PARAM[model.defaultQuant ?? ""] ?? BYTES_PER_PARAM[DEFAULT_QUANT]
  return Math.round(((model.paramsB * bpp) / 8.0) * 100) / 100
}

export const LOCAL_MODELS: ModelEntry[] = [
  {
    id: "qwen2.5-coder:32b",
    family: "qwen2.5-coder",
    kind: "local",
    paramsB: 32.0,
    contextWindow: 32768,
    ramQ4Gb: 20.0,
    minRamGb: 24.0,
    needsDedicatedGpu: "yes",
    codingScore: 9.4,
    agenticScore: 8.8,
    speedScore: 4.0,
    bestFor: "Top-tier local coding; rivals GPT-4-class on many tasks.",
    watchOut: "Needs ~24GB RAM or a 24GB GPU. Not for old laptops.",
  },
  {
    id: "qwen2.5-coder:14b",
    family: "qwen2.5-coder",
    kind: "local",
    paramsB: 14.0,
    contextWindow: 32768,
    ramQ4Gb: 10.0,
    minRamGb: 12.0,
    needsDedicatedGpu: "sometimes",
    codingScore: 8.6,
    agenticScore: 8.2,
    speedScore: 6.0,
    bestFor: "Sweet spot for 16GB-RAM Apple Silicon and mid-range GPUs.",
    watchOut: "Slower than 7B on weak CPUs; ~10GB to download.",
  },
  {
    id: "qwen2.5-coder:7b",
    family: "qwen2.5-coder",
    kind: "local",
    paramsB: 7.0,
    contextWindow: 32768,
    ramQ4Gb: 5.0,
    minRamGb: 8.0,
    needsDedicatedGpu: "no",
    codingScore: 7.4,
    agenticScore: 7.2,
    speedScore: 8.0,
    bestFor: "Best general-purpose pick on a typical 16GB laptop.",
    watchOut: "Lower ceiling on hard architectural tasks vs 14B+.",
  },
  {
    id: "qwen2.5-coder:3b",
    family: "qwen2.5-coder",
    kind: "local",
    paramsB: 3.0,
    contextWindow: 32768,
    ramQ4Gb: 2.5,
    minRamGb: 4.0,
    needsDedicatedGpu: "no",
    codingScore: 6.0,
    agenticScore: 6.4,
    speedScore: 9.0,
    bestFor: "Budget coding assistance on 8GB-RAM machines.",
    watchOut: "Struggles on large multi-file refactors.",
  },
  {
    id: "llama3.3:70b",
    family: "llama3",
    kind: "local",
    paramsB: 70.0,
    contextWindow: 131072,
    ramQ4Gb: 42.0,
    minRamGb: 48.0,
    needsDedicatedGpu: "yes",
    codingScore: 8.6,
    agenticScore: 8.8,
    speedScore: 2.0,
    bestFor: "Largest open-weight local model; very strong generalist.",
    watchOut: "Needs 48GB+ unified memory or a 48GB GPU. Slow on CPU.",
  },
  {
    id: "llama3.1:8b",
    family: "llama3",
    kind: "local",
    paramsB: 8.0,
    contextWindow: 131072,
    ramQ4Gb: 5.0,
    minRamGb: 8.0,
    needsDedicatedGpu: "no",
    codingScore: 6.8,
    agenticScore: 7.4,
    speedScore: 8.0,
    bestFor: "Solid general-purpose assistant; long context (128k).",
    watchOut: "Coding is decent but Qwen2.5-Coder is usually better at it.",
  },
  {
    id: "llama3.2:3b",
    family: "llama3",
    kind: "local",
    paramsB: 3.0,
    contextWindow: 131072,
    ramQ4Gb: 2.5,
    minRamGb: 4.0,
    needsDedicatedGpu: "no",
    codingScore: 5.4,
    agenticScore: 6.0,
    speedScore: 9.0,
    bestFor: "Cheapest reasonable local model; great for very low-RAM boxes.",
    watchOut: "Loses coherence on hard reasoning. Coding is basic.",
  },
  {
    id: "llama3.2:1b",
    family: "llama3",
    kind: "local",
    paramsB: 1.0,
    contextWindow: 131072,
    ramQ4Gb: 1.2,
    minRamGb: 2.0,
    needsDedicatedGpu: "no",
    codingScore: 3.8,
    agenticScore: 4.4,
    speedScore: 10.0,
    bestFor: "Ultra-budget; will run on basically anything.",
    watchOut: "Not really a coding agent. Use only as a last resort.",
  },
  {
    id: "deepseek-coder-v2:16b",
    family: "deepseek-coder",
    kind: "local",
    paramsB: 16.0,
    contextWindow: 163840,
    ramQ4Gb: 10.0,
    minRamGb: 12.0,
    needsDedicatedGpu: "sometimes",
    codingScore: 8.4,
    agenticScore: 7.4,
    speedScore: 5.5,
    bestFor: "Strong coding at the 16B size; long context.",
    watchOut: "Newer DeepSeek models exist; check Ollama for the latest tag.",
  },
  {
    id: "phi3.5:3.8b",
    family: "phi",
    kind: "local",
    paramsB: 3.8,
    contextWindow: 131072,
    ramQ4Gb: 2.7,
    minRamGb: 4.0,
    needsDedicatedGpu: "no",
    codingScore: 6.2,
    agenticScore: 6.6,
    speedScore: 9.0,
    bestFor: "Small but surprisingly capable; very long context.",
    watchOut: "Coding quality below Qwen2.5-Coder at the same size.",
  },
  {
    id: "mistral:7b",
    family: "mistral",
    kind: "local",
    paramsB: 7.0,
    contextWindow: 32768,
    ramQ4Gb: 4.5,
    minRamGb: 8.0,
    needsDedicatedGpu: "no",
    codingScore: 6.4,
    agenticScore: 6.6,
    speedScore: 8.0,
    bestFor: "Dependable generalist if you want a non-Llama/non-Qwen pick.",
    watchOut: "Aging model line. Mistral's newer Small/Large are stronger but heavier.",
  },
  {
    id: "gemma2:9b",
    family: "gemma",
    kind: "local",
    paramsB: 9.0,
    contextWindow: 8192,
    ramQ4Gb: 6.0,
    minRamGb: 8.0,
    needsDedicatedGpu: "no",
    codingScore: 6.4,
    agenticScore: 6.4,
    speedScore: 7.0,
    bestFor: "Another solid generalist at the 8GB-RAM class.",
    watchOut: "Short context (8k) compared to Qwen/Llama peers.",
  },
  {
    id: "codellama:7b",
    family: "codellama",
    kind: "local",
    paramsB: 7.0,
    contextWindow: 16384,
    ramQ4Gb: 4.5,
    minRamGb: 8.0,
    needsDedicatedGpu: "no",
    codingScore: 6.0,
    agenticScore: 5.0,
    speedScore: 7.5,
    bestFor: "Classic code-completion model; still works for simple fills.",
    watchOut: "Pre-dates modern agent-style prompting. Newer Qwen2.5-Coder beats it.",
  },
  {
    id: "qwen3-coder:30b-a3b",
    family: "qwen3-coder",
    kind: "local",
    paramsB: 30.0,
    activeParamsB: 3.0,
    contextWindow: 262144,
    ramQ4Gb: 18.0,
    minRamGb: 22.0,
    needsDedicatedGpu: "sometimes",
    codingScore: 9.6,
    agenticScore: 9.2,
    speedScore: 6.0,
    flagship: true,
    bestFor:
      "Flagship-class coding at a single-box memory budget. Best 'no compromises' local pick on a 24GB-class machine.",
    watchOut: "Needs ~20GB memory (works on 24GB Apple Silicon or a 24GB GPU). Slower than smaller models on weak CPUs.",
  },
  {
    id: "qwen3-coder:480b-a35b",
    family: "qwen3-coder",
    kind: "local",
    paramsB: 480.0,
    activeParamsB: 35.0,
    contextWindow: 262144,
    ramQ4Gb: 290.0,
    minRamGb: 320.0,
    needsDedicatedGpu: "yes",
    codingScore: 9.9,
    agenticScore: 9.7,
    speedScore: 2.5,
    serverClass: true,
    bestFor: "The strongest open-weight coding model. Server-class only.",
    watchOut: "Requires a multi-GPU rig or a Mac Studio / Mac Pro with >200GB unified memory. Not viable on a single consumer GPU.",
  },
  {
    id: "deepseek-v4-pro",
    family: "deepseek",
    kind: "local",
    paramsB: 620.0,
    activeParamsB: 42.0,
    contextWindow: 200000,
    ramQ4Gb: 370.0,
    minRamGb: 400.0,
    needsDedicatedGpu: "yes",
    codingScore: 9.7,
    agenticScore: 9.5,
    speedScore: 2.0,
    serverClass: true,
    bestFor: "State-of-the-art open-weight reasoning, strong on code.",
    watchOut: "Server-class only. Needs a multi-GPU rig or >250GB unified memory.",
  },
  {
    id: "glm-5.2",
    family: "glm",
    kind: "local",
    paramsB: 520.0,
    activeParamsB: 32.0,
    contextWindow: 200000,
    ramQ4Gb: 310.0,
    minRamGb: 340.0,
    needsDedicatedGpu: "yes",
    codingScore: 9.5,
    agenticScore: 9.4,
    speedScore: 2.2,
    serverClass: true,
    bestFor: "Strong Chinese-developed open-weight model with great agentic tool use.",
    watchOut: "Server-class only. Needs a multi-GPU rig or >220GB unified memory.",
  },
  {
    id: "kimi-k2.7-code",
    family: "kimi",
    kind: "local",
    paramsB: 480.0,
    activeParamsB: 28.0,
    contextWindow: 256000,
    ramQ4Gb: 290.0,
    minRamGb: 320.0,
    needsDedicatedGpu: "yes",
    codingScore: 9.6,
    agenticScore: 9.3,
    speedScore: 2.3,
    serverClass: true,
    bestFor: "Code-specialised flagship; long context, strong agentic tool use.",
    watchOut: "Server-class only. Needs a multi-GPU rig or >200GB unified memory.",
  },
  {
    id: "gemma3:27b",
    family: "gemma3",
    kind: "local",
    paramsB: 27.0,
    contextWindow: 131072,
    ramQ4Gb: 17.0,
    minRamGb: 20.0,
    needsDedicatedGpu: "sometimes",
    codingScore: 8.4,
    agenticScore: 8.2,
    speedScore: 5.5,
    license: "gemma (custom, not Apache/MIT)",
    bestFor: "Solid mid-tier open model from Google; long context.",
    watchOut: "License is the Gemma custom license, not Apache/MIT — has redistribution/use restrictions. Needs ~20GB to load.",
  },
]

export const CLOUD_MODELS: ModelEntry[] = [
  {
    id: "claude-haiku-4-5-20251001",
    family: "claude",
    kind: "cloud",
    contextWindow: 200000,
    codingScore: 8.0,
    agenticScore: 8.4,
    speedScore: 9.0,
    freeTier: true,
    signupRequired: true,
    bestFor: "Strong coding + tool use, fast, very long context.",
    watchOut: "Free tier has rate limits; not always available in every region.",
    notes: "Anthropic Claude Haiku 4.5. The realistic free-tier pick in the Claude family.",
  },
  {
    id: "claude-sonnet-5",
    family: "claude",
    kind: "cloud",
    contextWindow: 200000,
    codingScore: 9.4,
    agenticScore: 9.5,
    speedScore: 8.0,
    freeTier: false,
    signupRequired: true,
    bestFor: "Top-tier coding and agentic use; the model OpenCode is tuned against.",
    watchOut: "Not on the free tier. Listed so the recommender can mention it as a paid upgrade path.",
    notes: "Anthropic Claude Sonnet 5. Stronger than Haiku but paid.",
  },
  {
    id: "claude-opus-4-8",
    family: "claude",
    kind: "cloud",
    contextWindow: 200000,
    codingScore: 9.7,
    agenticScore: 9.6,
    speedScore: 5.5,
    freeTier: false,
    signupRequired: true,
    bestFor: "The strongest Claude model; for the hardest reasoning and long-horizon agentic work.",
    watchOut: "Paid, and slow vs Sonnet/Haiku. Overkill for most coding tasks; pick Sonnet 5 for daily use.",
    notes: "Anthropic Claude Opus 4.8. Top of the Claude lineup as of 2026.",
  },
  {
    id: "gemini-2.0-flash",
    family: "gemini",
    kind: "cloud",
    contextWindow: 1000000,
    codingScore: 7.6,
    agenticScore: 7.8,
    speedScore: 9.0,
    freeTier: true,
    signupRequired: true,
    bestFor: "Huge context window; good for very large codebases.",
    watchOut: "Free-tier rate limits are strict; tool-use quality trails Claude.",
    notes: "Google AI Studio free tier.",
  },
  {
    id: "mistral-large-latest",
    family: "mistral",
    kind: "cloud",
    contextWindow: 128000,
    codingScore: 7.4,
    agenticScore: 7.4,
    speedScore: 7.5,
    freeTier: true,
    signupRequired: true,
    bestFor: "Decent generalist with a free tier via le Chat / La Plateforme.",
    watchOut: "Free tier exists but is rate-limited; coding a notch below Claude/Gemini.",
  },
  {
    id: "openrouter-free-mix",
    family: "openrouter",
    kind: "cloud",
    contextWindow: 32000,
    codingScore: 6.0,
    agenticScore: 6.0,
    speedScore: 7.0,
    freeTier: true,
    signupRequired: true,
    bestFor: "A grab-bag of free models behind one API key (Llama, Qwen, Mistral variants).",
    watchOut: "Quality varies; the exact free model rotates.",
    notes: "OpenRouter exposes a rotating set of free models. Use only as a fallback.",
  },
]

export interface ModelCatalog {
  local: ModelEntry[]
  cloud: ModelEntry[]
}

export function createCatalog(local?: ModelEntry[], cloud?: ModelEntry[]): ModelCatalog {
  return {
    local: local !== undefined ? [...local] : [...LOCAL_MODELS],
    cloud: cloud !== undefined ? [...cloud] : [...CLOUD_MODELS],
  }
}

export function catalogAll(catalog: ModelCatalog): ModelEntry[] {
  return [...catalog.local, ...catalog.cloud]
}

export function catalogFind(catalog: ModelCatalog, id: string): ModelEntry | undefined {
  return catalogAll(catalog).find((m) => m.id === id)
}

export function localSortedByCoding(catalog: ModelCatalog): ModelEntry[] {
  return [...catalog.local].sort((a, b) => (b.codingScore ?? 0) - (a.codingScore ?? 0))
}

export function entryToJson(entry: ModelEntry): Record<string, unknown> {
  // Materialize defaults (mirrors dataclass asdict): a to_dict snapshot
  // always carries every field, so from_dict round-trips exactly.
  return { ...entryFromJson({ ...entry }) }
}

export function entryFromJson(d: Record<string, unknown>): ModelEntry {
  // Unknown keys ignored; missing fields fall back to defaults — a newer
  // cache version can't break an older codebase. Never throws on
  // well-formed dicts.
  const get = <K extends keyof ModelEntry>(key: K, fallback: ModelEntry[K]): ModelEntry[K] => {
    const v = d[key as string]
    return (v === undefined || v === null ? fallback : v) as ModelEntry[K]
  }
  return {
    id: get("id", ""),
    family: get("family", ""),
    kind: get("kind", "local"),
    paramsB: get("paramsB", undefined),
    contextWindow: get("contextWindow", 0),
    activeParamsB: get("activeParamsB", undefined),
    ramQ4Gb: get("ramQ4Gb", undefined),
    minRamGb: get("minRamGb", undefined),
    needsDedicatedGpu: get("needsDedicatedGpu", "no"),
    defaultQuant: get("defaultQuant", DEFAULT_QUANT),
    codingScore: get("codingScore", 5.0),
    agenticScore: get("agenticScore", 5.0),
    speedScore: get("speedScore", 5.0),
    bestFor: get("bestFor", ""),
    watchOut: get("watchOut", ""),
    serverClass: get("serverClass", false),
    flagship: get("flagship", false),
    license: get("license", "apache-2.0"),
    freeTier: get("freeTier", true),
    signupRequired: get("signupRequired", true),
    notes: get("notes", ""),
  }
}

export function catalogToJson(catalog: ModelCatalog): { local: Record<string, unknown>[]; cloud: Record<string, unknown>[] } {
  return { local: catalog.local.map(entryToJson), cloud: catalog.cloud.map(entryToJson) }
}

export function catalogFromJson(d: { local?: unknown; cloud?: unknown }): ModelCatalog {
  // Malformed sides fall back to the hardcoded baseline so a bad cache
  // degrades safely.
  const local = Array.isArray(d.local)
    ? (d.local as Record<string, unknown>[]).map(entryFromJson)
    : undefined
  const cloud = Array.isArray(d.cloud)
    ? (d.cloud as Record<string, unknown>[]).map(entryFromJson)
    : undefined
  return createCatalog(local, cloud)
}

export interface RankedModel {
  model: ModelEntry
  score: number
  fit: "comfortable" | "tight" | "squeezed" | "too-big" | "unknown" | "fallback" | "cloud"
  reasons: string[]
}

export interface Recommendation {
  profile: HardwareProfile
  primaryLocal?: RankedModel
  primaryCloud?: RankedModel
  /** Which pick the one-screen UI should lead with (cloud-first tiebreak). */
  primary: "local" | "cloud" | null
  alternates: RankedModel[]
  explanation: string
}

export function effectiveMemoryGb(profile: HardwareProfile): number {
  const ram = profile.ramTotalGb ?? 0.0
  const vram = bestDedicatedVramGb(profile)
  const osKey = isAppleSilicon(profile) ? "apple_silicon" : (profile.osName ?? "unknown").toLowerCase()
  const absoluteHeadroom = RAM_HEADROOM_GB[osKey] ?? RAM_HEADROOM_GB["unknown"]

  if (isAppleSilicon(profile)) {
    const headroom = Math.max(2.0, Math.min(absoluteHeadroom, ram * 0.5))
    const pool = Math.max(0.0, ram - headroom)
    return pool > 0 ? pool : -1.0
  }
  if (vram > 0 && ram > 0) {
    const vramUsable = Math.max(0.0, vram - VRAM_HEADROOM_GB)
    const ramUsable = Math.max(0.0, ram - Math.max(2.0, absoluteHeadroom))
    return vramUsable + ramUsable * 0.7
  }
  if (vram > 0) return Math.max(0.0, vram - VRAM_HEADROOM_GB)
  if (ram > 0) {
    const headroom = Math.max(2.0, Math.min(absoluteHeadroom, ram * 0.5))
    const pool = Math.max(0.0, ram - headroom)
    return pool > 0 ? pool : -1.0
  }
  return -1.0
}

export function modelMemoryNeedGb(model: ModelEntry): number {
  if (model.kind === "cloud") return 0.0
  if (model.ramQ4Gb !== undefined && (model.defaultQuant ?? DEFAULT_QUANT) === DEFAULT_QUANT) return model.ramQ4Gb
  if (model.paramsB === undefined) return 0.0
  const bpp = BYTES_PER_PARAM[model.defaultQuant ?? ""] ?? BYTES_PER_PARAM[DEFAULT_QUANT]
  return Math.round(((model.paramsB * bpp) / 8.0) * 100) / 100
}

export type Fit = "comfortable" | "tight" | "squeezed" | "too-big" | "unknown"

export function classifyFit(profile: HardwareProfile, model: ModelEntry, poolGb: number): Fit {
  const need = modelMemoryNeedGb(model)
  if (need <= 0 || poolGb <= 0) return "unknown"
  const ratio = need / poolGb
  if (ratio <= 0.55) return "comfortable"
  if (ratio <= 0.8) return "tight"
  if (ratio <= 1.0) return "squeezed"
  return "too-big"
}

export function viable(profile: HardwareProfile, model: ModelEntry, poolGb: number): boolean {
  // Server-class models need a >=150 GB pool regardless of fit.
  if (model.serverClass) return poolGb >= 150.0
  // Unknown host: only trust models needing <= 4 GB.
  if (poolGb < 0) return modelMemoryNeedGb(model) <= 4.0
  return ["comfortable", "tight", "squeezed"].includes(classifyFit(profile, model, poolGb))
}

export function scoreLocal(profile: HardwareProfile, model: ModelEntry, poolGb: number): RankedModel {
  const reasons: string[] = []
  const fit = classifyFit(profile, model, poolGb)
  const need = modelMemoryNeedGb(model)

  let fitScore: number
  if (fit === "comfortable") {
    fitScore = 10.0
    reasons.push(
      `It will run comfortably on your machine (~${need.toFixed(0)} GB needed vs. ~${poolGb.toFixed(0)} GB available).`,
    )
  } else if (fit === "tight") {
    fitScore = 7.0
    reasons.push(
      `It will fit on your machine but uses most of the available memory (~${need.toFixed(0)} GB needed vs. ~${poolGb.toFixed(0)} GB available); close other apps for best speed.`,
    )
  } else if (fit === "squeezed") {
    fitScore = 4.5
    reasons.push(
      `It will technically run but will use nearly all of your memory (~${need.toFixed(0)} GB needed vs. ~${poolGb.toFixed(0)} GB available); expect slowdowns.`,
    )
  } else {
    fitScore = 3.0
    reasons.push("Memory situation is unclear; this is a conservative pick.")
  }

  let speed = model.speedScore ?? 5.0
  const vram = bestDedicatedVramGb(profile)
  const fitsInVram = vram > 0 && need <= vram * 0.85
  const gpuNeed = model.needsDedicatedGpu ?? "no"
  if (isAppleSilicon(profile) && poolGb > 0 && need <= poolGb * 0.85) {
    speed = Math.min(10.0, speed + 0.5)
    if (gpuNeed === "yes" || gpuNeed === "sometimes") {
      reasons.push("It runs on the Apple Silicon GPU (unified memory) rather than on the CPU.")
    }
  } else if (isAppleSilicon(profile) && poolGb > 0) {
    speed = Math.max(0.0, speed - 1.5)
    reasons.push(
      "This model is larger than what fits comfortably in your Mac's unified memory; expect heavy memory pressure while it runs.",
    )
  } else if (vram >= 8 && fitsInVram) {
    speed = Math.min(10.0, speed + 0.5)
    if (gpuNeed === "yes" || gpuNeed === "sometimes") {
      reasons.push("Your dedicated GPU will give it a meaningful speed boost.")
    }
  } else if (vram >= 8 && !fitsInVram) {
    speed = Math.max(0.0, speed - 1.5)
    reasons.push(
      "Your GPU is real but smaller than this model; llama.cpp will offload some layers to your CPU. Still much faster than CPU-only, but slower than a fully GPU-resident run.",
    )
  } else if (vram > 0) {
    if (gpuNeed === "yes") {
      speed = Math.max(0.0, speed - 2.0)
      reasons.push("Your GPU is small for this model; CPU offload will slow it down.")
    }
  } else {
    if (gpuNeed === "yes") {
      speed = Math.max(0.0, speed - 3.0)
      reasons.push("This model really wants a dedicated GPU; on CPU it will be slow.")
    } else if (gpuNeed === "sometimes") {
      speed = Math.max(0.0, speed - 1.0)
      reasons.push("No dedicated GPU detected; this model will run on CPU.")
    }
  }

  let coding = model.codingScore ?? 5.0
  if ((fit === "squeezed" || fit === "tight") && poolGb < 8) coding = coding * 0.9

  let ctxBonus = 0.0
  if ((model.contextWindow ?? 0) >= 100000) {
    ctxBonus = 0.6
    reasons.push(`Very long context window (${Math.floor((model.contextWindow ?? 0) / 1000)}k tokens).`)
  } else if ((model.contextWindow ?? 0) >= 30000) {
    ctxBonus = 0.3
    reasons.push(`Long context window (${Math.floor((model.contextWindow ?? 0) / 1000)}k tokens).`)
  }

  const agentic = model.agenticScore ?? 5.0

  let wFit: number
  let wCoding: number
  let wAgentic: number
  let wSpeed: number
  if (fit === "comfortable" && poolGb >= 16) {
    ;[wFit, wCoding, wAgentic, wSpeed] = [1.5, 2.5, 2.0, 1.0]
  } else if (fit === "tight" || fit === "squeezed" || poolGb < 8) {
    ;[wFit, wCoding, wAgentic, wSpeed] = [3.0, 1.5, 1.5, 1.0]
  } else {
    ;[wFit, wCoding, wAgentic, wSpeed] = [2.0, 2.0, 1.5, 1.0]
  }

  return {
    model,
    score: wFit * fitScore + wCoding * coding + wAgentic * agentic + wSpeed * speed + ctxBonus,
    fit,
    reasons,
  }
}

export function scoreCloud(profile: HardwareProfile, model: ModelEntry): RankedModel {
  const reasons = ["Cloud model — runs on the provider's hardware, so no local resource limits apply."]
  if ((model.contextWindow ?? 0) >= 200000) {
    reasons.push(`Very long context window (${Math.floor((model.contextWindow ?? 0) / 1000)}k tokens).`)
  } else if ((model.contextWindow ?? 0) >= 100000) {
    reasons.push(`Long context window (${Math.floor((model.contextWindow ?? 0) / 1000)}k tokens).`)
  }
  if (!model.freeTier) reasons.push("Not on a free tier — listed as a paid upgrade path only.")
  if ((model.family ?? "").toLowerCase() === "claude") {
    reasons.push("Claude models are particularly strong at agentic / tool-use workflows.")
  }
  const freeBonus = model.freeTier ? 1.5 : 0.0
  return {
    model,
    score: 2.5 * (model.codingScore ?? 5.0) + 2.0 * (model.agenticScore ?? 5.0) + 1.0 * (model.speedScore ?? 5.0) + freeBonus,
    fit: "cloud",
    reasons,
  }
}

export function recommend(profile: HardwareProfile, catalog?: ModelCatalog): Recommendation {
  const cat = catalog ?? createCatalog()
  const poolGb = effectiveMemoryGb(profile)

  const localRanked = cat.local.filter((m) => viable(profile, m, poolGb)).map((m) => scoreLocal(profile, m, poolGb))
  localRanked.sort((a, b) => b.score - a.score)

  // Primary cloud pick is free-tier only; paid models stay visible in
  // alternates with their warning.
  const cloudRanked = cat.cloud.map((m) => scoreCloud(profile, m)).sort((a, b) => b.score - a.score)
  const freeCloud = cloudRanked.filter((r) => r.model.freeTier)

  const primaryLocal = localRanked.length > 0 ? localRanked[0] : undefined
  const primaryCloud = (freeCloud.length > 0 ? freeCloud[0] : cloudRanked.length > 0 ? cloudRanked[0] : undefined)

  let resolvedLocal = primaryLocal
  if (!resolvedLocal && cat.local.length > 0) {
    const fallback = cat.local.reduce((a, b) => (modelMemoryNeedGb(a) <= modelMemoryNeedGb(b) ? a : b))
    resolvedLocal = {
      model: fallback,
      score: 0.0,
      fit: "fallback",
      reasons: [
        "We couldn't confidently size your hardware, so this is the smallest model in the catalog — it should run on essentially any machine.",
      ],
    }
    if (!localRanked.some((r) => r.model.id === fallback.id)) localRanked.push(resolvedLocal)
  }

  const seen = new Set<string>()
  if (resolvedLocal) seen.add(resolvedLocal.model.id)
  if (primaryCloud) seen.add(primaryCloud.model.id)
  const alternates = [...localRanked, ...cloudRanked].filter((r) => {
    if (seen.has(r.model.id)) return false
    seen.add(r.model.id)
    return true
  })
  alternates.sort((a, b) => b.score - a.score)

  // Cloud-first tiebreak: lead with cloud unless local scoring strictly
  // wins on a comfortable fit.
  let primary: "local" | "cloud" | null = null
  if (resolvedLocal && resolvedLocal.fit === "comfortable" && (!primaryCloud || resolvedLocal.score > primaryCloud.score)) {
    primary = "local"
  } else if (primaryCloud) {
    primary = "cloud"
  } else if (resolvedLocal) {
    primary = "local"
  }

  return {
    profile,
    primaryLocal: resolvedLocal,
    primaryCloud,
    primary,
    alternates,
    explanation: minimalExplain(profile, resolvedLocal, primaryCloud, alternates),
  }
}

function profileSummary(profile: HardwareProfile, poolGb: number): string {
  const parts: string[] = []
  if (profile.osName) {
    let s = profile.osName
    if (profile.osVersion) s += ` ${profile.osVersion}`
    if (profile.arch) s += ` (${profile.arch})`
    parts.push(s)
  }
  if (profile.cpuModel) {
    let cpu = profile.cpuModel
    if (profile.cpuCoresLogical) cpu += ` (${profile.cpuCoresLogical} threads)`
    parts.push(cpu)
  }
  if (profile.ramTotalGb) parts.push(`${profile.ramTotalGb.toFixed(0)} GB RAM`)
  if (profile.gpus.length > 0) {
    const g = profile.gpus[0]
    let gpuStr = g.name
    if (g.vramGb) gpuStr += ` (${g.vramGb.toFixed(0)} GB VRAM)`
    else if (g.notes) gpuStr += ` (${g.notes})`
    parts.push(gpuStr)
  }
  if (profile.diskFreeGb) parts.push(`${profile.diskFreeGb.toFixed(0)} GB free disk`)
  parts.push(`~${poolGb.toFixed(0)} GB usable for models`)
  return parts.join(" · ") || "unknown hardware"
}

function fitClause(fit: RankedModel["fit"]): string {
  if (fit === "comfortable") return "fits here with room to spare"
  if (fit === "tight") return "fits, but will leave little headroom while it runs"
  if (fit === "squeezed") return "will run, though it uses just about all of the available memory"
  return "should run on almost any machine"
}

export function cloudProviderName(model: ModelEntry): string {
  const providers: Record<string, string> = {
    claude: "Anthropic",
    gemini: "Google",
    mistral: "Mistral AI",
    openrouter: "OpenRouter's pool of providers",
  }
  return providers[(model.family ?? "").toLowerCase()] ?? "the provider"
}

export function minimalExplain(
  profile: HardwareProfile,
  primaryLocal: RankedModel | undefined,
  primaryCloud: RankedModel | undefined,
  _alternates: RankedModel[],
): string {
  const pool = effectiveMemoryGb(profile)
  const sentences: string[] = []

  if (isAppleSilicon(profile)) {
    const chip = profile.cpuModel || "Apple Silicon Mac"
    const ram = profile.ramTotalGb ? profile.ramTotalGb.toFixed(0) : "?"
    sentences.push(
      `Your ${chip} carries ${ram} GB of unified memory — macOS and the runtime keep a slice of it, leaving roughly ${pool.toFixed(0)} GB for a model to actually use.`,
    )
  } else if (bestDedicatedVramGb(profile) > 0) {
    const gpu = profile.gpus.find((g) => g.vramGb)
    const gpuName = gpu?.name || "your GPU"
    sentences.push(
      `The hard ceiling here is ${gpuName}: ${bestDedicatedVramGb(profile).toFixed(0)} GB of VRAM for the GPU-resident layers, plus whatever spills over to your CPU, for about ${pool.toFixed(0)} GB to work with.`,
    )
  } else if (profile.ramTotalGb && profile.ramTotalGb < 12) {
    sentences.push(
      `This box has only ${profile.ramTotalGb.toFixed(0)} GB of RAM and no dedicated GPU, which caps a local model at roughly ${pool.toFixed(0)} GB — big flagships are simply out of the question here.`,
    )
  } else if (profile.ramTotalGb) {
    sentences.push(
      `This is a CPU-only machine with ${profile.ramTotalGb.toFixed(0)} GB of RAM, so a local model can draw on about ${pool.toFixed(0)} GB but will run on the processor.`,
    )
  } else {
    sentences.push("We couldn't learn much about this machine, so the picks below are deliberately conservative.")
  }

  if (primaryLocal && primaryLocal.model.kind === "local") {
    const m = primaryLocal.model
    sentences.push(
      `${m.id} is the local pick — at ${m.defaultQuant ?? DEFAULT_QUANT} it needs ~${modelMemoryNeedGb(m).toFixed(0)} GB, which ${fitClause(primaryLocal.fit)}.`,
    )
  }

  if (primaryCloud && primaryCloud.model.freeTier) {
    const m = primaryCloud.model
    sentences.push(
      `If you'd rather not spend local RAM at all, ${m.id} is the free cloud fallback — ${cloudProviderName(m)} runs it on their own hardware, costing your machine nothing.`,
    )
  }

  return sentences.join(" ")
}

export * as OnboardingReasoning from "./reasoning"
