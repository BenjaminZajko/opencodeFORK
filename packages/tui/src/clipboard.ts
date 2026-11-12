import { execFile, spawn } from "node:child_process"
import { readFile, rm } from "node:fs/promises"
import { platform, release, tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { readGtk, writeGtk } from "./clipboard-linux"

const exec = promisify(execFile)

function command(command: string, args: string[] = [], input?: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(command, args, { stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"] })
    const output: Buffer[] = []
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${command} did not respond`)) }, 5000)
    child.on("error", reject)
    child.stdin?.on("error", reject)
    child.stdout?.on("data", (chunk: Buffer) => output.push(chunk))
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code === 0) return resolve(Buffer.concat(output))
      reject(new Error(`${command} exited with code ${code}`))
    })
    if (input !== undefined) child.stdin?.end(input)
  })
}

export function supportsOsc52(env: NodeJS.ProcessEnv) {
  if (env.VTE_VERSION || env.TERM_PROGRAM === "gnome-terminal" || env.STY) return false
  return env.OLIVECODE_OSC52 === "1" || ["iTerm.app", "WezTerm", "ghostty", "vscode"].includes(env.TERM_PROGRAM ?? "") || env.TERM === "xterm-kitty"
}

function writeOsc52(text: string) {
  if (!process.stdout.isTTY || !supportsOsc52(process.env)) return false
  const sequence = `\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`
  const passthrough = `\x1bPtmux;\x1b${sequence}\x1b\\`
  process.stdout.write(process.env.TMUX ? sequence + passthrough : process.env.STY ? passthrough : sequence)
  return true
}

export async function read() {
  if (platform() === "darwin") {
    const file = path.join(tmpdir(), "opencode-clipboard.png")
    try {
      await exec("osascript", [
        "-e",
        'set imageData to the clipboard as "PNGf"',
        "-e",
        `set fileRef to open for access POSIX file "${file}" with write permission`,
        "-e",
        "set eof fileRef to 0",
        "-e",
        "write imageData to fileRef",
        "-e",
        "close access fileRef",
      ])
      return { data: (await readFile(file)).toString("base64"), mime: "image/png" }
    } catch {
      // Fall through to text clipboard.
    } finally {
      await rm(file, { force: true }).catch(() => {})
    }
  }

  if (platform() === "win32" || release().includes("WSL")) {
    const script =
      "Add-Type -AssemblyName System.Windows.Forms; $img = [System.Windows.Forms.Clipboard]::GetImage(); if ($img) { $ms = New-Object System.IO.MemoryStream; $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); [System.Convert]::ToBase64String($ms.ToArray()) }"
    const image = await command("powershell.exe", ["-NonInteractive", "-NoProfile", "-command", script]).catch(() =>
      Buffer.alloc(0),
    )
    if (image.length) return { data: image.toString().trim(), mime: "image/png" }
    if (platform() === "win32") {
      const text = await command("powershell.exe", ["-NonInteractive", "-NoProfile", "-STA", "-Command", "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard -Raw"]).catch(() => Buffer.alloc(0))
      if (text.length) return { data: text.toString("utf8").replace(/\r?\n$/, ""), mime: "text/plain" }
    }
  }

  if (platform() === "linux") {
    const wayland = await command("wl-paste", ["-t", "image/png"]).catch(() => Buffer.alloc(0))
    if (wayland.length) return { data: wayland.toString("base64"), mime: "image/png" }
    const x11 = await command("xclip", ["-selection", "clipboard", "-t", "image/png", "-o"]).catch(() =>
      Buffer.alloc(0),
    )
    if (x11.length) return { data: x11.toString("base64"), mime: "image/png" }
    // Text: native tools first, then the desktop's GTK clipboard (present on a
    // fresh Ubuntu, where xclip/wl-clipboard are usually not installed).
    const tools: [string, string[]][] = [
      ...(process.env.WAYLAND_DISPLAY ? [["wl-paste", ["--no-newline"]] as [string, string[]]] : []),
      ["xclip", ["-selection", "clipboard", "-o"]],
      ["xsel", ["--clipboard", "--output"]],
    ]
    for (const [binary, args] of tools) {
      const text = await command(binary, args).catch(() => Buffer.alloc(0))
      if (text.length) return { data: text.toString("utf8"), mime: "text/plain" }
    }
    const desktop = await readGtk().catch(() => undefined)
    if (desktop?.data) return desktop
  }

  const { default: clipboardy } = await import("clipboardy")
  const text = await clipboardy.read().catch(() => undefined)
  if (text) return { data: text, mime: "text/plain" }
}

export function copyCommand(
  os: NodeJS.Platform,
  wayland: boolean,
  has: (name: string) => boolean,
): string[] | undefined {
  if (os === "darwin" && has("pbcopy")) return ["pbcopy"]
  if (os === "linux" && wayland && has("wl-copy")) return ["wl-copy"]
  if (os === "linux" && has("xclip")) return ["xclip", "-selection", "clipboard"]
  if (os === "linux" && has("xsel")) return ["xsel", "--clipboard", "--input"]
  if (os === "win32" && has("powershell.exe")) {
    return [
      "powershell.exe",
      "-NonInteractive",
      "-NoProfile",
      "-STA",
      "-Command",
      "[Console]::InputEncoding = [System.Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())",
    ]
  }
}

export async function copyUsing(text: string, options: {
  os: NodeJS.Platform
  wayland: boolean
  has: (name: string) => boolean
  run: (binary: string, args: string[], input: string) => Promise<unknown>
  fallback: (text: string) => Promise<unknown>
  gtk?: (text: string) => Promise<unknown>
  terminal?: (text: string) => boolean
}) {
  const available = new Set(["pbcopy", "wl-copy", "xclip", "xsel", "powershell.exe"].filter(options.has))
  while (available.size) {
    const native = copyCommand(options.os, options.wayland, (name) => available.has(name))
    if (!native) break
    available.delete(native[0]!)
    try { await options.run(native[0]!, native.slice(1), text); return }
    catch { /* A found but broken backend must not be reported as a copy. */ }
  }
  if (options.os === "linux" && options.gtk) {
    try { await options.gtk(text); return } catch {}
  }
  try { await options.fallback(text); return } catch {}
  if (options.terminal?.(text)) return
  throw new Error(options.os === "linux"
    ? "Copy failed. Ubuntu needs a desktop clipboard: install wl-clipboard (Wayland) or xclip (X11), then retry. Selected text was kept."
    : "Copy failed. The system clipboard is unavailable. Selected text was kept; try again.")
}

export async function write(text: string) {
  const { which } = await import("@opencode-ai/core/util/which")
  await copyUsing(text, {
    os: platform(), wayland: Boolean(process.env.WAYLAND_DISPLAY), has: (name) => Boolean(which(name)), run: command,
    gtk: writeGtk, terminal: writeOsc52,
    fallback: async (value) => { const { default: clipboardy } = await import("clipboardy"); await clipboardy.write(value) },
  })
}
