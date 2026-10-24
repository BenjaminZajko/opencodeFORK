import { Effect, Schema } from "effect"
import { Computer } from "@/computer/service"
import { ComputerBrowser } from "@/computer/browser"
import type { Provider } from "@/provider/provider"
import { Tool } from "./tool"

const Parameters = Schema.Struct({
  action: Schema.Literals(["open", "observe", "navigate", "click", "type", "fill", "screenshot", "new_tab", "switch_tab", "scroll", "back", "close"]),
  url: Schema.optional(Schema.String),
  target: Schema.optional(Schema.Number),
  revision: Schema.optional(Schema.Number),
  text: Schema.optional(Schema.String),
  tab: Schema.optional(Schema.String),
  direction: Schema.optional(Schema.Literals(["up", "down"])),
})

export const BrowserTool = Tool.define("browser", Effect.gen(function* () {
  const computer = yield* Computer.Service
  return {
    description: "Control a separate browser, visible in Computer mode or headless in Background browser mode. First open an HTTP/HTTPS URL; observe returns visible text and controls. Click/type require target and revision from the latest observation. Type appends text; fill replaces it (empty text clears it). Observations list browser-owned tabs; new_tab opens a URL and switch_tab uses an observed tab ID. Screenshot requires an image-capable model and separate approval; never use it on private pages. Scroll to reveal other controls. Each action returns a fresh observation; observe again if the page is loading. No JavaScript, downloads, private fields, or desktop control. Ask the human to handle login/payment fields. Close ends the browser session.",
    parameters: Parameters,
    execute: (input: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) => Effect.gen(function* () {
      if (!["computer", "computer_background", "computer_background_mac"].includes(ctx.agent)) throw new Error("Browser control is available only in Computer mode.")
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
      if (["open", "navigate", "click", "type", "fill", "back", "new_tab", "switch_tab", "screenshot"].includes(input.action)) {
        yield* ctx.ask({
          permission: input.action === "screenshot" ? "browser_screenshot" : "browser",
          patterns: [input.action === "screenshot" ? (input.url ?? observed?.url ?? "current page") : `${ctx.sessionID}:${input.action}:${input.url ?? input.tab ?? input.target ?? "page"}`],
          always: input.action === "screenshot" ? [] : [`${ctx.sessionID}:*`],
          metadata: Object.fromEntries(Object.entries({ action: input.action, url: input.url ?? observed?.url, label, target: input.target, textLength: input.text?.length, tab: input.tab, notice: input.action === "screenshot" ? "Capture the visible browser page and send its image to the selected model. It may include private page content." : "This browser action may change data or submit something. Review it before allowing." }).filter(([, value]) => value !== undefined)),
        })
      }
      const request = ctx.messages.findLast((message) => message.info.role === "user" && message.parts.some((part) => part.type === "text" && !part.synthetic))?.info.id ?? ctx.messageID
      const result = yield* computer.perform(ctx.sessionID, request, input, ctx.abort, ["computer_background", "computer_background_mac"].includes(ctx.agent))
      const { screenshot, ...observation } = result as Record<string, unknown> & { screenshot?: { mime: string; data: string } }
      return { title: `Computer · ${input.action}`, output: JSON.stringify(observation), metadata: { background: ["computer_background", "computer_background_mac"].includes(ctx.agent), action: input.action, ...(input.target !== undefined ? { target: input.target } : {}) },
        ...(screenshot ? { attachments: [{ type: "file" as const, mime: screenshot.mime, url: `data:${screenshot.mime};base64,${screenshot.data}` }] } : {}),
      }
    }).pipe(Effect.orDie),
  }
}))
