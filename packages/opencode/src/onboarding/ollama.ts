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
      ? [path.join(os.homedir(), "AppData", "Local", "Programs", "Ollama", "ollama.exe")]
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

export async function listOllamaModels(binary: string): Promise<string[]> {
  try {
    const proc = Bun.spawn([binary, "list"], { stdout: "pipe", stderr: "pipe" })
    if (!(proc.stdout instanceof ReadableStream)) return []
    const out = await new Response(proc.stdout).text()
    await proc.exited
    if (proc.exitCode !== 0) return []
    return parseOllamaList(out)
  } catch {
    return []
  }
}

export async function ollamaStatus(): Promise<OllamaStatus> {
  const binary = await findOllamaBinary()
  if (!binary) return { installed: false, models: [] }
  return { installed: true, binary, models: await listOllamaModels(binary) }
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
