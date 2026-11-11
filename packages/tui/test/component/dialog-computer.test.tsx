/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { DialogComputer } from "../../src/component/dialog-computer"
import { ModelSourceControls } from "../../src/component/model-source-controls"
import { mountDialog } from "../fixture/dialog"
import { tmpdir } from "../fixture/fixture"
import { json } from "../fixture/tui-sdk"
import { LocationProvider } from "../../src/context/location"
import { PermissionPrompt } from "../../src/routes/session/permission"

test("Computer is a short settings menu with everything on by default", async () => {
  await using tmp = await tmpdir()
  const app = await mountDialog(tmp.path, () => <DialogComputer />, () => undefined, { width: 120, height: 30, inline: () => <ModelSourceControls /> })
  try {
    const frame = await app.frame("Computer use")
    expect(frame).toMatch(/Computer use\s+On/)
    expect(frame).toMatch(/Show browser window\s+Off/)
    expect(frame).toContain("Every action asks for your approval first")
    expect(frame).not.toContain("Start visible control")
    expect(frame).not.toContain("Start background browser")
    app.mockInput.pressEnter()
    await app.frame("Computer use Off")
  } finally { app.renderer.destroy() }
})

for (const permission of ["browser", "browser_screenshot", "desktop", "desktop_screenshot"] as const) {
  test(`${permission} shows the correct approval choices`, async () => {
    await using tmp = await tmpdir()
    const app = await mountDialog(tmp.path, () => <LocationProvider><PermissionPrompt request={{
      id: "per_computer_test", sessionID: "ses_computer_test", permission,
      patterns: ["ses_computer_test:open:https://example.com"],
      always: !permission.endsWith("screenshot") ? ["ses_computer_test:*"] : [],
      metadata: { action: !permission.endsWith("screenshot") ? "open" : "screenshot", url: "https://example.com" },
    }} /></LocationProvider>, () => undefined, { width: 120, height: 30 })
    try {
      const frame = await app.frame("Allow once")
      expect(frame.includes("Allow always")).toBe(!permission.endsWith("screenshot"))
    } finally { app.renderer.destroy() }
  })
}

for (const [name, input, extra] of [
  ["right-click", { action: "click", button: "right", target: 1 }, {}],
  ["double-click", { action: "click", count: 2, target: 1 }, {}],
  ["drag", { action: "drag", target: 1, toTarget: 2 }, { destination: "Second item" }],
] as const) test(`desktop ${name} approval describes the actual mouse operation`, async () => {
  await using tmp = await tmpdir()
  const app = await mountDialog(tmp.path, () => <LocationProvider><PermissionPrompt request={{
    id: "per_mouse_test", sessionID: "ses_mouse_test", permission: "desktop", patterns: ["ses_mouse_test:mouse"], always: ["ses_mouse_test:*"],
    metadata: { ...input, ...extra, app: "Test app", label: "First item" },
  }} /></LocationProvider>, () => undefined, { width: 120, height: 30 })
  try {
    const frame = await app.frame(`Desktop · ${name}`)
    expect(frame).toContain("First item")
    if (name === "drag") expect(frame).toContain("To: Second item")
    expect(frame).toContain("Allow once")
  } finally { app.renderer.destroy() }
})


for (const [width, height] of [[120, 30], [60, 20]]) test(`Computer opens phone Remote at ${width}x${height}`, async () => {
  await using tmp = await tmpdir()
  const app = await mountDialog(tmp.path, () => <DialogComputer />, () => undefined, { width, height })
  try {
    await app.frame("Computer use")
    for (let index = 0; index < 2; index++) app.mockInput.pressKey("n", { ctrl: true })
    await app.frame("Remote from phone")
    app.mockInput.pressEnter()
    const frame = await app.frame("Connect Telegram")
    expect(frame).toContain("Connect WhatsApp")
    expect(frame).toContain("paired private account")
  } finally { app.renderer.destroy() }
})
