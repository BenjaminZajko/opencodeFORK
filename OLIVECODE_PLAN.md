# Current delivery — 28 September 2026

## Task assistance — 29 September 2026

30 September upgrade: Teamwork now shares a bounded project file map, exchanges its first plan with the second adviser, prefers distinct providers, and checks actual tool progress at most twice on larger tasks. Follow-through uses an activity ledger, two independent first reviewers after substantial tool work, and allows another attempt on a repeated gap when new tool work occurred. Simple questions skip extra model calls. Provider selection now includes configured and environment-based credentials, fixing a bug found by the compiled-app smoke check. See `docs/olivecode/task-assistance.md` for behavior, limits, and sources. A fake-provider compiled run verified five completed reads, a progress check, reviewer-requested continuation, two distinct reviewers, and both off switches. It does not measure real-model quality on large projects.

- Added project-level, default-on Teamwork and Follow-through settings. Open **Assist ▾** beside Cloud/Local in the composer footer or type `/assist` to toggle either option.
- Teamwork asks up to two same-location, free-eligible models for a plan and second opinion. The selected lead model remains responsible for edits and tool calls. Local tasks select only installed Ollama models; cloud tasks use models from configured free providers. Providers that are cooling down are skipped.
- Follow-through reviews the lead's transcript and tool outputs for concrete omissions, then allows up to six review rounds to request scoped continuation. It stops for user input, repeated gaps, a model step limit, or the review limit. Helper output is shown in the session but removed from model history. The reviewer has no tools and cannot independently inspect the working tree; it can miss issues.
- Helper calls are best-effort, bounded to 90 seconds and 1,024 output tokens. Failures do not fail the main response. These calls spend the user's own connected free-provider quota. Features are available for cloud and local tasks, but a helper exists only when an eligible peer is available; follow-through falls back to the lead model.
- Validation: opencode and TUI type checks pass. A user-visible cloud task showed two advisers and a completion review. The launcher is updated to the current `0.0.0-olivecode-dev-202609300650` binary made with OliveCode's cached model catalog. The refreshed portable archive and checksum are in `packages/opencode/dist/`. The graph refresh completed in `--no-cluster` mode.

This status supersedes historical design and provider notes below.

- Replaced the green-tinted interface with neutral charcoal/light surfaces, restrained emerald accents, a compact OliveCode header, project context, and a framed task composer.
- Fixed the compiled prompt crash caused by a circular filesystem dependency. Compiled end-to-end requests pass for all four supported adapters against isolated local servers.
- Enforced a shared free-only policy for visible choices, defaults, direct requests, and background models. Removed upstream subscription and sharing actions.
- Added recommendations with two choices from the top provider, one per other provider, all-model and cooldown submenus, and free-provider connection.
- Moved runtime storage and project configuration into OliveCode namespaces; safely copies supported legacy credentials on first launch.
- The launcher asks for a project folder and creates Workspace on Return. A rebuilt Apple Silicon preview and checksum are packaged locally.
- The user confirmed cloud chat works. Real local Llama 3.2 1B inference now passes through the compiled app with isolated settings. Fixed local provider registration, automatic hardware checks on opening Local, curated quantization variants, cloud-shortcut filtering, and immediate installed-model deletion.
- Real deletion is covered with simulated inventory only; no user model files were removed. Larger-model performance, account quotas, public signing, and distribution still need verification.
- Local update validation: package typecheck passes; 228 TUI tests pass (1 skip), 88 onboarding tests pass, 3 onboarding HTTP tests pass, and 2 configuration filename/comment regression tests pass. The latest local-dialog test suite passes with the demanding-model choice. Built and packaged preview 0.0.0-olivecode-dev-202609290811.
- Local coding-model reliability: Qwen2.5-Coder 14B sometimes emits tool JSON as plain text. The Ollama adapter now converts only exact calls for offered tools, letting the normal validation and permission checks execute them. Verified real Qwen file creation in an isolated project. A later fabricated example path was stopped by permission checks and is now blocked in the adapter. The `/local` dialog shows a small down arrow only when its list overflows the available height.
- Local inventory: Ollama can list cloud shortcuts alongside downloaded files. On this Mac, `gemma4:31b-cloud` is a shortcut; `llama3.2:1b` remains downloaded, and the user removed `qwen2.5-coder:14b` after an earlier inventory check. The Delete models screen now lists only downloaded files, and the delete endpoint rejects cloud shortcuts.
- Local sizing: the UI labels its model budget approximately in GB. Apple Silicon reserves the larger of 4 GB or 25% of RAM, so a 24 GB machine displays `~18 GB`. Download choices now surface the largest compatible model that fits the estimated budget as a demanding option; on this Mac that is Devstral Small 2 24B Q4 (15 GB download, ~16 GB runtime estimate). The 65 GB GPT-OSS 120B remains in All model variants for much larger machines.
- Ads remain a future task; none have been implemented.

