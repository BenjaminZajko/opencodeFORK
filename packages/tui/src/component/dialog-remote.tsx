import { createSignal, onMount } from "solid-js"
import { useClipboard } from "../context/clipboard"
import { useSDK } from "../context/sdk"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"
import { useToast } from "../ui/toast"
import { useRemotePresence } from "../olivecode/remote"
import { launchRemoteTerminal, remoteArguments, terminalCommand } from "../olivecode/remote-launch"

export function DialogRemote() {
  const clipboard = useClipboard()
  const sdk = useSDK()
  const { theme } = useTheme()
  const dialog = useDialog()
  const toast = useToast()
  const presence = useRemotePresence()
  const [channel, setChannel] = createSignal<"telegram" | "whatsapp">("telegram")
  const [launching, setLaunching] = createSignal(false)
  onMount(() => dialog.setSize("large"))
  async function launch(action: "setup" | "start", mode?: string) {
    if (launching()) return
    setLaunching(true)
    try {
      await launchRemoteTerminal(remoteArguments(action, channel(), sdk.directory ?? process.cwd(), mode))
      toast.show({ message: "Remote terminal opened. Follow its highlighted steps.", variant: "success" })
    } catch (error) { toast.show({ message: error instanceof Error ? error.message : "Could not open Remote terminal.", variant: "error" }) }
    finally { setLaunching(false) }
  }
  async function copy(command: string) {
    try { if (!clipboard.write) throw new Error("Clipboard unavailable"); await clipboard.write(command); toast.show({ message: "Copied. Paste into a separate terminal.", variant: "info" }) }
    catch { toast.show({ message: `Could not copy. Run: ${command}`, variant: "error" }) }
  }
  const start = (mode: string) => launch("start", mode)
  function Connect() {
    if (channel() === "whatsapp") return <DialogSelect title="WhatsApp · advanced setup" renderFilter={false} locked={launching()}
      options={[
        { title: "Open WhatsApp setup", value: "setup", onSelect: () => void launch("setup") },
        { title: "Start WhatsApp Remote →", value: "start", onSelect: () => dialog.replace(ChooseMode) },
        { title: "Copy setup command", value: "copy", onSelect: () => void copy("olivecode remote setup --channel whatsapp") },
      ]} footer={<box>
        <text fg={theme.text}>Requires your Meta Business app and phone number.</text>
        <text fg={theme.textMuted}>Public HTTPS webhook → local listener · manual setup.</text>
        <text fg={theme.textMuted}>Check Meta eligibility and charges; not a QR login.</text>
      </box>} />
    return <DialogSelect title="Connect Telegram · once" renderFilter={false} locked={launching()}
      titleView={<box>
        <text fg={theme.primary}><span style={{ bold: true }}>Connect Telegram · once</span></text>
        <text fg={theme.text}><span style={{ bold: true }}>1  Open verified @BotFather</span></text>
        <text fg={theme.textMuted}>   In Telegram · send /newbot · copy the token.</text>
        <text fg={theme.text}><span style={{ bold: true }}>2  Run setup on this computer</span></text>
        <text fg={theme.textMuted}>   Hidden token prompt · never paste it in chat.</text>
      </box>}
      options={[
        { title: "Open setup terminal", value: "setup", onSelect: () => void launch("setup") },
        { title: "Copy setup command", value: "copy", onSelect: () => void copy("olivecode remote setup") },
        { title: "3  Start remote →", value: "start", onSelect: () => dialog.replace(ChooseMode) },
      ]}
      footer={<box>
        <text fg={theme.textMuted}>Choose a mode, then pair your phone.</text>
      </box>} />
  }
  function ChooseMode() {
    return <DialogSelect title="Start remote · choose a mode" renderFilter={false} locked={launching()} showOverflowCue
      options={[
        { title: "Coding · project files", value: "coding", onSelect: () => void start("coding") },
        ...(process.platform === "darwin" ? [{ title: "Mac apps + browser · visible control", value: "visible", onSelect: () => void start("visible") }] : []),
        { title: "Background browser · keep your cursor free", value: "browser", onSelect: () => void start("browser") },
        ...(process.platform === "darwin" ? [{ title: "Background Mac · isolated Mac required", value: "mac", onSelect: () => void start("mac") }] : []),
      ]}
      footer={<box>
        <text fg={theme.primary}><span style={{ bold: true }}>Select → Remote opens in its own terminal</span></text>
        <text fg={theme.textMuted}>Setup done? Choose what your phone can control.</text>
        <text fg={theme.textMuted}>Keep computer awake · Ctrl+C stops.</text>
      </box>} />
  }
  return <DialogSelect title="Remote from phone" renderFilter={false} locked={launching()}
    titleView={<box gap={1}>
      <text fg={theme.primary}><span style={{ bold: true }}>Remote from phone</span></text>
      <text fg={theme.text}>Tasks from your phone. Work on your computer.</text>
    </box>}
    options={[
      { title: "1. Connect Telegram (recommended)", value: "setup", description: "Once", onSelect: () => { setChannel("telegram"); dialog.replace(Connect) } },
      { title: "2  Start remote", value: "start", description: "Telegram · coding or apps", onSelect: () => { setChannel("telegram"); dialog.replace(ChooseMode) } },
      { title: "Connect WhatsApp", value: "whatsapp", description: "Advanced · Meta API", onSelect: () => { setChannel("whatsapp"); dialog.replace(Connect) } },
      { title: "Copy start command", value: "copy", description: "Manual fallback", onSelect: () => void copy(terminalCommand(remoteArguments("start", "telegram", sdk.directory ?? process.cwd()))) },
    ]}
    footer={<box>
      <text fg={theme.primary}>{presence()?.phase === "reconnecting" ? "Reconnecting to Telegram…" : presence()?.paired ? `Connected · ${presence()?.channel === "whatsapp" ? "WhatsApp" : "Telegram"} · paired private account` : presence() ? presence()?.channel === "whatsapp" ? "Local webhook ready · waiting for your phone" : "Waiting for your phone’s pairing code" : "Not connected · start remote to go online"}</text>
      <text fg={theme.textMuted}>Only your paired private account can control it.</text>
      <text fg={theme.textMuted}>Captures are off · tasks travel via Telegram.</text>
      <text fg={theme.textMuted}>Keep terminal open · Ctrl+C stops.</text>
    </box>} />
}
