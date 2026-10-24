import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const installer = path.resolve(import.meta.dir, "../install.sh")

async function fixture(version: string, arch = "x86_64", translated = false, startupFails = false) {
  const root = await mkdtemp(path.join(tmpdir(), "olivecode-macos-"))
  const tools = path.join(root, "tools")
  const home = path.join(root, "home")
  const payload = path.join(root, "payload")
  await Promise.all([mkdir(tools), mkdir(payload), mkdir(path.join(home, ".local/bin"), { recursive: true })])
  const scripts = {
    uname: `#!/bin/sh
case "$1" in -s) echo Darwin;; -m) echo ${arch};; esac
`,
    sw_vers: `#!/bin/sh
[ "$SYSTEM_VERSION_COMPAT" = 0 ] || exit 91
${version === "unavailable" ? "exit 1" : `printf '%s\n' '${version}'`}
`,
    sysctl: `#!/bin/sh
${translated ? "echo 1" : "exit 1"}
`,
    curl: `#!/bin/sh
touch '${root}/download-attempted'
exit 92
`,
  }
  for (const [name, text] of Object.entries(scripts)) {
    await Bun.write(path.join(tools, name), text)
    await chmod(path.join(tools, name), 0o755)
  }
  await Bun.write(path.join(home, ".local/bin/olivecode"), "existing installation\n")
  await Bun.write(path.join(home, ".zshrc"), "# existing profile\n")
  const binary = path.join(payload, "olivecode")
  await Bun.write(binary, startupFails
    ? '#!/bin/sh\nprintf "dyld: Symbol not found\n" >&2\nexit 1\n'
    : '#!/bin/sh\necho 0.1.0-test\n')
  await chmod(binary, 0o755)
  const archive = path.join(root, "fixture.zip")
  const zip = Bun.spawn(["zip", "-q", archive, "olivecode"], { cwd: payload })
  expect(await zip.exited).toBe(0)
  await Bun.write(archive + ".sha256", new Bun.CryptoHasher("sha256").update(await Bun.file(archive).arrayBuffer()).digest("hex") + "  fixture.zip\n")
  const env = { ...process.env, PATH: tools + ":" + process.env.PATH, SHELL: "/bin/zsh", OLIVECODE_INSTALL_HOME: home }
  return {
    root, home,
    async run(local = false) {
      const child = Bun.spawn(["sh", installer], {
        env: { ...env, OLIVECODE_ARCHIVE_PATH: local ? archive : "", OLIVECODE_SHA256_PATH: local ? archive + ".sha256" : "" },
        stdout: "pipe", stderr: "pipe",
      })
      const output = await new Response(child.stdout).text() + await new Response(child.stderr).text()
      return { code: await child.exited, output }
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}

for (const version of ["10.15.7", "10.15.8", "10.16", "11.7.10", "12.7.6"]) {
  test(`macOS ${version} stops before download and preserves the user's install`, async () => {
    const f = await fixture(version)
    try {
      const result = await f.run()
      expect(result.code).not.toBe(0)
      expect(result.output).toContain(`Detected macOS ${version} (x86_64)`)
      expect(result.output).toContain("requires macOS 13 or newer")
      expect(result.output).toContain("no verified OliveCode build")
      expect(await Bun.file(path.join(f.root, "download-attempted")).exists()).toBe(false)
      expect(await readFile(path.join(f.home, ".local/bin/olivecode"), "utf8")).toBe("existing installation\n")
      expect(await readFile(path.join(f.home, ".zshrc"), "utf8")).toBe("# existing profile\n")
    } finally { await f.cleanup() }
  })
}

for (const version of ["unavailable", "", "13", "13.invalid", "10.15.7.1"]) {
  test(`unknown macOS version ${JSON.stringify(version)} cannot fall through to a download`, async () => {
    const f = await fixture(version)
    try {
      const result = await f.run()
      expect(result.code).not.toBe(0)
      expect(result.output).toContain("Could not")
      expect(await Bun.file(path.join(f.root, "download-attempted")).exists()).toBe(false)
    } finally { await f.cleanup() }
  })
}

for (const [version, arch, translated, target] of [
  ["13.0", "x86_64", false, "macOS-x64"],
  ["13.7.8", "arm64", false, "macOS-arm64"],
  ["14.0", "x86_64", false, "macOS-x64"],
  ["15.4", "arm64", false, "macOS-arm64"],
  ["26.0", "arm64", false, "macOS-arm64"],
  ["26.0", "x86_64", true, "macOS-arm64"],
] as const) {
  test(`macOS ${version}/${arch}${translated ? "/Rosetta" : ""} selects ${target}`, async () => {
    const f = await fixture(version, arch, translated)
    try {
      const result = await f.run(true)
      expect(result.code).toBe(0)
      expect(result.output).toContain(`selecting OliveCode for ${target}`)
      expect(result.output).toContain("Installed OliveCode 0.1.0-test")
    } finally { await f.cleanup() }
  })
}

test("a startup failure explains the problem and preserves an existing installation", async () => {
  const f = await fixture("13.0", "x86_64", false, true)
  try {
    const result = await f.run(true)
    expect(result.code).not.toBe(0)
    expect(result.output).toContain("executable could not start")
    expect(result.output).toContain("dyld: Symbol not found")
    expect(result.output).toContain("existing installation was left unchanged")
    expect(await readFile(path.join(f.home, ".local/bin/olivecode"), "utf8")).toBe("existing installation\n")
    expect(await readFile(path.join(f.home, ".zshrc"), "utf8")).toBe("# existing profile\n")
  } finally { await f.cleanup() }
})
