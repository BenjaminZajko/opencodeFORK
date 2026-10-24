import assert from "node:assert/strict"
import PackumentCache from "../../packages/core/node_modules/@npmcli/arborist/lib/packument-cache.js"
const cache = new PackumentCache()
assert.ok(Number.isSafeInteger(cache.maxSize) && cache.maxSize > 0)
assert.ok(cache.maxSize <= 64 * 1024 * 1024)
const metadata = { _contentLength: 1024, name: "olivecode-test" }
cache.set("test", metadata)
assert.equal(cache.get("test"), metadata)
cache.set("oversized", { _contentLength: 64 * 1024 * 1024 })
assert.equal(cache.has("oversized"), false)
assert.equal(cache.get("test"), metadata)
console.log("PASS: npm metadata cache has a finite memory budget and rejects oversized entries")
