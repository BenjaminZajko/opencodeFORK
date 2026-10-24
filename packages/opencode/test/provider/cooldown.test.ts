import { SessionV1 } from "@opencode-ai/core/v1/session"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { ProviderCooldown } from "@/provider/cooldown"
import { Provider } from "@/provider/provider"
import { Session } from "@/session/session"
import { LLM } from "@/session/llm"
import { MessageV2 } from "@/session/message-v2"
import { SessionProcessor } from "@/session/processor"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { SessionStatus } from "@/session/status"
import { SessionSummary } from "@/session/summary"
import { Database } from "@opencode-ai/core/database/database"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { describe, expect } from "bun:test"
import { Effect, Exit, Fiber, Layer, Scope } from "effect"
import path from "path"
import type { Agent } from "@/agent/agent"
import { provideTmpdirServer, TestInstance } from "../fixture/fixture"
import { resetDatabase } from "../fixture/db"
import { pollWithTimeout, testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"
import { httpApiLayer, request } from "../server/httpapi-layer"

const providerID = ProviderV2.ID.make("ollama")
const modelID = ModelV2.ID.make("test-model")

const it = testEffect(LayerNode.compile(ProviderCooldown.node))

describe("provider.cooldown store", () => {
  it.instance("records a cooldown on markDown and lists it", () =>
    Effect.gen(function* () {
      const cooldowns = yield* ProviderCooldown.Service
      const downUntil = Date.now() + 60_000
      yield* cooldowns.markDown({ providerID, modelID, downUntil, reason: "rate limited" })
      expect(yield* cooldowns.list()).toEqual([{ providerID, modelID, downUntil, reason: "rate limited" }])
    }),
  )

  it.instance("drops expired cooldowns from list", () =>
    Effect.gen(function* () {
      const cooldowns = yield* ProviderCooldown.Service
      yield* cooldowns.markDown({ providerID, modelID, downUntil: Date.now() - 1000, reason: "stale" })
      yield* cooldowns.markDown({
        providerID: ProviderV2.ID.make("other"),
        modelID: ModelV2.ID.make("other-model"),
        downUntil: Date.now() + 60_000,
        reason: "fresh",
      })
      const active = yield* cooldowns.list()
      expect(active.map((entry) => String(entry.providerID))).toEqual(["other"])
    }),
  )

  it.instance("latest markDown wins for the same provider+model", () =>
    Effect.gen(function* () {
      const cooldowns = yield* ProviderCooldown.Service
      yield* cooldowns.markDown({ providerID, modelID, downUntil: Date.now() + 1000, reason: "first" })
      const downUntil = Date.now() + 60_000
      yield* cooldowns.markDown({ providerID, modelID, downUntil, reason: "second" })
      expect(yield* cooldowns.list()).toEqual([{ providerID, modelID, downUntil, reason: "second" }])
    }),
  )
})

// End-to-end: a 429 during session processing records a cooldown for the
// failed provider+model, keyed the same way the retry-after parsing in
// session/retry.ts scopes the wait.
const summary = Layer.succeed(
  SessionSummary.Service,
  SessionSummary.Service.of({
    summarize: () => Effect.void,
    diff: () => Effect.succeed([]),
    computeDiff: () => Effect.succeed([]),
  }),
)

const cfg = {
  provider: {
    ollama: {
      name: "Test",
      id: "ollama",
      env: [],
      npm: "@ai-sdk/openai-compatible",
      models: {
        "test-model": {
          id: "test-model",
          name: "Test Model",
          attachment: false,
          reasoning: false,
          temperature: false,
          tool_call: true,
          release_date: "2025-01-01",
          limit: { context: 100000, output: 10000 },
          cost: { input: 0, output: 0 },
          options: {},
        },
      },
      options: {
        apiKey: "test-key",
        baseURL: "http://localhost:1/v1",
      },
    },
  },
}

function providerCfg(url: string) {
  return {
    ...cfg,
    provider: {
      ...cfg.provider,
      ollama: {
        ...cfg.provider.ollama,
        options: {
          ...cfg.provider.ollama.options,
          baseURL: url,
        },
      },
    },
  }
}

function agent(): Agent.Info {
  return {
    name: "build",
    mode: "primary",
    options: {},
    permission: [{ permission: "*", pattern: "*", action: "allow" }],
  }
}

const ref = { providerID, modelID }

const user = Effect.fn("TestSession.user")(function* (sessionID: SessionID, text: string) {
  const session = yield* Session.Service
  const msg = yield* session.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID,
    agent: "build",
    model: ref,
    time: { created: Date.now() },
  })
  yield* session.updatePart({
    id: PartID.ascending(),
    messageID: msg.id,
    sessionID,
    type: "text",
    text,
  })
  return msg
})

