import { Effect, Schema } from "effect"
import { Computer } from "@/computer/service"
import { ComputerBrowser } from "@/computer/browser"
import type { Provider } from "@/provider/provider"
import { Tool } from "./tool"
import { Config } from "@/config/config"

const Parameters = Schema.Struct({
  action: Schema.Literals(["open", "observe", "navigate", "click", "type", "fill", "select", "press", "screenshot", "new_tab", "switch_tab", "scroll", "back", "close"]),
  key: Schema.optional(Schema.Literals(Object.keys(ComputerBrowser.KEYS) as [string, ...string[]])),
  url: Schema.optional(Schema.String),
  target: Schema.optional(Schema.Number),
  revision: Schema.optional(Schema.Number),
  text: Schema.optional(Schema.String),
  tab: Schema.optional(Schema.String),
  direction: Schema.optional(Schema.Literals(["up", "down"])),
  visible: Schema.optional(Schema.Boolean),
})

const VISIT = "Loads a page in OliveCode's separate browser. Its text is sent to the selected model."
const NOTICE: Record<string, string> = {
  open: VISIT,
  navigate: VISIT,
  new_tab: VISIT,
  back: VISIT,
  switch_tab: "Switches to another tab in OliveCode's separate browser.",
  click: "Clicking may submit a form, send something, or change data on the site. Review the target before allowing.",
  type: "Enters text into the page. Nothing is submitted until a later click or key press.",
  fill: "Replaces the text in this field. Nothing is submitted until a later click or key press.",
  press: "Sends a key to the focused control. Enter can submit a form.",
  select: "Changes a dropdown choice on the page, which some sites apply immediately.",
  screenshot: "Capture the visible browser page and send its image to the selected model. It may include private page content.",
}

export const BrowserTool =Tool.define("browser", Effect.gen(function* () {
  const computer = yield* Computer.Service
  const config = yield* Config.Service
  return {
    description: "Control OliveCode's own separate browser (never the person's personal browser). It runs hidden by default; pass visible: true with open when the person wants to watch or must log in or handle a private field themselves. First open an HTTP/HTTPS URL; observe returns page text, a headings outline, and numbered controls. Controls marked offscreen are below or beside the visible area; clicking or typing into one scrolls it into view automatically. When textTruncated is present, scroll down and observe to read the rest of the page. Click/type require a numeric target and revision from the latest observation (target is never a tab ID). Type appends text; fill replaces it (empty text clears it). Press sends one key (key: Enter, Escape, Tab, Backspace, arrows, PageUp/PageDown, Home, End) to the focused control: use Enter to submit a search box after typing, and Escape to close a suggestion list covering a button. Select chooses one observed dropdown option by its exact value or label using text; disabled, ambiguous and private options are refused. Observations list browser-owned tabs; new_tab opens a URL and switch_tab uses an observed tab ID. Screenshot requires an image-capable model and separate approval; never use it on private pages. Scroll to reveal other controls. Each action returns a fresh observation; observe again if the page is loading. No JavaScript, downloads, private fields, or desktop control. Ask the human to handle login/payment fields. Close ends the browser session.",
    parameters: Parameters,
    execute: (input: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) => Effect.gen(function* () {
      if (!["build", "computer", "computer_background", "computer_background_mac"].includes(ctx.agent)) throw new Error("Browser control is not available in this mode.")
      // Normal chat works in a hidden browser unless the person wants to watch, needs to log in,
      // or chose "Show browser window"; once a window is visible it stays visible for the task.
      const background = ctx.agent === "build"
        ? !(input.visible || (yield* config.get()).computer?.showBrowser || (yield* computer.browserBackground(ctx.sessionID)) === false)
        : ["computer_background", "computer_background_mac"].includes(ctx.agent)
      if (input.action !== "close") yield* computer.claimAction(ctx.sessionID, ctx.messageID)
      if (input.url) ComputerBrowser.webURL(input.url)
      if (input.action === "screenshot" && !(ctx.extra?.model as Provider.Model | undefined)?.capabilities.input.image)
        throw new Error("This model cannot read screenshots. Choose a model that supports images, or use page text and controls.")
      const lastObservation = ctx.messages.flatMap((message) => message.parts).findLast((part) =>
        part.type === "tool" && part.tool === "browser" && part.state.status === "completed")
      const observed = lastObservation?.type === "tool" && lastObservation.state.status === "completed"
        ? (() => { try { return JSON.parse(lastObservation.state.output) as { url?: string; controls?: { target: number; name: string }[] } } catch { return undefined } })()
        : undefined
      const label = observed?.controls?.find((node) => node.target === input.target)?.name
      if (["open", "navigate", "click", "type", "fill", "select", "press", "back", "new_tab", "switch_tab", "screenshot"].includes(input.action)) {
        yield* ctx.ask({
          permission: input.action === "screenshot" ? "browser_screenshot" : "browser",
          patterns: [input.action === "screenshot" ? (input.url ?? observed?.url ?? "current page") : `${ctx.sessionID}:${input.action}:${input.url ?? input.tab ?? input.target ?? input.key ?? "page"}`],
          always: input.action === "screenshot" ? [] : [`${ctx.sessionID}:*`],
          metadata: Object.fromEntries(Object.entries({ action: input.action, url: input.url ?? observed?.url, label, target: input.target, textLength: input.text?.length, tab: input.tab, key: input.key, notice: NOTICE[input.action] }).filter(([, value]) => value !== undefined)),
        })
      }
      const request = ctx.messages.findLast((message) => message.info.role === "user" && message.parts.some((part) => part.type === "text" && !part.synthetic))?.info.id ?? ctx.messageID
      const result = yield* computer.perform(ctx.sessionID, request, input, ctx.abort, background)
      const { screenshot, ...observation } = result as Record<string, unknown> & { screenshot?: { mime: string; data: string } }
      return { title: `Computer · ${input.action}`, output: JSON.stringify(observation), metadata: { background, action: input.action, ...(input.target !== undefined ? { target: input.target } : {}) },
        ...(screenshot ? { attachments: [{ type: "file" as const, mime: screenshot.mime, url: `data:${screenshot.mime};base64,${screenshot.data}` }] } : {}),
      }
    }).pipe(Effect.orDie),
  }
}))
