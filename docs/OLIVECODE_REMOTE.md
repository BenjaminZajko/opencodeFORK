# OliveCode Remote · Telegram

Send tasks from your phone while OliveCode runs on your home computer. The first implementation supports Telegram, using your own dedicated bot. WhatsApp is not implemented.

## Connect once

1. In Telegram, open the verified **@BotFather**, send `/newbot`, and create a bot for OliveCode. Keep its token private.
2. On your computer run `olivecode remote setup`. Paste the token into the masked prompt. Do not paste it into an OliveCode chat, a shell command argument, or a screenshot.
3. In your project folder run `olivecode remote start`. Choose **Coding** for project files, **Mac apps + browser** for visible app control, or **Background browser** for isolated websites. Alternatively use `olivecode remote start --mode coding --dir '/path/to/project'`.
4. Open the bot link printed in that terminal. Send `/pair` followed by the one-time code shown there. The code expires after ten minutes. Only the paired numeric user ID **and** private chat can control this connection.
5. Send a normal text task, such as “Create hello.txt containing Hello from Telegram, then verify it.” Choose **Allow once** or **Allow for 90 min** on your phone. OliveCode sends the final text back.

Inside OliveCode, `/remote` opens a setup panel with commands you can copy into a separate terminal. The workspace preview launcher does not install a global `olivecode` command: if it is unavailable, use the full path to `packages/opencode/dist/olivecode/bin/olivecode` for these commands. The public terminal installer provides the global command when installed.

