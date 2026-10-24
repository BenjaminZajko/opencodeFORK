import { expect, test } from "bun:test"
import { DesktopRequest } from "../../src/computer/desktop-request"
import { Coordination } from "../../src/session/coordination"
import type { SessionV1 } from "@opencode-ai/core/v1/session"

const dialog: DesktopRequest.Observation = { revision: 7, focusedTarget: 4, controls: [
  { target: 4, role: "AXTextField", name: "Search", enabled: true },
  { target: 6, role: "AXButton", name: "New Document", enabled: true },
] }

test("the actual missing-revision click uses the last supplied observation", () => {
  expect(DesktopRequest.normalize({ action: "click", target: 6 }, dialog)).toEqual({ action: "click", target: 6, revision: 7 })
  expect(DesktopRequest.normalize({ action: "click", target: 6, revision: 3 }, dialog).revision).toBe(3)
  expect(() => DesktopRequest.normalize({ action: "click", target: 6 })).toThrow("Observe")
})

test("missing typing target never selects the TextEdit file-picker search field", () => {
  expect(() => DesktopRequest.normalize({ action: "type", text: "Hello from OliveCode" }, dialog)).toThrow("document text area")
  const document = { revision: 8, focusedTarget: 1, controls: [{ target: 1, role: "AXTextArea", enabled: true }] }
  expect(DesktopRequest.normalize({ action: "type", text: "Hello from OliveCode" }, document)).toEqual({ action: "type", text: "Hello from OliveCode", revision: 8, target: 1 })
  expect(() => DesktopRequest.normalize({ action: "type", text: "Hello" }, { ...document, focusedTarget: undefined })).toThrow("target")
  expect(() => DesktopRequest.normalize({ action: "click", target: 1.5 }, document)).toThrow("target")
})

test("permission acknowledgements retain the original desktop goal for completion review", () => {
  const task = "Open TextEdit, create a document, type Hello from OliveCode, verify the text, and leave it unsaved."
  const messages = [
    { info: { role: "user", agent: "desktop" }, parts: [{ type: "text", text: task }] },
    { info: { role: "assistant" }, parts: [{ type: "text", text: "Enable Accessibility and let me know." }] },
    { info: { role: "user", agent: "desktop" }, parts: [{ type: "text", text: "I enabled it" }] },
  ] as unknown as SessionV1.WithParts[]
  const request = Coordination.resumedRequest("I enabled it", messages, "desktop")
  expect(request).toContain(task)
  expect(Coordination.worthCoordinating(request)).toBe(true)
  expect(Coordination.resumedRequest("What is TextEdit?", messages, "desktop")).toBe("What is TextEdit?")
  expect(Coordination.resumedRequest("I enabled it", messages, "build")).toBe("I enabled it")
})

test("later observations cannot turn a failed typing attempt into action success", () => {
  const messages = [{ parts: [
    { type: "tool", tool: "desktop", state: { status: "error", input: { action: "type", text: "Hello from OliveCode" }, error: "Missing target" } },
    { type: "tool", tool: "desktop", state: { status: "completed", input: { action: "observe" }, output: "Open dialog" } },
  ] }] as unknown as SessionV1.WithParts[]
  expect(Coordination.failedComputerAction(messages)).toContain("type action failed")
  messages[0].parts.push({ type: "tool", tool: "desktop", state: { status: "completed", input: { action: "type" }, output: "Hello from OliveCode" } } as unknown as SessionV1.ToolPart)
  expect(Coordination.failedComputerAction(messages)).toBeUndefined()
})

test("visual clicks use only the latest OCR targets, never accessibility IDs", () => {
  const visual = { ...dialog, visualTargets: [{ target: 2, text: "Continue" }] }
  expect(DesktopRequest.normalize({ action: "look" }, dialog).revision).toBe(7)
  expect(DesktopRequest.normalize({ action: "click_text", target: 2 }, visual)).toEqual({ action: "click_text", target: 2, revision: 7 })
  expect(() => DesktopRequest.normalize({ action: "click_text", target: 6 }, visual)).toThrow("recognized text target")
  expect(() => DesktopRequest.normalize({ action: "click_text", target: 2 }, dialog)).toThrow("latest approved look")
  expect(() => DesktopRequest.normalize({ action: "click_text", target: 2.5 }, visual)).toThrow("recognized text target")
})
test("focus can restore the observed app and select only a listed window", () => {
  expect(DesktopRequest.normalize({ action: "focus" }, dialog)).toEqual({ action: "focus", revision: 7 })
  const windows = { ...dialog, windows: [{ window: 1, title: "Untitled" }, { window: 2, title: "Notes" }] }
  expect(DesktopRequest.normalize({ action: "focus", window: 2 }, windows)).toEqual({ action: "focus", window: 2, revision: 7 })
  expect(() => DesktopRequest.normalize({ action: "focus", window: 2 }, dialog)).toThrow("latest windows")
  expect(() => DesktopRequest.normalize({ action: "focus", window: 3 }, windows)).toThrow("latest windows")
  expect(DesktopRequest.normalize({ action: "focus", revision: 3 }, dialog).revision).toBe(3)
})

