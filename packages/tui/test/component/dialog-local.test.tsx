/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { mountDialog } from "../fixture/dialog"
import { json, type FetchHandler } from "../fixture/tui-sdk"
import { DialogLocal } from "../../src/component/dialog-local"

const mount = (root: string, fetch: FetchHandler) => mountDialog(root, () => <DialogLocal />, fetch)

for (const [width, height, clipped] of [[120, 30, true], [80, 20, true], [140, 50, false]] as const)
test(`Local shows a scroll cue only when needed in a ${width}×${height} terminal`, async () => {
  await using tmp = await tmpdir()
  const app = await mountDialog(
    tmp.path,
    () => <DialogLocal />,
    (url) => {
      if (url.pathname === "/onboarding/ollama")
        return json({
          installed: true,
          running: true,
          models: ["qwen2.5-coder:14b", "llama3.2:1b"],
          details: [
            { id: "qwen2.5-coder:14b", sizeGb: 9, cloud: false },
            { id: "llama3.2:1b", sizeGb: 1.3, cloud: false },
          ],
        })
      if (url.pathname === "/onboarding/recommendation")
        return json({
          profile: { cpu: "Apple M5", ramGb: 24, poolGb: 18 },
          reviewed: "2026-09-28",
          primaryLocal: {
            id: "qwen3.5:9b-q4_K_M",
            name: "Qwen 3.5 9B",
            variant: "Q4",
            kind: "local",
            needGb: 8.1,
            downloadGb: 6.6,
            fit: "comfortable",
          },
          alternates: [],
          catalog: [],
        })
    },
    { width, height },
  )
  try {
    const frame = await app.frame("Local models")
    expect(frame).not.toContain("More: Download")
    expect(frame.includes("↓")).toBe(clipped)
    if (!clipped) expect(frame).toContain("Delete models")
    await app.search("Delete models")
    await Bun.sleep(10)
    app.mockInput.pressEnter()
    await app.frame("Installed in Ollama")
  } finally {
    app.renderer.destroy()
  }
})

test("Local dialog leaves its animated loading state when Ollama responds", async () => {
  await using tmp = await tmpdir()
  const status = Promise.withResolvers<Response>()
  const recommendation = Promise.withResolvers<Response>()
  const requests = { status: 0, recommendation: 0 }
  const app = await mount(tmp.path, (url) => {
    if (url.pathname === "/onboarding/ollama") {
      requests.status++
      // Bound the original remount regression instead of exhausting native buffers.
      if (requests.status > 1) return new Promise<Response>(() => {})
      return status.promise
    }
    if (url.pathname === "/onboarding/recommendation") {
      requests.recommendation++
      return recommendation.promise
    }
  })
  try {
    await app.frame("Checking local setup")
    await Bun.sleep(120)
    status.resolve(json({ installed: true, models: ["qwen3:8b"] }))
    const frame = await app.frame("qwen3:8b")
    expect(frame).toContain("Detecting hardware")
    expect(frame).not.toContain("Checking local setup")
    expect(requests).toEqual({ status: 1, recommendation: 1 })
    await app.search("Download other models")
    await Bun.sleep(10)
    app.mockInput.pressEnter()
    await app.frame("Detecting hardware")
    await app.search("")
    recommendation.resolve(
      json({
        profile: {},
        primaryLocal: { id: "qwen3:8b", needGb: 6, fit: "comfortable" },
        alternates: [],
      }),
    )
    await app.frame("Recommended for this computer")
    await app.frame("Detecting hardware", false)
    expect(requests).toEqual({ status: 1, recommendation: 1 })
    app.mockInput.pressEscape()
    await app.frame("Local models", false)
  } finally {
    status.resolve(json({ installed: true, models: [] }))
    recommendation.resolve(json({ error: "unavailable" }, { status: 503 }))
    app.renderer.destroy()
  }
})

for (const failure of ["http", "transport"] as const) {
  test(`Local dialog settles after ${failure} errors`, async () => {
    await using tmp = await tmpdir()
    const app = await mount(tmp.path, (url) => {
      if (!url.pathname.startsWith("/onboarding/")) return
      if (failure === "transport") throw new Error("offline")
      return json({ error: "unavailable" }, { status: 503 })
    })
    try {
      await app.frame("Retry local setup")
      expect(app.captureCharFrame()).not.toContain("Checking local setup")
      expect(app.captureCharFrame()).not.toContain("Detecting hardware")
      app.mockInput.pressEscape()
      await app.frame("Local models", false)
    } finally {
      app.renderer.destroy()
    }
  })
}

