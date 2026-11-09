import { spawn, type ChildProcess } from "node:child_process"
import { access, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { constants } from "node:fs"
import { homedir, tmpdir } from "node:os"
import path from "node:path"

export type Action = {
  action: "open" | "observe" | "navigate" | "click" | "type" | "fill" | "select" | "press" | "screenshot" | "new_tab" | "switch_tab" | "scroll" | "back" | "close"
  url?: string
  key?: string
  target?: number
  revision?: number
  text?: string
  direction?: "up" | "down"
  tab?: string
}

// Keys a page can receive from the focused control. No modifiers: shortcuts such as
// select-all or browser chrome commands stay out of reach.
export const KEYS: Record<string, { code: string; keyCode: number; text?: string }> = {
  Enter: { code: "Enter", keyCode: 13, text: "\r" },
  Escape: { code: "Escape", keyCode: 27 },
  Tab: { code: "Tab", keyCode: 9 },
  Backspace: { code: "Backspace", keyCode: 8 },
  ArrowUp: { code: "ArrowUp", keyCode: 38 },
  ArrowDown: { code: "ArrowDown", keyCode: 40 },
  ArrowLeft: { code: "ArrowLeft", keyCode: 37 },
  ArrowRight: { code: "ArrowRight", keyCode: 39 },
  PageUp: { code: "PageUp", keyCode: 33 },
  PageDown: { code: "PageDown", keyCode: 34 },
  Home: { code: "Home", keyCode: 36 },
  End: { code: "End", keyCode: 35 },
}

export function webURL(input: string) {
  const url = new URL(input)
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("Use an HTTP or HTTPS address without credentials.")
  return url.href
}

export async function findBrowser() {
  const home = homedir()
  if (process.env.OLIVECODE_BROWSER) {
    if (await access(process.env.OLIVECODE_BROWSER, constants.X_OK).then(() => true, () => false)) return process.env.OLIVECODE_BROWSER
    throw new Error("The browser configured with OLIVECODE_BROWSER is not executable. Set it to the installed browser binary, without command arguments.")
  }
  // Any Chromium build that supports the DevTools protocol works; stable channels first.
  const candidates = process.platform === "darwin" ? ["/Applications", path.join(home, "Applications")].flatMap((root) => [
    "Google Chrome.app/Contents/MacOS/Google Chrome",
    "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "Chromium.app/Contents/MacOS/Chromium",
    "Brave Browser.app/Contents/MacOS/Brave Browser",
    "Vivaldi.app/Contents/MacOS/Vivaldi",
    "Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
    "Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev",
    "Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "Microsoft Edge Beta.app/Contents/MacOS/Microsoft Edge Beta",
    "Microsoft Edge Dev.app/Contents/MacOS/Microsoft Edge Dev",
  ].map((suffix) => path.join(root, suffix))) : process.platform === "win32" ? [
    ...[process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]
      .filter((root): root is string => !!root)
      .flatMap((root) => [path.join(root, "Google/Chrome/Application/chrome.exe"), path.join(root, "Microsoft/Edge/Application/msedge.exe"), path.join(root, "BraveSoftware/Brave-Browser/Application/brave.exe"), path.join(root, "Vivaldi/Application/vivaldi.exe")]),
  ] : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/opt/google/chrome/chrome", "/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable", "/usr/bin/brave-browser", "/usr/bin/vivaldi-stable"]
  // Chrome for Testing is also supported when already installed by Playwright.
  const cache = process.platform === "darwin" ? path.join(home, "Library/Caches/ms-playwright")
    : process.platform === "win32" ? path.join(process.env.LOCALAPPDATA ?? home, "ms-playwright")
    : path.join(home, ".cache/ms-playwright")
  const installed = await readdir(cache).catch(() => [] as string[])
  for (const name of installed.filter((name) => /^chromium-\d+$/.test(name)).sort().reverse()) {
    candidates.push(...["chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac/Chromium.app/Contents/MacOS/Chromium", "chrome-linux64/chrome", "chrome-linux/chrome", "chrome-win64/chrome.exe", "chrome-win/chrome.exe"].map((suffix) => path.join(cache, name, suffix)))
  }
  if (process.platform === "linux") candidates.push("/snap/bin/chromium")
  for (const candidate of candidates) {
    if (await access(candidate, constants.X_OK).then(() => true, () => false)) return candidate
  }
  throw new Error(process.platform === "linux"
    ? "No supported browser found for website control. Install Chrome or Chromium (Ubuntu Snap Chromium is supported), or configure OLIVECODE_BROWSER to its installed binary. Firefox is not supported by this browser adapter. Native app control is separate: check desktop status for app tasks rather than asking for a website URL."
    : "Website control needs a Chromium browser: Chrome, Edge, Brave, Vivaldi or Chromium. Install one, then try again. Safari and Firefox are not supported. Native app control is separate; check desktop status for app tasks.")
}

export function browserProfileRoot(executable: string, os = process.platform, home = homedir(), temporary = tmpdir()) {
  // Ubuntu Snap Chromium cannot use another process's private /tmp namespace.
  // Keep only OliveCode's fresh temporary profiles in the Snap common area.
  return os === "linux" && (executable.startsWith("/snap/") || executable === "/usr/bin/chromium-browser")
    ? path.join(home, "snap/chromium/common/olivecode-profiles") : temporary
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
// Controls outside the viewport are listed (flagged offscreen) so the model can
// reach them; clicks scroll them into view first. Long pages return text from the
// current scroll position, so scrolling reveals content beyond the text limit.
const SNAPSHOT = `(() => {
  const rendered = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const inView = el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  const classify = (${privateField.toString()});
  const sensitive = el => el.matches('input,textarea,select,[role="textbox"],[contenteditable="true"]') && classify({type: el.type, name: el.name, id: el.id, autocomplete: el.autocomplete, label: el.getAttribute('aria-label') || el.labels?.[0]?.innerText || el.placeholder});
  const renderedNodes = Array.from(document.querySelectorAll('a[href],button,input,textarea,select,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="radio"],[role="switch"],[role="combobox"],[role="textbox"],[contenteditable="true"]')).filter(rendered);
  const visibleNodes = renderedNodes.filter(inView);
  // Free tiers have small per-minute token budgets: keep in-view controls, plus only the nearest offscreen ones.
  const distance = el => { const r = el.getBoundingClientRect(); return r.top >= innerHeight ? r.top - innerHeight : r.bottom <= 0 ? -r.bottom : Math.abs(r.left); };
  const nodes = [...visibleNodes.slice(0, 100), ...renderedNodes.filter(el => !inView(el)).sort((a, b) => distance(a) - distance(b)).slice(0, 25)];
  const privateNodes = visibleNodes.filter(sensitive);
  const LIMIT = 12000;
  let text = document.body?.innerText || '';
  let textStart = 'top';
  if (text.length > LIMIT && scrollY > 0) {
    const parts = []; let size = 0; const seen = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node && size < LIMIT; node = walker.nextNode()) {
      const parent = node.parentElement; const value = node.nodeValue.replace(/\\s+/g, ' ').trim();
      if (!parent || !value || parent.closest('script,style,noscript,template')) continue;
      if (!seen.has(parent)) seen.set(parent, rendered(parent) && parent.getBoundingClientRect().bottom > 0);
      if (!seen.get(parent)) continue;
      parts.push(value); size += value.length + 1;
    }
    text = parts.join('\\n'); textStart = 'viewport';
  }
  for (const el of renderedNodes.filter(sensitive)) { const value = el.value || el.innerText; if (value) text = text.split(value).join('[private]'); }
  const headings = Array.from(document.querySelectorAll('h1,h2,h3')).filter(el => rendered(el) && !el.closest('nav,[role="navigation"]')).slice(0, 80).map(el => ({ level: Number(el.tagName[1]), text: el.innerText.trim().replace(/\\s+/g, ' ').slice(0, 120) })).filter(h => h.text);
  const more = text.length > LIMIT;
  globalThis.__oliveNodes = nodes;
  globalThis.__oliveSensitive = sensitive;
  globalThis.__oliveSignature = el => [el.tagName, el.type, el.getAttribute('href'), el.getAttribute('aria-label'), el.textContent?.slice(0, 200), el.disabled, el.matches(':disabled'), el.tagName === 'SELECT' ? Array.from(el.options).map(o => [o.value,o.label,o.disabled,o.parentElement?.disabled]) : '', el.readOnly, el.getAttribute('aria-disabled'), el.getAttribute('aria-readonly')].join('|');
  globalThis.__oliveSignatures = nodes.map(globalThis.__oliveSignature);
  return { title: document.title, url: location.href, text: text.slice(0, LIMIT), textStart, ...(more ? { textTruncated: 'Page text continues. Scroll down and observe to read further.' } : {}), headings, privateFieldsVisible: privateNodes.length > 0, controls: nodes.map((el, i) => {
    // Omit default-valued fields; observations are resent to the model every step.
    const control = { target: i + 1, role: el.getAttribute('role') || el.tagName.toLowerCase(), name: (el.getAttribute('aria-label') || el.labels?.[0]?.innerText || el.innerText || el.placeholder || el.name || '').trim().replace(/\\s+/g, ' ').slice(0, 100), sensitive: sensitive(el) };
    if (!inView(el)) control.offscreen = true;
    if (el.href) control.href = el.href.length > 120 ? el.href.slice(0, 117) + '...' : el.href;
    if (el.disabled || el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') control.disabled = true;
    if (el.readOnly || el.getAttribute('aria-readonly') === 'true') control.readonly = true;
    if (el.tagName === 'SELECT' && !control.sensitive) control.options = Array.from(el.options).slice(0, 50).map(option => ({value:option.value, label:option.label, ...(option.disabled || option.parentElement?.disabled ? {disabled:true} : {}), ...(option.selected ? {selected:true} : {})}));
    const value = control.sensitive ? '[private]' : (el.value || '').slice(0, 120);
    if (value) control.value = value;
    return control;
  }) };
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
  private navigations = 0
  private domReady = 0
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
      } else if (["click", "type", "fill", "select"].includes(input.action)) {
        if (
          ["type", "fill", "select"].includes(input.action) &&
          (input.text === undefined || input.text.length > 10000)
        )
          throw new Error("Supply text up to 10,000 characters.")
        if (!this.context || input.revision !== this.revision || !input.target || !Number.isInteger(input.target))
          throw new Error("Observe again, then use a target and revision from that observation.")
        const result = await this.send("Runtime.callFunctionOn", {
          executionContextId: this.context,
          returnByValue: true,
          functionDeclaration: `function(index) {
            const el = globalThis.__oliveNodes?.[index - 1];
            if (!el || !el.isConnected || el.disabled || el.matches(':disabled') || globalThis.__oliveSignature(el) !== globalThis.__oliveSignatures[index - 1]) throw new Error('Control changed. Observe again.');
            const before = el.getBoundingClientRect();
            if (before.bottom <= 0 || before.top >= innerHeight || before.right <= 0 || before.left >= innerWidth) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
            const r = el.getBoundingClientRect(); const x = Math.max(1, Math.min(innerWidth-1, r.x+r.width/2)); const y = Math.max(1, Math.min(innerHeight-1, r.y+r.height/2));
            const hit = document.elementFromPoint(x,y); if (!hit || (hit !== el && !el.contains(hit))) throw new Error('Control is obscured or outside the viewport. Observe or scroll again.');
            return { x, y, sensitive: globalThis.__oliveSensitive(el), readonly: !!el.readOnly || el.getAttribute('aria-readonly') === 'true', unavailable: el.getAttribute('aria-disabled') === 'true', select: el.tagName === 'SELECT', editable: el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['file','checkbox','radio','submit','button','hidden'].includes(el.type)) || el.isContentEditable, href: el.href || null };
          }`,
          arguments: [{ value: input.target }],
        })
        if (result.exceptionDetails) throw new Error("Control changed or is obscured. Observe again.")
        const node = result.result.value
        if (node.sensitive)
          throw new Error("Private fields are for you to fill in the browser. Tell me when you are ready.")
        if (node.unavailable) throw new Error("This control is disabled. Observe the page for an available control.")
        if (["type", "fill", "select"].includes(input.action) && node.readonly)
          throw new Error("This field is read-only. No text was changed.")
        if (node.href) webURL(node.href)
        if (["type", "fill"].includes(input.action) && !node.editable) throw new Error("Choose a text field.")
        if (input.action === "select") {
          if (!node.select) throw new Error("Choose a dropdown from the latest observation.")
          const selected = await this.send("Runtime.callFunctionOn", {
            executionContextId: this.context,
            returnByValue: true,
            functionDeclaration: `function(index, text) {
              const el = globalThis.__oliveNodes?.[index - 1];
              if (!el || !el.isConnected || el.disabled || el.matches(':disabled') || globalThis.__oliveSignature(el) !== globalThis.__oliveSignatures[index - 1]) throw new Error('Control changed. Observe again.');
              if (globalThis.__oliveSensitive(el) || el.getAttribute('aria-disabled') === 'true' || el.getAttribute('aria-readonly') === 'true') throw new Error('Dropdown unavailable.');
              if (el.multiple) throw new Error('Multiple-selection lists need manual handling.');
              const matches = Array.from(el.options).filter(option => option.value === text || option.label === text);
              if (matches.length !== 1) throw new Error('Choose one unique option value or label from the latest observation.');
              const option = matches[0];
              if (option.disabled || option.parentElement?.disabled) throw new Error('That option is disabled.');
              el.value = option.value;
              el.dispatchEvent(new Event('input', {bubbles:true}));
              el.dispatchEvent(new Event('change', {bubbles:true}));
            }`,
            arguments: [{ value: input.target }, { value: input.text }],
          })
          if (selected.exceptionDetails)
            throw new Error(
              selected.exceptionDetails.exception?.description ??
                selected.exceptionDetails.text ??
                "Could not select the option. Observe again.",
            )
        } else {
          await this.send("Input.dispatchMouseEvent", {
            type: "mousePressed",
            x: node.x,
            y: node.y,
            button: "left",
            clickCount: 1,
          })
          const navigations = this.navigations
          const domReady = this.domReady
          await this.send("Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x: node.x,
            y: node.y,
            button: "left",
            clickCount: 1,
          })
          if (input.action === "fill") {
            await this.send("Input.dispatchKeyEvent", {
              type: "rawKeyDown",
              key: "a",
              code: "KeyA",
              modifiers: process.platform === "darwin" ? 4 : 2,
              commands: ["selectAll"],
            })
            await this.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA" })
            await this.send("Input.dispatchKeyEvent", {
              type: "rawKeyDown",
              key: "Backspace",
              code: "Backspace",
              windowsVirtualKeyCode: 8,
              commands: ["deleteBackward"],
            })
            await this.send("Input.dispatchKeyEvent", {
              type: "keyUp",
              key: "Backspace",
              code: "Backspace",
              windowsVirtualKeyCode: 8,
            })
          }
          if (["type", "fill"].includes(input.action) && input.text) {
            await this.send("Input.insertText", { text: input.text })
          }
          if (input.action === "click") await this.settleAfterClick(navigations, domReady, signal)
        }
      } else if (input.action === "press") {
        const key = KEYS[input.key ?? ""]
        if (!key || !input.key) throw new Error(`Press one of: ${Object.keys(KEYS).join(", ")}.`)
        if (!this.context) throw new Error("Observe the page first, then press a key.")
        const focus = await this.send("Runtime.evaluate", { contextId: this.context, returnByValue: true,
          expression: "(() => { const el = document.activeElement; return !!el && el !== document.body && globalThis.__oliveSensitive?.(el) === true })()" })
        if (focus.result?.value === true) throw new Error("Private fields are for you to fill in the browser. Tell me when you are ready.")
        const navigations = this.navigations
        const domReady = this.domReady
        await this.send("Input.dispatchKeyEvent", { type: "keyDown", key: input.key, code: key.code, windowsVirtualKeyCode: key.keyCode, ...(key.text ? { text: key.text } : {}) })
        await this.send("Input.dispatchKeyEvent", { type: "keyUp", key: input.key, code: key.code, windowsVirtualKeyCode: key.keyCode })
        await this.settleAfterClick(navigations, domReady, signal)
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
    const root = browserProfileRoot(executable)
    await mkdir(root, { recursive: true, mode: 0o700 })
    this.profile = await mkdtemp(path.join(root, "olivecode-browser-"))
    if (this.closed) { await rm(this.profile, { recursive: true, force: true }); throw new Error("Browser stopped.") }
    this.child = spawn(executable, ["--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", `--user-data-dir=${this.profile}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-extensions", ...(this.options.headless ? ["--headless=new", "--window-size=1280,900"] : []), "about:blank"], { stdio: "ignore", windowsHide: false })
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
      if (reply.method === "Page.lifecycleEvent" && reply.params.name === "DOMContentLoaded") {
        this.loaded.add(reply.params.loaderId)
        if (reply.params.frameId === this.tab) this.domReady++
      }
      // A page target's main frame ID equals its target ID.
      if (reply.method === "Page.frameStartedLoading" && reply.params.frameId === this.tab) this.navigations++
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

  // Clicks that submit forms or follow links start navigating shortly after the
  // mouse event; observing immediately would show the previous page.
  private async settleAfterClick(navigations: number, domReady: number, signal: AbortSignal) {
    const started = Date.now()
    while (this.navigations === navigations && Date.now() - started < 600) {
      signal.throwIfAborted()
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    if (this.navigations === navigations) return
    this.context = undefined
    while (this.domReady === domReady && Date.now() - started < 10000) {
      signal.throwIfAborted()
      if (this.closed) throw new Error("Browser stopped.")
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
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
