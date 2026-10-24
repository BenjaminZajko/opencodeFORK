# Sponsor security and measurement decision

## Hashing versus protecting the app

A hash detects a change; it does not conceal sponsor text. Encryption or obfuscation can make casual editing harder, but a local app has to decode the message to display it. A determined user can patch rendering or block network access. A private signing key stays outside the app: the app receives a public key and checks the publisher's signature. This authenticates approved campaigns without placing a reusable secret on users' computers. It does not force modified copies to display ads.

That distinction is now implemented in the app's campaign validation, with a publisher signing tool. No active sponsor is configured. Ordinary use should continue offline and when the sponsor service is unavailable. OliveCode uses users' own provider accounts, so it does not control their third-party model access through an advertising server.

The app reserves a rounded `Sponsored` card on the welcome screen and a smaller bordered card above the chat composer. Welcome cards have room for a sponsor name, useful message and separate visit link; chat cards show the name/destination and message in two content rows. The shared placement shows verified campaign copy and its destination hostname; clicking it opens that sponsor's HTTPS website. With no available, valid campaign, it displays `Ad unavailable right now.` without a link, spinner or repeated error alerts. The height stays fixed between active and unavailable states. Long copy truncates, and windows shorter than 24 rows use one content row to preserve room for the prompt. Campaign validity is refreshed at least once per minute and at the exact expiration time, and clicking rechecks validity. Mounting/unmounting cancels refresh timers. This current placement reads the compiled signed campaign; remote delivery remains unconfigured. Displaying the placeholder or an ad sends no measurement event.

## How counts work

Reported views and clicks can be useful for a sponsor, but are not required for the first flat-fee placement. Downloads and app opens do not establish that an ad was visible. A view should acknowledge a complete, rendered sponsor line after at least one second; terminal clients cannot prove actual user attention. Re-renders and retries must reuse the same server-issued receipt so they do not inflate totals. The local service already verifies short-lived receipts, deduplicates events, enforces a delivery rate limit, and exposes authenticated daily aggregates. It accepts no coding activity.

The service is not deployed or connected to the current app. Measurement is off; a user-facing reporting setting, HTTPS hosting, and complete visibility-aware sender must be finished before activation. Prefer opt-in reporting for this pilot and report the resulting counts honestly as a subset. This preference was presented to the owner and remains pending. Details: `services/sponsors/README.md`.

## What the comparison actually shows

The requested `freebuf.com` is a cybersecurity publication. Its [official company page](https://www.freebuf.com/company/) offers banner placements by time period and sponsorship packages. It is not the coding agent.

The closer comparison is **Freebuff** at `freebuff.com`. Its [advertiser security overview](https://freebuff.com/ads/security) describes aggregate reporting and opaque signed click identifiers. Its [advertiser terms](https://freebuff.com/ads/terms) describe click/conversion/activation billing and invalid-event adjustments. Its public [view acknowledgement module](https://github.com/CodebuffAI/freebuff/blob/main/common/src/ads/first-party-view-ack.ts) reuses identifiers for bounded retries; its [partner-ad module](https://github.com/CodebuffAI/freebuff/blob/main/cli/src/ads/partner-ads.ts) acknowledges held deliveries at most once. These are observable mechanisms, not evidence of secret anti-tamper protection.

Freebuff's [privacy policy](https://freebuff.com/privacy-policy) also describes using prompt data for personalized ads. OliveCode should keep sponsorship separate from prompts and projects. We can borrow the delivery/acknowledgement separation without copying that targeting approach.

## Recommended business shape

A relevant, clearly labeled sponsor on the welcome screen and in the chat composer; a fixed-duration flat-fee pilot; optional aggregate reporting after implementation and disclosure. Show sponsors the exact official placements and agreed dates. Do not promise every modified copy will show it, unique audience figures without measurement, or impossible-to-fake views. Keep the coding tool useful and the placement small.
