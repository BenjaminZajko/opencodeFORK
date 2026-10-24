import { expect, test } from "bun:test"
import { Telegram, TelegramError, splitText } from "../../src/remote/telegram"
import { RemoteStore } from "../../src/remote/store"
import { tmpdir } from "../fixture/fixture"
import { stat, writeFile } from "node:fs/promises"
import path from "node:path"

const token = "123456:abcdefghijklmnopqrstuvwxyz123456"

test("Telegram posts structured data, splits Unicode safely and disables link previews", async () => {
  const received: { url: string; body: Record<string, unknown> }[] = []
  const request = (async (input: RequestInfo | URL, options?: RequestInit) => {
    received.push({ url: String(input), body: JSON.parse(String(options?.body)) })
    return Response.json({ ok: true, result: true })
  }) as typeof fetch
  const text = "🫒".repeat(4000)
  await new Telegram(token, request).send(10, text)
  expect(received.length).toBe(3)
  expect(received.map((request) => request.body.text).join("")).toBe(text)
  expect(received[0]!.body.link_preview_options).toEqual({ is_disabled: true })
  for (const chunk of splitText(text)) expect(chunk.length).toBeLessThanOrEqual(3500)
})

test("fetch errors never expose a Telegram credential or URL", async () => {
  const request = (async () => { throw new Error(`Failed https://api.telegram.org/bot${token}/getMe`) }) as unknown as typeof fetch
  const error = await new Telegram(token, request).call("getMe", {}).catch((error: Error) => error)
  expect(error).toBeInstanceOf(TelegramError)
  expect(String(error)).not.toContain(token)
})

test("invalid tokens and API authentication errors fail without leaking secrets", async () => {
  expect(() => new Telegram("not a token")).toThrow("BotFather")
  const request = (async () => Response.json({ ok: false, error_code: 401, description: token })) as unknown as typeof fetch
  await expect(new Telegram(token, request).call("getMe", {})).rejects.toThrow("rejected the bot token")
})

test("saved credentials are private, survive restart, and malformed JSON never leaks token fragments", async () => {
  await using tmp = await tmpdir()
  const store = new RemoteStore(path.join(tmp.path, "remote"))
  await store.save({ token, botID: 123456, username: "olive_test_bot", offset: 14, owner: { user: 10, chat: 10 } })
  expect((await store.load())?.offset).toBe(14)
  if (process.platform !== "win32") expect((await stat(path.join(store.directory, "telegram.json"))).mode & 0o777).toBe(0o600)
  await writeFile(path.join(store.directory, "telegram.json"), `{${token}`)
  const error = await store.load().catch((error: Error) => error)
  expect(String(error)).not.toContain(token)
})

test("only one listener can own the connection and release permits restarting", async () => {
  await using tmp = await tmpdir()
  const store = new RemoteStore(path.join(tmp.path, "remote"))
  const release = await store.lock()
  await expect(store.lock()).rejects.toThrow("already running")
  await release()
  const second = await store.lock()
  await second()
})
