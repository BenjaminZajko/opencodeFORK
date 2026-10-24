import { z } from "zod"
import { setTimeout } from "node:timers/promises"

const user = z.object({ id: z.number().int().positive(), is_bot: z.boolean().optional() })
const message = z.object({
  message_id: z.number().int(), date: z.number().int(), from: user.optional(),
  chat: z.object({ id: z.number().int(), type: z.string() }), text: z.string().optional(),
  forward_origin: z.unknown().optional(), via_bot: z.unknown().optional(),
})
export const Update = z.object({
  update_id: z.number().int().nonnegative(), message: message.optional(),
  callback_query: z.object({ id: z.string(), from: user, message: message.optional(), data: z.string().optional() }).optional(),
})
export type Update = z.infer<typeof Update>
export type Button = { text: string; callback_data: string }

export class TelegramError extends Error {
  constructor(readonly code: number, readonly retryAfter = 0) {
    super(code === 401 ? "Telegram rejected the bot token. Reconnect with a new token." : code === 409 ? "This bot is already connected elsewhere, or uses a webhook. Stop the other connection first." : `Telegram request failed (${code}).`)
  }
}

export class Telegram {
  constructor(private readonly token: string, private readonly request: typeof fetch = fetch) {
    if (!/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(token)) throw new Error("Enter the bot token supplied by Telegram's BotFather.")
  }
  async call<T>(method: string, body: Record<string, unknown> | FormData, signal?: AbortSignal, attempt = 0): Promise<T> {
    // Never propagate fetch errors: they can include the credential-bearing URL.
    const response = await this.request(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST", signal: AbortSignal.any([AbortSignal.timeout(method === "getUpdates" ? 40000 : 15000), ...(signal ? [signal] : [])]),
      ...(body instanceof FormData ? { body } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    }).catch(() => { throw new TelegramError(0) })
    const parsed = z.object({ ok: z.boolean(), result: z.unknown().optional(), error_code: z.number().optional(), parameters: z.object({ retry_after: z.number().optional() }).optional() })
      .safeParse(await response.json().catch(() => undefined))
    if (!parsed.success) throw new TelegramError(response.status)
    if (!parsed.data.ok) {
      const code = parsed.data.error_code ?? response.status
      const retry = parsed.data.parameters?.retry_after ?? 0
      if (code === 429 && attempt < 2 && retry > 0 && retry <= 30) {
        await setTimeout(retry * 1000, undefined, { signal })
        return this.call(method, body, signal, attempt + 1)
      }
      throw new TelegramError(code, retry)
    }
    return parsed.data.result as T
  }
  async updates(offset: number, signal?: AbortSignal, timeout = 25) {
    return z.array(Update).parse(await this.call("getUpdates", { offset, timeout, allowed_updates: ["message", "callback_query"] }, signal))
  }
  async send(chat: number, text: string, buttons?: Button[][]) {
    const chunks = splitText(text)
    for (const [index, chunk] of chunks.entries()) {
      await this.call("sendMessage", { chat_id: chat, text: chunk, link_preview_options: { is_disabled: true },
        ...(buttons && index === chunks.length - 1 ? { reply_markup: { inline_keyboard: buttons } } : {}) })
    }
  }
  async photo(chat: number, mime: string, bytes: Uint8Array) {
    const form = new FormData()
    form.set("chat_id", String(chat)); form.set("caption", "OliveCode · approved capture")
    form.set("photo", new Blob([new Uint8Array(bytes)], { type: mime }), "capture.png")
    await this.call("sendPhoto", form)
  }
  answer(id: string, text: string) { return this.call("answerCallbackQuery", { callback_query_id: id, text: text.slice(0, 180) }) }
}

export function splitText(text: string) {
  const points = Array.from(text || "No text response was provided.")
  const chunks: string[] = []
  // Bound UTF-16 units as well as code points; never split a surrogate pair.
  for (let i = 0; i < points.length;) {
    let chunk = ""
    while (i < points.length && chunk.length + points[i]!.length <= 3500) chunk += points[i++]
    chunks.push(chunk)
  }
  return chunks
}
