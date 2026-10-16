// Detect a repeated prose cycle in a bounded tail, including partial cycles
// split across streaming chunks. Called only for desktop responses.
export function repeatingResponse(text: string): boolean {
  if (text.length < 1024) return false
  const tail = text.slice(-4096).replace(/\s+/g, " ")
  for (let size = 40; size <= Math.min(512, Math.floor(tail.length / 6)); size++) {
    const unit = tail.slice(-size)
    let repeats = true
    for (let n = 2; n <= 6; n++) {
      if (tail.slice(-size * n, -size * (n - 1)) !== unit) { repeats = false; break }
    }
    if (repeats) return true
  }
  return false
}
