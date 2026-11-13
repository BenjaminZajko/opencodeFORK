// Test adapter: run the exact bundled desktop engine without Electron UI.
// Used by script/smoke-olivecode.py with disposable state and local mock models.
import { readdir } from "node:fs/promises"
import { fileURLToPath, pathToFileURL } from "node:url"
import { resolve, dirname, join } from "node:path"
const chunks = resolve(dirname(fileURLToPath(import.meta.url)), "../out/main/chunks")
const file = (await readdir(chunks)).find((name) => /^node-.*\.js$/.test(name))
if (!file) throw new Error("Build the desktop app before running engine acceptance tests")
const { Server } = await import(pathToFileURL(join(chunks, file)).href)
const server = await Server.listen({ hostname: "127.0.0.1", port: 0 })
console.log(`OliveCode desktop engine listening on ${server.url.href}`)
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => void server.stop(true).finally(() => process.exit(0)))
