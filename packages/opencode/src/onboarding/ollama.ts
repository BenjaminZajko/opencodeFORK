import os from "os"
import path from "path"

// Ollama presence, model inventory, and pull streaming. Port of the
// OliveCode advisor/installer.py semantics that the onboarding local
// path relies on: locate the binary (no auto-install; per-OS guidance
// text instead), list pulled models, stream `ollama pull` progress.
//
// All functions are plain async (no Effect) so both the HttpApi handlers
// and unit tests can use them directly. Nothing here throws past its own
// boundary except pullOllamaModel on spawn failure, which the SSE
// endpoint translates into a terminal error line.

export interface OllamaStatus {
  installed: boolean
  binary?: string
  models: string[]
  running: boolean
  details: OllamaModel[]
  error?: string
}

async function existsExecutable(file: string): Promise<boolean> {
  try {
    const f = Bun.file(file)
    return await f.exists()
  } catch {
    return false
  }
}

export async function findOllamaBinary(
  pathEnv?: string,
  extraDirs?: string[] | undefined,
): Promise<string | undefined> {
  const dirs = (pathEnv ?? process.env["PATH"] ?? "").split(path.delimiter).filter(Boolean)
  const names = process.platform === "win32" ? ["ollama.exe", "ollama"] : ["ollama"]
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name)
      if (await existsExecutable(candidate)) return candidate
    }
  }
  // Well-known install locations beyond PATH.
  const extra =
    extraDirs ??
    (process.platform === "win32"
      ? [path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Programs", "Ollama", "ollama.exe")]
      : process.platform === "darwin"
        ? ["/opt/homebrew/bin/ollama", "/usr/local/bin/ollama"]
        : ["/usr/local/bin/ollama", `${os.homedir()}/.ollama/bin/ollama`])
  for (const candidate of extra) {
    if (await existsExecutable(candidate)) return candidate
  }
  return undefined
}

export function parseOllamaList(output: string): string[] {
  // `ollama list` prints a NAME column first; skip the header line.
  const lines = output.trim().split("\n")
  if (lines.length < 2) return []
  const models: string[] = []
  for (const line of lines.slice(1)) {
    const name = line.trim().split(/\s+/)[0]
    if (name) models.push(name)
  }
  return models
}

export async function listOllamaModels(binary: string, timeoutMs = 4000): Promise<string[]> {
  try {
    const proc = Bun.spawn([binary, "list"], { stdout: "pipe", stderr: "pipe" })
    if (!(proc.stdout instanceof ReadableStream)) return []
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        (async () => {
          const out = await new Response(proc.stdout).text()
          await proc.exited
          return proc.exitCode === 0 ? parseOllamaList(out) : []
        })(),
        new Promise<string[]>((resolve) => {
          timer = setTimeout(() => {
            try {
              proc.kill()
            } catch {
              /* already exited */
            }
            resolve([])
          }, timeoutMs)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return []
  }
}

export interface OllamaModel {
  id: string
  sizeGb: number
  quantization?: string
  parameters?: string
  cloud: boolean
}

export function ollamaBaseURL() {
  const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434"
  const url = new URL(host.includes("://") ? host : `http://${host}`)
  if (url.hostname === "0.0.0.0") url.hostname = "127.0.0.1"
  if (url.hostname === "[::]") url.hostname = "[::1]"
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Local models need Ollama on this computer. Set OLLAMA_HOST to a loopback address.")
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("Invalid local Ollama address")
  return url.origin
}

export function validateLocalModel(model: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:+-]*$/.test(model) || /(?:[-:]cloud)(?::|$)/i.test(model))
    throw new Error("Choose a local Ollama model, not a cloud shortcut.")
}

