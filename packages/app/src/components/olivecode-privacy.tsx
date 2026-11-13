import { createResource, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Switch } from "@opencode-ai/ui/switch"
import { usePlatform } from "../context/platform"
import { useLanguage } from "../context/language"

export function OliveCodePrivacy() {
  const platform = usePlatform()
  const language = useLanguage()
  const [enabled, { mutate }] = createResource(async () => platform.usageMeasurement?.get() ?? false)
  const [state, setState] = createStore({ saving: false, error: "" })
  async function change(value: boolean) {
    if (state.saving || !platform.usageMeasurement) return
    setState({ saving: true, error: "" })
    try {
      mutate(await platform.usageMeasurement.set(value))
    } catch {
      setState("error", language.t("olivecode.privacy.failed"))
    } finally {
      setState("saving", false)
    }
  }
  return (
    <>
      <p class="olive-copy">{language.t("olivecode.privacy.description")}</p>
      <div class="olive-assistance-row">
        <span>
          <strong>{language.t("olivecode.privacy.usage")}</strong>
          <span>{language.t("olivecode.privacy.usage.description")}</span>
        </span>
        <Switch
          hideLabel
          checked={enabled.error ? false : (enabled() ?? false)}
          readOnly={state.saving}
          disabled={!platform.usageMeasurement || enabled.loading || !!enabled.error}
          onChange={(value) => void change(value)}
        >
          {language.t("olivecode.privacy.usage")}
        </Switch>
      </div>
      <p class="olive-copy olive-small">{language.t("olivecode.privacy.payload")}</p>
      <p class="olive-copy olive-small">{language.t("olivecode.privacy.separate")}</p>
      <Show when={!platform.usageMeasurement}>
        <p class="olive-copy">{language.t("olivecode.privacy.desktop")}</p>
      </Show>
      <Show when={state.error || enabled.error}>
        <p class="olive-error" role="alert">
          {state.error || language.t("olivecode.privacy.failed")}
        </p>
      </Show>
    </>
  )
}
