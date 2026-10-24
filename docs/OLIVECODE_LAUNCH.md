# OliveCode launch plan

Current deployment instructions: [Cloudflare launch guide](OLIVECODE_CLOUDFLARE_LAUNCH.md). Domains are now owned: olivecode.dev (primary), olivecode.online (redirect). Hosting chosen: Cloudflare Pages Free; Websupport has registrations only. Contact: olivecode.ai@gmail.com. Public app downloads remain gated on a verified release.

## Revenue

Start with a flat-fee, clearly marked sponsor placement on the welcome screen and in chats, clearly separated from agent answers, activated only after sponsor name, copy, HTTPS URL, and campaign dates are agreed. Keep it outside model selection, recommendations, and assistant-generated answers. Do not use prompt text, project files, provider account data, or model choices for targeting. The website explains the placement but carries no ads. `packages/tui/src/olivecode/sponsor-config.ts` is intentionally empty until there is a real partner. A sponsor line appears only for the contracted dates in a new app release.

Offer one introductory pilot to a developer tool whose free offering is genuinely useful to OliveCode's audience. Agree a flat fee for a short period, supply a screenshot proof of placement, and report only defensible public distribution figures. Do not quote impressions, active users, or click rates without measurement and consent. Price after early usage evidence; do not pre-sell reach.

### Sponsor removal and official releases

People control the software on their own computer. Someone can patch a binary or rebuild the source to remove a bundled sponsor message; no local integrity check can guarantee prevention because that check can also be removed. Do not add online activation, fail the app when a sponsor cannot load, or interfere with coding to enforce advertising. A small relevant placement gives users less reason to remove it.

Release signing and trustworthy download checks protect the authenticity of official builds, rather than locking sponsor messages into every modified copy. Sell the pilot as a flat-fee placement in official releases, explain the possibility of modified copies, and avoid promises about views. Keep any future measurement separate from prompts and project content, with an explicit privacy decision before implementation.

### Domain decision — checked 2 October 2026

Keep the OliveCode name. Prefer `olivecode.dev`; `getolivecode.com` and `olivecode.app` are alternatives. Direct registry RDAP queries returned 404/no registration record for all three at the time of checking. This is not a registrar availability or price guarantee: confirm availability, renewal price, and any premium pricing at checkout before buying. Domain research above is historical: the user subsequently bought olivecode.dev and olivecode.online. Use the Websupport guide linked above.

The site preparation step already publishes the canonical scripts at `/install` and `/install.ps1`. After domain ownership and release testing, a branded command can download this script while the script fetches packages from GitHub. No need to rename the project or purchase the taken `.ai` domain to accomplish that.

## Release gates

1. Give the project a public-facing repository name and a domain when chosen; point the site and installer URLs to them.
2. Build and test macOS and Windows binaries on their actual operating systems. Sign/notarize as appropriate, and verify fresh-install behavior, `olivecode` in the current folder, free-provider connection, local Ollama setup, updates, and uninstall.
3. Publish the stable-name release archives, checksums, and install scripts together. Test the website's copied commands against the public release.
4. Choose a host and sponsor/privacy contact. Update the privacy page with host log handling, publish the site, and remove the preview notice.
5. Invite a small external beta group first. Record install success, first-task success, and the main reason for leaving. Fix blockers before wider promotion.

## Marketing sequence

Lead with a short real demonstration: open a project folder, type `olivecode`, select a free model, complete a useful change, and show Teamwork / Follow-through details. Explain that free providers have their own limits and Ollama needs local resources. Publish a concise launch page, a 60–90 second screen recording, and a repeatable example project. Share the demo where developers already discuss free AI tools, with the community's rules in mind. Ask beta testers for specific feedback and permission before quoting them.

After the install funnel works, approach aligned sponsors with a one-page pitch: who OliveCode serves, the exact labeled placement, a sample screenshot, campaign dates, and verified reach. No model paywalls or paid-model upsells are part of the product.

### Release-day post (publish only after the release gates pass)

> OliveCode is now available for macOS and Windows. Open a terminal in your project, type `olivecode`, and build with free cloud models or a model running through Ollama on your computer. Teamwork asks for another perspective; Follow-through checks the result before it calls the task done. Both are optional. The app is free, and model providers may have their own free limits. See the install guide and a real task demo on the OliveCode site.

### 75-second demo outline

1. Show an ordinary project folder and type `olivecode` in its terminal. Keep the folder path visible.
2. Select a genuinely available free cloud model. Show the model name and provider clearly.
3. Ask for one concrete change with a verifiable result. Keep the prompt and work small enough to finish on camera.
4. Show Teamwork's second opinion and Follow-through's review while the task runs. End on the concise final answer and open the details once.
5. Show the changed file and run the relevant check. Finish with the one-command install and the plain-language note about provider limits.

Avoid canned model responses or exaggerated speed claims. Record the real build used for release, including any meaningful retry or limitation.
