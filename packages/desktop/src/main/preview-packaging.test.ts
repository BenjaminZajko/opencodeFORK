import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import config from "../../electron-builder.config"

test("Linux preview uses a safe executable name and matching desktop identity", () => {
  const name = config.linux?.executableName
  expect(typeof name).toBe("string")
  expect(name).toMatch(/^[A-Za-z0-9._ -]+$/)
  expect(config.extraMetadata?.desktopName).toBe(`${name}.desktop`)
  expect(config.linux?.syncDesktopName).toBe(true)
})

test("a custom Electron distribution is used only when it exists", () => {
  if (typeof config.electronDist === "string") expect(existsSync(config.electronDist)).toBe(true)
  else expect(config.electronDist).toBeUndefined()
})