See OLIVECODE_START.md for the current launcher and docs/olivecode/free-models.md for free-plan policy and sources.

---

## Historical work log

# OliveCode delivery plan

Updated 2026-09-21. The project handoff is the product authority; this TypeScript/Bun repository is the active implementation. Preserve the existing uncommitted work.

## Product contract

- Cloud first, with credentials owned by each user. Never pool accounts or keys.
- Free catalog entries need current evidence of zero prices and access without a payment method. Connection support is not proof that every model or account tier is free.
- Free cloud services have quotas. Describe automatic fallback honestly; do not promise unlimited cloud capacity.
- Launch immediately into the home screen. Hardware detection requires an explicit download/recommendation action; it must not run on launch or hover.
- Keep Local and Cloud accessible with both mouse and keyboard. Loading, errors, cancellation, and exhausted quota must leave a usable interface.

## Delivery order and acceptance gates

1. **Local reliability:** reproduce the loading regression against the actual dialog host; verify the existing stable-root fix, timeouts, close/reopen, and late responses. Separate installed-model selection from hardware-assisted downloads. Include the top recommended model in download choices.
2. **Cloud availability:** generate clients from the server contract; show live rate-limit countdowns as informational rows; exclude cooling models from selectable choices and ranked defaults. Poll only while the dialog is open, bound requests, and clean up timers/requests on close.
3. **Fallback reliability:** prevent automatic fallback from choosing another known cooling model. Keep the existing rate-limit-only trigger and user-owned provider authentication.
4. **Accessible controls:** expose Local and Cloud through the command palette. Preview only already-known information; do not trigger hardware detection from hover. Validate the actual terminal rendering, including narrow widths.
5. **Provider and distribution readiness:** audit live provider access/pricing and credential onboarding; exercise a real connected account with user-controlled access; validate installation, release packaging, and supported terminals. Publish only after these gates pass.

Task classification, speculative model scores, ads, and silent background hardware detection are not prerequisites for the reliable first release. The user explicitly prioritized premium green branding and first-use guidance on 2026-09-21; those are now implemented below. The handoff itself defers task routing for a separate design pass; all currently curated cloud entries use the strong tier, so a fast/strong switch would presently be misleading.

## Current delivery — 2026-09-21

- Added the OliveCode default theme in light and dark variants, a compact olive-branch identity, a quieter home layout, and a skippable inline setup guide. Existing explicit themes remain selected after preference loading. Content, supporting text, code/status colors and selected rows pass measured contrast checks.
- `/start` opens a cloud-first setup route, then a short list of user-owned account options. Local remains available. The guide disappears on Skip or first task submission and can be reopened. No launch or hover hardware scans were added.
- Added Cloud/Local hover summaries from already-loaded state, visible active-source markers, and the existing `/cloud` and `/local` keyboard routes. Real full-home tests caught and fixed narrow-window controls wrapping into single characters; 48×24 and 100×36 layouts now pass in both appearances.
- Fixed OpenRouter browser sign-in to include the required loopback return URL and complete automatically. The local receiver uses an unguessable path, a five-minute expiry, one-shot completion, cancellation on a newer attempt, no credential/code echo, and no-store responses. Key exchange has a deadline and validates its response. API-key entry remains available. Source: https://openrouter.ai/docs/guides/overview/auth/oauth . Full real-account browser authorization remains unverified.
- Fixed OpenRouter header merging for object, Headers, tuple-array and Request inputs so a stale Authorization value cannot be combined with the current credential.
- Account saving now reports failures, prevents double submissions, and discards UI continuation after close. Browser sign-in has a keyboard action to open the page and ignores late completion after closing.
- Free labels require both listed input and output token prices to be zero, including OpenRouter. Unknown or nonzero prices say Check plan. This is model-price evidence, not proof of an account's free-tier eligibility.
- Fixed unhandled preference-write failures found during the full suite. Model/session preferences are snapshotted and written in order, with actionable failure feedback. A missing preference file on first launch is normal and no longer emits a failure log.
- Disabled upstream version lookup/automatic upgrades and guarded both CLI and installation-service upgrades in olivecode channels. A fork build must not silently reinstall upstream OpenCode.
- Added the project-folder launcher and a repeatable portable macOS arm64 packager. The archive includes the executable, first-run launcher, instructions, upstream license and a separate SHA-256 checksum. Packaging uses a fresh staging folder so it cannot include an existing user Workspace.

