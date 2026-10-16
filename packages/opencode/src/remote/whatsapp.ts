import { z } from "zod"
import { createHmac, timingSafeEqual } from "node:crypto"
import { chmod, mkdir, readFile, rename, rm } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { RemoteController, type Driver, type Messenger, type Mode } from "./controller"
import { RemoteStore } from "./store"
import type { Button, Update } from "./telegram"
import { splitText } from "./telegram"
import { clearRemotePresence, writeRemotePresence } from "@opencode-ai/core/olivecode/remote-status"

// AI-primary Business API use currently has an EEA/Brazil exception. Recheck
// Meta eligibility before public rollout; a country prefix is not account approval.
export function eligibleWhatsAppPhone(phone: string) {
  return /^[1-9]\d{6,14}$/.test(phone) && /^(30|31|32|33|34|35[12346789]|36|370|371|372|385|386|39|40|420|421|423|43|45|46|47|48|49|55)/.test(phone)
}
export const WhatsAppState = z.object({
  token: z.string().min(20).max(4096), appSecret: z.string().min(16).max(256), verifyToken: z.string().min(24).max(256),
  phoneID: z.string().regex(/^\d{5,30}$/), owner: z.string().refine(eligibleWhatsAppPhone, "Use an eligible EEA or Brazil number in international digits without +."),
  apiVersion: z.string().regex(/^v\d{2}\.0$/), lastInbound: z.number().default(0),
  seen: z.array(z.object({ id: z.string().max(256), time: z.number() })).max(4096).default([]),
})
export type WhatsAppState = z.infer<typeof WhatsAppState>
export class WhatsAppStore {
  constructor(readonly directory: string) {}
  async load() {
    const raw = await readFile(path.join(this.directory, "whatsapp.json"), "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw new Error("Could not read WhatsApp settings.")
    })
    if (!raw) return
    const result = WhatsAppState.safeParse((() => { try { return JSON.parse(raw) } catch { return undefined } })())
    if (!result.success) throw new Error("Invalid WhatsApp settings. Run setup locally again.")
    return result.data
  }
  async save(state: WhatsAppState) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 }); await chmod(this.directory, 0o700)
    const file = path.join(this.directory, "whatsapp.json")
    const temporary = file + "." + randomUUID()
    try {
      await Bun.write(temporary, JSON.stringify(WhatsAppState.parse(state)), { mode: 0o600 })
      await chmod(temporary, 0o600); await rename(temporary, file)
    } finally { await rm(temporary, { force: true }) }
  }
  disconnect() { return rm(path.join(this.directory, "whatsapp.json"), { force: true }) }
  lock() { return new RemoteStore(this.directory).lock() }
}

