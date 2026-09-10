// Tiered model+provider fallback catalog.
//
// Ports OliveCode cloud/model_catalog.py (logical id, coding/agentic
// scores, context window, tier, provider list) plus the selection order
// from cloud/selection.py + cloud/client.py (send_with_fallback): on a
// rate limit, retry the SAME logical model via a different provider
// before downgrading to the next-best model.
//
// ModelScope was evaluated and REJECTED: Alibaba Cloud account
// creation mandatorily requires a payment card (confirmed via live
// testing), which violates the FREE-ONLY discipline below — same
// category as the earlier Google AI Studio rejection. Do not re-add
// without re-reading why.
//
// Cerebras was evaluated 2026-09-10 and REJECTED for the catalog:
// live GET /public/v1/models prices qwen-3.8-27b at $0/$0 but the
// model docs page prices the same id at $0.99/$1.49 (inconclusive),
// and API access requires a verified payment method with trial
// credits expiring after 30 days (official rate-limits doc) —
// payment gating plus unstable pricing violates FREE-ONLY. The served
// list also rotates (endpoint lists qwen-3.8-27b where the models.dev
// snapshot lists zai-glm-4.7). Do not add without re-verifying $0
// pricing AND ungated access.
//
// FREE-ONLY DISCIPLINE: every concrete id below must be verifiably
// zero-cost, or it is dropped rather than shipped silently requiring
// payment (same rule as unverified ids):
// - openrouter concretes must exist verbatim in
//   test/tool/fixtures/models-api.json with cost.input === 0 and
//   cost.output === 0 (the fixture-guard test enforces this).
//   Verified 2026-09: deepseek/deepseek-v4-flash ($0.077/$0.154),
//   deepseek/deepseek-v4-pro ($0.435/$0.87) and qwen/qwen3-coder-next
//   ($0.11/$0.8) are ALL paid, so they were removed. The
//   coding-capable free OpenRouter id is cohere/north-mini-code:free (0/0).
//   Fixture refresh: fetch $OPENCODE_MODELS_URL/api.json (default
//   https://models.opencode.ai/api.json) into
//   test/tool/fixtures/models-api.json; last refreshed 2026-09-09. Never
//   rewrite the fixture via json.load+json.dump — it reformats the whole
//   4.7MB file into a 60k-line diff (2026-09-09 incident); splice only the
//   changed block to keep the diff reviewable.
// Scores/tiers below follow CLOUD_MODEL_CATALOG — do not invent new
// numbers. The qwen3-coder scores are carried over from OliveCode's
// qwen3-coder-next entry (re-benchmark pending); its contextWindow is
// the fixture's real value for cohere/north-mini-code:free. Candidates
// missing from the live local provider database are additionally
// skipped at dispatch time.

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

export const CATALOG: Entry[] = [
  {
    id: "qwen3-coder",
    codingScore: 9.4,
    agenticScore: 9.0,
    contextWindow: 256000,
    tier: "strong",
    providers: ["openrouter"],
    concrete: {
      openrouter: "cohere/north-mini-code:free",
    },
  },
  // Groq Free tier is $0 by tier structure (verified 2026-09-10): no
  // payment method is required for Free (only Developer upgrades need
  // one, per billing-faqs), usage-based charges stop on downgrade, and
  // the Free-plan rate table serves openai/gpt-oss-120b within RPM/RPD
  // caps. Scores carried over with re-benchmark pending (same convention
  // as qwen3-coder); contextWindow is the docs' 131,072. Served ids are
  // cached in test/tool/fixtures/groq-models.json — the live endpoint
  // needs a key, so the snapshot is taken from the official docs table.
  {
    id: "gpt-oss-120b",
    codingScore: 9.4,
    agenticScore: 9.0,
    contextWindow: 131072,
    tier: "strong",
    providers: ["groq"],
    concrete: {
      groq: "openai/gpt-oss-120b",
    },
  },
  // Mistral Free mode is $0 by tier structure (verified 2026-09-10):
  // no credit card is required for Free mode (only paid upgrades need
  // a payment method, per official quickstart), and Free usage is
  // rate-limited rather than billed. Scores carried over with
  // re-benchmark pending (same convention as qwen3-coder);
  // contextWindow is the docs' 128k. Served ids are cached in
  // test/tool/fixtures/mistral-models.json — the live endpoint needs
  // a key, so the snapshot is taken from the official docs.
  {
    id: "codestral",
    codingScore: 9.4,
    agenticScore: 9.0,
    contextWindow: 131072,
    tier: "strong",
    providers: ["mistral"],
    concrete: {
      mistral: "codestral-latest",
    },
  },
]

export function rank(entries: Entry[]): Entry[] {
  return [...entries].sort(
    (a, b) =>
      b.codingScore - a.codingScore || b.agenticScore - a.agenticScore || b.contextWindow - a.contextWindow,
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
  const haystack = [data.message, data.responseBody].filter(
    (value): value is string => typeof value === "string",
  )
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
  if (!current) return []
  const triedSet = new Set(tried)
  triedSet.add(key(providerID, modelID))
  const ranked = rank(entries)
  const ordered = preferredTier
    ? [...ranked.filter((entry) => entry.tier === preferredTier), ...ranked.filter((entry) => entry.tier !== preferredTier)]
    : ranked
  const same = ordered.find((entry) => entry.id === current.id)
  const rest = ordered.filter((entry) => entry.id !== current.id)
  return [...(same ? entryTargets(same, triedSet) : []), ...rest.flatMap((entry) => entryTargets(entry, triedSet))]
}

// Best starting pair given connected providers. Ports selection.select:
// highest-ranked entry with a connected provider (first listed wins),
// preferred tier searched first, undefined when nothing is viable.
export function rankedDefault(
  connected: ReadonlySet<string>,
  entries: Entry[] = CATALOG,
  preferredTier?: string,
): Target | undefined {
  const ranked = rank(entries)
  const ordered = preferredTier
    ? [...ranked.filter((entry) => entry.tier === preferredTier), ...ranked.filter((entry) => entry.tier !== preferredTier)]
    : ranked
  for (const entry of ordered) {
    for (const providerID of entry.providers) {
      if (!connected.has(providerID)) continue
      const modelID = entry.concrete[providerID]
      if (!modelID) continue
      return { providerID, modelID }
    }
  }
  return undefined
}

export * as ProviderFallback from "./fallback"
