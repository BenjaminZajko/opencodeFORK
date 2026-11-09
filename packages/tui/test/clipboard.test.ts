import { expect, test } from "bun:test"
import { copyCommand, copyUsing, supportsOsc52 } from "../src/clipboard"

test("prefers Wayland clipboard when available", () => {
  expect(copyCommand("linux", true, (name) => name === "wl-copy")).toEqual(["wl-copy"])
})

test("uses stdin-based pbcopy on macOS", () => {
  expect(copyCommand("darwin", false, (name) => name === "pbcopy")).toEqual(["pbcopy"])
})

test("failed native copies try another backend without swallowing total failure", async () => {
  const calls: string[] = []
  const text = 'Žilina 🫒\n"quotes" `$(literal)`'
  await copyUsing(text, {
    os: "linux", wayland: true, has: (name) => ["wl-copy", "xclip"].includes(name),
    run: async (binary, _args, input) => { expect(input).toBe(text); calls.push(binary); if (binary === "wl-copy") throw new Error("Compositor refused clipboard") },
    fallback: async () => { throw new Error("Must not reach fallback") },
  })
  expect(calls).toEqual(["wl-copy", "xclip"])
  await expect(copyUsing(text, {
    os: "linux", wayland: true, has: () => false, run: async () => {},
    fallback: async () => { throw new Error("Unavailable") }, terminal: () => false,
  })).rejects.toThrow("Selected text was kept")
})

test("Ubuntu can use its GTK clipboard when command-line clipboard packages are absent", async () => {
  const writes: string[] = []
  await copyUsing("exact\ntext 🫒", {
    os: "linux", wayland: true, has: () => false, run: async () => {},
    gtk: async (text) => { writes.push(text) }, fallback: async () => { throw new Error("Unexpected") },
  })
  expect(writes).toEqual(["exact\ntext 🫒"])
})

test("GNOME/VTE is never treated as a successful OSC52 clipboard", () => {
  expect(supportsOsc52({ VTE_VERSION: "7800", TERM: "xterm-256color" })).toBe(false)
  expect(supportsOsc52({ VTE_VERSION: "7800", OLIVECODE_OSC52: "1" })).toBe(false)
  expect(supportsOsc52({ TERM_PROGRAM: "WezTerm" })).toBe(true)
  expect(supportsOsc52({ TERM: "xterm-256color" })).toBe(false)
})

test("falls back through X11 clipboard commands", () => {
  expect(copyCommand("linux", true, (name) => name === "xclip")).toEqual(["xclip", "-selection", "clipboard"])
  expect(copyCommand("linux", false, (name) => name === "xsel")).toEqual(["xsel", "--clipboard", "--input"])
})

test("returns undefined when native clipboard is unavailable", () => {
  expect(copyCommand("linux", false, () => false)).toBeUndefined()
})
