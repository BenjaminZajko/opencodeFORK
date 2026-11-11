import { createSignal, onMount } from "solid-js"
import { useSync } from "../context/sync"
import { useLocal } from "../context/local"
import { useRoute } from "../context/route"
import { useSDK } from "../context/sdk"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"
import { useToast } from "../ui/toast"
import { useDialogRequest } from "./dialog-request"
import { DialogRemote } from "./dialog-remote"

export function DialogComputer() {
  const local = useLocal()
  const sync = useSync()
  const route = useRoute()
  const sdk = useSDK()
  const dialog = useDialog()
  const toast = useToast()
  const { theme } = useTheme()
  const request = useDialogRequest()
  const [saving, setSaving] = createSignal(false)
  onMount(() => dialog.setSize("large"))
  // Older chats may still be in a separate Computer mode; offer a way back.
  const legacy = () => ["computer", "computer_background", "computer_background_mac", "desktop"].includes(local.agent.current()?.name ?? "")
  const setting = (key: "enabled" | "showBrowser") => sync.data.config.computer?.[key] ?? key === "enabled"
  async function toggle(key: "enabled" | "showBrowser") {
    if (saving()) return
    setSaving(true)
    const value = !setting(key)
    try {
      const result = await request((signal) => sdk.client.config.update({ config: { computer: { [key]: value } } }, { signal }))
      if (result.error) throw new Error("Could not save computer settings")
      sync.set("config", "computer", { ...sync.data.config.computer, [key]: value })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      toast.show({ message: "Could not save computer settings. Try again.", variant: "error" })
    } finally {
      setSaving(false)
    }
  }
  async function backToChat() {
    setSaving(true)
    try {
      if (route.data.type === "session") {
        const sessionID = route.data.sessionID
        const result = await request((signal) => sdk.client.session.abort({ sessionID }, { signal }))
        if (result.error) throw new Error("Could not stop computer control")
      }
      const model = local.model.current()
      local.agent.set("build")
      if (model) local.model.set(model)
      dialog.clear()
    } catch {
      toast.show({ message: "Could not stop. Press Esc twice or close OliveCode.", variant: "error" })
    } finally { setSaving(false) }
  }
  const apps = process.platform === "darwin" ? "Mac apps" : process.platform === "win32" ? "Windows apps (experimental)" : "Linux apps (experimental)"
  return <DialogSelect title="Computer" renderFilter={false} preserveSelection locked={saving()} detailIndent={6}
    options={[
      ...(legacy() ? [{ title: "Return to normal chat", value: "back", description: "Stop the old Computer mode", onSelect: () => void backToChat() }] : []),
      { title: "Computer use", value: "enabled", description: setting("enabled") ? "On" : "Off",
        details: [`OliveCode can use websites and ${apps} when you ask for it in chat.`, "Every action asks for your approval first."], onSelect: () => void toggle("enabled") },
      { title: "Show browser window", value: "showBrowser", description: setting("showBrowser") ? "On" : "Off",
        details: ["Off: websites open in a hidden browser so you can keep working.", "OliveCode can show it when you need to log in."], onSelect: () => void toggle("showBrowser") },
      { title: "Remote from phone", value: "remote", description: "Telegram · WhatsApp", onSelect: () => dialog.replace(() => <DialogRemote />) },
      ...(process.platform === "darwin" ? [{ title: "Advanced: separate Mac", value: "separate-mac", description: "Work on another Mac, not your screen",
        onSelect: () => dialog.replace(() => <DialogSeparateMac />) }] : []),
    ]}
    footer={<box paddingLeft={2} paddingRight={2} gap={0}>
      <text fg={theme.textMuted}>Just ask in chat, e.g. “check the weather on example.com” or “open TextEdit and write a note”.</text>
      <text fg={theme.textMuted}>{process.platform === "darwin" ? "The first Mac app task asks you to allow OliveCode Computer in System Settings." : "App control uses your system's accessibility features."}</text>
      <text fg={theme.textMuted}>{saving() ? "Saving…" : process.platform === "darwin" ? "Stop anytime: Esc twice · Control+Option+Esc stops app control." : "Stop anytime: Esc twice."}</text>
    </box>}
  />
}

/** Tasks on an isolated macOS virtual machine or second Mac, so your own cursor and screen are never used. */
function DialogSeparateMac() {
  const local = useLocal()
  const route = useRoute()
  const sdk = useSDK()
  const dialog = useDialog()
  const toast = useToast()
  const { theme } = useTheme()
  const request = useDialogRequest()
  const [busy, setBusy] = createSignal(false)
  const active = () => local.agent.current()?.name === "computer_background_mac"
  onMount(() => dialog.setSize("large"))
  async function setup() {
    setBusy(true)
    try {
      const compiled = process.execPath.endsWith("olivecode") || process.execPath.endsWith("opencode")
      const command = compiled ? [process.execPath, "background-mac"] : [process.execPath, process.argv[1]!, "background-mac"]
      const child = Bun.spawn(command, { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
      const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
      if (code !== 0) throw new Error(err.trim() || "Could not open the separate Mac setup.")
      toast.show({ message: out.trim() || "Separate Mac setup opened.", variant: "success" })
    } catch (error) {
      toast.show({ message: error instanceof Error ? error.message : "Could not open the separate Mac setup.", variant: "error" })
    } finally { setBusy(false) }
  }
  async function use(agent: string) {
    setBusy(true)
    try {
      if (route.data.type === "session") {
        const sessionID = route.data.sessionID
        const result = await request((signal) => sdk.client.session.abort({ sessionID }, { signal }))
        if (result.error) throw new Error("Could not stop the current task")
      }
      const model = local.model.current()
      local.agent.set(agent)
      if (model) local.model.set(model)
      dialog.clear()
    } catch {
      toast.show({ message: "Could not switch. Stop the current task and try again.", variant: "error" })
    } finally { setBusy(false) }
  }
  return <DialogSelect title="Separate Mac (advanced)" renderFilter={false} locked={busy()} detailIndent={6}
    options={[
      ...(process.arch === "arm64" ? [{ title: "Set up or show the separate Mac", value: "setup", description: busy() ? "Opening…" : "Virtual Mac manager",
        details: ["Create, start, stop or view a macOS virtual machine on this Mac.", "macOS is downloaded only when you choose Create; first setup is done by you."], onSelect: () => void setup() }] : []),
      active()
        ? { title: "Back to normal chat", value: "normal", description: "Use this Mac again", onSelect: () => void use("build") }
        : { title: "Use it for my next tasks", value: "use", description: "Apps and websites on the separate Mac",
            details: ["Your own cursor, screen and files are not touched.", "Needs a ready separate Mac with OliveCode Computer installed."], onSelect: () => void use("computer_background_mac") },
      { title: "Back", value: "back", description: "Computer settings", onSelect: () => dialog.replace(() => <DialogComputer />) },
    ]}
    footer={<box paddingLeft={2} paddingRight={2} gap={0}>
      <text fg={theme.textMuted}>For tasks you want fully separate from your own desktop.</text>
      <text fg={theme.textMuted}>Requires a macOS virtual machine or a second Mac connected over a trusted SSH alias.</text>
      <text fg={theme.textMuted}>Most people don't need this: normal chat already uses websites and apps.</text>
    </box>}
  />
}
