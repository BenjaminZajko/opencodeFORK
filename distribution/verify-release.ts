import { verifyPublicRelease } from './verify-release.mjs'
const args=process.argv.slice(2)
if(args.length!==2||args[0]!=='--output') throw Error('Usage: bun distribution/verify-release.ts --output /path/to/report.json')
const report=await verifyPublicRelease()
await Bun.write(args[1]!,JSON.stringify(report,null,2)+'\n')
console.log(`Verified public release ${report.tag}: all platforms and installer assets. Report: ${args[1]}`)
