import { expect, test } from "bun:test"
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { ollamaToolRepair } from "../../src/session/llm/ollama-tool-repair"

async function repair(text: string, offered = ["write"], native = false) {
  const chunks: LanguageModelV3StreamPart[] = [
    { type: "text-start", id: "text-1" },
    { type: "text-delta", id: "text-1", delta: text.slice(0, 7) },
    { type: "text-delta", id: "text-1", delta: text.slice(7) },
    { type: "text-end", id: "text-1" },
    ...(native ? [{ type: "tool-call", toolCallId: "native-1", toolName: "write", input: "{}" } as const] : []),
    {
      type: "finish",
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
    },
  ]
  const middleware = ollamaToolRepair()
  const wrapped = await middleware.wrapStream!({
    doStream: async () => ({
      stream: new ReadableStream<LanguageModelV3StreamPart>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk)
          controller.close()
        },
      }),
      warnings: [],
    }),
    doGenerate: async () => {
      throw new Error("not used")
    },
    params: {
      prompt: [],
      tools: offered.map((name) => ({
        type: "function" as const,
        name,
        description: "test",
        inputSchema: { type: "object" as const, properties: {} },
      })),
    },
    model: {} as never,
  })
  const result: LanguageModelV3StreamPart[] = []
  const reader = wrapped.stream.getReader()
  for (;;) {
    const item = await reader.read()
    if (item.done) return result
    result.push(item.value)
  }
}

test("converts an exact Ollama JSON tool request into a normal tool call", async () => {
  const chunks = await repair('{"name":"write","arguments":{"filePath":"/tmp/hello.py","content":"print(1)"}}')
  expect(chunks.map((x) => x.type)).toEqual(["tool-call", "finish"])
  expect(chunks[0]).toMatchObject({ toolName: "write", input: '{"filePath":"/tmp/hello.py","content":"print(1)"}' })
  expect(chunks[1]).toMatchObject({ finishReason: { unified: "tool-calls" } })
})

test("keeps greetings, unknown tools, and real tool calls untouched", async () => {
  expect((await repair("I'm fine, thanks.")).map((x) => x.type)).toEqual([
    "text-start",
    "text-delta",
    "text-delta",
    "text-end",
    "finish",
  ])
  expect(
    (await repair('{"name":"shell","arguments":{"command":"rm -rf /"}}')).some((x) => x.type === "tool-call"),
  ).toBe(false)
  expect(
    (await repair('Here is an example: {"name":"write","arguments":{}}', ["write"], true)).filter(
      (x) => x.type === "tool-call",
    ),
  ).toHaveLength(1)
})

test("ignores hallucinated example paths instead of requesting access to them", async () => {
  const chunks = await repair('{"name":"write","arguments":{"filePath":"/path/to/file.txt","content":"wrong"}}')
  expect(chunks.some((x) => x.type === "tool-call")).toBe(false)
  expect(chunks.find((x) => x.type === "text-delta")).toMatchObject({ delta: expect.stringContaining("example path") })
})
