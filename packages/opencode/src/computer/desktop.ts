import { assertIsolated, sshArguments } from "./background-mac"
import { promisify } from "node:util"
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { Global } from "@opencode-ai/core/global"

declare const OLIVECODE_DESKTOP_HELPER: string

export type Action = {
  action: "status" | "find_app" | "setup" | "activate" | "observe" | "windows" | "focus" | "look" | "click_text" | "click" | "click_point" | "move" | "drag" | "type" | "fill" | "key" | "scroll" | "screenshot" | "close"
  app?: string; query?: string; window?: number; permission?: "accessibility" | "screen"; target?: number; revision?: number; text?: string
  key?: string; modifiers?: readonly string[]; direction?: "up" | "down"; x?: number; y?: number
  restoreAfterApproval?: boolean
  toTarget?: number; button?: "left" | "right"; count?: 1 | 2
}
export type Result = Record<string, unknown> & { screenshot?: { mime: string; data: string } }

const owners = new Map<string, Desktop>()
let installation: Promise<string> | undefined

async function executable() {
  if (process.platform !== "darwin") throw new Error("Desktop mode currently needs macOS 14 or newer. Browser mode works on Windows too.")
  const encoded = typeof OLIVECODE_DESKTOP_HELPER === "string" ? OLIVECODE_DESKTOP_HELPER : undefined
  const data = encoded ? Buffer.from(encoded, "base64") : await readFile(new URL("./native/desktop-helper", import.meta.url)).catch(() => {
    throw new Error("The desktop helper is missing. Use the packaged OliveCode build.")
  })
  const app = path.join(Global.Path.data, "computer", "OliveCode Computer.app", "Contents")
  const bin = path.join(app, "MacOS", "OliveCode Computer")
  await mkdir(path.dirname(bin), { recursive: true })
  const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex")
  const existing = await readFile(bin).catch(() => undefined)
  if (!existing || hash(existing) !== hash(data)) { await writeFile(bin, data, { mode: 0o755 }); await chmod(bin, 0o755) }
  await writeFile(path.join(app, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.olivecode.computer</string><key>CFBundleName</key><string>OliveCode Computer</string><key>CFBundleExecutable</key><string>OliveCode Computer</string><key>CFBundleVersion</key><string>1</string><key>LSMinimumSystemVersion</key><string>14.0</string><key>LSUIElement</key><true/></dict></plist>`)
  return bin
}

export class Desktop {
  private child?: ChildProcessWithoutNullStreams
  private pending?: { resolve: (result: Result) => void; reject: (error: Error) => void }
  private buffer = ""
  private steps = 0
  private timer?: ReturnType<typeof setTimeout>
  private stopped = false
  private busy = false
  private idle?: ReturnType<typeof setTimeout>
  private holds = 0
  constructor(private readonly binary?: string, private readonly idleMs = 5 * 60 * 1000, private readonly remote?: { host: string; localIdentity?: string; sshBinary?: string }) {}
  private get ownership() { return this.remote ? `ssh:${this.remoteIdentity ?? this.remote.host}` : "local" }
  private isolated = false
  private remoteIdentity?: string
  private async request(input: Record<string, unknown>): Promise<Result> {
    if (this.stopped || !this.child) throw new Error("Desktop control stopped. No action was sent.")
    return await new Promise<Result>((resolve, reject) => {
      this.pending = { resolve, reject }
      this.timer = setTimeout(() => this.close(), input.action === "setup" ? 120000 : 20000)
      this.child!.stdin.write(JSON.stringify(input) + "\n", (error) => { if (error) this.close() })
    }).finally(() => clearTimeout(this.timer))
  }
  // Human approval is not inactivity. Keep the current helper and its observations alive.
  hold() {
    if (this.stopped) throw new Error("Desktop control stopped. Start a new task to resume.")
    this.holds++
    clearTimeout(this.idle)
    let released = false
    return () => {
      if (released) return
      released = true
      this.holds--
      this.scheduleIdle()
    }
  }
  private scheduleIdle() {
    clearTimeout(this.idle)
    if (this.stopped || this.busy || this.holds) return
    this.idle = setTimeout(() => this.close(), this.idleMs)
    this.idle.unref()
  }
  async perform(input: Action, signal: AbortSignal): Promise<Result> {
    if (input.action === "close") { this.close(); return { closed: true } }
    if (this.stopped || signal.aborted) throw new Error("Desktop control stopped. Start a new task to resume.")
    if (owners.has(this.ownership) && owners.get(this.ownership) !== this) throw new Error("Another chat is controlling the desktop. Stop that task first.")
    if (this.busy) throw new Error("Concurrent desktop action rejected; this extra action was not executed. Read the first action’s result, then observe before choosing one next action.")
    if (++this.steps > 120) throw new Error("Desktop action limit reached. Review progress and start another task.")
    owners.set(this.ownership, this)
    this.busy = true
    clearTimeout(this.idle)
    const abort = () => this.close()
    signal.addEventListener("abort", abort, { once: true })
    try {
      if (!this.child) {
        const bin = this.binary ?? await (installation ??= executable().catch((error) => { installation = undefined; throw error }))
        if (signal.aborted || this.stopped) throw new Error("Desktop control stopped.")
        const child = spawn(this.remote?.sshBinary ?? (this.remote ? "/usr/bin/ssh" : bin), this.remote ? sshArguments(this.remote.host) : [], { stdio: ["pipe", "pipe", "pipe"] })
        this.child = child
        child.stdin.on("error", () => this.close())
        child.stdout.on("error", () => this.close())
        child.stderr.on("error", () => this.close())
        child.stdout.on("data", (chunk) => {
          this.buffer += chunk.toString()
          if (this.buffer.length > 9_000_000) { this.close(); return }
          const end = this.buffer.indexOf("\n")
          if (end < 0) return
          const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1)
          const pending = this.pending; this.pending = undefined
          try {
            const response = JSON.parse(line)
            if (response.ok) pending?.resolve(response.result)
            else pending?.reject(new Error(String(response.error)))
          } catch { pending?.reject(new Error("Invalid response from desktop helper.")); this.close() }
        })
        child.stderr.resume()
        child.on("error", (error) => { this.pending?.reject(error); this.close() })
        child.on("exit", () => { this.pending?.reject(new Error(this.remote ? "Background Mac connection closed. Check trusted SSH access, helper installation and an unlocked guest desktop; no local fallback was used." : "Desktop helper closed. Start a new task to reconnect.")); this.close() })
      }
      if (this.remote && !this.isolated) {
        const bin = this.binary ?? await (installation ??= executable())
        const local = this.remote.localIdentity ?? (await promisify(execFile)(bin, ["--identity"], { timeout: 5000, maxBuffer: 2000 })).stdout.trim()
        const remote = await this.request({ action: "_identity" })
        assertIsolated(local, remote.identity)
        if (owners.get(this.ownership) === this) owners.delete(this.ownership)
        this.remoteIdentity = remote.identity as string
        if (owners.has(this.ownership) && owners.get(this.ownership) !== this) throw new Error("Another chat is controlling this isolated Mac. Stop it first.")
        owners.set(this.ownership, this)
        this.isolated = true
      }
      return await this.request(input)
    } catch (error) {
      if (!this.child || (this.remote && !this.isolated)) this.close()
      throw error
    } finally {
      signal.removeEventListener("abort", abort)
      clearTimeout(this.timer)
      this.busy = false
      this.scheduleIdle()
    }
  }
  close() {
    this.stopped = true
    if (owners.get(this.ownership) === this) owners.delete(this.ownership)
    this.pending?.reject(new Error("Desktop control stopped.")); this.pending = undefined
    clearTimeout(this.timer)
    clearTimeout(this.idle)
    const child = this.child; this.child = undefined
    child?.stdin.destroy()
    child?.kill("SIGTERM")
    if (child) {
      // Let the helper release held mouse buttons before forcing termination.
      const kill = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL") }, 1000)
      kill.unref()
    }
  }
}

export * as ComputerDesktop from "./desktop"
