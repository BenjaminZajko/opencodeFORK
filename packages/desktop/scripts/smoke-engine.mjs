// Exercise the actual Electron engine bundle under Node, with no Bun globals.
import assert from "node:assert/strict"
import { mkdtemp, readdir, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve, join } from "node:path"
import { pathToFileURL } from "node:url"

const root = await mkdtemp(join(tmpdir(), "olivecode-desktop-smoke-"))
const directory = join(root, "Project with spaces")
await mkdir(directory)
await writeFile(
  join(directory, "olivecode.json"),
  JSON.stringify({
    computer: { enabled: true, showBrowser: false },
    collaboration: { teamwork: false, followThrough: true },
  }),
)
Object.assign(process.env, {
  XDG_DATA_HOME: join(root, "data"),
  XDG_STATE_HOME: join(root, "state"),
  XDG_CONFIG_HOME: join(root, "config"),
  XDG_CACHE_HOME: join(root, "cache"),
  OPENCODE_SERVER_USERNAME: "opencode",
  OPENCODE_SERVER_PASSWORD: "smoke-only",
  OPENCODE_DISABLE_PROJECT_CONFIG: "false",
})
const chunks = resolve("out/main/chunks")
const file = (await readdir(chunks)).find((name) => /^node-.*\.js$/.test(name))
assert.ok(file, "Build the desktop engine first")
const { Server } = await import(pathToFileURL(join(chunks, file)).href)
let server
try {
  server = await Server.listen({ hostname: "127.0.0.1", port: 0, username: "opencode", password: "smoke-only" })
  const request = async (path, init = {}) => {
    const url = new URL(path, server.url)
    url.searchParams.set("directory", directory)
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: "Basic " + Buffer.from("opencode:smoke-only").toString("base64"),
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(30_000),
    })
    assert.equal(response.status, 200, `${path}: ${await response.clone().text()}`)
    return response.json()
  }
  const unauthenticated = await fetch(new URL("/config", server.url))
  assert.equal(unauthenticated.status, 401)
  assert.equal((await request("/global/health")).healthy, true)
  const before = await request("/config")
  assert.equal(before.computer.showBrowser, false)
  await request("/config", { method: "PATCH", body: JSON.stringify({ computer: { showBrowser: true } }) })
  const after = await request("/config")
  assert.equal(after.computer.enabled, true, "partial update must preserve computer access")
  assert.equal(after.computer.showBrowser, true)
  assert.equal(after.collaboration.teamwork, false, "computer setting must preserve teamwork")
  const pty = await request("/pty", { method: "POST", body: JSON.stringify({ cwd: directory }) })
  assert.ok(pty.id, "embedded terminal must start")
  await request(`/pty/${pty.id}`, { method: "DELETE" })
  const recommendation = await request("/onboarding/recommendation")
  assert.ok(recommendation.profile.ramGb > 0)
  assert.ok(Array.isArray(recommendation.catalog))
  const inventory = await request("/onboarding/ollama")
  assert.equal(typeof inventory.running, "boolean")
  console.log(
    "PASS: authenticated Node engine, project settings persistence, native PTY, hardware recommendations, Ollama inventory",
  )
} finally {
  await server?.stop(true)
  await rm(root, { recursive: true, force: true })
}
