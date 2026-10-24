import { buildSite } from './build.mjs'
const built = await buildSite()
console.log(`Prepared ${built.output} (${built.production ? 'production' : 'preview'}; downloads ${built.releaseReady ? 'verified' : 'disabled'})`)
