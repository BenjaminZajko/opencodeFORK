import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { staticModels } from "./static-models"

// Shared endpoint for all NVIDIA NIM APIs. Official docs
// (build.nvidia.com) use https://integrate.api.nvidia.com/v1 with
// Bearer $NVIDIA_API_KEY auth.
export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"

// Static metadata for fallback-catalog concretes, via staticModels():
// - deepseek-ai/deepseek-v4-pro-0813: absent from the snapshot but
//   served live; context/output/cost/capabilities/family pinned from
//   upstream models.dev (same trust tier as snapshot values).
// - moonshotai/kimi-k2.6: snapshot-present but flagged deprecated (pruned
//   at runtime); context/output/capabilities from the snapshot, status
//   overridden to active because the live endpoint serves it today.
const MODELS = [
  {
    id: "deepseek-ai/deepseek-v4-pro-0813",
    name: "DeepSeek V4 Pro 0813",
    family: "deepseek-thinking",
    context: 1000000,
    output: 384000,
    toolcall: true,
    reasoning: true,
  },
  {
    id: "moonshotai/kimi-k2.6",
    name: "Kimi K2.6",
    family: "kimi-k2",
    context: 262144,
    output: 262144,
    toolcall: true,
    reasoning: true,
    attachment: true,
    mediaInput: { image: true, video: true },
  },
] as const

// Manual API key only: NVIDIA documents Bearer-key auth throughout;
// no OAuth/device-flow API exists for programmatic access.
// Disclosure rides a prompts[] select because api-key methods have
// no `instructions` field — only oauth authorize() results do.
// Prompt messages are plain strings (TUI renders the raw title, no
// markdown), so the key URL is inline text terminals usually auto-link.
// Key location is build.nvidia.com/settings per official docs (API Keys
// area); signup needs phone verification but no credit card, and the
// rate-limited trial has no time limit (per NVIDIA forum staff).
export async function NvidiaAuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    provider: {
      id: "nvidia",
      async models() {
        return staticModels("nvidia", NVIDIA_BASE_URL, [...MODELS])
      },
    },
    auth: {
      provider: "nvidia",
      // Pin the provider level to the shared endpoint. Dispatch
      // (provider.ts resolveSDK) prefers options.baseURL over
      // model.api.url, so set both to the same host.
      async loader() {
        return { baseURL: NVIDIA_BASE_URL }
      },
      methods: [
        {
          type: "api",
          label: "Manually enter API key",
          prompts: [
            {
              type: "select",
              key: "acknowledge",
              message:
                "Generate a key at https://build.nvidia.com/settings (API Keys). Note: signup requires phone verification but no credit card; the trial is rate-limited with no time limit. Continue?",
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
