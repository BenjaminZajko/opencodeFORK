import { createMemo } from "solid-js"
import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"
import { useTheme } from "../context/theme"
import { useKV } from "../context/kv"
import { useSync } from "../context/sync"
import { DialogLocal } from "./dialog-local"
import { DialogCloud } from "./dialog-cloud"
import { DialogProvider, createDialogProviderOptions } from "./dialog-provider"

export function DialogSetup() {
  const dialog = useDialog()
  const kv = useKV()
  const { theme } = useTheme()
  return (
    <box>
      <DialogSelect
        title="Start with OliveCode"
        options={[
          {
            title: "Set up cloud",
            value: "cloud",
            description: "Recommended · connect your own account",
            onSelect: () => dialog.replace(() => <DialogCloudSetup />),
          },
          {
            title: "Use local models",
            value: "local",
            description: "Run with Ollama on this computer",
            onSelect: () => dialog.replace(() => <DialogLocal />),
          },
          {
            title: "Skip guide",
            value: "skip",
            description: "You can return any time with /start",
            onSelect: () => {
              kv.set("olivecode_guide_dismissed", true)
              dialog.clear()
            },
          },
        ]}
        footer={
          <box paddingLeft={4} paddingRight={4}>
            <text fg={theme.textMuted}>Choose a model, then describe what you want to build or fix.</text>
            <text fg={theme.textMuted}>Open OliveCode in your project folder to work on its files.</text>
          </box>
        }
      />
    </box>
  )
}

export function DialogCloudSetup() {
  const dialog = useDialog()
  const sync = useSync()
  const { theme } = useTheme()
  const providers = createDialogProviderOptions(() => dialog.replace(() => <DialogCloud />))
  const options = createMemo(() => [
    ...(sync.data.provider_next.connected.some((id) => id !== "ollama")
      ? [
          {
            title: "Choose a connected model",
            value: "models",
            description: "Continue with an existing account",
            onSelect: () => dialog.replace(() => <DialogCloud />),
          },
        ]
      : []),
    ...["openrouter", "groq", "mistral"].flatMap((id) => {
      const provider = providers().find((item) => item.value === id)
      if (!provider) return []
      return [
        {
          ...provider,
          category: "Your cloud accounts",
          description: {
            openrouter: "Free variants · no paid model routing",
            groq: "Additional capacity · select the Free plan",
            mistral: "Additional capacity · select Free mode",
            nvidia: "Hosted models · check your account limits",
          }[id],
        },
      ]
    }),

  ])
  return (
    <box>
      <DialogSelect
        title="Connect your cloud account"
        options={options()}
        footer={
          <box paddingLeft={4} paddingRight={4}>
            <text fg={theme.textMuted}>Only free models are available. Provider usage limits apply.</text>
            <text fg={theme.textMuted}>Add another account later to expand available capacity.</text>
          </box>
        }
      />
    </box>
  )
}
