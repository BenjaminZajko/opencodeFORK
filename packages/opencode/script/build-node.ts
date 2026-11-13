#!/usr/bin/env bun

import { Script } from "@opencode-ai/script"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const generated = await import("./generate.ts")

// Bundled modules lose their source-relative paths. Embed the same native
// adapters as the terminal build rather than resolving them inside Electron.
const desktopHelper = process.platform === "darwin" ? await (async () => {
  const file = path.join(dir, "dist", "node", "desktop-helper")
  await Bun.$`mkdir -p ${path.dirname(file)}`
  await Bun.$`swiftc -module-cache-path /tmp/olivecode-swift-cache -O -parse-as-library -target ${process.arch === "arm64" ? "arm64" : "x86_64"}-apple-macosx14.0 src/computer/native/desktop.swift -o ${file}`
  return Buffer.from(await Bun.file(file).arrayBuffer()).toString("base64")
})() : ""


const result = await Bun.build({
  target: "node",
  entrypoints: ["./src/node.ts"],
  outdir: "./dist/node",
  format: "esm",
  sourcemap: "linked",
  external: ["jsonc-parser", "@lydell/node-pty"],
  define: {
    OLIVECODE_DESKTOP_HELPER: JSON.stringify(desktopHelper),
    OLIVECODE_WINDOWS_DESKTOP: JSON.stringify(Buffer.from(await Bun.file("src/computer/native/desktop-windows.ps1").arrayBuffer()).toString("base64")),
    OLIVECODE_LINUX_DESKTOP: JSON.stringify(Buffer.from(await Bun.file("src/computer/native/desktop-linux.py").arrayBuffer()).toString("base64")),
    OPENCODE_MODELS_DEV: generated.modelsData,
    OPENCODE_VERSION: `'${Script.version}'`,
    OPENCODE_CHANNEL: `'${Script.channel}'`,
  },
  files: {
    "opencode-web-ui.gen.ts": "",
  },
})

if (!result.success) throw new AggregateError(result.logs, "Desktop engine build failed")
console.log("Build complete")
