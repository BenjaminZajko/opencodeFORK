# OliveCode sponsor reporting service

Status: client integration, explicit `/privacy` preferences and a Cloudflare SQLite Durable Object deployment are implemented and locally tested. The free production endpoint is https://olivecode-reporting.olivecode-ai.workers.dev and passed health and owner-auth checks. The next app release remains pending; existing app versions do not send these events. There is no active sponsor campaign.

## What it does

- The publisher signs a campaign with an Ed25519 private key; the app and service contain only the verification key. Altered copy, links, unsigned messages, and expired campaigns are rejected.
- `POST /v1/delivery` (no body) returns the verified campaign and a five-minute server-signed receipt containing a random nonce. Merely delivering a campaign does not increment views.
- `POST /v1/event` accepts only `{receipt,kind}` with `kind` equal to `view` or `click`. A view cannot be acknowledged in the first second. Clicks require a previously accepted view. A receipt counts at most once for each event kind, including retries.
- `GET /v1/report` requires the separate owner reporting secret as a Bearer token. It returns UTC day, campaign ID, reported views, and clicks. It does not return individual users or raw events.
- SQLite stores aggregate totals plus temporary receipt hashes for deduplication. Expired receipt hashes are removed when the next sponsor event is processed. No prompts, files, provider accounts, emails, device fingerprints, or installation identifiers are accepted. The server necessarily sees a network address; an in-memory keyed hash is used for short rate limits, with no raw address stored in the database. Host/proxy logs must be configured separately and disclosed before deployment.

## Local operation

Run `bun test ./services/sponsors/service.test.ts`. To start a private local service, set these environment variables through your server's secret manager or local environment, then run `bun services/sponsors/start.ts`:

- `OLIVECODE_SPONSOR_CAMPAIGN`: path to the signed campaign JSON.
- `OLIVECODE_SPONSOR_PUBLIC_KEY`: path to the publisher's public Ed25519 PEM key.
- `OLIVECODE_SPONSOR_RECEIPT_SECRET` and `OLIVECODE_SPONSOR_REPORT_SECRET`: independent random server-only secrets, at least 32 characters. Never bundle either in the app or website.
- Optional `OLIVECODE_SPONSOR_DB`: persistent database path, default `sponsors.sqlite`.
- Optional `OLIVECODE_SPONSOR_PORT`: default 8787.

The service binds only to loopback. Put it behind HTTPS and a configured rate-limiting gateway for deployment, with persistent disk and database backups. Do not trust client-supplied forwarding headers; the implementation uses the actual connection address. A reverse proxy needs trusted address forwarding designed before public deployment, otherwise users share the proxy's rate limit. This is a single-server pilot, not a distributed ad network.

## App integration boundary

The app's compiled configuration is `packages/tui/src/olivecode/sponsor-config.ts`; it currently contains no public key or signed campaign. Use `bun distribution/sponsors/sign.ts campaign.json private-key.pem signed-campaign.json` to sign approved copy. Keep the signing key outside the repo and build artifacts. The signer refuses to overwrite an output file.

The `/privacy` dialog has separate usage and sponsor switches, both off by default. The sender requests a receipt only after sponsor opt-in and only with a compiled public key/campaign and reporting endpoint. It verifies the delivered signed campaign, then waits 1.1 seconds. Unmounting, a covering dialog, a compact or truncated layout, disabling reporting, or losing terminal focus cancels the timer/request. Focus must have been positively reported by the terminal. Opening links never waits for reporting. Events are best effort, with bounded timeouts; the service deduplicates repeat acknowledgements. Campaign refresh does not create new impressions for unchanged content. This does not prove human attention or OS window occlusion.

## Optional app usage

`POST /v1/usage` accepts exactly `{day,id,version,platform,first}`. The client sends nothing until usage opt-in. `id` is derived from a locally kept random secret and the UTC day; the local secret never leaves the device. Only a hash of that rotating token is stored for deduplication; hashes older than eight days are removed when the next usage report is processed. Reports expose daily aggregates by app version and OS, never tokens. A first report marks a **first measured launch**, not an installer completion. If its acknowledgement is lost, same-day retries reuse the token. A later-day report does not retry the first-launch flag, avoiding duplicate first launches at the cost of possible undercounting. Daily counts describe reporting installations, not unique people; multiple concurrent initial launches, reinstalls, disabled reporting and modified clients limit accuracy. Aggregate counts cannot connect a particular Instagram viewer to an installation.

## Cloudflare deployment (Free)

`wrangler.jsonc` declares a single SQLite-backed Durable Object. Worker observability is disabled; no handler logs bodies, credentials or addresses. Provider infrastructure still processes connection metadata. Use the official Wrangler tool with account/user read and Workers Scripts Write access; no zone/DNS or billing write access is needed. Verify the account remains on Workers Free before deployment. Do not activate a paid plan.

Create separate cryptographically random server-only `RECEIPT_SECRET` and `REPORT_SECRET` values with `wrangler secret put`. Do not put them in source, a public site, an app, or command-line arguments. Deploy with `node ../../site/node_modules/wrangler/bin/wrangler.js deploy`. Check `/health` and that `/v1/report` returns 401 without owner authorization. Keep test events in the local runtime, outside production totals. Only after those checks set the public HTTPS URL in `packages/tui/src/olivecode/measurement-config.ts` and build a new release. Existing v0.1.0 installations need one manual upgrade; this code cannot retroactively notify them.

Local verification: `wrangler dev --local --port 8843` with test-only secrets, followed by `node check-local.mjs`. This verifies the actual Worker SQLite adapter, not just the Bun service. The `/v1/report` owner endpoint returns sponsor rows and usage aggregates. No report secret is required by or distributed to users.

## Limits to explain to sponsors

Call the metric **reported views**, not verified human attention, unique people, downloads, or audited impressions. A locally modified client or script can suppress or simulate events. Server signatures prevent invented receipts and duplicate retries, but cannot prove that a person read an ad or prevent someone requesting fresh receipts. There is deliberately no identity fingerprint or prompt-based profiling. Flat-fee campaigns remain the right pilot; do not bill per impression until real fraud controls and reporting terms exist.

Read current aggregates privately with `node services/sponsors/read-report.mjs`. It uses the mode-600 ignored `.dev.vars.production` file next to the script; never distribute that file.
