# OliveCode Desktop Preview

OliveCode's desktop workspace, built on the MIT-licensed OpenCode desktop foundation. It bundles the OliveCode engine from this checkout and has its own application identity, icon, protocol and desktop settings.

The current packaged preview is for **Apple Silicon, macOS 12 or later**. It is unsigned and intended for local review. The Catalina terminal build is a separate product path. Intel, Windows and Linux packages have not been validated in this work.

## Use the preview

On this Mac, the latest built preview is installed at `/Users/benji/Applications/OliveCode Preview.app` (0.3.1). The previous three desktop bundles were moved to Trash on 2026-11-05; the original `dist/refined-preview` bundle was moved to this installed location. The terminal command now uses the current local source build `0.3.1-local.20261105`. Installation and verification details are recorded in `docs/desktop-preview/local-install-2026-11-05.json` at the repository root.

After building a fresh preview, its output is `dist/refined-preview/mac-arm64/OliveCode Preview.app` (0.3.1); use the installed location above on this Mac. Close an earlier running workspace preview before opening a new build, because both use the workspace application identity. Choose **Open project** to select your actual project folder. **Models** in the sidebar opens Local/Cloud setup. The original 0.2 preview profile remains separate.

- The sidebar keeps projects and recent conversations available while you work. Search filters their real history; the project menu supports editing and closing projects.
- Choose **Build** or **Plan first** before starting. The three starter actions fill an editable draft without sending it.
- Build/Plan and model selection share the composer toolbar. Starter actions are compact shortcuts; skill descriptions expand on demand. Command-B toggles the sidebar; Command-Shift-H toggles Home.
- **Tools & skills** exposes project-scoped Teamwork and Follow-through settings and installed skills. Cloud assistance uses connected free accounts and their quotas.

- Local detects installed Ollama models and checks their tool support before selecting one. You can also enter an Ollama name or compatible Hugging Face GGUF identifier. Downloads start only when you press **Download model**.
- Cloud opens the provider connection flow. Your provider's pricing and limits apply.
- Changes appear in the review pane. Choose **Git changes** to review the working tree. Open the terminal through the command palette or Control + backtick.

Model choice affects coding reliability. A model advertising tools is not a guarantee of good tool use; the installed 1B smoke-test model was not reliable enough to recommend as a coding default.

## Development

```bash
rtk bun install
rtk bun dev
```

## Build

Run these from `packages/desktop`. Preparation builds the fork's Node engine and branded icons; it does not fetch an upstream CLI. The public model catalogue is fetched during engine preparation (or provide a local snapshot through `MODELS_DEV_API_JSON`).

```bash
rtk bun run build
rtk bun run package:preview --config.directories.output=dist/refined-preview
```

Automatic updates are disabled in this preview. Public release requires OliveCode-owned update metadata, signing/notarization, cross-machine installation checks and stronger coding-model validation. The desktop shares the coding engine but does not yet expose every terminal workflow: see the [feature comparison](../../docs/desktop-feature-parity.md), [workspace design and validation](../../docs/desktop-premium-design.md) and the [original desktop notes](../../docs/olivecode-desktop.md).