test("Local dialog fetches fresh models once per open", async () => {
  await using tmp = await tmpdir()
  const requests = { status: 0, recommendation: 0 }
  const app = await mount(tmp.path, (url) => {
    if (url.pathname === "/onboarding/ollama") {
      requests.status++
      return json({ installed: true, models: [requests.status === 1 ? "first:8b" : "second:8b"] })
    }
    if (url.pathname === "/onboarding/recommendation") {
      requests.recommendation++
      return json({ error: "unavailable" }, { status: 503 })
    }
  })
  try {
    await app.frame("first:8b")
    expect(requests).toEqual({ status: 1, recommendation: 1 })
    app.mockInput.pressEscape()
    await app.frame("Local models", false)
    app.open()
    await app.frame("second:8b")
    expect(app.captureCharFrame()).not.toContain("first:8b")
    expect(requests).toEqual({ status: 2, recommendation: 2 })
  } finally {
    app.renderer.destroy()
  }
})

test("closing Local while loading does not reopen it on late responses", async () => {
  await using tmp = await tmpdir()
  const response = Promise.withResolvers<Response>()
  const app = await mount(tmp.path, (url) => {
    if (url.pathname.startsWith("/onboarding/")) return response.promise.then((res) => res.clone())
  })
  try {
    await app.frame("Checking local setup")
    app.mockInput.pressEscape()
    await app.frame("Checking local setup", false)
    response.resolve(json({ error: "unavailable" }, { status: 503 }))
    await Bun.sleep(30)
    await app.renderOnce()
    expect(app.captureCharFrame()).not.toContain("Local models")
  } finally {
    response.resolve(json({ error: "unavailable" }, { status: 503 }))
    app.renderer.destroy()
  }
})

test("Local dialog stops loading at the real request deadline", async () => {
  await using tmp = await tmpdir()
  const response = Promise.withResolvers<Response>()
  const requests: string[] = []
  const app = await mount(tmp.path, (url) => {
    if (!url.pathname.startsWith("/onboarding/")) return
    requests.push(url.pathname)
    return response.promise.then((res) => res.clone())
  })
  try {
    await app.frame("Checking local setup")
    await app.frame("Retry local setup", true, 12000)
    expect(app.captureCharFrame()).not.toContain("Checking local setup")
    expect(requests.sort()).toEqual(["/onboarding/ollama", "/onboarding/recommendation"])
    app.mockInput.pressEscape()
    await app.frame("Local models", false)
  } finally {
    response.resolve(json({ error: "unavailable" }, { status: 503 }))
    app.renderer.destroy()
  }
}, 15000)

test("download recommendations include the primary model and leave downloaded choices usable", async () => {
  await using tmp = await tmpdir()
  const recommendation = Promise.withResolvers<Response>()
  const app = await mount(tmp.path, (url) => {
    if (url.pathname === "/onboarding/ollama") return json({ installed: true, models: ["existing:8b"] })
    if (url.pathname === "/onboarding/recommendation") return recommendation.promise
  })
  try {
    await app.frame("existing:8b")
    await app.search("Download other models")
    await Bun.sleep(10)
    app.mockInput.pressEnter()
    await app.frame("Detecting hardware")
    await app.search("")
    recommendation.resolve(
      json({
        profile: { cpu: "Apple M5", ramGb: 24, poolGb: 18 },
        primaryLocal: { id: "recommended:8b", kind: "local", needGb: 6, fit: "comfortable" },
        alternates: [
          { id: "demanding:24b", kind: "local", needGb: 16, fit: "squeezed" },
          { id: "smaller:4b", kind: "local", needGb: 3, fit: "comfortable" },
        ],
        catalog: [
          { id: "demanding:24b", kind: "local", needGb: 16, fit: "squeezed", compatible: true },
          { id: "too-large:120b", kind: "local", needGb: 63, fit: "too-big", compatible: true },
        ],
      }),
    )
    await app.frame("recommended:8b")
    await app.frame("Larger model · demanding")
    expect(app.captureCharFrame()).toContain("demanding:24b")
    expect(app.captureCharFrame()).not.toContain("too-large:120b")
    expect(app.captureCharFrame()).toContain("~18 GB")
    await app.search("smaller:4b")
    await app.frame("smaller:4b")
    await app.search("Back to local models")
    await Bun.sleep(10)
    app.mockInput.pressEnter()
    await app.frame("existing:8b")
    expect(app.captureCharFrame()).not.toContain("Detecting hardware")
  } finally {
    recommendation.resolve(json({ error: "unavailable" }, { status: 503 }))
    app.renderer.destroy()
  }
})

