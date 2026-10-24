import { freeProvider } from "@opencode-ai/core/olivecode/models"
import { createMemo, createSignal, For, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useSync } from "../context/sync"
import { useLocal } from "../context/local"
import { useDialog } from "../ui/dialog"
import { DialogCloud } from "./dialog-cloud"
import { DialogLocal } from "./dialog-local"
import { DialogComputer } from "./dialog-computer"
import { useRoute } from "../context/route"
import { useSDK } from "../context/sdk"
import { useToast } from "../ui/toast"
import { DialogAssist } from "./dialog-assist"

export function ModelSourceControls() {
  const { theme } = useTheme()
  const sync = useSync()
  const local = useLocal()
  const dialog = useDialog()
  const route = useRoute()
  const sdk = useSDK()
  const toast = useToast()
  const [stopping, setStopping] = createSignal(false)
  async function stopComputer() {
    if (stopping()) return
    setStopping(true)
    try {
      if (route.data.type === "session") {
        const result = await sdk.client.session.abort({ sessionID: route.data.sessionID })
        if (result.error) throw new Error("Could not stop computer control")
      }
      const model = local.model.current()
      local.agent.set("build")
      if (model) local.model.set(model)
    } catch { toast.show({ message: "Could not stop. Press Esc twice or close OliveCode.", variant: "error" }) }
    finally { setStopping(false) }
  }
  const [hovered, setHovered] = createSignal<"cloud" | "local">()
  const active = () => {
    const model = local.model.current()
    if (!model) return
    return model.providerID === "ollama" ? "local" : "cloud"
  }
  const cloud = createMemo(() => sync.data.provider_next.connected.filter(freeProvider).length)
  const installed = createMemo(
    () => Object.keys(sync.data.provider.find((p) => p.id === "ollama")?.models ?? {}).length,
  )
  return (
    <box flexDirection="row" gap={1} flexShrink={0}>
      <box flexShrink={0} backgroundColor={theme.backgroundElement} paddingLeft={1} paddingRight={1}
        onMouseUp={() => ["computer", "computer_background", "computer_background_mac", "desktop"].includes(local.agent.current()?.name ?? "") ? void stopComputer() : dialog.replace(() => <DialogComputer />)}>
        <text fg={["computer", "computer_background", "computer_background_mac", "desktop"].includes(local.agent.current()?.name ?? "") ? theme.warning : theme.textMuted}>
          {["computer", "computer_background", "computer_background_mac", "desktop"].includes(local.agent.current()?.name ?? "") ? (stopping() ? "Stopping…" : "■ Stop") : "Computer ▾"}
        </text>
      </box>
      <box flexShrink={0} backgroundColor={theme.backgroundElement} paddingLeft={1} paddingRight={1}
        onMouseUp={() => dialog.replace(() => <DialogAssist />)}>
        <text fg={(sync.data.config.collaboration?.teamwork ?? true) || (sync.data.config.collaboration?.followThrough ?? true) ? theme.primary : theme.textMuted}>
          Assist ▾
        </text>
      </box>
      <Show when={hovered()}>
        <box
          position="absolute"
          bottom={2}
          right={0}
          width={34}
          backgroundColor={theme.backgroundMenu}
          paddingLeft={1}
          paddingRight={1}
        >
          <text fg={theme.text}>
            {hovered() === "cloud"
              ? `Cloud · ${cloud()} connected accounts`
              : `Local · ${installed()} configured models`}
          </text>
          <text fg={theme.textMuted}>
            {hovered() === "cloud" ? "/cloud · models and availability" : "/local · models and downloads"}
          </text>
        </box>
      </Show>
      <For each={["cloud", "local"] as const}>
        {(source) => (
          <box
            flexShrink={0}
            onMouseOver={() => setHovered(source)}
            onMouseOut={() => setHovered(undefined)}
            onMouseUp={() => {
              setHovered(undefined)
              dialog.replace(() => (source === "cloud" ? <DialogCloud /> : <DialogLocal />))
            }}
            backgroundColor={hovered() === source ? theme.borderSubtle : theme.backgroundElement}
            paddingLeft={1}
            paddingRight={1}
          >
            <text fg={active() === source ? theme.primary : theme.text}>
              {active() === source ? "• " : ""}
              {source === "cloud" ? "Cloud ▾" : "Local ▾"}
            </text>
          </box>
        )}
      </For>
    </box>
  )
}
