import { z } from "zod"
import { chmod, mkdir, open, readFile, rename, rm } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"

const State = z.object({
  token: z.string().regex(/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/), botID: z.number().int().positive(), username: z.string().regex(/^[A-Za-z0-9_]{5,32}$/),
  owner: z.object({ user: z.number().int().positive(), chat: z.number().int().positive() }).optional(),
  offset: z.number().int().nonnegative().default(0),
})
export type State = z.infer<typeof State>

export class RemoteStore {
  constructor(readonly directory: string) {}
  async load() {
    const raw = await readFile(path.join(this.directory, "telegram.json"), "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw new Error("Could not read the Telegram connection file.")
    })
    if (!raw) return undefined
    const data: unknown = (() => { try { return JSON.parse(raw) } catch { throw new Error("The Telegram connection file is invalid. Reconnect locally.") } })()
    const parsed = State.safeParse(data)
    if (!parsed.success) throw new Error("The Telegram connection file is invalid. Reconnect locally.")
    return parsed.data
  }
  async save(state: State) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    await chmod(this.directory, 0o700)
    const target = path.join(this.directory, "telegram.json")
    const temporary = target + "." + randomUUID()
    await Bun.write(temporary, JSON.stringify(State.parse(state)), { mode: 0o600 })
    await chmod(temporary, 0o600)
    await rename(temporary, target)
  }
  async disconnect() { await rm(path.join(this.directory, "telegram.json"), { force: true }) }
  async lock() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const file = path.join(this.directory, "listener.lock")
    const create = () => open(file, "wx", 0o600)
    const handle = await create().catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error
      const pid = Number(await readFile(file, "utf8").catch(() => ""))
      if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Remote lock is incomplete. Check that no listener is running before removing listener.lock.")
      const alive = (() => { try { process.kill(pid, 0); return true } catch (cause) { return (cause as NodeJS.ErrnoException).code !== "ESRCH" } })()
      if (alive) throw new Error("OliveCode Remote is already running. Stop that listener first.")
      await rm(file)
      return create()
    })
    await handle.writeFile(String(process.pid))
    return async () => { await handle.close(); await rm(file, { force: true }) }
  }
}
