import type { Hooks, PluginInput } from "@opencode-ai/plugin"

// International endpoint. Official docs (docs.mistral.ai quickstart
// curl examples) use https://api.mistral.ai/v1.
export const MISTRAL_BASE_URL = "https://api.mistral.ai/v1"

// Manual API key only: Mistral documents Bearer-key auth throughout;
// no OAuth/device-flow API exists for programmatic access.
// Disclosure rides a prompts[] select because api-key methods have
// no `instructions` field — only oauth authorize() results do.
// Prompt messages are plain strings (TUI renders the raw title, no
// markdown), so the key URL is inline text terminals usually auto-link.
// Key location is the console root per official docs (API Keys in the
// left sidebar); no deep key-creation URL is documented, so none is
// guessed. Billing distinction verified against official docs: Free
// mode needs no credit card and is rate-limited; a payment method is
// required only to upgrade to a paid tier.
export async function MistralAuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "mistral",
      methods: [
        {
          type: "api",
          label: "Manually enter API key",
          prompts: [
            {
              type: "select",
              key: "acknowledge",
              message:
                "Create an API key at https://console.mistral.ai (API Keys in the left sidebar). Note: the Free mode is rate-limited, and upgrading to a paid tier requires a payment method — Free mode itself does not. Continue?",
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