const assistant = Effect.fn("TestSession.assistant")(function* (
  sessionID: SessionID,
  parentID: MessageID,
  root: string,
) {
  const session = yield* Session.Service
  const msg: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    sessionID,
    mode: "build",
    agent: "build",
    path: { cwd: root, root },
    cost: 0,
    tokens: {
      total: 0,
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
    modelID: ref.modelID,
    providerID: ref.providerID,
    parentID,
    time: { created: Date.now() },
    finish: "end_turn",
  }
  yield* session.updateMessage(msg)
  return msg
})

const root = LayerNode.group([
  SessionProcessor.node,
  Session.node,
  SessionProjector.node,
  Provider.node,
  ProviderCooldown.node,
  Database.node,
  EventV2Bridge.node,
  SessionStatus.node,
  CrossSpawnSpawner.node,
])
const replacements = [
  [SessionSummary.node, summary],
  [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
] as const
const env = LayerNode.compile(
  LayerNode.group([root, LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] })]),
  replacements,
)

const itProcessor = testEffect(env)

describe("provider.cooldown write-on-429", () => {
  itProcessor.live("session.processor records a cooldown when the model is rate limited", () =>
    provideTmpdirServer(
      ({ dir, llm }) =>
        Effect.gen(function* () {
          const session = yield* Session.Service
          const provider = yield* Provider.Service
          const processors = yield* SessionProcessor.Service
          const cooldowns = yield* ProviderCooldown.Service

          yield* llm.error(429, { error: { message: "rate limit exceeded" } })
          yield* llm.text("recovered")

          const chat = yield* session.create({})
          const parent = yield* user(chat.id, "cooldown")
          const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
          const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
          const handle = yield* processors.create({
            assistantMessage: msg,
            sessionID: chat.id,
            model: mdl,
          })

          const scope = yield* Scope.make()
          const fiber = yield* handle.process({
            user: {
              id: parent.id,
              sessionID: chat.id,
              role: "user",
              time: parent.time,
              agent: parent.agent,
              model: { providerID: ref.providerID, modelID: ref.modelID },
            } satisfies SessionV1.User,
            sessionID: chat.id,
            model: mdl,
            agent: agent(),
            system: [],
            messages: [{ role: "user", content: "cooldown" }],
            tools: {},
          }).pipe(Effect.forkIn(scope))

          // The cooldown only lives until the scheduled retry fires, so
          // observe it mid-retry instead of after the run completes (by
          // then downUntil has elapsed and the entry is pruned).
          const active = yield* pollWithTimeout(
            Effect.gen(function* () {
              const entries = yield* cooldowns.list()
              return entries.length > 0 ? entries : undefined
            }),
            "cooldown never recorded during 429 retry",
          )
          expect(active.length).toBe(1)
          expect(active[0].providerID).toEqual(providerID)
          expect(active[0].modelID).toEqual(modelID)
          expect(active[0].downUntil).toBeGreaterThan(Date.now())
          expect(typeof active[0].reason).toBe("string")

          const value = yield* Fiber.join(fiber)
          yield* Scope.close(scope, Exit.void)
          expect(value).toBe("continue")
          expect(yield* llm.calls).toBe(2)
        }),
      { config: (url) => providerCfg(url) },
    ),
  )
})

// HTTP exposure: GET /provider/cooldowns serves the store's current state
// (empty when nothing is cooling down).
const testStateLayer = Layer.effectDiscard(
  Effect.acquireRelease(
    Effect.promise(() => resetDatabase()),
    () => Effect.promise(() => resetDatabase()),
  ),
)

const itHttp = testEffect(Layer.mergeAll(testStateLayer, LayerNode.compile(FSUtil.node), httpApiLayer))

describe("provider.cooldown http", () => {
  itHttp.instance(
    "serves active cooldowns",
    Effect.gen(function* () {
      const directory = (yield* TestInstance).directory
      const response = yield* request("/provider/cooldowns", {
        headers: { "x-opencode-directory": directory },
      })
      expect(response.status).toBe(200)
      expect(yield* response.json).toEqual([])
    }),
    { config: { formatter: false, lsp: false } },
  )
})
