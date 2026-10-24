# OliveCode website

The first screen uses the terminal pixel logo on neutral surfaces and centres on installation, selects macOS or Windows from browser platform hints, and offers an explicit OS switch. Supported Linux users can select the shell installer; mobile visitors get desktop guidance. Fonts and assets are local; there are no website ads or analytics.

Run `bun site/prepare.ts` from the repository root to prepare `site-dist/`. The output includes `/install` and `/install.ps1` plus public site assets. Install endpoints remain safely disabled until the public-release verification gate passes. Serve that folder using a static host. The source HTML can be inspected directly, but module scripts need an HTTP/HTTPS server.

For local previews, run `python3 site/preview.py` after preparation and open `http://127.0.0.1:8765/`. This server binds only to localhost and sends `Cache-Control: no-store`, so Safari and other browsers load current files after edits. Preparation also versions CSS, JavaScript (including module imports), and image URLs on every build to prevent mixing assets from different builds on static hosts.

## Production: olivecode.dev on Cloudflare Pages

The primary origin is `https://olivecode.dev`; `olivecode.online` and both `www` names permanently redirect to it. Contact is **olivecode.ai@gmail.com**. Use Cloudflare Pages Free; the Websupport account has domain registrations only. See [the Slovak deployment guide](../docs/OLIVECODE_CLOUDFLARE_LAUNCH.md) for Direct Upload, DNS migration, redirect rules and final checks.

```sh
bun install --cwd site --frozen-lockfile
cd site
bun test ./install.test.ts ./launch.test.ts
cd ..
OLIVECODE_SITE_ENV=production bun site/prepare.ts
bun site/check-launch.ts
bun site/package.ts
```

Upload `distribution/cloudflare/OliveCode-olivecode.dev-web.zip` using Pages Direct Upload; it includes `_headers` and `_redirects`, and no `.htaccess`. Configure hostname redirects separately in zone Redirect Rules. The ZIP contains public static files only. Do not upload the source repository, app credentials, databases, Computer helper or Remote/sponsor services. The site has no analytics or advertising trackers.

Default builds are noindex previews. Production builds include canonical URLs, metadata, share image, sitemap, security headers, domain redirects, clean page URLs and a real 404. Local preview supports the same clean page URLs without redirecting localhost. Cache versions prevent mixing old and new assets.

### Enable app installation only after publication

A production website can be published before app packages are available. Until then copy stays disabled, and install endpoints return a plain-text explanation that exits without installing anything. Merely setting `OLIVECODE_RELEASE_READY=true` is insufficient.

The manual **OliveCode preview packages** workflow builds and tests eight native installer targets. Its publish option creates the public release only after that matrix succeeds, including a verification record. On the matching source revision, verify it and build:

```sh
bun distribution/verify-release.ts --output /tmp/olivecode-release.json
OLIVECODE_SITE_ENV=production OLIVECODE_RELEASE_READY=true OLIVECODE_RELEASE_VERIFICATION=/tmp/olivecode-release.json bun site/prepare.ts
bun site/check-launch.ts
bun site/package.ts
```

Verification must be less than 24 hours old. Missing assets, failed native workflow, wrong commit, repository or mismatched installer scripts stop the build. Release packages remain on GitHub; branded install scripts are served by Cloudflare Pages. The manual **OliveCode Cloudflare website bundle** workflow produces upload artifacts; it does not publish the site or change DNS. Native release checks do not replace interactive Windows/Linux testing or code signing.

After upload run `bun site/check-deployment.ts`. It only reads the public endpoints and never executes the installer.

### Local browser and hosting checks

For the optional Websupport alternative, build with `OLIVECODE_SITE_HOST=Websupport`. `python3 site/check-websupport.py` exercises that generated `.htaccess` in a disposable local Apache with HTTPS on macOS; it tests redirect preservation, routes, 404, installer types and headers. It stops its own server after testing. This supplements, rather than proves, the live Websupport configuration.

For Cloudflare runtime QA, run `node site/node_modules/wrangler/bin/wrangler.js pages dev site-dist --port 8789 --compatibility-date 2026-10-15` from the repository root, then `bun site/check-cloudflare.ts`. Run Wrangler under Node.js; Bun currently causes internal proxy resolution failures in this local setup. No login or deployment is required for these tests. To run browser checks against that runtime set `OLIVECODE_TEST_ORIGIN=http://127.0.0.1:8789`.

With the local preview running, execute `node site/run-browser-checks.cjs` using an installed Playwright module. Optional `PLAYWRIGHT_MODULE` and `CHROME_PATH` select existing installations. The suite covers clipboard fallbacks, keyboard access, translations, responsive layouts, real animation, reduced motion, no-WebGL fallback and production metadata. Screenshots stay in local `docs/previews/`, outside the upload bundle.

## Design verification

The home page frames the existing pixel logo with an original olive-grove illustration. The transparent artwork is compressed to a 503 KiB WebP. A small Three.js scene supplies lit, rotating leaves; pointer movement changes the artwork's depth slightly. Desktop rendering is capped at roughly 30fps, mobile at 20fps, and pixel ratio at 1.5. Animation stops when the page is hidden or the scene is offscreen. The user requested removal of the Pause button; reduced-motion preferences still produce a still scene. No WebGL or scene-load failure leaves the botanical artwork and installer intact. Mobile keeps the artwork below the command rather than squeezing it between trees.

