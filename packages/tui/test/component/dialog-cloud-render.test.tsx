/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { mountDialog } from "../fixture/dialog"
import { json, type FetchHandler } from "../fixture/tui-sdk"
import { DialogCloud } from "../../src/component/dialog-cloud"
import { mkdir } from "node:fs/promises"

const provider = {
  id: "openrouter",
  name: "Test provider",
  models: Object.fromEntries(
    ["waiting-model:free", "ready-model:free"].map((id) => [
      id,
      {
        id,
        providerID: "openrouter",
        name: id,
        release_date: "2026-01-01",
        variants: {},
        limit: { context: 32768, output: 4096 },
        cost: { input: 0, output: 0 },
      },
    ]),
  ),
}

function mount(root: string, override: FetchHandler) {
  return mountDialog(
    root,
    () => <DialogCloud />,
    (url) => {
      const custom = override(url)
      if (custom) return custom
      if (url.pathname === "/config/providers") return json({ providers: [provider], default: {} })
      if (url.pathname === "/provider") return json({ all: [provider], connected: ["openrouter"], default: {} })
      if (url.pathname === "/agent") return json([{ name: "build", mode: "primary", options: {}, permission: [] }])
      if (url.pathname === "/onboarding/default")
        return json({ providerID: "openrouter", modelID: "waiting-model:free" })
    },
  )
}

test("Cloud shows a cooling best pick as information and makes it selectable only after expiry", async () => {
  await using tmp = await tmpdir()
  const downUntil = Date.now() + 2200
  const app = await mount(tmp.path, (url) => {
    if (url.pathname === "/provider/cooldowns")
      return json([{ providerID: "openrouter", modelID: "waiting-model:free", downUntil }])
  })
  try {
    const first = await app.frame("ready-model:free")
    expect(first).not.toContain("waiting-model:free")
    await app.search("Waiting for reset")
    await Bun.sleep(20)
    app.mockInput.pressEnter()
    const waiting = await app.frame("retry in")
    expect(waiting).toContain("waiting-model:free")
    await app.frame("No models are waiting", true, 4000)
    await Bun.sleep(20)
    app.mockInput.pressEnter()
    await app.search("waiting-model:free")
    await app.frame("waiting-model:free")
    app.mockInput.pressEnter()
    await app.frame("Cloud · recommended", false)
  } finally {
    app.renderer.destroy()
  }
}, 8000)

test("Cloud polls new cooldowns while open and stops polling when closed", async () => {
  await using tmp = await tmpdir()
  let calls = 0
  const app = await mount(tmp.path, (url) => {
    if (url.pathname === "/provider/cooldowns") {
      calls++
      return json(
        calls === 1 ? [] : [{ providerID: "openrouter", modelID: "waiting-model:free", downUntil: Date.now() + 60000 }],
      )
    }
  })
  try {
    await app.frame("Test provider · recommended")
    await app.frame("1 models", true, 6500)
    expect(calls).toBe(2)
    app.mockInput.pressEscape()
    await app.frame("Cloud · recommended", false)
    await Bun.sleep(5100)
    expect(calls).toBe(2)
  } finally {
    app.renderer.destroy()
  }
}, 13000)

for (const failure of ["http", "transport"] as const) {
  test(`Cloud remains usable after an availability ${failure} failure`, async () => {
    await using tmp = await tmpdir()
    const app = await mount(tmp.path, (url) => {
      if (url.pathname !== "/provider/cooldowns") return
      if (failure === "transport") throw new Error("offline")
      return json({ error: "unavailable" }, { status: 503 })
    })
    try {
      await app.frame("Availability check failed")
      expect(app.captureCharFrame()).toContain("Connect free providers")
      expect(app.captureCharFrame()).toContain("ready-model:free")
      app.mockInput.pressEscape()
      await app.frame("Cloud · recommended", false)
    } finally {
      app.renderer.destroy()
    }
  })
}

