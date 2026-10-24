# Design review: OliveCode installation page

## Summary

Rating: Good. The site is now grounded in the approved terminal pixel logo, with a neutral charcoal dark theme and a clean white light theme. The large installer remains the first functional action. This is a website; Apple's foundations apply, not native navigation conventions.

Reading: a minimal developer-tool landing page, not a SaaS dashboard. Taste dials: DESIGN_VARIANCE 4 (the owner explicitly requested a centred install action), MOTION_INTENSITY 2 (feedback only), VISUAL_DENSITY 2. Native HTML/CSS preserves the existing lightweight static site. This is an original OliveCode visual identity, inspired by competitor restraint rather than a recreation of a competitor's design system.

## Audit and changes

The previous green-black surface, oversized generic headline, and three equal feature columns diluted identity. All three are removed. Practical guidance moved to a dedicated guide. The terminal's exact pixel fruit and letter patterns were translated into scalable vectors, including their original highlights and green/teal colours. The user supplied the approved logo, so preserving it overrides generic skill advice against custom SVG decoration. The generated hero reference was inspected before implementation; its core spacing, logo priority, neutral palette, and installer structure guided the code. Fake product screenshots and decorative grid lines were deliberately omitted.

References applied: Taste Skill for audit and restraint, Image to Code for the generated hero reference and visual analysis, Vercel Web Design Guidelines for semantics/focus/feedback, Awesome Design MD for competitor layout studies, and Playwright CLI for live verification. Awesome Design MD is a reference collection, not an installable skill. Its analyses are not official brand documentation.

## What works

- `branding.md › Best practices`: “Ensure branding always defers to content.” The existing OliveCode mark is the defining element; the installer gets the functional emphasis.
- `writing.md › Getting started`: “Write for everyone.” One short descriptive sentence replaces slogans, with ordinary navigation labels.
- `accessibility.md › Vision`: “Strive to meet color contrast minimum standards.” Calculated text contrast exceeds 4.5:1 in both appearances, including hover accent text. Logo highlights are brand artwork rather than interface text.
- Native radios support keyboard switching; buttons and links have visible focus, at least 44px hit targets, and named controls. Copy success and failure use inline live status.

## Tokens

| Role | Dark | Light |
|---|---|---|
| Surface | #171717 | #fafafa |
| Installer | #202020 | #f2f2f2 |
| Text | #f0f0f0 | #202020 |
| Secondary text | #ababab | #626262 |
| Accent | #78bf78 | #2f713e |
| Divider | #454545 | #ababab |

Type: system sans for the short sentence and controls, system monospace for commands. The hero is the existing pixel wordmark, not giant text. Sentence 22-30px, command 14-20px, body 16px, utilities 13-15px. Four-pixel corner radii match the pixel identity. No gradients, glow, blur, looping motion, external font requests, or feature cards.

## Layout

```text
Regular
[olive OliveCode]                           Guide GitHub
              [large approved pixel logo]
           Your terminal. Your project. Free AI.
       [macOS | Windows                       Terminal]
       [$ installation command                    Copy]
       [preview status]
       Open your project folder ... olivecode
                     Installation guide
OliveCode                 Guide Sponsors Privacy       year

Compact
[olive OliveCode]                        Guide GitHub
[approved pixel logo across available width]
Your terminal. Your project. Free AI.
[macOS | Windows                   Terminal]
[$ command wraps                       Copy]
[status]
Open your project folder ... olivecode
Installation guide
Guide Sponsors Privacy
OliveCode year
```

## Verification

Live Playwright checks passed at 320, 375, 640, 1200, and 1440px widths in both light and dark themes, without horizontal overflow and with the installer inside an 800px viewport. Also verified preview-disabled copying, manual and keyboard OS switching, simulated Windows platform detection, guide navigation, and clipboard success/failure with an isolated mock. No real clipboard contents were replaced. Desktop and mobile screenshots are in `docs/previews/`; `site-reference.png` is the generated concept and `site-dark.png`, `site-light.png`, `site-mobile.png` are actual rendered pages.

Medium: native Windows installer testing remains outstanding. Browser checks emulate Windows platform hints, not Windows execution. Site publication, a real domain, and release assets remain separate launch steps. Screen-reader testing across platforms remains unperformed.

Vercel audit: `site/index.html`, `site/guide.html`, `site/sponsors.html`, `site/privacy.html`, `site/style.css`, and `site/site.js` pass the applicable source checks. Browser verification covers interaction and layout; no Lighthouse performance scores or screen-reader results are claimed. Nonapplicable skill patterns (testimonials, pricing, animation libraries, imagery blocks) were not added just to satisfy a template.


## Olive grove revision — 2026-10-02

Direction: a botanical frame around a clear installation centre. Design variance 6, motion 5, density 3. Generated and inspected a dedicated hero reference first, then a transparent original grove asset. Preserved the approved terminal pixel wordmark. Trees frame the outer edges, the tagline uses a restrained Georgia serif, and the installer remains opaque and readable. Neutral charcoal and light surfaces remain unchanged. Mobile moves the trees below the useful controls.

