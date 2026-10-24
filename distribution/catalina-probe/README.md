# Catalina runtime diagnosis

This is an isolated development experiment. It does not add Catalina support to the public installer and must not be published as a supported application build.

The current release uses a runtime requiring newer macOS. This probe bundles the current application source with modern Bun, lowers unsupported JavaScript syntax, and runs it with the checksum-verified official Bun 1.0.14 Intel baseline runtime. Compatibility adapters cover missing APIs that the local model/file smoke tests exercise. Unsupported SQLite 64-bit integer mode throws explicitly.

On Apple Silicon under Rosetta, the full interface draws its welcome screen and then crashes in the historical runtime. Small animated renderer/editor probes can succeed, but crashes are intermittent. The native Intel workflow checks the complete interface against a current-runtime control and types into its prompt. Both runs use temporary homes, disabled provider discovery, no account credentials, and no paid inference. Test reports are retained for seven days; application bundles are not uploaded.

The workflow deliberately retains published native libraries requiring macOS 13 because this test isolates the CPU/runtime crash on macOS 15. A separate local OpenTUI build already targets macOS 10.15. Neither test certifies Catalina: actual macOS 10.15 testing, optional native-feature checks and a runtime security/support assessment remain required before release.

## Run

Install repository dependencies with the repository's Bun version. In this folder, install the pinned probe dependencies with `npm ci --ignore-scripts --no-audit --no-fund`, then run `bun build.ts` and `python3 fetch-runtime.py`. The downloaded runtime stays under this folder and does not replace a globally installed runtime.

Run `runtime/bun --no-install output/runtime-adapters-test.js` for adapter behavior, and `python3 terminal-check.py output/olivecode-probe results/historical-runtime.json` for terminal startup and text input. `OLIVECODE_PROBE_SOURCE` can point the builder at a separate source checkout when diagnosing local changes.

The old runtime checksum is pinned from the upstream [Bun 1.0.14 checksum manifest](https://github.com/oven-sh/bun/releases/download/bun-v1.0.14/SHASUMS256.txt). Lowering an executable's minimum-version header is not a compatibility fix; this probe does not do that.
