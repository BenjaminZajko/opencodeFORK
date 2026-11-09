# Desktop and terminal feature audit

Source audit on 2026-11-04. Shared engine code does not establish identical UI coverage or end-to-end verification of every tool.

| Capability | Desktop state | Evidence / limit |
| --- | --- | --- |
| Coding tools, permission checks, project configuration | Shared OliveCode engine | Desktop preparation bundles this checkout's engine; same tool/session/configuration implementation. Model quality and OS permissions still matter. |
| Local and cloud models | Exposed | `dialog-olivecode-setup.tsx` supports provider setup, installed Ollama inventory, tool-capability checks and explicit downloads, including compatible GGUF names. It does not reproduce the terminal's complete model management. |
| Hardware recommendations, local model deletion | Desktop setup gap | Terminal `dialog-local.tsx` offers hardware/recommendation and removal flows. Desktop setup currently offers inventory, selection and download. |
| Free cloud recommendations, cooldown/retry library | Desktop presentation gap | Terminal `dialog-cloud.tsx` has a dedicated free-only catalogue and retry schedule. Desktop uses provider/model selection; the same curated screen has not been ported. |
| Agents, Plan/Build, custom instructions | Exposed | Local agent state and composer controls use existing agent/configuration APIs. Custom agents remain selectable through existing agent commands. |
| Teamwork / Follow-through | Exposed | Desktop tools and terminal `dialog-assist.tsx` write the same project `collaboration.teamwork` and `followThrough` options. Extra requests use connected free-account quotas. |
| Skills / custom commands / context / attachments | Exposed | Tools lists actual installed skills; composer provides command, context, shell and attachment actions through the shared SDK. |
| Session history, archive, fork, compact, export, undo/redo, share | Implemented UI/actions | Desktop `use-session-commands.tsx`; permission/configuration and availability conditions still apply. Source-verified coverage, not a claim every action was exercised in this pass. |
| Git review, file browser, worktrees, terminal | Implemented UI | Existing session review, workspace selector and terminal panel retained. Desktop adds an integrated visual review surface. |
| MCP and language-server status | Implemented UI | Directory status popover and composer MCP resources; no full new MCP configuration wizard claimed. |
| Computer-control setup and stop/status screen | Dedicated desktop setup gap | Terminal `dialog-computer.tsx` provides visible/background browser and Mac modes, setup checks and stop handling. Engine support alone is not equivalent desktop UX. |
| Phone / Telegram remote setup | Dedicated desktop setup gap | Terminal `dialog-remote.tsx` guides remote setup/start. No equivalent desktop setup flow has been implemented. |
| Privacy / usage and sponsor measurement preferences | Desktop parity gap | Terminal `dialog-privacy.tsx` exposes these preferences. Desktop does not currently mirror that panel; terminal preferences must not be assumed shared with desktop. |
| Update / release readiness | Preview limitation | Desktop automatic updates are disabled; signing, notarization, Intel/other-platform validation and update metadata remain release work. |

## Recommendation

Keep the main coding screen focused. Port missing device/remote setup and privacy controls as deliberate settings flows, then validate each with the actual backend and operating-system permission lifecycle. Model management should include the terminal's free-model guidance and explicit hardware checks without automatic downloads. Do not describe this preview as full terminal parity until those workflows are implemented and verified.
