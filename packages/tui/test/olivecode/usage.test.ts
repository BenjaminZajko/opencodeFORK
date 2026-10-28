import { expect, test } from "bun:test"
import { createUsageReporter } from "../../src/olivecode/usage"
import { createSponsorService } from "../../../../services/sponsors/service"
import { Database } from "bun:sqlite"

test("usage sends nothing until opt-in; acknowledged daily reports deduplicate and tokens rotate", async () => {
  let time = Date.parse("2026-10-28T10:00:00Z")
  const saved = new Map<string, unknown>()
  const db = new Database(":memory:")
  const service = createSponsorService({
    db,
    receiptSecret: "r".repeat(32),
    reportSecret: "s".repeat(32),
    now: () => time,
  })
  let requests = 0
  const bodies: Record<string, unknown>[] = []
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      requests++
      bodies.push(await request.clone().json())
      return service(request, "test")
    },
  })
  const storage = {
    get: (key: string) => saved.get(key),
    set: (key: string, value: unknown) => {
      saved.set(key, value)
    },
  }
  const report = createUsageReporter({
    storage,
    endpoint: server.url.toString(),
    version: "0.1.1",
    platform: "darwin",
    now: () => time,
  })
  try {
    await report()
    expect(requests).toBe(0)
    saved.set("olivecode_usage_metrics", true)
    await Promise.all([report(), report()])
    expect(requests).toBe(1)
    expect(bodies[0].first).toBe(true)
    expect(bodies[0].id).not.toBe(saved.get("olivecode_usage_secret"))
    await report()
    expect(requests).toBe(1)
    time += 86400_000
    await report()
    expect(requests).toBe(2)
    expect(bodies[1].id).not.toBe(bodies[0].id)
    expect(bodies[1].first).toBe(false)
    expect(
      db.query("SELECT SUM(active_installations) AS active,SUM(first_starts) AS firsts FROM usage_daily").get(),
    ).toEqual({ active: 2, firsts: 1 })
    saved.set("olivecode_usage_metrics", false)
    time += 86400_000
    await report()
    expect(requests).toBe(2)
    expect(Object.keys(bodies[0]).sort()).toEqual(["day", "first", "id", "platform", "version"])
  } finally {
    server.stop(true)
    db.close()
  }
})

test("failed reports keep the daily token and retry later without blocking coding", async () => {
  let time = Date.parse("2026-10-28T10:00:00Z")
  const values = new Map<string, unknown>([["olivecode_usage_metrics", true]])
  const ids: unknown[] = []
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      ids.push((await request.json()).id)
      return new Response(null, { status: ids.length === 1 ? 503 : 200 })
    },
  })
  const report = createUsageReporter({
    endpoint: server.url.toString(),
    version: "0.1.1",
    platform: "linux",
    now: () => time,
    storage: {
      get: (key) => values.get(key),
      set: (key, value) => {
        values.set(key, value)
      },
    },
  })
  try {
    await report()
    expect(values.has("olivecode_usage_day")).toBe(false)
    await report()
    expect(ids).toHaveLength(1)
    time += 300_000
    await report()
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1])
    expect(values.get("olivecode_usage_day")).toBe("2026-10-28")
  } finally {
    server.stop(true)
  }
})
