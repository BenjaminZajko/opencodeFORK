import { assertPointerAction } from "@/computer/pointer-task"
import { Effect, Schema } from "effect"
import { Computer } from "@/computer/service"
import type { Provider } from "@/provider/provider"
import { Tool } from "./tool"
import { DesktopRequest } from "@/computer/desktop-request"

const Parameters = Schema.Struct({
  action: Schema.Literals(["status", "find_app", "setup", "activate", "observe", "windows", "focus", "look", "click_text", "click", "click_point", "rightClick", "right_click", "doubleClick", "double_click", "move", "drag", "type", "fill", "key", "scroll", "screenshot", "close"]),
  app: Schema.optional(Schema.String), query: Schema.optional(Schema.String), window: Schema.optional(Schema.Number), permission: Schema.optional(Schema.Literals(["accessibility", "screen"])),
  target: Schema.optional(Schema.Number), revision: Schema.optional(Schema.Number), text: Schema.optional(Schema.String),
  key: Schema.optional(Schema.String), modifiers: Schema.optional(Schema.Array(Schema.Literals(["command", "shift", "option", "control"]))),
  direction: Schema.optional(Schema.Literals(["up", "down"])), x: Schema.optional(Schema.Number), y: Schema.optional(Schema.Number),
  toTarget: Schema.optional(Schema.Number), button: Schema.optional(Schema.Literals(["left", "right"])), count: Schema.optional(Schema.Literals([1, 2])),
})

