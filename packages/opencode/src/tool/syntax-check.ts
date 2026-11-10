import path from "path"

// Instant syntax feedback after edit/write, for when no language server is
// running (the common case for free users). Small models otherwise discover a
// broken edit only later through a failing test run and edit the wrong lines.
export async function syntaxProblem(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  const name = path.basename(filePath).toLowerCase()
  const content = await Bun.file(filePath).text().catch(() => undefined)
  if (content === undefined || content.length > 2_000_000) return
  if (ext === ".json" && !name.startsWith("tsconfig") && !name.startsWith("jsconfig")) return jsonProblem(content)
  if (ext === ".py") return pythonProblem(filePath, content)
  const loader = ({ ".ts": "ts", ".mts": "ts", ".cts": "ts", ".tsx": "tsx", ".js": "js", ".mjs": "js", ".cjs": "js", ".jsx": "jsx" } as const)[ext]
  if (loader) return scriptProblem(loader, content)
}

function jsonProblem(content: string) {
  try {
    JSON.parse(content)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

function scriptProblem(loader: "ts" | "tsx" | "js" | "jsx", content: string) {
  try {
    new Bun.Transpiler({ loader }).transformSync(content)
  } catch (error) {
    return (error instanceof Error ? error.message : String(error)).split("\n").slice(0, 3).join("\n")
  }
}

async function pythonProblem(filePath: string, content: string) {
  const proc = (() => {
    try {
      return Bun.spawn(["python3", "-c", "import ast,sys; ast.parse(sys.stdin.read(), sys.argv[1])", filePath], {
        stdin: new Blob([content]),
        stdout: "ignore",
        stderr: "pipe",
      })
    } catch {
      return undefined // python3 is not installed
    }
  })()
  if (!proc) return
  const timer = setTimeout(() => proc.kill(), 3000)
  const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()])
  clearTimeout(timer)
  if (code === 0) return
  const lines = stderr.trim().split("\n")
  // Keep the location, the offending line and the error, not the traceback.
  const start = lines.findIndex((line) => line.trimStart().startsWith(`File "${filePath}"`))
  return (start >= 0 ? lines.slice(start) : lines.slice(-4)).join("\n").trim() || undefined
}
