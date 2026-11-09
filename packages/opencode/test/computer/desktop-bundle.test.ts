import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import os from "node:os"
import path from "node:path"
import { installBundle } from "../../src/computer/desktop"

const helper = process.env.OLIVECODE_DESKTOP_TEST_HELPER
const run = promisify(execFile)
test.skipIf(process.platform !== "darwin" || !helper)("seals the complete helper bundle and preserves unchanged installs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "olivecode-bundle-test-"))
  const app = path.join(root, "OliveCode Computer.app")
  try {
    const data = await readFile(helper!)
    const bin = await installBundle(app, data)
    await run("/usr/bin/codesign", ["--verify", "--strict", app])
    expect(await Bun.file(path.join(app, "Contents/_CodeSignature/CodeResources")).exists()).toBe(true)
    const first = await stat(bin)
    const bytes = await readFile(bin)
    expect(await installBundle(app, data)).toBe(bin)
    expect((await stat(bin)).mtimeMs).toBe(first.mtimeMs)
    expect(await readFile(bin)).toEqual(bytes)
    // A changed plist invalidates the full bundle even though the executable is unchanged.
    await writeFile(path.join(app, "Contents/Info.plist"), "invalid plist")
    await expect(run("/usr/bin/codesign", ["--verify", "--strict", app])).rejects.toThrow()
    await installBundle(app, data)
    await run("/usr/bin/codesign", ["--verify", "--strict", app])
    expect(await Bun.file(path.join(app, "Contents/Info.plist")).text()).toContain("com.olivecode.computer")
  } finally { await rm(root, { recursive: true, force: true }) }
})
