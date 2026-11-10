import { describe, expect, test } from "bun:test"
import { mkdir, readlink, symlink, writeFile } from "fs/promises"
import path from "path"
import { OliveCodeUpdate } from "../../src/installation/olivecode-update"
import { tmpdir } from "../fixture/fixture"

const describeUnix = process.platform === "win32" ? describe.skip : describe

async function release(dir: string, reported: string) {
  const pkg = path.join(dir, "pkg")
  await mkdir(pkg, { recursive: true })
  await writeFile(path.join(pkg, "olivecode"), `#!/bin/sh\necho ${reported}\n`, { mode: 0o755 })
  const zip = path.join(dir, "OliveCode-test.zip")
  expect(Bun.spawnSync(["zip", "-q", "-j", zip, path.join(pkg, "olivecode")]).exitCode).toBe(0)
  const bytes = await Bun.file(zip).arrayBuffer()
  return { bytes, sha: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") }
}

function serve(files: Record<string, ArrayBuffer | string>) {
  return Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => {
    const body = files[new URL(request.url).pathname]
    return body === undefined ? new Response("missing", { status: 404 }) : new Response(body)
  } })
}

async function installed(home: string) {
  const versions = path.join(home, ".local/share/olivecode/versions")
  const command = path.join(home, ".local/bin/olivecode")
  await mkdir(path.join(versions, "0.1.2"), { recursive: true })
  await mkdir(path.dirname(command), { recursive: true })
  await writeFile(path.join(versions, "0.1.2/olivecode"), "#!/bin/sh\necho 0.1.2\n", { mode: 0o755 })
  await symlink(path.join(versions, "0.1.2/olivecode"), command)
  return { versions, command, binary: "olivecode" as const, windows: false }
}

describe("OliveCode in-app update layout", () => {
  test("recognises installer-managed copies only", () => {
    expect(OliveCodeUpdate.managedInstall("/somewhere/olivecode", "darwin", {}, "/Users/test")).toBeUndefined()
    expect(OliveCodeUpdate.managedInstall("C:\\Users\\t\\AppData\\Local\\OliveCode\\bin\\olivecode.exe", "win32", { LOCALAPPDATA: "C:\\Users\\t\\AppData\\Local" })?.command)
      .toBe("C:\\Users\\t\\AppData\\Local\\OliveCode\\bin\\olivecode.exe")
    expect(OliveCodeUpdate.managedInstall("C:\\Tools\\olivecode.exe", "win32", { LOCALAPPDATA: "C:\\Users\\t\\AppData\\Local" })).toBeUndefined()
    expect(OliveCodeUpdate.releaseTarget("win32", "arm64")).toBe("Windows-arm64")
    expect(OliveCodeUpdate.releaseTarget("darwin", "arm64")).toBe("macOS-arm64")
  })
})

describeUnix("OliveCode in-app update", () => {
  test("installs a verified release beside the old one and switches the command", async () => {
    await using tmp = await tmpdir()
    const layout = await installed(path.join(tmp.path, "home"))
    const pkg = await release(tmp.path, "0.1.3")
    await using server = serve({ "/v/OliveCode-test.zip": pkg.bytes, "/v/OliveCode-test.zip.sha256": `${pkg.sha}  OliveCode-test.zip\n` })
    expect(await OliveCodeUpdate.installUpdate("0.1.3", { layout, target: "test", base: `http://127.0.0.1:${server.port}/v` })).toBe("0.1.3")
    expect(await readlink(layout.command)).toBe(path.join(layout.versions, "0.1.3/olivecode"))
    expect(await Bun.file(path.join(layout.versions, "0.1.2/olivecode")).exists()).toBe(true)
  })

  test("refuses a tampered download or a wrong version and leaves the install unchanged", async () => {
    await using tmp = await tmpdir()
    const layout = await installed(path.join(tmp.path, "home"))
    const good = await release(path.join(tmp.path, "good"), "0.1.3")
    const wrong = await release(path.join(tmp.path, "wrong"), "0.1.9")
    await using server = serve({
      "/tampered/OliveCode-test.zip": good.bytes, "/tampered/OliveCode-test.zip.sha256": `${"0".repeat(64)}\n`,
      "/wrong/OliveCode-test.zip": wrong.bytes, "/wrong/OliveCode-test.zip.sha256": `${wrong.sha}\n`,
    })
    const base = `http://127.0.0.1:${server.port}`
    await expect(OliveCodeUpdate.installUpdate("0.1.3", { layout, target: "test", base: `${base}/tampered` })).rejects.toThrow("checksum")
    await expect(OliveCodeUpdate.installUpdate("0.1.3", { layout, target: "test", base: `${base}/wrong` })).rejects.toThrow("reports version 0.1.9")
    await expect(OliveCodeUpdate.installUpdate("0.1.3", { layout, target: "test", base: `${base}/missing` })).rejects.toThrow("Could not download")

    expect(await readlink(layout.command)).toBe(path.join(layout.versions, "0.1.2/olivecode"))
  })

  test("explains how to update a copy the installer does not manage", async () => {
    await expect(OliveCodeUpdate.installUpdate("0.1.3", { layout: undefined })).rejects.toThrow("olivecode.dev/install")
  })
})
