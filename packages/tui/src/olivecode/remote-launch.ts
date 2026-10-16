import path from "node:path"

export function remoteArguments(action: "setup" | "start" | "status", channel: "telegram" | "whatsapp", directory: string, mode?: string) {
  const compiled = /^(olivecode|opencode)(\.exe)?$/i.test(path.basename(process.execPath))
  return [process.execPath, ...(!compiled ? [process.argv[1]!] : []), "remote", action, "--channel", channel,
    ...(action === "start" ? ["--dir", directory, "--mode", mode ?? "coding"] : [])]
}

export function terminalCommand(args: string[], platform = process.platform) {
  if (args.some(value => /[\r\n\0]/.test(value))) throw new Error("The project path contains an unsupported control character.")
  const quote = (value: string) => "'" + value.replaceAll("'", platform === "win32" ? "''" : "'\\''") + "'"
  return (platform === "win32" ? "& " : "") + args.map(quote).join(" ")
}

export async function launchRemoteTerminal(args: string[]) {
  const command = terminalCommand(args)
  const launcher = process.platform === "darwin"
    ? ["osascript", "-e", 'on run argv\ntell application "Terminal"\nactivate\ndo script (item 1 of argv)\nend tell\nend run', "--", command]
    : process.platform === "win32" ? ["powershell.exe", "-NoProfile", "-Command", "Start-Process powershell.exe -ArgumentList @('-NoExit','-EncodedCommand','" + Buffer.from(command, "utf16le").toString("base64") + "')"]
    : Bun.which("gnome-terminal") ? ["gnome-terminal", "--", ...args]
    : Bun.which("konsole") ? ["konsole", "-e", ...args]
    : Bun.which("xterm") ? ["xterm", "-e", ...args]
    : undefined
  if (!launcher) throw new Error("No supported terminal launcher found. Copy the command instead.")
  const child = Bun.spawn(launcher, { stdin: "ignore", stdout: "ignore", stderr: "pipe" })
  // Linux terminal emulators may remain attached until the remote process exits.
  if (process.platform === "linux") { child.unref(); return }
  if (await child.exited !== 0) throw new Error("Could not open a terminal. Use Copy command instead.")
}
