import { transform } from "esbuild"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
const dir = import.meta.dir
const source = process.env.OLIVECODE_PROBE_SOURCE ?? resolve(dir, "../../packages/opencode")
const plugin = await import(pathToFileURL(Bun.resolveSync("@opentui/solid/bun-plugin", source)).href)
const output = dir + "/output"
const result = await Bun.build({
  entrypoints: [
    source + "/src/index.ts",
    source + "/src/cli/tui/worker.ts",
    dir + "/syntax-check.ts",
    dir + "/npm-cache-check.ts",
  ],
  tsconfig: source + "/tsconfig.json",
  plugins: [
    plugin.createSolidTransformPlugin(),
    {
      name: "bounded-legacy-npm-cache",
      setup(build) {
        build.onLoad({ filter: /[\\/]@npmcli[\\/]arborist[\\/]lib[\\/]packument-cache\.js$/ }, async (args) => {
          const code = await Bun.file(args.path).text()
          const needle = "static #heapLimit = Math.floor(getHeapStatistics().heap_size_limit)"
          if (!code.includes(needle)) throw Error("Npm cache compatibility seam changed; re-audit required")
          return {
            loader: "js",
            contents: code.replace(
              needle,
              "static #heapLimit = (()=>{const limit=getHeapStatistics().heap_size_limit; return Number.isFinite(limit)&&limit>0 ? Math.floor(limit):256*1024*1024})()",
            ),
          }
        })
      },
    },
  ],
  target: "bun",
  conditions: ["bun", "node"],
  format: "esm",
  outdir: output,
  naming: "[name].js",
  external: [
    "node-gyp",
    ...["darwin-arm64", "linux-x64-musl", "linux-x64", "linux-arm64-musl", "linux-arm64", "win32-x64", "win32-arm64"]
      .filter((target) => target !== `darwin-${process.arch}`)
      .map((target) => `@opentui/core-${target}`),
  ],
  define: {
    OPENCODE_VERSION: JSON.stringify("0.1.0-catalina-probe"),
    OPENCODE_CHANNEL: JSON.stringify("olivecode-compat-probe"),
    OPENCODE_MODELS_DEV: "{}",
    OTUI_TREE_SITTER_WORKER_PATH: JSON.stringify("__LEGACY_PARSER_WORKER__"),
    OPENCODE_WORKER_PATH: JSON.stringify("__LEGACY_APP_WORKER__"),
    OLIVECODE_DESKTOP_HELPER: JSON.stringify(""),
    OLIVECODE_VM_MANAGER: JSON.stringify(""),
    FFF_LIBC: JSON.stringify("gnu"),
    OPENCODE_LIBC: JSON.stringify(""),
  },
})
if (!result.success) throw new AggregateError(result.logs)
const assets = result.outputs.filter((x) => x.kind === "asset").map((x) => x.path.split("/").at(-1)!)
const parser = assets.find((x) => x.startsWith("parser.worker") && x.endsWith(".js"))
if (!parser) throw Error("Parser worker asset not emitted")
for (const [input, name] of [
  ["index.js", "legacy.js"],
  ["worker.js", "worker-legacy.js"],
  ["syntax-check.js", "syntax-legacy.js"],
  ["npm-cache-check.js", "npm-cache-legacy.js"],
]) {
  let code = await Bun.file(output + "/" + input).text()
  for (const asset of assets)
    code = code.replaceAll(
      JSON.stringify("./" + asset),
      "__legacyFileURLToPath(new URL(" + JSON.stringify("./" + asset) + ",import.meta.url))",
    )
  code = code
    .replaceAll('"__LEGACY_APP_WORKER__"', '__legacyFileURLToPath(new URL("./worker-bootstrap.js",import.meta.url))')
    .replaceAll(
      '"__LEGACY_PARSER_WORKER__"',
      "__legacyFileURLToPath(new URL(" + JSON.stringify("./parser-bootstrap.js") + ",import.meta.url))",
    )
  const lowered = await transform('import {fileURLToPath as __legacyFileURLToPath} from "node:url";\n' + code, {
    target: "es2022",
    format: "esm",
    loader: "js",
    minifyWhitespace: true,
  })
  await Bun.write(
    output + "/" + name,
    lowered.code
      .replaceAll("import.meta.dirname", "import.meta.dir")
      .replaceAll("import.meta.filename", "import.meta.path"),
  )
}
const boot = await Bun.build({
  entrypoints: [
    dir + "/bootstrap.ts",
    dir + "/worker-bootstrap.ts",
    dir + "/runtime-adapters-test.ts",
    dir + "/parser-bootstrap.ts",
  ],
  target: "bun",
  format: "esm",
  outdir: output,
})
if (!boot.success) throw new AggregateError(boot.logs)
await Bun.write(
  output + "/olivecode-probe",
  '#!/bin/sh\nprobe_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\n. "$probe_dir/timezone-env.sh"\nexec "$probe_dir/../runtime/bun" --no-install "$probe_dir/bootstrap.js" "$@"\n',
)
await Bun.$`chmod +x ${output + "/olivecode-probe"}`
console.log(
  "Built diagnostic compatibility bundle; original native assets retained for architecture comparison, not Catalina certification.",
)

await Bun.write(
  output + "/parser-bootstrap.js",
  (await Bun.file(output + "/parser-bootstrap.js").text()).replaceAll("__PARSER_ASSET__", "./" + parser),
)

await Bun.write(output + "/timezone-env.sh", Bun.file(dir + "/timezone-env.sh"))