test("closing Cloud discards late availability responses", async () => {
  await using tmp = await tmpdir()
  const result = Promise.withResolvers<Response>()
  const app = await mount(tmp.path, (url) => {
    if (url.pathname === "/provider/cooldowns") return result.promise
  })
  try {
    await app.frame("Connect free providers")
    app.mockInput.pressEscape()
    await app.frame("Cloud · recommended", false)
    result.resolve(json([{ providerID: "openrouter", modelID: "waiting-model:free", downUntil: Date.now() + 60000 }]))
    await app.renderOnce()
    expect(app.captureCharFrame()).not.toContain("retry in")
  } finally {
    result.resolve(json([]))
    app.renderer.destroy()
  }
})

test("a failed recommendation does not hide known cooldowns", async () => {
  await using tmp = await tmpdir()
  const app = await mount(tmp.path, (url) => {
    if (url.pathname === "/onboarding/default") return json({ error: "unavailable" }, { status: 503 })
    if (url.pathname === "/provider/cooldowns")
      return json([{ providerID: "openrouter", modelID: "waiting-model:free", downUntil: Date.now() + 60000 }])
  })
  try {
    await app.frame("Availability check failed")
    await app.frame("1 models")
    await app.search("Waiting for reset")
    await Bun.sleep(20)
    app.mockInput.pressEnter()
    const frame = await app.frame("retry in")
    expect(frame).toContain("waiting-model:free")
  } finally {
    app.renderer.destroy()
  }
})

test("a preference write failure leaves the selected model usable and reports recovery", async () => {
  await using tmp = await tmpdir()
  await mkdir(`${tmp.path}/model.json`)
  const app = await mount(tmp.path, (url) => {
    if (url.pathname === "/provider/cooldowns") return json([])
  })
  try {
    await app.frame("ready-model:free")
    await app.search("ready-model:free")
    app.mockInput.pressEnter()
    await app.frame("Could not save model preferences")
    expect(app.current()).toEqual({ providerID: "openrouter", modelID: "ready-model:free" })
  } finally {
    app.renderer.destroy()
  }
})

test("recommendations show two from the top provider, one per other provider, and an expandable library", async () => {
  await using tmp = await tmpdir()
  const providers = [
    {
      ...provider,
      models: {
        ...provider.models,
        "extra-model:free": {
          ...provider.models["ready-model:free"],
          id: "extra-model:free",
          name: "extra-model:free",
          release_date: "2020-01-01",
        },
      },
    },
    ...[
      ["groq", ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]],
      ["mistral", ["codestral-latest", "mistral-small-latest"]],
    ].map(([id, ids]) => ({
      id,
      name: id,
      models: Object.fromEntries(
        (ids as string[]).map((model) => [
          model,
          { ...provider.models["ready-model:free"], id: model, name: model, providerID: id },
        ]),
      ),
    })),
  ]
  const app = await mount(tmp.path, (url) => {
    if (url.pathname === "/config/providers") return json({ providers, default: {} })
    if (url.pathname === "/provider")
      return json({ all: providers, connected: providers.map((p) => p.id), default: {} })
    if (url.pathname === "/provider/cooldowns") return json([])
  })
  try {
    const frame = await app.frame("Test provider · recommended")
    const names = ["waiting-model:free", "ready-model:free", "openai/gpt-oss-120b", "codestral-latest"]
    for (const name of names) expect(frame).toContain(name)
    expect(names.map((name) => frame.indexOf(name))).toEqual(
      names.map((name) => frame.indexOf(name)).sort((a, b) => a - b),
    )
    expect(frame).not.toContain("extra-model:free")
    expect(frame).not.toContain("openai/gpt-oss-20b")
    await app.search("All free models")
    await Bun.sleep(20)
    app.mockInput.pressEnter()
    await app.frame("Cloud · all free models")
    await app.search("extra-model:free")
    await app.frame("extra-model:free")
  } finally {
    app.renderer.destroy()
  }
})
