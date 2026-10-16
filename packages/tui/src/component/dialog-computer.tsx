import { useTerminalDimensions } from "@opentui/solid"
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
  const dimensions = useTerminalDimensions()
  const compact = () => dimensions().height < 26 || dimensions().width < 80
  const sight = () => {
    const model = local.model.current()
    const info = model && sync.data.provider.find((provider) => provider.id === model.providerID)?.models[model.modelID]
    if (compact()) return info?.capabilities.input.image ? "Model: images + text" : process.platform === "darwin" ? "Model: text + on-device reading" : "Model: browser text"
    return info?.capabilities.input.image ? "Current model: images + window text" : process.platform === "darwin" ? "Current model: window text + local screen-text recognition" : "Current model: browser text"
  }
  const route = useRoute()
  const sdk = useSDK()
  const dialog = useDialog()
  const toast = useToast()
  const { theme } = useTheme()
  const request = useDialogRequest()
  onMount(() => dialog.setSize("large"))
  const [stopping, setStopping] = createSignal(false)
  const [remoteHovered, setRemoteHovered] = createSignal(false)
  async function start(agent: string) {
    setStopping(true)
    try {
      if (route.data.type === "session") {
        const sessionID = route.data.sessionID
        const result = await request((signal) => sdk.client.session.abort({ sessionID }, { signal }))
        if (result.error) throw new Error("Could not stop the previous task")
      }
      const model = local.model.current()
      local.agent.set(agent)
      if (model) local.model.set(model)
      dialog.clear()
    } catch { toast.show({ message: "Could not switch modes. Stop the current task and try again.", variant: "error" }) }
    finally { setStopping(false) }
  }
  async function stop() {
    setStopping(true)
    try {
      if (route.data.type === "session") {
        const result = await request((signal) => sdk.client.session.abort({ sessionID: route.data.type === "session" ? route.data.sessionID : "" }, { signal }))
        if (result.error) throw new Error("Could not stop computer control")
      }
      const model = local.model.current()
      local.agent.set("build")
      if (model) local.model.set(model)
      dialog.clear()
    } catch {
      toast.show({ message: "Could not stop. Press Esc twice or close OliveCode.", variant: "error" })
    } finally { setStopping(false) }
  }
  async function setupMac() {
    setStopping(true)
    try {
      const compiled = process.execPath.endsWith("olivecode") || process.execPath.endsWith("opencode")
      const command = compiled ? [process.execPath, "background-mac"] : [process.execPath, process.argv[1]!, "background-mac"]
      const child = Bun.spawn(command, { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
      const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
      if (code !== 0) throw new Error(err.trim() || "Could not open Background Mac setup. Use the packaged OliveCode build.")
      toast.show({ message: out.trim() || "Background Mac setup opened.", variant: "success" })
    } catch (error) {
      toast.show({ message: error instanceof Error ? error.message : "Could not open Background Mac setup.", variant: "error" })
    } finally { setStopping(false) }
  }
  return <DialogSelect title="Computer" renderFilter={false} locked={stopping()} detailIndent={6}
    options={[
      { title: local.agent.current()?.name === "computer" ? "Visible control is on" : "Start visible control", value: "start", description: process.platform === "darwin" ? "Websites + Mac apps" : "Websites",
        details: ["Watch the task in its browser or app window.", process.platform === "darwin" ? "Uses your mouse and keyboard for Mac apps · smooth pointer movement." : "A separate browser window; your normal browsing stays separate."],
        onSelect: () => void start("computer") },
      { title: local.agent.current()?.name === "computer_background" ? "Background browser is on" : "Start background browser", value: "background", description: "Websites · keep working",
        details: ["An isolated browser works without taking your cursor or opening a window.", "Check progress in this chat. Mac apps and manual login need Visible control."],
        onSelect: () => void start("computer_background") },
      ...(process.platform === "darwin" ? [{ title: local.agent.current()?.name === "computer_background_mac" ? "Background Mac is on" : "Start background Mac", value: "background-mac", description: "Mac apps + websites · isolated Mac required",
        details: ["Uses a separate macOS VM or Mac, with its own apps, files and permissions.", "Setup: trusted SSH connection and OliveCode Computer installed there. Progress stays in chat."],
        onSelect: () => void start("computer_background_mac") }] : []),
      { title: "Stop and return to coding", value: "stop", description: stopping() ? "Stopping…" : "End control",
        details: ["Stops mouse and keyboard control and closes the separate browser."], onSelect: () => void stop() },
      { title: "Remote from phone", value: "remote", description: "Telegram · WhatsApp setup",
        details: ["Connect your phone and start remote tasks from here.", "Approve actions on your phone. Your computer must stay awake."], onSelect: () => dialog.replace(() => <DialogRemote />) },
      ...(process.platform === "darwin" && process.arch === "arm64" ? [{ title: "Set up / show background Mac", value: "setup-mac", description: "Create and manage a separate Mac",
        details: ["Open the VM manager · start, shut down or show its screen.", "macOS downloads only when you choose Create. Initial guest setup and connection are manual."], onSelect: () => void setupMac() }] : []),
    ]}
    footer={<box paddingLeft={2} paddingRight={2} gap={0}>
      <box flexDirection="row">
        <box paddingLeft={1} paddingRight={1}
          backgroundColor={remoteHovered() && !stopping() ? theme.primary : theme.backgroundElement}
          onMouseOver={() => setRemoteHovered(true)} onMouseOut={() => setRemoteHovered(false)}
          onMouseUp={() => { if (!stopping()) dialog.replace(() => <DialogRemote />) }}>
          <text fg={remoteHovered() && !stopping() ? theme.background : theme.primary}><span style={{ bold: true }}>Remote from phone →</span></text>
        </box>
      </box>
      {process.platform === "darwin" && process.arch === "arm64" && <text fg={theme.primary} onMouseUp={() => { if (!stopping()) void setupMac() }}>Set up / show background Mac →</text>}
      <text fg={theme.primary}>{sight()}</text>
      <text fg={theme.textMuted}>{compact() ? "Captures ask · text may also go to Assist" : "Window captures ask separately. Text goes to your model and Assist; images only to image models."}</text>
      <text fg={theme.textMuted}>{compact() ? "Allow always: this chat · private fields manual" : "Allow always applies to this chat until restart. Private fields stay manual."}</text>
      <text fg={theme.textMuted}>{compact() ? "■ Stop ends control · /computer to switch" : "Use ■ Stop beside Assist to end control · Control+Option+Esc stops Mac app control."}</text>
    </box>}
  />
}