export class WhatsApp implements Messenger {
  constructor(readonly state: WhatsAppState, private readonly request: (input: string | URL | Request, init?: RequestInit) => Promise<Response> = fetch) {}
  private async call(endpoint: "messages" | "media", body: Record<string, unknown> | FormData) {
    if (Date.now() - this.state.lastInbound >= 24 * 60 * 60000) throw new Error("WhatsApp reply window closed. Send a new message from your paired phone.")
    const response = await this.request(`https://graph.facebook.com/${this.state.apiVersion}/${this.state.phoneID}/${endpoint}`, {
      method: "POST", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${this.state.token}`, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
      body: body instanceof FormData ? body : JSON.stringify(body),
    }).catch(() => { throw new Error("WhatsApp connection failed. No automatic send retry was made.") })
    if (!response.ok) throw new Error(`WhatsApp request failed (${response.status}). Check Meta setup and messaging eligibility.`)
    return response.json() as Promise<{ id?: string }>
  }
  async send(chat: number, text: string, buttons?: Button[][]) {
    if (String(chat) !== this.state.owner) throw new Error("Unpaired WhatsApp recipient.")
    const safe = [this.state.token, this.state.appSecret, this.state.verifyToken].reduce((value, secret) => value.split(secret).join("[redacted]"), text)
    const chunks = splitText(safe)
    for (const [index, chunk] of chunks.entries()) {
      const choices = index === chunks.length - 1 ? buttons?.flat() : undefined
      const interactive = choices?.length ? choices.length <= 3
        ? { type: "button", body: { text: chunk }, action: { buttons: choices.map(button => ({ type: "reply", reply: { id: button.callback_data, title: button.text.slice(0, 20) } })) } }
        : { type: "list", body: { text: chunk }, action: { button: "Choose", sections: [{ rows: choices.map(button => ({ id: button.callback_data, title: button.text.slice(0, 24) })) }] } }
        : undefined
      await this.call("messages", { messaging_product: "whatsapp", recipient_type: "individual", to: this.state.owner,
        ...(interactive ? { type: "interactive", interactive } : { type: "text", text: { body: chunk, preview_url: false } }) })
    }
  }
  async answer(_id: string, text: string) { await this.send(Number(this.state.owner), text) }
  async photo(chat: number, mime: string, bytes: Uint8Array) {
    if (String(chat) !== this.state.owner || !["image/png", "image/jpeg", "image/webp"].includes(mime) || bytes.length > 5 * 1024 * 1024) throw new Error("Unsupported WhatsApp capture.")
    const form = new FormData()
    form.set("messaging_product", "whatsapp"); form.set("type", mime)
    form.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), "capture.png")
    const media = await this.call("media", form)
    if (!media.id || !/^\d+$/.test(media.id)) throw new Error("WhatsApp did not accept the capture.")
    await this.call("messages", { messaging_product: "whatsapp", recipient_type: "individual", to: this.state.owner, type: "image", image: { id: media.id, caption: "OliveCode · approved capture" } })
  }
}

export function verifyWhatsAppSignature(body: Uint8Array, signature: string | null, secret: string) {
  if (!signature || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) return false
  return timingSafeEqual(Buffer.from(signature.slice(7), "hex"), createHmac("sha256", secret).update(body).digest())
}
const Incoming = z.object({ object: z.literal("whatsapp_business_account"), entry: z.array(z.object({ changes: z.array(z.object({
  field: z.string(), value: z.object({ metadata: z.object({ phone_number_id: z.string() }), messages: z.array(z.object({
    id: z.string().min(1).max(256), from: z.string(), timestamp: z.string().regex(/^\d+$/), type: z.string(),
    context: z.object({ forwarded: z.boolean().optional(), frequently_forwarded: z.boolean().optional() }).optional(),
    text: z.object({ body: z.string().max(16000) }).optional(),
    interactive: z.object({ button_reply: z.object({ id: z.string().max(256) }).optional(), list_reply: z.object({ id: z.string().max(256) }).optional() }).optional(),
  })).optional() }),
})) })) })

export function whatsAppWebhook(state: WhatsAppState, save: () => Promise<void>, handle: (update: Update) => Promise<void>, started = Math.floor(Date.now() / 1000)) {
  let serial = Promise.resolve()
  let pending = 0
  return async (request: Request) => {
    const url = new URL(request.url)
    if (url.pathname !== "/webhook") return new Response("Not found", { status: 404 })
    if (request.method === "GET") {
      const supplied = Buffer.from(url.searchParams.get("hub.verify_token") ?? "")
      const expected = Buffer.from(state.verifyToken)
      const challenge = url.searchParams.get("hub.challenge")
      return url.searchParams.get("hub.mode") === "subscribe" && supplied.length === expected.length && timingSafeEqual(supplied, expected) && challenge && /^\d{1,128}$/.test(challenge)
        ? new Response(challenge) : new Response("Forbidden", { status: 403 })
    }
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 })
    if (pending >= 16 || Number(request.headers.get("content-length")) > 65536) return new Response("Request limit", { status: 413 })
    const reader = request.body?.getReader()
    if (!reader) return new Response("Empty body", { status: 400 })
    const chunks: Uint8Array[] = []; let length = 0
    try {
      while (true) {
        const result = await reader.read()
        if (result.done) break
        length += result.value.length
        if (length > 65536) { await reader.cancel(); return new Response("Request too large", { status: 413 }) }
        chunks.push(result.value)
      }
    } catch { return new Response("Invalid body", { status: 400 }) }
    const body = Buffer.concat(chunks)
    if (!verifyWhatsAppSignature(body, request.headers.get("x-hub-signature-256"), state.appSecret)) return new Response("Forbidden", { status: 403 })
    const parsed = Incoming.safeParse((() => { try { return JSON.parse(body.toString("utf8")) } catch { return undefined } })())
    if (!parsed.success) return new Response("Invalid event", { status: 400 })
    pending++
    const delivery = serial.then(async () => {
      const now = Date.now()
      state.seen = state.seen.filter(item => now - item.time < 10 * 60000)
      for (const entry of parsed.data.entry) for (const change of entry.changes) {
        if (change.field !== "messages" || change.value.metadata.phone_number_id !== state.phoneID) continue
        for (const message of change.value.messages ?? []) {
          const date = Number(message.timestamp)
          if (message.from !== state.owner || message.context?.forwarded || message.context?.frequently_forwarded || date < started || date > Math.floor(now / 1000) + 30 || now / 1000 - date > 120 || state.seen.some(item => item.id === message.id)) continue
          if (state.seen.length >= 4096) throw new Error("WhatsApp inbox full")
          state.seen.push({ id: message.id, time: now }); state.lastInbound = now
          // Persist receipt before executing: a crash cannot replay an operation.
          await save()
          const base = { message_id: 1, date, from: { id: Number(message.from) }, chat: { id: Number(message.from), type: "private" } }
          const callback = message.type === "interactive" ? message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id : undefined
          await handle({ update_id: 0, ...(callback ? { callback_query: { id: message.id, from: base.from, message: base, data: callback } } : { message: { ...base, ...(message.type === "text" ? { text: message.text?.body } : {}) } }) })
        }
      }
    })
    serial = delivery.catch(() => {})
    try { await delivery; return new Response("OK") } catch { return new Response("Delivery failed", { status: 503 }) }
    finally { pending-- }
  }
}

export async function listenWhatsApp(store: WhatsAppStore, driver: Driver, signal: AbortSignal, options: { modes: readonly Mode[]; mode: Mode; port: number; screenshots?: boolean; presenceDirectory?: string; log: (message: string) => void }) {
  const release = await store.lock()
  let server: ReturnType<typeof Bun.serve> | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let heartbeat = Promise.resolve()
  let controller: RemoteController | undefined
  try {
    const state = await store.load()
    if (!state) throw new Error("Connect WhatsApp first: olivecode remote setup --channel whatsapp")
    const startedAt = Date.now()
    const messenger = new WhatsApp(state)
    controller = new RemoteController({ token: state.token, owner: { user: Number(state.owner), chat: Number(state.owner) } }, messenger, driver, () => store.save(state), options.modes, options.screenshots, Date.now, options.mode, "WhatsApp")
    const active = controller
    server = Bun.serve({ hostname: "127.0.0.1", port: options.port, maxRequestBodySize: 65536, idleTimeout: 15, fetch: whatsAppWebhook(state, () => store.save(state), update => active.handle(update)) })
    const presence = () => options.presenceDirectory ? writeRemotePresence(options.presenceDirectory, { pid: process.pid, updated: Date.now(), paired: state.lastInbound >= startedAt, phase: "listening", channel: "whatsapp" }) : Promise.resolve()
    await presence()
    timer = setInterval(() => { void active.expire().catch(() => {}); heartbeat = heartbeat.then(presence).catch(() => {}) }, 5000)
    options.log(`WhatsApp webhook ready locally: http://127.0.0.1:${server.port}/webhook\nConfigure your own HTTPS reverse proxy/tunnel to this endpoint in Meta. No tunnel was opened automatically.\nSend a new message from your configured phone. Keep this terminal open. Ctrl+C stops control.`)
    if (!signal.aborted) await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }))
  } finally {
    if (timer) clearInterval(timer)
    await server?.stop(true)
    await heartbeat
    try { await controller?.stop() } finally {
      try { if (options.presenceDirectory) await clearRemotePresence(options.presenceDirectory) } finally { await release() }
    }
  }
}
