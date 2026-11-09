import { expect, test } from "bun:test"
import { Selection } from "../src/util/selection"

function fixture() {
  const messages: string[] = []
  let clears = 0
  const selection = { getSelectedText: () => "Selected answer 🫒", selectedRenderables: [] }
  const renderer = { getSelection: () => selection, clearSelection: () => { clears++ } }
  const toast = { show: ({ message }: { message: string }) => { messages.push(message) }, error: () => { messages.push("failed") } }
  return { renderer, toast, messages, clears: () => clears }
}

test("copy failure keeps the selection and never announces success", async () => {
  const f = fixture()
  expect(Selection.copy(f.renderer, f.toast, { write: async () => { throw new Error("No Wayland clipboard") } })).toBe(true)
  await Bun.sleep(0)
  expect(f.clears()).toBe(0)
  expect(f.messages).toEqual(["failed"])
})

test("selection clears only after the clipboard confirms the write", async () => {
  const f = fixture()
  let finish = () => {}
  Selection.copy(f.renderer, f.toast, { write: (text) => {
    expect(text).toBe("Selected answer 🫒")
    return new Promise<void>((resolve) => { finish = resolve })
  } })
  expect(f.clears()).toBe(0)
  finish()
  await Bun.sleep(0)
  expect(f.clears()).toBe(1)
  expect(f.messages).toEqual(["Copied to clipboard"])
})

test("a missing clipboard service does not erase the selected answer", () => {
  const f = fixture()
  expect(Selection.copy(f.renderer, f.toast, {})).toBe(true)
  expect(f.clears()).toBe(0)
  expect(f.messages[0]).toContain("Selected text was kept")
})
