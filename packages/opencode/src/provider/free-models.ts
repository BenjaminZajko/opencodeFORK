import { Context, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { freeModel, freeProvider } from "@opencode-ai/core/olivecode/models"

export class Service extends Context.Service<Service, {
  readonly provider: (id: string) => boolean
  readonly model: typeof freeModel
}>()("@olivecode/FreeModels") {}

export const node = LayerNode.make({
  service: Service,
  layer: Layer.succeed(Service, { provider: (id) => id === "ollama" || freeProvider(id), model: freeModel }),
  deps: [],
})

export * as FreeModels from "./free-models"