### Latest verification

- Full TUI: **225 pass, 1 skip, 0 fail**, 49 files, 8 snapshots and 604 assertions. One pre-existing tree-sitter teardown warning remains non-failing.
- Focused backend fallback/cooldown/processor/OAuth: **55 pass**; final expanded OAuth/header/updater checks: **21 pass** (overlapping test runs, not additive).
- Final opencode package typecheck passed and covers the TUI. TUI's own typecheck also passed during the implementation. `git diff --check` passed.
- Portable archive: **36.0 MiB**; SHA-256 and all ZIP entries verified, with no user Workspace included. The extracted executable passed its version check and the extracted launcher passed shell syntax validation.
- Final native build: **0.0.0-olivecode-dev-202609211100**. Built executable passed its version check. Isolated, password-protected packaged server returned HTTP 200 for cooldowns, default recommendation and Ollama status. The explicit CLI upgrade command confirmed the fork updater guard.
- Full-home native-renderer tests exercise regular/compact layouts, both appearances, hover, and the registered setup/cloud commands. PNG previews are in `docs/olivecode/`. This does not establish live iTerm or screen-reader compatibility.
- Graphify AST update now creates the code graph successfully. SQL is omitted because the optional SQL parser is absent; nine source files have parser warnings. No semantic/API extraction was used.
- Public OpenRouter pricing was rechecked on 2026-09-21: `cohere/north-mini-code:free` still lists prompt and completion prices as zero. Automatic approval review rejected the proposed real-account test because transmitting the saved credential/test prompt lacked explicit authorization. User approval was requested and remains pending; no authenticated request was sent.

### Remaining release gates

1. Obtain the pending approval and test an actual provider reply; finish browser sign-in with a real account. Cached catalog and mocked exchange tests cannot establish account access.
2. Human iTerm check and terminal accessibility evaluation. Native-renderer coverage is complete for the flows above, but the computer-control tool disallows iTerm control.
3. Signed/notarized public distribution, Windows/Linux/Intel packages, an OliveCode-owned update channel, and a deliberate decision about separating or migrating inherited OpenCode settings storage.
4. Measured task routing remains deferred as in the handoff; current curated models do not justify a fast/strong toggle.

See `OLIVECODE_START.md` for the user path and `OLIVECODE_DESIGN.md` for the design rationale. Historical results follow below and are retained as an audit trail.

## Research decisions

- OpenRouter supports OAuth PKCE that yields a user-controlled key: https://openrouter.ai/docs/guides/overview/auth/oauth. Prefer this existing aggregator path for low-friction cloud onboarding, retaining optional individual providers for additional independent quotas.
- OpenRouter documents free-account limits of 50 requests/day and 20 requests/minute: https://openrouter.ai/blog/tutorials/how-to-get-the-lowest-cost-llm-inference-on-openrouter/. Combining providers can improve availability but cannot guarantee unlimited cloud usage.
- Solid tracks reads inside reactive scopes: https://docs.solidjs.com/concepts/intro-to-reactivity. Validate dialog mount counts, not only successful network responses, when diagnosing the frozen loading screen.

## Verification log

### Completed in this pass

- Reproduced the original loading-screen regression by temporarily removing the stable root container, then restored the exact working-tree file. The native-renderer test failed without the container and passed with it. This verifies the existing fix; it is not proof of an iTerm-specific event-loop diagnosis.
- Local opening now fetches only the Ollama inventory. Hardware detection is behind **Download other models**, with bounded requests, retry feedback, and no launch/hover probe. Hardware-based “Best available” appears after an explicit recommendation request; a fresh dialog does not pretend to know the machine's best model before that scan.
- Added the missing primary recommendation to download choices and memory estimates to alternate local recommendations.
- Local downloads now use the generated SDK's SSE client, retaining configured authentication and request context. Incomplete streams report an error. Closing cancels the reader and prevents late completion from dismissing a new dialog or changing its model. Model registration/selection also has a deadline.
- Generated both client packages using their build scripts. The legacy SDK gained `provider.cooldowns()`; the separate protocol client generated without changes because this is a legacy instance endpoint.
- Cloud shows a non-selectable **Waiting on models** footer, with one-second countdowns and five-second availability refreshes while open. Both timeouts and close cleanup are bounded. A ranking failure does not discard successful cooldown data. Retry estimates are explicitly not promises of provider capacity.
- Ranked defaults and rate-limit fallback skip currently cooling provider/model pairs. Added end-to-end tests for successful cross-provider switching and skipping a known cooling fallback.
- Added `/local` and `/cloud` commands and command-palette entries. Existing footer pills and permanent RPC error handling are preserved.
- Removed DeepSeek V4 Pro 0813 from automatic recommendations and NVIDIA's forced static metadata: it is absent from the live NVIDIA catalog fetched on 2026-09-19. Refreshed the served-model fixture (82 models). Kimi K2.6 remains live-listed. No replacement model or new benchmark score was invented.

