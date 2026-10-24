/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { DialogRemote } from "../../src/component/dialog-remote"
import { mountDialog } from "../fixture/dialog"
import { tmpdir } from "../fixture/fixture"
import { RemoteHint } from "../../src/component/remote-hint"
import { writeRemotePresence } from "@opencode-ai/core/olivecode/remote-status"

for (const [width, height] of [[120, 30], [60, 20]]) test(`Remote onboarding fits ${width}×${height} and explains private pairing`, async () => {
  await using tmp = await tmpdir()
  const app = await mountDialog(tmp.path, () => <DialogRemote />, () => undefined, { width, height })
  try {
    const frame = await app.frame("Remote from phone")
    expect(frame).toContain("Connect Telegram")
    expect(frame).toContain("paired private account")
    expect(frame).toContain("Captures are off")
    expect(frame).toContain("Ctrl+C")
    app.mockInput.pressEnter()
    const connect = await app.frame("Copy setup command")
    expect(connect).toContain("@BotFather")
    expect(connect).toContain("/newbot")
    expect(connect).toContain("Start remote →")
  } finally { app.renderer.destroy() }
})

for (const [width, height] of [[120, 30], [60, 20]]) test(`Remote mode chooser fits ${width}×${height} and distinguishes app control`, async () => {
  await using tmp = await tmpdir()
  const app = await mountDialog(tmp.path, () => <DialogRemote />, () => undefined, { width, height })
  try {
    await app.frame("2  Start remote")
    app.mockInput.pressKey("n", { ctrl: true })
    app.mockInput.pressEnter()
    const frame = await app.frame("Start remote · choose a mode")
    expect(frame).toContain("Coding · project files")
    expect(frame).toContain("Background browser")
    if (process.platform === "darwin") expect(frame).toContain("Mac apps + browser")
    expect(frame).toContain("Ctrl+C")
  } finally { app.renderer.destroy() }
})

test("welcome offers Remote when offline and shows connection only for a live paired listener", async () => {
  for (const connected of [false, true]) {
    await using tmp = await tmpdir()
    if (connected) await writeRemotePresence(tmp.path, { pid: process.pid, updated: Date.now(), paired: true, phase: "listening" })
    const app = await mountDialog(tmp.path, () => <DialogRemote />, () => undefined, { autoOpen: false, inline: () => <RemoteHint /> })
    try {
      const frame = await app.frame(connected ? "Remote connected" : "Keep coding from your phone")
      expect(frame).toContain("/remote")
      expect(frame.includes("Keep coding from your phone")).toBe(!connected)
    } finally { app.renderer.destroy() }
  }
})
