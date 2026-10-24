import { createSignal } from "solid-js"
import { DialogSelect } from "../ui/dialog-select"
import { useTheme } from "../context/theme"
import { useSync } from "../context/sync"
import { useSDK } from "../context/sdk"
import { useToast } from "../ui/toast"
import { useDialogRequest } from "./dialog-request"

export function DialogAssist() {
  const { theme } = useTheme()
  const sync = useSync()
  const sdk = useSDK()
  const toast = useToast()
  const request = useDialogRequest()
  const [saving, setSaving] = createSignal(false)
  const enabled = (key: "teamwork" | "followThrough") => sync.data.config.collaboration?.[key] ?? true
  async function toggle(key: "teamwork" | "followThrough") {
    if (saving()) return
    setSaving(true)
    const value = !enabled(key)
    try {
      const result = await request((signal) => sdk.client.config.update({ config: { collaboration: { [key]: value } } }, { signal }))
      if (result.error) throw new Error("Could not save assistance settings")
      sync.set("config", "collaboration", { ...sync.data.config.collaboration, [key]: value })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      toast.show({ message: "Could not save assistance settings. Try again.", variant: "error" })
    } finally {
      setSaving(false)
    }
  }
  return <DialogSelect
    title="Task assistance"
    renderFilter={false}
    preserveSelection
    locked={saving()}
    detailIndent={6}
    options={[
      { title: "Teamwork", value: "teamwork", description: enabled("teamwork") ? "On" : "Off",
        details: ["Free models compare plans and check progress on larger tasks.", "Your chosen model performs the work."], onSelect: () => void toggle("teamwork") },
      { title: "Follow-through", value: "followThrough", description: enabled("followThrough") ? "On" : "Off",
        details: ["Checks the result and continues important unfinished work.", "Larger tasks get two independent first reviews."], onSelect: () => void toggle("followThrough") },
    ]}
    footer={<box paddingLeft={2} paddingRight={2} gap={1}>
      <text fg={theme.textMuted}>Cloud uses connected free accounts; local work stays on this computer.</text>
      <text fg={theme.textMuted}>Extra requests use your free quotas. Reviews can still miss mistakes.</text>
      <text fg={theme.textMuted}>{saving() ? "Saving…" : "Select to toggle · saved for this project · applies at the next task step"}</text>
    </box>}
  />
}
