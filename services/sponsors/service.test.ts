import { test, expect } from "bun:test"
import { Database } from "bun:sqlite"
import { generateKeyPairSync, sign } from "node:crypto"
import { createSponsorService } from "./service"

function setup() {
  const keys = generateKeyPairSync("ed25519")
  const payload = JSON.stringify({ id: "pilot", name: "Test", message: "Tools", website: "https://example.com", starts: "2026-10-01", ends: "2026-11-01" })
  let time = Date.parse("2026-10-02")
  const db = new Database(":memory:")
  const service = createSponsorService({ db, campaign: { payload, signature: sign(null, Buffer.from(payload), keys.privateKey).toString("base64url") }, publicKey: keys.publicKey.export({ type: "spki", format: "pem" }).toString(), receiptSecret: "r".repeat(32), reportSecret: "s".repeat(32), now: () => time })
  const request = (path: string, body?: unknown, headers?: HeadersInit) => service(new Request(`https://owned.example/v1/${path}`, { method: path === "report" ? "GET" : "POST", headers, ...(body ? { body: JSON.stringify(body) } : {}) }), "127.0.0.1")
  return { db, request, advance: (ms: number) => { time += ms } }
}
test("only genuine server receipts count, and retries never double count", async () => {
  const app = setup()
  try {
    const { receipt } = await (await app.request("delivery")).json()
    expect((await app.request("event", { receipt, kind: "view" })).status).toBe(409)
    app.advance(1000)
    expect(await (await app.request("event", { receipt, kind: "view" })).json()).toEqual({ accepted: true, duplicate: false })
    expect(await (await app.request("event", { receipt, kind: "view" })).json()).toEqual({ accepted: false, duplicate: true })
    expect((await app.request("event", { receipt, kind: "click" })).status).toBe(200)
    const report = await (await app.request("report", undefined, { Authorization: `Bearer ${"s".repeat(32)}` })).json()
    expect(report.rows).toEqual([{ day: "2026-10-02", campaign: "pilot", views: 1, clicks: 1 }])
  } finally { app.db.close() }
})
test("fake, expired, oversized, and extra-data events are rejected", async () => {
  const app = setup()
  try {
    const { receipt } = await (await app.request("delivery")).json()
    app.advance(1000)
    expect((await app.request("event", { receipt: receipt + "wrong", kind: "view" })).status).toBe(403)
    expect((await app.request("event", { receipt, kind: "view", prompt: "private" })).status).toBe(400)
    expect((await app.request("event", { receipt, kind: "click" })).status).toBe(409)
    expect((await app.request("event", { receipt: "x".repeat(3000), kind: "view" })).status).toBe(400)
    app.advance(300_000)
    expect((await app.request("event", { receipt, kind: "view" })).status).toBe(403)
    expect((await app.request("report")).status).toBe(401)
    expect(app.db.query("SELECT * FROM sponsor_daily").all()).toEqual([])
  } finally { app.db.close() }
})
test("delivery is rate limited and accepts no project data", async () => {
  const app = setup()
  try {
    expect((await app.request("delivery", { project: "private" })).status).toBe(400)
    for (let i = 0; i < 9; i++) expect((await app.request("delivery")).status).toBe(200)
    expect((await app.request("delivery")).status).toBe(429)
    app.advance(60_000)
    expect((await app.request("delivery")).status).toBe(200)
  } finally { app.db.close() }
})
