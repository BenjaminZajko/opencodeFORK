// Exercise the actual local Wrangler Pages server, without an account or deploy.
import { createHash } from 'node:crypto'
const base=process.env.OLIVECODE_TEST_ORIGIN || 'http://127.0.0.1:8789'
const assert=(value:unknown,label:string)=>{if(!value) throw Error(label)}
async function get(route:string,host?:string) {
 const response=await fetch(base+route,{redirect:'manual',headers:host?{Host:host}:{},signal:AbortSignal.timeout(10000)})
 return {response,text:await response.text()}
}
for(const route of ['/','/guide','/privacy','/sponsors','/about','/terms']) {
 const {response,text}=await get(route)
 assert(response.status===200,'Clean route '+route)
 assert(response.headers.get('content-type')?.includes('text/html'),'HTML type '+route)
 assert(response.headers.get('cache-control')?.includes('no-cache'),'Fresh HTML '+route)
 assert(response.headers.get('x-content-type-options')==='nosniff','Security header '+route)
 assert(response.headers.get('x-frame-options')==='DENY','Framing '+route)
 assert(response.headers.get('strict-transport-security')==='max-age=31536000','HTTPS policy '+route)
 assert(text.includes(`rel="canonical" href="https://olivecode.dev${route}"`),'Canonical '+route)
 if(route==='/') {
  const schema=/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(text)![1]!
  assert(response.headers.get('content-security-policy')?.includes('sha256-'+createHash('sha256').update(schema).digest('base64')),'Actual CSP schema hash')
 }
}
for(const route of ['guide','privacy','sponsors','about','terms']) {
 const {response}=await get('/'+route+'.html?lang=sk')
 assert(response.status===301,'Legacy redirect '+route)
 assert(new URL(response.headers.get('location')!,base).pathname==='/'+route,'Redirect target '+route)
 assert(new URL(response.headers.get('location')!,base).search==='?lang=sk','Query preservation '+route)
}
for(const route of ['/install','/install.ps1']) {
 const {response,text}=await get(route)
 assert(response.status===200,'Installer availability '+route)
 assert(response.headers.get('content-type')?.startsWith('text/plain'),'Installer plain text '+route)
 assert(response.headers.get('cache-control')==='no-store','Installer no-store '+route)
 assert(response.headers.get('x-robots-tag')?.includes('noindex'),'Installer noindex '+route)
 assert(!text.includes('<html'),'Installer not HTML '+route)
}
const missing=await get('/missing/deep/path')
assert(missing.response.status===404&&missing.text.includes('This branch ends here'),'Real custom 404')
for(const route of ['/.env','/.git/config','/.htaccess','/functions/index.js']) assert((await get(route)).response.status===404,'Private path '+route)
assert((await get('/.well-known/security.txt')).text.includes('olivecode.ai@gmail.com'),'security.txt')
assert((await get('/config.js')).response.headers.get('cache-control')?.includes('no-cache'),'Fresh release configuration')
for(const host of ['olivecode-test.pages.dev','abc123.olivecode-test.pages.dev']) assert((await get('/',host)).response.headers.get('x-robots-tag')?.includes('noindex'),'Preview host noindex '+host)
console.log('PASS actual Cloudflare Pages runtime: six routes, CSP, cache, five legacy redirects with queries, plain installers, real 404, private paths, security contact and preview noindex.')
