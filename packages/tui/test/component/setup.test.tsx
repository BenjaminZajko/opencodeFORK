/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { mountDialog } from "../fixture/dialog"
import { tmpdir } from "../fixture/fixture"
import { json } from "../fixture/tui-sdk"
import { DialogSetup, DialogCloudSetup } from "../../src/component/dialog-setup"
import { StartGuide } from "../../src/component/start-guide"
import { Logo } from "../../src/component/logo"
import { useTheme } from "../../src/context/theme"
import { useTerminalDimensions } from "@opentui/solid"

const providers = ["openrouter", "groq", "mistral", "nvidia", "openai"].map((id) => ({ id, name: id, models: {} }))

function Welcome() {
  const dimensions = useTerminalDimensions()
  const compact = () => dimensions().width < 60 || dimensions().height < 30
  return (
    <box padding={2}>
      <Logo compact={compact()} />
      <StartGuide compact={compact()} />
    </box>
  )
}

test("first-use setup navigates with the keyboard and never scans hardware", async () => {
  await using tmp = await tmpdir()
  const requests: string[] = []
  const app = await mountDialog(
    tmp.path,
    () => <DialogSetup />,
    (url) => {
      requests.push(url.pathname)
      if (url.pathname === "/provider") return json({ all: providers, connected: [], default: {} })
    },
  )
  try {
    await app.frame("Set up cloud")
    await app.search("Set up cloud")
    app.mockInput.pressEnter()
    const frame = await app.frame("openrouter")
    expect(frame).toContain("Connect your cloud account")
    expect(frame).toContain("groq")
    expect(frame).not.toContain("openai")
    expect(requests.some((path) => path.startsWith("/onboarding/"))).toBe(false)
    app.mockInput.pressEscape()
    await app.frame("Connect your cloud account", false)
  } finally {
    app.renderer.destroy()
  }
})

test("skipping the guide persists across launches and /start can still reopen setup", async () => {
  await using tmp = await tmpdir()
  const app = await mountDialog(
    tmp.path,
    () => <DialogSetup />,
    () => undefined,
    { inline: () => <Welcome /> },
  )
  try {
    await app.frame("Start here")
    await app.search("Skip guide")
    app.mockInput.pressEnter()
    await app.frame("Start here", false)
    await app.frame("Start with OliveCode", false)
    for (let i = 0; i < 100 && !(await Bun.file(`${tmp.path}/kv.json`).json()).olivecode_guide_dismissed; i++)
      await Bun.sleep(10)
    expect((await Bun.file(`${tmp.path}/kv.json`).json()).olivecode_guide_dismissed).toBe(true)
  } finally {
    app.renderer.destroy()
  }
  const returning = await mountDialog(
    tmp.path,
    () => <DialogSetup />,
    () => undefined,
    { autoOpen: false, inline: () => <Welcome /> },
  )
  try {
    await returning.frame("OliveCode")
    await Bun.sleep(50)
    await returning.frame("Start here", false)
    returning.open()
    await returning.frame("Start with OliveCode")
  } finally {
    returning.renderer.destroy()
  }
})

test("an account save failure is retryable and only success advances to cloud models", async () => {
  await using tmp = await tmpdir()
  let saves = 0
  let disposes = 0
  const app = await mountDialog(
    tmp.path,
    () => <DialogCloudSetup />,
    (url) => {
      if (url.pathname === "/provider") return json({ all: providers, connected: [], default: {} })
      if (url.pathname === "/auth/groq") return ++saves === 1 ? json({ error: "failed" }, { status: 503 }) : json(true)
      if (url.pathname === "/instance/dispose") {
        disposes++
        return json(true)
      }
      if (url.pathname === "/onboarding/default") return json(null)
      if (url.pathname === "/provider/cooldowns") return json([])
    },
  )
  try {
    await app.frame("groq")
    await app.search("groq")
    app.mockInput.pressEnter()
    await app.frame("https://console.groq.com/keys")
    await Bun.sleep(10)
    await app.mockInput.typeText("test-credential")
    app.mockInput.pressEnter()
    await app.frame("Could not save this account")
    expect(disposes).toBe(0)
    app.mockInput.pressEnter()
    await app.frame("Cloud · recommended")
    expect(saves).toBe(2)
    expect(disposes).toBe(1)
  } finally {
    app.renderer.destroy()
  }
})

test("closing an account save prevents a late response from advancing setup", async () => {
  await using tmp = await tmpdir()
  const pending = Promise.withResolvers<Response>()
  let started = false
  let disposes = 0
  const app = await mountDialog(
    tmp.path,
    () => <DialogCloudSetup />,
    (url) => {
      if (url.pathname === "/provider") return json({ all: providers, connected: [], default: {} })
      if (url.pathname === "/auth/groq") {
        started = true
        return pending.promise
      }
      if (url.pathname === "/instance/dispose") {
        disposes++
        return json(true)
      }
    },
  )
  try {
    await app.frame("groq")
    await app.search("groq")
    app.mockInput.pressEnter()
    await app.frame("https://console.groq.com/keys")
    await Bun.sleep(10)
    await app.mockInput.typeText("test-credential")
    app.mockInput.pressEnter()
    await app.frame("Saving account")
    expect(started).toBe(true)
    app.mockInput.pressEscape()
    await app.frame("Saving account", false)
    pending.resolve(json(true))
    await Bun.sleep(20)
    expect(disposes).toBe(0)
    expect(app.captureCharFrame()).not.toContain("Cloud · recommended")
  } finally {
    pending.resolve(json(true))
    app.renderer.destroy()
  }
})

for (const mode of ["dark", "light"] as const) {
  test(`welcome fits regular and compact terminals in ${mode} mode`, async () => {
    await using tmp = await tmpdir()
    const app = await mountDialog(
      tmp.path,
      () => <DialogSetup />,
      () => undefined,
      { mode, autoOpen: false, inline: () => <Welcome /> },
    )
    try {
      await app.frame("Set up cloud")
      if (process.env.OLIVECODE_CAPTURE_DIR)
        await Bun.write(`${process.env.OLIVECODE_CAPTURE_DIR}/welcome-${mode}.json`, JSON.stringify(app.captureSpans()))
      app.resize(48, 24)
      const frame = await app.frame("Cloud or local")
      expect(frame).toContain("/start")
      expect(frame).not.toContain("A quieter place")
      if (process.env.OLIVECODE_CAPTURE_DIR)
        await Bun.write(
          `${process.env.OLIVECODE_CAPTURE_DIR}/welcome-${mode}-compact.json`,
          JSON.stringify(app.captureSpans()),
        )
      app.open()
      await app.frame("Skip guide")
      await app.search("Skip guide")
      app.mockInput.pressEnter()
      await app.frame("Start here", false)
    } finally {
      app.renderer.destroy()
    }
  })
}

test("an existing theme preference is respected after preferences finish loading", async () => {
  await using tmp = await tmpdir()
  function Selected() {
    const theme = useTheme()
    return <text>{theme.selected}</text>
  }
  const app = await mountDialog(
    tmp.path,
    () => <DialogSetup />,
    () => undefined,
    { autoOpen: false, saved: { theme: "opencode" }, inline: () => <Selected /> },
  )
  try {
    await app.frame("opencode")
  } finally {
    app.renderer.destroy()
  }
})
