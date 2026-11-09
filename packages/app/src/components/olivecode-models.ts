import type { Config } from "@opencode-ai/sdk/v2/client"

export function localModelName(value: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._/:+-]*$/.test(value) && !/(?:[-:]cloud)(?::|$)/i.test(value)
}

export type LocalModelInfo = {
  id: string
  baseURL: string
  context: number
  tools: boolean
  reasoning: boolean
  vision: boolean
}

export function localModelConfig(model: LocalModelInfo, disabled: string[] = []) {
  return {
    model: `ollama/${model.id}`,
    disabled_providers: disabled.filter((id) => id !== "ollama"),
    provider: {
      ollama: {
        name: "Ollama",
        npm: "@ai-sdk/openai-compatible",
        api: model.baseURL,
        options: { baseURL: model.baseURL },
        models: {
          [model.id]: {
            name: model.id,
            tool_call: model.tools,
            reasoning: model.reasoning,
            attachment: model.vision,
            modalities: { input: model.vision ? ["text", "image"] : ["text"], output: ["text"] },
            limit: { context: model.context, output: Math.min(2048, Math.floor(model.context / 4)) },
            cost: { input: 0, output: 0 },
          },
        },
      },
    },
  } satisfies Config
}
