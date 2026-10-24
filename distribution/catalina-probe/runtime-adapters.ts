import { createRequire, isBuiltin } from "node:module"
import "core-js/actual/map/group-by.js"
import { ChildProcess } from "node:child_process"
import { TextDecoder as CompatibleTextDecoder } from "@kayahr/text-encoding"
import "core-js/actual/iterator/index.js"
import { Statement } from "bun:sqlite"
import stringWidth from "string-width"
globalThis.TextDecoder = CompatibleTextDecoder
if (typeof Bun.stringWidth !== "function") Bun.stringWidth = stringWidth
// Never pretend that the old database can return full-width SQLite integers.
if (typeof Statement.prototype.safeIntegers !== "function") {
  Statement.prototype.safeIntegers = function (enabled = true) {
    if (enabled) throw new Error("64-bit SQLite integer mode is unavailable in this experimental runtime")
    return this
  }
}
if (typeof AbortSignal.any !== "function") {
  AbortSignal.any = function (signals) {
    const source = Array.from(signals)
    if (!source.every((signal) => signal instanceof AbortSignal)) throw new TypeError("Expected AbortSignal values")
    const controller = new AbortController()
    const cleanup = () => source.forEach((signal) => signal.removeEventListener("abort", onAbort))
    const onAbort = (event) => {
      cleanup()
      controller.abort(event.target.reason)
    }
    for (const signal of source) {
      if (signal.aborted) {
        cleanup()
        controller.abort(signal.reason)
        return controller.signal
      }
      signal.addEventListener("abort", onAbort, { once: true })
    }
    return controller.signal
  }
}
if (typeof globalThis.TextDecoderStream === "undefined")
  globalThis.TextDecoderStream = class extends TransformStream {
    #decoder
    constructor(label = "utf-8", options = {}) {
      const decoder = new TextDecoder(label, options)
      super({
        transform(chunk, controller) {
          const text = decoder.decode(chunk, { stream: true })
          if (text) controller.enqueue(text)
        },
        flush(controller) {
          const text = decoder.decode()
          if (text) controller.enqueue(text)
        },
      })
      this.#decoder = decoder
    }
    get encoding() {
      return this.#decoder.encoding
    }
    get fatal() {
      return this.#decoder.fatal
    }
    get ignoreBOM() {
      return this.#decoder.ignoreBOM
    }
  }

// Bun 1.0.14 does not emit Node's spawn event; the shared process layer waits for it.
if (Bun.version === "1.0.14") {
  const original = ChildProcess.prototype.spawn
  ChildProcess.prototype.spawn = function (...args) {
    const result = original.apply(this, args)
    if (typeof this.pid === "number" && this.pid > 0) queueMicrotask(() => this.emit("spawn"))
    return result
  }
}

if (typeof process.getBuiltinModule !== "function") {
  const requireBuiltin = createRequire(import.meta.url)
  process.getBuiltinModule = function (id) {
    if (typeof id !== "string") throw new TypeError("Builtin module id must be a string")
    return isBuiltin(id) ? requireBuiltin(id) : undefined
  }
}
