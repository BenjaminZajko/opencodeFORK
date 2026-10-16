import { randomBytes, timingSafeEqual } from "node:crypto"
import type { Button, Update } from "./telegram"
import type { State } from "./store"

export const Modes = { coding: "build", browser: "computer_background", mac: "computer_background_mac", visible: "computer" } as const
export const ModeLabels = { coding: "Coding · project files", browser: "Background browser", mac: "Background Mac · isolated", visible: "Mac apps + browser · visible" } as const
export type Mode = keyof typeof Modes
export type Permission = { id: string; permission: string; patterns: string[]; metadata?: Record<string, unknown> }
export type Hooks = {
  progress: (text: string) => Promise<void>
  permission: (request: Permission) => Promise<void>
  photo: (mime: string, bytes: Uint8Array) => Promise<void>
}
export type Task = { id: string; run: (text: string, signal: AbortSignal, hooks: Hooks) => Promise<string>; stop: () => Promise<void>; approve: (id: string, allow: boolean) => Promise<void> }
export type Driver = { create: (agent: string, session?: string) => Promise<Task> }
export type Messenger = { send: (chat: number, text: string, buttons?: Button[][]) => Promise<void>; answer: (id: string, text: string) => Promise<unknown>; photo: (chat: number, mime: string, bytes: Uint8Array) => Promise<void> }
type Active = { id: string; controller: AbortController; task?: Task; done?: Promise<void>; progress: string; started: number }

const help = "Send a task in plain text.\n/status — progress and approval timer\n/result — latest result\n/stop — stop work and cancel timed approval\n/pause — stop and hold\n/resume — continue\n/new — new chat\n/mode — choose coding, browser or app control\n/lock — cancel timed approval without stopping\n/help — these controls\n\nAllow for 90 min covers operations in this project and mode. Captures still ask separately. Stop, Pause, a new chat, a mode change or restarting cancels it."
const timedPermission = (permission: string) => !["external_directory", "question", "plan_enter", "plan_exit"].includes(permission) && !permission.includes("screenshot")

