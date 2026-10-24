import path from "node:path"
import { mkdir, mkdtemp, copyFile, chmod, rm, cp } from "node:fs/promises"

// Package the already-built, smoke-tested binary. This never publishes a release.
if (process.platform !== "darwin" || process.arch !== "arm64")
  throw new Error("This packaging script currently supports macOS Apple Silicon only.")

const root = path.resolve(import.meta.dir, "..")
const dist = path.join(root, "packages/opencode/dist")
const source = path.join(dist, "opencode-darwin-arm64/bin/opencode")
const version = Bun.spawn([source, "--version"], { stdout: "pipe", stderr: "pipe" })
const label = (await new Response(version.stdout).text()).trim()
if ((await version.exited) !== 0 || !/^0\.0\.0-olivecode-dev-[0-9]+$/.test(label))
  throw new Error("Build and verify an olivecode-dev executable before packaging.")

// A stable, OliveCode-named executable for the workspace launcher.
const local = path.join(dist, "olivecode/bin/olivecode")
await mkdir(path.dirname(local), { recursive: true })
await copyFile(source, local)
await chmod(local, 0o755)

const staging = await mkdtemp(path.join(dist, "olivecode-package-"))
const folder = path.join(staging, "OliveCode-macOS-arm64")
await mkdir(path.join(folder, "bin"), { recursive: true })
await copyFile(source, path.join(folder, "bin/olivecode"))
await chmod(path.join(folder, "bin/olivecode"), 0o755)
await copyFile(path.join(root, "LICENSE"), path.join(folder, "LICENSE"))
await Bun.write(
  path.join(folder, "Start OliveCode.command"),
  `#!/bin/bash
set -euo pipefail
base="$(cd -- "$(dirname -- "$0")" && pwd)"
if [[ "$(uname -m)" != "arm64" ]]; then
  printf '\\nThis OliveCode build needs an Apple Silicon Mac.\\n'
  read -r -p 'Press Return to close. ' _
  exit 1
fi
printf '\\n  OliveCode\\n  Choose the folder you want to work on.\\n\\n'
project="\${1:-}"
if [[ -z "$project" ]]; then
  printf '  Default: %s/Workspace\\n\\n' "$base"
  read -r -p 'Project folder (Return for a new workspace): ' project
  if [[ -z "$project" ]]; then
    project="$base/Workspace"
    mkdir -p -- "$project"
  fi
fi
if [[ "$project" == '~/'* ]]; then project="$HOME/\${project:2}"; fi
if [[ ! -d "$project" ]]; then
  printf '\\nThat folder does not exist: %s\\n' "$project"
  read -r -p 'Press Return to close. ' _
  exit 1
fi
cd -- "$project"
exec "$base/bin/olivecode" "$project"
`,
)
await chmod(path.join(folder, "Start OliveCode.command"), 0o755)
await Bun.write(
  path.join(folder, "READ ME.txt"),
  `OliveCode — macOS Apple Silicon\nBuild ${label}\n\n1. Extract this folder to a writable location.\n2. Open Start OliveCode.command.\n3. Choose your project folder, or press Return to create a Workspace here.\n4. Choose Start here in the app, or type /start.\n5. Connect your own cloud account, choose a model, and describe your task.\n\nLocal models: use /local; Ollama is required. Hardware is checked when Local opens; downloads begin only when you select a model. Use Delete models to remove installed downloads.\nCloud models: use /cloud. Free models have usage limits; check your account plan.\nAn existing theme choice is preserved. Choose olivecode from /theme to use the new appearance.\n\nThis is an unsigned local preview, not a signed/notarized public release. macOS may require approval before opening it. No update service is enabled.\nSettings and sessions use OliveCode storage folders. Supported free-provider credentials are copied on first launch; existing OpenCode data is never changed.\n\nOliveCode is derived from OpenCode. Upstream license is included in LICENSE.\n`,
)
const readme = path.join(folder, "READ ME.txt")
await Bun.write(readme, `${await Bun.file(readme).text()}\nAssist is on by default. Choose Assist beside Cloud and Local, or type /assist, to switch Teamwork and Follow-through on or off. On larger tasks, free advisers compare plans, check progress, and review completion. The selected model performs all file edits and tool calls. Helper requests use your own free quotas.\n\nWhile a task runs, its activity is visible. When it finishes, the chat shows the final answer below a Worked for row. Click the row for full details, or type /details to expand or collapse all responses.\n`)
await Bun.write(readme, `${await Bun.file(readme).text()}\nComputer: /computer offers a separate Browser, or Control Mac apps on macOS 14+. Desktop mode needs the macOS Accessibility permission once; screenshots optionally need Screen Recording and an image-capable model. The native helper is included. Allow always applies to this chat until restart; screenshots ask separately. Use Stop beside Assist, or Control+Option+Esc to stop desktop control from any app. Desktop is a preview and still needs testing after permissions are granted.\n`)
// Standalone guest app; never installed or launched on a remote host by packaging.
const guest = path.join(dist, "olivecode", "Background Mac")
const app = path.join(guest, "OliveCode Computer.app", "Contents")
await mkdir(path.join(app, "MacOS"), { recursive: true })
await copyFile(path.join(dist, "opencode-darwin-arm64/desktop-helper"), path.join(app, "MacOS", "OliveCode Computer"))
await chmod(path.join(app, "MacOS", "OliveCode Computer"), 0o755)
await Bun.write(path.join(app, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.olivecode.computer</string><key>CFBundleName</key><string>OliveCode Computer</string><key>CFBundleExecutable</key><string>OliveCode Computer</string><key>CFBundleVersion</key><string>1</string><key>LSMinimumSystemVersion</key><string>14.0</string><key>LSUIElement</key><true/></dict></plist>`)
const sign = Bun.spawn(["codesign", "--force", "--sign", "-", "--identifier", "com.olivecode.computer", path.dirname(app)], { stdout: "inherit", stderr: "inherit" })
if ((await sign.exited) !== 0) throw new Error("Could not sign the guest helper")
await copyFile(path.join(root, "docs/OLIVECODE_BACKGROUND_MAC.md"), path.join(guest, "SETUP.md"))
await Bun.write(path.join(guest, "Install in isolated Mac.command"), `#!/bin/bash
set -euo pipefail
base="$(cd -- "$(dirname -- "$0")" && pwd)"
if [[ "$(uname -m)" != "arm64" ]]; then
  printf 'This guest helper requires an Apple Silicon Mac.\\n'; exit 1
fi
printf 'Run this installer INSIDE your isolated Mac/VM. It does not configure the host.\\n'
destination="$HOME/Library/Application Support/OliveCode"
mkdir -p -- "$destination"
if [[ -e "$destination/OliveCode Computer.app" ]]; then
  printf 'The helper is already installed. Remove that app manually before replacing it.\\n'; exit 1
fi
cp -R -- "$base/OliveCode Computer.app" "$destination/OliveCode Computer.app"
printf 'Installed. Follow SETUP.md to grant guest permissions and configure trusted SSH.\\n'
read -r -p 'Press Return to close. ' _
`)
await chmod(path.join(guest, "Install in isolated Mac.command"), 0o755)
await cp(guest, path.join(folder, "Background Mac"), { recursive: true })
await Bun.write(readme, `${await Bun.file(readme).text()}\nComputer now offers Visible control, Background browser, and Background Mac (requires your own isolated macOS VM or second Mac). The Background Mac folder contains the guest helper and preview setup instructions. A one-click VM installer is not included. Short native text types visibly; long text stays fast.\n`)
await copyFile(path.join(root, "docs/OLIVECODE_REMOTE.md"), path.join(folder, "REMOTE.md"))
await Bun.write(readme, `${await Bun.file(readme).text()}\nRemote: type /remote for Telegram setup, or run olivecode remote setup followed by olivecode remote start from your project folder. See REMOTE.md. Uses your own bot; only the paired private account can control it. Keep the remote terminal open and the computer awake. No live Telegram account was used to verify this preview.\n`)
const archive = path.join(dist, `OliveCode-macOS-arm64-${label}.zip`)
await rm(archive, { force: true })
const zip = Bun.spawn(["ditto", "-c", "-k", "--keepParent", folder, archive], { stdout: "inherit", stderr: "inherit" })
if ((await zip.exited) !== 0) throw new Error("Could not create the portable archive")
const checksum = new Bun.CryptoHasher("sha256").update(await Bun.file(archive).arrayBuffer()).digest("hex")
await Bun.write(`${archive}.sha256`, `${checksum}  ${path.basename(archive)}\n`)
await rm(staging, { recursive: true, force: true })
console.log(archive)
