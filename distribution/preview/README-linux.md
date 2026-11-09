# OliveCode Linux desktop-control preview

This is an experimental Linux x86-64 build. It includes the native app-tool routing, AT-SPI adapter, app capability checks and clipboard fixes. It has been cross-compiled on macOS, not yet tested on a real Ubuntu desktop. Keep the previous version until it passes your real-machine test.

Extract the archive and run:

```sh
./install.sh --dependencies
```

This installs the command for your user, backs up the previous command and offers the free Ubuntu/Debian repository packages needed for native accessibility/clipboard support. Ubuntu may ask for your local sudo password; enter it only into your own terminal. No account/API credentials or saved conversations are changed. Run `./install.sh` without the flag if support packages are already installed.

Start `~/.local/bin/olivecode` and choose **Computer → Start visible control**. Open Codex or Claude's desktop window first. Start with: “Find the open Codex app and tell me the current conversation's visible topic. Do not type or change anything.” Check what the app actually showed before allowing edits. Test Copy by selecting an answer and copying it into a blank text document.

If a desktop app is found but its conversation text is absent, its accessibility tree may be disabled. Electron/Chromium applications may require their supported accessibility setting or relaunch option `--force-renderer-accessibility`. Do not close unsaved work or modify launchers just to guess at a fix. `./diagnose.sh` creates a short report with platform/dependency status, without reading conversations, clipboard contents or credentials. Share that report for the next diagnosis.

Wayland supports exposed semantic app actions and editable text. Global pointer/keyboard injection is not included on Wayland. X11 physical actions additionally need xdotool. Native screenshots, OCR and drag are unavailable in this preview. Website control separately requires Chrome/Chromium; missing that browser does not disable native app tools. Chromium is not downloaded by this installer.

For rollback, copy the backup named by the installer back to `~/.local/bin/olivecode`. This preview does not publish anything, change OS access permissions, attach to private browser profiles or inspect the whole filesystem.
