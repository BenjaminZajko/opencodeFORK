# Start OliveCode

Open **Start OliveCode.command** in the parent project folder. Choose an existing project folder, or press Return to create a **Workspace** folder beside the launcher.

1. Choose **Start here**, or type `/start`.
2. Choose **Set up cloud** and connect OpenRouter, Groq, or Mistral using your own free account. OpenRouter supports browser sign-in or API-key entry.
3. Choose a model and describe what you want to build or fix.

**Assist is on by default.** In the composer footer, select **Assist ▾** beside Cloud and Local to switch **Teamwork** or **Follow-through** off or on. Type `/assist` to open the same controls. Teamwork shares a small project file map with up to two eligible free advisers. One proposes a plan, another challenges it, and on longer tasks a teammate checks progress after actual tool work. Your selected model remains the only one that edits files or runs tools. Follow-through reviews the result, asks the lead to address concrete omissions, and uses two independent first reviews for larger tasks. It stops for your input, a repeated gap without new work, a model step limit, or six reviews. Helper activity is visible while work is underway and folds into the finished response. Extra requests use your free-provider quotas, may take longer, and can miss issues. Cloud helpers only receive task context in cloud tasks. Local helpers are installed Ollama models and stay on this computer. Settings are saved for the current project; toggles apply at the next task step. See [task assistance](docs/olivecode/task-assistance.md) for details.

While OliveCode works, the chat shows its steps. Once the task finishes, it shows the final answer below a **Worked for ...** row. Click that row to show or hide the full activity for that response. Type `/details` to show or hide activity across the chat.

Session details stay hidden when you widen the terminal. To see the task list, modified files, or technical information, open the command menu with `Ctrl+P` and choose **Show session details**. Close the panel with its **×** button or choose **Hide session details** from the same menu.

The parent folder's **Start OliveCode.command** now launches the refreshed build with the updated welcome logo and Task assistance. If you opened an older extracted archive, use the new archive listed below. For source development, run `cd /Users/benji/Desktop/OliveCode_main/opencodeFORK && bun run --cwd packages/opencode dev -- /Users/benji/Desktop/OliveCode_main/Workspace`.

`/cloud` puts Laguna S 2.1 first while it is available. OpenRouter reports 70.2% on Terminal-Bench 2.1 and 40.4% on DeepSWE. Its free endpoint may use prompts and responses to improve Poolside models, and OliveCode shows this notice next to the choice. Pick North Mini Code if you prefer its OpenCode-specific tuning and want to avoid that particular training notice. Scores come from different tests, so no model is best at every kind of task.

The picker then shows another model from the same provider and one recommendation from each other connected provider. **All free models**, **Waiting for reset**, and **Connect free providers** open the rest of the choices. Retry countdowns are estimates; providers may enforce longer account limits.

Only OpenRouter zero-price `:free` models and supported Groq/Mistral free-tier models are offered. Paid models, trial-only providers, upstream defaults, and subscription prompts are excluded. Free accounts still have usage limits.

Use `/local` for models running on your computer through Ollama. Hardware is checked as soon as Local opens; the screen shows your CPU, memory, and approximate model budget. On Apple Silicon, OliveCode reserves at least 4 GB or 25% of RAM, whichever is larger, for the system and other apps. A 24 GB Mac therefore shows a `~18 GB` model budget; it is a planning estimate, not a live free-memory measurement. Downloads start only when you select a model. **Download other models** shows a recommended choice and, when one fits, a larger demanding model; **All model variants** includes workstation models. **Delete models** removes installed downloads immediately. Ollama cloud shortcuts are excluded from both chat choices and the downloaded-model deletion list.

The optional guide disappears when skipped or after your first task. `/start` brings it back. The launcher gives you a simple folder choice before entering the app.

OliveCode follows the terminal's light or dark appearance. Choose **olivecode** from `/theme` if another theme was selected.

## Portable Mac preview

The Apple Silicon archive is `packages/opencode/dist/OliveCode-macOS-arm64-0.0.0-olivecode-dev-202610011014.zip`, with a SHA-256 file beside it. Extract it and open its launcher. This build uses the model catalog already cached by OliveCode on 29 September 2026.

This is an unsigned local preview. Public distribution still needs signing, platform testing, and an OliveCode-owned update channel. The inherited updater is disabled.

Settings, sessions, cache, and state now use OliveCode folders. Configuration uses `olivecode.json` or `olivecode.jsonc` and `.olivecode` project directories. Supported free-provider credentials are copied from legacy storage on first launch when no OliveCode credentials exist; the old data is left intact.

## Appearance

These are terminal-renderer frames with test data, not live iTerm screenshots.

![Dark home](docs/olivecode/home-dark.png)

![Light home](docs/olivecode/home-light.png)

![Compact light home](docs/olivecode/home-light-compact.png)

## Verification

The compiled app passed isolated end-to-end prompts through the OpenRouter, Groq, Mistral, and Ollama adapters against local test servers, including background title requests and paid-model rejection. The server dependency cycle that caused prompt failures was fixed. Focused backend tests and the terminal UI suite pass.

The user confirmed real cloud chat works. The 2026-09-28 build also passed real local inference with the installed Llama 3.2 1B model, using isolated settings and the complete provider registration/reload flow. No real models were downloaded or deleted during testing. Account-specific quotas, larger-model performance, and a human review of the new local screens still need testing. Ads are deferred as requested.

Local coding models that send a tool request as plain JSON now pass through OliveCode’s normal tool and permission checks. A made-up example path such as `/path/to/file.txt` is blocked with a clear message. When `/local` has more choices below the visible area, a small down arrow marks the scrollable list; it disappears when everything fits. Qwen2.5-Coder 14B was verified creating `hello.py` in an isolated test project; its small default context can still produce poor follow-up decisions, so review local tool requests before approving access outside your project.
