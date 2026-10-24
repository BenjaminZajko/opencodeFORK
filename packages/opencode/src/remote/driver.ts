import { setTimeout } from "node:timers/promises"
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2"
import { ServerAuth } from "../server/auth"
import { ModeLabels, Modes, type Driver, type Hooks, type Task, type Mode } from "./controller"

export async function localRemoteDriver(directory: string, model?: string, modes: readonly Mode[] = ["coding"], channel = "Telegram"): Promise<Driver> {
  const { Server } = await import("../server/server")
  const sdk = createOpencodeClient({
    directory, baseUrl: "http://olivecode.internal",
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const headers = new Headers(request.headers)
      const auth = ServerAuth.header()
      if (auth) headers.set("Authorization", auth)
      return Server.Default().app.fetch(new Request(request, { headers }))
    }) as typeof fetch,
  })
  return sdkRemoteDriver(sdk, model, modes, channel)
}

export function remoteContext(agent: string, modes: readonly Mode[], channel = "Telegram") {
  const mode = (Object.keys(Modes) as Mode[]).find((key) => Modes[key] === agent) ?? "coding"
  return `OLIVECODE REMOTE · ${channel.toUpperCase()}\nCurrent mode: ${ModeLabels[mode]}.\nEnabled phone choices: ${modes.map((key) => `/mode ${key} (${ModeLabels[key]})`).join(", ")}.\nUse your available tools to complete the request, verify the result, and send a short final answer. Preserve quoted text exactly, including spelling; do not silently correct it. Ordinary public search and route fields are supported: use their observed targets when sensitive is false. A private field block applies only to that field, not to the whole website. Never bypass a genuinely private field. If an input is covered, inspect the fresh page for a consent dialog; prefer rejecting optional cookies when that choice is available, then retry the intended field after the dialog closes. Do not invent security restrictions or claim an app is missing based on a failed shell/PATH search. Permissions are handled by Telegram buttons; ask for clarification in final text if needed, not the unavailable question tool. A 90-minute grant only approves pending permitted operations; it never unlocks unavailable tools or overrides denied permissions.\n${mode === "coding"
    ? "Coding mode has file and coding tools but NO desktop or browser control. For a request to open an app, use its UI, move the cursor, or interact with a website, do not search for app executables with shell commands or try to automate it through bash/AppleScript. Explain that the user must choose /mode visible for this Mac's apps, /mode browser for isolated websites, or /mode mac for the isolated Mac, if locally enabled, then resend the request. If disabled, ask them to open /remote locally and choose the matching start option. File creation inside the selected project is supported: request the normal edit approval rather than telling the user to do it manually."
    : mode === "browser" ? "This is a headless browser, not the user's existing Chrome app. Use browser for website tasks. For a specifically requested native app, explain /mode visible or /mode mac instead; do not claim it is not installed."
    : "For an unknown app such as Google Chrome for Testing, call desktop with action find_app and query equal to the requested name, then activate the observed bundle identifier. A nonempty apps result proves those matching apps were found; use that result, never report that none were installed. If activation fails, report activation failure separately from app discovery. App metadata may be outside /Applications, including framework caches. Use desktop for the requested app's UI; browser is a separate controlled browser, not that app's window. Verify each action from fresh observations. If native lookup finds no app, report that lookup result without claiming exhaustive proof of absence."}`.replaceAll("Telegram", channel)
}

export function sdkRemoteDriver(sdk: OpencodeClient, model?: string, modes: readonly Mode[] = ["coding"], channel = "Telegram"): Driver {
  const selected = model ? { providerID: model.slice(0, model.indexOf("/")), modelID: model.slice(model.indexOf("/") + 1) } : undefined
  return {
    async create(agent, session) {
      const created = session ? undefined : await sdk.session.create({ title: `${channel} · OliveCode Remote`, permission: [
        { permission: "*", pattern: "*", action: "ask" },
        { permission: "external_directory", pattern: "*", action: "deny" },
        { permission: "question", pattern: "*", action: "deny" },
        { permission: "plan_enter", pattern: "*", action: "deny" },
        { permission: "plan_exit", pattern: "*", action: "deny" },
      ] })
      const id = session ?? created?.data?.id
      if (!id) throw new Error("Could not create remote chat")
      const task: Task = {
        id,
        stop: async () => {
          const result = await sdk.session.abort({ sessionID: id })
          if (result.error) throw new Error("Could not stop remote task")
          const pending = await sdk.permission.list()
          if (pending.error) throw new Error("Task stopped, but pending approvals could not be cleared")
          for (const request of pending.data ?? []) {
            if (await belongs(sdk, request.sessionID, id)) await sdk.permission.reply({ requestID: request.id, reply: "reject" })
          }
        },
        approve: async (requestID, allow) => {
          const result = await sdk.permission.reply({ requestID, reply: allow ? "once" : "reject" })
          if (result.error) throw new Error("Permission response failed")
        },
        run: async (text, signal, hooks) => run(sdk, id, agent, selected, text, signal, hooks, remoteContext(agent, modes, channel)),
      }
      return task
    },
  }
}

