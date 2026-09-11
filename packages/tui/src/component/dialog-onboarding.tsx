import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js"
import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"
import { useToast } from "../ui/toast"
import { useTheme } from "../context/theme"
import { useLocal } from "../context/local"
import { useSDK } from "../context/sdk"
import { useSync } from "../context/sync"
import { DialogModel } from "./dialog-model"
import { DialogVariant } from "./dialog-variant"
import { AutoMethod, CodeMethod, PromptsMethod } from "./dialog-provider"
import type {
  OnboardingOllamaResponse,
  OnboardingRecommendationResponse,
} from "@opencode-ai/sdk/v2"

type Recommendation = Extract<OnboardingRecommendationResponse, { profile: unknown }>

function useRankedModel(providerID: string, modelID: string) {
  const dialog = useDialog()
  const local = useLocal()
  return () => {
    local.model.set({ providerID, modelID }, { recent: true })
    if (local.model.variant.list().length > 0 && !local.model.variant.current()) {
      dialog.replace(() => <DialogVariant />)
      return
    }
    dialog.clear()
  }
}

function OnboardingConfirm(props: { providerID: string; modelID: string; connectedProviderID: string }) {
  const dialog = useDialog()
  const use = useRankedModel(props.providerID, props.modelID)
  return (
    <DialogSelect
      title={`Use ${props.providerID}/${props.modelID}?`}
      options={[
        {
          title: `Use ${props.modelID}`,
          value: "use",
          description: "Recommended pick, no browsing needed",
          async onSelect() {
            use()
          },
        },
        {
          title: "Browse all models",
          value: "browse",
          async onSelect() {
            dialog.replace(() => <DialogModel providerID={props.connectedProviderID} />)
          },
        },
      ]}
    />
  )
}

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

function PullProgress(props: { model: string; onDone: () => void }) {
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
        const headers: Record<string, string> = { "Content-Type": "application/json" }
        if (sdk.directory) headers["x-opencode-directory"] = encodeURIComponent(sdk.directory)
        const res = await sdk.fetch(`${sdk.url}/onboarding/pull`, {
          method: "POST",
          headers,
          body: JSON.stringify({ model: props.model }),
          signal: abort.signal,
        })
        const reader = res.body?.getReader()
        if (!reader) throw new Error("no response stream")
        const decoder = new TextDecoder()
        let buf = ""
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const frames = buf.split("\n\n")
          buf = frames.pop() ?? ""
          for (const frame of frames) {
            const m = frame.match(/^data: (.*)$/m)
            if (!m) continue
            const text = m[1].trim()
            if (!text) continue
            if (text.startsWith("{")) {
              const msg = JSON.parse(text) as { done?: boolean; error?: string }
              if (msg.done) {
                props.onDone()
                return
              }
              toast.show({ message: `Pull failed: ${msg.error ?? "unknown error"}`, variant: "error" })
              dialog.clear()
              return
            }
            setLine(text)
          }
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return
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
): Promise<boolean> {
  if (sync.data.provider.some((p) => p.id === "ollama" && p.models[modelID])) return true
  const result = await sdk.client.config.update({
    config: {
      provider: {
        ollama: {
          npm: "@ai-sdk/openai-compatible",
          api: "http://localhost:11434/v1",
          options: { baseURL: "http://localhost:11434/v1" },
          models: { [modelID]: {} },
        },
      },
    },
  })
  if (result.error) return false
  await sdk.client.instance.dispose()
  await sync.bootstrap()
  return sync.data.provider.some((p) => p.id === "ollama" && p.models[modelID])
}

