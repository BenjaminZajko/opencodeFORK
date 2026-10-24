export function detectOS({ userAgentData, userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  const hint = userAgentData?.platform || platform
  if (/android|iphone|ipad|ipod/i.test(userAgent) || (/Mac/i.test(hint) && maxTouchPoints > 1)) return 'mobile'
  if (/windows|win32|win64/i.test(hint + ' ' + userAgent)) return 'windows'
  if (/mac/i.test(hint + ' ' + userAgent)) return 'mac'
  if (/linux|cros/i.test(hint + ' ' + userAgent)) return 'linux'
  return 'unknown'
}

export function installOrigin(configured, pageURL) {
  if (configured) {
    const url = new URL(configured)
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      throw new Error('Public origin must be an HTTPS origin without a path.')
    return url.origin
  }
  const url = new URL(pageURL)
  if (url.protocol === 'https:' && url.hostname !== 'localhost') return new URL('.', url).href.replace(/\/$/, '')
  return 'https://olivecode.example'
}

export function installCommand(os, origin) {
  return os === 'windows'
    ? `irm ${origin}/install.ps1 | iex`
    : `curl -fsSL ${origin}/install | sh`
}
