import { expect, test } from "bun:test"
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { ComputerDesktop } from "../../src/computer/desktop"

async function fixture(run: (binary: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), "olivecode-desktop-test-"))
  const binary = path.join(directory, "helper")
  await writeFile(binary, `#!${process.execPath}
import { createInterface } from "node:readline";
let count = 0;
for await (const line of createInterface({ input: process.stdin })) {
  const input = JSON.parse(line);
  if (input.action === "observe") await Bun.sleep(500);
  if (input.action === "key") { process.stdout.write("invalid-json\\n"); continue; }
  if (input.action === "fill") { process.stdout.write(JSON.stringify({ok:false,error:"Private fields must be handled by the human."})+"\\n"); continue; }
  process.stdout.write(JSON.stringify({ok:true,result:{count:++count,action:input.action}})+"\\n");
}
`)
  await chmod(binary, 0o755)
  try { await run(binary) } finally { await rm(directory, { recursive: true, force: true }) }
}

test("desktop transport persists its helper and surfaces native failures", async () => fixture(async (binary) => {
  const desktop = new ComputerDesktop.Desktop(binary)
  try {
    const signal = new AbortController().signal
    expect((await desktop.perform({ action: "status" }, signal)).count).toBe(1)
    await expect(desktop.perform({ action: "fill" }, signal)).rejects.toThrow("Private fields")
    expect((await desktop.perform({ action: "status" }, signal)).count).toBe(2)
  } finally { desktop.close() }
}))

test("desktop serializes startup, locks competing chats, and releases on Stop", async () => fixture(async (binary) => {
  const first = new ComputerDesktop.Desktop(binary), second = new ComputerDesktop.Desktop(binary)
  try {
    const signal = new AbortController().signal
    const operation = first.perform({ action: "observe" }, signal)
    await expect(first.perform({ action: "status" }, signal)).rejects.toThrow("Concurrent desktop action rejected")
    await expect(second.perform({ action: "status" }, signal)).rejects.toThrow("Another chat")
    const rejected = operation.catch((error: Error) => error)
    first.close(); expect((await rejected as Error).message).toContain("stopped")
    expect((await second.perform({ action: "status" }, signal)).count).toBe(1)
    await expect(first.perform({ action: "status" }, signal)).rejects.toThrow("stopped")
  } finally { first.close(); second.close() }
}))

test("desktop abort kills a pending action and prevents subsequent input", async () => fixture(async (binary) => {
  const desktop = new ComputerDesktop.Desktop(binary), controller = new AbortController()
  try {
    await desktop.perform({ action: "status" }, controller.signal)
    const operation = desktop.perform({ action: "observe" }, controller.signal)
    const rejected = operation.catch((error: Error) => error)
    controller.abort(); expect((await rejected as Error).message).toContain("stopped")
    await expect(desktop.perform({ action: "status" }, new AbortController().signal)).rejects.toThrow("stopped")
  } finally { desktop.close() }
}))

test("desktop fails closed on malformed helper output", async () => fixture(async (binary) => {
  const desktop = new ComputerDesktop.Desktop(binary)
  try {
    const signal = new AbortController().signal
    await expect(desktop.perform({ action: "key" }, signal)).rejects.toThrow("Invalid response")
    await expect(desktop.perform({ action: "status" }, signal)).rejects.toThrow("stopped")
  } finally { desktop.close() }
}))

test("desktop rejects already cancelled tasks without starting a helper", async () => fixture(async (binary) => {
  const desktop = new ComputerDesktop.Desktop(binary), controller = new AbortController()
  controller.abort()
  try { await expect(desktop.perform({ action: "status" }, controller.signal)).rejects.toThrow("stopped") }
  finally { desktop.close() }
}))

const native = process.env.OLIVECODE_DESKTOP_TEST_HELPER
test("waiting for approval preserves the helper beyond its idle deadline", async () => fixture(async (binary) => {
  const desktop = new ComputerDesktop.Desktop(binary, 40)
  let release = () => {}
  try {
    const signal = new AbortController().signal
    expect((await desktop.perform({ action: "status" }, signal)).count).toBe(1)
    release = desktop.hold()
    await Bun.sleep(120)
    expect((await desktop.perform({ action: "status" }, signal)).count).toBe(2)
    release(); release()
    await Bun.sleep(120)
    await expect(desktop.perform({ action: "status" }, signal)).rejects.toThrow("stopped")
  } finally { release(); desktop.close() }
}))

