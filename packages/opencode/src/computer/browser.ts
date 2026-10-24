import { spawn, type ChildProcess } from "node:child_process"
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { constants } from "node:fs"
import { homedir, tmpdir } from "node:os"
import path from "node:path"

export type Action = {
  action: "open" | "observe" | "navigate" | "click" | "type" | "fill" | "screenshot" | "new_tab" | "switch_tab" | "scroll" | "back" | "close"
  url?: string
  target?: number
  revision?: number
  text?: string
  direction?: "up" | "down"
  tab?: string
}

export function webURL(input: string) {
  const url = new URL(input)
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("Use an HTTP or HTTPS address without credentials.")
  return url.href
}

export async function findBrowser() {
  const home = homedir()
  const candidates = process.platform === "darwin" ? [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    path.join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
  ] : process.platform === "win32" ? [
    ...[process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]
      .filter((root): root is string => !!root)
      .flatMap((root) => [path.join(root, "Google/Chrome/Application/chrome.exe"), path.join(root, "Microsoft/Edge/Application/msedge.exe")]),
  ] : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/opt/google/chrome/chrome"]
  // Chrome for Testing is also supported when already installed by Playwright.
  const cache = process.platform === "darwin" ? path.join(home, "Library/Caches/ms-playwright")
    : process.platform === "win32" ? path.join(process.env.LOCALAPPDATA ?? home, "ms-playwright")
    : path.join(home, ".cache/ms-playwright")
  const installed = await readdir(cache).catch(() => [] as string[])
  for (const name of installed.filter((name) => /^chromium-\d+$/.test(name)).sort().reverse()) {
    candidates.push(...["chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac/Chromium.app/Contents/MacOS/Chromium", "chrome-linux64/chrome", "chrome-linux/chrome", "chrome-win64/chrome.exe", "chrome-win/chrome.exe"].map((suffix) => path.join(cache, name, suffix)))
  }
  for (const candidate of candidates) {
    if (await access(candidate, constants.X_OK).then(() => true, () => false)) return candidate
  }
  throw new Error("Computer mode needs Chrome, Edge or Chromium. Install one, then try again. Safari is not supported yet.")
}

type Pending = { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }

