/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { DialogPrivacy } from "../../src/component/dialog-privacy"
import { mountDialog } from "../fixture/dialog"
import { tmpdir } from "../fixture/fixture"
import { json } from "../fixture/tui-sdk"

test("privacy choices default off and require a data disclosure", async () => {
  await using tmp = await tmpdir()
  const app = await mountDialog(
    tmp.path,
    () => <DialogPrivacy />,
    (url) => {
      if (url.pathname === "/provider") return json({ all: [], connected: [], default: {} })
    },
  )
  try {
    const frame = await app.frame("Usage measurement: Off")
    expect(frame).toContain("Sponsor measurement: Off")
    expect(frame.replace(/\s+/g, " ")).toContain("No project content is collected.")
    await app.search("Usage")
    app.mockInput.pressEnter()
    const consent = await app.frame("Share basic usage counts?")
    expect(consent.replace(/\s+/g, " ")).toContain("token that changes daily")
    expect(consent.replace(/\s+/g, " ")).toContain("No prompts")
  } finally {
    app.renderer.destroy()
  }
})
