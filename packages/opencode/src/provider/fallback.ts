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

// Explicit preference order for coding; these values are not benchmark results.
// NVIDIA trial-only access is excluded. See docs/olivecode/free-models.md.
export const CATALOG: Entry[] = [
  {
    id: "laguna-s-2-1",
    codingScore: 0,
    agenticScore: 0,
    contextWindow: 262144,
    tier: "strong",
    providers: ["openrouter"],
    concrete: { openrouter: "poolside/laguna-s-2.1:free" },
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
    id: "gpt-oss-120b",
    codingScore: 0,
    agenticScore: 0,
    contextWindow: 131072,
    tier: "strong",
    providers: ["groq"],
    concrete: { groq: "openai/gpt-oss-120b" },
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
    id: "gpt-oss-20b",
    codingScore: 0,
    agenticScore: 0,
    contextWindow: 131072,
    tier: "fast",
    providers: ["groq"],
    concrete: { groq: "openai/gpt-oss-20b" },
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
