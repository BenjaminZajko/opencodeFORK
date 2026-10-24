import { Database } from "bun:sqlite"
import { readFile } from "node:fs/promises"
import { createSponsorService } from "./service"

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}
const db = new Database(process.env.OLIVECODE_SPONSOR_DB ?? "sponsors.sqlite", { create: true })
db.exec("PRAGMA journal_mode=WAL;")
const service = createSponsorService({
  db,
  campaign: JSON.parse(await readFile(required("OLIVECODE_SPONSOR_CAMPAIGN"), "utf8")),
  publicKey: await readFile(required("OLIVECODE_SPONSOR_PUBLIC_KEY"), "utf8"),
  receiptSecret: required("OLIVECODE_SPONSOR_RECEIPT_SECRET"),
  reportSecret: required("OLIVECODE_SPONSOR_REPORT_SECRET"),
})
const server = Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.OLIVECODE_SPONSOR_PORT ?? 8787), maxRequestBodySize: 2048,
  fetch(request, server) { return service(request, server.requestIP(request)?.address ?? "unknown") },
})
db.query("DELETE FROM sponsor_receipts WHERE expires <= ?").run(Date.now())
setInterval(() => db.query("DELETE FROM sponsor_receipts WHERE expires <= ?").run(Date.now()), 60_000).unref()
console.log(`Sponsor service listening at ${server.url}. Place behind HTTPS before public use.`)
