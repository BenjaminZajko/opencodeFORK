import { spawn, execFile } from "node:child_process"
import { access, mkdtemp, writeFile, rm } from "node:fs/promises"
import { constants } from "node:fs"
import { homedir, tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import type { RemoteLaunch, RemoteLaunchResult } from "../../../app/src/remote"

export function remoteArguments(value: RemoteLaunch) {
  if (
    !value ||
    !["setup", "start", "status"].includes(value.action) ||
    !["telegram", "whatsapp"].includes(value.channel) ||
    !["coding", "browser", "visible", "mac"].includes(value.mode) ||
    typeof value.directory !== "string" ||
    !path.isAbsolute(value.directory) ||
    /[\r\n\0]/.test(value.directory)
  )
    throw new Error("Invalid remote launch request")
  return [
    "remote",
    value.action,
    "--channel",
    value.channel,
    ...(value.action === "start" ? ["--dir", value.directory, "--mode", value.mode] : []),
  ]
}

export function terminalCommand(args: string[], platform = process.platform) {
  if (args.some((value) => /[\r\n\0]/.test(value))) throw new Error("Invalid terminal argument")
  const quote = (value: string) => "'" + value.replaceAll("'", platform === "win32" ? "''" : "'\\''") + "'"
  return (platform === "win32" ? "& " : "") + args.map(quote).join(" ")
}

async function executable(candidates: string[]) {
  for (const file of candidates) {
    if (
      await access(file, constants.X_OK).then(
        () => true,
        () => false,
      )
    )
      return file
  }
}

export async function launchRemote(value: RemoteLaunch): Promise<RemoteLaunchResult> {
  const args = remoteArguments(value)
  if (process.platform !== "darwin" && ["visible", "mac"].includes(value.mode) && value.action === "start")
    return "unavailable"
  const name = process.platform === "win32" ? "olivecode.exe" : "olivecode"
  const binary = await executable([
    path.join(homedir(), ".local", "bin", name),
    ...(process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, "OliveCode", "bin", name)] : []),
    ...["/usr/local/bin", "/opt/homebrew/bin"].map((root) => path.join(root, name)),
  ])
  if (!binary) return "missing-cli"
  const command = terminalCommand([binary, ...args])
  if (process.platform === "darwin") {
    // LaunchServices opens a private command file without requesting permission
    // to automate Terminal through Apple Events. The file removes itself after
    // the remote process ends; launch failures clean it up immediately.
    const directory = await mkdtemp(path.join(tmpdir(), "olivecode-remote-"))
    const file = path.join(directory, "OliveCode Remote.command")
    await writeFile(
      file,
      `#!/bin/sh\n${command}\nresult=$?\nrm -- "$0"\nrmdir -- "$(dirname "$0")"\nexit "$result"\n`,
      { mode: 0o700 },
    )
    try {
      await promisify(execFile)("/usr/bin/open", ["-a", "Terminal", file], { timeout: 15_000 })
    } catch (error) {
      await rm(directory, { recursive: true, force: true })
      throw error
    }
    return "opened"
  }
  if (process.platform === "win32") {
    const powershell = path.join(
      process.env.SystemRoot ?? "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    )
    await promisify(execFile)(
      powershell,
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Start-Process '" +
          powershell.replaceAll("'", "''") +
          "' -ArgumentList @('-NoExit','-EncodedCommand','" +
          Buffer.from(command, "utf16le").toString("base64") +
          "')",
      ],
      { windowsHide: true, timeout: 15_000 },
    )
    return "opened"
  }
  const terminal = await executable(["/usr/bin/gnome-terminal", "/usr/bin/konsole", "/usr/bin/xterm"])
  if (!terminal) return "unavailable"
  // Wait for spawn errors, not for the remote task to exit.
  await new Promise<void>((resolve, reject) => {
    const child = spawn(terminal, [path.basename(terminal) === "gnome-terminal" ? "--" : "-e", binary, ...args], {
      detached: true,
      stdio: "ignore",
    })
    child.once("error", reject)
    child.once("spawn", () => {
      child.unref()
      resolve()
    })
  })
  return "opened"
}
