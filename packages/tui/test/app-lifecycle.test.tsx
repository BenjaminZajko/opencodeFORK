import { expect, mock, test } from "bun:test"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createTestRenderer } from "@opentui/core/testing"
import { Effect } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Global } from "@opencode-ai/core/global"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createEventSource, createFetch, directory, json } from "./fixture/tui-sdk"
import { tmpdir } from "./fixture/fixture"

test("SIGHUP clears title and disposes scoped resources once", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const titles: string[] = []
  const setTitle = setup.renderer.setTerminalTitle.bind(setup.renderer)
  setup.renderer.setTerminalTitle = (title) => {
    titles.push(title)
    setTitle(title)
  }
  const listeners = new Set(process.listeners("SIGHUP"))
  const events = createEventSource()
  const calls = createFetch()
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  let disposes = 0

  try {
    const { run } = await import("../src/app")
    const task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: {},
        pluginHost: {
          async start() {
            started()
          },
          async dispose() {
            disposes++
          },
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )
    await ready
    process.emit("SIGHUP")
    await task

    expect(setup.renderer.isDestroyed).toBe(true)
    expect(titles.at(-1)).toBe("")
    expect(disposes).toBe(1)
    expect(process.listeners("SIGHUP").every((listener) => listeners.has(listener))).toBe(true)
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    mock.restore()
  }
})

test("app.exit prints the session epilogue after scoped cleanup", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const events = createEventSource()
  const calls = createFetch((url) => {
    if (url.pathname === "/session")
      return json([
        {
          id: "dummy",
          title: "Demo session",
          slug: "dummy",
          projectID: "project",
          directory,
          version: "0.0.0-test",
          time: { created: 0, updated: 0 },
        },
      ])
  })
  const originalWrite = process.stdout.write.bind(process.stdout)
  let stdout = ""
  let api: TuiPluginApi | undefined
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk)
    return true
  }) as typeof process.stdout.write

  try {
    const { run } = await import("../src/app")
    const task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: { continue: true },
        pluginHost: {
          async start(input) {
            api = input.api
            started()
          },
          async dispose() {},
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )

    await ready
    await setup.renderOnce()
    await setup.renderOnce()
    api?.keymap.dispatchCommand("app.exit")
    await task

    expect(stdout).toContain("Demo session")
    expect(stdout).toContain("olivecode -s dummy")
  } finally {
    process.stdout.write = originalWrite
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    mock.restore()
  }
})

for (const mode of ["dark", "light"] as const) {
  test(`OliveCode home remains usable after resizing in ${mode} appearance`, async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, JSON.stringify({ theme_mode_lock: mode, animations_enabled: false }))
    const setup = await createTestRenderer({ width: 100, height: 36, useThread: false })
    const core = await import("@opentui/core")
    mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
    const calls = createFetch((url) => {
      if (url.pathname === "/agent") return json([{ name: "build", mode: "primary", options: {}, permission: [] }])
      if (url.pathname === "/provider/cooldowns") return json([])
      if (url.pathname === "/onboarding/default") return json(null)
      if (url.pathname === "/onboarding/ollama") return json({ installed: false, running: false, models: [] })
    })
    let api: TuiPluginApi | undefined
    let disposeSlots: (() => void) | undefined
    const ready = Promise.withResolvers<void>()
    const { run } = await import("../src/app")
    const task = Effect.runPromise(
      run({
        url: "http://test",
        directory: tmp.path,
        config: createTuiResolvedConfig({ plugin_enabled: {}, theme: "olivecode" }),
        fetch: calls.fetch,
        events: createEventSource().source,
        args: {},
        pluginHost: {
          async start(input) {
            api = input.api
            disposeSlots = input.runtime.setupSlots(input.api).dispose
            ready.resolve()
          },
          async dispose() {
            disposeSlots?.()
          },
        },
      }).pipe(Effect.provide(Global.layerWith({ home: tmp.path, state: tmp.path, data: tmp.path }))),
    )
    async function frame(text: string) {
      for (let i = 0; i < 200; i++) {
        await setup.renderOnce()
        if (setup.captureCharFrame().includes(text)) return setup.captureCharFrame()
        await Bun.sleep(10)
      }
      throw new Error(`Missing ${text}:\n${setup.captureCharFrame()}`)
    }
    try {
      await ready.promise
      await frame("Start here")
      const home = await frame("Cloud")
      expect(home).toContain("OliveCode")
      expect(home).toContain("Local")
      if (process.env.OLIVECODE_CAPTURE_DIR)
        await Bun.write(`${process.env.OLIVECODE_CAPTURE_DIR}/home-${mode}.json`, JSON.stringify(setup.captureSpans()))
      const lines = home.split("\n")
      const row = lines.findIndex((line) => line.includes("Cloud"))
      await setup.mockMouse.moveTo(lines[row].indexOf("Cloud"), row)
      await frame("/cloud · models and availability")
      await setup.mockMouse.moveTo(0, 0)
      setup.resize(120, 30)
      const defaultSize = await frame("Describe what you want to build or fix, OliveCode works with your project files...")
      expect(defaultSize).not.toContain("What are we building?")
      expect(defaultSize).not.toContain("Describe a change. OliveCode works with your project files.")
      expect(defaultSize).toContain("█".repeat(13))
      expect(defaultSize).toContain("Cloud")
      expect(defaultSize).toContain("Local")
      if (process.env.OLIVECODE_CAPTURE_DIR)
        await Bun.write(
          `${process.env.OLIVECODE_CAPTURE_DIR}/home-${mode}-120x30.json`,
          JSON.stringify(setup.captureSpans()),
        )
      setup.resize(75, 30)
      const medium = await frame("Describe what you want to build or fix…")
      expect(medium).toContain("█".repeat(13))
      expect(medium).toContain("Cloud")
      expect(medium).toContain("Local")
      if (process.env.OLIVECODE_CAPTURE_DIR)
        await Bun.write(
          `${process.env.OLIVECODE_CAPTURE_DIR}/home-${mode}-75x30.json`,
          JSON.stringify(setup.captureSpans()),
        )
      setup.resize(68, 30)
      const narrow = await frame("Describe what you want to build or fix…")
      expect(narrow).toContain("OliveCode")
      expect(narrow).toContain("Cloud")
      expect(narrow).toContain("Local")
      if (process.env.OLIVECODE_CAPTURE_DIR)
        await Bun.write(
          `${process.env.OLIVECODE_CAPTURE_DIR}/home-${mode}-68x30.json`,
          JSON.stringify(setup.captureSpans()),
        )
      setup.resize(48, 24)
      const compact = await frame("Cloud or local")
      expect(compact).toContain("Cloud")
      expect(compact).toContain("Local")
      expect(compact).toContain("/start")
      if (process.env.OLIVECODE_CAPTURE_DIR)
        await Bun.write(
          `${process.env.OLIVECODE_CAPTURE_DIR}/home-${mode}-compact.json`,
          JSON.stringify(setup.captureSpans()),
        )
      api!.keymap.dispatchCommand("olivecode.start")
      await frame("Set up cloud")
      setup.mockInput.pressEscape()
      await frame("Cloud or local")
      api!.keymap.dispatchCommand("model.cloud")
      await frame("Cloud · recommended")
      setup.mockInput.pressEscape()
      await frame("Cloud or local")
    } finally {
      setup.renderer.destroy()
      await task
      mock.restore()
    }
  })
}
