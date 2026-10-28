import { createSponsorService, type ReportingDatabase } from "./service"
import type { SignedSponsor } from "../../packages/core/src/olivecode/sponsor"

type Cursor = { toArray(): Record<string, string | number | null>[] }
type State = {
  storage: { sql: { exec(sql: string, ...bindings: (string | number)[]): Cursor }; transactionSync<T>(fn: () => T): T }
}
type Env = {
  REPORTING: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } }
  RECEIPT_SECRET: string
  REPORT_SECRET: string
  SPONSOR_CAMPAIGN?: string
  SPONSOR_PUBLIC_KEY?: string
}

/** One SQLite Durable Object gives atomic receipt deduplication on Workers Free. */
export class Reporting {
  private service: ReturnType<typeof createSponsorService>
  constructor(state: State, env: Env) {
    const sql = state.storage.sql
    const db: ReportingDatabase = {
      exec: (input) => {
        for (const statement of input.split(";").filter((part) => part.trim())) sql.exec(statement)
      },
      query: (input) => ({
        run: (...bindings) => {
          sql.exec(input, ...bindings)
          return { changes: Number(sql.exec("SELECT changes() AS count").toArray()[0]?.count ?? 0) }
        },
        get: (...bindings) => sql.exec(input, ...bindings).toArray()[0],
        all: (...bindings) => sql.exec(input, ...bindings).toArray(),
      }),
      transaction: (fn) => () => state.storage.transactionSync(fn),
    }
    const campaign: SignedSponsor | undefined = env.SPONSOR_CAMPAIGN ? JSON.parse(env.SPONSOR_CAMPAIGN) : undefined
    this.service = createSponsorService({
      db,
      campaign,
      publicKey: env.SPONSOR_PUBLIC_KEY,
      receiptSecret: env.RECEIPT_SECRET,
      reportSecret: env.REPORT_SECRET,
    })
  }
  fetch(request: Request) {
    return this.service(request, request.headers.get("X-OliveCode-Network") ?? "unknown")
  }
}

export default {
  async fetch(request: Request, env: Env) {
    if (!env.RECEIPT_SECRET || !env.REPORT_SECRET)
      return Response.json({ error: "Reporting is not configured" }, { status: 503 })
    const headers = new Headers(request.headers)
    headers.set("X-OliveCode-Network", request.headers.get("CF-Connecting-IP") ?? "unknown")
    // No request or response body, address, or authorization header is logged.
    return env.REPORTING.get(env.REPORTING.idFromName("olivecode-reporting")).fetch(new Request(request, { headers }))
  },
}
