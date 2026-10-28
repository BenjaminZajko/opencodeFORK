import { createHash, randomUUID } from "node:crypto"

type Storage = { get(key: string): unknown; set(key: string, value: unknown): void }

/** Daily rotating tokens deduplicate retries without transmitting a persistent installation ID. */
export function createUsageReporter(options: {
  storage: Storage
  endpoint: string
  version: string
  platform: string
  request?: typeof fetch
  now?: () => number
}) {
  const request = options.request ?? fetch
  const now = options.now ?? Date.now
  let pending = false
  let retryAt = 0
  return async (signal?: AbortSignal) => {
    if (options.storage.get("olivecode_usage_metrics") !== true || signal?.aborted || pending || now() < retryAt) return
    const day = new Date(now()).toISOString().slice(0, 10)
    if (options.storage.get("olivecode_usage_day") === day) return
    pending = true
    retryAt = now() + 5 * 60_000
    try {
      const saved = options.storage.get("olivecode_usage_secret")
      const secret = typeof saved === "string" ? saved : randomUUID()
      if (!saved) options.storage.set("olivecode_usage_secret", secret)
      const firstDay = options.storage.get("olivecode_usage_first_day")
      if (!firstDay) options.storage.set("olivecode_usage_first_day", day)
      const first = options.storage.get("olivecode_usage_first_sent") !== true && (!firstDay || firstDay === day)
      const response = await request(
        new URL("v1/usage", options.endpoint.endsWith("/") ? options.endpoint : options.endpoint + "/"),
        {
          method: "POST",
          redirect: "error",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.any([AbortSignal.timeout(4000), ...(signal ? [signal] : [])]),
          body: JSON.stringify({
            day,
            id: createHash("sha256").update(`${secret}:${day}`).digest("hex"),
            version: options.version,
            platform: options.platform,
            first,
          }),
        },
      )
      if (!response.ok || signal?.aborted) return
      options.storage.set("olivecode_usage_day", day)
      options.storage.set("olivecode_usage_first_sent", true)
    } catch {
      // Measurement never interrupts coding; failed events retry with the same daily token.
    } finally {
      pending = false
    }
  }
}
