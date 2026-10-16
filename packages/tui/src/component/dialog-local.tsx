import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { useTheme } from "../context/theme"
import { useSDK } from "../context/sdk"
import { useSync } from "../context/sync"
import { useSelectModel } from "./model-select"
import { Spinner } from "./spinner"
import { useDialogRequest } from "./dialog-request"
import type { OnboardingOllamaResponse, OnboardingRecommendationResponse } from "@opencode-ai/sdk/v2"

type Recommendation = Extract<OnboardingRecommendationResponse, { profile: unknown }>

function OllamaMissing(props: { guidance: string }) {
  const dialog = useDialog()
  return (
    <DialogSelect
      title="Ollama is not installed"
      options={[
        {
          title: "Close",
          value: "close",
          description: props.guidance,
          async onSelect() {
            dialog.clear()
          },
        },
      ]}
    />
  )
}

function PullProgress(props: { model: string }) {
  const { finishLocal } = useLocalFlow()
  const dialog = useDialog()
  const sdk = useSDK()
  const toast = useToast()
  const { theme } = useTheme()
  const [line, setLine] = createSignal(`Pulling ${props.model}…`)

  onMount(() => {
    const abort = new AbortController()
    onCleanup(() => abort.abort())
    void (async () => {
      try {
        const result = await sdk.client.onboarding.pull(
          { model: props.model },
          {
            signal: abort.signal,
            sseMaxRetryAttempts: 0,
            onSseError(error) {
              throw error
            },
          },
        )
        for await (const frame of result.stream) {
          abort.signal.throwIfAborted()
          // The endpoint carries text progress plus a JSON terminal event.
          const message: unknown = frame
          if (typeof message === "string") {
            setLine(message)
            continue
          }
          if (message && typeof message === "object" && "done" in message && message.done === true) {
            await finishLocal(props.model)
            return
          }
          throw new Error(
            message && typeof message === "object" && "error" in message
              ? String(message.error)
              : "Invalid download response",
          )
        }
        abort.signal.throwIfAborted()
        throw new Error("Download stream ended before completion. Reopen Local to check the model.")
      } catch (e) {
        if (abort.signal.aborted) return
        toast.show({ message: `Pull failed: ${e}`, variant: "error" })
        dialog.clear()
      }
    })()
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <text fg={theme.text}>Pulling {props.model}</text>
      <text fg={theme.textMuted}>{line()}</text>
    </box>
  )
}

async function ensureOllamaProvider(
  sdk: ReturnType<typeof useSDK>,
  sync: ReturnType<typeof useSync>,
  modelID: string,
  signal: AbortSignal,
): Promise<boolean> {
  const inspected = await sdk.client.onboarding.localModel({ model: modelID }, { signal })
  if (inspected.error || !inspected.data) throw new Error(apiMessage(inspected.error, "Could not inspect local model"))
  const model = inspected.data
  const result = await sdk.client.global.config.update(
    {
      config: {
        provider: {
          ollama: {
            name: "Ollama",
            npm: "@ai-sdk/openai-compatible",
            api: model.baseURL,
            options: { baseURL: model.baseURL },
            models: {
              [modelID]: {
                name: modelID,
                status: "active",
                tool_call: model.tools,
                reasoning: model.reasoning,
                attachment: model.vision,
                modalities: { input: model.vision ? ["text", "image"] : ["text"], output: ["text"] },
                limit: {
                  context: Number(model.context),
                  output: Math.min(2048, Math.floor(Number(model.context) / 4)),
                },
                cost: { input: 0, output: 0 },
              },
            },
          },
        },
      },
    },
    { signal },
  )
  if (result.error) throw new Error(apiMessage(result.error, "Could not save local provider"))
  signal.throwIfAborted()
  await sdk.client.instance.dispose(undefined, { signal })
  signal.throwIfAborted()
  await sync.bootstrap({ fatal: false })
  return sync.data.provider.some((p) => p.id === "ollama" && p.models[modelID])
}

export function useLocalFlow() {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const toast = useToast()
  const select = useSelectModel()
  const request = useDialogRequest()

  async function finishLocal(localID: string) {
    try {
      if (!(await request((signal) => ensureOllamaProvider(sdk, sync, localID, signal)))) {
        throw new Error("Could not register the Ollama provider")
      }
      select("ollama", localID)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      toast.show({ message: `Could not select local model: ${error}`, variant: "error" })
    }
  }

  async function runLocalFlow(localID: string) {
    try {
      const st = await request((signal) => sdk.client.onboarding.ollama(undefined, { signal }))
      if (st.error || !st.data) throw new Error("Could not check Ollama. Make sure it is running and try again.")
      if (!st.data.installed) {
        dialog.replace(() => (
          <OllamaMissing guidance="Install Ollama from https://ollama.com/download, then reopen Local." />
        ))
        return
      }
      if (st.data.running === false) throw new Error(st.data.error || "Open Ollama, then retry Local.")
      if (!st.data.models.includes(localID)) {
        dialog.replace(() => <PullProgress model={localID} />)
        return
      }
      await finishLocal(localID)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      toast.show({ message: `Could not start download: ${error}`, variant: "error" })
    }
  }

  return { runLocalFlow, finishLocal }
}

function apiMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = error.data
    if (data && typeof data === "object" && "message" in data) return String(data.message)
  }
  return fallback
}

