import { ProviderFallback } from "@/provider/fallback"
import { ProviderCooldown } from "@/provider/cooldown"
import { detectHardware, isAppleSilicon } from "@/onboarding/hardware"
import {
  findOllamaBinary,
  ollamaStatus,
  pullOllamaModel,
  inspectOllamaModel,
  deleteOllamaModel,
} from "@/onboarding/ollama"
import {
  effectiveMemoryGb,
  modelMemoryNeedGb,
  recommend,
  LOCAL_MODELS,
  LOCAL_CATALOG_REVIEWED,
  scoreLocal,
} from "@/onboarding/reasoning"

import { Effect, Queue, Stream } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { OnboardingApiError } from "../groups/onboarding"

function sseLine(data: string): string {
  return `data: ${data.replace(/\n/g, " ")}\n\n`
}

export const onboardingHandlers = HttpApiBuilder.group(InstanceHttpApi, "onboarding", (handlers) =>
  Effect.gen(function* () {
    const cooldowns = yield* ProviderCooldown.Service
    const recommendation = Effect.fn("OnboardingHttpApi.recommendation")(function* () {
      const profile = yield* Effect.promise(() => detectHardware())
      const rec = recommend(profile)
      const poolGb = effectiveMemoryGb(profile)
      const gpu = profile.gpus.length > 0 ? profile.gpus[0] : undefined
      return {
        profile: {
          os: profile.osName,
          cpu: profile.cpuModel,
          ramGb: profile.ramTotalGb,
          gpu: gpu ? `${gpu.name}${gpu.vramGb ? ` (${gpu.vramGb} GB VRAM)` : ""}` : undefined,
          poolGb,
          diskFreeGb: profile.diskFreeGb,
        },
        primaryLocal: rec.primaryLocal
          ? {
              id: rec.primaryLocal.model.id,
              kind: "local" as const,
              score: rec.primaryLocal.score,
              fit: rec.primaryLocal.fit,
              reasons: rec.primaryLocal.reasons,
              needGb: modelMemoryNeedGb(rec.primaryLocal.model),
              name: rec.primaryLocal.model.name,
              variant: rec.primaryLocal.model.variant,
              downloadGb: rec.primaryLocal.model.downloadGb,
            }
          : undefined,
        primaryCloud: rec.primaryCloud
          ? {
              id: rec.primaryCloud.model.id,
              kind: "cloud" as const,
              score: rec.primaryCloud.score,
              fit: rec.primaryCloud.fit,
              reasons: rec.primaryCloud.reasons,
            }
          : undefined,
        primary: rec.primary,
        alternates: rec.alternates.map((a) => ({
          id: a.model.id,
          name: a.model.name,
          variant: a.model.variant,
          downloadGb: a.model.downloadGb,
          kind: a.model.kind,
          score: a.score,
          fit: a.fit,
          reasons: a.reasons,
          needGb: a.model.kind === "local" ? modelMemoryNeedGb(a.model) : undefined,
        })),
        explanation: rec.explanation,
        reviewed: LOCAL_CATALOG_REVIEWED,
        catalog: LOCAL_MODELS.map((model) => {
          const item = scoreLocal(profile, model, poolGb)
          return {
            id: model.id,
            name: model.name,
            variant: model.variant,
            kind: "local" as const,
            score: item.score,
            fit: item.fit,
            needGb: modelMemoryNeedGb(model),
            downloadGb: model.downloadGb,
            reasons: item.reasons,
            compatible: !model.appleOnly || isAppleSilicon(profile),
          }
        }).sort((a, b) => b.score - a.score),
      }
    })

    const ollama = Effect.fn("OnboardingHttpApi.ollama")(function* () {
      const status = yield* Effect.promise(() => ollamaStatus())
      return {
        installed: status.installed,
        models: status.models,
        running: status.running,
        details: status.details,
        error: status.error,
      }
    })

    const pull = Effect.fn("OnboardingHttpApi.pull")(function* (ctx: { payload: { model: string } }) {
      const binary = yield* Effect.promise(() => findOllamaBinary())
      if (!binary) {
        return yield* new OnboardingApiError({ name: "OnboardingOllamaMissing", data: {} })
      }
      const queue = yield* Queue.unbounded<string>()
      const finish = (line: string) => Queue.offer(queue, line).pipe(Effect.andThen(Queue.shutdown(queue)))
      yield* Effect.promise(() =>
        pullOllamaModel(binary, ctx.payload.model, (line) => {
          Queue.offerUnsafe(queue, sseLine(line))
        }),
      ).pipe(
        Effect.flatMap((result) =>
          finish(sseLine(JSON.stringify(result.ok ? { done: true } : { done: false, error: result.error }))),
        ),
        Effect.catchCause((cause) =>
          finish(sseLine(JSON.stringify({ done: false, error: "pull failed" }))).pipe(
            Effect.andThen(Effect.logWarning("onboarding pull failed", { cause })),
          ),
        ),
        Effect.forkScoped,
      )
      return HttpServerResponse.stream(Stream.encodeText(Stream.fromQueue(queue)), {
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache, no-transform" },
      })
    })

    const def = Effect.fn("OnboardingHttpApi.default")(function* (ctx: {
      payload: { connected: ReadonlyArray<string>; preferredTier?: string }
    }) {
      const waiting = yield* cooldowns.list()
      const target = ProviderFallback.rankedDefault(
        new Set(ctx.payload.connected),
        undefined,
        ctx.payload.preferredTier,
        new Set(waiting.map((item) => `${item.providerID}/${item.modelID}`)),
      )
      if (!target) return undefined
      return { providerID: target.providerID, modelID: target.modelID }
    })

    return handlers
      .handle("recommendation", () => recommendation())
      .handle("ollama", () => ollama())
      .handle("localModel", ({ payload }) =>
        Effect.tryPromise({
          try: () => inspectOllamaModel(payload.model),
          catch: (error) =>
            new OnboardingApiError({
              name: "BadRequest",
              data: { message: error instanceof Error ? error.message : String(error) },
            }),
        }),
      )
      .handle("deleteModel", ({ payload }) =>
        Effect.tryPromise({
          try: () => deleteOllamaModel(payload.model),
          catch: (error) =>
            new OnboardingApiError({
              name: "BadRequest",
              data: { message: error instanceof Error ? error.message : String(error) },
            }),
        }),
      )
      .handle("pull", pull)
      .handle("default", def)
  }),
)
