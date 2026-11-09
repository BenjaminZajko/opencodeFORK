import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const repository = 'BenjaminZajko/opencodeFORK'
const archive = /^OliveCode-(macOS|Windows|Linux)-(arm64|x64)(-musl)?\.zip$/

export function summarize(releases, previous, now = new Date().toISOString()) {
  if (!Array.isArray(releases) || !Number.isFinite(Date.parse(now))) throw Error('Invalid release data or timestamp')
  if (previous && (previous.repository !== repository || previous.schema !== 1 || !Array.isArray(previous.assets) || !Number.isFinite(Date.parse(previous.capturedAt)) || Date.parse(previous.capturedAt) >= Date.parse(now))) throw Error('Invalid previous snapshot')
  const seen = new Set()
  const assets = releases.filter(r => !r.draft && r.published_at).flatMap(release => {
    if (!Array.isArray(release.assets)) throw Error('Missing release assets')
    return release.assets.filter(a => archive.test(a.name)).map(a => {
      const match = archive.exec(a.name)
      if (!Number.isSafeInteger(a.id) || !Number.isSafeInteger(a.download_count) || a.download_count < 0 || a.state !== 'uploaded' || seen.has(a.id)) throw Error('Invalid or duplicate package counter')
      seen.add(a.id)
      return { id: a.id, name: a.name, tag: release.tag_name, platform: match[1], architecture: match[2] + (match[3] || ''), downloads: a.download_count }
    })
  })
  if (!assets.length) throw Error('No public software packages found; refusing an empty measurement')
  const old = new Map((previous?.assets || []).map(a => [a.id, a]))
  if (previous && old.size !== previous.assets.length) throw Error('Duplicate previous package ID')
  const warnings = []
  for (const a of old.values()) {
    if (!Number.isSafeInteger(a.downloads) || a.downloads < 0) throw Error('Invalid previous counter')
    if (!seen.has(a.id)) warnings.push(`Previously observed asset ${a.id} is missing; totals are not directly comparable.`)
  }
  const comparable = a => old.has(a.id) && a.downloads >= old.get(a.id).downloads
  for (const a of assets) if (old.has(a.id) && !comparable(a)) warnings.push(`Counter decreased for asset ${a.id}; no negative download estimate reported.`)
  const platforms = ['macOS', 'Windows', 'Linux'].map(platform => {
    const selected = assets.filter(a => a.platform === platform)
    return { platform, downloads: selected.reduce((n, a) => n + a.downloads, 0), comparableAssetIncrease: previous ? selected.filter(comparable).reduce((n, a) => n + a.downloads - old.get(a.id).downloads, 0) : null }
  })
  return {
    schema: 1, repository, capturedAt: now, previousCapturedAt: previous?.capturedAt || null,
    totalPackageDownloads: assets.reduce((n, a) => n + a.downloads, 0),
    comparableAssetIncrease: previous ? platforms.reduce((n, p) => n + p.comparableAssetIncrease, 0) : null,
    newAssetBaseline: previous ? assets.filter(a => !old.has(a.id)).reduce((n, a) => n + a.downloads, 0) : null,
    platforms, assets, warnings,
    definition: 'GitHub software archive download counters; excludes scripts, checksums and videos. Includes tests, bots and repeat downloads. Not unique people, installations or active users. Increases compare the same asset IDs over the actual snapshot interval; new assets begin a separate baseline.'
  }
}

export function markdown(snapshot) {
  const lines = ['# OliveCode package downloads', '', `Captured: ${snapshot.capturedAt}`, '', `**${snapshot.totalPackageDownloads} cumulative package downloads** — not users or installations.`, '', snapshot.previousCapturedAt ? `Previous observation: ${snapshot.previousCapturedAt}. Same-asset increase: **${snapshot.comparableAssetIncrease}**. New-asset baseline: **${snapshot.newAssetBaseline}** (not counted as interval growth).` : 'First observation: baseline only. No daily growth is inferred.', '', '| Platform | Cumulative downloads | Same-asset increase |', '| --- | ---: | ---: |', ...snapshot.platforms.map(p => `| ${p.platform} | ${p.downloads} | ${p.comparableAssetIncrease ?? 'Baseline'} |`), '', snapshot.definition]
  if (snapshot.warnings.length) lines.push('', '## Counter changes', ...snapshot.warnings.map(w => `- ${w}`))
  return lines.join('\n') + '\n'
}

export async function collect({ request = fetch, token = process.env.GITHUB_TOKEN } = {}) {
  const releases = []
  for (let page = 1; page <= 20; page++) {
    const response = await request(`https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'OliveCode-download-metrics', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(20000)
    })
    if (!response.ok) throw Error(`GitHub release counters unavailable (${response.status})`)
    const batch = await response.json()
    if (!Array.isArray(batch)) throw Error('Unexpected GitHub response')
    releases.push(...batch)
    if (batch.length < 100) return releases
  }
  throw Error('Release pagination limit exceeded; refusing a partial total')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const output = path.resolve(process.env.OLIVECODE_METRICS_OUTPUT || 'download-metrics')
  const previousPath = process.env.OLIVECODE_METRICS_PREVIOUS
  const previous = previousPath ? JSON.parse(await readFile(previousPath, 'utf8')) : undefined
  const snapshot = summarize(await collect(), previous)
  await mkdir(output, { recursive: true })
  await writeFile(path.join(output, 'snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n')
  await writeFile(path.join(output, 'report.md'), markdown(snapshot))
  console.log(markdown(snapshot))
}
