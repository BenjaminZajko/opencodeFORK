import { siteConfig } from './config.js'
import './languages.js'

const reveals=document.querySelectorAll('[data-reveal]')
if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if (entry.isIntersecting) {entry.target.classList.add('revealed');observer.unobserve(entry.target)}
  }),{threshold:.1})
  reveals.forEach(node=>{node.classList.add('reveal-ready');observer.observe(node)})
}
// The installer is independent of the decorative scene and its optional GPU work.
if (document.querySelector('#grove-canvas')) {
  const startGrove = () => import('./grove.js').then(module => module.mountGrove()).catch(() => {})
  if ('requestIdleCallback' in window) requestIdleCallback(startGrove, {timeout:1500})
  else setTimeout(startGrove, 100)
}
import { detectOS, installOrigin, installCommand } from './install.mjs'

const year = document.getElementById('year')
if (year) year.textContent = new Date().getFullYear()
const code = document.getElementById('install-command')
if (code) {
  const detected = detectOS(navigator)
  const origin = installOrigin(siteConfig.publicOrigin, location.href)
  const button = document.getElementById('copy-command')
  const status = document.getElementById('install-status')
  const help = document.getElementById('install-help')
  const radios = [...document.querySelectorAll('input[name="os"]')]
  let selected = ['windows', 'linux'].includes(detected) ? detected : 'mac'

  function render(os, initial = false) {
    selected = os
    const unsupported = initial && !['mac', 'windows', 'linux'].includes(detected)
    radios.forEach((radio) => { radio.checked = !unsupported && radio.value === os })
    code.textContent = installCommand(os, origin)
    document.getElementById('shell-label').textContent = os === 'windows' ? 'PowerShell' : 'Terminal'
    document.getElementById('prompt-sign').textContent = os === 'windows' ? '>' : '$'
    help.replaceChildren()
    help.append(`Open your project folder in ${os === 'windows' ? 'PowerShell' : 'Terminal'} and run `)
    const command = document.createElement('code')
    command.textContent = 'olivecode'
    command.translate = false
    help.append(command, '.')
    status.textContent = unsupported
      ? detected === 'mobile' ? 'Install on a Mac, Windows or Linux computer. Choose its OS above.'
        : detected === 'linux' ? 'Linux is not published yet. Choose macOS or Windows above for another computer.'
        : 'Choose your computer’s operating system above.'
      : siteConfig.releaseReady ? 'Installs to your user account. No administrator access needed.' : 'Preview. The installer is not published yet; copying will be available when it is ready.'
    button.disabled = !siteConfig.releaseReady || origin.endsWith('.example') || unsupported
    button.setAttribute('aria-label', 'Copy install command')
    button.setAttribute('aria-describedby', 'install-status')
    button.title = button.disabled ? 'The OliveCode installer is not published yet.' : ''
  }

  render(selected, true)
  radios.forEach((radio) => radio.addEventListener('change', () => render(radio.value)))
  button.addEventListener('click', async () => {
    const command = installCommand(selected, origin)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(command)
      button.textContent = 'Copied'
      status.textContent = 'Copied. Paste into your terminal to install OliveCode.'
    } catch {
      // Clipboard API access is restricted in some browsers. Try the legacy
      // copy command synchronously from this click before falling back to text
      // selection, which lets keyboard and context-menu copy still work.
      const field = document.createElement('textarea')
      field.value = command
      field.readOnly = true
      field.setAttribute('aria-hidden', 'true')
      Object.assign(field.style, { position: 'fixed', insetInlineStart: '-9999px', top: '0', opacity: '0' })
      document.body.append(field)
      field.focus()
      field.select()
      let copied = false
      try { copied = document.execCommand('copy') } catch {}
      field.remove()
      if (copied) {
        button.textContent = 'Copied'
        status.textContent = 'Copied. Paste into your terminal to install OliveCode.'
      } else {
        const range = document.createRange()
        range.selectNodeContents(code)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        status.textContent = 'Command selected. Press ⌘C or Ctrl+C to copy it.'
      }
    }
    window.setTimeout(() => { button.textContent = 'Copy' }, 1800)
  })
}

const controlDescriptions = {
  visible: ['Websites and Mac apps, in front of you.', 'Watch the pointer move smoothly and short text appear as it types. Visible Mac control shares your mouse and keyboard.'],
  browser: ['Website tasks, without taking your mouse.', 'A separate background browser works while you use your computer. Check progress in the chat. This mode controls websites, not native apps or your existing browser tabs.'],
  mac: ['Mac apps on a separate Mac or virtual machine.', 'Background Mac is a setup-required preview. It needs an isolated macOS VM or second Mac with its own permissions and connection. It never silently uses your main desktop. Native Windows app control is not available yet.'],
}
for (const radio of document.querySelectorAll('input[name="control-mode"]')) radio.addEventListener('change', () => {
  const [title, text] = controlDescriptions[radio.value]
  const panel = document.querySelector('#control-description')
  panel.querySelector('strong').textContent = title
  panel.querySelector('p').textContent = text
})
