import { createMemo } from "solid-js"
import { useKV } from "../context/kv"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"
import { DialogConfirm } from "../ui/dialog-confirm"
import { measurementEndpoint } from "../olivecode/measurement-config"

export function DialogPrivacy() {
  const kv = useKV()
  const dialog = useDialog()
  const { theme } = useTheme()
  async function toggle(key: string, title: string, detail: string) {
    if (kv.get(key, false)) {
      kv.set(key, false)
      dialog.replace(() => <DialogPrivacy />)
      return
    }
    if (await DialogConfirm.show(dialog, title, detail)) kv.set(key, true)
    dialog.replace(() => <DialogPrivacy />)
  }
  const options = createMemo(() => [
    {
      title: `Usage measurement: ${kv.get("olivecode_usage_metrics", false) ? "On" : "Off"}`,
      value: "usage",
      description: "Optional · first launches and daily active installations",
      onSelect: () =>
        void toggle(
          "olivecode_usage_metrics",
          "Share basic usage counts?",
          "Send your app version, operating system, UTC day and a token that changes daily to OliveCode. The first report marks your first measured launch. No prompts, files, provider keys or account details are sent. The server sees a connection address. You can turn this off here any time.",
        ),
    },
    {
      title: `Sponsor measurement: ${kv.get("olivecode_sponsor_metrics", false) ? "On" : "Off"}`,
      value: "sponsor",
      description: "Optional · reported sponsor views and clicks",
      onSelect: () =>
        void toggle(
          "olivecode_sponsor_metrics",
          "Share sponsor counts?",
          "Send a temporary receipt and view/click acknowledgements to OliveCode when a sponsor is fully shown. No prompts, files, account details or installation identifier are sent. The server sees a connection address. Opening sponsor links still works when this is off.",
        ),
    },
  ])
  return (
    <DialogSelect
      title="Privacy and measurement"
      options={options()}
      footer={
        <box paddingLeft={4} paddingRight={4} paddingBottom={1}>
          <text fg={theme.textMuted}>Both choices are off by default. Change them with /privacy.</text>
          <text fg={theme.textMuted}>
            {measurementEndpoint
              ? "Reports go to OliveCode. No project content is collected."
              : "Reporting is not connected in this build. No events are sent."}
          </text>
        </box>
      }
    />
  )
}
