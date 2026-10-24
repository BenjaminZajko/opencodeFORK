# Background Mac setup (preview)

Background Mac sends app-control actions to a separate, logged-in macOS VM or second Mac. It does not move the host cursor. Background browser remains available without a VM. Native guest connection has transport regression coverage but still needs a real-guest end-to-end test; guest connection and permissions still require manual setup. A local VM manager is now included for Apple silicon Macs; its restore/install/runtime workflow still requires a real guest integration test.

## Create or manage a local VM

Reopen OliveCode and choose **Computer → Set up / show background Mac**, or run `olivecode background-mac`. This opens a native window; it does not start a download automatically.

Choose **Create background Mac** to download the latest host-supported macOS restore image from Apple. The manager checks for at least 30 GB available space before downloading, budgets at most half the host RAM and fewer than all CPU cores, creates an 80 GB expandable disk, and installs macOS using Apple's Virtualization framework. It preserves a unique guest identity, saved hardware configuration and disk. Interrupted installs can resume from the retained restore image; existing disks are never overwritten silently. The UI shows download/install progress and offers cancellation.

After installation, use **Start Mac** and **Show screen** to finish Apple's setup assistant. Closing the guest screen keeps the VM running; minimize the manager while you work. **Shut down** requests guest shutdown. Closing the manager warns before terminating a running VM: save guest work first. OliveCode's chat **Stop** ends agent control separately.

VM data is stored in `~/Library/Application Support/OliveCode/Background Mac`. No host directories are mounted. The connection guide remains available in the manager. Guest account setup, SSH and macOS permissions remain manual; installation is not evidence that remote GUI control works.

The packaged manager self-test checks resource planning, insufficient-host rejection and configuration serialization without downloading or running a VM. The manager launch and Create/Cancel confirmation were checked in the native UI. App-bundle signing was validated, and the packaged manager self-test passed twice after installation; manager versions are stored separately so updating OliveCode does not rewrite a running manager executable. A full macOS install/start/guest-control test has **not** been run.

## Choose the isolated Mac

For an Apple Silicon Mac, use a macOS VM installed from Apple's supported restore image. Apple documents the supported install and run workflow at https://developer.apple.com/documentation/virtualization/running-macos-in-a-virtual-machine-on-apple-silicon . A separate Mac is also supported by the connection protocol. This preview guest helper is Apple Silicon/macOS 14+; Intel guests need a matching helper build.

Keep the guest logged into its desktop. Install the applications needed by the task there. Guest files are separate from host files: OliveCode does not copy your project or mount your home folder automatically. Do not share all personal files just to make a demo work.

## Install the guest helper

Copy the `Background Mac` folder included with the portable package into the guest. Open `Install in isolated Mac.command` **inside the guest**, not on the main Mac. It installs only OliveCode Computer.app into the guest user's Library/Application Support/OliveCode folder and prints the next steps. It does not change permissions, enable Remote Login or weaken Gatekeeper.

In the guest, enable OliveCode Computer in Privacy & Security → Accessibility. Screen Recording is optional until window screenshots or screen-text recognition are needed. Use the + button to select the installed helper app if it is not listed. The running guest session must expose its active app to the helper; status/observe verifies this rather than assuming it.

## Connect securely

Enable Remote Login for the dedicated guest user in the guest's Sharing settings. Set up a key-based SSH connection from the host using your own trusted guest account; no password is stored by OliveCode. Verify the guest's SSH host key independently and establish the connection manually once. Do not accept an unknown key solely because a model suggests it.

Create an SSH alias such as `olivecode-vm` in your host SSH config with the guest address, user and your key. Do not use agent forwarding. Test the alias manually. Launch OliveCode with `OLIVECODE_BACKGROUND_MAC_SSH=olivecode-vm` in its environment. The model cannot set or change the alias. The current setup uses this environment option; the native VM manager handles local creation and lifecycle, while an in-app SSH connection wizard remains outstanding.

Choose Computer → Start background Mac. Ask it to check status, activate TextEdit, create an unsaved document, type Hello from OliveCode, and verify it. Watch your host cursor remain unchanged. Inspect the guest screen yourself to confirm the result. Repeat with a separately approved screenshot and Stop when ready. SSH-launched helper access to the guest GUI/TCC must be confirmed in that real test; fixture tests do not establish it.

The transport uses strict SSH host-key checking, key-only/non-interactive authentication, no agent forwarding, a fixed helper command and a hardware-identity handshake before any app action. It rejects the main Mac, missing identities and a guest already controlled by another chat, including through a second alias. No commands or credentials are supplied by the model. Hardware identifiers are hashed locally and not added to model/chat outputs; hashes distinguish environments but are not authentication. SSH host keys provide connection authentication.

Progress appears in chat; image-capable models can request separately approved guest window screenshots. For a VM created by OliveCode, use Show screen in the manager to inspect its guest desktop. Other VMs and second Macs use their own viewer. Stop closes the SSH connection/helper input. Loss of connection never falls back to host control. Network loss cannot undo input already sent, and immediate stop behavior on a real guest is part of the remaining integration test.
