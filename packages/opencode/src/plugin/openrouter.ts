import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import crypto from "node:crypto"
import { openRouterCallback } from "./openrouter-callback"

export async function OpenRouterAuthPlugin(input: PluginInput): Promise<Hooks> {
  let pending: ReturnType<typeof openRouterCallback> | undefined
  return {
    auth: {
      provider: "openrouter",
      async loader(getAuth) {
        const info = await getAuth()
        if (!info || info.type !== "oauth") return {}

        return {
          apiKey: "",
          async fetch(request: RequestInfo | URL, init?: RequestInit) {
            const info = await getAuth()
            if (!info || info.type !== "oauth") return fetch(request, init)

            const headers = new Headers(request instanceof Request ? request.headers : undefined)
            new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
            headers.set("User-Agent", `olivecode/${InstallationVersion}`)
            headers.set("Authorization", `Bearer ${info.access}`)

            return fetch(request, {
              ...init,
              headers,
            })
          },
        }
      },
      methods: [
        {
          type: "oauth",
          label: "Login with OpenRouter",
          async authorize() {
            pending?.close()
            const receiver = openRouterCallback()
            pending = receiver
            const codeVerifier = crypto.randomBytes(32).toString("base64url")
            const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url")

            const url = new URL("https://openrouter.ai/auth")
            url.searchParams.set("callback_url", receiver.url)
            url.searchParams.set("code_challenge", codeChallenge)
            url.searchParams.set("code_challenge_method", "S256")
            url.searchParams.set("key_label", "OliveCode")

            return {
              url: url.toString(),
              instructions:
                "Open the link, sign in, and authorize OliveCode. Return here when the browser confirms. This link expires in 5 minutes.",
              method: "auto" as const,
              async callback() {
                const code = await receiver.code
                if (!code) return { type: "failed" as const }
                const response = await fetch("https://openrouter.ai/api/v1/auth/keys", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "User-Agent": `opencode/${InstallationVersion}`,
                  },
                  body: JSON.stringify({
                    code,
                    code_verifier: codeVerifier,
                    code_challenge_method: "S256",
                  }),
                  signal: AbortSignal.timeout(15_000),
                }).catch(() => undefined)

                if (!response?.ok) return { type: "failed" as const }

                const data: unknown = await response.json().catch(() => undefined)
                if (
                  !data ||
                  typeof data !== "object" ||
                  !("key" in data) ||
                  typeof data.key !== "string" ||
                  !data.key.trim()
                )
                  return { type: "failed" as const }

                return {
                  type: "success" as const,
                  access: data.key,
                  refresh: data.key,
                  expires: 0,
                }
              },
            }
          },
        },
        {
          type: "api",
          label: "Enter an OpenRouter API key",
        },
      ],
    },
  }
}
