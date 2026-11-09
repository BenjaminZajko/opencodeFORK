# OliveCode Desktop

## Design direction

A quiet working environment for people building real projects. Familiar desktop navigation, live conversations and inspectable changes; OliveCode's pixel olive is the signature. Codex is a workflow reference, not a visual template.

Baseline: the inherited desktop and app typechecks and Electron production build pass. The original empty home has projects and session search, but no product identity, setup path or explanation of what to do. Existing session, diff, terminal and permission machinery will be retained.

### Tokens

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | #FAFBF8 | #151915 |
| Navigation | #F0F3ED | #1B211B |
| Text | #202B21 | #EDF2E9 |
| Secondary text | #52634F | #A8B6A2 |
| Action / focus | #386335 | #A9D87D |
| Selected surface | #E1ECD9 | #2C3B28 |

System sans for interface text, 13px body / 15px section labels / 30px welcome heading. Existing monospace for source and terminals. Text pairs target WCAG AA; status always includes words or an icon. No promotional gradients or repeated dashboard cards.

### Structure

Regular window:
```
native window controls | tabs                         Models
-----------------------------------------------------------
Projects              | OliveCode
  project folders     | What are we building?
                      | Open a project / Choose a model
Settings / Help       | Recent conversations and search
```

Compact window:
```
native controls | tabs
OliveCode                       Models
project chooser
conversation search / recent work
Settings / Help
```

Setup is brief, skippable and reopenable. Local and Cloud have equal prominence. Local names where inference happens and discloses model downloads. Cloud names the external provider. A downloaded model's tool support is inspected before enabling it; missing tools produce an explanation, never an implied coding guarantee. No models are downloaded automatically.

Motion is limited to existing loading/status feedback and short control transitions, with reduced motion respected. Keyboard focus is visible. Native macOS controls and shortcuts stay native. Files and tool permissions remain visible in the existing agent workflow.

### Critique before implementation

A dark background with bright green buttons alone would look generic. Use the existing pixel olive, subdued forest surfaces in both appearances and a clear project-to-conversation flow instead. Do not duplicate the existing review or terminal UI. Do not invent sample conversations or results. Keep setup out of the main conversation once configured.

## Runtime boundaries

- Package the Node-compatible OliveCode engine from this checkout. Do not download an unrelated upstream CLI.
- Separate application ID, protocol, desktop storage and update destination from OpenCode.
- Desktop previews do not auto-update until an OliveCode-signed release feed is configured.
- Modern desktop runtime support is separate from the Catalina terminal preview; this app does not claim Catalina compatibility.
- Keep upstream licenses and attribution.

## Validation

See the completion notes below for actual commands and results. Shipping publicly requires signing/notarization and release-feed configuration in addition to local packaging.

### Completed on 3 November 2026

The app, desktop and engine typechecks pass. Targeted tests: app 32, desktop 16, engine 94; total **142 passed, 0 failed**.

- Packaged a 441 MB Apple Silicon `.app`, version 0.2.0. Its Info.plist declares macOS 12.0 minimum. Final build: `packages/desktop/dist/verified-preview/mac-arm64/OliveCode Preview.app`.
- Opened the first packaged build as a native app. Verified the home, native menus, Local/Cloud chooser, real Ollama inventory, model-name validation and failed-download recovery in that app. Later copy/version corrections were packaged separately, leaving the running app untouched.
- Ran the bundled Node engine independently with temporary data. `/global/health` reported healthy/version 0.2.0; model inventory distinguished the installed local model from an Ollama cloud shortcut.
- Verified local helpers with Node and `typeof Bun === "undefined"`: hardware command execution, executable detection and Ollama status all worked.
- Browser-preview end to end: selected a disposable folder, configured its local model in an isolated config, opened a conversation, received a real model response, initialized the disposable Git repository, observed a real working-tree change in split diff and ran `node sum.test.js` successfully in the integrated terminal.
- The 1B model reported an unverified test result in its conversation. This was a model-quality failure; it is not counted as a successful agent tool-use test. The terminal test was executed separately by the reviewer. No large models were downloaded.
- Cloud provider picker and OpenRouter connection-method form were checked. No new provider login, key entry or paid inference was performed for this work.
- Both light and dark appearances were reviewed. Planned text/action contrast ratios are 6.21:1 or higher. Keyboard Escape closes setup; the command palette exposes the terminal; native folder selection uses the system picker.
- Native folder-picker automation timed out after selecting the disposable folder. The native process remained running and its authenticated engine still responded, but the UI result of folder acceptance was not confirmed. This check remains manual; browser-preview project selection passed. No app or server was restarted to work around it.
- Source formatting and `git diff --check` passed. Graphify was refreshed without LLM calls; its existing SQL-parser and unsupported-syntax warnings are unrelated to the app changes.

Screenshots in `docs/desktop-preview/` show the actual browser preview of the shared desktop interface. They are not mockups or evidence of model-generated changes.

### Before public distribution

1. Confirm native folder acceptance on a second Mac and finish cross-machine installation checks.
2. Validate stronger coding models on real edit/test tasks and interruption/permission flows. Tool metadata alone is insufficient.
3. Configure signing, notarization and an OliveCode-owned update feed. Preview builds deliberately consume no upstream update feed.
4. Validate Intel/Windows/Linux builds separately; the present artifact is Apple Silicon only.
