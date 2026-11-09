import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { PassThrough } from "node:stream"
import { mkdir, rm } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import path from "node:path"

/** LaunchServices gives the approved app its own macOS privacy identity.
 * A private, authenticated Unix socket carries the existing JSON protocol.
 */
export async function launchHelper(binary: string) {
  const root = path.join("/private/tmp", `olivecode-${randomUUID()}`)
  await mkdir(root, { mode: 0o700 })
  const address = path.join(root, "s")
  const nonce = randomUUID()
  const input = new PassThrough()
  const output = new PassThrough()
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(address, resolve)
  }).catch(async (error) => { await rm(root, { recursive: true, force: true }); throw error })
  const child = spawn("/usr/bin/open", ["-n", "-W", "-g", path.resolve(binary, "../../.."), "--args", "--stdio-socket", address, nonce], { stdio: ["pipe", "pipe", "pipe"] })
  const launchKill = child.kill.bind(child)
  child.stdin.destroy()
  child.stdout.resume()
  let pid: number | undefined
  let stopping: NodeJS.Signals | undefined
  let connected = false
  let force: ReturnType<typeof setTimeout> | undefined
  const sockets = new Set<import("node:net").Socket>()
  const kill = (signal: NodeJS.Signals | number = "SIGTERM") => {
    stopping = typeof signal === "string" ? signal : "SIGTERM"
    input.destroy()
    if (pid) {
      try { process.kill(pid, signal) } catch {}
      clearTimeout(force)
      if (signal !== "SIGKILL") {
        force = setTimeout(() => { if (pid) { try { process.kill(pid, "SIGKILL") } catch {} } }, 1000)
        force.unref()
      }
    }
    return true
  }
  const cleanup = () => {
    clearTimeout(timer)
    clearTimeout(force)
    if (child.exitCode === 0) pid = undefined
    kill()
    for (const socket of sockets) socket.destroy()
    server.close()
    output.destroy()
    void rm(root, { recursive: true, force: true })
  }
  const timer = setTimeout(() => {
    if (connected) return
    child.emit("error", new Error("OliveCode Computer did not connect. Retry Visible Control."))
    launchKill("SIGTERM")
    cleanup()
  }, 15000)
  timer.unref()
  server.on("connection", (socket) => {
    sockets.add(socket)
    socket.on("error", () => socket.destroy())
    socket.on("close", () => sockets.delete(socket))
    let header = ""
    const authenticate = (chunk: Buffer) => {
      header += chunk.toString()
      if (header.length > 4096) { socket.destroy(); return }
      const end = header.indexOf("\n")
      if (end < 0) return
      const hello = (() => { try { return JSON.parse(header.slice(0, end)) as { nonce?: string; pid?: number } } catch { return undefined } })()
      if (connected || hello?.nonce !== nonce || !Number.isSafeInteger(hello.pid) || hello.pid! <= 1) { socket.destroy(); return }
      connected = true
      pid = hello.pid
      socket.once("close", () => { pid = undefined; clearTimeout(force) })
      clearTimeout(timer)
      socket.removeListener("data", authenticate)
      if (stopping) { kill(stopping); return }
      if (header.length > end + 1) output.write(header.slice(end + 1))
      socket.pipe(output)
      input.pipe(socket)
    }
    socket.on("data", authenticate)
  })
  child.once("error", cleanup)
  child.once("exit", cleanup)
  return Object.assign(child, { stdin: input, stdout: output, kill })
}
