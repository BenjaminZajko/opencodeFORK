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

## Preview r3: number formatter initialization

The physical Catalina interface launch fails at `_unumrf_openForSkeletonWithCollapseAndIdentityFallback`, even though all r2 offline checks pass. The pinned engine eagerly initializes this newer number-range formatter in the ordinary `Intl.NumberFormat` constructor ([engine source](https://github.com/oven-sh/WebKit/blob/b72b839d2c18ae71952d215a9654797f044b67e7/Source/JavaScriptCore/runtime/IntlNumberFormat.cpp#L560)). The interface initializes USD cost formatters before rendering.

Only on Bun1.0.14, the compatibility adapters now load pinned FormatJS9.4.3 `polyfill-force` with English and Slovak number locale data before importing the application. This implements formatting in JavaScript rather than fabricating an ICU native result. Unsupported number locales use the bundled fallback. Current-runtime controls retain native NumberFormat. Dependencies and locale data are bundled; the preview does not download them when launched. FormatJS licenses accompany the preview.

The offline checker now exercises currency (including negative and zero), compact counts, percentages, Slovak separators, number parts/ranges, errors and other interface Intl helpers in both main and worker threads. The normal version check alone is not an interface compatibility test.

An audit compares all159runtime ICU imports with Apple’s ICU-64260.0.1 public headers. Thirteen imports lack declarations in those headers; this is a conservative potential-gap list, not proof of the exact system dylib exports. The test-only interposer blocks all13, and separate timezone/number negative controls must fail88. The formatting/helper and interface tests must pass with that interposer active. This does not simulate all OS differences; another physical Catalina test remains required.

## Preview r4: corrected failure simulation and plural-rule dependency

Physical r3 checker and interface both still fail on the number-range symbol. The FormatJS number implementation constructs `Intl.PluralRules`, and the archived engine initializes the same newer ICU number-range formatter for plural rules ([engine source](https://github.com/oven-sh/WebKit/blob/b72b839d2c18ae71952d215a9654797f044b67e7/Source/JavaScriptCore/runtime/IntlPluralRules.cpp#L140-L144)). r4 loads pinned JS PluralRules before NumberFormat, with en/sk locale data.

Important correction to earlier evidence: protected `/bin/sh` startup stripped DYLD_INSERT_LIBRARIES in positive test cases. Direct negative controls retained it, so r2/r3 positive cases gave false confidence about ICU isolation. Their ordinary local results remain observations on a modern OS, but their claimed absent-API simulation is invalid and superseded. The harness now forwards the library path in a separate test variable and exports DYLD_INSERT_LIBRARIES inside the shell immediately before exec of Bun. A native PluralRules negative control through that same shell boundary must fail88 at the exact missing symbol.

With the injection working, the Intl helper tests also expose `ulistfmt_openForType`. r4 adds pinned JavaScript ListFormat and Segmenter compatibility implementations rather than leaving those interface text paths tied to newer ICU APIs. The string-width adapter is imported after replacing Segmenter, since it captures a segmenter at module initialization. The diagnostic library now prints the exact reached symbol.

All compatibility polyfills remain confined to the archived-runtime preview. They are bundled with their required licenses; there is no runtime dependency download or global toolchain change. Actual Catalina r4 interface verification is still required.
