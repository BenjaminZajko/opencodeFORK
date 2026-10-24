import { readFile, writeFile } from "node:fs/promises"
import { freeProvider } from "@opencode-ai/core/olivecode/models"

// Copy only supported free-provider credentials on first launch. Never move,
// delete, or overwrite upstream data or existing OliveCode credentials.
export async function migrateFreeAccounts(destination: string, legacy: string) {
  const current = await readFile(destination, "utf8").catch(() => undefined)
  if (current !== undefined) return
  const source = await readFile(legacy, "utf8").catch(() => undefined)
  if (!source) return
  const parsed: unknown = JSON.parse(source)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return
  const accounts = Object.fromEntries(Object.entries(parsed).filter(([id]) => freeProvider(id)))
  await writeFile(destination, JSON.stringify(accounts), { mode: 0o600, flag: "wx" }).catch((error) => {
    if (error.code !== "EEXIST") throw error
  })
}
