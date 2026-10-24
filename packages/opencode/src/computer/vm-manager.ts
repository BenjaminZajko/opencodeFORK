import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdir, readFile, writeFile, chmod, rename } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import os from "node:os"

declare const OLIVECODE_VM_MANAGER: string
const run = promisify(execFile)
const guide = `# OliveCode Background Mac

This window creates and runs a separate macOS VM on an Apple silicon Mac.
It does not share your host folders or automatically grant permissions.

1. Choose Create background Mac. macOS downloads from Apple. The expandable disk can grow to 80 GB.
2. Start Mac, then Show screen. Finish macOS setup with a separate guest account.
3. Inside the guest, enable Remote Login in System Settings > General > Sharing.
4. Install OliveCode Computer in the guest using the Background Mac folder in the OliveCode portable download. Approve Accessibility in the guest; Screen Recording is optional for screenshots.
5. Configure a trusted SSH alias on your main Mac, with key-based authentication to the guest. Connect once yourself and verify its host key. Do not disable host-key verification.
6. Launch OliveCode with OLIVECODE_BACKGROUND_MAC_SSH set to that alias. Select Computer > Start background Mac.

The screen can be closed while the VM keeps running. Minimize the manager to keep it running; closing the manager stops the VM. Save guest documents before closing.
OliveCode's Stop button stops the agent; Shut down in the manager asks the guest to shut down.
Guest apps and files are independent. SSH delivery into a logged-in guest and its permissions still require a real guest integration test; do not treat this preview as automatic setup.

VM files: ~/Library/Application Support/OliveCode/Background Mac
An interrupted installation can be resumed. Existing disks are never silently overwritten.
`

export async function launchVMManager(selfTest = false) {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error("Local Background Mac setup needs an Apple silicon Mac. You can still connect a separate Mac using its trusted SSH alias.")
  }
  const encoded = typeof OLIVECODE_VM_MANAGER === "string" ? OLIVECODE_VM_MANAGER : ""
  const bytes = encoded ? Buffer.from(encoded, "base64") : await readFile(new URL("./native/background-vm-helper", import.meta.url))
  const root = path.join(os.homedir(), "Library", "Application Support", "OliveCode", "Background Mac")
  // Keep a running manager's signed executable intact during an OliveCode update.
  const digest = createHash("sha256").update(bytes).digest("hex")
  const app = path.join(root, "Managers", digest, "OliveCode Background Mac.app")
  const contents = path.join(app, "Contents")
  const executable = path.join(contents, "MacOS", "OliveCode Background Mac")
  await mkdir(path.dirname(executable), { recursive: true })
  const valid = await run("/usr/bin/codesign", ["--verify", "--strict", app]).then(() => true, () => false)
  if (!valid) {
    const temporary = executable + ".tmp"
    await writeFile(temporary, bytes, { mode: 0o755 })
    await chmod(temporary, 0o755)
    await rename(temporary, executable)
    await writeFile(path.join(contents, "Info.plist"), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.olivecode.background-mac</string><key>CFBundleName</key><string>OliveCode Background Mac</string><key>CFBundleExecutable</key><string>OliveCode Background Mac</string><key>CFBundleVersion</key><string>1</string><key>LSMinimumSystemVersion</key><string>14.0</string><key>NSHighResolutionCapable</key><true/></dict></plist>`)
    const entitlements = path.join(path.dirname(app), "virtualization.plist")
    await writeFile(entitlements, `<?xml version="1.0"?><plist version="1.0"><dict><key>com.apple.security.virtualization</key><true/></dict></plist>`)
    await run("/usr/bin/codesign", ["--force", "--sign", "-", "--entitlements", entitlements, app])
    await run("/usr/bin/codesign", ["--verify", "--strict", app])
  }
  await writeFile(path.join(root, "Connection guide.md"), guide)
  if (selfTest) return (await run(executable, ["--self-test"])).stdout.trim()
  await run("/usr/bin/open", [app])
  return "Background Mac setup opened. Nothing downloads until you choose Create background Mac."
}
