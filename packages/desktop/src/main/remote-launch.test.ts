import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { remoteArguments, terminalCommand } from "./remote-launch"

describe("Remote native launch boundary", () => {
  test("project paths remain one argument, never shell code", () => {
    const directory = process.platform === "win32" ? "C:\\Users\\A & B\\project" : "/tmp/A & B/$(touch nope)/it's mine"
    const args = remoteArguments({ action: "start", channel: "telegram", mode: "browser", directory })
    expect(args).toEqual(["remote", "start", "--channel", "telegram", "--dir", directory, "--mode", "browser"])
    expect(terminalCommand(["olivecode", "a'b", "$(id)"], "darwin")).toBe("'olivecode' 'a'\\''b' '$(id)'")
    expect(terminalCommand(["olivecode.exe", "a'b", "$env:USER"], "win32")).toBe("& 'olivecode.exe' 'a''b' '$env:USER'")
  })
  test("setup never receives project or mode arguments", () => {
    expect(remoteArguments({ action: "setup", channel: "whatsapp", mode: "coding", directory: process.cwd() })).toEqual(
      ["remote", "setup", "--channel", "whatsapp"],
    )
  })
  test("rejects malformed runtime IPC requests", () => {
    const base = { action: "start", channel: "telegram", mode: "coding", directory: process.cwd() }
    for (const patch of [
      { directory: "relative" },
      { directory: "/tmp/a\ncommand" },
      { action: "delete" },
      { channel: "telegram;id" },
      { mode: "coding --help" },
    ]) {
      expect(() => remoteArguments({ ...base, ...patch } as Parameters<typeof remoteArguments>[0])).toThrow()
    }
    expect(() => terminalCommand(["olivecode", "a\rcommand"])).toThrow()
  })
})

test("the native shell preserves a hostile-looking argument literally", async () => {
  const value = "project with spaces ' $(touch SHOULD_NOT_EXIST) & `literal`"
  const command = terminalCommand([process.execPath, "-e", "console.log(JSON.stringify(process.argv.at(-1)))", value])
  const shell =
    process.platform === "win32"
      ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
      : "/bin/sh"
  const args = process.platform === "win32" ? ["-NoProfile", "-NonInteractive", "-Command", command] : ["-c", command]
  const result = await promisify(execFile)(shell, args, { timeout: 10_000 })
  expect(JSON.parse(result.stdout.trim())).toBe(value)
})