export function DialogOnboarding() {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const toast = useToast()
  const [rec, setRec] = createSignal<Recommendation | null>(null)
  const [failed, setFailed] = createSignal(false)

  onMount(async () => {
    const result = await sdk.client.onboarding.recommendation()
    if (result.error || !result.data) {
      setFailed(true)
      return
    }
    setRec(result.data as Recommendation)
  })

  createEffect(() => {
    if (failed()) dialog.clear()
  })

  async function afterCloudConnect(providerID: string) {
    const connected = sync.data.provider_next.connected.includes(providerID)
      ? sync.data.provider_next.connected
      : [...sync.data.provider_next.connected, providerID]
    const def = await sdk.client.onboarding.default({ connected })
    if (def.error || !def.data) {
      dialog.replace(() => <DialogModel providerID={providerID} />)
      return
    }
    dialog.replace(() => (
      <OnboardingConfirm providerID={def.data.providerID} modelID={def.data.modelID} connectedProviderID={providerID} />
    ))
  }

  async function runCloudFlow() {
    const providerID = "openrouter"
    const methods = sync.data.provider_auth[providerID] ?? [{ type: "api", label: "API key" } as const]
    const index = methods.findIndex((m) => m.type === "oauth")
    if (index < 0) {
      dialog.replace(() => <DialogModel providerID={providerID} />)
      return
    }
    const method = methods[index]
    if (method.type !== "oauth") return
    let inputs: Record<string, string> | undefined
    if (method.prompts?.length) {
      const value = await PromptsMethod({ dialog, prompts: method.prompts })
      if (!value) return
      inputs = value
    }
    const result = await sdk.client.provider.oauth.authorize({ providerID, method: index, inputs })
    if (result.error) {
      toast.show({ variant: "error", message: JSON.stringify(result.error) })
      dialog.clear()
      return
    }
    const onConnected = (id: string) => {
      void afterCloudConnect(id)
    }
    if (result.data?.method === "code") {
      dialog.replace(() => (
        <CodeMethod providerID={providerID} title={method.label} index={index} authorization={result.data!} onConnected={onConnected} />
      ))
    }
    if (result.data?.method === "auto") {
      dialog.replace(() => (
        <AutoMethod providerID={providerID} title={method.label} index={index} authorization={result.data!} onConnected={onConnected} />
      ))
    }
  }

  async function finishLocal(localID: string) {
    const use = useRankedModel("ollama", localID)
    if (!(await ensureOllamaProvider(sdk, sync, localID))) {
      toast.show({ message: "Could not register the ollama provider", variant: "error" })
      dialog.clear()
      return
    }
    use()
  }

  async function runLocalFlow(localID: string) {
    const st = (await sdk.client.onboarding.ollama()) as {
      data?: OnboardingOllamaResponse
      error?: unknown
    }
    const installed = st.data && "installed" in st.data ? st.data.installed : false
    const models = st.data && "models" in st.data && Array.isArray(st.data.models) ? st.data.models : []
    if (st.error || !installed) {
      dialog.replace(() => <OllamaMissing guidance="Install Ollama, then reopen this dialog." />)
      return
    }
    if (!models.includes(localID)) {
      dialog.replace(() => <PullProgress model={localID} onDone={() => void finishLocal(localID)} />)
      return
    }
    await finishLocal(localID)
  }

  return (
    <Show
      when={rec()}
      fallback={
        <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
          <text>Detecting hardware…</text>
        </box>
      }
    >
      {(data) => {
        const rec = data()
        const leadCloud = rec.primary !== "local"
        const localID = rec.primaryLocal?.id
        const localRow = localID
          ? {
              title: `Local: ${localID}${!leadCloud ? " (recommended)" : ""}`,
              value: "local",
              description: `~${rec.primaryLocal?.needGb ?? "?"} GB · ${rec.primaryLocal?.fit}`,
              async onSelect() {
                await runLocalFlow(localID)
              },
            }
          : undefined
        const cloudRow = {
          title: `Cloud via OpenRouter${leadCloud ? " (recommended)" : ""}`,
          value: "cloud",
          description: "Free models · no hardware needed",
          async onSelect() {
            await runCloudFlow()
          },
        }
        const options = (leadCloud ? [cloudRow, localRow] : [localRow, cloudRow]).filter((o) => o !== undefined)
        return <DialogSelect title="Get started with opencode" options={options} />
      }}
    </Show>
  )
}
