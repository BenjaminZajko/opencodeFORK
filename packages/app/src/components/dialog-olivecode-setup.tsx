import { createResource, For, Match, onCleanup, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "../context/language"
import { usePlatform } from "../context/platform"
import { ServerSDKProvider, useServerSDK } from "../context/server-sdk"
import { ServerSyncProvider, useServerSync } from "../context/server-sync"
import { showToast } from "../utils/toast"
import { DialogConnectProvider } from "./dialog-connect-provider"
import { localModelConfig, localModelName } from "./olivecode-models"
import { useGlobal } from "../context/global"
import type { ServerConnection } from "../context/server"

export function DialogOliveCodeSetup(props: { server?: ServerConnection.Any } = {}) {
  const language = useLanguage()
  const dialog = useDialog()
  const platform = usePlatform()
  const fallbackSDK = useServerSDK()
  const fallbackSync = useServerSync()
  const global = useGlobal()
  const sdk = () => (props.server ? global.ensureServerCtx(props.server).sdk : fallbackSDK())
  const sync = () => (props.server ? global.ensureServerCtx(props.server).sync : fallbackSync())
  const abort = new AbortController()
  onCleanup(() => abort.abort())
  const [state, setState] = createStore({
    page: "choice" as "choice" | "local",
    busy: "",
    error: "",
    progress: "",
    removing: "",
    name: "",
    checked: false,
    running: false,
    models: [] as { id: string; sizeGb: number; parameters?: string; quantization?: string; cloud: boolean }[],
  })

  const [recommendation] = createResource(
    () => state.page === "local",
    async (load) => {
      if (!load || (await sdk().protocol) !== "v1") return
      const result = await sdk().client.onboarding.recommendation(undefined, { signal: abort.signal })
      if (!result.data) throw new Error(language.t("olivecode.local.recommendation.error"))
      return result.data
    },
  )

  async function remove(model: string) {
    if (state.busy) return
    if (sync().data.config.model === `ollama/${model}`) {
      setState("error", language.t("olivecode.local.remove.active"))
      return
    }
    setState({ busy: "remove", error: "" })
    try {
      const result = await sdk().client.onboarding.deleteModel({ model }, { signal: abort.signal })
      if (result.error || result.data !== true) throw new Error(language.t("olivecode.local.remove.failed"))
      setState("removing", "")
      await inventory()
    } catch {
      if (!abort.signal.aborted) setState("error", language.t("olivecode.local.remove.failed"))
    } finally {
      if (!abort.signal.aborted) setState("busy", "")
    }
  }

  async function freeCloud() {
    if (state.busy) return
    setState({ busy: "cloud", error: "" })
    try {
      if ((await sdk().protocol) !== "v1") throw new Error(language.t("olivecode.local.unavailable"))
      const connected = sync().data.provider.connected
      const result = await sdk().client.onboarding.default({ connected }, { signal: abort.signal })
      if (!result.data) throw new Error(language.t("olivecode.cloud.none"))
      await sync().updateConfig({ model: `${result.data.providerID}/${result.data.modelID}` })
      if (abort.signal.aborted) return
      showToast({ variant: "success", title: language.t("olivecode.cloud.ready", { model: result.data.modelID }) })
      dialog.close()
    } catch (error) {
      if (!abort.signal.aborted) setState("error", error instanceof Error ? error.message : String(error))
    } finally {
      if (!abort.signal.aborted) setState("busy", "")
    }
  }

  async function inventory() {
    setState({ busy: "inventory", error: "" })
    try {
      if ((await sdk().protocol) !== "v1") throw new Error(language.t("olivecode.local.unavailable"))
      const result = await sdk().client.onboarding.ollama(undefined, { signal: abort.signal })
      if (!result.data) throw new Error(language.t("common.requestFailed"))
      setState({
        checked: true,
        running: result.data.running,
        models: result.data.details.filter((m) => !m.cloud).map((m) => ({ ...m, sizeGb: Number(m.sizeGb) })),
      })
    } catch (error) {
      if (!abort.signal.aborted) setState("error", error instanceof Error ? error.message : String(error))
    } finally {
      if (!abort.signal.aborted) setState("busy", "")
    }
  }

  async function select(model: string) {
    setState({ busy: model, error: "" })
    try {
      const result = await sdk().client.onboarding.localModel({ model }, { signal: abort.signal })
      if (!result.data) throw new Error(language.t("common.requestFailed"))
      if (!result.data.tools) throw new Error(language.t("olivecode.local.noTools"))
      await sync().updateConfig(
        localModelConfig(
          { ...result.data, context: Number(result.data.context) },
          sync().data.config.disabled_providers,
        ),
      )
      if (abort.signal.aborted) return
      showToast({
        variant: "success",
        title: language.t("olivecode.local.ready", { model }),
        description: language.t("olivecode.local.ready.description"),
      })
      dialog.close()
    } catch (error) {
      if (!abort.signal.aborted) setState("error", error instanceof Error ? error.message : String(error))
    } finally {
      if (!abort.signal.aborted) setState("busy", "")
    }
  }

  async function download(event: SubmitEvent) {
    event.preventDefault()
    if (state.busy) return
    const model = state.name.trim()
    if (!localModelName(model)) {
      setState("error", language.t("olivecode.local.invalid"))
      return
    }
    setState({ busy: "download", error: "", progress: language.t("olivecode.local.downloading", { model }) })
    try {
      const result = await sdk().client.onboarding.pull(
        { model },
        {
          signal: abort.signal,
          sseMaxRetryAttempts: 0,
          onSseError: (error) => {
            throw error
          },
        },
      )
      for await (const frame of result.stream) {
        abort.signal.throwIfAborted()
        const message: unknown = frame
        if (typeof message === "string") {
          // Strip CLI terminal control sequences from progress before displaying it.
          setState("progress", message.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, ""))
          continue
        }
        if (message && typeof message === "object" && "done" in message && message.done === true) {
          await inventory()
          return
        }
        throw new Error(language.t("olivecode.local.failed"))
      }
      throw new Error(language.t("olivecode.local.failed"))
    } catch (error) {
      if (!abort.signal.aborted) setState("error", error instanceof Error ? error.message : String(error))
    } finally {
      if (!abort.signal.aborted) setState({ busy: "", progress: "" })
    }
  }

  return (
    <Dialog
      title={language.t(state.page === "choice" ? "olivecode.setup.title" : "olivecode.local.title")}
      class="olive-setup"
    >
      <div class="olive-setup-body">
        <Switch>
          <Match when={state.page === "choice"}>
            <p class="olive-copy">{language.t("olivecode.setup.description")}</p>
            <div class="olive-choices">
              <button
                class="olive-choice"
                onClick={() => {
                  setState("page", "local")
                  void inventory()
                }}
              >
                <Icon name="console" size="large" />
                <strong>{language.t("olivecode.setup.local")}</strong>
                <span>{language.t("olivecode.setup.local.description")}</span>
              </button>
              <button
                class="olive-choice"
                onClick={() =>
                  dialog.show(() => (
                    <Show when={props.server} keyed fallback={<DialogConnectProvider />}>
                      {(server) => (
                        <ServerSDKProvider server={() => server}>
                          <ServerSyncProvider server={() => server}>
                            <DialogConnectProvider />
                          </ServerSyncProvider>
                        </ServerSDKProvider>
                      )}
                    </Show>
                  ))
                }
              >
                <Icon name="providers" size="large" />
                <strong>{language.t("olivecode.setup.cloud")}</strong>
                <span>{language.t("olivecode.setup.cloud.description")}</span>
              </button>
            </div>
            <div class="olive-cloud-quickstart">
              <Button variant="secondary" disabled={!!state.busy} onClick={() => void freeCloud()}>
                {language.t("olivecode.cloud.chooseFree")}
              </Button>
              <p class="olive-copy olive-small">{language.t("olivecode.cloud.freeDescription")}</p>
            </div>
            <p class="olive-copy olive-small">{language.t("olivecode.local.custom")}</p>
            <Button variant="ghost" onClick={() => dialog.close()}>
              {language.t("olivecode.setup.skip")}
            </Button>
          </Match>
          <Match when={state.page === "local"}>
            <div class="olive-model-heading">
              <p class="olive-copy">{language.t("olivecode.local.description")}</p>
              <Button variant="ghost" size="small" disabled={!!state.busy} onClick={() => void inventory()}>
                {language.t("olivecode.local.refresh")}
              </Button>
            </div>
            <Show when={!recommendation.error && recommendation()?.primaryLocal} keyed>
              {(pick) => (
                <section class="olive-hardware" aria-label={language.t("olivecode.local.recommendation")}>
                  <span class="olive-eyebrow">{language.t("olivecode.local.recommendation")}</span>
                  <strong>{pick.name ?? pick.id}</strong>
                  <p class="olive-copy">{language.t("olivecode.local.recommendation.description")}</p>
                  <p class="olive-copy olive-small">
                    {[
                      recommendation()?.profile.cpu,
                      recommendation()?.profile.ramGb ? `${recommendation()?.profile.ramGb} GB RAM` : undefined,
                      pick.downloadGb ? `${pick.downloadGb} GB` : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={!!state.busy}
                    onClick={() => setState("name", pick.id)}
                  >
                    {language.t("olivecode.local.recommendation.use")}
                  </Button>
                </section>
              )}
            </Show>
            <Show when={recommendation.error}>
              <p class="olive-copy" role="status">
                {language.t("olivecode.local.recommendation.error")}
              </p>
            </Show>
            <Show when={state.checked && !state.running}>
              <div class="olive-notice">
                <p>{language.t("olivecode.local.missing")}</p>
                <Button variant="secondary" onClick={() => platform.openExternal("https://ollama.com/download")}>
                  {language.t("olivecode.local.install")}
                </Button>
              </div>
            </Show>
            <Show when={state.checked && state.running && state.models.length === 0}>
              <p class="olive-copy">{language.t("olivecode.local.empty")}</p>
            </Show>
            <div class="olive-model-list">
              <For each={state.models}>
                {(model) => (
                  <div class="olive-model-row">
                    <div>
                      <strong>{model.id}</strong>
                      <span>
                        {[model.parameters, model.quantization, `${model.sizeGb} GB`].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    <div class="olive-model-actions">
                      <Button
                        size="small"
                        variant="ghost"
                        disabled={!!state.busy}
                        onClick={() => setState("removing", model.id)}
                      >
                        {language.t("olivecode.local.remove")}
                      </Button>
                      <Button
                        size="small"
                        variant="secondary"
                        disabled={!!state.busy}
                        onClick={() => void select(model.id)}
                      >
                        {language.t(state.busy === model.id ? "olivecode.local.inspect" : "olivecode.local.use")}
                      </Button>
                    </div>
                  </div>
                )}
              </For>
            </div>
            <Show when={state.removing}>
              <div class="olive-notice" role="group" aria-label={language.t("olivecode.local.remove.confirmAction")}>
                <p>{language.t("olivecode.local.remove.confirm", { model: state.removing })}</p>
                <div class="olive-model-actions">
                  <Button variant="secondary" disabled={!!state.busy} onClick={() => void remove(state.removing)}>
                    {language.t("olivecode.local.remove.confirmAction")}
                  </Button>
                  <Button variant="ghost" disabled={!!state.busy} onClick={() => setState("removing", "")}>
                    {language.t("olivecode.local.remove.cancel")}
                  </Button>
                </div>
              </div>
            </Show>
            <form onSubmit={download} class="olive-download">
              <TextField
                label={language.t("olivecode.local.model")}
                placeholder={language.t("olivecode.local.placeholder")}
                value={state.name}
                onChange={(value) => setState("name", value)}
                disabled={!!state.busy}
              />
              <p class="olive-copy olive-small">{language.t("olivecode.local.downloadNotice")}</p>
              <Button type="submit" variant="primary" disabled={!!state.busy || !state.running || !state.name.trim()}>
                {language.t("olivecode.local.download")}
              </Button>
            </form>
            <Show when={state.progress}>
              <p class="olive-copy olive-progress" role="status">
                {state.progress}
              </p>
            </Show>
            <Button variant="ghost" disabled={!!state.busy} onClick={() => setState("page", "choice")}>
              {language.t("common.goBack")}
            </Button>
          </Match>
        </Switch>
        <Show when={state.busy === "inventory"}>
          <p class="olive-copy" role="status">
            {language.t("common.loading")}
          </p>
        </Show>
        <Show when={state.error}>
          <p class="olive-error" role="alert">
            {state.error}
          </p>
        </Show>
      </div>
    </Dialog>
  )
}
