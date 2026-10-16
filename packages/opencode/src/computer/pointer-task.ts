/** Narrow explicit no-click/no-edit pointer requests; general desktop tasks stay unchanged. */
export function pointerOnly(request: string) {
  return /\b(?:pointer|cursor)\b/i.test(request) && /\b(?:move|moving)\b/i.test(request)
    && /\bwithout clicking\b/i.test(request) && /\b(?:without |or )(?:changing|editing)(?: the)? text\b/i.test(request)
}

export function assertPointerAction(request: string, action: string) {
  if (pointerOnly(request) && !["status", "find_app", "setup", "activate", "observe", "windows", "focus", "move", "close"].includes(action))
    throw new Error("This request allows pointer movement without clicking or changing text. No input was sent. Use an existing observed window; do not create a document or send keyboard input.")
}

export function requestedPositions(request: string) {
  if (!pointerOnly(request)) return
  const count = request.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|[1-9]|10)\s+(?:different\s+|distinct\s+)?positions\b/i)?.[1]?.toLowerCase()
  if (!count) return
  const words = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]
  return words.includes(count) ? words.indexOf(count) + 1 : Number(count)
}
