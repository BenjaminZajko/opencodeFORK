import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
const origin = "http://127.0.0.1:8843"
const day = new Date().toISOString().slice(0, 10)
const event = { day, id: randomBytes(32).toString("hex"), version: "0.0.0-localcheck", platform: "linux", first: true }
const send = (value) =>
  fetch(origin + "/v1/usage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  })
assert.equal((await fetch(origin + "/health")).status, 200)
assert.equal((await fetch(origin + "/v1/report")).status, 401)
assert.deepEqual(await (await send(event)).json(), { accepted: true, duplicate: false })
assert.deepEqual(await (await send(event)).json(), { accepted: false, duplicate: true })
assert.equal((await send({ ...event, prompt: "must be rejected" })).status, 400)
const report = await (
  await fetch(origin + "/v1/report", { headers: { Authorization: "Bearer local-report-secret-not-for-production" } })
).json()
assert.ok(report.usage.some((row) => row.version === event.version && row.active_installations >= 1))
assert.ok(!JSON.stringify(report).includes(event.id))
console.log(
  "Worker integration passed: persistent SQLite, deduplicated usage, private report, extra-data rejection, no raw tokens in reports.",
)
