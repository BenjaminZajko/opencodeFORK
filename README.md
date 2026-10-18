<p align="center"><a href="https://olivecode.dev/"><img src="https://olivecode.dev/assets/logo-dark.svg" width="520" alt="OliveCode"></a></p>

# OliveCode

Free AI coding agents in your terminal. OliveCode works in your project folder with free cloud provider accounts or local Ollama models, optional multi-model Assist, and Computer/Telegram Remote workflows.

**[Website](https://olivecode.dev/) · [Installation guide](https://olivecode.dev/guide) · [Models](https://olivecode.dev/models) · [FAQ](https://olivecode.dev/faq) · [Releases](https://github.com/BenjaminZajko/opencodeFORK/releases)**

## Install

macOS and Linux:

```sh
curl -fsSL https://olivecode.dev/install | sh
```

Windows PowerShell:

```powershell
irm https://olivecode.dev/install.ps1 | iex
```

Open a new terminal, go to your project folder and run:

```sh
olivecode
```

The installer selects your architecture, verifies the package checksum and installs to your user account. The public preview has macOS Intel/Apple Silicon, Windows x64/ARM64 and Linux x64/ARM64 glibc/musl packages. Binaries are not yet code-signed or notarized. See the release notes before installation.

## What OliveCode does

- **Code in your project:** read files, edit code, run tools and check results.
- **Free cloud or local models:** connect your own eligible free provider account or choose an Ollama model for your hardware. Provider quotas and hardware requirements still apply.
- **Automatic switching:** try another eligible free model when a connected provider reaches a limit, when an alternative is available.
- **Assist:** optional planning, second opinions, progress checks and follow-through reviews. Inspect the diff and run tests; reviews do not guarantee correctness.
- **A calmer transcript:** see the final answer and expand work details when needed.
- **Computer:** browser tasks on supported systems and optional native app control on macOS 14+. Background Mac control requires an isolated VM or second Mac; native Windows/Linux app control is not available.
- **Remote from phone:** pair your own Telegram bot and send tasks to an awake, online computer running OliveCode Remote. Approve once or for 90 minutes; captures ask separately. `/stop` stops a task and `/lock` cancels timed approval.

OliveCode has no subscription, credit packs or usage cap of its own. This does **not** mean unlimited cloud-provider access or free access to every proprietary model. Local inference runs on your computer; cloud models and online tools use their respective services. Read the [privacy information](https://olivecode.dev/privacy).

[![OliveCode terminal welcome screen](https://olivecode.dev/assets/app-welcome.webp)](https://olivecode.dev/)

## Try a reproducible coding task

[Free coding-agent guide](https://olivecode.dev/free-ai-coding-agent) · [Local Ollama walkthrough](https://olivecode.dev/local-ai-coding) · [Starter and observed result](docs/examples/slugify)

The slugify example contains ten fixed tests and an incomplete function. In one observed run, public OliveCode 0.1.0 with Laguna S 2.1 (free) and Assist changed the function from 4 passing / 6 failing to 10 passing / 0 failing tests. An independent rerun passed and the test file was unchanged. This is a small maintainer-run demonstration, not a general or comparative performance benchmark; the model, release, resulting code and limitations are recorded in the example.

[Watch the 36-second walkthrough](https://github.com/BenjaminZajko/opencodeFORK/releases/download/v0.1.0/OliveCode-real-coding-walkthrough.mp4) — a clearly labeled condensed rendering of the actual run events, not a screen recording.

## First-run testers

Try one small task in a disposable project, inspect the actual file changes and run the checks. We welcome successful results as well as failures. Use the [first-run feedback form](https://github.com/BenjaminZajko/opencodeFORK/issues/new?template=olivecode-first-run.yml) to record your OS, app version, model and expected/actual result. Keep tokens, private code and personal information out of public reports.

## Status and support

This is a public preview. Review model output and approve actions carefully. The Windows/macOS/Linux packages passed native build and installer checks; that does not establish every hardware and workflow combination works. WhatsApp is an advanced setup preview and is not a generally available plug-and-play integration.

Report reproducible problems in [Issues](https://github.com/BenjaminZajko/opencodeFORK/issues), removing private code, tokens and personal information. Public project contact: **olivecode.ai@gmail.com**. Official Instagram: [@olivecode_dev](https://www.instagram.com/olivecode_dev/).

## Open-source foundation

OliveCode is a separate project derived from [OpenCode](https://github.com/anomalyco/opencode). It is not an official OpenCode product. Upstream copyrights, license notices and third-party components are retained. See [LICENSE](LICENSE) and the notices included with distributed packages.

## Development

This repository includes the upstream monorepo and OliveCode-specific application, terminal UI, distribution and website work. Read [AGENTS.md](AGENTS.md) for repository conventions. Run checks from the relevant package directories. The website build and release verification are documented in [the released website source](https://github.com/BenjaminZajko/opencodeFORK/blob/v0.1.0/site/README.md). Public release packaging is documented in the [release source](https://github.com/BenjaminZajko/opencodeFORK/tree/v0.1.0/distribution).
