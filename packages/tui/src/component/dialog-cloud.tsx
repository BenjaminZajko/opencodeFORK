import { freeModel, freeProvider, modelPriority } from "@opencode-ai/core/olivecode/models"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useLocal } from "../context/local"
import { useSync } from "../context/sync"
import { useSDK } from "../context/sdk"
import { useTheme } from "../context/theme"
import { useDialogRequest } from "./dialog-request"
import { sortModelOptions } from "./dialog-model"
import { DialogProvider } from "./dialog-provider"
import { useSelectModel } from "./model-select"
import type { Provider, ProviderCooldown } from "@opencode-ai/sdk/v2"

// Minimal structural view of a provider for cloud listing. The real
// Provider objects satisfy this; the narrow shape keeps the pure builder
// below unit-testable without full SDK fixtures.
export interface CloudModelSource {
  id: string
  name: string
  models: Record<
    string,
    { name?: string; status?: string; cost?: { input?: number; output?: number }; release_date?: string; capabilities?: { input?: { image?: boolean } } }
  >
}

export interface CloudModelEntry {
  providerID: string
  providerName: string
  modelID: string
  title: string
  releaseDate: string
  footer?: string
  disabled: boolean
}

// The free-only cloud library. Local models have their own picker.
export function cloudModelEntries(
  providers: CloudModelSource[] | Provider[],
  connected: readonly string[],
  exclude?: { providerID: string; modelID: string },
) {
  const connectedSet = new Set(connected)
  const entries: CloudModelEntry[] = []
  for (const provider of providers) {
    if (!freeProvider(provider.id)) continue
    if (!connectedSet.has(provider.id)) continue
    for (const [modelID, info] of Object.entries(provider.models)) {
      if (!freeModel(provider.id, modelID, info)) continue
      if (exclude && provider.id === exclude.providerID && modelID === exclude.modelID) continue
      const free = provider.id === "openrouter"
      entries.push({
        providerID: provider.id,
        providerName: provider.name,
        modelID,
        title: info.name ?? modelID,
        releaseDate: info.release_date ?? "",
        footer: `${free ? "Free" : "Free tier"}${info.capabilities?.input?.image === true ? " · Images" : ""}`,
        disabled: false,
      })
    }
  }
  return sortModelOptions(entries, false).sort(
    (a, b) => modelPriority(a.providerID, a.modelID) - modelPriority(b.providerID, b.modelID),
  )
}

