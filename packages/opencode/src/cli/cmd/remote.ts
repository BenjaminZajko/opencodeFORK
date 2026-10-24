import { Effect, Option } from "effect"
import { realpath } from "node:fs/promises"
import path from "node:path"
import { randomBytes } from "node:crypto"
import { Global } from "@opencode-ai/core/global"
import { effectCmd, fail } from "../effect-cmd"
import { password, intro, log, select, text } from "../effect/prompt"
import { UI } from "../ui"
import { ModeLabels, type Mode } from "../../remote/controller"
import { readRemotePresence } from "@opencode-ai/core/olivecode/remote-status"

export const RemoteCommand = effectCmd({
  command: "remote [action]",
  describe: "connect your phone and run OliveCode remotely",
  instance: false,
  builder: (yargs) => yargs
    .positional("action", { type: "string", choices: ["setup", "start", "status", "disconnect"], default: "start" })
    .option("channel", { type: "string", choices: ["telegram", "whatsapp"], default: "telegram", describe: "phone service; WhatsApp requires Meta Business API setup" })
    .option("port", { type: "number", default: 8788, describe: "local WhatsApp webhook port; bring your own HTTPS tunnel" })
    .option("dir", { type: "string", describe: "project folder to control (defaults to the current folder)" })
    .option("model", { type: "string", describe: "free model in provider/model format; otherwise use OliveCode's default" })
    .option("mode", { type: "string", choices: ["coding", "browser", "mac", "visible"], describe: "start in this mode (also enables it locally)" })
    .option("allow-computer", { type: "string", array: true, choices: ["browser", "mac", "visible"], describe: "locally enable additional remote modes" })
    .option("screenshots", { type: "boolean", default: false, describe: "deliver separately approved browser/app captures to Telegram" }),
  handler: Effect.fn("Cli.remote")(function* (args) {
    const { RemoteStore } = yield* Effect.promise(() => import("../../remote/store"))
    const { Telegram } = yield* Effect.promise(() => import("../../remote/telegram"))
    const { WhatsAppStore, WhatsAppState, listenWhatsApp } = yield* Effect.promise(() => import("../../remote/whatsapp"))
    const directoryConfig = path.join(Global.Path.config, "remote")
    const store = new RemoteStore(directoryConfig)
    const whatsapp = new WhatsAppStore(directoryConfig)
    if (args.channel === "whatsapp" && args.action === "setup") {
      yield* intro("OliveCode Remote · WhatsApp Business API")
      yield* log.info("ADVANCED SETUP\n1. Create a Meta Business app with WhatsApp, a phone number and messaging access token.\n2. Bring an HTTPS tunnel/reverse proxy for the local webhook.\n3. Configure one allowed phone below. No QR login or personal chat history is used.\n\nCheck Meta AI-provider eligibility (currently EEA/Brazil exception) and charges before use.\nhttps://www.whatsapp.com/legal/business-solution-terms")
      const token = process.env.OLIVECODE_WHATSAPP_TOKEN ?? Option.getOrUndefined(yield* password({ message: "WhatsApp access token" }))
      if (!token) return
      const appSecret = process.env.OLIVECODE_WHATSAPP_APP_SECRET ?? Option.getOrUndefined(yield* password({ message: "Meta App Secret (webhook signature verification)" }))
      if (!appSecret) return
      const phoneID = process.env.OLIVECODE_WHATSAPP_PHONE_ID ?? Option.getOrUndefined(yield* text({ message: "WhatsApp Phone Number ID from Meta" }))
      if (!phoneID) return
      const owner = process.env.OLIVECODE_WHATSAPP_OWNER ?? Option.getOrUndefined(yield* text({ message: "Your allowed phone number, international digits (e.g. 421...), without +" }))
      if (!owner) return
      const apiVersion = process.env.OLIVECODE_WHATSAPP_API_VERSION ?? Option.getOrUndefined(yield* text({ message: "Supported Graph API version shown in your Meta app (e.g. v26.0)" }))
      if (!apiVersion) return
      const state = WhatsAppState.safeParse({ token: token.trim(), appSecret: appSecret.trim(), phoneID: phoneID.trim(), owner: owner.trim(), apiVersion: apiVersion.trim(), verifyToken: randomBytes(24).toString("base64url") })
      if (!state.success) return yield* fail("Invalid WhatsApp settings. Use an eligible international phone, numeric Phone Number ID, full token/secret, and vNN.0 API version.")
      yield* Effect.tryPromise({ try: async () => {
        const release = await whatsapp.lock()
        try { await whatsapp.save(state.data) } finally { await release() }
      }, catch: () => new Error("Could not save WhatsApp setup. Stop Remote first and try again.") }).pipe(Effect.catch(error => fail(error.message)))
      console.log(`\nSAVED LOCALLY · connection is not verified yet.\n\nRun: olivecode remote start --channel whatsapp\nExpose only /webhook over your own HTTPS tunnel, then configure that callback URL in Meta.\nWebhook verify token (Meta dashboard only, never chat): ${state.data.verifyToken}\nSubscribe to messages. Send a new message from your allowed phone to the Business number.\nTokens are not sent to models. Setup again resets receipt history.`)
      return
    }
    if (args.channel === "whatsapp" && args.action === "disconnect") {
      yield* Effect.tryPromise({ try: async () => { const release = await whatsapp.lock(); try { await whatsapp.disconnect() } finally { await release() } }, catch: () => new Error("Stop Remote before disconnecting WhatsApp.") }).pipe(Effect.catch(error => fail(error.message)))
      console.log("WhatsApp disconnected locally. Revoke Meta credentials and remove your tunnel if no longer needed.")
      return
    }
    if (args.channel === "whatsapp" && args.action === "status") {
      const state = yield* Effect.tryPromise({ try: () => whatsapp.load(), catch: () => new Error("Could not read WhatsApp settings.") }).pipe(Effect.catch(error => fail(error.message)))
      const presence = yield* Effect.promise(() => readRemotePresence(Global.Path.state))
      console.log(!state ? "NOT CONFIGURED · olivecode remote setup --channel whatsapp" : presence?.channel === "whatsapp" ? "LOCAL WEBHOOK ONLINE · HTTPS route and Meta delivery must also be configured" : "OFFLINE · settings saved; start with --channel whatsapp")
      return
    }
    if (args.action === "setup") {
      yield* intro("OliveCode Remote · Telegram")
      const bold = (value: string) => process.stdout.isTTY ? UI.Style.TEXT_NORMAL_BOLD + value + UI.Style.TEXT_NORMAL : value
      yield* log.info(`${bold("1. Open Telegram → verified @BotFather")}\n   https://t.me/BotFather\n\n${bold("2. Send /newbot")}\n   Choose a name, then copy the bot token.\n\n${bold("3. Paste the token below")}\n   Hidden while typing. Never send it in a chat.`)
      yield* log.info("Tasks and results travel through Telegram. Only your paired account gets access.")
      const token = process.env.OLIVECODE_TELEGRAM_TOKEN ?? Option.getOrUndefined(yield* password({ message: "Bot token", validate: (value) => /^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(value?.trim() ?? "") ? undefined : "Paste the full token from BotFather." }))
      if (!token) return
      yield* Effect.tryPromise({
        try: async () => {
          const release = await store.lock()
          try {
            const telegram = new Telegram(token.trim())
            const me = await telegram.call<{ id: number; username: string; is_bot: boolean }>("getMe", {})
            if (!me.is_bot || !Number.isSafeInteger(me.id) || !/^[A-Za-z0-9_]{5,32}$/.test(me.username)) throw new Error("Telegram did not return a valid bot.")
            await store.save({ token: token.trim(), botID: me.id, username: me.username, offset: 0 })
            console.log(`\n${bold(`CONNECTED · @${me.username}`)}\n\n${bold("NEXT → Start remote in your project folder")}\n\n   olivecode remote start\n\nChoose Coding or Computer control, then pair your phone using the code shown.\nSetting up again resets the old pairing.`)
          } finally { await release() }
        }, catch: () => new Error("Could not connect Telegram. Check the token and internet connection; stop any running Remote listener before setup."),
      }).pipe(Effect.catch((error) => fail(error.message)))
      return
    }
    if (args.action === "disconnect") {
      yield* Effect.tryPromise({ try: async () => { const release = await store.lock(); try { await store.disconnect() } finally { await release() } }, catch: () => new Error("Stop the running Remote listener before disconnecting.") }).pipe(Effect.catch((error) => fail(error.message)))
      console.log("Telegram disconnected locally. Revoke the bot token in BotFather if you no longer need it.")
      return
    }
    if (args.action === "status") {
      const state = yield* Effect.tryPromise({ try: () => store.load(), catch: () => new Error("Could not read Remote settings.") }).pipe(Effect.catch((error) => fail(error.message)))
      const activePresence = yield* Effect.promise(() => readRemotePresence(Global.Path.state))
      const presence = activePresence?.channel === "whatsapp" ? undefined : activePresence
      console.log(!state ? "NOT CONNECTED\nRun olivecode remote setup." : `@${state.username} · ${presence?.phase === "reconnecting" ? "RECONNECTING" : presence?.paired ? "ONLINE · paired" : presence ? "ONLINE · waiting for pairing" : state.owner ? "OFFLINE · pairing saved" : "OFFLINE · not paired"}\n${presence ? "Keep the remote terminal open and your computer awake." : "Run olivecode remote start in your project folder."}`)
      return
    }
    if (!Number.isInteger(args.port) || args.port < 1024 || args.port > 65535) return yield* fail("Choose a webhook port from 1024 to 65535.")
    if (args.model && (!args.model.includes("/") || args.model.startsWith("/") || args.model.endsWith("/"))) return yield* fail("Use provider/model for --model.")
    const mode = args.mode as Mode | undefined ?? (process.stdin.isTTY && process.stdout.isTTY ? Option.getOrUndefined(yield* select<Mode>({
      message: "What should OliveCode do from your phone?",
      options: [
        { value: "coding", label: "Coding · project files", hint: "Create, edit and test code" },
        ...(process.platform === "darwin" ? [{ value: "visible" as const, label: "Mac apps + browser", hint: "Uses this Mac’s visible mouse and keyboard" }] : []),
        { value: "browser", label: "Background browser", hint: "Websites · leaves your cursor free" },
        ...(process.platform === "darwin" ? [{ value: "mac" as const, label: "Background Mac", hint: "Requires a configured isolated Mac or VM" }] : []),
      ],
    })) : "coding")
    if (!mode) return
    if (process.platform !== "darwin" && ["visible", "mac"].includes(mode)) return yield* fail("Native app control requires macOS. Choose --mode coding or --mode browser.")
    const modes = [...new Set<Mode>(["coding", mode, ...((args["allow-computer"] ?? []) as Mode[])])]
    if (process.platform !== "darwin" && modes.some((value) => ["visible", "mac"].includes(value))) return yield* fail("Mac app modes require macOS. Use browser for websites on this computer.")
    const { localRemoteDriver } = yield* Effect.promise(() => import("../../remote/driver"))
    const { listenRemote } = yield* Effect.promise(() => import("../../remote/listener"))
    const directory = yield* Effect.tryPromise({ try: () => realpath(path.resolve(args.dir ?? process.cwd())), catch: () => new Error("Choose an existing project folder.") }).pipe(Effect.catch((error) => fail(error.message)))
    const controller = new AbortController()
    const stop = () => controller.abort()
    process.once("SIGINT", stop); process.once("SIGTERM", stop)
    yield* Effect.tryPromise({
      try: async () => {
        console.log(`\n${ModeLabels[mode]}\nProject: ${directory}\nApprove once or for 90 minutes from your phone. Captures still ask.\nCtrl+C stops Remote and its active task.`)
        const driver = await localRemoteDriver(directory, args.model, modes, args.channel === "whatsapp" ? "WhatsApp" : "Telegram")
        if (args.channel === "whatsapp") {
          await listenWhatsApp(whatsapp, driver, controller.signal, { modes, mode, port: args.port, screenshots: args.screenshots, log: console.log, presenceDirectory: Global.Path.state })
          return
        }
        await listenRemote(store, driver, controller.signal, { modes, mode, screenshots: args.screenshots, log: console.log, presenceDirectory: Global.Path.state })
      }, catch: (error) => new Error(error instanceof Error ? error.message : "Remote stopped unexpectedly."),
    }).pipe(Effect.ensuring(Effect.sync(() => { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop) })), Effect.catch((error) => fail(error.message)))
  }),
})