async function ollamaRequest(endpoint: string, method = "GET", body?: object) {
  const response = await fetch(`${ollamaBaseURL()}/api/${endpoint}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    throw new Error("Ollama is not responding. Open Ollama, then retry Local.")
  })
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(detail.error || `Ollama request failed (${response.status}).`)
  }
  return response
}

export async function ollamaStatus(): Promise<OllamaStatus> {
  const binary = await findOllamaBinary()
  try {
    const response = await ollamaRequest("tags")
    const data = (await response.json()) as {
      models: {
        name: string
        size: number
        remote_host?: string
        details?: { quantization_level?: string; parameter_size?: string }
      }[]
    }
    const details = data.models.map((model) => ({
      id: model.name,
      sizeGb: Math.round((model.size / 1e9) * 10) / 10,
      quantization: model.details?.quantization_level,
      parameters: model.details?.parameter_size,
      cloud: Boolean(model.remote_host) || /(?:[-:]cloud)(?::|$)/i.test(model.name),
    }))
    return {
      installed: true,
      binary,
      running: true,
      details,
      models: details.filter((model) => !model.cloud).map((model) => model.id),
    }
  } catch (error) {
    return {
      installed: Boolean(binary),
      binary,
      running: false,
      models: [],
      details: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function inspectOllamaModel(model: string) {
  validateLocalModel(model)
  const response = await ollamaRequest("show", "POST", { model })
  const data = (await response.json()) as {
    remote_host?: string
    capabilities?: string[]
    parameters?: string
    model_info?: Record<string, unknown>
  }
  if (data.remote_host) throw new Error("This is a cloud shortcut, not a local model.")
  const supported = Object.entries(data.model_info ?? {}).find(([key]) => key.endsWith(".context_length"))?.[1]
  const configured = Number(data.parameters?.match(/num_ctx\s+(\d+)/)?.[1] || process.env.OLLAMA_CONTEXT_LENGTH || 4096)
  const context = Math.max(
    2048,
    Math.min(typeof supported === "number" ? supported : 32768, Number.isFinite(configured) ? configured : 4096),
  )
  return {
    id: model,
    baseURL: `${ollamaBaseURL()}/v1`,
    context,
    tools: data.capabilities?.includes("tools") ?? false,
    reasoning: data.capabilities?.includes("thinking") ?? false,
    vision: data.capabilities?.includes("vision") ?? false,
  }
}

export async function deleteOllamaModel(model: string) {
  // This flow manages downloaded models only; Ollama cloud shortcuts are not local files.
  const status = await ollamaStatus()
  if (!status.running) throw new Error(status.error || "Open Ollama, then retry.")
  const entry = status.details.find((item) => item.id === model)
  if (!entry) throw new Error("That model is no longer installed.")
  if (entry.cloud) throw new Error("This is a cloud shortcut, not a downloaded model.")
  await ollamaRequest("delete", "DELETE", { model })
  return true
}

export function ollamaInstallGuidance(): string {
  // Per-OS install text (canonical documented commands; we never
  // auto-install, the user runs one command).
  if (process.platform === "darwin") return "Install Ollama with: brew install ollama — then reopen this dialog."
  if (process.platform === "win32")
    return "Install Ollama from https://ollama.com/download/windows — then reopen this dialog."
  return "Install Ollama with: curl -fsSL https://ollama.com/install.sh | sh — then reopen this dialog."
}

export async function pullOllamaModel(
  binary: string,
  model: string,
  onLine: (line: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  validateLocalModel(model)
  ollamaBaseURL()
  // `ollama pull` streams progress on stderr; forward each line so the
  // caller can render a live status line. Matches installer.py's
  // streaming semantics (stderr carries the bar).
  let proc: ReturnType<typeof Bun.spawn>
  try {
    proc = Bun.spawn([binary, "pull", model], { stdout: "pipe", stderr: "pipe" })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  try {
    const stderr = proc.stderr
    if (!(stderr instanceof ReadableStream)) return { ok: false, error: "no stderr stream" }
    const reader = stderr.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const trimmed = line.trim().replace(/\r/g, "")
        if (trimmed) onLine(trimmed)
      }
    }
    if (buffer.trim()) onLine(buffer.trim().replace(/\r/g, ""))
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  const code = await proc.exited
  if (code !== 0) {
    let detail = ""
    try {
      const stdout = proc.stdout
      if (stdout instanceof ReadableStream) detail = (await new Response(stdout).text()).trim()
    } catch {
      // ignore
    }
    return { ok: false, error: detail || `ollama pull exited with code ${code}` }
  }
  return { ok: true }
}

export * as OnboardingOllama from "./ollama"
