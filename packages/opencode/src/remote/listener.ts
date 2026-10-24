import { setTimeout } from "node:timers/promises"
import { RemoteController, type Mode } from "./controller"
import { RemoteStore } from "./store"
import { Telegram, TelegramError } from "./telegram"
import type { Driver } from "./controller"
import { writeRemotePresence, clearRemotePresence } from "@opencode-ai/core/olivecode/remote-status"

export async function listenRemote(store: RemoteStore, driver: Driver, signal: AbortSignal, options: {
  modes: readonly Mode[]; mode?: Mode; screenshots?: boolean; log: (message: string) => void; telegram?: Telegram; presenceDirectory?: string
}) {
  if (options.mode && !options.modes.includes(options.mode)) throw new Error("Initial Remote mode must be enabled locally.")
  const release = await store.lock()
  const state = await store.load().catch(async (error) => { await release(); throw error })
  if (!state) { await release(); throw new Error("Connect Telegram first: olivecode remote setup") }
  const telegram = options.telegram ?? new Telegram(state.token)
  const controller = new RemoteController(state, telegram, driver, () => store.save(state), options.modes, options.screenshots, Date.now, options.mode)
  let phase: "listening" | "reconnecting" = "listening"
  const presence = () => options.presenceDirectory ? writeRemotePresence(options.presenceDirectory, { pid: process.pid, updated: Date.now(), paired: !!state.owner, phase }) : Promise.resolve()
  let heartbeat = Promise.resolve()
  const timer = setInterval(() => { heartbeat = heartbeat.then(presence).catch(() => {}) }, 10000)
  const expire = setInterval(() => { void controller.expire().catch(() => {}) }, 5000)
  let failures = 0
  try {
    const webhook = await telegram.call<{ url: string }>("getWebhookInfo", {}, signal)
    if (webhook.url) throw new Error("This bot has a webhook configured. Use a dedicated BotFather bot for OliveCode Remote.")
    await presence()
    options.log(`\nREADY · @${state.username}\nKeep this terminal open and your computer awake.`)
    options.log(`Enabled modes: ${options.modes.join(", ")}. Captures to Telegram: ${options.screenshots ? "enabled, with approval" : "off"}.`)
    if (controller.pairCode) options.log(`\nPAIR YOUR PHONE\n1. Open https://t.me/${state.username}\n2. Send this exact message:\n\n   /pair ${controller.pairCode}\n\nCode expires in 10 minutes. Then send your task.`)
    if (state.owner) options.log(`\nPHONE\nOpen https://t.me/${state.username} and send your task.\n/mode changes what it can do · /stop ends work.`)
    while (!signal.aborted) {
      try {
        const updates = await telegram.updates(state.offset, signal)
        if (phase !== "listening") { phase = "listening"; await presence() }
        for (const update of updates) {
          if (signal.aborted) break
          if (update.update_id < state.offset) continue
          // Acknowledge durably before admission. A crash never replays an operation.
          state.offset = update.update_id + 1
          await store.save(state)
          await controller.handle(update)
          await presence()
        }
        failures = 0
      } catch (error) {
        if (signal.aborted) break
        if (!(error instanceof TelegramError)) throw error
        if ([401, 403, 409].includes(error.code)) throw error
        failures++
        phase = "reconnecting"; await presence()
        if (failures === 1) options.log("Telegram connection interrupted. Reconnecting; no task will be replayed.")
        await setTimeout(Math.min(30000, Math.max(error.retryAfter * 1000, 1000 * 2 ** Math.min(failures, 5))), undefined, { signal }).catch(() => {})
      }
    }
  } finally {
    clearInterval(expire)
    clearInterval(timer)
    await heartbeat
    try { await controller.stop() } finally {
      try { if (options.presenceDirectory) await clearRemotePresence(options.presenceDirectory) } finally { await release() }
    }
  }
}
