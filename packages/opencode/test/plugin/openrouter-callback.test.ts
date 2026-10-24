import { expect, test } from "bun:test"
import { openRouterCallback } from "../../src/plugin/openrouter-callback"

test("callback only accepts a GET at the unguessable callback path", async () => {
  const callback = openRouterCallback()
  try {
    const url = new URL(callback.url)
    expect(url.hostname).toBe("127.0.0.1")
    expect(url.pathname.split("/").at(-1)?.length).toBe(48)
    expect((await fetch(new URL("/callback/wrong", url))).status).toBe(404)
    expect((await fetch(url, { method: "POST" })).status).toBe(404)
    expect((await fetch(url)).status).toBe(400)
    url.searchParams.set("code", "private-authorization-code")
    const response = await fetch(url)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.text()).not.toContain("private-authorization-code")
    expect(await callback.code).toBe("private-authorization-code")
    await expect(fetch(url)).rejects.toThrow()
  } finally {
    callback.close()
  }
})

test("denial closes the callback without yielding a code", async () => {
  const callback = openRouterCallback()
  try {
    const url = new URL(callback.url)
    url.searchParams.set("error", "access_denied")
    const response = await fetch(url)
    expect(await response.text()).toContain("cancelled")
    expect(await callback.code).toBeUndefined()
  } finally {
    callback.close()
  }
})

test("abandoned browser authorization expires and releases its port", async () => {
  const callback = openRouterCallback(25)
  expect(await callback.code).toBeUndefined()
  await expect(fetch(callback.url)).rejects.toThrow()
})

test("cancellation is idempotent and settles a waiting callback", async () => {
  const callback = openRouterCallback()
  callback.close()
  callback.close()
  expect(await callback.code).toBeUndefined()
})
