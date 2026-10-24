import { expect, test } from "bun:test"
import { terminalCommand, remoteArguments } from "../../src/olivecode/remote-launch"

test("remote launcher preserves spaces, quotes and literal shell substitutions", async () => {
  const values = ["printf", "%s", "/tmp/project ' and $(echo BAD) `echo BAD`"]
  const child = Bun.spawn(["sh", "-c", terminalCommand(values, "darwin")], { stdout: "pipe" })
  expect(await new Response(child.stdout).text()).toBe(values[2]!)
  expect(await child.exited).toBe(0)
  expect(terminalCommand(["C:/x", "a'b"], "win32")).toContain("'a''b'")
  expect(() => terminalCommand(["project\ncommand"])).toThrow("control character")
})
test("remote arguments use the actual executable and explicit project/channel/mode", () => {
  const args = remoteArguments("start", "whatsapp", "/tmp/Project with spaces", "browser")
  expect(args[0]).toBe(process.execPath)
  expect(args.slice(-6)).toEqual(["--channel", "whatsapp", "--dir", "/tmp/Project with spaces", "--mode", "browser"])
})
