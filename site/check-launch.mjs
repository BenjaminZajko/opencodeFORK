import path from 'node:path'
import { readdir, readFile } from 'node:fs/promises'
import { pages } from './build.mjs'
import { checkCloudflareFiles } from './cloudflare.mjs'

export async function checkLaunch(directory) {
  const info=JSON.parse(await readFile(path.join(directory,'build-info.json'),'utf8'))
  const config=await readFile(path.join(directory,'config.js'),'utf8')
  if(info.origin!=='https://olivecode.dev'||!config.includes(info.origin)) throw Error('Wrong primary domain.')
  const files=[]
  async function walk(folder,prefix='') {
    for(const entry of await readdir(folder,{withFileTypes:true})) {
      if(entry.isSymbolicLink()) throw Error('Symlinks are not allowed in the public artifact.')
      const relative=prefix+entry.name
      if(entry.isDirectory()) { await walk(path.join(folder,entry.name),relative+'/');continue }
      files.push(relative)
    }
  }
  await walk(directory)
  const platformFiles=info.host==='Cloudflare Pages' ? ['_headers','_redirects'] : info.host==='Websupport' ? ['.htaccess'] : []
  if(!platformFiles.length) throw Error('Unsupported host in build artifact.')
  const allowed=new Set([...Object.keys(pages),'style.css','site.js','grove.js','languages.js','guide-copy.js','remote-guide-copy.js','install.mjs','config.js','favicon.svg','robots.txt','sitemap.xml','site.webmanifest','build-info.json','install','install.ps1',...platformFiles,'.well-known/security.txt'])
  for(const file of files) {
    if(!allowed.has(file)&&!/^assets\/[a-z0-9-]+\.(svg|webp|png)$/.test(file)) throw Error('Unexpected public file: '+file)
    if(/\.(html|js|mjs|json|txt|xml)$/.test(file)) {
      const text=await readFile(path.join(directory,file),'utf8')
      if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|sk-proj-[A-Za-z0-9_-]{30,}/.test(text)) throw Error('Possible secret in public artifact: '+file)
    }
  }
  const escape=value=>value.replaceAll('&','&amp;').replaceAll('\"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  for(const [name,page] of Object.entries(pages)) {
    const html=await readFile(path.join(directory,name),'utf8')
    if(!html.includes('<title>'+escape(page.title)+'</title>')||!html.includes('property="og:image"')||!html.includes('name="description" content="'+escape(page.description)+'"')) throw Error('Incomplete metadata: '+name)
    if(name!=='404.html'&&!html.includes(`rel="canonical" href="${info.origin}${page.route}"`)) throw Error('Wrong canonical: '+name)
    if(info.environment!=='production'&&!html.includes('noindex,nofollow')) throw Error('Preview indexing must be disabled.')
    for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      const value=match[1]
      if(/^(https?:|mailto:)/.test(value)) continue
      const url=new URL(value,'https://olivecode.dev/')
      let local=url.pathname.slice(1)||'index.html'
      if(!path.extname(local)) local+='.html'
      if(!files.includes(local)) throw Error(`Missing local asset/link in ${name}: ${value}`)
    }
  }
  for(const file of ['assets/social-card.png','assets/apple-touch-icon.png','assets/icon-192.png','assets/icon-512.png','.well-known/security.txt',...platformFiles]) if(!files.includes(file)) throw Error('Missing launch asset: '+file)
  if(info.host==='Cloudflare Pages') await checkCloudflareFiles(directory,files)
  const installer=await readFile(path.join(directory,'install'),'utf8')
  if(info.downloads==='not-published'&&!installer.includes('exit 1')) throw Error('Unverified downloads must fail closed.')
  if(info.downloads==='verified-release'&&!installer.includes('releases/latest/download')) throw Error('Verified installer not included.')
  const privacy=await readFile(path.join(directory,'privacy.html'),'utf8')
  if(!privacy.includes('olivecode.ai@gmail.com')||!privacy.includes(info.host==='Cloudflare Pages'?'Cloudflare':'Websupport')) throw Error('Public host/contact disclosure missing.')
  return {files:files.length,environment:info.environment,downloads:info.downloads,origin:info.origin,host:info.host}
}
