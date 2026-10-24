import { expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { TerminalColors, RGBA } from "@opentui/core"
import { DEFAULT_THEMES, addTheme, allThemes, hasTheme, resolveTheme, terminalMode } from "../src/theme"
import { discoverThemes } from "../src/context/theme"
import { tmpdir } from "./fixture/fixture"

test("addTheme writes into module theme store", () => {
  const name = `plugin-theme-${Date.now()}`
  expect(addTheme(name, DEFAULT_THEMES.opencode)).toBe(true)
  expect(allThemes()[name]).toBeDefined()
})

test("addTheme keeps first theme for duplicate names", () => {
  const name = `plugin-theme-keep-${Date.now()}`
  const one = structuredClone(DEFAULT_THEMES.opencode)
  const two = structuredClone(DEFAULT_THEMES.opencode)
  one.theme.primary = "#101010"
  two.theme.primary = "#fefefe"

  expect(addTheme(name, one)).toBe(true)
  expect(addTheme(name, two)).toBe(false)
  expect(allThemes()[name]!.theme.primary).toBe("#101010")
})

test("addTheme ignores entries without a theme object", () => {
  const name = `plugin-theme-invalid-${Date.now()}`
  expect(addTheme(name, { defs: { a: "#ffffff" } })).toBe(false)
  expect(allThemes()[name]).toBeUndefined()
})

test("hasTheme checks theme presence", () => {
  const name = `plugin-theme-has-${Date.now()}`
  expect(hasTheme(name)).toBe(false)
  expect(addTheme(name, DEFAULT_THEMES.opencode)).toBe(true)
  expect(hasTheme(name)).toBe(true)
})

test("resolveTheme rejects circular color refs", () => {
  const item = structuredClone(DEFAULT_THEMES.opencode)
  item.defs = { ...item.defs, one: "two", two: "one" }
  item.theme.primary = "one"
  expect(() => resolveTheme(item, "dark")).toThrow("Circular color reference")
})

function terminalColors(defaultBackground: string | null, palette: Array<string | null> = []): TerminalColors {
  return {
    palette,
    defaultForeground: null,
    defaultBackground,
    cursorColor: null,
    mouseForeground: null,
    mouseBackground: null,
    tekForeground: null,
    tekBackground: null,
    highlightBackground: null,
    highlightForeground: null,
  }
}

test("terminalMode derives mode from refreshed background", () => {
  expect(terminalMode(terminalColors("#fbf1c7"))).toBe("light")
  expect(terminalMode(terminalColors("#1a1b26"))).toBe("dark")
})

test("terminalMode does not derive mode from ANSI slot zero", () => {
  expect(terminalMode(terminalColors(null, ["#000000"]))).toBeUndefined()
})

test("custom theme precedence follows directory order", async () => {
  await using tmp = await tmpdir()
  const global = path.join(tmp.path, "global")
  const project = path.join(tmp.path, "project")
  await mkdir(path.join(global, "themes"), { recursive: true })
  await mkdir(path.join(project, "themes"), { recursive: true })
  await writeFile(path.join(global, "themes", "custom.json"), JSON.stringify({ source: "global" }))
  await writeFile(path.join(project, "themes", "custom.json"), JSON.stringify({ source: "project" }))

  await expect(discoverThemes([global, project])).resolves.toEqual({ custom: { source: "project" } })
})

function luminance(color: RGBA) {
  return [color.r, color.g, color.b]
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
}

function contrast(a: RGBA, b: RGBA) {
  return (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)
}

for (const mode of ["dark", "light"] as const) {
  test(`OliveCode ${mode} theme keeps text, code, status and selections legible`, () => {
    const theme = resolveTheme(DEFAULT_THEMES.olivecode, mode)
    for (const fg of [
      "text",
      "textMuted",
      "primary",
      "secondary",
      "error",
      "warning",
      "success",
      "info",
      "syntaxKeyword",
      "syntaxFunction",
      "syntaxType",
    ] as const)
      for (const bg of ["background", "backgroundPanel", "backgroundElement"] as const)
        expect(contrast(theme[fg], theme[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    expect(contrast(theme.selectedListItemText, theme.primary)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(theme.diffAdded, theme.diffAddedBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(theme.diffRemoved, theme.diffRemovedBg)).toBeGreaterThanOrEqual(4.5)
  })
}
