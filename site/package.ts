import path from 'node:path'
import { mkdir, writeFile, rm, copyFile } from 'node:fs/promises'
import { root } from './build.mjs'
import { checkLaunch } from './check-launch.mjs'

const source=path.join(root,'site-dist')
const checked=await checkLaunch(source)
if(checked.environment!=='production') throw Error('Build OLIVECODE_SITE_ENV=production before making the upload bundle.')
const cloudflare=checked.host==='Cloudflare Pages'
const out=path.join(root,'distribution',cloudflare?'cloudflare':'websupport')
await mkdir(out,{recursive:true})
const archive=path.join(out,'OliveCode-olivecode.dev-web.zip')
await rm(archive,{force:true})
const zip=Bun.spawn(['zip','-qr',archive,'.'],{cwd:source,stdout:'inherit',stderr:'inherit'})
if(await zip.exited!==0) throw Error('Could not package the website.')
const hash=new Bun.CryptoHasher('sha256').update(await Bun.file(archive).arrayBuffer()).digest('hex')
await writeFile(archive+'.sha256',hash+'  '+path.basename(archive)+'\n')
if(cloudflare) {
 await copyFile(path.join(root,'docs/OLIVECODE_CLOUDFLARE_LAUNCH.md'),path.join(out,'NASADENIE.md'))
 await writeFile(path.join(out,'READ-ME-FIRST.txt'),`OliveCode / Cloudflare Pages Free\n\nHlavná doména: https://olivecode.dev\nRegistrátor domén: Websupport (nákup nového hostingu netreba).\nKontakt: olivecode.ai@gmail.com\n\nNahraj ZIP alebo obsah site-dist cez Cloudflare Pages > Direct Upload. ZIP obsahuje iba verejný statický web vrátane _headers a _redirects. Neobsahuje repozitár, .htaccess, účty, backend ani API kľúče.\n\nDoménové presmerovania nastav zvlášť cez Redirect Rules; Pages _redirects ich nepodporuje. Pokyny sú v priloženom NASADENIE.md.\nStav inštalácie aplikácie: ${checked.downloads}. Kým nie je overené verejné vydanie, kopírovanie príkazu zostáva vypnuté.\n`)
 console.log(JSON.stringify({archive,...checked},null,2))
} else {
 const alias=path.join(out,'olivecode.online-redirect')
 await rm(alias,{recursive:true,force:true});await mkdir(alias)
 await writeFile(path.join(alias,'.htaccess'),`Options -Indexes\nRewriteEngine On\nRewriteRule ^ https://olivecode.dev%{REQUEST_URI} [R=301,L,NE]\n`)
 await writeFile(path.join(alias,'index.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><title>OliveCode</title><a href="https://olivecode.dev/">Continue to OliveCode</a></html>')
 const aliasArchive=path.join(out,'OliveCode-olivecode.online-redirect.zip')
 await rm(aliasArchive,{force:true})
 const aliasZip=Bun.spawn(['zip','-qr',aliasArchive,'.'],{cwd:alias,stdout:'inherit',stderr:'inherit'})
 if(await aliasZip.exited!==0) throw Error('Could not package domain redirect.')
 await rm(alias,{recursive:true})
 await writeFile(path.join(out,'READ-ME-FIRST.txt'),`OliveCode / Websupport alternative\n\nEnable SSL for all source domains. Back up the current web root. Upload the CONTENTS of the main ZIP, including .htaccess, into olivecode.dev/web or the configured root. Use the redirect ZIP ONLY for a separate .online root. Do not upload the repository.\nSee docs/OLIVECODE_WEBSUPPORT_LAUNCH.md. Downloads: ${checked.downloads}.\n`)
 console.log(JSON.stringify({archive,aliasArchive,...checked},null,2))
}
