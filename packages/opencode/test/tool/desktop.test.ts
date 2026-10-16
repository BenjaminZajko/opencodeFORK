import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Computer } from "../../src/computer/service"
import { ComputerDesktop } from "../../src/computer/desktop"
import { DesktopTool } from "../../src/tool/desktop"
import { Truncate } from "../../src/tool/truncate"
import { Agent } from "../../src/agent/agent"
import { SessionID, MessageID } from "../../src/session/schema"
import { Tool } from "../../src/tool/tool"
import { testEffect } from "../lib/effect"
import type { SessionV1 } from "@opencode-ai/core/v1/session"

const calls: ComputerDesktop.Action[] = []
let holds = 0
let nativeResult: ComputerDesktop.Result | undefined
const it = testEffect(Layer.mergeAll(
  Layer.mock(Computer.Service, { claimAction: () => Effect.void, holdDesktop: () => Effect.sync(() => { holds++; return () => { holds-- } }), desktop: (_session, _request, action) => Effect.sync(() => { calls.push(action); return nativeResult ?? { revision: 9, controls: [] } }) }),
  Layer.mock(Truncate.Service, { output: (content) => Effect.succeed({ content, truncated: false }) }),
  Layer.mock(Agent.Service, { get: () => Effect.succeed({ name: "desktop", mode: "primary", permission: [], options: {} }) }),
))

let turn = 0
function context(observation: unknown, prompted: boolean): Tool.Context {
  return { sessionID: SessionID.make("ses_desktop_regression"), messageID: MessageID.make(`msg_desktop_regression_${++turn}`), agent: "desktop", abort: new AbortController().signal,
    messages: [{ info: { role: "assistant" }, parts: [{ type: "tool", tool: "desktop", state: { status: "completed", input: { action: "observe" }, output: JSON.stringify(observation) } }] }] as unknown as SessionV1.WithParts[],
    metadata: () => Effect.void, ask: () => Effect.void, askWithReceipt: () => Effect.succeed(prompted),
  }
}

it.live("the real tool repairs omitted references and restores focus only after a prompt", () => Effect.gen(function* () {
  calls.length = 0
  const info = yield* DesktopTool
  const tool = yield* info.init()
  yield* tool.execute({ action: "click", target: 6 }, context({ app: "TextEdit", revision: 7, controls: [{ target: 6, role: "AXButton", name: "New Document" }] }, true))
  expect(calls[0]).toEqual({ action: "click", target: 6, revision: 7, restoreAfterApproval: true })
  yield* tool.execute({ action: "type", text: "Hello from OliveCode" }, context({ app: "TextEdit", revision: 8, focusedTarget: 1, controls: [{ target: 1, role: "AXTextArea", enabled: true }] }, false))
  expect(calls[1]).toEqual({ action: "type", text: "Hello from OliveCode", target: 1, revision: 8, restoreAfterApproval: false })
}))

it.live("approval holds desktop lifetime and always releases on grant or rejection", () => Effect.gen(function* () {
  const info = yield* DesktopTool
  const tool = yield* info.init()
  const ctx = context({ revision: 7, controls: [] }, true)
  ctx.askWithReceipt = () => Effect.sync(() => { expect(holds).toBe(1); return true })
  yield* tool.execute({ action: "activate", app: "com.apple.TextEdit" }, ctx)
  expect(holds).toBe(0)
  calls.length = 0
  ctx.messageID = MessageID.make(`msg_desktop_regression_${++turn}`)
  ctx.askWithReceipt = () => Effect.sync(() => { expect(holds).toBe(1); throw new Error("Approval rejected") })
  const exit = yield* tool.execute({ action: "activate", app: "com.apple.TextEdit" }, ctx).pipe(Effect.exit)
  expect(exit._tag).toBe("Failure")
  expect(holds).toBe(0)
  expect(calls).toHaveLength(0)
  ctx.messageID = MessageID.make(`msg_desktop_regression_${++turn}`)
  ctx.askWithReceipt = () => Effect.sync(() => { expect(holds).toBe(1) }).pipe(Effect.andThen(Effect.never))
  const interrupted = yield* tool.execute({ action: "activate", app: "com.apple.TextEdit" }, ctx).pipe(Effect.timeout("20 millis"), Effect.exit)
  expect(interrupted._tag).toBe("Failure")
  expect(holds).toBe(0)
  expect(calls).toHaveLength(0)
}))

it.live("a missing target in the Open dialog fails before native input or approval", () => Effect.gen(function* () {
  calls.length = 0
  const info = yield* DesktopTool
  const tool = yield* info.init()
  const ctx = context({ revision: 7, focusedTarget: 4, controls: [{ target: 4, role: "AXTextField", name: "Search" }] }, true)
  let asked = false
  ctx.askWithReceipt = () => Effect.sync(() => { asked = true; return true })
  const exit = yield* tool.execute({ action: "type", text: "Hello from OliveCode" }, ctx).pipe(Effect.exit)
  expect(exit._tag).toBe("Failure")
  expect(calls).toHaveLength(0)
  expect(asked).toBe(false)
}))

