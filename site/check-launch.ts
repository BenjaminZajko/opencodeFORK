import { checkLaunch } from './check-launch.mjs'
import path from 'node:path'
console.log(await checkLaunch(path.resolve(process.argv[2]??'site-dist')))
