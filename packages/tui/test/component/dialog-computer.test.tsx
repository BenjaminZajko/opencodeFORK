/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { DialogComputer } from "../../src/component/dialog-computer"
import { ModelSourceControls } from "../../src/component/model-source-controls"
import { mountDialog } from "../fixture/dialog"
import { tmpdir } from "../fixture/fixture"
import { json } from "../fixture/tui-sdk"
import { LocationProvider } from "../../src/context/location"
import { PermissionPrompt } from "../../src/routes/session/permission"

test("Computer mode explains its scope, shows Stop, and returns to coding", async () => {
  await using tmp = await tmpdir()
  const app = await mountDialog(tmp.path, () => <DialogComputer />, (url) => {
    if (url.pathname === "/agent") return json(["build", "computer", "computer_background", "computer_background_mac", "desktop"].map((name) => ({ name, mode: "primary", permission: [], options: {} })))
  }, { width: 120, height: 30, inline: () => <ModelSourceControls /> })
  try {
    const frame = await app.frame("Start visible control")
    expect(frame).toContain("Allow always")
    expect(frame).toContain("Window captures ask separately")
    if (process.platform === "darwin") expect(frame).toContain("Websites + Mac apps")
    app.mockInput.pressEnter()
    await app.frame("■ Stop")
    app.open()
    await app.frame("Visible control is on")
    app.mockInput.pressKey("n", { ctrl: true })
    app.mockInput.pressKey("n", { ctrl: true })
    if (process.platform === "darwin") app.mockInput.pressKey("n", { ctrl: true })
    await app.renderOnce()
    app.mockInput.pressEnter()
    await app.frame("Computer ▾")
    await app.frame("■ Stop", false)
  } finally { app.renderer.destroy() }
})

test.skipIf(process.platform !== "darwin")("one Computer entry covers websites and Mac apps with visible Stop", async () => {
  await using tmp = await tmpdir()
  const app = await mountDialog(tmp.path, () => <DialogComputer />, (url) => {
    if (url.pathname === "/agent") return json(["build", "computer", "computer_background", "computer_background_mac", "desktop"].map((name) => ({ name, mode: "primary", permission: [], options: {} })))
  }, { width: 120, height: 30, inline: () => <ModelSourceControls /> })
  try {
    const initial = await app.frame("Websites + Mac apps")
    expect(initial).not.toContain("Control Mac apps")
    app.mockInput.pressEnter()
    await app.frame("■ Stop")
    app.open()
    const frame = await app.frame("Visible control is on")
    expect(frame).toContain("Control+Option+Esc")
    expect(frame).toContain("smooth pointer movement")
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

test("Computer explains screen-text recognition in a small terminal", async () => {
  await using tmp = await tmpdir()
  const app = await mountDialog(tmp.path, () => <DialogComputer />, (url) => {
    if (url.pathname === "/agent") return json(["build", "computer", "computer_background", "computer_background_mac", "desktop"].map((name) => ({ name, mode: "primary", permission: [], options: {} })))
  }, { width: 60, height: 20 })
  try {
    const frame = await app.frame("Model:")
    expect(frame).toContain(process.platform === "darwin" ? "on-device reading" : "browser text")
    expect(frame).toContain("Captures ask")
    expect(frame).toContain("Stop ends control")
    expect(frame).toContain("Allow always")
  } finally { app.renderer.destroy() }
})


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


test("background mode starts independently and keeps Stop available", async () => {
  await using tmp = await tmpdir()
  const app = await mountDialog(tmp.path, () => <DialogComputer />, (url) => {
    if (url.pathname === "/agent") return json(["build", "computer", "computer_background", "computer_background_mac", "desktop"].map((name) => ({ name, mode: "primary", permission: [], options: {} })))
  }, { width: 120, height: 30, inline: () => <ModelSourceControls /> })
  try {
    const frame = await app.frame("Start background browser")
    expect(frame).toContain("Mac apps and manual login need Visible control")
    app.mockInput.pressKey("n", { ctrl: true }); app.mockInput.pressEnter()
    await app.frame("■ Stop")
    app.open(); await app.frame("Background browser is on")
  } finally { app.renderer.destroy() }
})


test.skipIf(process.platform !== "darwin")("Background Mac clearly requires an isolated Mac and preserves Stop", async () => {
  await using tmp = await tmpdir()
  const app = await mountDialog(tmp.path, () => <DialogComputer />, (url) => {
    if (url.pathname === "/agent") return json(["build", "computer", "computer_background", "computer_background_mac", "desktop"].map((name) => ({ name, mode: "primary", permission: [], options: {} })))
  }, { width: 120, height: 30, inline: () => <ModelSourceControls /> })
  try {
    const frame = await app.frame("Start background Mac")
    expect(frame).toContain("isolated Mac required")
    if (process.arch === "arm64") expect(frame).toContain("Set up / show background Mac")
    app.mockInput.pressKey("n", { ctrl: true }); app.mockInput.pressKey("n", { ctrl: true }); app.mockInput.pressEnter()
    await app.frame("■ Stop")
    app.open(); await app.frame("Background Mac is on")
  } finally { app.renderer.destroy() }
})

for (const [width, height] of [[120, 30], [60, 20]]) test(`Computer opens phone Remote at ${width}x${height}`, async () => {
  await using tmp = await tmpdir()
  const app = await mountDialog(tmp.path, () => <DialogComputer />, () => undefined, { width, height })
  try {
    await app.frame("Start visible control")
    for (let index = 0; index < (process.platform === "darwin" ? 4 : 3); index++) app.mockInput.pressKey("n", { ctrl: true })
    await app.frame("Remote from phone")
    app.mockInput.pressEnter()
    const frame = await app.frame("Connect Telegram")
    expect(frame).toContain("Connect WhatsApp")
    expect(frame).toContain("paired private account")
  } finally { app.renderer.destroy() }
})
