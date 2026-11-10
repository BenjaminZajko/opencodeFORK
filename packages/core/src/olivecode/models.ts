// Product policy, shared by the server and terminal. Unknown pricing fails closed.
// Reviewed 2026-11-09: Groq's Free Plan Limits, Mistral's Free mode, OpenRouter's
// explicitly free variants, and Z.ai's free Flash models (docs.z.ai pricing).
// NVIDIA trial credits are not a free plan.
export const FREE_PROVIDERS = ["openrouter", "groq", "mistral", "zai"] as const

export function freeProvider(id: string) {
  return (FREE_PROVIDERS as readonly string[]).includes(id)
}

const tierModels: Record<string, readonly string[]> = {
  groq: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
  mistral: ["codestral-latest", "mistral-small-latest"],
  // Z.ai lists these as free; FlashX and GLM-5.x Flash are paid or limited-time only.
  zai: ["glm-4.7-flash", "glm-4.5-flash"],
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
// Ordered by published agentic-coding results and live tool-call checks (2026-11-09).
const preference = [
  "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
  "openrouter/recursive/flint-v1.0:free",
  "openrouter/cohere/north-mini-code:free",
  "zai/glm-4.7-flash",
  "groq/openai/gpt-oss-120b",
  "openrouter/dots-studio/dots-3-note-preview:free",
  "groq/qwen/qwen3.8-27b",
  "openrouter/google/gemma-4-31b-it:free",
  "zai/glm-4.5-flash",
  "groq/openai/gpt-oss-20b",
  // Mistral's free tier allows 2 requests/minute (checked 2026-11-10): last resort.
  "mistral/codestral-latest",
  "mistral/mistral-small-latest",
]

export function modelPriority(providerID: string, modelID: string) {
  const index = preference.indexOf(`${providerID}/${modelID}`)
  return index < 0 ? preference.length : index
}
