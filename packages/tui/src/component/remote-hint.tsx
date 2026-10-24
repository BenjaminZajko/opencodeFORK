import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useRemotePresence } from "../olivecode/remote"
import { DialogRemote } from "./dialog-remote"

export function RemoteHint(props: { compact?: boolean }) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const presence = useRemotePresence()
  const connected = () => presence()?.paired && presence()?.phase === "listening"
  return <text fg={theme.textMuted} onMouseUp={() => dialog.replace(() => <DialogRemote />)}>
    {connected() ? `Remote connected · ${presence()?.channel === "whatsapp" ? "WhatsApp" : "Telegram"}` : presence()?.channel === "whatsapp" ? "WhatsApp webhook ready · send a message" : props.compact ? "Connect from your phone" : "Keep coding from your phone · Connect Telegram"}
    <span style={{ fg: theme.primary }}>  /remote</span>
  </text>
}
