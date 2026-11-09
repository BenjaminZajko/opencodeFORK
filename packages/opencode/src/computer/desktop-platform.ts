import { readFile } from "node:fs/promises"

declare const OLIVECODE_WINDOWS_DESKTOP: string
declare const OLIVECODE_LINUX_DESKTOP: string

/** Fixed app-owned source only. Model requests travel over stdin as JSON; they
 * never become PowerShell/Python source, executable names or command arguments.
 */
export async function platformCommand(platform = process.platform): Promise<{ binary: string; args: string[] }> {
  if (platform === "win32") {
    const encoded = typeof OLIVECODE_WINDOWS_DESKTOP === "string" ? OLIVECODE_WINDOWS_DESKTOP : undefined
    const source = encoded ? Buffer.from(encoded, "base64").toString("utf8") : await readFile(new URL("./native/desktop-windows.ps1", import.meta.url), "utf8")
    // Windows PowerShell is an OS component. Do not search PATH for an
    // untrusted powershell.exe or change the user's execution/security policy.
    const root = process.env.SystemRoot ?? "C:\\Windows"
    return { binary: `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`, args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-Command", source] }
  }
  if (platform === "linux") {
    const encoded = typeof OLIVECODE_LINUX_DESKTOP === "string" ? OLIVECODE_LINUX_DESKTOP : undefined
    const source = encoded ? Buffer.from(encoded, "base64").toString("utf8") : await readFile(new URL("./native/desktop-linux.py", import.meta.url), "utf8")
    // Use the distribution interpreter so distro-provided pyatspi is visible.
    return { binary: "/usr/bin/python3", args: ["-I", "-u", "-c", source] }
  }
  throw new Error("Native desktop control is available for macOS, Windows and Linux only. Use Browser mode on this platform.")
}

export * as DesktopPlatform from "./desktop-platform"