`site/check-grove.js` verifies actual frame changes, pointer movement, absence of the removed Pause control, frozen frames with reduced motion, reduced-motion first load and live changes, and installer operation with WebGL disabled. It captures actual light, dark and mobile pages in `docs/previews/site-grove-*.png`. The artwork reference and source also live in that directory; they are not shipped in the public output.

Playwright CLI checks live in `site/check-browser.js`. Run them against a prepared site served at `http://127.0.0.1:8765`. They cover OS switching, keyboard access, ten light/dark viewport layouts, Windows detection, and mocked clipboard success/failure. The mocked release config and clipboard exist only in the isolated test browser; the prepared site remains a disabled-copy preview. Screenshots are saved in `docs/previews/`.

The 2026-10-03 revision matches the approved cinematic study more closely: warmer, denser trees, a full stone foreground, an integrated header and wide segmented OS buttons. Logo and command sizes remain large. The dark backdrop is a 282 KiB WebP derived from the approved study with all UI removed; the previous transparent grove remains for light mode.


## Guide languages and product section
Guide links navigate directly to the English guide, without asking for a language. The optional language button inside the guide opens a native, keyboard-accessible, searchable dialog. Fourteen complete local guide translations are in guide-copy.js (English, Slovak, Czech, German, Spanish, French, Italian, Portuguese, Polish, Ukrainian, Arabic, simplified Chinese, Japanese and Korean). Explicit choices are reflected in the guide URL and HTML language metadata; an unqualified guide link always opens English, including for visitors with an old saved preference. Arabic guide content uses RTL. More languages explicitly opens only the public guide text in Google Translate; no translation requests happen automatically. Have native speakers review copy before launch.

Below the hero, two cinematic botanical chapters carry the olive scenery through the page: a large real app view on a warm stone background, then a simple model-switching diagram beside an olive branch. Both remain charcoal in either theme for legibility and continuity. Decorative local artwork has no text or fabricated product UI. The actual terminal screenshot was captured from the compiled OliveCode app in an isolated temporary project and rendered through xterm.js, without real credentials or fabricated chat results. It is a 41 KiB local WebP and can be opened full size. Copy emphasizes guided setup, accessible controls, no OliveCode usage cap or credits, and automatic rate-limit fallback to ranked eligible free alternatives from connected providers. Cloud availability is not unlimited: fallback can stop if no alternative is available. Local models have no cloud request quota but still require setup and suitable hardware. Price sources and check date appear beside the chart; competitors’ free tiers and unequal plan features are explicitly acknowledged. This is not a performance benchmark. Recheck pricing before publication.

Run check-guide.js through Playwright CLI for English-first navigation, optional language choice, search, URL persistence, RTL, all translations, unsupported language fallback, external translation contents, actual product image and ten responsive section/dialog layouts.


## Product emphasis and yearly comparison
The grove is the brand backdrop; headline and product copy explicitly describe AI coding agents, file edits, checks and Assist collaboration. A clearly labeled example request sits beneath the actual welcome screenshot. It is sample input, not a fabricated completion.
The comparison uses a shared zero baseline and proportional bars: OliveCode $0, GitHub Copilot Pro $120, Cursor Plus $96 (Grok-only), Claude Pro (includes Claude Code) $240. Prices were checked on 15 October 2026. Yearly totals mean 12 months at published monthly prices, not discounted annual billing. Cursor Plus is a Grok-only plan; access to other models is not included in that comparison. Official pricing links, check date, free-tier and feature differences are visible. Brand icons githubcopilot.svg, cursor.svg and claude.svg come from the CC0 Simple Icons repository: https://github.com/simple-icons/simple-icons/tree/develop/icons . Marks identify the compared products and do not imply endorsement. Native text and labels stay accessible when decorative icons or artwork do not load.

The 2026-10-04 pass softened the hero-to-product and product-to-model image boundaries with overlapping charcoal gradients and masked botanical artwork. This fades the path into the terminal story on both desktop and mobile; it preserves foreground text and respects the existing reduced-motion behaviour. Before/after area screenshots are saved in docs/previews/site-seam-desktop.png and site-seam-mobile.png.


## Remote and Computer feature update — 9 October 2026
The original grove hero, installer and real terminal screenshot remain. A new editorial phone-to-computer vignette explains Telegram tasks and locally enabled app/browser modes. It is explicitly labeled as an example workflow, not a real product screenshot or live activity. Native radio controls explain Visible control, Background browser and setup-required Isolated Mac; arrow keys work and descriptions are announced. Entry animation uses the existing once-only reveal and respects reduced motion. No live Telegram requests, bot tokens or analytics are added to the website.

The guide now includes Computer, Telegram pairing/setup, scoped 90-minute approvals, separate capture consent, /stop, /lock, /status and awake/listener requirements in all 14 built-in languages. Commands remain literal. Its default remains English. The privacy page discloses Telegram bot transport, captures and local credential handling. Background Mac stays a setup-required preview; native Windows app control is not advertised as available.

Run check-remote.js with the same Playwright run-code mechanism as the other browser checks. It covers all mode choices, keyboard selection, ten responsive layouts, guide deep links, complete remote translations and privacy disclosure. Preview artifacts are docs/previews/site-remote-{dark,light}-{1440,375}.png.
