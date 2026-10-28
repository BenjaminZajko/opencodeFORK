import semver from "semver"

export const releasePage = "https://github.com/BenjaminZajko/opencodeFORK/releases/latest"
export const updateGuide = "https://olivecode.dev/guide"

/** Only announce complete stable OliveCode releases; never execute downloaded code. */
export async function availableUpdate(
  current: string,
  request: (url: string, init?: RequestInit) => Promise<Response> = fetch,
) {
  if (!semver.valid(current)) return
  const response = await request("https://api.github.com/repos/BenjaminZajko/opencodeFORK/releases/latest", {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "OliveCode-update-check" },
    signal: AbortSignal.timeout(5000),
    redirect: "error",
  })
  if (!response.ok) return
  const release: unknown = await response.json()
  if (!release || typeof release !== "object" || !("tag_name" in release) || typeof release.tag_name !== "string")
    return
  if (!("draft" in release) || release.draft !== false || !("prerelease" in release) || release.prerelease !== false)
    return
  const version = release.tag_name.replace(/^v/, "")
  if (!semver.valid(version) || semver.prerelease(version) || !semver.gt(version, current)) return
  if (!("assets" in release) || !Array.isArray(release.assets)) return
  const names = new Set(
    release.assets.flatMap((asset: unknown) =>
      asset &&
      typeof asset === "object" &&
      "name" in asset &&
      typeof asset.name === "string" &&
      "state" in asset &&
      asset.state === "uploaded"
        ? [asset.name]
        : [],
    ),
  )
  const packages = [
    "macOS-arm64",
    "macOS-x64",
    "Windows-arm64",
    "Windows-x64",
    "Linux-arm64",
    "Linux-x64",
    "Linux-arm64-musl",
    "Linux-x64-musl",
  ]
  if (
    !names.has("release-verification.json") ||
    packages.some((target) => !names.has(`OliveCode-${target}.zip`) || !names.has(`OliveCode-${target}.zip.sha256`))
  )
    return
  return version
}
