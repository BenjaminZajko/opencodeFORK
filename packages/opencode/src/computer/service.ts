import { backgroundMacHost } from "./background-mac"
import { Context, Effect, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { InstanceState } from "@/effect/instance-state"
import { ComputerBrowser } from "./browser"
import { ComputerDesktop } from "./desktop"

export interface Interface {
  readonly claimAction: (session: string, message: string) => Effect.Effect<void, Error>
  readonly perform: (session: string, request: string, input: ComputerBrowser.Action, signal: AbortSignal, background?: boolean) => Effect.Effect<unknown, Error>
  readonly stop: (session: string) => Effect.Effect<void>
  readonly desktop: (session: string, request: string, input: ComputerDesktop.Action, signal: AbortSignal, background?: boolean) => Effect.Effect<ComputerDesktop.Result, Error>
  readonly holdDesktop: (session: string, request: string, background?: boolean) => Effect.Effect<() => void, Error>
}

export class Service extends Context.Service<Service, Interface>()("@olivecode/Computer") {}

const layer = Layer.effect(Service, Effect.gen(function* () {
  const state = yield* InstanceState.make(() => Effect.gen(function* () {
    const browsers = new Map<string, { request: string; background: boolean; browser: ComputerBrowser.Browser }>()
    const desktops = new Map<string, { request: string; background: boolean; desktop: ComputerDesktop.Desktop }>()
    const actions = new Map<string, string>()
    yield* Effect.addFinalizer(() => Effect.promise(async () => {
      await Promise.all([...browsers.values()].map((entry) => entry.browser.close()))
      browsers.clear()
      for (const entry of desktops.values()) entry.desktop.close()
      desktops.clear()
      actions.clear()
    }))
    return { browsers, desktops, actions }
  }))
  const getDesktop = Effect.fn("Computer.getDesktop")(function* (session: string, request: string, background = false) {
    const { desktops } = yield* InstanceState.get(state)
    let entry = desktops.get(session)
    if (!entry || entry.request !== request || entry.background !== background) {
      entry?.desktop.close()
      entry = { request, background, desktop: new ComputerDesktop.Desktop(undefined, undefined, background ? { host: backgroundMacHost() } : undefined) }
      desktops.set(session, entry)
    }
    return entry.desktop
  })
  return Service.of({
    claimAction: Effect.fn("Computer.claimAction")(function* (session, message) {
      const { actions } = yield* InstanceState.get(state)
      if (actions.get(session) === message) return yield* Effect.fail(new Error("Only one computer action is allowed per assistant turn, across browser and desktop. This extra action was not executed. Read the first result before choosing the next action."))
      actions.set(session, message)
    }),
    holdDesktop: Effect.fn("Computer.holdDesktop")(function* (session, request, background = false) {
      const desktop = yield* getDesktop(session, request, background)
      return yield* Effect.try({ try: () => desktop.hold(), catch: (error) => error instanceof Error ? error : new Error(String(error)) })
    }),
    perform: Effect.fn("Computer.perform")(function* (session, request, input, signal, background = false) {
      const { browsers } = yield* InstanceState.get(state)
      let entry = browsers.get(session)
      if (input.action === "open" && (!entry || entry.request !== request || entry.background !== background || entry.browser.stopped)) {
        const previous = entry
        if (previous && previous.background !== background) yield* Effect.promise(() => previous.browser.close())
        const browser = entry && entry.background === background && !entry.browser.stopped ? entry.browser : new ComputerBrowser.Browser({ headless: background })
        browser.newTask()
        entry = { request, background, browser }
        browsers.set(session, entry)
      }
      if (!entry || entry.background !== background) return yield* Effect.fail(new Error("Open the browser first in the selected mode."))
      const browser = entry.browser
      return yield* Effect.tryPromise({ try: () => browser.perform(input, signal), catch: (error) => error instanceof Error ? error : new Error(String(error)) }).pipe(
        Effect.onInterrupt(() => Effect.promise(() => browser.close())),
        Effect.tapError(() => input.action === "open" ? Effect.promise(() => browser.close()) : Effect.void),
      )
    }),
    desktop: Effect.fn("Computer.desktop")(function* (session, request, input, signal, background = false) {
      const desktop = yield* getDesktop(session, request, background)
      return yield* Effect.tryPromise({ try: () => desktop.perform(input, signal), catch: (error) => error instanceof Error ? error : new Error(String(error)) }).pipe(
        Effect.onInterrupt(() => Effect.sync(() => desktop.close())),
      )
    }),
    stop: Effect.fn("Computer.stop")(function* (session) {
      const { browsers, desktops } = yield* InstanceState.get(state)
      desktops.get(session)?.desktop.close()
      const entry = browsers.get(session)
      if (entry) yield* Effect.promise(() => entry.browser.close())
    }),
  })
}))

export const node = LayerNode.make({ service: Service, layer, deps: [] })
export * as Computer from "./service"
