# OliveCode sponsor reporting service

Status: locally tested foundation. Not deployed, not connected to the app, and not collecting real users' events. The current app has no active campaign. Reporting stays off until a user-facing measurement setting and a public HTTPS endpoint are ready.

## What it does

- The publisher signs a campaign with an Ed25519 private key; the app and service contain only the verification key. Altered copy, links, unsigned messages, and expired campaigns are rejected.
- `POST /v1/delivery` (no body) returns the verified campaign and a five-minute server-signed receipt containing a random nonce. Merely delivering a campaign does not increment views.
- `POST /v1/event` accepts only `{receipt,kind}` with `kind` equal to `view` or `click`. A view cannot be acknowledged in the first second. Clicks require a previously accepted view. A receipt counts at most once for each event kind, including retries.
- `GET /v1/report` requires the separate owner reporting secret as a Bearer token. It returns UTC day, campaign ID, reported views, and clicks. It does not return individual users or raw events.
- SQLite stores aggregate totals plus temporary receipt hashes for deduplication. Receipt hashes are removed by minutely cleanup after expiration. No prompts, files, provider accounts, emails, device fingerprints, or installation identifiers are accepted. The server necessarily sees a network address; an in-memory keyed hash is used for short rate limits, with no raw address stored in the database. Host/proxy logs must be configured separately and disclosed before deployment.

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

After the reporting preference is decided, the app needs a settings control and a sender that requests a receipt only when reporting is enabled, verifies the returned campaign against the compiled public key and displayed campaign ID, waits while the complete sponsor line is actually rendered, and acknowledges it once. Cancel the dwell timer when the line disappears, a dialog covers it, or the home route closes; never count a render from a hidden/small layout. Click reporting must not block opening the sponsor's website. Retry using the same receipt; timeout quietly and never stop coding because reporting fails. Do not enable counting before that integration is complete.

## Limits to explain to sponsors

Call the metric **reported views**, not verified human attention, unique people, downloads, or audited impressions. A locally modified client or script can suppress or simulate events. Server signatures prevent invented receipts and duplicate retries, but cannot prove that a person read an ad or prevent someone requesting fresh receipts. There is deliberately no identity fingerprint or prompt-based profiling. Flat-fee campaigns remain the right pilot; do not bill per impression until real fraud controls and reporting terms exist.
