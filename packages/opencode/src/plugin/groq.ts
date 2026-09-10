import type { Hooks, PluginInput } from "@opencode-ai/plugin"

// OpenAI-compatible endpoint. Official docs (console.groq.com/docs,
// service-tiers curl example and models page) use
// https://api.groq.com/openai/v1.
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1"

// Manual API key only: Groq documents API-key auth throughout
// (Bearer $GROQ_API_KEY in every example); no OAuth/device-flow API
// exists for programmatic access.
// Disclosure rides a prompts[] select because api-key methods have
// no `instructions` field — only oauth authorize() results do.
// Prompt messages are plain strings (TUI renders the raw title, no
// markdown), so the key URL is inline text terminals usually auto-link.
// Key URL is https://console.groq.com/keys per the official docs nav
// (API Keys); billing distinction verified against billing-faqs.
export async function GroqAuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "groq",
      methods: [
        {
          type: "api",
          label: "Manually enter API key",
          prompts: [
            {
              type: "select",
              key: "acknowledge",
              message:
                "Create an API key at https://console.groq.com/keys. Note: the Free tier is rate-limited, and upgrading to a paid tier requires a payment method — the Free tier itself does not. Continue?",
              options: [
                {
                  label: "I understand — continue",
                  value: "continue",
                },
                {
                  label: "Cancel",
                  value: "cancel",
                },
              ],
            },
          ],
        },
      ],
    },
  }
}
