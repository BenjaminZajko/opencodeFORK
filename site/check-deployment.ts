// Read-only public smoke check: never runs a downloaded installer.
const origin='https://olivecode.dev'
async function get(url:string) {
  const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000)})
  return {response,text:await response.text()}
}
const failures:string[]=[]
async function check(name:string,run:()=>Promise<void>) {
  try { await run();console.log('PASS '+name) } catch(error) { failures.push(name+': '+(error instanceof Error?error.message:String(error)));console.error('FAIL '+failures.at(-1)) }
}
for(const host of ['olivecode.online','www.olivecode.online','www.olivecode.dev']) await check('HTTPS redirect '+host,async()=>{
  const {response}=await get('https://'+host+'/guide?lang=sk')
  if(![301,308].includes(response.status)||response.headers.get('location')!==origin+'/guide?lang=sk') throw Error('Expected permanent redirect preserving path and query.')
})
await check('HTTP to HTTPS',async()=>{
  const {response}=await get('http://olivecode.dev/guide')
  if(![301,308].includes(response.status)||response.headers.get('location')!==origin+'/guide') throw Error('HTTPS redirect missing.')
})
for(const route of ['/','/guide','/privacy','/sponsors','/about','/terms']) await check('Page '+route,async()=>{
  const {response,text}=await get(origin+route)
  if(response.status!==200||!response.headers.get('content-type')?.includes('text/html')||!text.includes(`rel="canonical" href="${origin}${route}"`)) throw Error('Page status, type or canonical incorrect.')
  if(!response.headers.get('content-security-policy')||response.headers.get('x-content-type-options')!=='nosniff'||!response.headers.get('strict-transport-security')) throw Error('Security headers missing; check the host-specific build and deployment rules.')
  if(text.includes('noindex,nofollow')||response.headers.get('x-robots-tag')?.includes('noindex')) throw Error('Production page is still noindex.')
})
await check('Real 404',async()=>{if((await get(origin+'/missing-olivecode-launch-check')).response.status!==404) throw Error('Missing pages must return 404, not the home page.')})
for(const route of ['/install','/install.ps1']) await check('Plain installer '+route,async()=>{
  const {response,text}=await get(origin+route)
  if(response.status!==200||!response.headers.get('content-type')?.startsWith('text/plain')||text.includes('<html')) throw Error('Installer is not a plain-text file.')
})
await check('Robots and sitemap',async()=>{
  const robots=await get(origin+'/robots.txt');const sitemap=await get(origin+'/sitemap.xml')
  if(robots.response.status!==200||!robots.text.includes(origin+'/sitemap.xml')||robots.text.includes('Disallow: /')) throw Error('Robots blocks launch or sitemap is missing.')
  if(sitemap.response.status!==200||!sitemap.text.includes('<loc>'+origin+'/</loc>')||sitemap.text.includes('olivecode.online')) throw Error('Sitemap has wrong canonical domains.')
})
await check('Share image',async()=>{const {response}=await get(origin+'/assets/social-card.png');if(response.status!==200||!response.headers.get('content-type')?.startsWith('image/png')) throw Error('Share image missing.')})
await check('Build state',async()=>{const {response,text}=await get(origin+'/build-info.json');if(response.status!==200) throw Error('Build state missing.');const info=JSON.parse(text);if(info.origin!==origin||info.environment!=='production') throw Error('Wrong deployment bundle.');console.log('Downloads: '+info.downloads)})
if(failures.length) throw Error(`${failures.length} public launch checks failed. No remote changes were made.`)
console.log('Public website checks passed. Native app releases and provider account testing remain separate checks.')
