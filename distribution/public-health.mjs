import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const repository = 'BenjaminZajko/opencodeFORK'
const origin = 'https://olivecode.dev'
const targets = ['macOS-arm64', 'macOS-x64', 'Windows-x64', 'Windows-arm64', 'Linux-x64', 'Linux-arm64', 'Linux-x64-musl', 'Linux-arm64-musl']
const nativeTargets = ['darwin-arm64', 'darwin-x64-baseline', 'windows-x64-baseline', 'windows-arm64', 'linux-x64-baseline', 'linux-arm64', 'linux-x64-baseline-musl', 'linux-arm64-musl']

// Only public metadata and small text files are downloaded. No installer is executed.
export async function checkPublicDownloads({ request = fetch, token = process.env.GITHUB_TOKEN } = {}) {
  const checks = []
  async function text(url, api = false) {
    const response = await request(url, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'OliveCode-public-health', ...(api ? { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } : {}) },
    })
    if (!response.ok) throw Error(`Unavailable endpoint (${response.status}): ${url}`)
    if (Number(response.headers.get('content-length')) > 2 * 1024 * 1024) {
      await response.body?.cancel()
      throw Error(`Unexpected response size: ${url}`)
    }
    const body = await response.text()
    if (body.length > 2 * 1024 * 1024) throw Error(`Unexpected response size: ${url}`)
    return { body, response }
  }
  const release = JSON.parse((await text(`https://api.github.com/repos/${repository}/releases/latest`, true)).body)
  if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name ?? '') || !Array.isArray(release.assets)) throw Error('A public stable latest release is required.')
  function asset(name) {
    const found = release.assets.find(item => item.name === name)
    if (!found || found.state !== 'uploaded' || !Number.isSafeInteger(found.size) || found.size <= 0 || found.browser_download_url !== `https://github.com/${repository}/releases/download/${release.tag_name}/${name}` || !/^sha256:[a-f0-9]{64}$/.test(found.digest ?? '')) throw Error(`Missing or invalid release asset: ${name}`)
    return found
  }
  async function smallAsset(name) {
    const item = asset(name)
    const result = await text(item.browser_download_url)
    if (`sha256:${createHash('sha256').update(result.body).digest('hex')}` !== item.digest) throw Error(`Release asset hash mismatch: ${name}`)
    return result.body
  }
  const proof = JSON.parse(await smallAsset('release-verification.json'))
  if (proof.repository !== repository || proof.tag !== release.tag_name || proof.nativeTestsPassed !== true || !/^[a-f0-9]{40}$/.test(proof.commit ?? '') || release.target_commitish !== proof.commit || !Number.isSafeInteger(proof.runID) || proof.runID <= 0 || !Array.isArray(proof.targets) || nativeTargets.some(target => !proof.targets.includes(target))) throw Error('Release native-test record is incomplete or mismatched.')
  const run = JSON.parse((await text(`https://api.github.com/repos/${repository}/actions/runs/${proof.runID}`, true)).body)
  if (run.status !== 'completed' || run.conclusion !== 'success' || run.head_sha !== proof.commit || run.path !== '.github/workflows/olivecode-preview.yml' || run.repository?.full_name !== repository || !(run.event === 'workflow_dispatch' || (run.event === 'push' && /^codex\/release-[a-z0-9.-]+$/.test(run.head_branch ?? '')))) throw Error('Native release workflow has not passed for this release.')
  checks.push('Public release and successful eight-platform native workflow')
  for (const [name, route] of [['install.sh', '/install'], ['install.ps1', '/install.ps1']]) {
    const published = await smallAsset(name)
    const live = await text(origin + route)
    if (!live.response.headers.get('content-type')?.startsWith('text/plain') || live.body !== published) throw Error(`Live installer differs from the verified release: ${route}`)
    checks.push(`Exact published installer at ${route}`)
  }
  for (const target of targets) {
    const name = `OliveCode-${target}.zip`
    const item = asset(name)
    const checksum = await smallAsset(name + '.sha256')
    const match = checksum.trim().match(/^([a-f0-9]{64})\s+\*?([^\r\n]+)$/)
    if (!match || match[1] !== item.digest.slice(7) || match[2] !== name) throw Error(`Package checksum does not match GitHub asset digest: ${name}`)
    const response = await request(item.browser_download_url, { method: 'HEAD', signal: AbortSignal.timeout(20000) })
    if (!response.ok || Number(response.headers.get('content-length')) !== item.size || /text\/html/i.test(response.headers.get('content-type') ?? '')) throw Error(`Package is unavailable or has the wrong size: ${name}`)
    checks.push(`Reachable package and matching checksum metadata: ${target}`)
  }
  const build = JSON.parse((await text(origin + '/build-info.json')).body)
  if (build.origin !== origin || build.environment !== 'production' || build.downloads !== 'verified-release') throw Error('Website downloads are not enabled for production.')
  checks.push('Production website downloads enabled')
  return { checkedAt: new Date().toISOString(), tag: release.tag_name, commit: proof.commit, runID: proof.runID, checks, limitations: 'Checks archive availability, size and published checksum metadata; does not download or execute all archives, verify code signing, or exercise interactive app/provider tasks.' }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await checkPublicDownloads()
  console.log(JSON.stringify(report, null, 2))
}
