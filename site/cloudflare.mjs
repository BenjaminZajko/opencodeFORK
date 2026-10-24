import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

export function cloudflareHeaders(csp, production) {
  const common = `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Strict-Transport-Security: max-age=31536000
  Content-Security-Policy: ${csp}
${production ? '' : '  X-Robots-Tag: noindex, nofollow\n'}`
  const fresh = ['/', '/guide', '/privacy', '/sponsors', '/about', '/terms', '/*.html', '/config.js', '/build-info.json', '/site.webmanifest'].map(route => `${route}\n  Cache-Control: no-cache\n`).join('\n')
  const installers = ['/install', '/install.ps1'].map(route => `${route}\n  Content-Type: text/plain; charset=utf-8\n  Cache-Control: no-store\n  X-Robots-Tag: noindex\n`).join('\n')
  const previews = ['https://:project.pages.dev/*', 'https://:version.:project.pages.dev/*'].map(route => `${route}\n  X-Robots-Tag: noindex\n`).join('\n')
  return [common, fresh, installers, previews].join('\n')
}

export function cloudflareRedirects() {
  // Hostname redirects belong in zone Redirect Rules, not Pages _redirects.
  return '# Domain redirects are configured separately in Cloudflare Redirect Rules.\n/index.html / 301\n' + ['guide', 'privacy', 'sponsors', 'about', 'terms'].flatMap(route => [`/${route}.html /${route} 301`, `/${route}/ /${route} 301`]).join('\n') + '\n'
}

export async function checkCloudflareFiles(directory, files) {
  const headers = await readFile(path.join(directory, '_headers'), 'utf8')
  const redirects = await readFile(path.join(directory, '_redirects'), 'utf8')
  if (headers.split('\n').some(line => line.length > 2000)) throw Error('Cloudflare header exceeds its 2,000-character limit.')
  if (files.length > 20000) throw Error('Cloudflare Pages Free file limit exceeded.')
  for (const file of files) if ((await stat(path.join(directory, file))).size > 25 * 1024 * 1024) throw Error('Cloudflare asset exceeds 25 MiB: ' + file)
  if (files.includes('.htaccess') || files.some(file => file.startsWith('functions/') || file === '_worker.js')) throw Error('Cloudflare bundle must contain only static assets and platform rules.')
  if (!headers.includes("script-src 'self'") || !headers.includes('https://:project.pages.dev/*')) throw Error('Cloudflare CSP or preview noindex missing.')
  if (redirects.split('\n').some(line => /^https?:/.test(line))) throw Error('Pages does not support domain-level _redirects; configure Redirect Rules.')
  for (const route of ['/install', '/install.ps1']) if (!headers.includes(`${route}\n  Content-Type: text/plain; charset=utf-8\n  Cache-Control: no-store`)) throw Error('Installer must be uncached plain text.')
}
