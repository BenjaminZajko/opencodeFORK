# OliveCode: free coding workspace

The previous green-tinted design was rejected. This revision uses clean charcoal or cool white surfaces, bright emerald for actionable controls, and slate for supporting information. Terminal typography follows the user's font; hierarchy comes from weight, spacing and panels.

Regular layout:
```
 OliveCode                                     FREE WORKSPACE

       [olive as O]liveCode
       (seven-row terminal lockup)

 [ first-run setup, dismissible ]
 ╭ Task ─────────────────────────────────────────────────────╮
 │ Describe what you want to build or fix, OliveCode works    │
 │ with your project files...                                 │
 │                                                          │
 │ Build · selected model                  [Cloud ▾][Local ▾] │
 ╰──────────────────────────────────────────────────────────╯
 Enter send · / commands
```
The welcome lockup uses a filled olive as the first O. A small pointed leaf, a lighter glint, and a muted pimento distinguish it from a plain letter or generic circle. Solid terminal-cell backgrounds give the fruit and letters the same visual texture across fonts. The fruit and C share a seven-row height; the remaining six-row letters sit one row lower on the same baseline. Small clipped corners and light-and-shadow cells echo the fruit's irregular silhouette without obscuring the letters. Olive and live use olive green; Code uses a restrained mint green. Only letter spacing separates live and Code, so it reads as one name. The full lockup fits at 75 columns and above; at 60–74 columns the mark stacks above the readable OliveCode name, and below 60 columns or 30 rows the hero disappears so the prompt stays usable.

Compact: single-line brand, optional setup hint, then composer. No side rail competing with the task. In chat, the top bar uses a one-row olive-and-mint wordmark; completed replies get one colored mark beside their existing duration line. The response stays the visual focus, and the session details panel stays hidden until opened.

Signature: the welcome mark establishes a distinctive OliveCode identity. The chat repeats its two greens in a compact wordmark and a single response marker, without adding vertical space. The free-model switchboard remains the functional signature, showing a first choice, the next model on that provider, and the strongest configured alternative from each other free provider. One submenu level holds the full library, retries, and connections. No subscription promotions.

Accessibility: semantic theme roles; labels accompany status colors; visible keyboard selection; no added motion. Terminal font size and assistive technology support remain owned by the terminal renderer. Native frame tests cover both appearances at regular and narrow widths.

Contrast calculated from the actual tokens (lowest across all three surfaces):
- dark text: 12.83:1 minimum
- dark textMuted: 6.63:1 minimum
- dark primary: 8.90:1 minimum
- light text: 13.47:1 minimum
- light textMuted: 5.23:1 minimum
- light primary: 4.79:1 minimum

HIG principles applied: accessibility / Vision (contrast and redundant cues); layout / Best practices (grouping and secondary details); menus / Organization and Submenus (important choices first, shallow hierarchy); onboarding / Best practices (teach in context). This is a terminal UI, so native macOS window and point-size conventions are not copied literally.

Ads: future requirement only. No ad placement or tracking is implemented.