test("unverified input must be observed before more typing and app search must be specific", () => {
  const receipt = { ...dialog, needsObservation: true }
  expect(() => DesktopRequest.normalize({ action: "type", text: "Hello", target: 6 }, receipt)).toThrow("do not replay")
  expect(DesktopRequest.normalize({ action: "focus" }, receipt).revision).toBe(7)
  expect(() => DesktopRequest.normalize({ action: "find_app" })).toThrow("specific requested app")
  expect(() => DesktopRequest.normalize({ action: "find_app", query: " " })).toThrow("specific requested app")
  expect(DesktopRequest.normalize({ action: "find_app", query: "TextEdit" })).toEqual({ action: "find_app", query: "TextEdit" })
})
test("a sent-input receipt requires verification from the intended app", () => {
  const messages = [{ parts: [{ type: "tool", tool: "desktop", state: { status: "completed", input: { action: "type" }, output: JSON.stringify({ bundle: "com.apple.TextEdit", inputSent: true, needsObservation: true }) } }] }] as unknown as SessionV1.WithParts[]
  expect(Coordination.failedComputerAction(messages)).toContain("do not replay")
  messages[0].parts.push({ type: "tool", tool: "desktop", state: { status: "completed", input: { action: "observe" }, output: JSON.stringify({ bundle: "com.apple.Notes", windowAvailable: true, controls: [] }) } } as unknown as SessionV1.ToolPart)
  expect(Coordination.failedComputerAction(messages)).toContain("not observed")
  messages[0].parts.push({ type: "tool", tool: "desktop", state: { status: "completed", input: { action: "focus" }, output: JSON.stringify({ bundle: "com.apple.TextEdit", windowAvailable: true, controls: [{ target: 1, role: "AXTextArea", value: "Hello" }] }) } } as unknown as SessionV1.ToolPart)
  expect(Coordination.failedComputerAction(messages)).toBeUndefined()
})


test("mouse operations use observed enabled targets and distinct drag destinations", () => {
  const observed = { revision: 12, controls: [{ target: 1, role: "AXRow", enabled: true }, { target: 2, role: "AXRow", enabled: true }, { target: 3, role: "AXRow", enabled: false }] }
  expect(DesktopRequest.normalize({ action: "move", target: 1 }, observed)).toEqual({ action: "move", target: 1, revision: 12 })
  expect(DesktopRequest.normalize({ action: "drag", target: 1, toTarget: 2 }, observed)).toEqual({ action: "drag", target: 1, toTarget: 2, revision: 12 })
  for (const toTarget of [undefined, 1, 3, 4, 1.5]) expect(() => DesktopRequest.normalize({ action: "drag", target: 1, toTarget }, observed)).toThrow("destination")
  for (const target of [3, 4, 1.5]) expect(() => DesktopRequest.normalize({ action: "move", target }, observed)).toThrow("target")
  expect(() => DesktopRequest.normalize({ action: "move", target: 1, button: "right" }, observed)).toThrow("only to clicks")
  expect(() => DesktopRequest.normalize({ action: "click", target: 1, button: "right", count: 2 }, observed)).toThrow("left-button only")
  expect(() => DesktopRequest.normalize({ action: "drag", target: 1, toTarget: 2 }, { ...observed, needsObservation: true })).toThrow("do not replay")
})

test("failed drag remains unfinished even if a later observation succeeds", () => {
  const messages = [{ parts: [
    { type: "tool", tool: "desktop", state: { status: "error", input: { action: "drag", target: 1, toTarget: 2 }, error: "Foreground changed; some input sent" } },
    { type: "tool", tool: "desktop", state: { status: "completed", input: { action: "observe" }, output: "Current window" } },
  ] }] as unknown as SessionV1.WithParts[]
  expect(Coordination.failedComputerAction(messages)).toContain("drag action failed")
})


