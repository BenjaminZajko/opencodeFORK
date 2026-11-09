# OliveCode desktop: workspace pass

## Audit and reference study

The first preview works but separates project navigation from conversations, repeats the brand and Models action, and leaves the conversation starter largely empty. The strongest correction is a persistent workspace hierarchy, not more green decoration.

References inspected: [Codex's project/thread and review workflow](https://openai.com/index/introducing-the-codex-app/) and [Claude Code's desktop sidebar, integrated tools and CLI continuity](https://claude.com/resources/articles/claude-code-desktop-redesign). These are interaction references; no proprietary implementation or visual assets are copied.

Apple HIG references: sidebars (two hierarchy levels, disclosure, hideable), toolbars (prioritize common actions), layout (clear control/content hierarchy), typography (readable system type), accessibility (keyboard labels and focus), color (semantic light/dark pairs), generative AI (user control and clear capabilities), designing for macOS (native chrome and shortcuts).

## Tokens and structure

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | #FCFCFA | #191C19 |
| Sidebar | #F1F3EE | #20251F |
| Text | #243023 | #EDF1E9 |
| Secondary | #5B6757 | #ADB7A5 |
| Action | #3C6538 | #AFD98C |
| Selection | #DFE9D7 | #34422D |

System sans 13px navigation, 14px body, 28px restrained starter heading; source remains monospace. Green identifies actions and selection; neutral surfaces carry the work. Pixel olive appears once in the sidebar. No gradients, ornamental dashboards or invented sessions.

```
regular:  native controls / conversation tabs
          projects + recent chats | conversation / starter | review when open
          models / tools / settings | terminal when open

compact:  hideable project drawer | conversation / starter
          visible navigation toggle; tools remain reachable
```

The sidebar stays mounted when conversations change. Its data is scoped to the active server. Project rows disclose recent conversations and offer a new conversation action. Search filters real projects and conversations. Empty lists explain the next action. Tool panels load on demand.

## Terminal continuity

Expose existing Plan/Build selection, project skills, Teamwork and Follow-through settings. Use existing SDK/configuration contracts, preserve permission controls, disclose cloud quota use and keep local inference local. Prompt starters fill an editable draft and never send automatically. Retain diff, terminal, context and undo machinery rather than replacing it with visual simulations.

## Critique before implementation

A Codex-style sidebar alone could be another clone. OliveCode's difference is an explicit local-model route and approachable task assistance beside a quiet working surface. Remove repeated logos and duplicate project navigation. Put secondary capabilities behind one useful Tools entry. Motion is limited to short disclosure/state transitions and respects reduced motion.

## Performance and validation

Record production navigation observations before changing session layout, compare afterwards, and report the limits of the measurement. Validate actual project switching, model/tool settings, skill loading, draft starters, live review and terminal access. Keep old preview artifacts intact and package this iteration separately.

### Verified result: 0.3.0

- App and desktop typechecks passed. Targeted tests: 19 app tests across five files and 16 desktop tests across three files passed; this is not a full-suite claim.
- Production app, bundled desktop and Apple Silicon preview packaging completed. Packaged metadata reports version 0.3.0 and macOS minimum 12.0. Artifact: `packages/desktop/dist/premium-preview/mac-arm64/OliveCode Preview.app`.
- Native packaged app opened a disposable project using the system folder picker. Understand the project filled the real editable composer without sending. Tools loaded persisted project settings and discovered both the built-in configuration skill and the QA project's fixture skill. No model call was made.
- Browser checks covered sidebar navigation, starter drafts, Build/Plan selection, persisted project assistance settings, installed skill loading, project editing, settings shortcut with the sidebar hidden, light/dark appearance and live Git review. At an 800px viewport, the sidebar becomes a drawer, Escape closes it and returns focus to the trigger. Existing terminal machinery was retained; a fresh terminal execution was not part of this iteration's checks.
- Three warm production navigation samples measured 60/66/53 ms before and 87/56/65 ms after (medians 60 and 65 ms). These timings include automation overhead and use a small sample; they do not establish cold-start performance, model throughput or a general speed improvement. Raw observations are in `desktop-preview/premium-navigation-before.json` and `desktop-preview/premium-navigation-after.json`.
- Screenshots: [native draft](desktop-preview/premium-native-draft.png), [native task assistance](desktop-preview/premium-native-tools.png), [review workspace](desktop-preview/premium-review.png).

This is an unsigned local preview with automatic updates disabled. The separate `dev.olivecode.desktop.workspace` application identity preserves the earlier preview profile. No paid generation, model download or public deployment was performed. Coding quality still requires stronger-model task validation; the earlier 1B smoke-test model is not a recommended coding default. New English copy uses the existing typed translation system; translated copy was not independently reviewed.

### Refinement: 0.3.1, 2026-11-04

The single job of the starter is to turn a project task into an editable prompt. Retain the olive mark and semantic forest palette; reduce competing surfaces. The previous bordered workspace inside the window, starter cards, duplicated sidebar toggles and duplicate model/Home/create actions weakened that hierarchy. Removed the inset frame, replaced starter cards with compact labeled actions, integrated Build/Plan with model selection in the composer, reduced repeated copy, and made project row actions appear on hover or keyboard focus. The settings and models entries remain reachable.

```
regular: window tabs / one navigation toggle
         quiet project rail | task heading
                            | composer: attachments / Build or Plan / model / send
                            | project and worktree / compact starter actions
compact: same task surface, project drawer on demand
```

The existing palette is retained. Calculated opaque text contrast: light body #243023 on #FCFCFA 13.43:1; secondary #5B6757 on canvas 5.80:1 and on sidebar #F1F3EE 5.34:1; accent #3C6538 on canvas 6.57:1. Dark body #EDF1E9 on #191C19 15.03:1; secondary #ADB7A5 on canvas 8.26:1 and on sidebar #20251F 7.50:1; accent #AFD98C on canvas 10.75:1. Headings use restrained 23–27px system type, navigation/body remain 12–14px. No new decorative animation or transparency was added.

The final critique removed the duplicate agent picker for built-in modes; custom-agent controls retain the existing fallback. Task assistance now uses the shared accessible switch and checks unsuccessful SDK responses before reporting a successful save. Skills use keyboard-accessible disclosure instead of permanently showing long instructions. The project path remains visible in smaller dialogs rather than shrinking out of view. The Home shortcut is Command-Shift-H in this workspace, resolving the Command-B collision with sidebar navigation.

Validation:

- App, session-ui and desktop typechecks passed. App targeted tests: 19 across five files; shared composer state/machine tests: 16 across two files, all passed. These are focused checks, not a full suite.
- Browser production checks: starter fills the draft, Build/Plan preserves the unsent text, Command-B hides/restores navigation without changing the route, assistance settings save and restore, skill descriptions expand/collapse, light/dark styling, 800px drawer/Escape/focus recovery, and a 500px narrow layout. Existing session Git review/terminal surfaces remained available during navigation.
- Moving mode buttons into the form initially caused a default form submission. The local smoke-model run was stopped, buttons were explicitly made non-submit controls, and the corrected production interaction left the draft unsent. No successful coding-task/model-quality claim is made from that run.
- Three warm production navigation samples: before 92/98/87ms (median 92); after 91/101/88ms (median 91). Includes CUA overhead and different Home/Workspace button labels. This small observation supports only similar warm-navigation timing, not a general performance claim. Raw files: `desktop-preview/refinement-navigation-before.json` and `desktop-preview/refinement-navigation-after.json`.
- Production frontend build, desktop build and packaging completed. Updated artifact: `packages/desktop/dist/refined-preview/mac-arm64/OliveCode Preview.app`, version 0.3.1. The earlier running native app was not restarted; this iteration's interactive checks used the production renderer with the real local engine.
- Screenshots: [light](desktop-preview/refined-light.png), [dark](desktop-preview/refined-dark.png). The [feature audit](desktop-feature-parity.md) separates shared engine support from missing desktop workflows.

The release limitations above still apply. Close the earlier workspace preview before opening this build; it intentionally reuses the same workspace profile and application identity.
