import { expect, test } from "bun:test"
import { once } from "node:events"
import { createConnection } from "node:net"
import { stat } from "node:fs/promises"
import path from "node:path"
import { launchHelper } from "../../src/computer/desktop-launch"

const binary = process.env.OLIVECODE_APP_TEST_HELPER

test.skipIf(process.platform !== "darwin" || !binary)("app launch authenticates its worker and Stop removes its private channel", async () => {
  const child = await launchHelper(binary!)
  const address = child.spawnargs[child.spawnargs.indexOf("--stdio-socket") + 1]!
  expect((await stat(path.dirname(address))).mode & 0o777).toBe(0o700)
  const intruder = createConnection(address)
  intruder.on("error", () => {})
  intruder.on("connect", () => intruder.end(JSON.stringify({nonce:"wrong",pid:process.pid})+"\n"))
  const reply = once(child.stdout, "data")
  const exited = once(child, "exit")
  child.stdin.write('{"action":"status"}\n')
  try {
    const [bytes] = await reply
    const value = JSON.parse(bytes.toString())
    expect(value.ok).toBe(true)
    expect(value.result.platform).toBe("macOS")
    expect(typeof value.result.accessibility).toBe("boolean")
    expect(bytes.toString()).not.toContain("nonce")
  } finally { intruder.destroy(); child.stdin.destroy(); child.kill("SIGTERM") }
  await exited
  await expect(stat(path.dirname(address))).rejects.toThrow()
}, 30000)

test.skipIf(process.platform !== "darwin" || !binary)("Stop before app connection cannot send the queued action", async () => {
  const child = await launchHelper(binary!)
  const exited = once(child, "exit")
  const messages: string[] = []
  child.stdout.on("data", (bytes) => messages.push(bytes.toString()))
  child.kill("SIGTERM")
  await exited
  expect(messages).toEqual([])
}, 30000)
