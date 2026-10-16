// Product policy, shared by the server and terminal. Unknown pricing fails closed.
// Reviewed 2026-09-21: Groq's Free Plan Limits, Mistral's Free mode, and
// OpenRouter's explicitly free variants. NVIDIA trial credits are not a free plan.
export const FREE_PROVIDERS = ["openrouter", "groq", "mistral"] as const

export function freeProvider(id: string) {
  return (FREE_PROVIDERS as readonly string[]).includes(id)
}

const tierModels: Record<string, readonly string[]> = {
  groq: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
  mistral: ["codestral-latest", "mistral-small-latest"],
}

export type ModelPolicyInput = {
  cost?: { input?: number; output?: number }
  api?: { id?: string }
  status?: string
}

export function freeModel(providerID: string, modelID: string, model: ModelPolicyInput = {}) {
  if (model.status === "deprecated") return false
  const apiID = model.api?.id ?? modelID
  if (providerID === "ollama") return ![modelID, apiID].some((id) => /(?:[-:]cloud)(?::|$)/i.test(id))
  if (providerID === "openrouter")
    return modelID.endsWith(":free") && apiID.endsWith(":free") && model.cost?.input === 0 && model.cost?.output === 0
  return Boolean(tierModels[providerID]?.includes(modelID) && tierModels[providerID]?.includes(apiID))
}

// Curated coding preference, not a benchmark score. A live cooldown always wins.
const preference = [
  "openrouter/poolside/laguna-s-2.1:free",
  "openrouter/cohere/north-mini-code:free",
  "groq/openai/gpt-oss-120b",
  "groq/qwen/qwen3.8-27b",
  "mistral/codestral-latest",
  "groq/openai/gpt-oss-20b",
  "mistral/mistral-small-latest",
]

export function modelPriority(providerID: string, modelID: string) {
  const index = preference.indexOf(`${providerID}/${modelID}`)
  return index < 0 ? preference.length : index
}
