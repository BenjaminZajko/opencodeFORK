import type { Hooks, PluginInput } from "@opencode-ai/plugin"

// OpenAI-compatible endpoint. Official docs (docs.llm7.io quickstart)
// use https://api.llm7.io/v1 with api_key set to a dash.llm7.io token
// (or "unused" for anonymous access).
export const LLM7_BASE_URL = "https://api.llm7.io/v1"

// Manual API key only: LLM7 documents token auth throughout; no
// OAuth/device-flow API exists for programmatic access.
// Disclosure rides a prompts[] select because api-key methods have
// no `instructions` field — only oauth authorize() results do.
// Prompt messages are plain strings (TUI renders the raw title, no
// markdown), so the key URL is inline text terminals usually auto-link.
// Free-token billing verified against official docs/TERMS: 1M
// tokens/day with no payment instrument (payment only for Pro or
// topped-up balances); tokens come from dash.llm7.io via GitHub or
// Discord login.
export async function Llm7AuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "llm7",
      methods: [
        {
          type: "api",
          label: "Manually enter API key",
          prompts: [
            {
              type: "select",
              key: "acknowledge",
              message:
                "Get a free token at https://dash.llm7.io (GitHub or Discord login). Note: the free token allows 1M tokens/day rate-limited; only Pro or topped-up balances need a payment method. Continue?",
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
