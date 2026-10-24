import { expect, test } from "bun:test"
import path from "node:path"
import { listenRemote } from "../../src/remote/listener"
import { RemoteStore } from "../../src/remote/store"
import { Telegram } from "../../src/remote/telegram"
import { tmpdir } from "../fixture/fixture"

test("the polling listener persists offsets, handles Stop during work, and never replays consumed tasks", async () => {
  await using tmp = await tmpdir()
  const store = new RemoteStore(path.join(tmp.path, "remote"))
  const token = "123456:abcdefghijklmnopqrstuvwxyz123456"
  await store.save({ token, botID: 123456, username: "olive_test_bot", owner: { user: 10, chat: 10 }, offset: 0 })
  const sent: string[] = []
  let runs = 0
  let stops = 0
  const driver = { create: async () => ({
    id: "ses_listener", approve: async () => {}, stop: async () => { stops++ },
    run: async (_text: string, signal: AbortSignal) => { runs++; return new Promise<string>((resolve) => { signal.addEventListener("abort", () => resolve("Stopped"), { once: true }) }) },
  }) }
  for (const restart of [false, true]) {
    const abort = new AbortController()
    let polls = 0
    const request = (async (input: RequestInfo | URL, options?: RequestInit) => {
      const method = String(input).split("/").at(-1)
      const body = JSON.parse(String(options?.body))
      if (method === "getWebhookInfo") return Response.json({ ok: true, result: { url: "" } })
      if (method === "sendMessage") { sent.push(body.text); return Response.json({ ok: true, result: true }) }
      if (method !== "getUpdates") throw new Error("Unexpected fixture method")
      polls++
      if (polls > (restart ? 1 : 3)) { abort.abort(); return Response.json({ ok: true, result: [] }) }
      const text = restart ? "Build" : ["Build", "/status", "/stop"][polls - 1]!
      return Response.json({ ok: true, result: [{ update_id: restart ? 1 : polls, message: {
        message_id: polls, date: Math.floor(Date.now() / 1000), from: { id: 10 }, chat: { id: 10, type: "private" }, text,
      } }] })
    }) as typeof fetch
    await listenRemote(store, driver, abort.signal, { modes: ["coding"], log: () => {}, telegram: new Telegram(token, request), presenceDirectory: tmp.path })
    expect(await Bun.file(path.join(tmp.path, "remote-presence.json")).exists()).toBe(false)
  }
  expect(runs).toBe(1)
  expect(stops).toBe(1)
  expect(sent.some((text) => text.includes("Stopped"))).toBe(true)
  expect((await store.load())?.offset).toBe(4)
  const release = await store.lock()
  await release()
})
