import type { AssistantMessage, Message, Part } from "@opencode-ai/sdk/v2"

export type ResponseTurn = {
  id: string
  started: number
  messages: AssistantMessage[]
}

// Synthetic continuation messages belong to the preceding user request. They
// can appear after compaction, so assistant parent IDs alone cannot group a turn.
export function responseTurns(messages: Message[], parts: Record<string, Part[]>) {
  const turns: ResponseTurn[] = []
  let current: ResponseTurn | undefined
  for (const message of messages) {
    if (message.role === "user") {
      const visible = (parts[message.id] ?? []).some((part) =>
        (part.type === "text" && !part.synthetic && !part.ignored) || part.type === "file",
      )
      if (visible || !current) {
        current = { id: message.id, started: message.time.created, messages: [] }
        turns.push(current)
      }
      continue
    }
    if (!current) {
      current = { id: message.parentID, started: message.time.created, messages: [] }
      turns.push(current)
    }
    current.messages.push(message)
  }
  return turns
}

export function turnFinished(turn: ResponseTurn, busy: boolean) {
  const last = turn.messages.at(-1)
  if (!last || !last.time.completed || busy) return false
  return Boolean(last.error || (last.finish && !["tool-calls", "unknown"].includes(last.finish)))
}

export * as ResponseTurn from "./response-turn"
