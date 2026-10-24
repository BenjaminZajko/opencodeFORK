# Catalina runtime diagnosis

This is an isolated development experiment. It does not add Catalina support to the public installer and must not be published as a supported application build.

The current release uses a runtime requiring newer macOS. This probe bundles the current application source with modern Bun, lowers unsupported JavaScript syntax, and runs it with the checksum-verified official Bun 1.0.14 Intel baseline runtime. Compatibility adapters cover missing APIs that the local model/file smoke tests exercise. Unsupported SQLite 64-bit integer mode throws explicitly.

On Apple Silicon under Rosetta, the complete preview interface and typed input pass a bounded 35-second test with a clean exit. The hosted native Intel terminal checks still fail for both historical and current-runtime controls; that diagnosis remains open. The native Intel workflow checks the complete interface against a current-runtime control and types into its prompt. Both runs use temporary homes, disabled provider discovery, no account credentials, and no paid inference. Test reports are retained for seven days; application bundles are not uploaded.

The workflow deliberately retains published native libraries requiring macOS 13 because this test isolates the CPU/runtime crash on macOS 15. A separate local OpenTUI build already targets macOS 10.15. Neither test certifies Catalina: actual macOS 10.15 testing, optional native-feature checks and a runtime security/support assessment remain required before release.

## Run

Install repository dependencies with the repository's Bun version. In this folder, install the pinned probe dependencies with `npm ci --ignore-scripts --no-audit --no-fund`, then run `bun build.ts` and `python3 fetch-runtime.py`. The downloaded runtime stays under this folder and does not replace a globally installed runtime.

Run `runtime/bun --no-install output/runtime-adapters-test.js` for adapter behavior, and `python3 terminal-check.py output/olivecode-probe results/historical-runtime.json` for terminal startup and text input. `OLIVECODE_PROBE_SOURCE` can point the builder at a separate source checkout when diagnosing local changes.

The old runtime checksum is pinned from the upstream [Bun 1.0.14 checksum manifest](https://github.com/oven-sh/bun/releases/download/bun-v1.0.14/SHASUMS256.txt). Lowering an executable's minimum-version header is not a compatibility fix; this probe does not do that.

## Catalina hardware report and timezone fix

The physical Intel Mac mini report confirms that Bun starts, the rebuilt native terminal library allocates/frees its configuration, and the parser worker produces 14 JavaScript highlights. Application startup fails with missing `_ucal_getHostTimeZone` in Catalina’s system ICU.

The pinned engine calls that newer function only when no timezone override is set ([engine source, lines 575-603](https://github.com/oven-sh/WebKit/blob/b72b839d2c18ae71952d215a9654797f044b67e7/Source/JavaScriptCore/runtime/JSDateMath.cpp#L575-L603)). The experimental wrapper sources `timezone-env.sh` before starting Bun: it preserves a nonempty `TZ`, otherwise reads the local IANA identifier from `/etc/localtime`. It never changes system settings or substitutes UTC. Missing/unrecognized paths stop with a diagnostic.

`python3 test-timezone.py results/timezone.json` compiles a test-only interposer that terminates any call to the unavailable function. The negative control must exit 88; automatic detection and four explicit zones must pass winter/summer offset comparisons with `/bin/date`, in both main and worker threads. The actual application version must then start with that same trap active. The interposer is never included in the portable preview.

`package-preview.py` prepares the isolated ZIP using the separately rebuilt Catalina terminal library. Preview r2 adds the timezone fix and an offline timezone check. It still requires another physical Catalina run: simulation of one unavailable API does not establish compatibility of the whole runtime.
