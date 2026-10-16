import { afterEach, describe, it, expect } from "bun:test"
import os from "os"
import path from "path"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import {
  findOllamaBinary,
  ollamaStatus,
  inspectOllamaModel,
  deleteOllamaModel,
  ollamaBaseURL,
  listOllamaModels,
  ollamaInstallGuidance,
  parseOllamaList,
  pullOllamaModel,
} from "../../src/onboarding/ollama"

// Port of the OliveCode installer-test approach: a fake `ollama` shell
// script on a prepended PATH stands in for the real binary.

const dirs: string[] = []
const savedPath = process.env["PATH"]

afterEach(() => {
  process.env["PATH"] = savedPath
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function fakeBin(script: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ollama-test-"))
  dirs.push(dir)
  const file = path.join(dir, "ollama")
  writeFileSync(file, `#!/bin/sh\n${script}\n`)
  chmodSync(file, 0o755)
  process.env["PATH"] = `${dir}${path.delimiter}${savedPath ?? ""}`
  return file
}

describe("parseOllamaList", () => {
  it("parses names skipping the header", () => {
    const out = `NAME                    ID              SIZE      MODIFIED
qwen2.5-coder:7b        abc123          4.7 GB    2 hours ago
llama3.1:8b             def456          4.9 GB    3 days ago
`
    expect(parseOllamaList(out)).toEqual(["qwen2.5-coder:7b", "llama3.1:8b"])
  })

  it("returns empty without rows", () => {
    expect(parseOllamaList("NAME ID SIZE MODIFIED\n")).toEqual([])
    expect(parseOllamaList("")).toEqual([])
  })
})

describe("findOllamaBinary", () => {
  it("finds a fake binary on PATH", async () => {
    const file = fakeBin("exit 0")
    expect(await findOllamaBinary()).toBe(file)
  })

  it("returns undefined when absent", async () => {
    const empty = mkdtempSync(path.join(os.tmpdir(), "ollama-empty-"))
    dirs.push(empty)
    expect(await findOllamaBinary(empty, [])).toBeUndefined()
  })
})

describe("listOllamaModels", () => {
  it("lists models from a fake binary", async () => {
    const file = fakeBin('printf "NAME ID\\nqwen2.5-coder:7b abc\\n"')
    expect(await listOllamaModels(file)).toEqual(["qwen2.5-coder:7b"])
  })

  it("returns empty on nonzero exit", async () => {
    const file = fakeBin("exit 1")
    expect(await listOllamaModels(file)).toEqual([])
  })

  it("kills a hung binary after the timeout", async () => {
    const file = fakeBin("sleep 30")
    expect(await listOllamaModels(file, 50)).toEqual([])
  })
})

describe("pullOllamaModel", () => {
  it("streams progress lines then succeeds", async () => {
    const file = fakeBin('echo "pulling manifest" >&2; echo "success" >&2')
    const lines: string[] = []
    const result = await pullOllamaModel(file, "qwen2.5-coder:7b", (line) => lines.push(line))
    expect(result).toEqual({ ok: true })
    expect(lines).toEqual(["pulling manifest", "success"])
  })

  it("reports nonzero exits", async () => {
    const file = fakeBin('echo "boom" >&2; exit 1')
    const result = await pullOllamaModel(file, "nope", () => {})
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe("ollamaInstallGuidance", () => {
  it("names ollama for this platform", () => {
    expect(ollamaInstallGuidance().toLowerCase()).toContain("ollama")
  })
})

describe("Ollama local API", () => {
  it("distinguishes local downloads from shortcuts and deletes exactly the requested tag", async () => {
    const original = globalThis.fetch
    const host = process.env.OLLAMA_HOST
    process.env.OLLAMA_HOST = "http://127.0.0.1:11434"
    const deletions: string[] = []
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/tags"))
        return Response.json({
          models: [
            { name: "qwen:8b", size: 5000000000, details: { quantization_level: "Q4_K_M" } },
            { name: "remote:cloud", size: 340 },
          ],
        })
      if (url.endsWith("/show"))
        return Response.json({
          capabilities: ["completion", "tools"],
          parameters: "num_ctx 8192",
          model_info: { "qwen.context_length": 32768 },
        })
      if (url.endsWith("/delete")) {
        expect(init?.method).toBe("DELETE")
        deletions.push(JSON.parse(String(init?.body)).model)
        return new Response(null)
      }
      throw new Error("Unexpected request")
    }) as typeof fetch
    try {
      const status = await ollamaStatus()
      expect(status.models).toEqual(["qwen:8b"])
      expect(status.details[1].cloud).toBe(true)
      expect(await inspectOllamaModel("qwen:8b")).toMatchObject({ context: 8192, tools: true, reasoning: false })
      await expect(inspectOllamaModel("remote:cloud")).rejects.toThrow("cloud shortcut")
      await expect(deleteOllamaModel("missing:8b")).rejects.toThrow("no longer installed")
      await expect(deleteOllamaModel("remote:cloud")).rejects.toThrow("cloud shortcut")
      expect(deletions).toEqual([])
      expect(await deleteOllamaModel("qwen:8b")).toBe(true)
      expect(deletions).toEqual(["qwen:8b"])
    } finally {
      globalThis.fetch = original
      if (host === undefined) delete process.env.OLLAMA_HOST
      else process.env.OLLAMA_HOST = host
    }
  })
  it("rejects remote Ollama hosts for local operations", () => {
    const host = process.env.OLLAMA_HOST
    try {
      process.env.OLLAMA_HOST = "https://ollama.com"
      expect(ollamaBaseURL).toThrow("loopback")
    } finally {
      if (host === undefined) delete process.env.OLLAMA_HOST
      else process.env.OLLAMA_HOST = host
    }
  })
})