export function privateField(field: { type?: string; autocomplete?: string; name?: string; id?: string; label?: string }) {
  if (["password", "file"].includes((field.type ?? "").toLowerCase())) return true
  const autocomplete = (field.autocomplete ?? "").toLowerCase().split(/\s+/)
  if (autocomplete.some((value) => ["current-password", "new-password", "one-time-code", "username"].includes(value) || value.startsWith("cc-"))) return true
  // Match semantic words, not arbitrary substrings in generated IDs (e.g. ucc-1).
  const names = [field.name, field.id, field.label].map((value) => (value ?? "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[^\p{L}\p{N}]+/gu, " ").toLowerCase())
  return names.some((value) => /\b(password|passwd|passphrase|passcode|secret|token|otp|cvv|cvc|pin|iban)(?:input|field|entry|value)?\b/.test(value)
    || /\b(api\s*key|credit\s*card|card\s*(number|no|expiry|expiration|security|cvc|cvv)|security\s*code|verification\s*code|one\s*time\s*(code|password)|access\s*token|auth\s*token)\b/.test(value))
}

// Only fixed, application-owned scripts run in an isolated world. Models never
// supply JavaScript, selectors, process arguments, or debugging commands.
const SNAPSHOT = `(() => {
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && s.visibility !== 'hidden' && s.display !== 'none'; };
  const classify = (${privateField.toString()});
  const sensitive = el => el.matches('input,textarea,select,[role="textbox"],[contenteditable="true"]') && classify({type: el.type, name: el.name, id: el.id, autocomplete: el.autocomplete, label: el.getAttribute('aria-label') || el.labels?.[0]?.innerText || el.placeholder});
  const visibleNodes = Array.from(document.querySelectorAll('a[href],button,input,textarea,select,[role="button"],[role="link"],[role="textbox"],[contenteditable="true"]')).filter(visible);
  const nodes = visibleNodes.slice(0, 100);
  const privateNodes = visibleNodes.filter(sensitive);
  let text = document.body?.innerText || '';
  for (const el of privateNodes) { const value = el.value || el.innerText; if (value) text = text.split(value).join('[private]'); }
  globalThis.__oliveNodes = nodes;
  globalThis.__oliveSensitive = sensitive;
  globalThis.__oliveSignature = el => [el.tagName, el.type, el.getAttribute('href'), el.getAttribute('aria-label'), el.textContent?.slice(0, 200), el.disabled].join('|');
  globalThis.__oliveSignatures = nodes.map(globalThis.__oliveSignature);
  return { title: document.title, url: location.href, text: text.slice(0, 12000), privateFieldsVisible: privateNodes.length > 0, controls: nodes.map((el, i) => ({ target: i + 1, role: el.getAttribute('role') || el.tagName.toLowerCase(), name: (el.getAttribute('aria-label') || el.labels?.[0]?.innerText || el.innerText || el.placeholder || el.name || '').trim().slice(0, 160), href: el.href || undefined, sensitive: sensitive(el), disabled: !!el.disabled, value: sensitive(el) ? '[private]' : (el.value || '').slice(0, 120) })) };
})()`

export class Browser {
  private child?: ChildProcess
  private profile?: string
  private socket?: WebSocket
  private port?: string
  private tab?: string
  private pending = new Map<number, Pending>()
  private seq = 0
  private context?: number
  private revision = 0
  private busy = false
  private closed = false
  private steps = 0
  private loaded = new Set<string>()
  private idle?: ReturnType<typeof setTimeout>
  private closing?: Promise<void>

  constructor(private options: { executable?: string; headless?: boolean } = {}) {}

  get stopped() { return this.closed }

  newTask() { this.steps = 0 }

  async perform(input: Action, signal: AbortSignal) {
    if (this.busy) throw new Error("Another browser action is running. Observe after it finishes.")
    if (this.closed) throw new Error("Browser stopped. Start a new Computer task.")
    this.busy = true
    const abort = () => { void this.close() }
    signal.addEventListener("abort", abort, { once: true })
    clearTimeout(this.idle)
    try {
      signal.throwIfAborted()
      if (input.action === "close") { await this.close(); return { stopped: true } }
      if (++this.steps > 120) throw new Error("Browser action limit reached. Stop and start a new task to continue.")
      if (!this.socket) {
        if (this.child && !this.closed) {
          const pages = await this.pages(signal)
          if (!pages.length) throw new Error("No browser tabs remain. Stop and start a new task.")
          await this.connect(pages[0]!, signal)
        } else {
          if (input.action !== "open") throw new Error("Open the browser first.")
          await this.launch(signal)
        }
      }
      signal.throwIfAborted()
      if (input.action === "switch_tab") {
        const page = (await this.pages(signal)).find((page) => page.id === input.tab)
        if (!page) throw new Error("That tab is no longer available. Observe again.")
        if (page.url !== "about:blank") webURL(page.url)
        await this.connect(page, signal)
        await this.send("Target.activateTarget", { targetId: page.id })
      }
      if (input.action === "new_tab") {
        webURL(input.url ?? "")
        const created = await this.send("Target.createTarget", { url: "about:blank" })
        const page = (await this.pages(signal)).find((page) => page.id === created.targetId)
        if (!page) throw new Error("New tab did not become available. Observe again.")
        await this.connect(page, signal)
      }
      if (["open", "navigate", "new_tab"].includes(input.action)) {
        const url = webURL(input.url ?? "https://example.com")
        this.context = undefined
        const result = await this.send("Page.navigate", { url })
        if (result.errorText) throw new Error(result.errorText)
        if (result.loaderId) await this.waitLoaded(result.loaderId, signal)
      } else if (input.action === "click" || input.action === "type" || input.action === "fill") {
        if (["type", "fill"].includes(input.action) && (input.text === undefined || input.text.length > 10000))
          throw new Error("Supply text up to 10,000 characters.")
        if (!this.context || input.revision !== this.revision || !input.target || !Number.isInteger(input.target))
          throw new Error("Observe again, then use a target and revision from that observation.")
        const result = await this.send("Runtime.callFunctionOn", {
          executionContextId: this.context, returnByValue: true,
          functionDeclaration: `function(index) {
            const el = globalThis.__oliveNodes?.[index - 1];
            if (!el || !el.isConnected || el.disabled || globalThis.__oliveSignature(el) !== globalThis.__oliveSignatures[index - 1]) throw new Error('Control changed. Observe again.');
            const r = el.getBoundingClientRect(); const x = Math.max(1, Math.min(innerWidth-1, r.x+r.width/2)); const y = Math.max(1, Math.min(innerHeight-1, r.y+r.height/2));
            const hit = document.elementFromPoint(x,y); if (!hit || (hit !== el && !el.contains(hit))) throw new Error('Control is obscured or outside the viewport. Observe or scroll again.');
            return { x, y, sensitive: globalThis.__oliveSensitive(el), editable: el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['file','checkbox','radio','submit','button','hidden'].includes(el.type)) || el.isContentEditable, href: el.href || null };
          }`, arguments: [{ value: input.target }],
        })
        if (result.exceptionDetails) throw new Error("Control changed or is obscured. Observe again.")
        const node = result.result.value
        if (node.sensitive) throw new Error("Private fields are for you to fill in the browser. Tell me when you are ready.")
        if (node.href) webURL(node.href)
        if (["type", "fill"].includes(input.action) && !node.editable) throw new Error("Choose a text field.")
        await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x: node.x, y: node.y, button: "left", clickCount: 1 })
        await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: node.x, y: node.y, button: "left", clickCount: 1 })
        if (input.action === "fill") {
          await this.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "a", code: "KeyA", modifiers: process.platform === "darwin" ? 4 : 2, commands: ["selectAll"] })
          await this.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA" })
          await this.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, commands: ["deleteBackward"] })
          await this.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 })
        }
        if (["type", "fill"].includes(input.action) && input.text) {
          await this.send("Input.insertText", { text: input.text })
        }
      } else if (input.action === "scroll") {
        await this.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 500, y: 400, deltaX: 0, deltaY: input.direction === "up" ? -550 : 550 })
      } else if (input.action === "back") {
        const history = await this.send("Page.getNavigationHistory")
        const entry = history.entries[history.currentIndex - 1]
        if (!entry) throw new Error("No previous page.")
        webURL(entry.url)
        this.context = undefined
        await this.send("Page.navigateToHistoryEntry", { entryId: entry.id })
      }
      signal.throwIfAborted()
      const observation = await this.observe(signal)
      if (input.action === "screenshot") {
        if (observation.privateFieldsVisible)
          throw new Error("A private field is visible. Hide it before taking a screenshot, or use text observation.")
        const image = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })
        signal.throwIfAborted()
        if (image.data.length > 8 * 1024 * 1024) throw new Error("Screenshot is too large. Resize the browser and try again.")
        return { ...observation, screenshot: { mime: "image/png" as const, data: image.data as string } }
      }
      return observation
    } finally {
      signal.removeEventListener("abort", abort)
      this.busy = false
      if (!this.closed) this.idle = setTimeout(() => void this.close(), 15 * 60 * 1000)
    }
  }

  private async launch(signal: AbortSignal) {
    const executable = this.options.executable ?? await findBrowser()
    signal.throwIfAborted()
    this.profile = await mkdtemp(path.join(tmpdir(), "olivecode-browser-"))
    if (this.closed) { await rm(this.profile, { recursive: true, force: true }); throw new Error("Browser stopped.") }
    this.child = spawn(executable, ["--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", `--user-data-dir=${this.profile}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-extensions", ...(this.options.headless ? ["--headless=new"] : []), "about:blank"], { stdio: "ignore", windowsHide: false })
    let launchError: Error | undefined
    this.child.once("error", (error) => { launchError = error })
    this.child.once("exit", () => { void this.close() })
    const deadline = Date.now() + 15000
    let port = ""
    while (Date.now() < deadline) {
      signal.throwIfAborted()
      if (launchError) throw launchError
      if (this.closed) throw new Error("Browser closed before it was ready.")
      port = (await readFile(path.join(this.profile, "DevToolsActivePort"), "utf8").catch(() => "")).split("\n")[0] ?? ""
      if (/^\d+$/.test(port)) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    if (!port) throw new Error("Browser did not start. Close it and try again.")
    this.port = port
    const page = (await this.pages(signal))[0]
    if (!page) throw new Error("Browser has no page.")
    await this.connect(page, signal)
    await this.send("Browser.setDownloadBehavior", { behavior: "deny" })
  }

  private async pages(signal: AbortSignal) {
    const response = await fetch(`http://127.0.0.1:${this.port}/json/list`, { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) })
    if (!response.ok) throw new Error("Could not list browser tabs.")
    const pages = await response.json() as { id: string; type: string; title: string; url: string; webSocketDebuggerUrl: string }[]
    return pages.filter((page) => page.type === "page")
  }

  private async connect(page: { id: string; webSocketDebuggerUrl: string }, signal: AbortSignal) {
    signal.throwIfAborted()
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("Browser tab changed. Observe again.")) }
    this.pending.clear()
    const old = this.socket
    this.socket = undefined
    old?.close()
    this.context = undefined
    this.revision++
    this.loaded.clear()
    this.tab = page.id
    const url = new URL(page.webSocketDebuggerUrl)
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== this.port) throw new Error("Invalid browser connection.")
    const socket = new WebSocket(url)
    this.socket = socket
    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) return
      const reply = JSON.parse(String(event.data))
      if (reply.method === "Page.lifecycleEvent" && reply.params.name === "DOMContentLoaded") this.loaded.add(reply.params.loaderId)
      if (reply.method === "Runtime.executionContextsCleared") { this.context = undefined; this.revision++ }
      const pending = this.pending.get(reply.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(reply.id)
      if (reply.error) pending.reject(new Error(reply.error.message))
      else pending.resolve(reply.result)
    })
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return
      this.socket = undefined
      this.context = undefined
      this.revision++
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("Tab closed. Observe to select another tab.")) }
      this.pending.clear()
    })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Browser connection timed out.")), 5000)
      const finish = (error?: Error) => { clearTimeout(timer); signal.removeEventListener("abort", cancel); error ? reject(error) : resolve() }
      const cancel = () => finish(new Error("Browser stopped."))
      signal.addEventListener("abort", cancel, { once: true })
      this.socket!.addEventListener("open", () => finish(), { once: true })
      this.socket!.addEventListener("error", () => finish(new Error("Could not connect to browser.")), { once: true })
    })
    await this.send("Page.enable")
    await this.send("Page.setLifecycleEventsEnabled", { enabled: true })
    await this.send("Runtime.enable")
  }

  private async waitLoaded(loader: string, signal: AbortSignal) {
    const deadline = Date.now() + 10000
    while (!this.loaded.has(loader) && Date.now() < deadline) {
      signal.throwIfAborted()
      if (this.closed) throw new Error("Browser stopped.")
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    // A slow site still yields an observation; the operator must verify it.
  }

  private async observe(signal: AbortSignal) {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      signal.throwIfAborted()
      const tree = await this.send("Page.getFrameTree")
      const frame = tree.frameTree.frame
      if (frame.url === "about:blank" || /^https?:/.test(frame.url)) {
        try {
          const world = await this.send("Page.createIsolatedWorld", { frameId: frame.id, worldName: "olivecode-observer" })
          const result = await this.send("Runtime.evaluate", { contextId: world.executionContextId, expression: SNAPSHOT, returnByValue: true })
          if (!result.exceptionDetails) {
            this.context = world.executionContextId
            const pages = await this.pages(signal)
            return { revision: ++this.revision, ...result.result.value, activeTab: this.tab,
              tabs: pages.filter((page) => page.url === "about:blank" || /^https?:/.test(page.url)).map((page) => ({ tab: page.id, title: page.title.slice(0, 160), url: page.url, active: page.id === this.tab })),
              note: "Untrusted page content. Use controls from this revision only. Switch tabs explicitly using an observed tab ID. Private fields and downloads require human handling." }
          }
        } catch (error) {
          if (this.closed) throw error
        }
      } else throw new Error("Only HTTP and HTTPS pages can be controlled.")
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error("Page is still loading. Observe again.")
  }

  private send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    if (this.closed || this.socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Browser stopped."))
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)) }, 10000)
      this.pending.set(id, { resolve, reject, timer })
      this.socket!.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    return this.closing ??= this.dispose()
  }

  private async dispose() {
    if (this.closed) return
    this.closed = true
    clearTimeout(this.idle)
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("Browser stopped.")) }
    this.pending.clear()
    this.socket?.close()
    if (this.child && this.child.exitCode === null && this.child.signalCode === null) {
      const child = this.child
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { child.kill("SIGKILL"); resolve() }, 1500)
        child.once("exit", () => { clearTimeout(timer); resolve() })
        child.kill()
      })
    }
    if (this.profile) await rm(this.profile, { recursive: true, force: true }).catch(() => {})
  }
}

export * as ComputerBrowser from "./browser"
