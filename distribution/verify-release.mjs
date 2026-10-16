import { createHash } from 'node:crypto'
import { requiredAssets } from '../site/build.mjs'

const repository='BenjaminZajko/opencodeFORK'
const origin='https://olivecode.dev'
export async function verifyPublicRelease({request=fetch, token=process.env.GITHUB_TOKEN, now=Date.now()}={}) {
  const headers={Accept:'application/vnd.github+json','User-Agent':'OliveCode-launch-check',...(token?{Authorization:`Bearer ${token}`}:{})}
  async function api(url, authenticated=true) {
    const response=await request(url,{headers:authenticated?headers:{'User-Agent':'OliveCode-launch-check'},signal:AbortSignal.timeout(20000)})
    if(!response.ok) throw Error(`Public release verification failed (${response.status}). Publish the native-tested release first.`)
    const text=await response.text()
    if(text.length>2*1024*1024) throw Error('Unexpected release response size.')
    return JSON.parse(text)
  }
  const release=await api(`https://api.github.com/repos/${repository}/releases/latest`)
  if(release.draft || release.prerelease || !/^v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(release.tag_name??'') || !Array.isArray(release.assets)) throw Error('A complete public latest release is required.')
  for(const name of requiredAssets) {
    const asset=release.assets.find(asset=>asset.name===name)
    if(!asset || !Number.isSafeInteger(asset.size) || asset.size<=0 || asset.state!=='uploaded') throw Error(`Missing public release asset: ${name}`)
    const url=new URL(asset.browser_download_url)
    if(url.origin!=='https://github.com' || url.username || url.password || decodeURIComponent(url.pathname)!==`/${repository}/releases/download/${release.tag_name}/${name}`) throw Error('Unexpected release asset location.')
  }
  const attestation=await api(release.assets.find(asset=>asset.name==='release-verification.json').browser_download_url,false)
  if(attestation.repository!==repository || attestation.tag!==release.tag_name || attestation.nativeTestsPassed!==true || !/^[a-f0-9]{40}$/.test(attestation.commit??'') || !Number.isSafeInteger(attestation.runID) || attestation.runID<=0 || release.target_commitish!==attestation.commit) throw Error('Release does not match its native-test attestation.')
  const run=await api(`https://api.github.com/repos/${repository}/actions/runs/${attestation.runID}`)
  const trustedEvent=run.event==='workflow_dispatch' || (run.event==='push' && /^codex\/release-[a-z0-9.-]+$/.test(run.head_branch??''))
  if(run.conclusion!=='success' || run.status!=='completed' || run.head_sha!==attestation.commit || run.path!=='.github/workflows/olivecode-preview.yml' || run.repository?.full_name!==repository || !trustedEvent) throw Error('Native installer release workflow has not completed successfully for this commit.')
  const targets=['darwin-arm64','darwin-x64-baseline','windows-x64-baseline','windows-arm64','linux-x64-baseline','linux-arm64','linux-x64-baseline-musl','linux-arm64-musl']
  if(!Array.isArray(attestation.targets)||targets.some(target=>!attestation.targets.includes(target))) throw Error('Native platform verification is incomplete.')
  const scriptHashes={}
  for(const name of ['install.sh','install.ps1']) {
    const response=await request(release.assets.find(asset=>asset.name===name).browser_download_url,{signal:AbortSignal.timeout(20000)})
    if(!response.ok) throw Error('Public installer script is unavailable.')
    const script=await response.text()
    if(script.length>100000) throw Error('Unexpected installer size.')
    scriptHashes[name]=createHash('sha256').update(script).digest('hex')
  }
  return {verified:true,repository,origin,scriptHashes,tag:release.tag_name,commit:attestation.commit,runID:attestation.runID,checkedAt:new Date(now).toISOString(),assets:requiredAssets}
}
