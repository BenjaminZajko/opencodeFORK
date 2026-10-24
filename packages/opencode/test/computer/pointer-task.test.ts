import { expect, test } from "bun:test"
import { assertPointerAction, requestedPositions } from "../../src/computer/pointer-task"
const request = "Bring TextEdit forward. Move the pointer to three different positions inside its window without clicking or changing the text. Verify each position."
test("a pointer-only request cannot create or edit a document", () => {
  expect(requestedPositions(request)).toBe(3)
  for (const action of ["key", "type", "fill", "click", "rightClick", "drag"]) expect(() => assertPointerAction(request, action)).toThrow("No input was sent")
  for (const action of ["activate", "windows", "focus", "observe", "move"]) expect(() => assertPointerAction(request, action)).not.toThrow()
  expect(() => assertPointerAction("Create a document and type Hello", "key")).not.toThrow()
})
