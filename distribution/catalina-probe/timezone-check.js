import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { isMainThread, parentPort, Worker } from "node:worker_threads"

function check() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  assert.ok(zone, "Runtime must resolve a timezone")
  for (const epoch of [1768478400, 1784116800]) {
    const native = execFileSync("/bin/date", ["-r", String(epoch), "+%z"], { encoding: "utf8" }).trim()
    assert.match(native, /^[+-]\d{4}$/)
    const minutes = (Number(native.slice(1, 3)) * 60 + Number(native.slice(3))) * (native[0] === "+" ? -1 : 1)
    assert.equal(new Date(epoch * 1000).getTimezoneOffset(), minutes + 0, "Runtime and macOS offsets must agree")
  }
  return zone
}

if (!isMainThread) {
  parentPort.postMessage(check())
} else {
  const zone = check()
  const worker = new Worker(new URL(import.meta.url))
  const reported = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.terminate()
      reject(Error("Timezone worker timed out"))
    }, 10000)
    worker.once("message", (value) => {
      clearTimeout(timeout)
      resolve(value)
    })
    worker.once("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
  await worker.terminate()
  assert.equal(reported, zone, "Worker must inherit the local timezone")
  console.log("PASS: timezone " + zone + "; winter/summer offsets agree with macOS in the main thread and worker")
}
