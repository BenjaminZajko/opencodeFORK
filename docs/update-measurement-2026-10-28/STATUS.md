# Update notifications and optional measurement

Implemented on 28 October 2026:

- Stable OliveCode update lookup uses only the official GitHub repository. It requires all eight packages, checksums and a release-verification record, ignores older/prerelease/incomplete responses and fails quietly offline. Existing autoupdate=false and disable flags are respected. The app offers to open the official release page and never replaces the running executable automatically. A skipped version stays skipped.
- `/privacy` exposes separate, explicit opt-ins for basic usage and sponsor reporting. Both default off. The compiled endpoint sends nothing until the corresponding setting is enabled.
- Usage reports count first measured launches and reporting installations per UTC day. Tokens rotate daily; local identity secrets, prompts, files, credentials and accounts are never sent. First launches are not installer completions, and daily installations are not unique people.
- Signed sponsor receipts count only after dwell, focus and full-layout checks. Covering dialogs, blur, unmount and disabling consent cancel counting. Links work with reporting off. An unchanged minute refresh cannot add an impression.
- A Worker with persistent SQLite Durable Object storage exposes protected aggregate reports. There is no active sponsor campaign. Request logging is disabled in the Worker configuration.

Verified: core/opencode/tui type checks; updater release filtering; usage opt-in, daily deduplication/rotation and retry; signed sponsor dwell/click and cancellation; terminal privacy renderer and consent disclosure; real terminal `/privacy` command; Cloudflare local runtime with persistence, owner auth and strict payload rejection.

Production backend: https://olivecode-reporting.olivecode-ai.workers.dev, deployed on the confirmed Workers Free plan. Public health returned 200, unauthenticated report 401, owner report 200 with empty arrays. No synthetic events were added to production. Native release and publication remain pending. Existing v0.1.0 users need one manual update to receive future notices. Historical active-user/sponsor totals cannot be reconstructed. This is basic aggregate measurement, not per-reel installation attribution, audited ad attention, or an ad-billing system.
