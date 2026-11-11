// Drives the real Windows/Linux desktop adapter against a real text editor.
// Usage: bun script/desktop-os-check.ts <app query>   (CI: Notepad on Windows, Mousepad on Linux)
import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { platformCommand } from "../src/computer/desktop-platform"

type Reply = { ok: boolean; error?: string; result?: Record<string, any> }
const query = process.argv[2] ?? (process.platform === "win32" ? "notepad" : "mousepad")
const command = await platformCommand()
const child = spawn(command.binary, command.args, { stdio: ["pipe", "pipe", "inherit"] })
const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]()

async function send(request: Record<string, unknown>) {
  child.stdin.write(JSON.stringify(request) + "\n")
  const next = await Promise.race([lines.next(), Bun.sleep(60_000).then(() => undefined)])
  if (!next || next.done) throw new Error(`No reply to ${request.action}`)
  const reply = JSON.parse(next.value) as Reply
  console.log(`${request.action}: ${reply.ok ? "ok" : "ERROR " + reply.error}`)
  return reply
}
function must(reply: Reply) {
  if (!reply.ok || !reply.result) throw new Error(reply.error ?? "no result")
  return reply.result
}
const editable = (controls: { role: string }[]) =>
  controls.find((control) => ["AXTextArea", "AXTextField", "ControlType.Document", "ControlType.Edit"].includes(control.role))

const failures: string[] = []
async function step(name: string, run: () => Promise<void>) {
  try {
    await run()
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const status = must(await send({ action: "status" }))
console.log("capabilities", JSON.stringify(status.capabilities))

const found = must(await send({ action: "find_app", query }))
console.log("apps", JSON.stringify(found.apps))
const app = found.apps.find((item: { running: boolean }) => !item.running) ?? found.apps[0]
if (!app) throw new Error(`find_app did not find ${query}`)

let observation = must(await send({ action: "activate", app: app.bundle }))
console.log("opened", observation.app, "-", observation.title, "controls:", observation.controls.length)
const field = editable(observation.controls)
if (!field) throw new Error("No editable text control: " + JSON.stringify(observation.controls.map((c: { role: string }) => c.role)))

await step("type", async () => {
  observation = must(await send({ action: "type", text: "Hello from OliveCode", target: field.target, revision: observation.revision }))
  if (!String(observation.text).includes("Hello from OliveCode")) throw new Error("typed text not observed: " + String(observation.text).slice(0, 200))
})
await step("screenshot", async () => {
  const shot = must(await send({ action: "screenshot" }))
  const size = shot.screenshot?.data?.length ?? 0
  if (size < 1000 || shot.screenshot.mime !== "image/png") throw new Error(`bad screenshot (${size} base64 chars)`)
  observation = shot
  console.log("screenshot bytes (base64)", size)
})
await step("click_point", async () => {
  observation = must(await send({ action: "click_point", x: Math.floor(observation.bounds.width / 2), y: Math.floor(observation.bounds.height / 2), revision: observation.revision }))
})
await step("key", async () => {
  observation = must(await send({ action: "key", key: "end", revision: observation.revision }))
})
await step("scroll", async () => {
  observation = must(await send({ action: "scroll", direction: "down", revision: observation.revision }))
})
await send({ action: "close" }).catch(() => undefined)
child.kill()
if (failures.length) {
  console.error("FAILED:\n" + failures.join("\n"))
  process.exit(1)
}
console.log("Desktop adapter check passed on", process.platform)
process.exit(0)
