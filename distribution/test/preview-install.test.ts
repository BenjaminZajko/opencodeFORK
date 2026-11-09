import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, chmod, readFile, readdir, rm, copyFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

async function fixture(valid: boolean) {
  const root = await mkdtemp(path.join(tmpdir(), "olivecode-preview-install-"))
  const prefix = path.join(root, "prefix")
  const bin = path.join(root, "tools")
  await mkdir(path.join(prefix, "bin"), { recursive: true }); await mkdir(bin)
  await copyFile(new URL("../preview/install-linux.sh", import.meta.url), path.join(root, "install.sh"))
  await writeFile(path.join(root, "olivecode"), `#!/bin/sh\n${valid ? "echo preview-test" : "exit 42"}\n`)
  await writeFile(path.join(prefix, "bin/olivecode"), "old-installed-command\n")
  await writeFile(path.join(bin, "uname"), '#!/bin/sh\ncase "$1" in -s) echo Linux;; -m) echo x86_64;; esac\n')
  await chmod(path.join(bin, "uname"), 0o755)
  const child = Bun.spawn(["sh", path.join(root, "install.sh")], {
    env: { ...process.env, OLIVECODE_INSTALL_PREFIX: prefix, PATH: bin + ":" + process.env.PATH },
    stdout: "pipe", stderr: "pipe",
  })
  const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  return { root, prefix, out, err, code }
}

test("preview installer validates staged executable and preserves the previous command", async () => {
  const f = await fixture(true)
  try {
    expect(f.code, f.out + f.err).toBe(0)
    expect(await readFile(path.join(f.prefix, "bin/olivecode"), "utf8")).toContain("preview-test")
    const backups = await readdir(path.join(f.prefix, "share/olivecode/versions"))
    expect(backups).toHaveLength(1)
    expect(await readFile(path.join(f.prefix, "share/olivecode/versions", backups[0]!), "utf8")).toBe("old-installed-command\n")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("a preview that cannot execute does not replace the existing command", async () => {
  const f = await fixture(false)
  try {
    expect(f.code).not.toBe(0)
    expect(await readFile(path.join(f.prefix, "bin/olivecode"), "utf8")).toBe("old-installed-command\n")
    expect(await readdir(path.join(f.prefix, "bin"))).toEqual(["olivecode"])
  } finally { await rm(f.root, { recursive: true, force: true }) }
})
