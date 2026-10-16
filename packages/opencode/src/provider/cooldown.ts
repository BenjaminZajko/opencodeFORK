import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { InstanceState } from "@/effect/instance-state"
import { Clock, Context, Effect, Layer, Schema } from "effect"

// Per-instance record of provider+model pairs that recently returned a
// rate-limit (429). The retry-after value in a 429 is scoped to the
// specific failed request (see session/retry.ts delay parsing), so the
// key is provider+model, not provider alone. Consumers aggregate by
// providerID when they need a per-provider view.
export const Cooldown = Schema.Struct({
  providerID: ProviderV2.ID,
  modelID: ModelV2.ID,
  downUntil: Schema.Finite,
  reason: Schema.optional(Schema.String),
}).annotate({ identifier: "ProviderCooldown" })
export type Cooldown = typeof Cooldown.Type

export interface Interface {
  readonly markDown: (input: typeof Cooldown.Type) => Effect.Effect<void>
  readonly list: () => Effect.Effect<Cooldown[]>
  readonly clear: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ProviderCooldown") {}

function key(providerID: string, modelID: string) {
  return `${providerID}/${modelID}`
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const state = yield* InstanceState.make(Effect.fn("ProviderCooldown.state")(function* () {
      return new Map<string, Cooldown>()
    }))

    const markDown = Effect.fn("ProviderCooldown.markDown")(function* (input: typeof Cooldown.Type) {
      const data = yield* InstanceState.get(state)
      data.set(key(input.providerID, input.modelID), input)
    })

    const list = Effect.fn("ProviderCooldown.list")(function* () {
      const data = yield* InstanceState.get(state)
      const now = yield* Clock.currentTimeMillis
      const active: Cooldown[] = []
      for (const [k, entry] of data) {
        if (entry.downUntil <= now) {
          data.delete(k)
          continue
        }
        active.push(entry)
      }
      return active
    })

    const clear = Effect.fn("ProviderCooldown.clear")(function* () {
      const data = yield* InstanceState.get(state)
      data.clear()
    })

    return Service.of({ markDown, list, clear })
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [] })

export * as ProviderCooldown from "./cooldown"
