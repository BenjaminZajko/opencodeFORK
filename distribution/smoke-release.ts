import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"

const binary = path.resolve(process.argv[2] ?? "")
const version = process.argv[3]
if (!version || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version))
  throw new Error("Usage: bun distribution/smoke-release.ts <executable> <version>")

const home = await mkdtemp(path.join(tmpdir(), "olivecode-release-smoke-"))
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !key.startsWith("OPENCODE_") && !key.startsWith("OLIVECODE_") && !/_(?:API_KEY|TOKEN)$/.test(key),
))
Object.assign(env, {
  HOME: home, USERPROFILE: home, OPENCODE_TEST_HOME: home,
  XDG_DATA_HOME: path.join(home, "data"), XDG_CONFIG_HOME: path.join(home, "config"),
  XDG_STATE_HOME: path.join(home, "state"), XDG_CACHE_HOME: path.join(home, "cache"),
  OPENCODE_DISABLE_MODELS_FETCH: "1", OPENCODE_DISABLE_AUTOUPDATE: "1",
})
try {
  for (const [args, expected] of [
    [["--version"], version],
    [["--help"], "OliveCode"],
    [["upgrade"], "To update OliveCode, run its install command again"],
  ] as const) {
    const child = Bun.spawn([binary, ...args], { cwd: home, env, stdout: "pipe", stderr: "pipe" })
    const timer = setTimeout(() => child.kill(), 30000)
    try {
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
      ])
      if (code !== 0 || !(args[0] === "--version" ? stdout.trim() === expected : (stdout + stderr).includes(expected)))
        throw new Error(`Release smoke failed (${args.join(" ")}): ${code}\n${stdout}\n${stderr}`)
    } finally { clearTimeout(timer) }
  }
  console.log(`Release ${version}: version, CLI startup and OliveCode updater isolation passed`)
} finally { await rm(home, { recursive: true, force: true }) }
