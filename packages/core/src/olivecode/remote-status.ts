import { mkdir, readFile, rename, rm } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { z } from "zod"

// Public local presence only. Tokens, pairing codes and account IDs never belong here.
const Presence = z.object({
  pid: z.number().int().positive(), updated: z.number(), paired: z.boolean(),
  phase: z.enum(["listening", "reconnecting"]), channel: z.enum(["telegram", "whatsapp"]).optional(),
})
export type RemotePresence = z.infer<typeof Presence>

export async function readRemotePresence(directory: string): Promise<RemotePresence | undefined> {
  const parsed = Presence.safeParse(await readFile(path.join(directory, "remote-presence.json"), "utf8").then(JSON.parse).catch(() => undefined))
  if (!parsed.success || Date.now() - parsed.data.updated > 45000 || parsed.data.updated > Date.now() + 5000) return
  try { process.kill(parsed.data.pid, 0) } catch { return }
  return parsed.data
}

export async function writeRemotePresence(directory: string, presence: RemotePresence) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const file = path.join(directory, "remote-presence.json")
  const temporary = `${file}.${randomUUID()}`
  try {
    await Bun.write(temporary, JSON.stringify(Presence.parse(presence)), { mode: 0o600 })
    await rename(temporary, file)
  } finally { await rm(temporary, { force: true }) }
}

export async function clearRemotePresence(directory: string) {
  await rm(path.join(directory, "remote-presence.json"), { force: true })
}
