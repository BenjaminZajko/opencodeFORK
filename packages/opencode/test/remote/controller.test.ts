import { expect, test } from "bun:test"
import { RemoteController, type Hooks, type Task } from "../../src/remote/controller"
import type { State } from "../../src/remote/store"
import type { Button, Update } from "../../src/remote/telegram"

function fixture(paired = true, screenshots = false, now = Date.now) {
  const state: State = { token: "123456:abcdefghijklmnopqrstuvwxyz123456", botID: 123456, username: "olive_test_bot", offset: 0, ...(paired ? { owner: { user: 10, chat: 10 } } : {}) }
  const sent: { text: string; buttons?: Button[][] }[] = []
  const answers: string[] = []
  const prompts: string[] = []
  const agents: string[] = []
  const permissions: [string, boolean][] = []
  const photos: Uint8Array[] = []
  let hooks: Hooks
  let stopped = 0
  let saves = 0
  let finish!: (value: string) => void
  const task: Task = {
    id: "ses_remote_test", approve: async (id, allow) => { permissions.push([id, allow]) }, stop: async () => { stopped++; finish?.("Stopped") },
    run: async (text, signal, received) => {
      hooks = received; prompts.push(text)
      return new Promise<string>((resolve) => { finish = resolve; signal.addEventListener("abort", () => resolve("Cancelled"), { once: true }) })
    },
  }
  const controller = new RemoteController(state, {
    send: async (_chat, text, buttons) => { sent.push({ text, buttons }) }, answer: async (_id, text) => { answers.push(text) },
    photo: async (_chat, _mime, bytes) => { photos.push(bytes) },
  }, { create: async (agent) => { agents.push(agent); return task } }, async () => { saves++ }, ["coding", "browser"], screenshots, now)
  let update = 0
  const message = (text: string, user = 10, chat = 10, extra = {}): Update => ({ update_id: ++update, message: { message_id: update, date: Math.floor(Date.now() / 1000), chat: { id: chat, type: "private" }, from: { id: user }, text, ...extra } })
  const callback = (data: string, user = 10): Update => ({ update_id: ++update, callback_query: { id: String(update), data, from: { id: user }, message: { message_id: update, date: Math.floor(Date.now() / 1000), chat: { id: 10, type: "private" }, from: { id: 123456, is_bot: true } } } })
  const ready = async () => { for (let i = 0; i < 20 && !prompts.length; i++) await Promise.resolve() }
  return { controller, state, sent, answers, prompts, agents, permissions, photos, message, callback, ready, hooks: () => hooks!, finish: (value: string) => finish(value), stopped: () => stopped, saves: () => saves }
}

test("90-minute approval covers later operations and tasks but expires exactly without extending itself", async () => {
  let now = Date.now()
  const f = fixture(true, false, () => now)
  await f.controller.handle(f.message("Build")); await f.ready()
  await f.hooks().permission({ id: "first", permission: "edit", patterns: ["hello.ts"] })
  const key = f.sent.at(-1)!.buttons!.flat().find((button) => button.callback_data.startsWith("allow90:"))!.callback_data
  await f.controller.handle(f.callback(key, 99))
  expect(f.permissions).toEqual([])
  await f.controller.handle(f.callback(key))
  expect(f.permissions).toEqual([["first", true]])
  now += 89 * 60000
  await f.hooks().permission({ id: "second", permission: "bash", patterns: ["bun test"] })
  expect(f.permissions.at(-1)).toEqual(["second", true])
  const done = f.controller.done; f.finish("Done"); await done
  await f.controller.handle(f.message("Next")); await f.ready()
  for (let i = 0; i < 20; i++) await Promise.resolve()
  await f.hooks().permission({ id: "third", permission: "edit", patterns: ["next.ts"] })
  expect(f.permissions.at(-1)).toEqual(["third", true])
  now += 60000
  await f.controller.expire()
  await f.hooks().permission({ id: "expired", permission: "read", patterns: ["hello.ts"] })
  expect(f.permissions.some(([id]) => id === "expired")).toBe(false)
  expect(f.sent.at(-1)?.text).toContain("Approval needed")
  await f.controller.stop()
})

