import { afterEach, expect } from "bun:test"
import { streamText } from "ai"
import { Effect } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Provider } from "@/provider/provider"
import { Env } from "@/env"
import { Plugin } from "@/plugin"
import { disposeAllInstances, provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(disposeAllInstances)

const it = testEffect(
  LayerNode.compile(LayerNode.group([Provider.node, Env.node, Plugin.node, CrossSpawnSpawner.node])),
)

for (const custom of [false, true]) {
  it.live(`OpenRouter request ${custom ? "preserves configured attribution" : "identifies OliveCode"}`, () =>
    Effect.gen(function* () {
      const requests: Headers[] = []
      const server = yield* Effect.acquireRelease(
        Effect.sync(() => Bun.serve({
          hostname: "127.0.0.1",
          port: 0,
          fetch(request) {
            requests.push(request.headers)
            return new Response(
              'data: {"id":"local-fixture","model":"audit:free","choices":[{"index":0,"delta":{"role":"assistant","content":"fixture"},"finish_reason":null}]}\n\ndata: {"id":"local-fixture","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
              { headers: { "content-type": "text/event-stream" } },
            )
          },
        })),
        (server) => Effect.sync(() => server.stop(true)),
      )
      yield* provideTmpdirInstance(
        () => Effect.gen(function* () {
          const provider = yield* Provider.Service
          const model = yield* provider.getModel(ProviderV2.ID.openrouter, ModelV2.ID.make("audit:free"))
          const response = streamText({
            model: yield* provider.getLanguage(model),
            messages: [{ role: "user", content: "local transport fixture" }],
            maxRetries: 0,
          })
          expect(yield* Effect.promise(() => response.text)).toBe("fixture")
          expect(requests).toHaveLength(1)
          expect(requests[0].get("HTTP-Referer")).toBe(custom ? "https://example.org/my-agent" : "https://olivecode.dev")
          expect(requests[0].get("X-OpenRouter-Title")).toBe(custom ? "My Agent" : "OliveCode")
          expect(requests[0].get("X-OpenRouter-Categories")).toBe(custom ? "ide-extension" : "cli-agent")
          expect(requests[0].get("X-Custom")).toBe(custom ? "retained" : null)
        }),
        { config: { provider: { openrouter: {
          npm: "@openrouter/ai-sdk-provider",
          options: {
            apiKey: "local-test-key",
            baseURL: `http://127.0.0.1:${server.port}/v1`,
            ...(custom ? { headers: {
              "HTTP-Referer": "https://example.org/my-agent",
              "X-OpenRouter-Title": "My Agent",
              "X-OpenRouter-Categories": "ide-extension",
              "X-Custom": "retained",
            } } : {}),
          },
          models: { "audit:free": { name: "Local attribution fixture", cost: { input: 0, output: 0 }, limit: { context: 1024, output: 128 } } },
        } } } },
      )
    }),
  )
}
