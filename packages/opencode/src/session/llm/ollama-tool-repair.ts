import type { LanguageModelV3Middleware, LanguageModelV3StreamPart } from "@ai-sdk/provider"

const MAX_BUFFERED_TEXT = 64 * 1024

type Repaired = { type: "call"; part: LanguageModelV3StreamPart } | { type: "placeholder" }

function toolCall(text: string, names: Set<string>): Repaired | undefined {
  const trimmed = text.trim()
  const body = trimmed.startsWith("```json\n") && trimmed.endsWith("```") ? trimmed.slice(8, -3).trim() : trimmed
  if (!body.startsWith("{") || !body.endsWith("}")) return
  let value: unknown
  try {
    value = JSON.parse(body)
  } catch {
    return
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return
  const object = value as Record<string, unknown>
  if (typeof object.name !== "string" || !names.has(object.name)) return
  if (!object.arguments || typeof object.arguments !== "object" || Array.isArray(object.arguments)) return
  const argumentsObject = object.arguments as Record<string, unknown>
  if (typeof argumentsObject.filePath === "string" && /^\/path\/to(?:\/|$)/i.test(argumentsObject.filePath))
    return { type: "placeholder" }
  // Keep the AI SDK in charge of schema validation, execution, and permissions.
  return {
    type: "call",
    part: {
      type: "tool-call",
      toolCallId: `ollama-${crypto.randomUUID()}`,
      toolName: object.name,
      input: JSON.stringify(object.arguments),
    },
  }
}

// Some Ollama models advertise tool support but return {name, arguments} as
// assistant text. Convert only an entire, exact JSON response for an offered
// tool. Ordinary text and real provider tool calls pass through unchanged.
export function ollamaToolRepair(): LanguageModelV3Middleware {
  return {
    specificationVersion: "v3",
    async wrapStream({ doStream, params }) {
      const result = await doStream()
      const names = new Set((params.tools ?? []).filter((item) => item.type === "function").map((item) => item.name))
      if (!names.size) return result

      let held: LanguageModelV3StreamPart[] | undefined
      let content = ""
      let repaired = false
      const stream = result.stream.pipeThrough(
        new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
          transform(part, controller) {
            function release() {
              for (const item of held ?? []) controller.enqueue(item)
              held = undefined
              content = ""
            }
            function finishText() {
              const call = toolCall(content, names)
              if (!call) return release()
              held = undefined
              content = ""
              if (call.type === "placeholder") {
                const id = `ollama-notice-${crypto.randomUUID()}`
                controller.enqueue({ type: "text-start", id })
                controller.enqueue({
                  type: "text-delta",
                  id,
                  delta:
                    "The local model tried to use an example path. I ignored that tool request. Check your project for the requested file, or choose another model to continue.",
                })
                controller.enqueue({ type: "text-end", id })
                return
              }
              repaired = true
              controller.enqueue(call.part)
            }
            if (part.type === "text-start") {
              if (held) release()
              held = [part]
              return
            }
            if (part.type === "text-delta" && held) {
              held.push(part)
              content += part.delta
              const first = content.trimStart()[0]
              if ((first && first !== "{" && first !== "`") || content.length > MAX_BUFFERED_TEXT) release()
              return
            }
            if (part.type === "text-end" && held) {
              held.push(part)
              finishText()
              return
            }
            if (held) release()
            if (part.type === "finish" && repaired) {
              controller.enqueue({ ...part, finishReason: { unified: "tool-calls", raw: part.finishReason.raw } })
              return
            }
            controller.enqueue(part)
          },
          flush(controller) {
            for (const item of held ?? []) controller.enqueue(item)
          },
        }),
      )
      return { ...result, stream }
    },
  }
}

export * as OllamaToolRepair from "./ollama-tool-repair"
