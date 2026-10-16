import { expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { migrateFreeAccounts } from "../../src/auth/migrate"
import { stat } from "node:fs/promises"

test("first launch copies only free-provider accounts and never overwrites either store", async () => {
  await using root = await tmpdir()
  const legacy = `${root.path}/legacy.json`
  const next = `${root.path}/olivecode.json`
  const original = { openrouter: { type: "api", key: "test-free" }, openai: { type: "api", key: "test-paid" } }
  await Bun.write(legacy, JSON.stringify(original))
  await migrateFreeAccounts(next, legacy)
  expect(await Bun.file(next).json()).toEqual({ openrouter: original.openrouter })
  expect(await Bun.file(legacy).json()).toEqual(original)
  expect((await stat(next)).mode & 0o777).toBe(0o600)
  await Bun.write(next, JSON.stringify({ groq: { type: "api", key: "newer" } }))
  await migrateFreeAccounts(next, legacy)
  expect(await Bun.file(next).json()).toEqual({ groq: { type: "api", key: "newer" } })
})
