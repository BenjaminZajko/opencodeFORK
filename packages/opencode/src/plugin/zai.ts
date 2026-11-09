import type { Hooks, PluginInput } from "@opencode-ai/plugin"

// OpenAI-compatible endpoint from docs.z.ai (models.dev provider "zai").
// Free models (GLM-4.7-Flash, GLM-4.5-Flash) were verified on
// https://docs.z.ai/guides/overview/pricing on 2026-11-09. Keys are created at
// https://z.ai/manage-apikey/apikey-list per the official quick start.
export async function ZaiAuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "zai",
      methods: [
        {
          type: "api",
          label: "Manually enter API key",
          prompts: [
            {
              type: "select",
              key: "acknowledge",
              message:
                "Create an API key at https://z.ai/manage-apikey/apikey-list. OliveCode only offers Z.ai's free GLM Flash models; free models are rate-limited and Z.ai's terms apply to your prompts. Continue?",
              options: [
                { label: "I understand — continue", value: "continue" },
                { label: "Cancel", value: "cancel" },
              ],
            },
          ],
        },
      ],
    },
  }
}
