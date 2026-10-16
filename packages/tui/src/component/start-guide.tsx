import { Show, createSignal } from "solid-js"
import { useTheme } from "../context/theme"
import { useKV } from "../context/kv"
import { useDialog } from "../ui/dialog"
import { DialogSetup, DialogCloudSetup } from "./dialog-setup"
import { DialogLocal } from "./dialog-local"

export function StartGuide(props: { compact?: boolean }) {
  const { theme } = useTheme()
  const kv = useKV()
  const dialog = useDialog()
  const [hover, setHover] = createSignal<string>()
  return (
    <Show when={kv.ready && !kv.get("olivecode_guide_dismissed", false)}>
      <box gap={props.compact ? 0 : 1} paddingTop={1} flexShrink={0}>
        <text fg={theme.primary} onMouseUp={() => dialog.replace(() => <DialogSetup />)}>
          <span style={{ bold: true }}>Start here</span>
          {"  /start"}
        </text>
        <text fg={theme.textMuted} flexShrink={0}>
          {props.compact
            ? "Cloud or local → choose a model → write a task"
            : "Connect your cloud account, choose a model, then describe your task."}
        </text>
        <Show when={!props.compact}>
          <box flexDirection="row" gap={2}>
            <text
              fg={hover() === "cloud" ? theme.text : theme.primary}
              onMouseOver={() => setHover("cloud")}
              onMouseOut={() => setHover(undefined)}
              onMouseUp={() => dialog.replace(() => <DialogCloudSetup />)}
            >
              Set up cloud
            </text>
            <text
              fg={hover() === "local" ? theme.text : theme.textMuted}
              onMouseOver={() => setHover("local")}
              onMouseOut={() => setHover(undefined)}
              onMouseUp={() => dialog.replace(() => <DialogLocal />)}
            >
              Use local
            </text>
            <text
              fg={hover() === "skip" ? theme.text : theme.textMuted}
              onMouseOver={() => setHover("skip")}
              onMouseOut={() => setHover(undefined)}
              onMouseUp={() => kv.set("olivecode_guide_dismissed", true)}
            >
              Skip guide
            </text>
          </box>
        </Show>
      </box>
    </Show>
  )
}
