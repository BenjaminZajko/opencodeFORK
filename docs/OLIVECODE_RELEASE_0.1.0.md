# OliveCode 0.1.0 release candidate

This is the first public preview candidate, not a claim that every inherited OpenCode integration is supported.

## Checks before publication

- All 30 repository package type checks passed locally.
- Terminal UI: 260 passed, 1 skipped. Fixed first-run guide compression at 48x24 and isolated preferences in tests.
- Feature suite: 429 passed, 2 skipped, 0 failures on the final combined run. Fallback fixtures explicitly whitelist their test models so a live-catalog refresh does not silently change the scenario. The live OpenRouter catalog confirmed Laguna S 2.1 and North Mini Code are zero-cost tool-capable variants on 16 October 2026.
- Compiled macOS Apple Silicon executable: cloud and local adapters, tool calls, Assist planning, second opinions, progress review, corrective continuation, off switches, free-only policy and OliveCode data namespace passed using isolated local model servers. This is not a claim about subjective output quality or provider uptime.
- Fresh packaged macOS Apple Silicon install passed with isolated home and project paths containing spaces, including actual project-local olivecode.json discovery, help and safe upgrade.
- Sponsor service: 3 tests passed; shared sponsor policy: 4 tests passed.
- Installer: six Unix platform/ABI selection cases, checksum rejection, current-directory preservation, repeated install, and same-version content collision rejection passed.
- Site/release gate: 20 tests passed. Public download gate remains closed until native CI and public asset verification succeed.
- The broad inherited backend suite is not green: 3595 passed, 251 failed, 23 skipped, 1 todo before fixture refresh. Failures include tests expecting removed paid providers, OpenCode file names and paths; these must not be reported as passing. Dedicated OliveCode release coverage is enumerated in the release workflow.

## Platform boundaries

Native Windows, Intel Mac and Linux execution must pass the eight-target GitHub Actions matrix before publication. Computer control of native apps requires macOS 14+; Windows/Linux support coding and browser control. Isolated Mac mode requires a configured guest/second Mac. Telegram needs the user's paired bot and an awake host. WhatsApp remains an advanced preview, requiring eligible Meta business setup and an HTTPS endpoint; no live Meta delivery claim.

The distribution is not Developer ID notarized or Authenticode signed. Published SHA-256 files verify transfer integrity, not independent signing. Model/provider quotas remain external limits. Sponsors are explicitly labeled; no active campaign is implied by an unavailable placement.

## Release isolation

All builds use an OliveCode channel, including plain semver releases. The upstream updater remains disabled. Every native build must pass version, help and safe upgrade checks; non-musl binaries also run compiled chat/tool/Assist integration. Unix and Windows installers reject replacing an existing version with different contents.

## Publication status

GitHub CLI workflow authorization was completed, the release branch was pushed, and hosted quality checks have started. Publication remains gated on successful native platform checks and verification of the public release assets.
