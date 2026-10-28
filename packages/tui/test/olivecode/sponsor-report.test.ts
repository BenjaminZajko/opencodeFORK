import { test, expect } from "bun:test"
import { Database } from "bun:sqlite"
import { generateKeyPairSync, sign } from "node:crypto"
import { createSponsorService } from "../../../../services/sponsors/service"
import { createSponsorReporter } from "../../src/olivecode/sponsor-report"

test("only a visible signed campaign held for a second counts, and clicks deduplicate", async () => {
  const keys = generateKeyPairSync("ed25519")
  const campaign = {
    id: "test",
    name: "Test",
    message: "Original tools",
    website: "https://example.com",
    starts: new Date(Date.now() - 60_000).toISOString(),
    ends: new Date(Date.now() + 60_000).toISOString(),
  }
  const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString()
  const db = new Database(":memory:")
  const service = createSponsorService({
    db,
    publicKey,
    campaign: {
      payload: JSON.stringify(campaign),
      signature: sign(null, Buffer.from(JSON.stringify(campaign)), keys.privateKey).toString("base64url"),
    },
    receiptSecret: "r".repeat(32),
    reportSecret: "s".repeat(32),
  })
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (r) => service(r, "test") })
  try {
    const hidden = createSponsorReporter({ endpoint: server.url.toString(), publicKey, campaign })
    await Bun.sleep(100)
    hidden.stop()
    await Bun.sleep(1150)
    expect(db.query("SELECT * FROM sponsor_daily").all()).toEqual([])
    const visible = createSponsorReporter({ endpoint: server.url.toString(), publicKey, campaign })
    try {
      await Bun.sleep(1300)
      visible.click()
      visible.click()
      await Bun.sleep(100)
      expect(db.query("SELECT views,clicks FROM sponsor_daily").get()).toEqual({ views: 1, clicks: 1 })
    } finally {
      visible.stop()
    }
  } finally {
    server.stop(true)
    db.close()
  }
})