it.live("two desktop actions in one assistant turn cannot race, and the next turn can recover", () => Effect.gen(function* () {
  calls.length = 0
  const info = yield* DesktopTool
  const tool = yield* info.init()
  const ctx = context({ revision: 7, controls: [{ target: 8, role: "AXButton", name: "Cancel" }] }, false)
  const results = yield* Effect.all([
    tool.execute({ action: "click", target: 8 }, ctx).pipe(Effect.exit),
    tool.execute({ action: "key", key: "n", modifiers: ["command"] }, ctx).pipe(Effect.exit),
  ], { concurrency: "unbounded" })
  expect(results.map((result) => result._tag).sort()).toEqual(["Failure", "Success"])
  expect(calls).toHaveLength(1)
  ctx.messageID = MessageID.make(`msg_desktop_regression_${++turn}`)
  yield* tool.execute({ action: "observe" }, ctx)
  expect(calls).toHaveLength(2)
  // Stop is always honored, including in a turn that already acted.
  yield* tool.execute({ action: "close" }, ctx)
  expect(calls.at(-1)?.action).toBe("close")
}))

for (const image of [false, true]) it.live(`look uses separate capture approval and sends ${image ? "image and text" : "only text"}`, () => Effect.gen(function* () {
  calls.length = 0
  nativeResult = { revision: 9, controls: [], screenText: "Continue", visualTargets: [{ target: 1, text: "Continue" }], screenshot: { mime: "image/png", data: "AA==" } }
  try {
    const info = yield* DesktopTool
    const tool = yield* info.init()
    const ctx = context({ app: "TextEdit", revision: 7, controls: [] }, true)
    ctx.extra = { model: { capabilities: { input: { image } } } }
    ctx.askWithReceipt = (request) => Effect.sync(() => {
      expect(request.permission).toBe("desktop_screenshot")
      expect(request.always).toEqual([])
      expect(String(request.metadata.notice)).toContain(image ? "send its image" : "image stays local")
      return true
    })
    const result = yield* tool.execute({ action: "look" }, ctx)
    expect(calls[0]).toEqual({ action: "look", revision: 7, restoreAfterApproval: true })
    expect(result.output).toContain("Continue")
    expect(result.output).not.toContain("AA==")
    expect(result.output).not.toContain("screenshot")
    expect(result.attachments?.length ?? 0).toBe(image ? 1 : 0)
    expect(result.output).toContain(image ? "image and on-device" : "no image sent")
    expect(holds).toBe(0)
  } finally { nativeResult = undefined }
}))
it.live("denying screen capture sends no native action or image", () => Effect.gen(function* () {
  calls.length = 0
  const info = yield* DesktopTool
  const tool = yield* info.init()
  const ctx = context({ revision: 7, controls: [] }, true)
  ctx.askWithReceipt = () => Effect.sync(() => { throw new Error("Capture rejected") })
  const exit = yield* tool.execute({ action: "look" }, ctx).pipe(Effect.exit)
  expect(exit._tag).toBe("Failure")
  expect(calls).toHaveLength(0)
  expect(holds).toBe(0)
}))
it.live("text-only models cannot request raw-image coordinate clicks", () => Effect.gen(function* () {
  calls.length = 0
  const info = yield* DesktopTool
  const tool = yield* info.init()
  for (const action of ["screenshot", "click_point"] as const) {
    const ctx = context({ revision: 7, controls: [] }, true)
    let asked = false; ctx.askWithReceipt = () => Effect.sync(() => { asked = true; return true })
    const exit = yield* tool.execute({ action, x: 10, y: 20 }, ctx).pipe(Effect.exit)
    expect(exit._tag).toBe("Failure"); expect(asked).toBe(false)
  }
  expect(calls).toHaveLength(0)
}))


