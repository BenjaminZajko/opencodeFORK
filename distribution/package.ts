import path from "node:path"
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"

const root = path.resolve(import.meta.dir, "..")
const built = path.join(root, "packages/opencode/dist")
const output = path.join(root, "distribution/releases")
const names: Record<string, string> = {
  "darwin-arm64": "macOS-arm64",
  "darwin-x64": "macOS-x64",
  "linux-arm64": "Linux-arm64",
  "linux-x64": "Linux-x64",
  "windows-arm64": "Windows-arm64",
  "windows-x64": "Windows-x64",
  "windows-x64-baseline": "Windows-x64",
  "darwin-x64-baseline": "macOS-x64",
  "linux-x64-baseline": "Linux-x64",
  "linux-x64-baseline-musl": "Linux-x64-musl",
  "linux-arm64-musl": "Linux-arm64-musl",
}
const targets = process.argv.slice(2)
if (targets.length === 0 || targets.some((target) => !Object.hasOwn(names, target)))
  throw new Error(`Usage: bun distribution/package.ts ${Object.keys(names).join("|")}`)

await mkdir(output, { recursive: true })
for (const target of targets) {
  const windows = target.startsWith("windows")
  const executable = windows ? "olivecode.exe" : "olivecode"
  const source = path.join(built, `opencode-${target}`, "bin", windows ? "opencode.exe" : "opencode")
  if (!(await Bun.file(source).exists())) throw new Error(`Build ${target} first: ${source}`)
  const temporary = await mkdtemp(path.join(tmpdir(), "olivecode-release-"))
  try {
    await copyFile(source, path.join(temporary, executable))
    await copyFile(path.join(root, "LICENSE"), path.join(temporary, "LICENSE"))
    await Bun.write(
      path.join(temporary, "README.txt"),
      `OliveCode ${target}\n\nInstall using the OliveCode installer for your platform. The installer verifies this archive's SHA-256 checksum and places the command in your user account.\n\nFor a portable run, open a terminal in your project folder and run ${windows ? ".\\olivecode.exe" : "./olivecode"}.\n\nOliveCode is derived from OpenCode. See LICENSE.\n`,
    )
    const archive = path.join(output, `OliveCode-${names[target]}.zip`)
    await rm(archive, { force: true })
    const zip = Bun.spawn(process.platform === "win32"
      ? ["powershell", "-NoProfile", "-Command", `Compress-Archive -Path '${executable}','LICENSE','README.txt' -DestinationPath '${archive.replaceAll("'", "''")}' -Force`]
      : ["zip", "-q", archive, executable, "LICENSE", "README.txt"], {
      cwd: temporary,
      stdout: "inherit",
      stderr: "inherit",
    })
    if ((await zip.exited) !== 0) throw new Error(`Could not package ${target}`)
    const hash = new Bun.CryptoHasher("sha256").update(await Bun.file(archive).arrayBuffer()).digest("hex")
    await Bun.write(`${archive}.sha256`, `${hash}  ${path.basename(archive)}\n`)
    console.log(archive)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
