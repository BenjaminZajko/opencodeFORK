# OliveCode distribution

The macOS, Windows and Linux installers place OliveCode under the user's home directory and expose `olivecode` on the command path. Invoking it inside a project opens that exact current directory. Supported CPUs are x64 and ARM64. Linux has glibc and musl packages; x64 release builds use Bun baseline targets for broader CPU compatibility. The current macOS packages require **macOS 13 or newer**, for both Intel and Apple Silicon. The one-command installer detects macOS with `sw_vers`, selects the native CPU package (including when run under Rosetta), and refuses unsupported/unknown macOS versions before downloading anything or changing an existing install. Intel/baseline describes CPU instructions; it does not mean Catalina support. A verified Catalina-compatible runtime/package does not currently exist. macOS Computer helpers have their own newer requirements.

This does not support 32-bit PCs, Android/iOS terminals, or every older OS.

Build a target with `bun run --cwd packages/opencode script/build.ts --target=darwin-arm64` (or `windows-x64`, `windows-arm64`, `linux-x64`, `linux-arm64`), then package it with `bun distribution/package.ts <target>`. Package names are stable so the installers can use `releases/latest/download` without knowing the version. Publish the archive, its `.sha256`, `install.sh`, `install.ps1` and the native-workflow-generated `release-verification.json` together in one release.

The installer verifies the archive checksum and then checks the executable version. A checksum beside an archive protects against transfer errors; it is **not** a signature if both come from a compromised release. Sign and notarize public macOS binaries and sign Windows binaries before treating this as a broadly trusted distribution. Test Windows on Windows, including a fresh user profile, terminal launch, model connection, and local Ollama path, before removing the site's preview notice.

For a local macOS test, set `OLIVECODE_ARCHIVE_PATH` and `OLIVECODE_SHA256_PATH` to packaged files and run `sh distribution/install.sh`. The Windows script accepts the same two environment variables.


## One-command installation after release publication

macOS / Linux:

```sh
curl -fsSL https://olivecode.dev/install | sh
```

Windows PowerShell:

```powershell
irm https://olivecode.dev/install.ps1 | iex
```

Then open a new terminal (Windows installer also updates the current PowerShell), go to a project folder and run `olivecode`. The installer never changes the working project directory. macOS/Linux stores versions in ~/.local/share/olivecode and the command in ~/.local/bin. Windows uses %LOCALAPPDATA%/OliveCode and updates the User PATH; no administrator access is needed. Paths with spaces are supported. Linux needs curl, unzip and a SHA-256 utility; supported interactive bash/zsh profiles are updated idempotently. Windows executable replacement fails with an actionable message if OliveCode is still running.

These public URLs require a published GitHub release; do not advertise them as live before assets exist. The owned Cloudflare Pages site serves /install and /install.ps1 only after the public-release verification gate passes. See `docs/OLIVECODE_CLOUDFLARE_LAUNCH.md`. The existing site stays in preview mode until publication and target checks are complete.

## Release gate

The manually dispatched OliveCode preview packages workflow builds eight platform/ABI variants and runs the actual installer on native Windows/macOS/Linux runners, using Alpine containers for musl. x64 baseline variants are packaged with normal x64 archive names. Publication defaults OFF; setting publish only uploads after every package/install job succeeds. It uploads installer scripts, archives and checksums together. Source changes and workflow must first exist on GitHub; local cross-compilation is not native runtime verification.