test("common mouse spellings normalize without inventing targets or overriding conflicts", () => {
  for (const action of ["rightClick", "right_click"] as const) {
    expect(DesktopRequest.normalize({ action, target: 6 }, dialog)).toEqual({ action: "click", target: 6, button: "right", count: 1, revision: 7 })
    expect(() => DesktopRequest.normalize({ action, target: 6, button: "left" }, dialog)).toThrow("conflicts")
    expect(() => DesktopRequest.normalize({ action, target: 6, count: 2 }, dialog)).toThrow("conflicts")
    expect(() => DesktopRequest.normalize({ action }, dialog)).toThrow("target")
  }
  for (const action of ["doubleClick", "double_click"] as const) {
    expect(DesktopRequest.normalize({ action, target: 6 }, dialog)).toEqual({ action: "click", target: 6, button: "left", count: 2, revision: 7 })
    expect(() => DesktopRequest.normalize({ action, target: 6, button: "right" }, dialog)).toThrow("conflicts")
    expect(() => DesktopRequest.normalize({ action, target: 6, count: 1 }, dialog)).toThrow("conflicts")
  }
  expect(DesktopRequest.normalize({ action: "rightClick", target: 6, revision: 3 }, dialog).revision).toBe(3)
  expect(() => DesktopRequest.normalize({ action: "rightClick", target: 6 }, { ...dialog, needsObservation: true })).toThrow("do not replay")
})


test("pointer coordinates are explicit window-relative positions, not ignored control offsets", () => {
  expect(DesktopRequest.normalize({ action: "move", x: 100, y: 200 }, dialog)).toEqual({ action: "move", x: 100, y: 200, revision: 7 })
  for (const input of [{ target: 6, x: 100, y: 200 }, { x: 100 }, { x: -1, y: 2 }, { x: Infinity, y: 2 }, { x: 1, y: NaN }])
    expect(() => DesktopRequest.normalize({ action: "move", ...input }, dialog)).toThrow("window-relative")
})


test("coordinate moves use window dimensions, not its global screen offset", () => {
  const view = { ...dialog, bounds: { x: 0, y: 0, width: 586, height: 488 } }
  expect(DesktopRequest.normalize({ action: "move", x: 475, y: 378 }, view).revision).toBe(7)
  expect(() => DesktopRequest.normalize({ action: "move", x: 750, y: 540 }, view)).toThrow("0 <= x < 586")
  expect(() => DesktopRequest.normalize({ action: "move", x: 586, y: 100 }, view)).toThrow("revision remains 7")
})

test("verified distinct pointer moves remain complete after a rejected unnecessary extra move", () => {
  const request = "Bring TextEdit forward. Move the pointer to three different positions inside its window without clicking or changing the text. Verify each position."
  const view = { bundle: "com.apple.TextEdit", title: "Untitled", text: "Existing text", windowAvailable: true, controls: [] }
  const move = (x: number, y: number) => ({ type: "tool", tool: "desktop", state: { status: "completed", input: { action: "move", x, y }, output: JSON.stringify({ ...view, cursor: { x, y, inWindow: true } }) } })
  const messages = [{ info: { role: "user" }, parts: [{ type: "text", text: request }] }, { info: { role: "assistant" }, parts: [move(192, 197), move(475, 378), move(400, 200), { type: "tool", tool: "desktop", state: { status: "error", input: { action: "move" }, error: "Out of bounds" } }] }] as unknown as SessionV1.WithParts[]
  expect(Coordination.failedComputerAction(messages)).toBeUndefined()
  messages[1].parts.splice(2, 1)
  expect(Coordination.failedComputerAction(messages)).toContain("move action failed")
  messages[1].parts.splice(2, 0, move(192, 197) as unknown as SessionV1.ToolPart)
  expect(Coordination.failedComputerAction(messages)).toContain("move action failed")
  messages[1].parts.splice(2, 1, move(400, 200) as unknown as SessionV1.ToolPart)
  messages[1].parts.splice(0, 0, { type: "tool", tool: "desktop", state: { status: "completed", input: { action: "key", key: "n" }, output: "{}" } } as unknown as SessionV1.ToolPart)
  expect(Coordination.failedComputerAction(messages)).toContain("move action failed")
})
