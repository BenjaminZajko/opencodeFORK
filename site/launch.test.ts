import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { buildSite, requiredAssets, validateReleaseProof, pages } from './build.mjs'
import { checkLaunch } from './check-launch.mjs'
import { verifyPublicRelease } from '../distribution/verify-release.mjs'

const config={origin:'https://olivecode.dev',repository:'BenjaminZajko/opencodeFORK'}
const commit='a'.repeat(40)
const validProof=()=>({verified:true,...config,tag:'v0.1.0',commit,runID:123,checkedAt:new Date().toISOString(),assets:requiredAssets})

describe('public launch',()=>{
 test('release gate refuses missing assets, wrong identity, stale checks and unverified toggles',()=>{
  for(const proof of [undefined,{}, {...validProof(),verified:false}, {...validProof(),assets:[]}, {...validProof(),origin:'https://olivecode.online'}, {...validProof(),commit:'bad'}, {...validProof(),checkedAt:'2000-01-01'}, {...validProof(),runID:0}]) expect(()=>validateReleaseProof(proof,config)).toThrow()
  expect(validateReleaseProof(validProof(),config).tag).toBe('v0.1.0')
 })
 test('production output has canonical metadata, CSP, contact, correct routes and closed downloads',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'olivecode-site-check-'));const output=path.join(folder,'public')
  try {
   await buildSite({production:true,releaseReady:false,host:'Websupport',output})
   expect((await checkLaunch(output)).environment).toBe('production')
   const html=await readFile(path.join(output,'index.html'),'utf8')
   expect(html).toContain('https://olivecode.dev/install')
   expect(html).toContain('href="/guide"')
   expect(html).toContain('property="og:image"')
   const schema=/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]!
   expect(JSON.parse(schema)['@graph'][1].name).toBe('OliveCode')
   const digest=createHash('sha256').update(schema).digest('base64')
   const apache=await readFile(path.join(output,'.htaccess'),'utf8')
   expect(apache).toContain('sha256-'+digest)
   expect(apache).toContain('!^olivecode\\.dev$')
   expect(apache).toContain('[END]')
   expect(await readFile(path.join(output,'robots.txt'),'utf8')).toContain('Sitemap: https://olivecode.dev/sitemap.xml')
   expect(await readFile(path.join(output,'sitemap.xml'),'utf8')).not.toContain('olivecode.online')
   expect(await readFile(path.join(output,'install'),'utf8')).toContain('exit 1')
   expect(await readFile(path.join(output,'install.ps1'),'utf8')).toStartWith('throw ')
   expect((await readFile(path.join(output,'sponsors.html'),'utf8'))).toContain('mailto:olivecode.ai@gmail.com')
   for(const name of Object.keys(pages)) expect(await readFile(path.join(output,name),'utf8')).not.toContain('content=""')
   await writeFile(path.join(output,'.env'),'private fixture')
   await expect(checkLaunch(output)).rejects.toThrow('Unexpected public file')
  } finally {await rm(folder,{recursive:true,force:true})}
 },30000)
 test('preview stays noindex and cleans stale output; verified build uses only matching installers',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'olivecode-site-preview-'));const output=path.join(folder,'public')
  try {
   await buildSite({production:false,releaseReady:false,output})
   expect(await readFile(path.join(output,'robots.txt'),'utf8')).toContain('Disallow: /')
   expect(await readFile(path.join(output,'index.html'),'utf8')).toContain('noindex,nofollow')
   await writeFile(path.join(output,'old-secret.txt'),'fixture')
   await buildSite({production:false,releaseReady:false,output})
   expect(await Bun.file(path.join(output,'old-secret.txt')).exists()).toBe(false)
   const proof={...validProof(),scriptHashes:{}}
   for(const name of ['install.sh','install.ps1']) proof.scriptHashes[name]=createHash('sha256').update(await readFile(new URL('../distribution/'+name,import.meta.url))).digest('hex')
   const proofPath=path.join(folder,'proof.json');await writeFile(proofPath,JSON.stringify(proof))
   await buildSite({production:true,releaseReady:true,proofPath,output})
   expect((await checkLaunch(output)).downloads).toBe('verified-release')
   expect(await readFile(path.join(output,'install'),'utf8')).toContain('releases/latest/download')
   proof.scriptHashes['install.sh']='bad';await writeFile(proofPath,JSON.stringify(proof))
   await expect(buildSite({production:true,releaseReady:true,proofPath,output})).rejects.toThrow('differs')
  } finally {await rm(folder,{recursive:true,force:true})}
 },30000)

 test('Cloudflare artifact uses static platform rules, correct privacy, safe installers and platform limits',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'olivecode-cloudflare-'));const output=path.join(folder,'public')
  try {
   await buildSite({production:true,releaseReady:false,host:'Cloudflare Pages',output})
   expect((await checkLaunch(output)).host).toBe('Cloudflare Pages')
   expect(await Bun.file(path.join(output,'.htaccess')).exists()).toBe(false)
   const headers=await readFile(path.join(output,'_headers'),'utf8')
   expect(headers).toContain('/install\n  Content-Type: text/plain; charset=utf-8\n  Cache-Control: no-store')
   expect(headers).toContain('https://:version.:project.pages.dev/*')
   const html=await readFile(path.join(output,'index.html'),'utf8')
   const schema=/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]!
   expect(headers).toContain('sha256-'+createHash('sha256').update(schema).digest('base64'))
   expect(await readFile(path.join(output,'privacy.html'),'utf8')).toContain('Websupport remains the domain registrar')
   const redirects=await readFile(path.join(output,'_redirects'),'utf8')
   expect(redirects).toContain('/guide.html /guide 301')
   expect(redirects.split('\n').some(line=>/^https?:/.test(line))).toBe(false)
   await writeFile(path.join(output,'_headers'),headers+'\n'+'x'.repeat(2001))
   await expect(checkLaunch(output)).rejects.toThrow('2,000-character limit')
   await writeFile(path.join(output,'_headers'),headers)
   await writeFile(path.join(output,'_worker.js'),'private code fixture')
   await expect(checkLaunch(output)).rejects.toThrow('Unexpected public file')
  } finally {await rm(folder,{recursive:true,force:true})}
 },30000)
 test('public release verifier checks complete uploaded assets, exact commit and successful native workflow',async()=>{
  const assets=requiredAssets.map(name=>({name,size:100,state:'uploaded',browser_download_url:'https://github.com/'+config.repository+'/releases/download/v0.1.0/'+name}))
  let conclusion='success';let omitted=false
  const request=async(url:string,options?:RequestInit)=>{
   if(url.includes('api.github.com')) expect(new Headers(options?.headers).get('authorization')).toBe('Bearer fixture-token')
   else expect(new Headers(options?.headers).get('authorization')).toBeNull()
   if(url.endsWith('/releases/latest')) return Response.json({draft:false,prerelease:false,tag_name:'v0.1.0',target_commitish:commit,assets:omitted?assets.slice(1):assets})
   if(url.endsWith('/release-verification.json')) return Response.json({repository:config.repository,tag:'v0.1.0',commit,runID:123,nativeTestsPassed:true,targets:['darwin-arm64','darwin-x64-baseline','windows-x64-baseline','windows-arm64','linux-x64-baseline','linux-arm64','linux-x64-baseline-musl','linux-arm64-musl']})
   if(url.endsWith('/actions/runs/123')) return Response.json({conclusion,status:'completed',head_sha:commit,path:'.github/workflows/olivecode-preview.yml',repository:{full_name:config.repository},event:'workflow_dispatch'})
   return new Response('installer fixture')
  }
  expect((await verifyPublicRelease({request,token:'fixture-token'})).verified).toBe(true)
  conclusion='failure';await expect(verifyPublicRelease({request,token:'fixture-token'})).rejects.toThrow('not completed successfully')
  omitted=true;await expect(verifyPublicRelease({request,token:'fixture-token'})).rejects.toThrow('Missing public release asset')
 })
})
