import { app } from "electron"
import { createUsageReporter, measurementEndpoint } from "../../../core/src/olivecode/usage"
import { getStore } from "./store"

// The reporting service receives only the minimal daily payload documented in
// Privacy. No report is sent until the user explicitly enables measurement.
export function createDesktopUsage() {
  const storage = getStore("olivecode.usage")
  const report = createUsageReporter({
    storage,
    endpoint: measurementEndpoint,
    version: app.getVersion(),
    platform: process.platform,
  })
  let abort = new AbortController()
  const timer = setInterval(() => void report(abort.signal), 15 * 60_000)
  timer.unref()
  void report(abort.signal)
  app.once("will-quit", () => {
    abort.abort()
    clearInterval(timer)
  })
  return {
    get: () => storage.get("olivecode_usage_metrics") === true,
    set: (enabled: boolean) => {
      if (typeof enabled !== "boolean") throw new Error("Invalid usage preference")
      abort.abort()
      abort = new AbortController()
      storage.set("olivecode_usage_metrics", enabled)
      if (enabled) void report(abort.signal)
      return enabled
    },
  }
}
