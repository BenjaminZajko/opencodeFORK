import type { ComputerDesktop } from "./desktop"

export type Request = Omit<ComputerDesktop.Action, "action"> & { action: ComputerDesktop.Action["action"] | "rightClick" | "right_click" | "doubleClick" | "double_click" }

/** Explicit equivalent spellings only; never guess an unknown gesture or target. */
export function canonical(input: Request): ComputerDesktop.Action {
  if (["rightClick", "right_click"].includes(input.action)) {
    if ((input.button !== undefined && input.button !== "right") || (input.count !== undefined && input.count !== 1))
      throw new Error("Right-click spelling conflicts with its button or count. No desktop action was performed.")
    return { ...input, action: "click", button: "right", count: 1 }
  }
  if (["doubleClick", "double_click"].includes(input.action)) {
    if ((input.button !== undefined && input.button !== "left") || (input.count !== undefined && input.count !== 2))
      throw new Error("Double-click spelling conflicts with its button or count. No desktop action was performed.")
    return { ...input, action: "click", button: "left", count: 2 }
  }
  return input as ComputerDesktop.Action
}

export type Observation = {
  revision: number
  bounds?: { x: number; y: number; width: number; height: number }
  focusedTarget?: number
  app?: string
  needsObservation?: boolean
  visualTargets?: { target: number; text: string }[]
  windows?: { window: number; title: string }[]
  controls: { target: number; role: string; name?: string; enabled?: boolean }[]
}

/** Supply only references from the observation already given to the model.
 * The native helper still checks its revision, foreground window and target signature.
 */
export function normalize(request: Request, observed?: Observation): ComputerDesktop.Action {
  const input = canonical(request)
  if (input.action === "find_app" && (!input.query || input.query.trim().length < 2 || input.query.trim().length > 80))
    throw new Error("Search for the specific requested app name, between 2 and 80 characters.")
  if ((input.button !== undefined || input.count !== undefined) && !["click", "click_point", "click_text"].includes(input.action))
    throw new Error("Button and count apply only to clicks. No desktop action was performed.")
  if (input.button === "right" && input.count === 2) throw new Error("Right-click opens a context menu; double-click is left-button only. No desktop action was performed.")
  if (!["click", "click_point", "click_text", "move", "drag", "focus", "type", "fill", "key", "scroll", "screenshot", "look"].includes(input.action)) return input
  if (!observed || !Number.isInteger(observed.revision) || observed.revision < 1)
    throw new Error("Observe the requested app freshly: activate the intended app and read its result before acting. Previous-request targets cannot be reused. No desktop action was performed.")
  if (observed.needsObservation && input.action !== "focus")
    throw new Error("The previous action sent input but could not verify its result. Focus the observed app or observe before further input; do not replay the previous action.")
  const result = { ...input, revision: input.revision ?? observed.revision }
  const coordinateMove = input.action === "move" && (input.x !== undefined || input.y !== undefined)
  if (coordinateMove && (input.target !== undefined || !Number.isFinite(input.x) || !Number.isFinite(input.y) || input.x! < 0 || input.y! < 0))
    throw new Error("Move uses either one observed target OR finite window-relative x/y, not both. No desktop action was performed.")
  if (coordinateMove && observed.bounds && (input.x! >= observed.bounds.width || input.y! >= observed.bounds.height))
    throw new Error(`Move coordinates are window-relative: use 0 <= x < ${observed.bounds.width} and 0 <= y < ${observed.bounds.height}. No input was sent; revision remains ${observed.revision}.`)
  if (["type", "fill"].includes(input.action) && result.target === undefined) {
    // Never infer a search, password or other single-line field from missing arguments.
    const focused = observed.controls.find((control) => control.target === observed.focusedTarget && control.role === "AXTextArea" && control.enabled !== false)
    if (focused) result.target = focused.target
  }
  if (["click", "move", "drag", "type", "fill"].includes(input.action) && !coordinateMove && (result.target === undefined || !Number.isInteger(result.target) || result.target < 1))
    throw new Error("Choose a target from the latest observation. Typing without a target works only in an observed, focused document text area. No desktop action was performed.")
  if (["move", "drag"].includes(input.action) && !coordinateMove && !observed.controls.some((control) => control.target === result.target && control.enabled !== false))
    throw new Error("Choose an enabled target from the latest observation. No desktop action was performed.")
  if (input.action === "drag" && (!Number.isInteger(input.toTarget) || input.toTarget === input.target || !observed.controls.some((control) => control.target === input.toTarget && control.enabled !== false)))
    throw new Error("Drag needs a different observed destination target. No desktop action was performed.")
  if (input.action === "click_text" && !observed.visualTargets?.some((item) => item.target === input.target))
    throw new Error("Choose a recognized text target from the latest approved look result. No desktop action was performed.")
  if (input.action === "focus" && input.window !== undefined && !observed.windows?.some((item) => item.window === input.window))
    throw new Error("Choose a window from the latest windows result. No desktop action was performed.")
  return result
}

export * as DesktopRequest from "./desktop-request"