test("timed approval never auto-approves a capture or revives stale buttons", async () => {
  const f = fixture(true, true)
  await f.controller.handle(f.message("Build")); await f.ready()
  await f.hooks().permission({ id: "first", permission: "desktop", patterns: ["activate"] })
  const key = f.sent.at(-1)!.buttons!.flat().find((button) => button.callback_data.startsWith("allow90:"))!.callback_data
  await f.controller.handle(f.callback(key))
  await f.hooks().permission({ id: "capture", permission: "desktop_screenshot", patterns: ["look"] })
  expect(f.permissions).toEqual([["first", true]])
  expect(f.sent.at(-1)!.buttons!.flat().some((button) => button.callback_data.startsWith("allow90:"))).toBe(false)
  const capture = f.sent.at(-1)!.buttons![0]![0]!.callback_data.split(":")[1]
  await f.controller.handle(f.callback(`allow90:${capture}`))
  expect(f.permissions).toEqual([["first", true]])
  await f.controller.handle(f.callback(key))
  expect(f.answers.at(-1)).toContain("expired")
  await f.controller.stop()
})

test("Stop, Pause, new chat, mode change and lock revoke timed approval", async () => {
  for (const command of ["/stop", "/pause", "/new", "/mode browser", "/lock"]) {
    const f = fixture()
    await f.controller.handle(f.message("Build")); await f.ready()
    await f.hooks().permission({ id: "first", permission: "edit", patterns: ["hello.ts"] })
    await f.controller.handle(f.callback(f.sent.at(-1)!.buttons!.flat().find((button) => button.callback_data.startsWith("allow90:"))!.callback_data))
    if (["/new", "/mode browser"].includes(command)) { const done = f.controller.done; f.finish("Done"); await done }
    await f.controller.handle(f.message(command))
    await f.controller.handle(f.message("/status"))
    expect(f.sent.at(-1)?.text).toContain("Approval: ask each time")
    await f.controller.stop()
  }
})

test("mode buttons select the actual matching agent and cannot enable a locally disabled mode", async () => {
  const f = fixture()
  await f.controller.handle(f.message("/mode"))
  expect(f.sent.at(-1)?.buttons?.flat().map((button) => button.callback_data)).toEqual(["mode:coding", "mode:browser"])
  await f.controller.handle(f.callback("mode:visible"))
  expect(f.controller.mode).toBe("coding")
  await f.controller.handle(f.callback("mode:browser", 99))
  expect(f.controller.mode).toBe("coding")
  await f.controller.handle(f.callback("mode:browser"))
  await f.controller.handle(f.message("Open example.com")); await f.ready()
  expect(f.agents).toEqual(["computer_background"])
  await f.controller.stop()
})

test("only the exact local pairing code binds a private human account", async () => {
  const f = fixture(false)
  await f.controller.handle(f.message("/pair wrong"))
  await f.controller.handle(f.message(`/pair ${f.controller.pairCode}`, 20, -50, { chat: { id: -50, type: "group" } }))
  await f.controller.handle(f.message(`/pair ${f.controller.pairCode}`, 20, 20, { forward_origin: { type: "user" } }))
  expect(f.state.owner).toBeUndefined()
  await f.controller.handle(f.message(`/pair ${f.controller.pairCode}`, 20, 20))
  expect(f.state.owner).toEqual({ user: 20, chat: 20 })
  expect(f.saves()).toBe(1)
  expect(f.controller.pairCode).toBeUndefined()
})

test("strangers, groups and forwarded prompts cannot start or stop tasks", async () => {
  const f = fixture()
  await f.controller.handle(f.message("Build something", 11))
  await f.controller.handle(f.message("Build something", 10, 11))
  await f.controller.handle(f.message("Build something", 10, 10, { via_bot: {} }))
  expect(f.prompts).toEqual([])
  await f.controller.handle(f.message("Build a page")); await f.ready()
  await f.controller.handle(f.message("/stop", 11))
  expect(f.controller.busy).toBe(true)
  expect(f.stopped()).toBe(0)
  await f.controller.stop()
})

