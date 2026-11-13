# OliveCode desktop and terminal 0.1.7

Updated 2026-11-13. Desktop package: **0.1.7-preview.1**. Published terminal
reference: **v0.1.7** (verified on GitHub). The desktop bundles this fork’s engine;
it does not substitute an upstream OpenCode executable.

## Implemented and checked

| Area | Desktop behavior | Verification |
| --- | --- | --- |
| Coding, file tools, streamed chat | Shared engine, normal conversations and project permissions | Actual bundled Node engine exercised with local OpenRouter, Groq, Mistral and Ollama mock endpoints; five file reads completed |
| Teamwork and follow-through | Project switches, shared planning, adviser/progress checks, completion reviews and continuation | Bundled-engine acceptance test verified advice and follow-through; turning both switches off disabled the extra workflows |
| Model handoffs, quota recovery and free-provider policy | Current shared engine implementation | Source shared with terminal; general model/Assist acceptance passed; every handoff/failure scenario has not been repeated in Electron |
| Free cloud selection | Models → Choose a connected free model uses the terminal ranking and cooldown endpoint | Compiles; same server endpoint; provider accounts are never created or charged automatically |
| Local models | Ollama inventory, capability checks, explicit download with progress, hardware recommendation, selection, removal confirmation | Real hardware/inventory endpoints passed under Node. Packaged app and browser UI inspected. Recommendation selection and removal cancellation checked; no real model deleted or downloaded during QA |
| Computer use in normal chat | Tools & skills → Computer: computer access and browser visibility, same project config as terminal | Settings round-trip and merge preservation passed under Node. Browser UI toggle persisted |
| Native adapters | Mac Swift helper, Windows PowerShell and Linux Python adapters embedded in desktop engine | Fixed missing assets in Node build; Mac helper compiles and packaged chat/tool status reports macOS capabilities without app actions. Existing terminal OS checks do not establish desktop GUI acceptance |
| Phone control | Tools & skills → Phone control: channel, mode, setup/start/status, private native-terminal launch | IPC/types and argument-injection tests passed. Packaged Mac controls inspected. Uses installed OliveCode CLI, with explicit missing-CLI result; not a background service managed entirely inside the desktop window |
| Privacy | Desktop-only daily usage opt-in, off by default, separate from terminal preferences | Packaged Mac app showed off. Shared reporter tests verify no request before opt-in, daily deduplication, token rotation and retry behavior. No live measurement enabled during QA |
| Skills | Project discovery, details and start a skill conversation | Existing shared endpoint and UI retained; load errors no longer read a rejected resource |
| Sessions, attachments, commands, git review, worktrees, terminal, MCP and LSP | Existing desktop workspace and shared engine | Existing source paths retained. Not every command has been manually repeated in this pass |
| Design | Restrained forest-green surfaces, compact feature navigation, semantic theme colors, clear loading/errors, responsive rows | Browser inspected at narrow and laptop widths. Fixed sidebar appearing above dialogs. Native packaged Mac app launched with disposable state |

## Release gates and remaining differences

- **Not a claim of complete parity.** Separate-Mac/VM provisioning remains in the
  terminal’s advanced setup; a configured separate-Mac agent is provided by the
  shared engine. Phone setup still uses a separate native terminal and an installed
  OliveCode CLI. On Windows/Linux, terminal Remote currently supports project files
  and background browser; visible/isolated Mac modes are only offered on macOS.
- Desktop updates remain disabled. There is no verified signed desktop update
  feed. Never point Electron at the terminal release feed or inherited upstream
  feed. Signing/notarization and a desktop release/update channel are still release
  work, not implemented by a toggle.
- Sponsor acknowledgement preferences do not appear in desktop because this
  desktop has no sponsor placement. Usage opt-in is a separate desktop preference.
- Windows/Linux native desktop packages and real GUI interaction need their own
  platform acceptance results. Added `.github/workflows/olivecode-desktop-preview.yml`
  builds on macOS/Windows/Linux, exercises the actual Node bundle, runs shared
  chat/tools/Assist acceptance with local mock models, and packages unsigned
  previews. A workflow file alone is not a passing run.
- Linux semantic control requires AT-SPI and distro Python bindings; pointer input
  needs X11/xdotool. Wayland global input is unavailable. Native Mac control needs
  macOS 14+. The app does not silently bypass OS permissions.

## Repeatable verification

From `packages/desktop`:

```sh
bun typecheck
bun run build
node scripts/smoke-engine.mjs
python ../../script/smoke-olivecode.py scripts/serve-engine.mjs
bun test ./src/main/remote-launch.test.ts ./src/main/updater-controller.test.ts ./src/main/updater-subscriptions.test.ts
bun run package:preview
```

The smoke scripts use disposable state and local mock model endpoints. They do
not use production credentials, real model credits, or modify customer projects.
Launch an isolated packaged Mac instance using `OPENCODE_TEST_ONBOARDING=1`;
never restart or overwrite an already-running user instance for QA.
