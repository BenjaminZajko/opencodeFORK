/** Old observations are evidence, not reusable controls. Stored chat records remain intact. */
export function historicalObservation(output: string): string {
  try {
    const value = JSON.parse(output)
    if (!value || typeof value !== "object" || Array.isArray(value)) return output.slice(0, 2000)
    const keep = ["app", "bundle", "title", "revision", "windowAvailable", "cursor", "bounds", "coordinateSystem", "documentModified", "inputSent", "needsObservation", "accessibility", "screenRecording", "url", "tab", "tabId"]
    const summary: Record<string, unknown> = { historical: true, note: "Earlier result: target IDs and screenshots omitted. Use the latest observation before acting." }
    for (const key of keep) if (value[key] !== undefined) summary[key] = value[key]
    if (typeof value.text === "string") summary.text = value.text.slice(0, 1500)
    if (typeof value.screenText === "string") summary.screenText = value.screenText.slice(0, 1000)
    if (Array.isArray(value.controls)) summary.documentText = value.controls.filter((item: any) => item.role === "AXTextArea").slice(0, 3).map((item: any) => String(item.value ?? "").slice(0, 500))
    return JSON.stringify(summary)
  } catch {
    return "[Historical observation; target IDs are stale]\n" + output.slice(0, 2000)
  }
}
