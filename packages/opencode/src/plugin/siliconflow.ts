import type { Hooks, PluginInput } from "@opencode-ai/plugin"

// International endpoint. Official quickstart (docs.siliconflow.com)
// and the OpenAPI spec both use https://api.siliconflow.com/v1;
// the regional https://api.siliconflow.cn/v1 is opt-in only.
export const SILICONFLOW_BASE_URL = "https://api.siliconflow.com/v1"

// Manual API key only: no OAuth exists for SiliconFlow
// (OliveCode cloud/providers.py: auth_method "manual_key").
// Disclosure rides a prompts[] select because api-key methods have
// no `instructions` field — only oauth authorize() results do.
// Prompt messages are plain strings (TUI renders the raw title, no
// markdown), so the key URL is inline text terminals usually auto-link.
// The same URL also rides the TUI key screen's provider description.
export async function SiliconFlowAuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "siliconflow",
      methods: [
        {
          type: "api",
          label: "Manually enter API key",
          prompts: [
            {
              type: "select",
              key: "acknowledge",
              message:
                "Requests to SiliconFlow are processed on infrastructure in China. Create an API key at https://cloud.siliconflow.com/account/ak, then continue?",
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
