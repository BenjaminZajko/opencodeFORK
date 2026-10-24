import { expect, test } from "bun:test"
import { repeatingResponse } from "../../src/session/repetition"

test("recognizes a streaming repeated sentence even in a partial cycle", () => {
  const unit = "Wait for the current desktop action to finish. Let's try again. We need to click the New Document button to create a new document. "
  const text = unit.repeat(30)
  for (let offset = 0; offset < unit.length; offset++) expect(repeatingResponse(text.slice(0, 2000 + offset))).toBe(true)
  expect(repeatingResponse(unit.repeat(300))).toBe(true)
})
test("allows short repetition and long meaningful output with distinct steps", () => {
  expect(repeatingResponse("Hello from OliveCode")).toBe(false)
  expect(repeatingResponse("Read the latest observation before choosing another action. ".repeat(4))).toBe(false)
  expect(repeatingResponse(Array.from({ length: 100 }, (_, index) => `Step ${index}: inspect control ${index} and verify document value ${index}.`).join("\n"))).toBe(false)
})