async function belongs(sdk: OpencodeClient, session: string, root: string, signal?: AbortSignal) {
  for (let depth = 0; depth < 8; depth++) {
    if (session === root) return true
    const result = await sdk.session.get({ sessionID: session }, { signal })
    if (!result.data?.parentID) return false
    session = result.data.parentID
  }
  return false
}

async function run(sdk: OpencodeClient, sessionID: string, agent: string, model: { providerID: string; modelID: string } | undefined, text: string, signal: AbortSignal, hooks: Hooks, system: string) {
  const polling = new AbortController()
  const combined = AbortSignal.any([signal, polling.signal])
  const seen = new Set<string>()
  const permissions = new Set<string>()
  const sessions = new Set([sessionID])
  let lastMessages = 0
  const baseline = await sdk.session.messages({ sessionID, limit: 8 }, { signal })
  if (baseline.error) throw new Error("Could not read remote chat")
  for (const message of baseline.data ?? []) for (const part of message.parts) {
    if (part.type === "tool") seen.add(part.id)
  }
  async function owns(id: string): Promise<boolean> {
    if (sessions.has(id)) return true
    const chain: string[] = []
    for (let depth = 0; depth < 8; depth++) {
      const result = await sdk.session.get({ sessionID: id }, { signal: combined })
      if (!result.data?.parentID) return false
      chain.push(id); id = result.data.parentID
      if (sessions.has(id)) { chain.forEach((id) => sessions.add(id)); return true }
    }
    return false
  }
  async function collect(final = false) {
    const pending = await sdk.permission.list(undefined, { signal: combined })
    if (pending.error) throw new Error("Could not check remote approvals")
    for (const permission of pending.data ?? []) {
      if (permissions.has(permission.id) || !await owns(permission.sessionID)) continue
      permissions.add(permission.id)
      await hooks.permission(permission)
    }
    if (!final && Date.now() - lastMessages < 2000) return
    lastMessages = Date.now()
    const messages = await sdk.session.messages({ sessionID, limit: 8 }, { signal: combined })
    if (messages.error) throw new Error("Could not check remote progress")
    for (const message of messages.data ?? []) for (const part of message.parts) {
      if (part.type !== "tool") continue
      if (part.state.status === "running") await hooks.progress(`Using ${part.tool}`)
      if (part.state.status !== "completed" || seen.has(part.id)) continue
      seen.add(part.id)
      for (const file of part.state.attachments ?? []) {
        if (!["browser", "desktop"].includes(part.tool)) continue
        const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(file.url)
        if (!match || match[2]!.length > 12 * 1024 * 1024) continue
        await hooks.photo(match[1]!, new Uint8Array(Buffer.from(match[2]!, "base64")))
      }
    }
  }
  // Poll the in-process API: no exposed port, SSE reconnect races or duplicate event execution.
  const watcher = (async () => {
    while (!combined.aborted) {
      await collect()
      await setTimeout(500, undefined, { signal: combined }).catch(() => {})
    }
  })()
  void watcher.catch(() => {})
  try {
    const result = await Promise.race([
      sdk.session.prompt({ sessionID, agent, model, system, parts: [{ type: "text", text }] }, { signal }),
      watcher.then(() => { throw new Error("Remote progress connection closed") }),
    ])
    if (result.error) throw new Error("Remote task failed", { cause: result.error })
    await collect(true)
    const messages = await sdk.session.messages({ sessionID }, { signal })
    if (messages.error) throw new Error("Could not read remote result")
    const userID = messages.data?.findLast((message) => message.info.role === "user")?.info.id
    const response = messages.data?.findLast((message) => message.info.role === "assistant" && message.info.parentID === userID && message.parts.some((part) => part.type === "text" && !part.synthetic && !part.ignored && part.text.trim()))
    if (!response) return "No final response was provided. Check this Telegram task in OliveCode locally."
    const answer = response.parts.flatMap((part) => part.type === "text" && !part.synthetic && !part.ignored ? [part.text] : []).join("\n\n")
    const info = response.info
    return `${answer}\n\n— ${info.role === "assistant" ? info.modelID : "OliveCode"}`
  } finally {
    polling.abort()
    await watcher.catch(() => {})
  }
}
