import { createResource, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { Switch } from "@opencode-ai/ui/switch"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useServerSDK } from "../context/server-sdk"
import { useLanguage } from "../context/language"
import { useTabs } from "../context/tabs"
import { ServerConnection } from "../context/server"
import { showToast } from "../utils/toast"
import { useGlobal } from "../context/global"

export function DialogOliveCodeTools(props: { directory?: string; server?: ServerConnection.Any }) {
  const language = useLanguage()
  const fallback = useServerSDK()
  const global = useGlobal()
  const sdk = () => (props.server ? global.ensureServerCtx(props.server).sdk : fallback())
  const tabs = useTabs()
  const dialog = useDialog()
  const [state, setState] = createStore({ tab: "assistance", saving: "", error: "" })
  const [config, { refetch }] = createResource(async () => {
    if ((await sdk().protocol) !== "v1") return
    return (await sdk().client.config.get({ directory: props.directory })).data
  })
  const [skills] = createResource(
    () => state.tab === "skills",
    async (load) => {
      if (!load || (await sdk().protocol) !== "v1") return []
      return (await sdk().client.app.skills({ directory: props.directory })).data ?? []
    },
  )
  async function toggle(key: "teamwork" | "followThrough") {
    if (state.saving || !props.directory) return
    setState({ saving: key, error: "" })
    try {
      const result = await sdk().client.config.update({
        directory: props.directory,
        config: { collaboration: { [key]: !(config()?.collaboration?.[key] ?? true) } },
      })
      if (result.error || !result.data) throw new Error("config.update failed")
      await refetch()
      showToast({ title: language.t("olivecode.tools.saved"), variant: "success" })
    } catch {
      setState("error", language.t("olivecode.tools.saveError"))
    } finally {
      setState("saving", "")
    }
  }
  return (
    <Dialog title={language.t("olivecode.tools.title")} class="olive-tools-dialog">
      <div class="olive-tools-body">
        <div class="olive-tools-tabs" role="group" aria-label={language.t("olivecode.tools.title")}>
          <button aria-pressed={state.tab === "assistance"} onClick={() => setState("tab", "assistance")}>
            {language.t("olivecode.tools.assistance")}
          </button>
          <button aria-pressed={state.tab === "skills"} onClick={() => setState("tab", "skills")}>
            {language.t("olivecode.tools.skills")}
          </button>
        </div>
        <Show when={props.directory} fallback={<p class="olive-copy">{language.t("olivecode.tools.chooseProject")}</p>}>
          <p class="olive-tools-project" title={props.directory}>
            {props.directory}
          </p>
        </Show>
        <Show when={state.tab === "assistance"}>
          <p class="olive-copy">{language.t("olivecode.tools.description")}</p>
          <Show
            when={!config.loading}
            fallback={
              <p class="olive-copy" role="status">
                {language.t("common.loading")}
              </p>
            }
          >
            <For each={["teamwork", "followThrough"] as const}>
              {(key) => (
                <div class="olive-assistance-row">
                  <span>
                    <strong>
                      {language.t(key === "teamwork" ? "olivecode.tools.teamwork" : "olivecode.tools.followThrough")}
                    </strong>
                    <span>
                      {language.t(
                        key === "teamwork"
                          ? "olivecode.tools.teamwork.description"
                          : "olivecode.tools.followThrough.description",
                      )}
                    </span>
                  </span>
                  <Switch
                    hideLabel
                    checked={config()?.collaboration?.[key] ?? true}
                    disabled={!props.directory || !!state.saving || !!config.error || !config()}
                    onChange={() => void toggle(key)}
                  >
                    {language.t(key === "teamwork" ? "olivecode.tools.teamwork" : "olivecode.tools.followThrough")}
                  </Switch>
                </div>
              )}
            </For>
          </Show>
          <p class="olive-copy olive-small">{language.t("olivecode.tools.disclosure")}</p>
          <Show when={config.error}>
            <p role="alert" class="olive-error">
              {language.t("olivecode.tools.loadError")}
            </p>
          </Show>
        </Show>
        <Show when={state.tab === "skills"}>
          <p class="olive-copy">{language.t("olivecode.tools.skills.description")}</p>
          <Show
            when={!skills.loading}
            fallback={
              <p class="olive-copy" role="status">
                {language.t("common.loading")}
              </p>
            }
          >
            <For
              each={skills()}
              fallback={
                <p class="olive-copy">
                  {language.t(skills.error ? "olivecode.tools.loadError" : "olivecode.tools.noSkills")}
                </p>
              }
            >
              {(skill) => (
                <div class="olive-skill-row">
                  <details class="olive-skill-info">
                    <summary>
                      <strong>{skill.name}</strong>
                    </summary>
                    <p>{skill.description}</p>
                  </details>
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={!props.directory}
                    onClick={() => {
                      if (!props.directory) return
                      void tabs.newDraft(
                        { server: ServerConnection.key(sdk().server), directory: props.directory },
                        language.t("olivecode.tools.skillPrompt", { skill: skill.name }),
                      )
                      dialog.close()
                    }}
                  >
                    {language.t("olivecode.tools.useSkill")}
                  </Button>
                </div>
              )}
            </For>
          </Show>
        </Show>
        <Show when={state.error}>
          <p role="alert" class="olive-error">
            {state.error}
          </p>
        </Show>
      </div>
    </Dialog>
  )
}
