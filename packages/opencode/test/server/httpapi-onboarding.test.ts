import { afterEach, describe, expect, test } from "bun:test"
import { Context } from "effect"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"

const context = Context.empty() as Context.Context<unknown>

function get(route: string, directory: string) {
  return HttpApiApp.webHandler().handler(
    new Request(`http://localhost${route}`, {
      headers: { "x-opencode-directory": directory },
    }),
    context,
  )
}

function post(route: string, directory: string, body: unknown) {
  return HttpApiApp.webHandler().handler(
    new Request(`http://localhost${route}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-opencode-directory": directory,
      },
      body: JSON.stringify(body),
    }),
    context,
  )
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("onboarding HttpApi", () => {
  test("serves ollama status", async () => {
    await using tmp = await tmpdir({ config: { formatter: false, lsp: false } })
    const response = await get("/onboarding/ollama", tmp.path)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { installed: boolean; models: string[] }
    expect(typeof body.installed).toBe("boolean")
    expect(Array.isArray(body.models)).toBe(true)
  })

  test("serves a recommendation with primary picks", async () => {
    await using tmp = await tmpdir({ config: { formatter: false, lsp: false } })
    const response = await get("/onboarding/recommendation", tmp.path)
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      primary: "local" | "cloud" | null
      explanation: string
      alternates: unknown[]
    }
    expect(["local", "cloud", null]).toContain(body.primary)
    expect(body.explanation.trim()).toBeTruthy()
    expect(Array.isArray(body.alternates)).toBe(true)
  })

  test("resolves the ranked default for connected providers", async () => {
    await using tmp = await tmpdir({ config: { formatter: false, lsp: false } })
    const response = await post("/onboarding/default", tmp.path, { connected: ["openrouter"] })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      providerID: "openrouter",
      modelID: "poolside/laguna-s-2.1:free",
    })
  })
})