export function DialogCloud() {
  const dialog = useDialog()
  const local = useLocal()
  const sync = useSync()
  const sdk = useSDK()
  const select = useSelectModel()
  const request = useDialogRequest()
  const { theme } = useTheme()
  const [best, setBest] = createSignal<{ providerID: string; modelID: string }>()
  const [cooldowns, setCooldowns] = createSignal<ProviderCooldown[]>([])
  const [now, setNow] = createSignal(Date.now())
  const [page, setPage] = createSignal<"recommended" | "all" | "waiting">("recommended")
  const [failed, setFailed] = createSignal(false)
  let refreshing = false

  async function refresh() {
    if (refreshing) return
    refreshing = true
    try {
      const results = await Promise.allSettled([
        request((signal) => sdk.client.provider.cooldowns(undefined, { signal })).then((result) => {
          if (result.error || !result.data) throw new Error("Availability check failed")
          setCooldowns(result.data)
          setNow(Date.now())
        }),
        request((signal) =>
          sdk.client.onboarding.default({ connected: sync.data.provider_next.connected }, { signal }),
        ).then((result) => {
          if (result.error) {
            setBest(undefined)
            throw new Error("Recommendation check failed")
          }
          setBest(result.data)
        }),
      ])
      setFailed(results.some((result) => result.status === "rejected"))
    } catch {
      setFailed(true)
    } finally {
      refreshing = false
    }
  }

  onMount(() => {
    void refresh()
    const clock = setInterval(() => setNow(Date.now()), 1000)
    const poll = setInterval(() => void refresh(), 5000)
    onCleanup(() => {
      clearInterval(clock)
      clearInterval(poll)
    })
  })

  const waiting = createMemo(
    () =>
      cooldowns().filter(
        (item) =>
          item.downUntil > now() &&
          freeProvider(item.providerID) &&
          sync.data.provider_next.connected.includes(item.providerID),
      ),
    undefined,
    {
      equals: (previous, next) =>
        previous.length === next.length && previous.every((item, index) => item === next[index]),
    },
  )
  const unavailable = (providerID: string, modelID: string) =>
    cooldowns().some(
      (item) => item.providerID === providerID && item.modelID === modelID && item.downUntil > Date.now(),
    )
  const choose = (providerID: string, modelID: string) => {
    if (!unavailable(providerID, modelID)) select(providerID, modelID)
  }

  const options = createMemo(() => {
    const blocked = new Set(waiting().map((item) => `${item.providerID}/${item.modelID}`))
    const entries = cloudModelEntries(sync.data.provider, sync.data.provider_next.connected).filter(
      (entry) => !blocked.has(`${entry.providerID}/${entry.modelID}`),
    )
    const top =
      entries.find((entry) => entry.providerID === best()?.providerID && entry.modelID === best()?.modelID) ??
      entries[0]
    const second = top && entries.find((entry) => entry.providerID === top.providerID && entry !== top)
    const other = entries.filter(
      (entry, index) =>
        entry.providerID !== top?.providerID &&
        entries.findIndex((item) => item.providerID === entry.providerID) === index,
    )
    const featured = [top, second, ...other].filter((entry): entry is CloudModelEntry => Boolean(entry))
    const rows = page() === "waiting" ? [] : page() === "all" ? entries : featured
    return [
      ...(page() === "recommended"
        ? []
        : [{ title: "Back to recommendations", value: "back", onSelect: () => setPage("recommended") }]),
      ...rows.map((entry) => ({
        title:
          entry.providerID === "openrouter" && entry.modelID === "poolside/laguna-s-2.1:free"
            ? `${entry.title} · coding pick`
            : entry.title,
        value: { providerID: entry.providerID, modelID: entry.modelID },
        description:
          entry.providerID === "openrouter" && entry.modelID === "poolside/laguna-s-2.1:free"
            ? "70.2% Terminal-Bench 2.1 · free-tier prompts may train Poolside models"
            : `${entry.providerName}${page() !== "recommended" ? "" : entry === top ? " · recommended for coding" : entry === second ? " · another from this provider" : " · recommended from this provider"}`,
        category: page() === "all" ? entry.providerName : "Ready to use",
        footer: entry.footer,
        onSelect: () => choose(entry.providerID, entry.modelID),
      })),
      ...(page() !== "recommended"
        ? []
        : [
            {
              title: "All free models",
              value: "all",
              description: `${entries.length} available models`,
              category: "Explore",
              onSelect: () => setPage("all"),
            },
            {
              title: "Waiting for reset",
              value: "waiting",
              description: `${waiting().length} models · retry times`,
              category: "Explore",
              onSelect: () => setPage("waiting"),
            },
            {
              title: "Connect free providers",
              value: "connect",
              description: "Add or reconnect a free account",
              category: "Explore",
              onSelect: () => dialog.replace(() => <DialogProvider />),
            },
          ]),
    ]
  })

  return (
    <box>
      <Show when={page()} keyed>
        {(_page) => (
          <DialogSelect<unknown>
            title={
              page() === "recommended"
                ? "Cloud · recommended"
                : page() === "all"
                  ? "Cloud · all free models"
                  : "Cloud · waiting for reset"
            }
            options={options()}
            current={local.model.current()}
            preserveSelection
            footer={
              <box paddingLeft={4} paddingRight={4} gap={1}>
                <text fg={theme.textMuted}>Free models only. Provider usage limits still apply.</text>
                <Show when={failed()}>
                  <text fg={theme.textMuted}>Availability check failed. Retrying automatically.</text>
                </Show>
                <Show when={page() === "waiting"}>
                  <Show when={!waiting().length}>
                    <text fg={theme.textMuted}>No models are waiting. Your available models are ready.</text>
                  </Show>
                  <text fg={theme.text} attributes={TextAttributes.BOLD}>
                    Retry schedule
                  </text>
                  <scrollbox height={Math.min(waiting().length, 4)}>
                    <For each={waiting()}>
                      {(item) => (
                        <text fg={theme.textMuted}>
                          {sync.data.provider.find((p) => p.id === item.providerID)?.models[item.modelID]?.name ??
                            item.modelID}
                          {` · ${item.providerID} · retry in ${Math.max(1, Math.ceil((item.downUntil - now()) / 1000))}s`}
                        </text>
                      )}
                    </For>
                  </scrollbox>
                  <text fg={theme.textMuted}>Times are retry estimates; provider limits may last longer.</text>
                </Show>
              </box>
            }
          />
        )}
      </Show>
    </box>
  )
}
