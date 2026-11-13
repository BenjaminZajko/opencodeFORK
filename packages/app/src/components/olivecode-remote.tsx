import { Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { usePlatform } from "../context/platform"
import { useLanguage } from "../context/language"
import type { RemoteLaunch } from "../remote"

export function OliveCodeRemote(props: { directory?: string; local: boolean }) {
  const platform = usePlatform()
  const language = useLanguage()
  const [state, setState] = createStore({
    channel: "telegram" as RemoteLaunch["channel"],
    mode: "coding" as RemoteLaunch["mode"],
    busy: false,
    result: "",
  })
  async function launch(action: RemoteLaunch["action"]) {
    if (state.busy || !props.directory || !props.local || !platform.launchRemote) return
    setState({ busy: true, result: "" })
    try {
      const result = await platform.launchRemote({
        action,
        directory: props.directory,
        mode: state.mode,
        channel: state.channel,
      })
      setState(
        "result",
        language.t(
          result === "opened"
            ? "olivecode.remote.opened"
            : result === "missing-cli"
              ? "olivecode.remote.missing"
              : "olivecode.remote.failed",
        ),
      )
    } catch {
      setState("result", language.t("olivecode.remote.failed"))
    } finally {
      setState("busy", false)
    }
  }
  return (
    <div class="olive-remote">
      <p class="olive-copy">{language.t("olivecode.remote.description")}</p>
      <label class="olive-field">
        <span>{language.t("olivecode.remote.channel")}</span>
        <select
          value={state.channel}
          disabled={state.busy}
          onChange={(event) => setState("channel", event.currentTarget.value as RemoteLaunch["channel"])}
        >
          <option value="telegram">Telegram</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
      </label>
      <div class="olive-notice">
        <p>{language.t(state.channel === "telegram" ? "olivecode.remote.telegram" : "olivecode.remote.whatsapp")}</p>
      </div>
      <label class="olive-field">
        <span>{language.t("olivecode.remote.mode")}</span>
        <select
          value={state.mode}
          disabled={state.busy}
          onChange={(event) => setState("mode", event.currentTarget.value as RemoteLaunch["mode"])}
        >
          <option value="coding">{language.t("olivecode.remote.coding")}</option>
          <option value="browser">{language.t("olivecode.remote.browser")}</option>
          <Show when={platform.os === "macos"}>
            <option value="visible">{language.t("olivecode.remote.visible")}</option>
          </Show>
          <Show when={platform.os === "macos"}>
            <option value="mac">{language.t("olivecode.remote.mac")}</option>
          </Show>
        </select>
      </label>
      <div class="olive-remote-actions">
        <Button
          variant="secondary"
          disabled={state.busy || !props.directory || !props.local || !platform.launchRemote}
          onClick={() => void launch("setup")}
        >
          {language.t("olivecode.remote.setup")}
        </Button>
        <Button
          variant="primary"
          disabled={state.busy || !props.directory || !props.local || !platform.launchRemote}
          onClick={() => void launch("start")}
        >
          {language.t("olivecode.remote.start")}
        </Button>
        <Button
          variant="ghost"
          disabled={state.busy || !props.directory || !props.local || !platform.launchRemote}
          onClick={() => void launch("status")}
        >
          {language.t("olivecode.remote.status")}
        </Button>
      </div>
      <p class="olive-copy olive-small">{language.t("olivecode.remote.disclosure")}</p>
      <Show when={!props.local || !platform.launchRemote}>
        <p class="olive-copy">{language.t("olivecode.remote.local")}</p>
      </Show>
      <Show when={state.result}>
        <p class="olive-copy" role="status">
          {state.result}
        </p>
      </Show>
    </div>
  )
}
