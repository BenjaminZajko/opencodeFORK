// Run after deployment. --submit sends the ten canonical public URLs, never private paths.
const origin = "https://olivecode.dev"
const key = (await Bun.file(new URL("./indexnow-key.txt", import.meta.url)).text()).trim()
if (!/^[a-f0-9]{32}$/.test(key)) throw Error("Invalid ownership key")
async function read(path: string) {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw Error(`Live verification failed: ${path} (${response.status})`)
  return response.text()
}
if ((await read("/indexnow-key.txt")).trim() !== key) throw Error("Deploy the ownership key first")
const sitemap = await read("/sitemap.xml")
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
const routes = ["/", "/guide", "/models", "/faq", "/about", "/privacy", "/terms", "/sponsors", "/free-ai-coding-agent", "/local-ai-coding"]
if (urlList.length !== routes.length || !routes.every(route => urlList.includes(origin + route))) throw Error("Unexpected canonical sitemap")
if (!Bun.argv.includes("--submit")) {
  console.log(JSON.stringify({ mode: "preview", urlList }, null, 2))
} else {
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ host: "olivecode.dev", key, keyLocation: origin + "/indexnow-key.txt", urlList }),
    signal: AbortSignal.timeout(20000),
  })
  const body = await response.text()
  console.log(JSON.stringify({ at: new Date().toISOString(), status: response.status, urls: urlList.length, response: body, note: "Receipt is not proof of indexing or ranking." }, null, 2))
  if (![200, 202].includes(response.status)) throw Error("IndexNow did not accept the notification")
}
