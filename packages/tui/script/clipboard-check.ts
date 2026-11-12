// Copy then paste through OliveCode's real clipboard code (CI: Linux without
// xclip/wl-clipboard, and Windows). Exits non-zero when the text does not round-trip.
import { read, write } from "../src/clipboard"

const text = `OliveCode clipboard ${Date.now()} sk-test-ÄÖü`
await write(text)
const pasted = await read()
console.log("read back:", JSON.stringify(pasted))
if (pasted?.mime !== "text/plain" || pasted.data !== text) {
  console.error("Clipboard round trip failed")
  process.exit(1)
}
console.log("Clipboard copy and paste passed on", process.platform)
process.exit(0)
