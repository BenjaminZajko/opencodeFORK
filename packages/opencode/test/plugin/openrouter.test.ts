import { describe, it, expect, mock, afterEach } from "bun:test"
import { OpenRouterAuthPlugin } from "@/plugin/openrouter"
import type { PluginInput } from "@opencode-ai/plugin"
import crypto from "node:crypto"

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
  mock.restore()
})

describe("OpenRouterAuthPlugin", () => {
  const mockInput: PluginInput = {
    client: {} as any,
    project: {} as any,
    worktree: "/tmp",
    directory: "/tmp",
    experimental_workspace: { register: () => {} },
    get serverUrl() {
      return new URL("http://localhost:4096")
    },
    $: {} as any,
  }

  it("should initiate authorization flow with correct PKCE parameters", async () => {
    const plugin = await OpenRouterAuthPlugin(mockInput)
    const auth = plugin.auth!
    const method = auth.methods.find((m) => m.type === "oauth")!

    const result = await method.authorize()
    const url = new URL(result.url)

    expect(url.hostname).toBe("openrouter.ai")
    expect(url.pathname).toBe("/auth")
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("key_label")).toBe("OliveCode")
    expect(url.searchParams.has("code_challenge")).toBe(true)

    // Verify challenge is a valid base64url string (no padding, etc)
    const challenge = url.searchParams.get("code_challenge")!
    expect(challenge).not.toContain("=")
    expect(result.method).toBe("auto")
    const redirect = new URL(url.searchParams.get("callback_url")!)
    expect(redirect.hostname).toBe("127.0.0.1")
    redirect.searchParams.set("error", "access_denied")
    await originalFetch(redirect)
    if (result.method !== "auto") throw new Error("expected automatic callback")
    expect((await result.callback()).type).toBe("failed")
  })

  it("should exchange code for key with PKCE verifier", async () => {
    const plugin = await OpenRouterAuthPlugin(mockInput)
    const auth = plugin.auth!
    const method = auth.methods.find((m) => m.type === "oauth")!

    let capturedBody: any = null
    global.fetch = mock(async (url, init) => {
      if (typeof init?.body === "string") {
        capturedBody = JSON.parse(init.body)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ key: "test-api-key" }),
      })
    }) as unknown as typeof fetch

    const authRes = await method.authorize()
    const redirect = new URL(new URL(authRes.url).searchParams.get("callback_url")!)
    redirect.searchParams.set("code", "test-code")
    const browser = await originalFetch(redirect)
    expect(browser.status).toBe(200)
    expect(await browser.text()).not.toContain("test-code")
    if (authRes.method !== "auto") throw new Error("expected automatic callback")
    const result = await authRes.callback()

    expect(result.type).toBe("success")
    if (result.type !== "success" || !("access" in result)) throw new Error("expected success with access")
    expect(result.access).toBe("test-api-key")
    expect(capturedBody).toMatchObject({
      code: "test-code",
      code_challenge_method: "S256",
    })
    expect(capturedBody.code_verifier).toBeDefined()
    expect(typeof capturedBody.code_verifier).toBe("string")
    expect(capturedBody.code_verifier.length).toBeGreaterThanOrEqual(43)

    // Verify that the challenge in the URL matches the verifier in the POST body
    const url = new URL(authRes.url)
    const challenge = url.searchParams.get("code_challenge")!
    const expectedChallenge = crypto.createHash("sha256").update(capturedBody.code_verifier).digest("base64url")

    expect(challenge).toBe(expectedChallenge)
  })

  it("should handle failed token exchange", async () => {
    global.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 400,
      }),
    ) as unknown as typeof fetch

    const plugin = await OpenRouterAuthPlugin(mockInput)
    const auth = plugin.auth!
    const method = auth.methods.find((m) => m.type === "oauth")!

    const authorization = await method.authorize()
    const redirect = new URL(new URL(authorization.url).searchParams.get("callback_url")!)
    redirect.searchParams.set("code", "bad-code")
    await originalFetch(redirect)
    if (authorization.method !== "auto") throw new Error("expected automatic callback")
    const result = await authorization.callback()
    expect(result.type).toBe("failed")
  })

  it("starting a new authorization cancels the previous browser callback", async () => {
    const plugin = await OpenRouterAuthPlugin(mockInput)
    const method = plugin.auth!.methods.find((item) => item.type === "oauth")!
    const first = await method.authorize()
    const second = await method.authorize()
    if (first.method !== "auto" || second.method !== "auto") throw new Error("expected automatic callback")
    expect((await first.callback()).type).toBe("failed")
    const redirect = new URL(new URL(second.url).searchParams.get("callback_url")!)
    redirect.searchParams.set("error", "access_denied")
    await originalFetch(redirect)
    expect((await second.callback()).type).toBe("failed")
  })

  it("normalizes every Headers representation without losing custom request headers", async () => {
    const plugin = await OpenRouterAuthPlugin(mockInput)
    const options = await plugin.auth!.loader!(
      async () => ({ type: "oauth", access: "fresh-key", refresh: "fresh-key", expires: 0 }),
      {} as never,
    )
    const requests: Headers[] = []
    globalThis.fetch = mock(async (_request, init) => {
      requests.push(new Headers(init?.headers))
      return new Response("OK")
    }) as unknown as typeof fetch
    for (const headers of [
      { authorization: "Bearer stale-key", "x-custom": "retained" },
      new Headers({ Authorization: "Bearer stale-key", "x-custom": "retained" }),
      [
        ["AUTHORIZATION", "Bearer stale-key"],
        ["x-custom", "retained"],
      ],
    ]) {
      await options.fetch(
        new Request("https://openrouter.ai/api/v1/chat/completions", { headers: { "x-request": "also-retained" } }),
        { headers },
      )
    }
    for (const headers of requests) {
      expect(headers.get("authorization")).toBe("Bearer fresh-key")
      expect(headers.get("x-custom")).toBe("retained")
      expect(headers.get("x-request")).toBe("also-retained")
    }
  })
})