Keep the remote terminal open, the computer awake, and the internet connected. No inbound port, router forwarding, public server or paid messaging service is required. The listener uses the official [Telegram Bot API](https://core.telegram.org/bots/api#getupdates) with outgoing HTTPS long polling. Use a dedicated bot; existing webhooks or another polling listener are rejected rather than silently changed.

## Phone controls

| Command | Action |
| --- | --- |
| `/status` | Current remote task and elapsed time |
| `/stop` | Abort work and deny pending approvals |
| `/pause` | Stop and hold; new text will not start work |
| `/resume` | Explicitly ask to continue the previous request |
| `/new` | New conversation, after stopping existing work |
| `/result` | Resend the latest result without executing the task again |
| `/mode` | Show enabled modes; `/mode coding` selects one |
| `/lock` | Cancel the 90-minute approval without stopping work |
| `/help` | Show these controls |

Only one remote task runs at a time. New tasks sent while busy are rejected, not silently queued. Remote conversations are stored in OliveCode's session database and can be inspected locally. Remote manages its own conversation, not the currently open local chat; do not edit the same files in another active agent session. A new listener starts a new conversation. Restarted listeners do not automatically resume unfinished work.

## Browser and Mac apps

The start screen asks which mode to use. Noninteractive starts default to coding. App and browser modes must be enabled **locally**, either by choosing them or by supplying `--mode`/`--allow-computer`. Coding stays available in the phone mode picker.

For the main Mac's Chrome, TextEdit, or other app windows:

```sh
olivecode remote start --mode visible
```

This starts in **Mac apps + browser** immediately. On the phone, `/mode` opens buttons for locally enabled modes. Choose the intended mode before sending the task. Coding mode has no desktop/browser tools; it should explain the mode switch instead of hunting for app executables through terminal commands. Native app discovery checks running apps, normal Applications folders, and bounded Playwright/Puppeteer/Selenium cache locations. It does not scan all personal files. This resolves testing browsers that live outside Applications; a failed lookup is not exhaustive proof that an app is absent.

To make several modes available:

```sh
olivecode remote start --allow-computer browser mac
```

Then choose `/mode browser` or `/mode mac` from your phone. Browser mode uses an isolated headless browser. Mac mode requires the separately configured Background Mac VM/second Mac and `OLIVECODE_BACKGROUND_MAC_SSH`; its real guest control remains a preview. It never falls back to controlling your main Mac.

Visible control, if you intentionally want the agent to use the home computer's active apps and cursor, must be enabled explicitly:

```sh
olivecode remote start --allow-computer visible
```

Visible Mac apps need an available logged-in desktop and macOS permissions. Screen captures also need Screen Recording where applicable. Native desktop control on Windows is not implemented; coding and browser transport use portable APIs but a Windows live run has not been verified.

## Permissions and captures

Remote sessions request approval for tool permissions, with external-directory access denied. File edit approvals include the proposed diff where available. **Allow once**, **Allow for 90 min**, and **Deny** buttons are tied to a pending operation and active task; old buttons cannot grant later work. Pending requests expire after ten minutes and are denied. Very large operations are denied if their full details cannot reasonably be reviewed in Telegram. Questions and plan-mode switches are disabled; send clarification as a new message after Stop if needed.

**Allow for 90 min** approves the current operation and later permitted operations in the current project and mode, including subsequent tasks in that connection. It can approve commands and file changes, so use it only for work you intend to delegate. The timer does not extend on use and is never saved to disk. `/status` shows minutes remaining. `/lock` or the **Cancel auto-approval** button revokes it immediately for future requests. Stop, Pause, a new chat, a mode change, Deny, or restarting also cancels it. Already delivered actions cannot be undone. Captures always ask separately; timed approval cannot enable a locally disabled mode, unlock unavailable tools, or override a denied permission. Each accepted request is still answered with the backend's one-time approval, not a permanent permission rule.

Capture forwarding is **off by default**. To deliver approved browser/app captures to your phone:

```sh
olivecode remote start --allow-computer browser --screenshots
```

Each screen capture still requests permission, and its approval notice states that it may be delivered to Telegram. Only bounded inline image attachments returned by the browser/desktop tools are forwarded; Remote never downloads arbitrary image URLs or uploads arbitrary local files. Some text-only models return recognized screen text rather than an image.

Tasks, approval details, code diffs, results and opted-in captures pass through Telegram's bot service. This is not a local-only or end-to-end-encrypted bot channel. Never grant an operation merely because the assistant requests it. The bot token is kept in OliveCode's configuration folder under `remote/telegram.json`, with private file/directory permissions on Unix. It is not placed in model prompts or command-line arguments. Windows ACL hardening still needs platform verification.

## Stop and disconnect

Ctrl+C in the remote terminal disconnects and stops its active task. `olivecode remote status` distinguishes saved pairing from a live listener using a short-lived local presence record. The welcome screen offers `/remote` when disconnected and shows a paired connection only while the listener is live. To erase the local connection, first stop the listener, then run `olivecode remote disconnect`. Revoke the token in BotFather when retiring the bot. Running setup again clears the previous account pairing.

Updates are persisted before task admission, preventing replay after a crash. Consequently an interruption between acknowledging a message and starting its task can lose that request; check `/status` and send it again if needed. Messages from before listener startup, or older than two minutes, are rejected. Network reconnection never automatically reruns a task; `/result` can resend the latest result while that listener remains running.

## Validation

Automated coverage exercises private pairing, unauthorized/group/forwarded messages, task exclusion, Stop/Pause, exact one-time approval binding, stale updates, token redaction, Unicode splitting, private credential storage and listener locking/restarts. Real-agent fixture tests use a disposable project and local fake model HTTP server: one approves and verifies a file edit; another stops at approval, verifies no edit occurred, and verifies pending approvals are cleared. Small-terminal onboarding is rendered at 120×30 and 60×20.

The user reports live pairing and task delivery working, including an approved Desktop file edit. Development tests do not use a live bot token, send actual Telegram messages, or edit personal files. The 90-minute timer, expiry/revocation, capture exclusion, mode buttons and listener presence have automated regression coverage. Real-agent local fixtures verify the exact coding/computer tool sets and mode instructions, approved edits, and Stop. The native app-name self-test verifies discovery in a temporary testing-browser cache layout. A fresh live phone-to-Chrome task with the updated build remains a user-context check.


## Computer menu and WhatsApp preview — 13 October 2026

Open **Computer → Remote from phone**. Telegram setup and Start remote launch the installed OliveCode executable in a separate terminal, preserving the chosen project folder. A Copy command option remains for systems without a supported terminal launcher. Keep that terminal open. Existing private account pairing and 90-minute approvals are unchanged. macOS may request permission for OliveCode to open Terminal the first time.

**WhatsApp uses the official Cloud API, not a personal-account QR login.** It is an advanced, unverified-with-a-live-Meta-account preview. It requires your Meta Business app, WhatsApp Phone Number ID, messaging access token, App Secret, an eligible owner phone and supported Graph API version. Check current Meta AI-provider eligibility and pricing; the currently documented AI-primary exception covers EEA/Brazil phone country codes. The adapter's phone filter is a scope guard, not proof of Meta account approval. Do not market global or free WhatsApp availability.

Setup (masked token and App Secret prompts; never paste secrets into model chat):

```sh
olivecode remote setup --channel whatsapp
olivecode remote start --channel whatsapp --mode coding
```

Setup saves credentials locally with private Unix permissions and prints a separate random webhook verification token for your Meta dashboard. No live connection is claimed at setup. Start listens only at http://127.0.0.1:8788/webhook (use --port to choose another port). Bring your own trusted public HTTPS tunnel/reverse proxy exposing ONLY that endpoint; no tunnel or inbound public port is opened automatically. In Meta configure its HTTPS callback, the printed verification token and the messages subscription. Send a NEW message from your configured phone to the Business number. Never expose OliveCode's normal API/server through this tunnel.

Phone tasks, Stop/Lock, scoped 90-minute approvals, mode choices and results use the same controller as Telegram. Choose --mode browser for isolated websites; --mode visible or --mode mac remain macOS-only. Captures stay off unless locally opted in with --screenshots, and each capture still asks. WhatsApp reply buttons are converted to three-button menus or list menus; their random approval IDs stay task-bound and expire. Uploads/voice/file commands are not supported. Only the exact configured sender and Business Phone Number ID are accepted, forwarded messages ignored, raw request bodies HMAC-SHA256 verified using the Meta App Secret, and receipt IDs persisted before admission so redelivery/restart cannot replay actions. Requests, inbox and payloads are bounded. Expired customer-service reply windows require a new user message; no template message or automatic outbound retry is sent. Transport delivery failure is not task success.

`olivecode remote status --channel whatsapp` reports local settings/listener state, not public webhook reachability or Meta approval. Stop the listener with Ctrl+C before disconnecting using `olivecode remote disconnect --channel whatsapp`. It shares the existing single-listener lock with Telegram; do not start both concurrently. No Meta credentials are sent to model prompts. API messages and approved captures pass through Meta's Business API under its terms; do not describe this as a local-only or end-to-end-encrypted bot integration.

Sources checked 13 October 2026: https://www.whatsapp.com/legal/business-solution-terms ; official implementation examples https://github.com/fbsamples/whatsapp-api-examples . Live Meta setup, actual delivery and native Windows/Linux UI launch remain separate platform verification requirements.
