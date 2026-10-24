/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { SponsorPlacement } from "../../src/component/sponsor-placement"
import { mountDialog } from "../fixture/dialog"
import { tmpdir } from "../fixture/fixture"
import { json } from "../fixture/tui-sdk"

for (const placement of ["welcome", "chat"] as const) {
  for (const [width, height] of [[120, 30], [60, 20]]) {
    test(`${placement} sponsor card keeps the composer visible at ${width}x${height}`, async () => {
      await using tmp = await tmpdir()
      const app = await mountDialog(tmp.path, () => <box />, (url) => {
        if (url.pathname === "/provider") return json({ all: [], connected: [], default: {} })
      }, {
        width,
        height,
        autoOpen: false,
        inline: () => <box><SponsorPlacement placement={placement} /><text>Prompt stays reachable</text></box>,
      })
      try {
        const frame = await app.frame("Ad unavailable right now.")
        const rows = frame.split("\n")
        const placementRow = rows.findIndex((row) => row.includes("Sponsored"))
        expect(placementRow).toBeGreaterThanOrEqual(0)
        expect(rows[placementRow + 1]).toContain("Ad unavailable right now.")
        expect(frame).toContain("Prompt stays reachable")
        expect(rows.findIndex((row) => row.includes("Prompt stays reachable"))).toBeGreaterThan(placementRow)
      } finally {
        app.renderer.destroy()
      }
    })
  }
}
