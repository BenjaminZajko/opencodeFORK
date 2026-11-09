import { test, expect } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildSite } from './build.mjs'

test('measurement is permitted only on Cloudflare production and disclosed accurately', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'olivecode-measurement-'))
  try {
    for (const [production, host, enabled] of [[true, 'Cloudflare Pages', true], [false, 'Cloudflare Pages', false], [true, 'Websupport', false]] as const) {
      const built = await buildSite({ production, host, releaseReady: false, output: path.join(dir, 'site') })
      expect(built.csp.includes('https://static.cloudflareinsights.com')).toBe(enabled)
      expect(built.csp.includes('https://cloudflareinsights.com')).toBe(enabled)
      expect(built.csp).toContain("object-src 'none'")
      expect(built.csp).not.toContain('https:;')
      if(host==='Cloudflare Pages') expect(await readFile(path.join(built.output, '_headers'), 'utf8')).toContain('Referrer-Policy: same-origin')
      const privacy = await readFile(path.join(built.output, 'privacy.html'), 'utf8')
      expect(privacy).toContain('persistent browser identifiers')
      expect(privacy).toContain('they do not establish unique users or successful installations')
      const html = await readFile(path.join(built.output, 'index.html'), 'utf8')
      expect(html.includes('beacon.min.js')).toBe(enabled)
      if(enabled) {
        expect(html.match(/src="https:\/\/static.cloudflareinsights.com\/beacon.min.js"/g)?.length).toBe(1)
        expect(html).toContain('data-cf-beacon="{&quot;token&quot;:')
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
