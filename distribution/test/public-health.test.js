import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { checkPublicDownloads } from '../public-health.mjs'

function fixture() {
  const repo = 'BenjaminZajko/opencodeFORK'
  const base = `https://github.com/${repo}/releases/download/v0.1.0/`
  const commit = 'a'.repeat(40)
  const bodies = new Map()
  const assets = []
  function add(name, body) {
    bodies.set(base + name, body)
    assets.push({ name, state: 'uploaded', size: body.length, digest: `sha256:${createHash('sha256').update(body).digest('hex')}`, browser_download_url: base + name })
  }
  add('install.sh', '#!/bin/sh\necho OliveCode\n')
  add('install.ps1', 'Write-Output OliveCode\n')
  add('release-verification.json', JSON.stringify({ repository: repo, tag: 'v0.1.0', commit, runID: 1, nativeTestsPassed: true, targets: ['darwin-arm64', 'darwin-x64-baseline', 'windows-x64-baseline', 'windows-arm64', 'linux-x64-baseline', 'linux-arm64', 'linux-x64-baseline-musl', 'linux-arm64-musl'] }))
  for (const target of ['macOS-arm64', 'macOS-x64', 'Windows-x64', 'Windows-arm64', 'Linux-x64', 'Linux-arm64', 'Linux-x64-musl', 'Linux-arm64-musl']) {
    const name = `OliveCode-${target}.zip`
    add(name, `PK-test-${target}`)
    add(name + '.sha256', `${assets.at(-1).digest.slice(7)}  ${name}\n`)
  }
  bodies.set(`https://api.github.com/repos/${repo}/releases/latest`, JSON.stringify({ tag_name: 'v0.1.0', target_commitish: commit, assets }))
  bodies.set(`https://api.github.com/repos/${repo}/actions/runs/1`, JSON.stringify({ status: 'completed', conclusion: 'success', head_sha: commit, path: '.github/workflows/olivecode-preview.yml', repository: { full_name: repo }, event: 'workflow_dispatch' }))
  bodies.set('https://olivecode.dev/install', bodies.get(base + 'install.sh'))
  bodies.set('https://olivecode.dev/install.ps1', bodies.get(base + 'install.ps1'))
  bodies.set('https://olivecode.dev/build-info.json', JSON.stringify({ origin: 'https://olivecode.dev', environment: 'production', downloads: 'verified-release' }))
  const calls = []
  const request = async (url, options = {}) => {
    calls.push({ url, options })
    const body = bodies.get(url)
    if (body === undefined) return new Response('missing', { status: 404 })
    return new Response(options.method === 'HEAD' ? null : body, { headers: { 'content-type': url.endsWith('/install') || url.endsWith('install.ps1') ? 'text/plain' : 'application/octet-stream', 'content-length': String(body.length) } })
  }
  return { bodies, calls, base, request, repo }
}

test('checks both exact installers and eight package pairs without downloading archives or leaking the API token', async () => {
  const data = fixture()
  const result = await checkPublicDownloads({ request: data.request, token: 'test-token' })
  expect(result.checks).toHaveLength(12)
  expect(data.calls.filter(call => call.url.endsWith('.zip')).map(call => call.options.method)).toEqual(Array(8).fill('HEAD'))
  for (const call of data.calls) {
    expect(call.options.headers?.Authorization).toBe(call.url.startsWith('https://api.github.com/') ? 'Bearer test-token' : undefined)
  }
})

test('rejects a stale or altered live installer even when it returns HTTP 200', async () => {
  const data = fixture()
  data.bodies.set('https://olivecode.dev/install', '#!/bin/sh\necho downloads disabled\n')
  await expect(checkPublicDownloads({ request: data.request })).rejects.toThrow('Live installer differs')
})

test('rejects a missing ARM Windows package', async () => {
  const data = fixture()
  data.bodies.delete(data.base + 'OliveCode-Windows-arm64.zip')
  await expect(checkPublicDownloads({ request: data.request })).rejects.toThrow('Package is unavailable')
})

test('rejects a checksum file replaced after release publication', async () => {
  const data = fixture()
  data.bodies.set(data.base + 'OliveCode-Linux-x64.zip.sha256', '0'.repeat(64) + '  OliveCode-Linux-x64.zip\n')
  await expect(checkPublicDownloads({ request: data.request })).rejects.toThrow('Release asset hash mismatch')
})

test('rejects a failed native verification workflow', async () => {
  const data = fixture()
  const url = `https://api.github.com/repos/${data.repo}/actions/runs/1`
  data.bodies.set(url, data.bodies.get(url).replace('success', 'failure'))
  await expect(checkPublicDownloads({ request: data.request })).rejects.toThrow('Native release workflow has not passed')
})

test('rejects a preview site even when its installers still match', async () => {
  const data = fixture()
  data.bodies.set('https://olivecode.dev/build-info.json', JSON.stringify({ origin: 'https://olivecode.dev', environment: 'preview', downloads: 'verified-release' }))
  await expect(checkPublicDownloads({ request: data.request })).rejects.toThrow('Website downloads are not enabled')
})
