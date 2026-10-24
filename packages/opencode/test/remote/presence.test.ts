import { expect, test } from "bun:test"
import { readRemotePresence, writeRemotePresence, clearRemotePresence } from "@opencode-ai/core/olivecode/remote-status"
import { tmpdir } from "../fixture/fixture"

test("welcome presence reports a live paired listener, rejects stale data, and clears at shutdown", async () => {
  await using tmp = await tmpdir()
  expect(await readRemotePresence(tmp.path)).toBeUndefined()
  await writeRemotePresence(tmp.path, { pid: process.pid, updated: Date.now(), paired: true, phase: "listening" })
  expect((await readRemotePresence(tmp.path))?.paired).toBe(true)
  const text = await Bun.file(`${tmp.path}/remote-presence.json`).text()
  expect(Object.keys(JSON.parse(text)).sort()).toEqual(["paired", "phase", "pid", "updated"])
  await writeRemotePresence(tmp.path, { pid: process.pid, updated: Date.now() - 46000, paired: true, phase: "listening" })
  expect(await readRemotePresence(tmp.path)).toBeUndefined()
  await writeRemotePresence(tmp.path, { pid: process.pid, updated: Date.now(), paired: true, phase: "reconnecting" })
  expect((await readRemotePresence(tmp.path))?.phase).toBe("reconnecting")
  await clearRemotePresence(tmp.path)
  expect(await readRemotePresence(tmp.path)).toBeUndefined()
})
