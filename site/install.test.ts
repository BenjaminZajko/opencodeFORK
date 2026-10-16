import { describe, expect, test } from 'bun:test'
import { detectOS, installOrigin, installCommand } from './install.mjs'

describe('visitor platform', () => {
  test.each([
    [{ platform: 'MacIntel', userAgent: 'Mozilla Macintosh', maxTouchPoints: 0 }, 'mac'],
    [{ platform: 'Win32' }, 'windows'],
    [{ userAgentData: { platform: 'Windows' }, platform: 'Linux' }, 'windows'],
    [{ platform: 'Linux x86_64' }, 'linux'],
    [{ platform: 'Linux', userAgent: 'Android' }, 'mobile'],
    [{ platform: 'MacIntel', maxTouchPoints: 5 }, 'mobile'],
    [{ userAgent: 'iPhone' }, 'mobile'],
    [{}, 'unknown'],
  ])('detects %j as %s', (browser, result) => expect(detectOS(browser)).toBe(result))
})
describe('branded installer', () => {
  test('uses the owned origin or HTTPS site without exposing a GitHub URL', () => {
    expect(installOrigin('https://owned.example', 'https://preview.example')).toBe('https://owned.example')
    expect(installOrigin('', 'https://owned.example/index.html')).toBe('https://owned.example')
    expect(installOrigin('', 'https://user.github.io/project/index.html')).toBe('https://user.github.io/project')
    expect(installCommand('mac', 'https://owned.example')).toBe('curl -fsSL https://owned.example/install | sh')
    expect(installCommand('windows', 'https://owned.example')).toBe('irm https://owned.example/install.ps1 | iex')
  })
  test('local previews use a reserved example, never an unowned domain', () => {
    expect(installOrigin('', 'file:///preview/index.html')).toBe('https://olivecode.example')
    expect(installOrigin('', 'http://localhost:8765')).toBe('https://olivecode.example')
  })
  test.each(['http://owned.example', 'https://user:pass@owned.example', 'https://owned.example/path', 'https://owned.example?query', 'https://owned.example#hash'])('rejects unsafe public origin %s', (origin) => {
    expect(() => installOrigin(origin, 'https://preview.example')).toThrow()
  })
})