export class RemoteController {
  private active?: Active
  private session?: string
  private result?: string
  private paused = false
  private pairing = { code: randomBytes(12).toString("base64url"), expires: Date.now() + 10 * 60000, attempts: 0 }
  private approvals = new Map<string, { request: Permission; task: Task; active: string; expires: number }>()
  private lastProgress = 0
  private approvedUntil = 0
  private readonly started = Math.floor(Date.now() / 1000)
  mode: Mode = "coding"
  constructor(readonly state: Pick<State, "token" | "owner">, private readonly messenger: Messenger, private readonly driver: Driver,
    private readonly save: () => Promise<void>, readonly allowed: readonly Mode[] = ["coding"], private readonly screenshots = false,
    private readonly now = Date.now, initialMode: Mode = "coding", private readonly channel = "Telegram") {
    if (!allowed.includes(initialMode)) throw new Error("Initial Remote mode must be enabled locally.")
    this.mode = initialMode
  }
  get pairCode() { return this.state.owner ? undefined : this.pairing.code }
  get busy() { return !!this.active }
  get done() { return this.active?.done }
  private approvalStatus() {
    return this.approvedUntil > this.now() ? `Auto-approval: ${Math.ceil((this.approvedUntil - this.now()) / 60000)} min left · /lock cancels` : "Approval: ask each time"
  }
  private async modes() {
    return this.send(`Current: ${ModeLabels[this.mode]}\nChoose what OliveCode can do. A mode change starts a fresh chat and cancels timed approval.\nMissing a mode? Enable it in /remote on your computer.`,
      this.allowed.map((mode) => [{ text: ModeLabels[mode], callback_data: `mode:${mode}` }]))
  }
  private async setMode(mode: Mode) {
    if (this.active) return this.send("Stop the current task before changing modes.")
    if (!this.allowed.includes(mode)) return this.send("That mode is not enabled on your computer. Open /remote locally and choose the matching start option.")
    this.mode = mode; this.session = undefined; this.paused = false; this.approvedUntil = 0
    return this.send(`Ready · ${ModeLabels[mode]}\nSend your task again.`, [[{ text: "Change mode", callback_data: "modes" }]])
  }
  private async send(text: string, buttons?: Button[][]) {
    if (this.state.owner) await this.messenger.send(this.state.owner.chat, text.split(this.state.token).join("[redacted]").replaceAll("Telegram", this.channel), buttons)
  }
  async handle(update: Update) {
    const callback = update.callback_query
    const message = callback?.message ?? update.message
    const from = callback?.from ?? message?.from
    if (!message || !from || from.is_bot || message.chat.type !== "private" || message.forward_origin || message.via_bot) return
    if (!this.state.owner) {
      if (callback || !message.text?.startsWith("/pair ") || message.date < this.started) return
      if (Date.now() > this.pairing.expires || ++this.pairing.attempts > 20) return
      const code = Buffer.from(message.text.slice(6).trim())
      const expected = Buffer.from(this.pairing.code)
      if (code.length !== expected.length || !timingSafeEqual(code, expected)) return
      this.state.owner = { user: from.id, chat: message.chat.id }
      await this.save()
      await this.send(`Connected · ${ModeLabels[this.mode]}\nOnly your paired account can control OliveCode. Send a task to begin.\n\nUse /mode for app or browser tasks; /help for all controls.`, [[{ text: "Choose mode", callback_data: "modes" }]])
      return
    }
    if (from.id !== this.state.owner.user || message.chat.id !== this.state.owner.chat) return
    if (callback) return this.callback(callback.id, callback.data ?? "")
    if (!message.text) return this.send("Send a text task. File and voice uploads are not supported yet.")
    if (message.date < this.started || Math.floor(Date.now() / 1000) - message.date > 120) {
      return this.send("This message arrived from before this connection, or is over two minutes old. Please send it again; it was not executed.")
    }
    const text = message.text.trim()
    if (text === "/result") return this.send(this.result ?? "No result is available in this connection yet.")
    if (text === "/start" || text === "/help") return this.send(help, [[{ text: "Choose mode", callback_data: "modes" }]])
    if (text === "/status") return this.send((this.active ? `Working · ${ModeLabels[this.mode]}\n${this.active.progress}\nElapsed: ${Math.floor((Date.now() - this.active.started) / 1000)}s` : `${this.paused ? "Paused" : "Ready"} · ${ModeLabels[this.mode]}`) + `\n${this.approvalStatus()}`, [[{ text: "Choose mode", callback_data: "modes" }, { text: "Cancel auto-approval", callback_data: "lock" }]])
    if (text === "/lock") { this.approvedUntil = 0; return this.send("Timed approval cancelled. Future operations will ask again.") }
    if (text === "/stop" || text === "/pause") { await this.stop(); this.paused = text === "/pause"; return this.send(this.paused ? "Paused. Send /resume when you want to continue." : "Stopped. Ready for another task.") }
    if (text === "/new") {
      if (this.active) return this.send("A task is running. Send /stop before starting a new chat.")
      this.session = undefined; this.paused = false; this.approvedUntil = 0; return this.send("New chat ready. Timed approval cancelled.")
    }
    if (text.startsWith("/mode")) {
      if (this.active) return this.send("Stop the current task before changing modes.")
      const mode = text.split(/\s+/)[1] as Mode | undefined
      if (!mode) return this.modes()
      return this.setMode(mode)
    }
    if (text === "/resume") {
      if (!this.session) return this.send("There is no task to resume. Send a new task.")
      this.paused = false; return this.begin("Continue the previous user request from the observed state. Check what has already been done; do not repeat completed actions.")
    }
    if (text.startsWith("/")) return this.send("Unknown command. Use /help, or send your task as plain text.")
    if (this.paused) return this.send("Remote is paused. Send /resume or /new first.")
    if (!text) return
    return this.begin(text)
  }
  private async begin(text: string) {
    if (this.active) return this.send("A task is already running. Use /status or /stop; this new task was not queued.")
    const active: Active = { id: randomBytes(8).toString("hex"), controller: new AbortController(), progress: "Starting…", started: Date.now() }
    this.active = active
    active.done = this.execute(active, text)
    // Consume failures even if Telegram disconnects while a result is being delivered.
    void active.done.catch(() => {})
  }
  private async execute(active: Active, text: string) {
    try {
      await this.send(`Working · ${ModeLabels[this.mode]}\n${this.approvalStatus()}`, [[{ text: "Status", callback_data: "status" }, { text: "Stop", callback_data: `stop:${active.id}` }]])
      const task = await this.driver.create(Modes[this.mode], this.session)
      active.task = task; this.session = task.id
      if (active.controller.signal.aborted) { await task.stop(); return }
      const result = await task.run(text, active.controller.signal, {
        progress: async (progress) => {
          active.progress = progress
          if (Date.now() - this.lastProgress < 20000 || active.controller.signal.aborted) return
          this.lastProgress = Date.now()
          await this.send(`Working · ${progress}`).catch(() => {})
        },
        permission: async (request) => {
          if (active.controller.signal.aborted) { await task.approve(request.id, false); return }
          if (this.approvedUntil > this.now() && timedPermission(request.permission)) { await task.approve(request.id, true); return }
          const metadata = ["action", "app", "label", "url", "filepath", "diff", "notice"].flatMap((key) => typeof request.metadata?.[key] === "string" ? [`${key}: ${request.metadata[key]}`] : [])
          const details = [...metadata, ...request.patterns].join("\n")
          if (details.length > 12000) { await task.approve(request.id, false); await this.send("An operation is too large to review safely on Telegram. It was denied; inspect it locally."); return }
          const key = randomBytes(10).toString("hex")
          this.approvals.set(key, { request, task, active: active.id, expires: this.now() + 10 * 60000 })
          active.progress = "Waiting for your approval"
          const capture = request.permission.endsWith("screenshot")
          try {
            await this.send(`Approval needed · ${request.permission}\n${details}\n\n${capture && this.screenshots ? "This approved capture may also be delivered to this Telegram chat.\n" : ""}${timedPermission(request.permission) ? "Allow for 90 min approves this and future operations in the current project and mode. Captures still ask. /lock cancels.\n" : ""}This request expires in 10 minutes.`, [
              [{ text: "Allow once", callback_data: `allow:${key}` }, { text: "Deny", callback_data: `deny:${key}` }],
              ...(timedPermission(request.permission) ? [[{ text: "Allow for 90 min", callback_data: `allow90:${key}` }]] : []),
            ])
          } catch { this.approvals.delete(key); await task.approve(request.id, false) }
        },
        photo: async (mime, bytes) => { if (this.screenshots && !active.controller.signal.aborted && this.state.owner) await this.messenger.photo(this.state.owner.chat, mime, bytes) },
      })
      if (!active.controller.signal.aborted) {
        this.result = result || "No final text was provided. Check the task in OliveCode."
        await this.send(this.result).catch(() => {})
      }
    } catch {
      if (!active.controller.signal.aborted) await this.send("The task could not finish. Check OliveCode locally, then send a new task or /resume. No automatic retry was started.").catch(() => {})
      await active.task?.stop().catch(() => {})
    } finally {
      for (const [key, approval] of this.approvals) if (approval.active === active.id) this.approvals.delete(key)
      if (this.active === active) this.active = undefined
    }
  }
  private async callback(id: string, data: string) {
    if (data === "modes") { await this.messenger.answer(id, "Choose a mode below"); return this.modes() }
    if (data.startsWith("mode:")) { await this.messenger.answer(id, "Checking mode"); return this.setMode(data.slice(5) as Mode) }
    if (data === "lock") { this.approvedUntil = 0; await this.messenger.answer(id, "Timed approval cancelled"); return this.send("Timed approval cancelled. Future operations will ask again.") }
    if (data === "status") { await this.messenger.answer(id, `${this.active?.progress ?? "Ready"} · ${this.approvalStatus()}`); return }
    if (data === `stop:${this.active?.id}`) { await this.stop(); await this.messenger.answer(id, "Stopped"); return }
    const [action, key] = data.split(":")
    const approval = key && this.approvals.get(key)
    if (!["allow", "allow90", "deny"].includes(action!) || !approval || approval.active !== this.active?.id || approval.expires <= this.now() || (action === "allow90" && !timedPermission(approval.request.permission))) {
      await this.messenger.answer(id, "This control expired or belongs to an older task."); return
    }
    this.approvals.delete(key!)
    const previous = this.approvedUntil
    if (action === "allow90") this.approvedUntil = this.now() + 90 * 60000
    if (action === "deny") this.approvedUntil = 0
    try { await approval.task.approve(approval.request.id, action !== "deny") } catch {
      this.approvedUntil = previous
      this.approvals.set(key!, approval)
      await this.messenger.answer(id, "Could not apply that response. Try again before it expires.")
      return
    }
    await this.messenger.answer(id, action === "allow90" ? "Allowed for 90 minutes" : action === "allow" ? "Allowed once" : "Denied")
    if (action === "allow90") {
      await this.send(`Auto-approval on · 90 minutes\n${ModeLabels[this.mode]} · current project\nCaptures still ask. Stop, Pause, a new chat, changing mode or restarting cancels it.`, [[{ text: "Cancel auto-approval", callback_data: "lock" }]])
      for (const [pendingKey, pending] of this.approvals) {
        if (pending.active !== this.active?.id || pending.expires <= this.now() || !timedPermission(pending.request.permission) || this.approvedUntil <= this.now()) continue
        this.approvals.delete(pendingKey)
        await pending.task.approve(pending.request.id, true).catch(() => { this.approvals.set(pendingKey, pending) })
      }
    }
  }
  async expire() {
    if (this.approvedUntil && this.approvedUntil <= this.now()) {
      this.approvedUntil = 0
      await this.send("The 90-minute approval ended. Future operations will ask again.").catch(() => {})
    }
    for (const [key, approval] of this.approvals) {
      if (approval.expires > this.now()) continue
      this.approvals.delete(key)
      await approval.task.approve(approval.request.id, false).catch(() => {})
      await this.send("An approval expired and was denied. No permission was granted.").catch(() => {})
    }
  }
  async stop() {
    this.approvedUntil = 0
    const active = this.active
    if (!active) return
    active.controller.abort()
    for (const [key, approval] of this.approvals) if (approval.active === active.id) {
      this.approvals.delete(key); await approval.task.approve(approval.request.id, false).catch(() => {})
    }
    await active.task?.stop()
    // Don't admit another task until the previous execution has actually unwound.
    await active.done
  }
}
