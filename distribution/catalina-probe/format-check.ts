import "./runtime-adapters.ts"
import assert from "node:assert/strict"
import { isMainThread, parentPort, Worker } from "node:worker_threads"

function check() {
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
  assert.equal(money.format(1234.5), "$1,234.50")
  assert.equal(money.format(-0.01), "-$0.01")
  assert.equal(money.format(0), "$0.00")
  assert.equal(new Intl.NumberFormat("en-US", { notation: "compact" }).format(1200), "1.2K")
  assert.equal(new Intl.NumberFormat("en-US", { style: "percent" }).format(0.42), "42%")
  assert.equal((1234.5).toLocaleString("en-US"), "1,234.5")
  assert.equal(new Intl.NumberFormat("sk-SK").format(1234.5).replace(/\s/g, " "), "1 234,5")
  assert.equal(money.formatToParts(1.25).find((part) => part.type === "fraction")?.value, "25")
  assert.ok(money.formatRange(1, 2).includes("1.00"))
  assert.ok(money.formatRangeToParts(1, 2).some((part) => part.source === "endRange"))
  assert.throws(() => money.formatRange(NaN, 1), RangeError)
  assert.throws(() => new Intl.NumberFormat("en", { style: "currency", currency: "invalid" }), RangeError)
  assert.equal(new Intl.PluralRules("en").select(2), "other")
  assert.equal(new Intl.ListFormat("en-US", { type: "disjunction" }).format(["one", "two"]), "one or two")
  assert.equal(new Intl.Collator("en", { numeric: true }).compare("2", "10"), -1)
  assert.equal(new Intl.Locale("sk-SK").language, "sk")
  assert.equal(Array.from(new Intl.Segmenter("en", { granularity: "grapheme" }).segment("🫒a")).length, 2)
  assert.ok(new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" }).format(new Date(0)).includes("1970"))
  return "currency, compact counts, percentages, Slovak formatting, number ranges and interface Intl helpers"
}

if (!isMainThread) {
  parentPort!.postMessage(check())
} else {
  const result = check()
  const worker = new Worker(new URL(import.meta.url))
  const reported = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.terminate()
      reject(Error("Formatting worker timed out"))
    }, 10000)
    worker.once("message", (value) => {
      clearTimeout(timeout)
      resolve(value)
    })
    worker.once("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
  await worker.terminate()
  assert.equal(reported, result)
  console.log("PASS: " + result + " in main and worker threads")
}
