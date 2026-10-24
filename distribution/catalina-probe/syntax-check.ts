import "./runtime-adapters.ts"
import { TreeSitterClient } from "../../packages/opencode/node_modules/@opentui/core/index.bun.js"
const client = new TreeSitterClient({ dataPath: process.argv[2], initTimeout: 5000 })
try {
  await client.initialize()
  const result = await client.highlightOnce("const olive = 42;\nconsole.log(olive);", "javascript")
  if (result.error || !result.highlights?.length) throw Error(result.error ?? "No syntax highlights produced")
  console.log("PASS: parser worker initialized and JavaScript syntax highlights produced", result.highlights.length)
} catch (error) {
  console.error("SYNTAX_ERROR:", error?.message)
  process.exitCode = 1
} finally {
  await client.destroy()
}
