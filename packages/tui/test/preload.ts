import { mkdtemp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { afterAll } from "bun:test"

// Set these before xdg-basedir or Global is imported. Tests must never read or
// write the developer's real theme, credentials, sessions or lock directory.
const home = await mkdtemp(path.join(os.tmpdir(), "olivecode-tui-suite-"))
for (const name of ["DATA", "CACHE", "CONFIG", "STATE"]) {
  const directory = path.join(home, name.toLowerCase())
  await mkdir(directory)
  process.env[`XDG_${name}_HOME`] = directory
}
process.env.OPENCODE_TEST_HOME = home
process.env.OPENCODE_DISABLE_MODELS_FETCH = "1"
afterAll(() => rm(home, { recursive: true, force: true }))