### Verification

- Baseline: TUI **202 pass, 1 skip, 0 fail**; focused backend **111 pass, 0 fail**.
- Full backend: **3,721 pass, 22 skip, 1 todo, 1 fail** across 267 files. The sole failure was the handoff's known 20-second PTY load flake. The isolated PTY file then passed **4/4**.
- After the NVIDIA refresh: focused backend/provider/plugin/onboarding/processor checks passed **54/54**.
- Final full TUI: **212 pass, 1 skip, 0 fail**, across 48 files (8 snapshots, 503 assertions). This includes the additional Cloud failure-case regression and all local download lifecycle checks.
- Both opencode and TUI package type checks passed. Final opencode typecheck includes the TUI imports and tests.
- macOS arm64 TUI-only executable built successfully, without publishing or changing dependency versions. Its built-in `--version` smoke check passed.
- Compiled binary started with isolated temporary state and a password-protected localhost server. `/provider/cooldowns`, `/onboarding/default`, and `/onboarding/ollama` each returned HTTP 200 with the expected shape. The test server was stopped afterward.
- Direct HTTPS requests succeeded for the NVIDIA, OpenRouter, and `models.opencode.ai` public catalogs with certificate verification enabled. The previously reported TLS certificate error did not reproduce in that transport.
- A live model smoke check was attempted using the existing OpenRouter account, but Bun and the scripted HTTPS transport timed out during public catalog retrieval before account authentication or inference. No successful live model response is claimed. Standalone public-catalog downloads worked; the transport discrepancy is unresolved.
- Live iTerm control could not be performed: the computer-control tool explicitly disallows the iTerm application for safety reasons. Native-renderer interaction tests passed, but a human iTerm check remains necessary.

### Remaining release work

1. Run the updated binary in iTerm and verify Local/Cloud clicks, `/local` and `/cloud`, narrow-window layout, model selection, and one actual prompt. An account entry alone does not establish valid credentials or available quota.
2. Resolve the scripted HTTPS discrepancy and verify the real worker/SDK/provider path, including account-specific free-tier availability and a successful model reply. Public pricing/served-model evidence does not prove inference access.
3. Implement and validate hover previews with keyboard parity, without adding background hardware probes. Retain the explicit detection rule from the current handoff.
4. Design task routing against measured models. All current catalog entries are strong-tier; do not ship a fast/strong toggle that has no meaningful alternative. Cross-provider rate-limit fallback already exists.
5. Finish OliveCode branding, installers, cross-platform packaging, update delivery, and distribution review. The binary here is a local TUI development build retaining upstream executable naming, not a signed/notarized public release.

### Local test build

Executable: `packages/opencode/dist/opencode-darwin-arm64/bin/opencode` (macOS Apple Silicon, TUI only; no embedded web UI).

In iTerm, run:

```sh
cd /Users/benji/Desktop/OliveCode_main/opencodeFORK
./packages/opencode/dist/opencode-darwin-arm64/bin/opencode
```

Use `/local` to open installed models; select **Download other models** to run the hardware recommendation. Use `/cloud` to open connected cloud models and cooldowns. A real download is initiated only when a suggested model is selected.

### Additional research evidence (2026-09-19)

- NVIDIA public served IDs: https://integrate.api.nvidia.com/v1/models — 82 IDs, Kimi K2.6 present, DeepSeek V4 Pro 0813 absent.
- OpenRouter live model list: https://openrouter.ai/api/v1/models — `cohere/north-mini-code:free` present with `prompt: "0"` and `completion: "0"`.
- Groq billing and limits: https://console.groq.com/docs/billing-faqs and https://console.groq.com/docs/rate-limits — preserve free-plan vs paid-plan disclosure; keys do not themselves establish the user's billing tier.
- Mistral activation: https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key — Free mode is enabled without a credit card. Account/model-specific inference remains to be verified.
