import { test, expect } from "bun:test"
import { availableUpdate } from "../../src/olivecode/update"

const assets = [
  "macOS-arm64",
  "macOS-x64",
  "Windows-arm64",
  "Windows-x64",
  "Linux-arm64",
  "Linux-x64",
  "Linux-arm64-musl",
  "Linux-x64-musl",
]
  .flatMap((target) =>
    [`.zip`, `.zip.sha256`].map((suffix) => ({ name: `OliveCode-${target}${suffix}`, state: "uploaded" })),
  )
  .concat([{ name: "release-verification.json", state: "uploaded" }])

test("only a newer complete stable release triggers a notice; errors and incomplete releases stay quiet", async () => {
  let release = { tag_name: "v0.2.0", draft: false, prerelease: false, assets }
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => Response.json(release) })
  const request = (_url: string, init?: RequestInit) => fetch(server.url, init)
  try {
    expect(await availableUpdate("0.1.0", request)).toBe("0.2.0")
    expect(await availableUpdate("0.2.0", request)).toBeUndefined()
    expect(await availableUpdate("0.3.0", request)).toBeUndefined()
    expect(await availableUpdate("local", request)).toBeUndefined()
    release = { ...release, assets: assets.slice(1) }
    expect(await availableUpdate("0.1.0", request)).toBeUndefined()
    release = { ...release, assets, prerelease: true }
    expect(await availableUpdate("0.1.0", request)).toBeUndefined()
    release = { ...release, prerelease: false, draft: true }
    expect(await availableUpdate("0.1.0", request)).toBeUndefined()
  } finally {
    server.stop(true)
  }
})
