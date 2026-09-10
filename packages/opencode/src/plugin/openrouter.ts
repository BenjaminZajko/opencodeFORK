import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import crypto from "node:crypto"

export async function OpenRouterAuthPlugin(input: PluginInput): Promise<Hooks> {
  const sdk = input.client
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

            const headers: Record<string, string> = {
              ...(init?.headers as Record<string, string>),
              "User-Agent": `opencode/${InstallationVersion}`,
              Authorization: `Bearer ${info.access}`,
            }

            // The SDK's own headers ride along via init.headers with
            // different casing ("authorization", "user-agent"); a plain
            // object keeps both variants as separate keys and Headers
            // construction appends same-name headers case-insensitively
            // instead of overwriting, producing a malformed combined
            // value. Drop the stale variants so only our single
            // correctly-cased versions remain.
            delete headers["authorization"]
            delete headers["user-agent"]

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
            const codeVerifier = crypto.randomBytes(32).toString("base64url")
            const codeChallenge = crypto
              .createHash("sha256")
              .update(codeVerifier)
              .digest("base64url")

            const url = new URL("https://openrouter.ai/auth")
            url.searchParams.set("code_challenge", codeChallenge)
            url.searchParams.set("code_challenge_method", "S256")
            url.searchParams.set("key_label", "OliveCode")

            return {
              url: url.toString(),
              instructions: "Open the URL in your browser, authorize the OliveCode key, then paste the code here.",
              method: "code" as const,
              async callback(code) {
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
                })

                if (!response.ok) return { type: "failed" as const }

                const data = await response.json() as { key: string }
                if (!data.key) return { type: "failed" as const }

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
      ],
    },
  }
}