it.live("mouse actions preserve intended button/destination in approval and native request", () => Effect.gen(function* () {
  calls.length = 0
  const info = yield* DesktopTool
  const tool = yield* info.init()
  const observed = { app: "Test app", revision: 7, controls: [{ target: 1, role: "AXRow", name: "First item" }, { target: 2, role: "AXRow", name: "Second item" }] }
  for (const input of [{ action: "move", target: 1 }, { action: "click", target: 1, button: "right" }, { action: "click", target: 1, count: 2 }, { action: "drag", target: 1, toTarget: 2 }] as const) {
    const ctx = context(observed, true)
    ctx.askWithReceipt = (request) => Effect.sync(() => {
      expect(request.permission).toBe("desktop")
      expect(request.metadata.label).toBe("First item")
      if (input.action === "drag") expect(request.metadata.destination).toBe("Second item")
      if ("button" in input) expect(request.metadata.button).toBe(input.button)
      if ("count" in input) expect(request.metadata.count).toBe(input.count)
      return true
    })
    yield* tool.execute(input, ctx)
    expect(calls.at(-1)).toEqual({ ...input, revision: 7, restoreAfterApproval: true })
  }
  const denied = context(observed, true)
  denied.askWithReceipt = () => Effect.sync(() => { throw new Error("User rejected drag") })
  const before = calls.length
  const exit = yield* tool.execute({ action: "drag", target: 1, toTarget: 2 }, denied).pipe(Effect.exit)
  expect(exit._tag).toBe("Failure")
  expect(calls).toHaveLength(before)
}))


it.live("rightClick passes the real tool schema and becomes one approved native right-click", () => Effect.gen(function* () {
  calls.length = 0
  const info = yield* DesktopTool
  const tool = yield* info.init()
  const ctx = context({ app: "TextEdit", revision: 7, controls: [{ target: 1, role: "AXTextArea", name: "Document" }] }, true)
  let approvals = 0
  ctx.askWithReceipt = (request) => Effect.sync(() => {
    approvals++
    expect(request.permission).toBe("desktop")
    expect(request.metadata.action).toBe("click")
    expect(request.metadata.button).toBe("right")
    return true
  })
  yield* tool.execute({ action: "rightClick", target: 1 }, ctx)
  expect(approvals).toBe(1)
  expect(calls).toEqual([{ action: "click", target: 1, button: "right", count: 1, revision: 7, restoreAfterApproval: true }])
  const exit = yield* tool.execute({ action: "doubleClick", target: 1, button: "right" }, context({ revision: 8, controls: [] }, true)).pipe(Effect.exit)
  expect(exit._tag).toBe("Failure")
  expect(calls).toHaveLength(1)
}))


it.live("new human requests cannot reuse old TextEdit references or send stale input", () => Effect.gen(function* () {
  calls.length = 0
  const info = yield* DesktopTool
  const tool = yield* info.init()
  const ctx = context({ app: "TextEdit", revision: 6, controls: [{ target: 1, role: "AXTextArea" }] }, false)
  ctx.messages.push({ info: { role: "user", id: "new-human-request" }, parts: [{ type: "text", text: "Move the cursor around the window" }] } as unknown as SessionV1.WithParts)
  let approved = false
  ctx.askWithReceipt = () => Effect.sync(() => { approved = true; return true })
  const result = yield* tool.execute({ action: "move", target: 1, revision: 6 }, ctx).pipe(Effect.exit)
  expect(result._tag).toBe("Failure")
  expect(calls).toHaveLength(0)
  expect(approved).toBe(false)
  yield* tool.execute({ action: "activate", app: "com.apple.TextEdit" }, { ...ctx, messageID: MessageID.make(`msg_desktop_regression_${++turn}`) })
  expect(calls.map((input) => input.action)).toEqual(["activate"])
}))

it.live("coordinate movement goes through approval with explicit window position", () => Effect.gen(function* () {
  calls.length = 0
  const info = yield* DesktopTool
  const tool = yield* info.init()
  const ctx = context({ app: "TextEdit", revision: 7, controls: [] }, true)
  ctx.askWithReceipt = (request) => Effect.sync(() => {
    expect(request.permission).toBe("desktop")
    expect(request.metadata.x).toBe(120)
    expect(request.metadata.y).toBe(200)
    return true
  })
  yield* tool.execute({ action: "move", x: 120, y: 200 }, ctx)
  expect(calls).toEqual([{ action: "move", x: 120, y: 200, revision: 7, restoreAfterApproval: true }])
}))


it.live("pointer-only intent blocks Command+N before approval or native input", () => Effect.gen(function* () {
  calls.length = 0
  const info = yield* DesktopTool
  const tool = yield* info.init()
  const ctx = context({ revision: 7, windowAvailable: false, controls: [] }, true)
  ctx.messages.unshift({ info: { role: "user" }, parts: [{ type: "text", text: "Bring TextEdit forward. Move the pointer to three different positions inside its window without clicking or changing the text. Verify each position." }] } as unknown as SessionV1.WithParts)
  let asked = false
  ctx.askWithReceipt = () => Effect.sync(() => { asked = true; return true })
  const result = yield* tool.execute({ action: "key", key: "n", modifiers: ["command"], revision: 7 }, ctx).pipe(Effect.exit)
  expect(result._tag).toBe("Failure")
  expect(asked).toBe(false)
  expect(calls).toHaveLength(0)
}))