Motion is implemented rather than baked into a video: locally bundled Three.js lit leaf geometry, deterministic drifting instances, gentle pointer parallax, short entrance motion. The grove itself is layered illustration, not a 3D tree model. No CDN, tracking, fake statistics, or extra feature cards. Artwork is 514,554 bytes as transparent WebP; the optional minified scene bundle is about 556 KiB before host compression.

Verified: 15 installer unit tests; existing browser checks across ten light/dark viewport combinations; actual animated frame changes, pointer response, pause freezes frames, resume, live and initial reduced-motion settings, fallback without WebGL, and no browser errors. Reviewed actual dark, light, and mobile screenshots. Build passed. Browser checks use isolated Chromium; Safari and a native Windows device were not tested in this revision. Deployment remains a preview until domain and release artifacts are published.


## Approved study matching — 2026-10-03
User preferred the original cinematic study over the implemented transparent tree frame, but wanted to preserve the larger logo and command. Generated an edited background from their approved screenshot, removing all UI while preserving trees, lighting and stone foreground, then compressed it to 288,526 bytes. Dark mode uses that background; light mode retains the transparent botanical frame. Header sits within the composition, OS selection is two wide segmented controls, logo and command keep the prior large dimensions. Removed the Pause element and its controller code at the explicit user request; OS reduced-motion, offscreen/hidden suspension and fallback remain. Browser installer/layout checks and animation/reduced-motion/fallback checks passed. Fixed-viewport animation screenshots avoid resizing a viewport-dependent canvas during capture.


## Product and guide expansion — 2026-10-03
Generated and inspected a dedicated below-fold reference before implementation. Chose an editorial split with a real terminal screenshot, three concise benefits, and a second split for a proportional monthly subscription chart. Kept the approved grove unchanged. $0 is a point, not a misleading positive bar; $10/$20 bars have a 1:2 ratio. Copilot Pro $10/month and Cursor Pro $20/month were checked on official pricing pages today. Acknowledge both free tiers and unequal features; no invented effectiveness data. Hero now reads Free AI agents. Top free models. rather than an unsupported unlimited-cloud claim.

Guide links open a searchable native modal with 14 complete local translations and an explicit external public-text translation option for other languages. Choice persists locally, URL can be shared, lang metadata updates, Arabic content is RTL, Escape and close button dismiss. English guide remains readable without JavaScript. Verified all locales, search, persistence, RTL, invalid locale fallback, external translation text, ten dark/light layouts, installer regressions and 15 unit tests. Actual product and cost screenshots are in docs/previews/.


## English-first guide and botanical chapters — 2026-10-03
The latest steering supersedes the language-first flow above: Guide now navigates directly to English. The searchable language dialog is optional inside the guide. Explicit choices remain in the URL, not browser storage; old saved preferences do not change the default. Privacy copy matches.

The approved cinematic hero remains. Lower sections now extend its olive identity through two full-width, locally generated photographic scenes: a stone plinth with a large genuine terminal screenshot and three concise onboarding/control benefits, followed by a sculptural olive branch beside the rate-limit fallback diagram and $0 price statement. Text stays HTML; decorative images contain no lettering, product UI or invented results. Charcoal chapters remain dark in both themes; the artwork fades behind the cost text, and mobile reduces artwork contrast. Existing reveal motion respects reduced motion.

Design references were generated and inspected before implementation: docs/previews/site-product-reference.png and site-flow-reference.png. Reference-only invented UI/mascot were removed from production backgrounds. Final desktop/mobile views are site-product-dark.png, site-flow-dark.png, site-cost-dark.png, site-product-mobile.png and site-flow-mobile.png.

Messaging distinguishes unlimited OliveCode use (no app usage quota, subscription or credit packs) from provider availability. Source inspection of provider/fallback.ts and session/processor.ts confirms automatic rate-limit fallback to ranked eligible free models from connected providers, with exhaustion possible. No claim of infinite cloud access or guaranteed best-model performance. Guided first-run setup and nearby controls are highlighted without promising no account/model installation is needed. Backend behaviour is unchanged.


## Product identity and comparison refinement — 2026-10-03
User loves the visual life but felt it resembled an olive seller. Preserve the approved grove and logo, reduce lower artwork emphasis, introduce the explicit AI coding headline, describe file/tool actions and Assist, and show a labeled example coding request beside the real terminal view. Avoid invented completed work.
Cost reference generated and inspected before implementation: docs/previews/site-comparison-reference.png. One common-scale chart with real product icons, mint zero marker, terracotta paid bars, axis ticks, named plans and yearly totals replaces the two thin bars. Copilot Pro $10/month, Cursor Pro $20/month and Claude Pro $20/month verified on official pricing pages, 3 October 2026. Totals are monthly prices × 12; Claude and Cursor bars must be equal, rather than copying inflated tiers from the inspiration. Icons are local CC0 Simple Icons assets. Final desktop/mobile screenshots: site-comparison-dark.png and site-comparison-mobile.png.

The 2026-10-04 pass softened the hero-to-product and product-to-model image boundaries with overlapping charcoal gradients and masked botanical artwork. This fades the path into the terminal story on both desktop and mobile; it preserves foreground text and respects the existing reduced-motion behaviour. Before/after area screenshots are saved in docs/previews/site-seam-desktop.png and site-seam-mobile.png.
