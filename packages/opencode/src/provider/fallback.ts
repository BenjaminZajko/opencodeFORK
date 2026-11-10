export interface Target {
  providerID: string
  modelID: string
}

export interface Entry {
  id: string
  codingScore: number
  agenticScore: number
  contextWindow: number
  tier: "fast" | "strong"
  providers: string[]
  concrete: Record<string, string>
}

// Explicit preference order for coding (rechecked live 2026-11-09); these values are not benchmark results.
// NVIDIA NIM trial credits are excluded; NVIDIA models served free through OpenRouter qualify. See docs/olivecode/free-models.md.
export const CATALOG: Entry[] = [
  {
    id: "nemotron-3-ultra",
    codingScore: 0,
    agenticScore: 0,
    contextWindow: 1000000,
    tier: "strong",
    providers: ["openrouter"],
    concrete: { openrouter: "nvidia/nemotron-3-ultra-550b-a55b:free" },
  },
  {
    id: "flint-v1",
    codingScore: 0,
    agenticScore: 0,
    contextWindow: 262144,
    tier: "strong",
    providers: ["openrouter"],
    concrete: { openrouter: "recursive/flint-v1.0:free" },
  },
  {
    id: "north-mini-code",
    codingScore: 0,
    agenticScore: 0,
    contextWindow: 256000,
    tier: "strong",
    providers: ["openrouter"],
    concrete: { openrouter: "cohere/north-mini-code:free" },
  },
  {
    id: "glm-4.7-flash",
    codingScore: 0,
    agenticScore: 0,
    contextWindow: 200000,
    tier: "strong",
    providers: ["zai"],
    concrete: { zai: "glm-4.7-flash" },
  },
  {
    id: "gpt-oss-120b",
    codingScore: 0,
    agenticScore: 0,
    contextWindow: 131072,
    tier: "strong",
    providers: ["groq"],
    concrete: { groq: "openai/gpt-oss-120b" },
  },
  {
    id: "gpt-oss-20b",
    codingScore: 0,
    agenticScore: 0,
    contextWindow: 131072,
    tier: "fast",
    providers: ["groq"],
    concrete: { groq: "openai/gpt-oss-20b" },
  },
  {
    id: "glm-4.5-flash",
    codingScore: 0,
    agenticScore: 0,
    contextWindow: 131072,
    tier: "fast",
    providers: ["zai"],
    concrete: { zai: "glm-4.5-flash" },
  },
  {
    id: "codestral",
    codingScore: 0,
    agenticScore: 0,
    contextWindow: 131072,
    tier: "strong",
    providers: ["mistral"],
    concrete: { mistral: "codestral-latest" },
  },
  {
    id: "mistral-small",
    codingScore: 0,
    agenticScore: 0,
    contextWindow: 131072,
    tier: "fast",
    providers: ["mistral"],
    concrete: { mistral: "mistral-small-latest" },
  },
]

export function rank(entries: Entry[]): Entry[] {
  return [...entries].sort(
    (a, b) => b.codingScore - a.codingScore || b.agenticScore - a.agenticScore || b.contextWindow - a.contextWindow,
  )
}

function key(providerID: string, modelID: string) {
  return `${providerID}/${modelID}`
}

// Rate-limit gate mirroring OliveCode cloud/client.py send_with_fallback:
// only 429s mark a provider down and trigger a switch; other errors
// keep existing same-model retry behavior.
export function isRateLimited(error: { data?: unknown }): boolean {
  if (!error.data || typeof error.data !== "object") return false
  const data = error.data as { statusCode?: unknown; message?: unknown; responseBody?: unknown }
  if (data.statusCode === 429) return true
  const haystack = [data.message, data.responseBody].filter((value): value is string => typeof value === "string")
  return haystack.some((text) => /rate limit|rate-limit|rate_limit|too many requests|\b429\b/i.test(text))
}

// OpenRouter's free tier has a per-account daily cap shared by every :free
// model. Once hit, all of them stay unavailable until the reset time.
export function dailyQuotaReset(error: { data?: unknown }, now = Date.now()): number | undefined {
  if (!error.data || typeof error.data !== "object") return undefined
  const data = error.data as { message?: unknown; responseBody?: unknown; responseHeaders?: unknown }
  const body = typeof data.responseBody === "string" ? data.responseBody : ""
  const text = `${typeof data.message === "string" ? data.message : ""} ${body}`
  if (!/free-models-per-day/i.test(text)) return undefined
  const headers = (data.responseHeaders && typeof data.responseHeaders === "object" ? data.responseHeaders : {}) as Record<string, string>
  const fromBody = body.match(/"X-RateLimit-Reset"\s*:\s*"?(\d{10,})/i)?.[1]
  const reset = Number(headers["x-ratelimit-reset"] ?? fromBody)
  if (Number.isFinite(reset) && reset > now) return reset < 1e12 ? reset * 1000 : reset
  const midnight = new Date(now)
  midnight.setUTCHours(24, 0, 0, 0)
  return midnight.getTime()
}

function entryTargets(entry: Entry, tried: Set<string>): Target[] {
  const targets: Target[] = []
  for (const providerID of entry.providers) {
    const modelID = entry.concrete[providerID]
    if (!modelID) continue
    if (tried.has(key(providerID, modelID))) continue
    targets.push({ providerID, modelID })
  }
  return targets
}

// Ordered alternatives for a failed provider+model: same logical model
// on other providers first, then the next-best logical models. Pairs
// already in `tried` are skipped. Returns [] when the current model
// maps to no catalog entry (caller keeps existing same-model retry).
export function fallbacksFor(
  providerID: string,
  modelID: string,
  tried: ReadonlySet<string>,
  entries: Entry[] = CATALOG,
  preferredTier?: string,
): Target[] {
  const current = entries.find((entry) => entry.concrete[providerID] === modelID)
  // Any eligible free model may fall back to the curated alternatives.
  const triedSet = new Set(tried)
  triedSet.add(key(providerID, modelID))
  const ranked = rank(entries)
  const ordered = preferredTier
    ? [
        ...ranked.filter((entry) => entry.tier === preferredTier),
        ...ranked.filter((entry) => entry.tier !== preferredTier),
      ]
    : ranked
  const same = ordered.find((entry) => entry.id === current?.id)
  const rest = ordered.filter((entry) => entry.id !== current?.id)
  return [...(same ? entryTargets(same, triedSet) : []), ...rest.flatMap((entry) => entryTargets(entry, triedSet))]
}

// Best starting pair given connected providers. Ports selection.select:
// highest-ranked entry with a connected provider (first listed wins),
// preferred tier searched first, undefined when nothing is viable.
export function rankedDefault(
  connected: ReadonlySet<string>,
  entries: Entry[] = CATALOG,
  preferredTier?: string,
  unavailable: ReadonlySet<string> = new Set(),
): Target | undefined {
  const ranked = rank(entries)
  const ordered = preferredTier
    ? [
        ...ranked.filter((entry) => entry.tier === preferredTier),
        ...ranked.filter((entry) => entry.tier !== preferredTier),
      ]
    : ranked
  for (const entry of ordered) {
    for (const providerID of entry.providers) {
      if (!connected.has(providerID)) continue
      const modelID = entry.concrete[providerID]
      if (!modelID) continue
      if (unavailable.has(key(providerID, modelID))) continue
      return { providerID, modelID }
    }
  }
  return undefined
}

export * as ProviderFallback from "./fallback"
