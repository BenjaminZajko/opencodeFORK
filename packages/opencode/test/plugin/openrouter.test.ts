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
    get serverUrl() { return new URL("http://localhost:4096") },
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
    const result = await authRes.callback("test-code")

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
    const expectedChallenge = crypto
      .createHash("sha256")
      .update(capturedBody.code_verifier)
      .digest("base64url")

    expect(challenge).toBe(expectedChallenge)
  })

  it("should handle failed token exchange", async () => {
    global.fetch = mock(() => Promise.resolve({
      ok: false,
      status: 400,
    })) as unknown as typeof fetch

    const plugin = await OpenRouterAuthPlugin(mockInput)
    const auth = plugin.auth!
    const method = auth.methods.find((m) => m.type === "oauth")!

    const result = await method.authorize().then(res => res.callback("bad-code"))
    expect(result.type).toBe("failed")
  })
})