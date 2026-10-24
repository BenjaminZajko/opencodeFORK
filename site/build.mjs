import path from 'node:path'
import { mkdir, readFile, writeFile, cp, rm, rename, mkdtemp, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { cloudflareHeaders, cloudflareRedirects } from './cloudflare.mjs'

export const root = fileURLToPath(new URL('../', import.meta.url))
export const requiredAssets = ['macOS-arm64','macOS-x64','Windows-x64','Windows-arm64','Linux-x64','Linux-arm64','Linux-x64-musl','Linux-arm64-musl'].flatMap(target=>[`OliveCode-${target}.zip`,`OliveCode-${target}.zip.sha256`]).concat(['install.sh','install.ps1','release-verification.json'])
export const pages = {
  'index.html': { route:'/', title:'OliveCode — Free AI coding agents in your terminal', description:'Build with free cloud or local AI models. OliveCode edits your project, runs tools and checks, and supports optional computer control and Telegram tasks.' },
  'guide.html': { route:'/guide', title:'Installation & remote guide | OliveCode', description:'Install OliveCode on supported macOS, Windows and Linux computers. Connect free models, use Assist and set up Computer or Telegram Remote.' },
  'privacy.html': { route:'/privacy', title:'Privacy | OliveCode', description:'How OliveCode handles website visits, connected providers, local models, computer control, remote messaging and sponsor information.' },
  'sponsors.html': { route:'/sponsors', title:'Sponsor free coding | OliveCode', description:'Support free coding with clearly labeled sponsor placements inside OliveCode. Contact the project about pilot campaigns and reporting.' },
  'about.html': { route:'/about', title:'About & contact | OliveCode', description:'Learn about OliveCode, its open-source foundation, and how to contact the project for support, sponsorships and privacy enquiries.' },
  'terms.html': { route:'/terms', title:'Terms of use | OliveCode', description:'What to expect from OliveCode: provider limits, AI-generated results, permissions, remote control, open-source licensing and support.' },
  '404.html': { route:'/404', title:'Page not found | OliveCode', description:'This page could not be found. Return to OliveCode or open the installation guide.' },
}
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')
export function validateReleaseProof(proof, config, now=Date.now()) {
  if (!proof || proof.verified !== true || proof.repository !== config.repository || proof.origin !== config.origin || !/^v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(proof.tag ?? '') || !/^[a-f0-9]{40}$/.test(proof.commit ?? '') || !Number.isSafeInteger(proof.runID) || proof.runID<=0 || !Array.isArray(proof.assets) || requiredAssets.some(name=>!proof.assets.includes(name))) throw Error('A complete, verified public release is required before enabling downloads.')
  const checked=Date.parse(proof.checkedAt)
  if (!Number.isFinite(checked) || now-checked>24*60*60*1000 || checked>now+60000) throw Error('Release verification must be refreshed within 24 hours of the website build.')
  return proof
}
export function apacheConfig(csp, production) {
  return String.raw`# Generated public-only static site. Upload this hidden file too.
Options -Indexes -MultiViews
DirectoryIndex index.html
ErrorDocument 404 /404.html
RewriteEngine On
# Websupport: enable the certificate for every domain before upload.
RewriteCond %{HTTP_HOST} !^olivecode\.dev$ [NC,OR]
RewriteCond %{HTTPS} !=on
RewriteRule ^ https://olivecode.dev%{REQUEST_URI} [R=301,L,NE]
# Never expose hidden files, source/config archives or executable server code.
RewriteRule (^|/)\.(?!well-known(?:/|$)) - [F,L]
RewriteRule \.(?:php[0-9]?|phtml|phar|py|cgi|pl|pem|key|sqlite|db|bak|env|log)$ - [F,L,NC]
RewriteCond %{THE_REQUEST} \s/+index\.html(?:[?\s]) [NC]
RewriteRule ^index\.html$ / [R=301,L]
RewriteCond %{THE_REQUEST} \s/+(guide|privacy|sponsors|about|terms)\.html(?:[?\s]) [NC]
RewriteRule ^(guide|privacy|sponsors|about|terms)\.html$ /$1 [R=301,L]
RewriteRule ^(guide|privacy|sponsors|about|terms)/+$ /$1 [R=301,L]
RewriteRule ^(guide|privacy|sponsors|about|terms)$ $1.html [END]
<IfModule mod_mime.c>
  AddType application/javascript .js .mjs
  AddType image/svg+xml .svg
  AddType image/webp .webp
  AddType application/manifest+json .webmanifest
</IfModule>
<FilesMatch "^(install|install\.ps1)$">
  SetHandler default-handler
  ForceType text/plain
</FilesMatch>
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "DENY"
  Header always set Referrer-Policy "no-referrer"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  Header always set Content-Security-Policy "${csp}"
  Header always set Strict-Transport-Security "max-age=31536000" "expr=%{HTTPS} == 'on'"
  Header always unset X-Powered-By
  Header set Cache-Control "public, max-age=3600"
  <FilesMatch "\.(html|json|webmanifest)$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  <Files "config.js">
    Header set Cache-Control "no-cache"
  </Files>
  <FilesMatch "^(install|install\.ps1)$">
    Header set Content-Type "text/plain; charset=utf-8"
    Header set Cache-Control "no-store"
    Header always set X-Robots-Tag "noindex"
  </FilesMatch>
  ${production ? '' : 'Header always set X-Robots-Tag "noindex, nofollow"'}
</IfModule>
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/css application/javascript application/json image/svg+xml
</IfModule>
`
}

export async function buildSite(options={}) {
  const config=JSON.parse(await readFile(path.join(root,'site/launch.json'),'utf8'))
  const production=options.production ?? process.env.OLIVECODE_SITE_ENV==='production'
  const host=options.host ?? process.env.OLIVECODE_SITE_HOST ?? config.host
  if(!['Cloudflare Pages','Websupport'].includes(host)) throw Error('Unsupported website host.')
  const publicOrigin=process.env.OLIVECODE_PUBLIC_ORIGIN || config.origin
  if (publicOrigin!==config.origin || config.origin!=='https://olivecode.dev' || config.aliases.some(host=>!/^(?:www\.)?olivecode\.(dev|online)$/.test(host)) || !/^[^\s@<>]+@[^\s@<>]+\.[A-Za-z]{2,}$/.test(config.contact)) throw Error('Invalid owned-domain or public contact configuration.')
  const releaseReady=options.releaseReady ?? process.env.OLIVECODE_RELEASE_READY==='true'
  const proofPath=options.proofPath ?? process.env.OLIVECODE_RELEASE_VERIFICATION
  const proof=releaseReady ? validateReleaseProof(proofPath ? JSON.parse(await readFile(proofPath,'utf8')) : undefined,config) : undefined
  if(proof) for(const name of ['install.sh','install.ps1']) {
    const digest=createHash('sha256').update(await readFile(path.join(root,'distribution',name))).digest('hex')
    if(proof.scriptHashes?.[name]!==digest) throw Error('Local installer differs from the verified public release. Build the site from the matching source commit.')
  }
  const output=path.resolve(options.output ?? path.join(root,'site-dist'))
  if ([root,path.join(root,'site'),path.dirname(root),'/'].includes(output)) throw Error('Refusing unsafe build output path.')
  const staging=await mkdtemp(path.join(root,'.site-build-'))
  const version=createHash('sha256').update(String(Date.now())).digest('hex').slice(0,12)
  const versionAssets=source=>source.replace(/(['"])(\.?\/[^'"]+\.(?:css|js|mjs|svg|webp|png))\1/g,(_,quote,url)=>`${quote}${url}?v=${version}${quote}`)
  const schema=JSON.stringify({'@context':'https://schema.org','@graph':[{'@type':'WebSite','name':'OliveCode','url':config.origin+'/'},{'@type':'SoftwareApplication','name':'OliveCode','url':config.origin+'/','applicationCategory':'DeveloperApplication','operatingSystem':'macOS, Windows, Linux','isAccessibleForFree':true,'description':pages['index.html'].description,'softwareHelp':config.origin+'/guide','license':'https://github.com/'+config.repository+'/blob/dev/LICENSE'}]}).replaceAll('<','\\u003c')
  const hash=createHash('sha256').update(schema).digest('base64')
  const csp=`default-src 'self'; script-src 'self' 'sha256-${hash}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; upgrade-insecure-requests`
  try {
    const scene=await Bun.build({entrypoints:[path.join(root,'site/grove.js')],outdir:staging,target:'browser',minify:true})
    if(!scene.success) throw new AggregateError(scene.logs,'Olive grove build failed')
    const latest=new Date().toISOString()
    for(const [name,page] of Object.entries(pages)) {
      let html=await readFile(path.join(root,'site',name),'utf8')
      if(name==='privacy.html' && host==='Websupport') html=html.replace(/<span data-host-disclosure>[\s\S]*?<\/span>/, '<span data-host-disclosure>The website is prepared for Websupport hosting. Websupport processes IP addresses, timestamps, requested URLs and technical logs to deliver and protect the website. Hosting configuration and retention are managed through Websupport; see its <a href="https://www.websupport.sk/sukromie/" rel="noreferrer">privacy information</a>.</span>')
      html=html.replace(/<title>[\s\S]*?<\/title>/,`<title>${escape(page.title)}</title>`).replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${escape(page.description)}">`)
      html=html.replace(/href="\.\/index\.html(?=["#?])/g,'href="/').replace(/href="\.\/(guide|privacy|sponsors|about|terms)\.html/g,'href="/$1')
      if(name==='404.html') html=html.replaceAll('="./','="/')
      const metadata=`${name==='404.html'?'':`<link rel="canonical" href="${config.origin}${page.route}">`}<meta name="robots" content="${production && name!=='404.html'?'index,follow,max-image-preview:large':'noindex,nofollow'}"><meta property="og:type" content="website"><meta property="og:site_name" content="OliveCode"><meta property="og:title" content="${escape(page.title)}"><meta property="og:description" content="${escape(page.description)}"><meta property="og:url" content="${config.origin}${page.route}"><meta property="og:image" content="${config.origin}/assets/social-card.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="OliveCode pixel olive logo. Free AI coding agents. Your terminal."><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(page.title)}"><meta name="twitter:description" content="${escape(page.description)}"><meta name="twitter:image" content="${config.origin}/assets/social-card.png"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest">${name==='index.html'?`<script type="application/ld+json">${schema}</script>`:''}`
      html=html.replace('</head>',metadata+'</head>')
      await writeFile(path.join(staging,name),versionAssets(html))
    }
    for(const name of ['style.css','site.js','languages.js','guide-copy.js','remote-guide-copy.js','install.mjs','favicon.svg']) await writeFile(path.join(staging,name),versionAssets(await readFile(path.join(root,'site',name),'utf8')))
    await cp(path.join(root,'site/assets'),path.join(staging,'assets'),{recursive:true})
    await writeFile(path.join(staging,'config.js'),`export const siteConfig = ${JSON.stringify({publicOrigin,releaseReady,version:proof?.tag ?? null})}\n`)
    for(const [destination,source] of [['install','install.sh'],['install.ps1','install.ps1']]) {
      const content=releaseReady ? await readFile(path.join(root,'distribution',source),'utf8') : source==='install.sh' ? '#!/bin/sh\nprintf \'OliveCode public downloads are not published yet. Check https://olivecode.dev/guide for availability.\\n\' >&2\nexit 1\n' : 'throw "OliveCode public downloads are not published yet. Check https://olivecode.dev/guide for availability."\n'
      await writeFile(path.join(staging,destination),content)
    }
    if(host==='Websupport') await writeFile(path.join(staging,'.htaccess'),apacheConfig(csp,production))
    if(host==='Cloudflare Pages') {
      await writeFile(path.join(staging,'_headers'),cloudflareHeaders(csp,production))
      await writeFile(path.join(staging,'_redirects'),cloudflareRedirects())
    }
    await writeFile(path.join(staging,'robots.txt'),production ? `User-agent: *\nAllow: /\nSitemap: ${config.origin}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n')
    const urls=await Promise.all(Object.entries(pages).filter(([name])=>name!=='404.html').map(async([name,page])=>`<url><loc>${config.origin}${page.route}</loc><lastmod>${(await stat(path.join(root,'site',name))).mtime.toISOString().slice(0,10)}</lastmod></url>`))
    await writeFile(path.join(staging,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>\n`)
    await mkdir(path.join(staging,'.well-known'))
    await writeFile(path.join(staging,'.well-known/security.txt'),`Contact: mailto:${config.contact}\nExpires: ${new Date(Date.now()+180*24*60*60*1000).toISOString()}\nPreferred-Languages: en, sk\nCanonical: ${config.origin}/.well-known/security.txt\n`)
    await writeFile(path.join(staging,'site.webmanifest'),JSON.stringify({name:'OliveCode',short_name:'OliveCode',start_url:'/',display:'browser',background_color:'#171717',theme_color:'#171717',icons:[{src:'/assets/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/assets/icon-512.png',sizes:'512x512',type:'image/png'}]}))
    await writeFile(path.join(staging,'build-info.json'),JSON.stringify({site:'OliveCode',origin:config.origin,environment:production?'production':'preview',host,downloads:releaseReady?'verified-release':'not-published',release:proof?.tag ?? null,builtAt:latest,assetsVersion:version},null,2)+'\n')
    await rm(output,{recursive:true,force:true}); await rename(staging,output)
    return {output,production,releaseReady,csp,host}
  } catch(error) { await rm(staging,{recursive:true,force:true}); throw error }
}
