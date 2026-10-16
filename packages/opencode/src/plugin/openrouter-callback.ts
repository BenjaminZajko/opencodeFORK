import crypto from "node:crypto"

export function openRouterCallback(timeout = 300_000) {
  const path = `/callback/${crypto.randomBytes(24).toString("hex")}`
  const pending = Promise.withResolvers<string | undefined>()
  let settled = false
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      if (request.method !== "GET" || url.pathname !== path || settled)
        return new Response("Not found", { status: 404, headers })
      const code = url.searchParams.get("code")
      if (!code && !url.searchParams.has("error"))
        return new Response("Missing authorization code", { status: 400, headers })
      finish(url.searchParams.has("error") ? undefined : (code ?? undefined))
      return new Response(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>OliveCode</title><style>body{background:#101c17;color:#e9eee4;font:18px/1.6 system-ui;max-width:34rem;margin:15vh auto;padding:2rem}h1{font-size:28px;color:#9bc7a5}p{color:#a9b8ab}</style><h1>OliveCode</h1><p>${code && !url.searchParams.has("error") ? "Authorization received. Return to OliveCode to finish connecting." : "Authorization was cancelled. Return to OliveCode to try again."}</p></html>`,
        { headers },
      )
    },
  })
  server.unref()
  const timer = setTimeout(() => finish(), timeout)
  timer.unref()

  function finish(code?: string) {
    if (settled) return
    settled = true
    clearTimeout(timer)
    pending.resolve(code)
    void server.stop()
  }

  return {
    url: `http://127.0.0.1:${server.port}${path}`,
    code: pending.promise,
    close: () => finish(),
  }
}