export const DesktopTool = Tool.define("desktop", Effect.gen(function* () {
  const computer = yield* Computer.Service
  let actionMessage: string | undefined
  return {
    description: "The tool name is desktop. Call exactly one desktop action per assistant turn and wait for its result before choosing the next action. Every operation uses this tool with an action argument; type, click, status and activate are NOT separate tools. Example: desktop({action: 'type', text: 'Hello', target: 1, revision: 2}). Control macOS apps with the actual mouse and keyboard. First status checks OS permissions without reading screen content; setup opens Accessibility or Screen Recording settings for the human. find_app with query searches for a specific requested app name and returns matching installed app names and bundle identifiers without reading windows. Activate an installed app by bundle identifier (e.g. com.apple.TextEdit), or observe the active window. Observe reads accessibility text, not an image. windows lists only this app's window titles; focus raises the already observed window or a window number from windows, using its revision. Use focus once after a covered-point error, then read its result before retrying. Observations contain text, targets and revision. move with target/revision moves the actual pointer without clicking, or use x/y measured from the latest observed window top-left WITHOUT a target to move inside that window. Never supply both target and x/y. This coordinate movement needs no image because it does not click; native window/display/foreground/private-point checks still apply. Start each new user request by activating the intended app and reading its fresh observation; previous-request targets cannot be reused. click accepts button left/right and count 1/2 (double-click is left only); this also applies to click_text/click_point. Prefer click with button right or count 2. rightClick/right_click and doubleClick/double_click are equivalent target-based spellings, normalized before approval; conflicting button/count fields are rejected. Right-click opens a context menu; read returned menu targets before choosing anything. drag uses target and toTarget from the latest accessibility observation, moving between their centers within the same window; never use it to move files or data without the requested intent. Cursor positions in returned observations are relative to the active window. Click/type/fill use latest target and revision; fill replaces, type appends. Key supports enter/tab/escape/backspace/delete/arrows/home/end/pageup/pagedown/space or a/b/c/d/e/f/g/h/i/k/l/m/n/o/p/r/s/t/u/v/w/x/y/z plus command/shift/option/control modifiers. Scroll up/down uses latest revision. look requires separate screen-capture approval and macOS Screen Recording: on-device OCR supplies screenText and visualTargets for any model; an image-capable model also receives the image. OCR can misread labels and does not understand icons. click_text uses target from the latest look visualTargets, never from accessibility controls; labels are not necessarily buttons. Screenshot requires separate approval and image support, returning only the active window. click_point uses x/y from the latest approved screenshot, measured from its top-left, plus its revision; otherwise use target clicks. Terminal apps and private fields are blocked. Close stops the helper. Do not execute code via other apps, enter secrets, change system security, or infer success without observing it.",
    parameters: Parameters,
    execute: (requestInput: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) => Effect.gen(function* () {
      if (ctx.agent !== "desktop" && !(["computer", "computer_background_mac"].includes(ctx.agent) && process.platform === "darwin")) throw new Error("Desktop control is available only in Computer mode on macOS.")
      const input = DesktopRequest.canonical(requestInput)
      // Providers may ignore parallelToolCalls=false. Never apply two actions
      // chosen from the same observation, even if the first finished quickly.
      if (input.action !== "close") {
        yield* computer.claimAction(ctx.sessionID, ctx.messageID)
        if (actionMessage === ctx.messageID) throw new Error("Only one desktop action is allowed per assistant turn. This extra action was not executed. Read the first action's result, then observe in the next turn before choosing another action.")
        actionMessage = ctx.messageID
      }
      const currentRequest = ctx.messages.findLastIndex((message) => message.info.role === "user" && message.parts.some((part) => part.type === "text" && !part.synthetic))
      const taskText = ctx.messages[currentRequest]?.parts.flatMap((part) => part.type === "text" && !part.synthetic && !part.ignored ? [part.text] : []).join("\n") ?? ""
      assertPointerAction(taskText, input.action)
      const observations = ctx.messages.slice(currentRequest + 1).flatMap((message) => message.parts).flatMap((part) => {
        if (part.type !== "tool" || part.tool !== "desktop" || part.state.status !== "completed") return []
        try {
          const result = JSON.parse(part.state.output)
          return typeof result.revision === "number" && Array.isArray(result.controls) ? [result as DesktopRequest.Observation] : []
        } catch { return [] }
      })
      const action = DesktopRequest.normalize(input, observations.at(-1))
      const observedApp = input.action === "find_app" ? input.query : input.app ?? observations.at(-1)?.app
      const latest = observations.at(-1)
      const label = input.action === "click_text" ? latest?.visualTargets?.find((item) => item.target === action.target)?.text
        : input.action === "focus" && action.window !== undefined ? latest?.windows?.find((item) => item.window === action.window)?.title
        : latest?.controls.find((control) => control.target === action.target)?.name
      const destination = latest?.controls.find((control) => control.target === action.toTarget)?.name
      const imageCapable = (ctx.extra?.model as Provider.Model | undefined)?.capabilities.input.image === true
      const capture = ["screenshot", "look"].includes(input.action)
      if (["screenshot", "click_point"].includes(input.action) && !imageCapable)
        throw new Error("This model cannot read screenshots. Use observed text and target controls, or choose an image-capable model.")
      const request = ctx.messages.findLast((message) => message.info.role === "user" && message.parts.some((part) => part.type === "text" && !part.synthetic))?.info.id ?? ctx.messageID
      const { screenshot, ...observation } = yield* Effect.acquireUseRelease(
        input.action === "close" ? Effect.succeed(() => {}) : computer.holdDesktop(ctx.sessionID, request, ctx.agent === "computer_background_mac"),
        () => Effect.gen(function* () {
          let prompted = false
          if (!["status", "close"].includes(input.action)) prompted = yield* (ctx.askWithReceipt ?? ((request) => ctx.ask(request).pipe(Effect.as(false))))({
            permission: capture ? "desktop_screenshot" : "desktop",
            patterns: [`${ctx.sessionID}:${input.action}:${input.app ?? input.target ?? "window"}`],
            always: capture ? [] : [`${ctx.sessionID}:*`],
            metadata: { background: ctx.agent === "computer_background_mac", action: input.action, ...(observedApp ? { app: observedApp } : {}), ...(label ? { label } : {}), ...(destination ? { destination } : {}), ...(action.button ? { button: action.button } : {}), ...(action.count ? { count: action.count } : {}), ...(action.x !== undefined ? { x: action.x } : {}), ...(action.y !== undefined ? { y: action.y } : {}),
              notice: capture ? imageCapable ? "Capture the observed app window and send its image and recognized text to your model. It can contain personal information."
                : "Read visible text from an image of the observed app window using on-device recognition. Only recognized text and positions go to your model and enabled Assist advisers; the image stays local. It can contain personal information." : ctx.agent === "computer_background_mac" ? "Use the isolated Mac’s mouse and keyboard. Your main desktop is not controlled. Stop ends remote control." : "Use your Mac’s actual mouse and keyboard in the observed app. After this approval, OliveCode returns to that window. Stop ends control." },
          })
          return yield* computer.desktop(ctx.sessionID, request, { ...action, restoreAfterApproval: prompted }, ctx.abort, ctx.agent === "computer_background_mac")
        }),
        (release) => Effect.sync(release),
      )
      if (input.action === "look") observation.vision = imageCapable ? "image and on-device screen text" : "on-device screen text only; no image sent to model"
      return { title: `Computer · ${input.action}`, output: JSON.stringify(observation), metadata: { background: ctx.agent === "computer_background_mac", action: input.action,
        ...(action.revision !== undefined ? { revision: action.revision } : {}), ...(action.target !== undefined ? { target: action.target } : {}),
        ...(action.toTarget !== undefined ? { toTarget: action.toTarget } : {}), ...(action.button ? { button: action.button } : {}), ...(action.count ? { count: action.count } : {}),
        ...(action.x !== undefined ? { x: action.x } : {}), ...(action.y !== undefined ? { y: action.y } : {}),
      },
        ...(screenshot && imageCapable ? { attachments: [{ type: "file" as const, mime: screenshot.mime, url: `data:${screenshot.mime};base64,${screenshot.data}` }] } : {}),
      }
    }).pipe(Effect.orDie),
  }
}))
