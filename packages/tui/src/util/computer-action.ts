export function computerAction(input: Record<string, unknown>) {
  const action = String(input.action ?? "action")
  if (["rightClick", "right_click"].includes(action)) return "right-click"
  if (["doubleClick", "double_click"].includes(action)) return "double-click"
  if (["click", "click_point", "click_text"].includes(action)) {
    if (input.button === "right") return "right-click"
    if (input.count === 2) return "double-click"
  }
  return action === "move" ? "move pointer" : action
}
