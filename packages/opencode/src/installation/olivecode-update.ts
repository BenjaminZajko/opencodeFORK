import { existsSync, readdirSync, realpathSync } from "fs"
import { chmod, copyFile, mkdir, mkdtemp, readFile, rename, rm, symlink, unlink } from "fs/promises"
import { homedir, tmpdir } from "os"
import path from "path"

// In-app OliveCode update: the same steps as distribution/install.sh and
// install.ps1 (official release only, published SHA-256, version check, side-by-
// side version folder, then switch the olivecode command). The running app is
// never overwritten; the new version starts the next time OliveCode is opened.

const REPOSITORY = "https://github.com/BenjaminZajko/opencodeFORK/releases/download"
export const INSTALL_COMMAND = {
  unix: "curl -fsSL https://olivecode.dev/install | sh",
  windows: "irm https://olivecode.dev/install.ps1 | iex",
}

export type Layout = { versions: string; command: string; binary: "olivecode" | "olivecode.exe"; windows: boolean }

/** The installer-managed layout this executable runs from, or undefined (dev build, portable copy, other tool). */
export function managedInstall(execPath = process.execPath, platform = process.platform, env = process.env, home = homedir()): Layout | undefined {
  if (platform === "win32") {
    if (!env.LOCALAPPDATA) return
    const root = path.win32.join(env.LOCALAPPDATA, "OliveCode")
    const command = path.win32.join(root, "bin", "olivecode.exe")
    if (path.win32.resolve(execPath).toLowerCase() !== command.toLowerCase()) return
    return { versions: path.win32.join(root, "versions"), command, binary: "olivecode.exe", windows: true }
  }
  const installHome = env.OLIVECODE_INSTALL_HOME ?? home
  const versions = path.join(installHome, ".local/share/olivecode/versions")
  const real = (() => {
    try {
      return realpathSync(execPath)
    } catch {
      return execPath
    }
  })()
  const versionsReal = existsSync(versions) ? realpathSync(versions) : versions
  if (!real.startsWith(versionsReal + path.sep)) return
  return { versions, command: path.join(installHome, ".local/bin/olivecode"), binary: "olivecode", windows: false }
}

/** Release package name for this computer, matching the installers' choice. */
export function releaseTarget(platform = process.platform, arch = process.arch) {
  const cpu = arch === "arm64" ? "arm64" : "x64"
  if (platform === "darwin") {
    // Under Rosetta an x64 build reports x64; prefer the native package like install.sh.
    const translated = arch === "x64" && Bun.spawnSync(["sysctl", "-in", "sysctl.proc_translated"]).stdout.toString().trim() === "1"
    return `macOS-${translated ? "arm64" : cpu}`
  }
  if (platform === "win32") return `Windows-${cpu}`
  if (platform === "linux") {
    const musl = (() => {
      try {
        return readdirSync("/lib").some((name) => name.startsWith("ld-musl-"))
      } catch {
        return false
      }
    })()
    return `Linux-${cpu}${musl ? "-musl" : ""}`
  }
  throw new Error(`OliveCode has no release package for ${platform}/${arch}.`)
}

export async function installUpdate(
  version: string,
  options: { layout?: Layout; target?: string; base?: string; request?: typeof fetch } = {},
) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid OliveCode version: ${version}`)
  const layout = options.layout ?? managedInstall()
  if (!layout) throw new Error(notManaged())
  const archive = `OliveCode-${options.target ?? releaseTarget()}.zip`
  const base = options.base ?? `${REPOSITORY}/v${version}`
  const request = options.request ?? fetch
  const temp = await mkdtemp(path.join(tmpdir(), "olivecode-update-"))
  try {
    const zip = path.join(temp, archive)
    await Bun.write(zip, await download(request, `${base}/${archive}`))
    const expected = (await download(request, `${base}/${archive}.sha256`)).toString().trim().split(/\s+/)[0] ?? ""
    if (!/^[0-9a-f]{64}$/i.test(expected)) throw new Error("The release has an invalid checksum file. Nothing was installed.")
    const actual = new Bun.CryptoHasher("sha256").update(await readFile(zip)).digest("hex")
    if (actual !== expected.toLowerCase()) throw new Error("The download did not match its published checksum. Nothing was installed.")

    const extracted = path.join(temp, "extracted")
    await mkdir(extracted)
    await run(layout.windows ? ["tar", "-xf", zip, "-C", extracted] : ["unzip", "-q", zip, "-d", extracted], "Could not unpack the update")
    const binary = path.join(extracted, layout.binary)
    if (!existsSync(binary)) throw new Error("The update has no OliveCode executable. Nothing was installed.")
    if (!layout.windows) await chmod(binary, 0o755)
    const reported = (await run([binary, "--version"], "The downloaded OliveCode could not start on this computer")).trim()
    if (reported !== version) throw new Error(`The download reports version ${reported || "unknown"}, not ${version}. Nothing was installed.`)

    const folder = path.join(layout.versions, version)
    const installed = path.join(folder, layout.binary)
    await mkdir(folder, { recursive: true })
    if (existsSync(installed) && Buffer.compare(await readFile(installed), await readFile(binary)) !== 0)
      throw new Error("This version is already installed with different contents. Nothing was replaced.")
    if (!existsSync(installed)) {
      await copyFile(binary, `${installed}.new`)
      if (!layout.windows) await chmod(`${installed}.new`, 0o755)
      await rename(`${installed}.new`, installed)
    }
    await switchCommand(layout, installed)
    return version
  } finally {
    await rm(temp, { recursive: true, force: true }).catch(() => {})
  }
}

async function switchCommand(layout: Layout, installed: string) {
  await mkdir(path.dirname(layout.command), { recursive: true })
  if (!layout.windows) {
    // Atomic: a new link is renamed over the old one.
    const link = `${layout.command}.new-${process.pid}`
    await unlink(link).catch(() => {})
    await symlink(installed, link)
    await rename(link, layout.command)
    return
  }
  // Windows locks a running .exe against overwrite but allows renaming it.
  const old = path.win32.join(path.win32.dirname(layout.command), `olivecode-old-${Date.now()}.exe`)
  if (existsSync(layout.command)) await rename(layout.command, old)
  try {
    await copyFile(installed, layout.command)
  } catch (error) {
    await rename(old, layout.command).catch(() => {})
    throw error
  }
  await unlink(old).catch(() => {}) // still running: removed on a later update
}

async function download(request: typeof fetch, url: string) {
  const response = await request(url, { redirect: "follow", signal: AbortSignal.timeout(120_000), headers: { "User-Agent": "OliveCode-updater" } })
  if (!response.ok) throw new Error(`Could not download the update (${response.status}). Check your connection and try again.`)
  return Buffer.from(await response.arrayBuffer())
}

async function run(command: string[], failure: string) {
  const proc = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" })
  const timer = setTimeout(() => proc.kill(), 60_000)
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  clearTimeout(timer)
  if (code !== 0) throw new Error(`${failure}. Nothing was installed.${stderr.trim() ? ` ${stderr.trim().split("\n").slice(-2).join(" ")}` : ""}`)
  return stdout
}

function notManaged() {
  const command = process.platform === "win32" ? INSTALL_COMMAND.windows : INSTALL_COMMAND.unix
  return `This copy of OliveCode was not installed by the OliveCode installer, so it cannot update itself. Run this in a terminal to install the latest version: ${command}`
}

export * as OliveCodeUpdate from "./olivecode-update"
