import type { Model } from "@opencode-ai/sdk/v2"

// Reusable static model-metadata declarations for fallback-catalog
// concretes whose ids are verified live but missing (or stale) in the
// models.dev snapshot. Retired ModelScope staticModels() generalized.
//
// HARD PRECONDITION, verified against provider.ts: plugin
// `provider.models` hooks only merge into provider sections that
// ALREADY EXIST in the models.dev database (`if (!provider) continue`)
// — a hook can add missing ids and override stale fields, but it
// CANNOT create a provider section (llm7 has none, so no hook helps
// there; see the fallback.ts comment).
//
// FREE-ONLY DISCIPLINE is baked in, not optional: cost is fixed $0/$0
// and status is fixed "active" (asserting live-verified truth over
// stale deprecation flags). A paid or unverified model has no business
// calling this. Every numeric/capability value below must cite a
// verified source — no guessing (Schema.is(Model) silently drops
// malformed records at merge time, so a wrong shape fails closed).
export interface StaticModelSpec {
  id: string
  name: string
  family: string
  /** Verified context window (the database value governs dispatch). */
  context: number
  /** Verified max output tokens. Must be sourced, never invented. */
  output: number
  toolcall?: boolean
  reasoning?: boolean
  attachment?: boolean
  /** Non-text input modalities; default text-only (conservative). */
  mediaInput?: {
    image?: boolean
    video?: boolean
  }
}

export function staticModels(providerID: string, baseURL: string, specs: StaticModelSpec[]): Record<string, Model> {
  const models: Record<string, Model> = {}
  for (const spec of specs) {
    const media = spec.mediaInput ?? {}
    models[spec.id] = {
      id: spec.id,
      name: spec.name,
      family: spec.family,
      providerID,
      status: "active",
      headers: {},
      options: {},
      cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
      capabilities: {
        temperature: true,
        reasoning: spec.reasoning ?? false,
        attachment: spec.attachment ?? false,
        toolcall: spec.toolcall ?? false,
        input: {
          text: true,
          audio: false,
          image: media.image ?? false,
          video: media.video ?? false,
          pdf: false,
        },
        output: { text: true, audio: false, image: false, video: false, pdf: false },
        interleaved: false,
      },
      release_date: "",
      variants: {},
      api: { id: spec.id, url: baseURL, npm: "@ai-sdk/openai-compatible" },
      limit: { context: spec.context, output: spec.output },
    }
  }
  return models
}
