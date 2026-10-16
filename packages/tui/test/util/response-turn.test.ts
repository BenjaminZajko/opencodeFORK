import { expect, test } from "bun:test"
import type { AssistantMessage, Message, Part, UserMessage } from "@opencode-ai/sdk/v2"
import { responseTurns, turnFinished } from "../../src/util/response-turn"

function user(id: string, created: number): UserMessage {
  return { id, role: "user", time: { created } } as UserMessage
}

function assistant(id: string, created: number, completed?: number, finish?: string): AssistantMessage {
  return {
    id, parentID: "user", role: "assistant", time: { created, completed }, finish,
  } as AssistantMessage
}

test("keeps synthetic continuation work in the original response", () => {
  const messages: Message[] = [
    user("first", 100),
    assistant("plan", 110, 130, "tool-calls"),
    user("compaction", 140),
    assistant("answer", 150, 210, "stop"),
    user("second", 220),
    assistant("next", 230, 260, "stop"),
  ]
  const parts = {
    first: [{ type: "text", text: "Build it" } as Part],
    compaction: [{ type: "text", text: "Continue", synthetic: true } as Part],
    second: [{ type: "text", text: "Now explain" } as Part],
  }
  const turns = responseTurns(messages, parts)
  expect(turns.map((turn) => turn.id)).toEqual(["first", "second"])
  expect(turns[0].messages.map((message) => message.id)).toEqual(["plan", "answer"])
  expect(turns[1].messages.map((message) => message.id)).toEqual(["next"])
})

test("waits for the session to become idle before folding an apparently final answer", () => {
  const turn = responseTurns(
    [user("first", 100), assistant("answer", 110, 210, "stop")],
    { first: [{ type: "text", text: "Do the work" } as Part] },
  )[0]
  expect(turnFinished(turn, true)).toBe(false)
  expect(turnFinished(turn, false)).toBe(true)
})

test("keeps unfinished tool work open and permits completed errors to fold", () => {
  const pending = responseTurns(
    [user("first", 100), assistant("tool", 110, 210, "tool-calls")],
    { first: [{ type: "text", text: "Do the work" } as Part] },
  )[0]
  expect(turnFinished(pending, false)).toBe(false)
  const failed = { ...pending, messages: [{
    ...pending.messages[0],
    error: { name: "UnknownError", data: { message: "Failed" } },
  } as AssistantMessage] }
  expect(turnFinished(failed, false)).toBe(true)
})