test("a busy remote task rejects new work and stop aborts before another task starts", async () => {
  const f = fixture()
  await f.controller.handle(f.message("First")); await f.ready()
  await f.controller.handle(f.message("Second"))
  expect(f.prompts).toEqual(["First"])
  expect(f.sent.at(-1)?.text).toContain("not queued")
  await f.controller.handle(f.message("/status"))
  expect(f.sent.at(-1)?.text).toContain("Working")
  await f.controller.handle(f.message("/stop"))
  expect(f.stopped()).toBe(1)
  expect(f.controller.busy).toBe(false)
})

test("approval callbacks are bound to the owner and exact active request, once only", async () => {
  const f = fixture()
  await f.controller.handle(f.message("Build")); await f.ready()
  await f.hooks().permission({ id: "per_one", permission: "edit", patterns: ["hello.ts"] })
  const button = f.sent.at(-1)!.buttons![0]![0]!
  await f.controller.handle(f.callback(button.callback_data, 99))
  expect(f.permissions).toEqual([])
  await f.controller.handle(f.callback(button.callback_data))
  await f.controller.handle(f.callback(button.callback_data))
  expect(f.permissions).toEqual([["per_one", true]])
  expect(f.answers.at(-1)).toContain("expired")
  await f.controller.stop()
})

test("stopping denies pending permissions and old buttons cannot affect the next task", async () => {
  const f = fixture()
  await f.controller.handle(f.message("Build")); await f.ready()
  await f.hooks().permission({ id: "per_one", permission: "bash", patterns: ["a command"] })
  const data = f.sent.at(-1)!.buttons![0]![0]!.callback_data
  await f.controller.handle(f.message("/stop"))
  await f.controller.handle(f.callback(data))
  expect(f.permissions).toEqual([["per_one", false]])
})

test("pause requires explicit resume and unavailable computer modes stay disabled", async () => {
  const f = fixture()
  await f.controller.handle(f.message("/pause"))
  await f.controller.handle(f.message("Do work"))
  expect(f.prompts).toEqual([])
  await f.controller.handle(f.message("/mode visible"))
  expect(f.controller.mode).toBe("coding")
  await f.controller.handle(f.message("/mode browser"))
  expect(f.controller.mode).toBe("browser")
  await f.controller.handle(f.message("/new"))
  await f.controller.handle(f.message("Fresh")); await f.ready()
  expect(f.prompts).toEqual(["Fresh"])
  await f.controller.stop()
})

test("old queued tasks are not executed after reconnect", async () => {
  const f = fixture()
  await f.controller.handle(f.message("Old task", 10, 10, { date: Math.floor(Date.now() / 1000) - 300 }))
  expect(f.prompts).toEqual([])
  expect(f.sent.at(-1)?.text).toContain("not executed")
})

test("results redact the bot token and can be delivered again without rerunning work", async () => {
  const f = fixture()
  await f.controller.handle(f.message("Build")); await f.ready()
  const done = f.controller.done
  f.finish(`Done ${f.state.token}`); await done
  expect(f.sent.at(-1)?.text).toBe("Done [redacted]")
  await f.controller.handle(f.message("/result"))
  expect(f.sent.at(-1)?.text).toBe("Done [redacted]")
  expect(f.prompts).toHaveLength(1)
})

test("capture forwarding is opt-in and disabled by default", async () => {
  for (const enabled of [false, true]) {
    const f = fixture(true, enabled)
    await f.controller.handle(f.message("Look")); await f.ready()
    await f.hooks().photo("image/png", new Uint8Array([1, 2]))
    expect(f.photos.length).toBe(enabled ? 1 : 0)
    await f.controller.stop()
  }
})
