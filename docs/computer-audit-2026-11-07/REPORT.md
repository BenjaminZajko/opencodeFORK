# Computer feature audit — 7 November 2026

**Superseded native-permission findings:** see [the Visible Control follow-up](visible/REPORT.md) for the repaired bundle, ready:true result and actual TextEdit tests. Latest installed CLI is 0.3.1-local.20261107.3.

Installed local CLI: `0.3.1-local.20261107`. Previous executable retained at `~/.local/share/olivecode/versions/olivecode-before-computer-20261107`. No public release or desktop-app bundle update.

## Improvements
- Ordinary HTML dropdowns now expose their options and support selecting one exact observed label or value. Selection uses browser approval, verifies the target, emits input/change events and returns a fresh observation. Ambiguous labels, disabled options/groups, private controls and multiple-select lists are refused.
- Read-only and aria-disabled controls fail before sending input. Disabled fieldsets and changes to dropdown options participate in stale-control validation.
- Compact Computer menus omit repeated footer shortcuts and long details, retaining the options and permission information; scrolling is visibly indicated.

## Verification
- Baseline Computer/browser/tool tests: 50 passed, 1 native-path-dependent skip. First restricted attempt failed to bind fixture ports; rerun with local-server permission passed. Those port failures were not product failures.
- Final Computer/remote/tool-isolation suite: 97 passed, 1 native-path-dependent skip. The skipped native-status check was then run with the installed helper: all 10 desktop transport/status tests passed. This yields 98 distinct passing backend checks.
- Computer TUI menu/approval/phone-entry checks: 14 passed, including 60x20 and 120x30 layouts.
- Backend and TUI typechecks passed.
- Compiled visible and background browser tasks passed against local fixture sites and scripted models, including tabs, text replacement, dropdown selection, saving/verifying results, separate screenshot approval, actual PNG delivery, error recovery and Stop. The final versioned executable was rechecked before installation. No real cloud-model quality claim is implied.
- Native helper self-test passed: gestures, coordinate bounds, key mappings, observation references and cancellation algorithms; no live app input was sent.
- Background VM manager self-test passed resource/insufficient-host guards and manifest round trip. No VM or macOS download was started.

## Live verification limits
- The computer-use tool refuses Terminal GUI control. The installed CLI was launched in an interactive PTY and its Computer menu inspected; this is not a Terminal-window GUI test.
- With explicit user approval and user authentication, OliveCode Computer was added and enabled in System Settings > Privacy & Security > Device Control and Data Access (this host's name for the permission). Screenshot retained. Nevertheless a newly started installed helper reports `accessibility:false`, `ready:false`, `screenRecording:true` from the command-runner context. Do not claim native mouse/keyboard, app activation, window switching, OCR, screenshots or drag are live-verified. Cause unresolved; test again from the user's normal Terminal process before attributing it to app code or macOS.
- No Background Mac SSH alias is configured in this test environment, so actual guest app operation is unverified. Transport isolation/host identity tests pass; they are not proof of a running guest.
- Phone integration tested with fixtures; no real Telegram/WhatsApp messages were sent and no account configuration changed.
- Ordinary custom web dropdown widgets, multi-selects, upload/file pickers and canvas controls still have the documented limitations.

112 distinct automated backend/TUI checks passed; two compiled browser workflows plus native and VM self-tests passed. This is a bounded audit, not a claim that every possible website, app or model combination is perfect.
