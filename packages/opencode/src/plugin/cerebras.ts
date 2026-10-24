import type { Hooks, PluginInput } from "@opencode-ai/plugin"

// International endpoint. Official docs (inference-docs.cerebras.ai,
// OpenAI-compatibility section and all curl examples) use
// https://api.cerebras.ai/v1.
export const CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1"

export async function CerebrasPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    "chat.params": async (input, output) => {
      if (input.model.api.npm !== "@ai-sdk/cerebras") return
      if (output.options.max_completion_tokens === undefined) return
      output.maxOutputTokens = undefined
    },
  }
}

// Manual API key only: Cerebras has no OAuth/device-flow API.
// Disclosure rides a prompts[] select because api-key methods have
// no `instructions` field — only oauth authorize() results do.
// Prompt messages are plain strings (TUI renders the raw title, no
// markdown), so the key URL is inline text terminals usually auto-link.
// Key URL is the console root per official docs (API Keys in the left
// nav); no deep key-creation URL is documented, so none is guessed.
export async function CerebrasAuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "cerebras",
      methods: [
        {
          type: "api",
          label: "Manually enter API key",
          prompts: [
            {
              type: "select",
              key: "acknowledge",
              message:
                "Create an API key at https://cloud.cerebras.ai (API Keys in the left nav). Note: Cerebras requires a verified payment method for API access, trial credits expire after 30 days, and the free model lineup rotates. Continue?",
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
