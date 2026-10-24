import "./runtime-adapters.ts"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { Database } from "bun:sqlite"
assert.equal(Bun.stringWidth("中文"), 4)
assert.equal(Bun.stringWidth("👩‍💻"), 2)
assert.equal(Bun.stringWidth("\x1b[32mABC\x1b[0m"), 3)
assert.deepEqual(
  new Map([
    [1, 2],
    [2, 3],
  ])
    .values()
    .flatMap((x) => [x, x * 2])
    .toArray(),
  [2, 4, 3, 6],
)
const one = new AbortController(),
  two = new AbortController()
const combined = AbortSignal.any([one.signal, two.signal])
assert.equal(combined.aborted, false)
two.abort("reason")
assert.equal(combined.reason, "reason")
assert.equal(AbortSignal.any([two.signal]).reason, "reason")
assert.throws(() => AbortSignal.any([{}]), TypeError)
const decoder = new TextDecoderStream()
const reader = decoder.readable.getReader()
const writer = decoder.writable.getWriter()
let decoded = ""
const consume = (async () => {
  while (true) {
    const next = await reader.read()
    if (next.done) break
    decoded += next.value
  }
})()
const bytes = new TextEncoder().encode("olive 🫒 č")
for (const byte of bytes) await writer.write(new Uint8Array([byte]))
await writer.close()
await consume
assert.equal(decoded, "olive 🫒 č")
const db = new Database(":memory:")
const statement = db.query("SELECT 42 AS number")
assert.equal(statement.safeIntegers(false).get().number, 42)
assert.throws(() => statement.safeIntegers(true), /64-bit SQLite/)
db.close()
const child = spawn("/bin/sh", ["-c", "printf subprocess"])
let starts = 0
child.on("spawn", () => starts++)
child.stdout.resume()
child.stderr.resume()
await new Promise((resolve, reject) => {
  child.on("close", resolve)
  child.on("error", reject)
})
assert.equal(starts, 1)
assert.equal(child.exitCode, 0)
assert.throws(() => spawn("/definitely/not/an/executable", []), /Executable not found/)
console.log(
  "PASS: Unicode cell width, iterator chains, cancellation, split UTF-8 streaming and explicit SQLite capability checks",
)
