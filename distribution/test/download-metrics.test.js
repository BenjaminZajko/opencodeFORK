import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarize, markdown, collect } from '../download-metrics.mjs'

const time = '2026-10-21T12:00:00Z'
const release = (downloads = 7, id = 1) => [{ tag_name: 'v0.1.0', published_at: time, assets: [
  { id, name: 'OliveCode-macOS-arm64.zip', download_count: downloads, state: 'uploaded' },
  ...['install.sh', 'OliveCode-macOS-arm64.zip.sha256', 'OliveCode-real-coding-walkthrough.mp4'].map((name, i) => ({ id: i + 100, name, download_count: 1000, state: 'uploaded' }))
] }]
test('first measurement excludes scripts/checksums/video and does not invent growth', () => {
  const result = summarize(release(), undefined, time)
  assert.equal(result.totalPackageDownloads, 7)
  assert.equal(result.assets.length, 1)
  assert.equal(result.comparableAssetIncrease, null)
  assert.match(markdown(result), /not users or installations/)
})
test('growth is measured between real observations of the same asset', () => {
  const prior = summarize(release(), undefined, time)
  const result = summarize(release(10), prior, '2026-10-23T12:00:00Z')
  assert.equal(result.comparableAssetIncrease, 3)
  assert.equal(result.previousCapturedAt, time)
})
test('replaced assets establish a new baseline rather than fabricated growth', () => {
  const prior = summarize(release(), undefined, time)
  const result = summarize(release(12, 2), prior, '2026-10-22T12:00:00Z')
  assert.equal(result.comparableAssetIncrease, 0)
  assert.equal(result.newAssetBaseline, 12)
  assert.equal(result.warnings.length, 1)
})
test('counter resets warn without negative growth', () => {
  const result = summarize(release(1), summarize(release(), undefined, time), '2026-10-22T12:00:00Z')
  assert.equal(result.comparableAssetIncrease, 0)
  assert.equal(result.warnings.length, 1)
})
test('bad and empty responses cannot become zero-download reports', async () => {
  assert.throws(() => summarize([], undefined, time))
  assert.throws(() => summarize(release(-1), undefined, time))
  assert.throws(() => summarize(release(), { repository: 'wrong' }, time))
  await assert.rejects(collect({ request: async () => new Response('denied', { status: 403 }) }))
})
test('pagination includes later releases and skips drafts', async () => {
  let calls = 0
  const result = await collect({ token: 'fixture', request: async (url, options) => {
    calls++
    assert.equal(options.headers.Authorization, 'Bearer fixture')
    return Response.json(calls === 1 ? Array.from({ length: 100 }, (_, i) => ({ draft: true, assets: [] })) : release())
  } })
  assert.equal(calls, 2)
  assert.equal(summarize(result, undefined, time).totalPackageDownloads, 7)
})