for (const outcome of ["complete", "incomplete", "closed"] as const) {
  test(`local download handles a ${outcome} stream`, async () => {
    await using tmp = await tmpdir()
    const result = Promise.withResolvers<Response>()
    const model = {
      id: "new:8b",
      providerID: "ollama",
      name: "new:8b",
      variants: {},
      limit: { context: 32768, output: 4096 },
    }
    const app = await mount(tmp.path, (url) => {
      if (url.pathname === "/agent") return json([{ name: "build", mode: "primary", options: {}, permission: [] }])
      if (url.pathname === "/config/providers")
        return json({
          providers: [{ id: "ollama", name: "Ollama", models: { "new:8b": model } }],
          default: {},
        })
      if (url.pathname === "/onboarding/ollama") return json({ installed: true, models: [] })
      if (url.pathname === "/onboarding/recommendation")
        return json({
          profile: {},
          primaryLocal: { id: "new:8b", kind: "local", needGb: 6, fit: "comfortable" },
          alternates: [],
        })
      if (url.pathname === "/onboarding/local-model")
        return json({
          id: "new:8b",
          baseURL: "http://127.0.0.1:11434/v1",
          context: 4096,
          tools: true,
          reasoning: false,
          vision: false,
        })
      if (url.pathname === "/global/config") return json({})
      if (url.pathname === "/instance/dispose") return json(true)
      if (url.pathname === "/onboarding/pull") return result.promise
    })
    const response = () =>
      new Response(
        outcome === "incomplete" ? "data: pulling manifest\n\n" : 'data: pulling manifest\n\ndata: {"done":true}\n\n',
        { headers: { "content-type": "text/event-stream" } },
      )
    try {
      await app.frame("Download other models")
      await app.search("Download other models")
      await Bun.sleep(10)
      app.mockInput.pressEnter()
      await app.frame("Local · recommended downloads")
      await Bun.sleep(30)
      await app.search("")
      await app.frame("new:8b")
      await app.search("new:8b")
      await Bun.sleep(10)
      app.mockInput.pressEnter()
      await app.frame("Pulling new:8b")
      if (outcome === "closed") {
        app.mockInput.pressEscape()
        await app.frame("Pulling new:8b", false)
        app.open()
        await app.frame("Local models")
      }
      result.resolve(response())
      if (outcome === "complete") {
        await app.frame("Pulling new:8b", false)
        expect(app.current()).toEqual({ providerID: "ollama", modelID: "new:8b" })
      }
      if (outcome === "incomplete") {
        await app.frame("Pulling new:8b", false)
        expect(app.captureCharFrame()).toContain("Download stream ended")
      }
      if (outcome === "closed") {
        // Let the late stream arrive after a different dialog mounted.
        await Bun.sleep(30)
        await app.renderOnce()
        expect(app.captureCharFrame()).toContain("Local models")
      }
    } finally {
      result.resolve(response())
      app.renderer.destroy()
    }
  })
}

for (const failure of [false, true])
  test(`delete screen only removes a chosen installed tag (failure=${failure})`, async () => {
    await using tmp = await tmpdir()
    let deleted = false
    let deletes = 0
    const app = await mount(tmp.path, (url) => {
      if (url.pathname === "/onboarding/ollama")
        return json({
          installed: true,
          running: true,
          models: deleted ? [] : ["local:8b"],
          details: [
            ...(!deleted ? [{ id: "local:8b", sizeGb: 5, cloud: false }] : []),
            { id: "remote:cloud", sizeGb: 0, cloud: true },
          ],
        })
      if (url.pathname === "/onboarding/recommendation")
        return json({
          profile: { cpu: "Apple M5", ramGb: 24, poolGb: 18 },
          alternates: [],
          catalog: [],
          reviewed: "2026-09-28",
        })
      if (url.pathname === "/onboarding/local-model") {
        deletes++
        if (failure) return json({ data: { message: "Ollama refused deletion" } }, { status: 400 })
        deleted = true
        return json(true)
      }
    })
    try {
      await app.frame("local:8b")
      expect(app.captureCharFrame()).not.toContain("remote:cloud")
      await app.search("Delete models")
      await Bun.sleep(10)
      app.mockInput.pressEnter()
      await app.frame("Installed in Ollama")
      expect(app.captureCharFrame()).not.toContain("remote:cloud")
      expect(deletes).toBe(0)
      await Bun.sleep(30)
      await app.search("local:8b")
      await app.frame("Back to local models", false)
      await Bun.sleep(10)
      app.mockInput.pressEnter()
      await app.frame(failure ? "Ollama refused deletion" : "No downloaded models to delete")
      expect(deletes).toBe(1)
      expect(deleted).toBe(!failure)
    } finally {
      app.renderer.destroy()
    }
  })
