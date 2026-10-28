import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import { verifySponsor, type SignedSponsor } from "../../packages/core/src/olivecode/sponsor"

export type ReportingDatabase = {
  exec(sql: string): unknown
  query(sql: string): {
    run(...bindings: (string | number)[]): { changes: number }
    get(...bindings: (string | number)[]): unknown
    all(...bindings: (string | number)[]): unknown[]
  }
  transaction<T>(fn: () => T): () => T
}
type Options = {
  db: ReportingDatabase
  campaign?: SignedSponsor
  publicKey?: string
  receiptSecret: string
  reportSecret: string
  now?: () => number
}
const hash = (value: string) => createHash("sha256").update(value).digest()
const ttl = 5 * 60_000

export function createSponsorService(options: Options) {
  if (
    options.receiptSecret.length < 32 ||
    options.reportSecret.length < 32 ||
    options.receiptSecret === options.reportSecret
  )
    throw new Error("Separate server-only receipt and report secrets of at least 32 characters are required")
  const now = options.now ?? Date.now
  const db = options.db
  db.exec(`CREATE TABLE IF NOT EXISTS sponsor_receipts (receipt TEXT NOT NULL, kind TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(receipt,kind));
    CREATE TABLE IF NOT EXISTS sponsor_daily (day TEXT NOT NULL, campaign TEXT NOT NULL, views INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,campaign));
    CREATE TABLE IF NOT EXISTS usage_receipts (day TEXT NOT NULL, token TEXT NOT NULL, PRIMARY KEY(day,token));
    CREATE TABLE IF NOT EXISTS usage_daily (day TEXT NOT NULL, version TEXT NOT NULL, platform TEXT NOT NULL, first_starts INTEGER NOT NULL DEFAULT 0, active_installations INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,version,platform));`)
  const rates = new Map<string, { expires: number; count: number }>()
  const mac = (value: string) => createHmac("sha256", options.receiptSecret).update(value).digest("base64url")
  const json = (value: unknown, status = 200) =>
    Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } })
  async function body(request: Request) {
    const reader = request.body?.getReader()
    if (!reader) throw new Error("Missing body")
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 2048) {
        await reader.cancel()
        throw new Error("Body too large")
      }
      chunks.push(value)
    }
    const data = JSON.parse(Buffer.concat(chunks).toString())
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid body")
    return data as Record<string, unknown>
  }
  function allow(network: string, time: number) {
    for (const [key, value] of rates) if (value.expires <= time) rates.delete(key)
    // Raw addresses never enter the database or logs. Short-lived hashes serve only rate limiting.
    const key = mac(`${Math.floor(time / 60_000)}:${network}`)
    const current = rates.get(key)
    if (!current && rates.size >= 10_000) return false
    const value = current ?? { expires: time + 60_000, count: 0 }
    rates.set(key, value)
    return ++value.count <= 10
  }
  return async (request: Request, network = "unknown") => {
    const pathname = new URL(request.url).pathname
    const time = now()
    if (pathname === "/health" && request.method === "GET")
      return json({
        status: "ok",
        usage: "opt_in_only",
        sponsor: Boolean(verifySponsor(options.campaign, options.publicKey, new Date(time))),
      })
    if (pathname === "/v1/report" && request.method === "GET") {
      if (!timingSafeEqual(hash(request.headers.get("Authorization") ?? ""), hash(`Bearer ${options.reportSecret}`)))
        return json({ error: "Unauthorized" }, 401)
      return json({
        metric: "reported_views_and_clicks",
        rows: db.query("SELECT day, campaign, views, clicks FROM sponsor_daily ORDER BY day, campaign").all(),
        usage: db
          .query(
            "SELECT day, version, platform, first_starts, active_installations FROM usage_daily ORDER BY day, version, platform",
          )
          .all(),
        definition:
          "Opted-in first measured launches and daily active installations, not unique humans or all downloads. Sponsor events are reported views/clicks, not verified human attention.",
      })
    }
    if (pathname === "/v1/usage" && request.method === "POST") {
      if (!allow(network, time)) return json({ error: "Rate limited" }, 429)
      try {
        const data = await body(request)
        const day = new Date(time).toISOString().slice(0, 10)
        if (
          Object.keys(data).sort().join(",") !== "day,first,id,platform,version" ||
          data.day !== day ||
          typeof data.id !== "string" ||
          !/^[a-f0-9]{64}$/.test(data.id) ||
          typeof data.version !== "string" ||
          !/^\d{1,5}\.\d{1,5}\.\d{1,5}(?:[-+][a-zA-Z0-9.-]{1,40})?$/.test(data.version) ||
          typeof data.platform !== "string" ||
          !["darwin", "linux", "win32"].includes(data.platform) ||
          typeof data.first !== "boolean"
        )
          return json({ error: "Invalid usage event" }, 400)
        const version = data.version
        const platform = data.platform
        const token = hash(data.id).toString("hex")
        const first = data.first ? 1 : 0
        const accepted = db.transaction(() => {
          db.query("DELETE FROM usage_receipts WHERE day < ?").run(
            new Date(time - 8 * 86400_000).toISOString().slice(0, 10),
          )
          const inserted = db.query("INSERT OR IGNORE INTO usage_receipts VALUES (?,?)").run(day, token)
          if (!inserted.changes) return false
          db.query("INSERT OR IGNORE INTO usage_daily(day,version,platform) VALUES (?,?,?)").run(day, version, platform)
          db.query(
            "UPDATE usage_daily SET first_starts=first_starts+?,active_installations=active_installations+1 WHERE day=? AND version=? AND platform=?",
          ).run(first, day, version, platform)
          return true
        })()
        return json({ accepted, duplicate: !accepted })
      } catch {
        return json({ error: "Invalid usage event" }, 400)
      }
    }
    const campaign = verifySponsor(options.campaign, options.publicKey, new Date(time))
    if (!campaign) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } })
    if (pathname === "/v1/delivery" && request.method === "POST") {
      if (!allow(network, time)) return json({ error: "Rate limited" }, 429)
      // No prompt, project, provider, account, device, or installation identifier is requested.
      if (request.body) return json({ error: "Delivery requests have no body" }, 400)
      const payload = Buffer.from(
        JSON.stringify({ id: campaign.id, nonce: randomUUID(), issued: time, expires: time + ttl }),
      ).toString("base64url")
      return json({ campaign: options.campaign, receipt: `${payload}.${mac(payload)}` })
    }
    if (pathname !== "/v1/event" || request.method !== "POST") return json({ error: "Not found" }, 404)
    try {
      const data = await body(request)
      if (
        Object.keys(data).some((key) => key !== "receipt" && key !== "kind") ||
        typeof data.receipt !== "string" ||
        data.receipt.length > 1024 ||
        !["view", "click"].includes(data.kind as string)
      )
        return json({ error: "Invalid event" }, 400)
      const [payload, signature, extra] = data.receipt.split(".")
      if (!payload || !signature || extra !== undefined || !timingSafeEqual(hash(signature), hash(mac(payload))))
        return json({ error: "Invalid receipt" }, 403)
      const receipt = JSON.parse(Buffer.from(payload, "base64url").toString())
      if (
        receipt.id !== campaign.id ||
        !Number.isFinite(receipt.issued) ||
        !Number.isFinite(receipt.expires) ||
        receipt.expires - receipt.issued !== ttl ||
        receipt.issued > time ||
        receipt.expires <= time
      )
        return json({ error: "Expired or invalid receipt" }, 403)
      if (time - receipt.issued < 1000) return json({ error: "View acknowledgement is too early" }, 409)
      const token = hash(data.receipt).toString("hex")
      db.query("DELETE FROM sponsor_receipts WHERE expires <= ?").run(time)
      if (
        data.kind === "click" &&
        !db.query("SELECT 1 FROM sponsor_receipts WHERE receipt=? AND kind='view'").get(token)
      )
        return json({ error: "View required before click" }, 409)
      const accepted = db.transaction(() => {
        const inserted = db
          .query("INSERT OR IGNORE INTO sponsor_receipts VALUES (?, ?, ?)")
          .run(token, data.kind as string, receipt.expires)
        if (!inserted.changes) return false
        const day = new Date(time).toISOString().slice(0, 10)
        db.query("INSERT OR IGNORE INTO sponsor_daily(day,campaign) VALUES (?,?)").run(day, campaign.id)
        const column = data.kind === "view" ? "views" : "clicks"
        db.query(`UPDATE sponsor_daily SET ${column}=${column}+1 WHERE day=? AND campaign=?`).run(day, campaign.id)
        return true
      })()
      return json({ accepted, duplicate: !accepted })
    } catch {
      return json({ error: "Invalid event" }, 400)
    }
  }
}