type Inventory = NonNullable<OnboardingOllamaResponse>
type Pick = NonNullable<Recommendation["primaryLocal"]>

export function DialogLocal() {
  const sdk = useSDK()
  const sync = useSync()
  const toast = useToast()
  const { theme } = useTheme()
  const { runLocalFlow, finishLocal } = useLocalFlow()
  const [rec, setRec] = createSignal<Recommendation | null>(null)
  const [inventory, setInventory] = createSignal<Inventory>()
  const [failed, setFailed] = createSignal(false)
  const [statusReady, setStatusReady] = createSignal(false)
  const [statusFailed, setStatusFailed] = createSignal(false)
  const [detecting, setDetecting] = createSignal(false)
  const [busy, setBusy] = createSignal<string>()
  const [page, setPage] = createSignal<"home" | "downloads" | "variants" | "delete">("home")
  const request = useDialogRequest()

  async function loadStatus() {
    setStatusFailed(false)
    try {
      const st = await request((signal) => sdk.client.onboarding.ollama(undefined, { signal }))
      if (st.error || !st.data) throw new Error("Could not check Ollama")
      setInventory(st.data)
      setStatusFailed(st.data.running === false)
    } catch {
      setStatusFailed(true)
    } finally {
      setStatusReady(true)
    }
  }

  async function loadRecommendation() {
    if (detecting()) return
    setDetecting(true)
    setFailed(false)
    try {
      const result = await request((signal) => sdk.client.onboarding.recommendation(undefined, { signal }))
      if (result.error || !result.data) throw new Error("Could not detect hardware")
      setRec(result.data as Recommendation)
    } catch {
      setFailed(true)
    } finally {
      setDetecting(false)
    }
  }

  onMount(() => {
    void loadStatus()
    void loadRecommendation()
  })

  async function remove(id: string) {
    if (busy()) return
    setBusy(id)
    try {
      const result = await request((signal) => sdk.client.onboarding.deleteModel({ model: id }, { signal }))
      if (result.error || !result.data) throw new Error(apiMessage(result.error, "Could not delete model"))
      await loadStatus()
      // Keep merged provider entries from exposing deleted downloads in other pickers.
      if (sync.data.provider.some((p) => p.id === "ollama" && p.models[id])) {
        const saved = await request((signal) =>
          sdk.client.global.config.update(
            {
              config: {
                provider: { ollama: { models: { [id]: { status: "deprecated" } } } },
              },
            },
            { signal },
          ),
        )
        if (saved.error) throw new Error("Model deleted. Restart OliveCode to refresh the model picker.")
        await request((signal) => sdk.client.instance.dispose(undefined, { signal }))
        await sync.bootstrap({ fatal: false })
      }
      toast.show({ message: `Deleted ${id}`, variant: "success" })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      toast.show({ message: String(error), variant: "error" })
    } finally {
      setBusy(undefined)
    }
  }

  function choose(pick: Pick) {
    if (busy()) return
    if (pick.compatible === false || pick.fit === "too-big") {
      toast.show({
        message:
          pick.compatible === false
            ? "This variant requires Apple Silicon."
            : "This model exceeds the estimated memory budget. Choose a smaller variant.",
        variant: "warning",
      })
      return
    }
    void runLocalFlow(pick.id)
  }

  const options = createMemo(() => {
    const data = rec()
    const models = inventory()?.models ?? []
    const downloads = inventory()?.details?.filter((model) => !model.cloud) ?? []
    const rows: {
      title: string
      value: string
      description?: string
      details?: string[]
      category: string
      onSelect: () => void
    }[] = []
    const addPick = (pick: Pick, category: string) =>
      rows.push({
        title: pick.name ?? pick.id,
        value: pick.id,
        description: models.includes(pick.id) ? "Installed" : `Download ${pick.downloadGb ?? "?"} GB`,
        details: [
          `${pick.variant ?? pick.id}`,
          `${pick.compatible === false ? "Apple Silicon only" : pick.fit} · ~${pick.needGb ?? "?"} GB memory`,
        ],
        category,
        onSelect: () => choose(pick),
      })
    if (page() !== "home")
      rows.push({
        title: "Back to local models",
        value: "back",
        category: "Navigation",
        onSelect: () => {
          if (!busy()) setPage("home")
        },
      })
    if (page() === "delete") {
      for (const model of downloads)
        rows.push({
          title: model.id,
          value: model.id,
          description: busy() === model.id ? "Deleting…" : `${model.sizeGb} GB on disk · select to delete`,
          category: "Installed in Ollama",
          onSelect: () => void remove(model.id),
        })
      return rows
    }
    if (page() === "variants") {
      for (const pick of data?.catalog ?? []) addPick(pick, "All verified variants")
      return rows
    }
    if (page() === "downloads") {
      if (data?.primaryLocal) addPick(data.primaryLocal, "Recommended for this computer")
      const demanding = [...(data?.catalog ?? [])]
        .filter(
          (pick) =>
            pick.compatible !== false &&
            pick.fit !== "too-big" &&
            pick.fit !== "unknown" &&
            pick.id !== data?.primaryLocal?.id &&
            Number(pick.needGb ?? 0) >= Number(data?.primaryLocal?.needGb ?? 0) * 1.4,
        )
        .sort((a, b) => Number(b.needGb ?? 0) - Number(a.needGb ?? 0))[0]
      if (demanding) addPick(demanding, "Larger model · demanding")
      for (const pick of data?.alternates ?? [])
        if (pick.kind === "local" && pick.id !== demanding?.id) addPick(pick, "Other fits")
      rows.push({
        title: "All model variants",
        value: "variants",
        description: "Includes workstation models and higher precision versions",
        category: "Explore",
        onSelect: () => setPage("variants"),
      })
      return rows
    }
    if (data?.primaryLocal && !models.includes(data.primaryLocal.id)) addPick(data.primaryLocal, "Recommended download")
    for (const id of models) {
      const detail = inventory()?.details?.find((item) => item.id === id)
      const pick = data?.catalog?.find((item) => item.id === id)
      const need =
        pick?.needGb ?? (detail ? Math.round(((Number(detail.sizeGb) * 1e9) / 2 ** 30 + 2) * 10) / 10 : undefined)
      const fit =
        pick?.fit ??
        (need && data?.profile.poolGb && Number(data.profile.poolGb) > 0
          ? Number(need) > Number(data.profile.poolGb)
            ? "too-big"
            : "estimated fit"
          : "fit unverified")
      rows.push({
        title: id,
        value: id,
        description: `${id === data?.primaryLocal?.id ? "Recommended · " : "Installed · "}${detail ? `${detail.sizeGb} GB · ` : ""}${need ? `~${need} GB memory · ` : ""}${fit}`,
        category: "Ready on this computer",
        onSelect: () => {
          if (!busy()) void finishLocal(id)
        },
      })
    }
    if (statusFailed())
      rows.push({
        title: "Retry local setup",
        value: "retry",
        description: inventory()?.error || "Open Ollama, then retry",
        category: "Setup",
        onSelect: () => void loadStatus(),
      })
    if (failed())
      rows.push({
        title: "Retry hardware detection",
        value: "hardware",
        category: "Setup",
        onSelect: () => void loadRecommendation(),
      })
    rows.push({
      title: "Download other models",
      value: "downloads",
      description:
        inventory()?.installed === false
          ? "Install Ollama from ollama.com/download first"
          : "Recommendations and model variants",
      category: "Manage",
      onSelect: () => setPage("downloads"),
    })
    rows.push({
      title: "Delete models",
      value: "delete",
      description: "Remove downloaded models from this computer",
      category: "Manage",
      onSelect: () => setPage("delete"),
    })
    return rows
  })

  // Keep the factory root stable; reset search when entering a different page.
  return (
    <box>
      <Show
        when={statusReady()}
        fallback={
          <box padding={2}>
            <Spinner>Checking local setup…</Spinner>
          </box>
        }
      >
        <Show when={page()} keyed>
          {(_page) => (
            <DialogSelect
              title={
                page() === "home"
                  ? "Local models"
                  : page() === "delete"
                    ? "Delete models"
                    : page() === "variants"
                      ? "Local · all variants"
                      : "Local · recommended downloads"
              }
              options={options()}
              preserveSelection
              detailIndent={6}
              showOverflowCue={page() === "home"}
              footer={
                <box paddingLeft={4} paddingRight={4} gap={1}>
                  <Show when={detecting()}>
                    <Spinner>Detecting hardware…</Spinner>
                  </Show>
                  <Show when={rec()}>
                    {(data) => (
                      <>
                        <text fg={theme.text} attributes={TextAttributes.BOLD}>
                          {data().profile.cpu ?? "Hardware unverified"} · {data().profile.ramGb ?? "?"} GB RAM ·{" "}
                          {data().profile.poolGb && Number(data().profile.poolGb) > 0 ? `~${data().profile.poolGb}` : "?"} GB
                          model budget
                        </text>
                        <text fg={theme.textMuted}>
                          Budget reserves RAM for your system; fit assumes short context. Reviewed{" "}
                          {data().reviewed ?? "unknown"}.
                        </text>
                      </>
                    )}
                  </Show>
                  <Show
                    when={page() === "delete"}
                    fallback={
                      <text fg={theme.textMuted}>
                        Local files stay in Ollama. New model families may need an Ollama update.
                      </text>
                    }
                  >
                    <text fg={theme.textMuted}>
                      {inventory()?.details?.some((model) => !model.cloud)
                        ? "Select a download to delete it immediately. Shared by all apps using Ollama."
                        : "No downloaded models to delete. Cloud shortcuts use no model storage."}
                    </text>
                  </Show>
                </box>
              }
            />
          )}
        </Show>
      </Show>
    </box>
  )
}