test("Stop while awaiting approval stays stopped even after approval releases", async () => fixture(async (binary) => {
  const desktop = new ComputerDesktop.Desktop(binary, 40)
  let release = () => {}
  try {
    const signal = new AbortController().signal
    await desktop.perform({ action: "status" }, signal)
    release = desktop.hold()
    desktop.close()
    release()
    await expect(desktop.perform({ action: "activate", app: "com.apple.TextEdit" }, signal)).rejects.toThrow("stopped")
    expect(() => desktop.hold()).toThrow("stopped")
  } finally { release(); desktop.close() }
}))

test.skipIf(!native)("native macOS helper reports OS permissions without reading the desktop", async () => {
  const desktop = new ComputerDesktop.Desktop(native)
  try {
    const status = await desktop.perform({ action: "status" }, new AbortController().signal)
    expect(status.platform).toBe("macOS")
    expect(typeof status.accessibility).toBe("boolean")
    expect(typeof status.screenRecording).toBe("boolean")
    expect(status.ready).toBe(status.accessibility)
    expect(String(status.setup)).toContain(status.accessibility ? "already enabled" : "Enable OliveCode Computer")
    expect(status).not.toHaveProperty("text")
    expect(status).not.toHaveProperty("screenshot")
  } finally { desktop.close() }
})


test("background transport proves isolation before forwarding app actions", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "olivecode-remote-test-"))
  const ssh = path.join(directory, "ssh")
  await writeFile(ssh, `#!${process.execPath}
import { createInterface } from "node:readline";
let proven = false;
for await (const line of createInterface({ input: process.stdin })) {
  const input = JSON.parse(line);
  if (input.action === "_identity") { proven = true; console.log(JSON.stringify({ok:true,result:{identity:"${"b".repeat(64)}"}})); continue; }
  console.log(JSON.stringify({ok:true,result:{action:input.action,proven}}));
}
`)
  await chmod(ssh, 0o755)
  const signal = new AbortController().signal
  const allowed = new ComputerDesktop.Desktop(ssh, 10000, { host: "guest", localIdentity: "a".repeat(64), sshBinary: ssh })
  const refused = new ComputerDesktop.Desktop(ssh, 10000, { host: "host", localIdentity: "b".repeat(64), sshBinary: ssh })
  try {
    expect(await allowed.perform({ action: "activate", app: "com.apple.TextEdit" }, signal)).toEqual({ action: "activate", proven: true })
    await expect(refused.perform({ action: "activate", app: "com.apple.TextEdit" }, signal)).rejects.toThrow("main Mac")
    const duplicate = new ComputerDesktop.Desktop(ssh, 10000, { host: "another-alias", localIdentity: "a".repeat(64), sshBinary: ssh })
    try { await expect(duplicate.perform({ action: "type", text: "Must not type" }, signal)).rejects.toThrow("Another chat") } finally { duplicate.close() }
  } finally { allowed.close(); refused.close(); await rm(directory, { recursive: true, force: true }) }
})


test("Stop lets the helper handle SIGTERM instead of killing before mouse release", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "olivecode-stop-test-"))
  const marker = path.join(directory, "released")
  const binary = path.join(directory, "helper")
  await writeFile(binary, `#!${process.execPath}
import { createInterface } from "node:readline";
process.on("SIGTERM", () => { require("node:fs").writeFileSync(${JSON.stringify(marker)}, "released"); process.exit(0); });
for await (const line of createInterface({ input: process.stdin })) console.log(JSON.stringify({ok:true,result:{ready:true}}));
await new Promise(() => {});
`)
  await chmod(binary, 0o755)
  const desktop = new ComputerDesktop.Desktop(binary)
  try {
    await desktop.perform({ action: "status" }, new AbortController().signal)
    desktop.close()
    const deadline = Date.now() + 2000
    while (!await Bun.file(marker).exists() && Date.now() < deadline) await Bun.sleep(20)
    expect(await Bun.file(marker).text()).toBe("released")
  } finally { desktop.close(); await rm(directory, { recursive: true, force: true }) }
})
