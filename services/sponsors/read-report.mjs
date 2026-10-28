import { readFile } from "node:fs/promises"

// Owner-only local utility. The secret is never part of a URL or command argument.
const values = await readFile(new URL(".dev.vars.production", import.meta.url), "utf8")
const secret = values.match(/^REPORT_SECRET=(.+)$/m)?.[1]
if (!secret) throw Error("Missing private owner report secret")
const response = await fetch("https://olivecode-reporting.olivecode-ai.workers.dev/v1/report", {
  headers: { Authorization: `Bearer ${secret}` },
  redirect: "error",
  signal: AbortSignal.timeout(10000),
})
if (!response.ok) throw Error(`Owner report failed: ${response.status}`)
console.log(JSON.stringify(await response.json(), null, 2))
