import { freeProvider } from "@opencode-ai/core/olivecode/models"
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { useSync } from "../context/sync"
import { map, pipe, sortBy } from "remeda"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useSDK } from "../context/sdk"
import { DialogPrompt } from "../ui/dialog-prompt"
import { Link } from "../ui/link"
import { useTheme } from "../context/theme"
import { TextAttributes } from "@opentui/core"
import type { ProviderAuthAuthorization, ProviderAuthMethod } from "@opencode-ai/sdk/v2"
import { DialogModel } from "./dialog-model"
import { useToast } from "../ui/toast"
import { isConsoleManagedProvider } from "../util/provider-origin"
import { useConnected } from "./use-connected"
import { useBindings } from "../keymap"
import { useClipboard } from "../context/clipboard"
import { useDialogRequest } from "./dialog-request"
import open from "open"

const PROVIDER_PRIORITY: Record<string, number> = { openrouter: 0, groq: 1, mistral: 2 }

const CUSTOM_PROVIDER_OPTION_VALUE = "__opencode_custom_provider__"
const CUSTOM_PROVIDER_ID = /^[a-z0-9][a-z0-9-_]*$/

type ProviderOptionBase = {
  title: string
  value: string
  description?: string
  category: string
}

type ProviderOption =
  | (ProviderOptionBase & {
      type: "provider"
      providerID: string
    })
  | (ProviderOptionBase & {
      type: "custom"
    })

export function providerOptions(list: { id: string; name: string }[]): ProviderOption[] {
  return [
    ...pipe(
      list.filter((provider) => freeProvider(provider.id)),
      sortBy(
        (x) => PROVIDER_PRIORITY[x.id] ?? 99,
        (x) => x.name.toLowerCase(),
        (x) => x.id,
      ),
      map((provider) => ({
        type: "provider" as const,
        title: provider.name,
        value: provider.id,
        providerID: provider.id,
        description: { openrouter: "Free variants only", groq: "Use a Free account", mistral: "Use Free mode" }[provider.id],
        category: "Free providers",
      })),
    ),

  ]
}

export function normalizeCustomProviderID(value: string) {
  const providerID = value.trim().replace(/^@ai-sdk\//, "")
  if (!CUSTOM_PROVIDER_ID.test(providerID)) return
  return providerID
}

export function createDialogProviderOptions(onConnected?: (providerID: string) => void) {
  const sync = useSync()
  const dialog = useDialog()
  const sdk = useSDK()
  const toast = useToast()
  const { theme } = useTheme()
  const onboarded = useConnected()

  async function promptCustomProviderID(): Promise<string | undefined> {
    const value = await DialogPrompt.show(dialog, "Other", {
      placeholder: "Provider id",
      description: () => (
        <text fg={theme.textMuted}>
          This only stores a credential. Configure the provider in olivecode.json to use it.
        </text>
      ),
    })
    if (value === null) return

    const providerID = normalizeCustomProviderID(value)
    if (providerID) return providerID

    toast.show({
      variant: "error",
      message:
        "Provider ids must start with a lowercase letter or number and only use lowercase letters, numbers, hyphens, and underscores",
    })
    return promptCustomProviderID()
  }

  const options = createMemo(() => {
    return pipe(
      providerOptions(sync.data.provider_next.all),
      map((provider) => {
        if (provider.type === "custom") {
          return {
            title: provider.title,
            value: provider.value,
            description: provider.description,
            category: provider.category,
            async onSelect() {
              const providerID = await promptCustomProviderID()
              if (!providerID) return
              return dialog.replace(() => <ApiMethod providerID={providerID} title="API key" custom />)
            },
          }
        }

        const providerID = provider.providerID
        const consoleManaged = isConsoleManagedProvider(sync.data.console_state.consoleManagedProviders, providerID)
        const connected = sync.data.provider_next.connected.includes(providerID)

        return {
          title: provider.title,
          value: provider.value,
          description: provider.description,
          footer: consoleManaged ? sync.data.console_state.activeOrgName : undefined,
          category: provider.category,
          gutter: connected && onboarded() ? () => <text fg={theme.success}>✓</text> : undefined,
          async onSelect() {
            if (consoleManaged) return

            const methods = sync.data.provider_auth[providerID] ?? [
              {
                type: "api",
                label: "API key",
              },
            ]
            let index: number | null = 0
            if (methods.length > 1) {
              index = await new Promise<number | null>((resolve) => {
                dialog.replace(
                  () => (
                    <DialogSelect
                      title="Select auth method"
                      options={methods.map((x, index) => ({
                        title: x.label,
                        value: index,
                      }))}
                      onSelect={(option) => resolve(option.value)}
                    />
                  ),
                  () => resolve(null),
                )
              })
            }
            if (index == null) return
            const method = methods[index]
            if (method.type === "oauth") {
              let inputs: Record<string, string> | undefined
              if (method.prompts?.length) {
                const value = await PromptsMethod({
                  dialog,
                  prompts: method.prompts,
                })
                if (!value) return
                inputs = value
              }

              const result = await sdk.client.provider.oauth
                .authorize({
                  providerID,
                  method: index,
                  inputs,
                })
                .catch(() => undefined)
              if (!result) {
                toast.show({
                  variant: "error",
                  message: "Could not start browser sign-in. Try again or choose an API key.",
                })
                dialog.clear()
                return
              }
              if (result.error) {
                toast.show({
                  variant: "error",
                  message: JSON.stringify(result.error),
                })
                dialog.clear()
                return
              }
              if (result.data?.method === "code") {
                dialog.replace(() => (
                  <CodeMethod
                    providerID={providerID}
                    title={method.label}
                    index={index}
                    authorization={result.data!}
                    onConnected={onConnected}
                  />
                ))
              }
              if (result.data?.method === "auto") {
                dialog.replace(() => (
                  <AutoMethod
                    providerID={providerID}
                    title={method.label}
                    index={index}
                    authorization={result.data!}
                    onConnected={onConnected}
                  />
                ))
              }
            }
            if (method.type === "api") {
              let metadata: Record<string, string> | undefined
              if (method.prompts?.length) {
                const value = await PromptsMethod({ dialog, prompts: method.prompts })
                if (!value) return
                metadata = value
              }
              return dialog.replace(() => (
                <ApiMethod providerID={providerID} title={method.label} metadata={metadata} onConnected={onConnected} />
              ))
            }
          },
        }
      }),
    )
  })
  return options
}

export function DialogProvider() {
  const options = createDialogProviderOptions()
  return <DialogSelect title="Connect free providers" options={options()} />
}

interface AutoMethodProps {
  index: number
  providerID: string
  title: string
  authorization: ProviderAuthAuthorization
  onConnected?: (providerID: string) => void
}
export function AutoMethod(props: AutoMethodProps) {
  const { theme } = useTheme()
  const sdk = useSDK()
  const dialog = useDialog()
  const sync = useSync()
  const toast = useToast()
  const clipboard = useClipboard()
  const controller = new AbortController()
  onCleanup(() => controller.abort())

  useBindings(() => ({
    bindings: [
      {
        key: "o",
        desc: "Open sign-in page",
        group: "Dialog",
        cmd: () => {
          void open(props.authorization.url).catch(toast.error)
        },
      },
      {
        key: "c",
        desc: "Copy provider code",
        group: "Dialog",
        cmd: () => {
          const code =
            props.authorization.instructions.match(/[A-Z0-9]{4}-[A-Z0-9]{4,5}/)?.[0] ?? props.authorization.url
          clipboard
            .write?.(code)
            .then(() => toast.show({ message: "Copied to clipboard", variant: "info" }))
            .catch(toast.error)
        },
      },
    ],
  }))

  onMount(async () => {
    try {
      const result = await sdk.client.provider.oauth.callback(
        {
          providerID: props.providerID,
          method: props.index,
        },
        { signal: controller.signal },
      )
      if (controller.signal.aborted) return
      if (result.error) {
        toast.show({
          variant: "error",
          message:
            "name" in result.error && result.error.name === "ProviderAuthOauthCallbackFailed"
              ? "OAuth authorization failed. Try /connect again."
              : JSON.stringify(result.error),
        })
        dialog.clear()
        return
      }
      await sdk.client.instance.dispose(undefined, { signal: controller.signal })
      if (controller.signal.aborted) return
      await sync.bootstrap()
      if (controller.signal.aborted) return
      if (props.onConnected) {
        props.onConnected(props.providerID)
        return
      }
      dialog.replace(() => <DialogModel providerID={props.providerID} />)
    } catch {
      if (controller.signal.aborted) return
      toast.show({ variant: "error", message: "Could not finish sign-in. Try /start again." })
      dialog.clear()
    }
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <box gap={1}>
        <Link href={props.authorization.url} fg={theme.primary}>
          Open sign-in page
        </Link>
        <text fg={theme.textMuted}>{props.authorization.instructions}</text>
      </box>
      <text fg={theme.textMuted}>Waiting for authorization…</text>
      <text fg={theme.text}>
        o <span style={{ fg: theme.textMuted }}>open browser</span>
        {"  "}c <span style={{ fg: theme.textMuted }}>copy</span>
      </text>
    </box>
  )
}

interface CodeMethodProps {
  index: number
  title: string
  providerID: string
  authorization: ProviderAuthAuthorization
  onConnected?: (providerID: string) => void
}
export function CodeMethod(props: CodeMethodProps) {
  const { theme } = useTheme()
  const sdk = useSDK()
  const sync = useSync()
  const dialog = useDialog()
  const [error, setError] = createSignal(false)

  return (
    <DialogPrompt
      title={props.title}
      placeholder="Authorization code"
      onConfirm={async (value) => {
        const { error } = await sdk.client.provider.oauth.callback({
          providerID: props.providerID,
          method: props.index,
          code: value,
        })
        if (!error) {
          await sdk.client.instance.dispose()
          await sync.bootstrap()
          if (props.onConnected) {
            props.onConnected(props.providerID)
            return
          }
          dialog.replace(() => <DialogModel providerID={props.providerID} />)
          return
        }
        setError(true)
      }}
      description={() => (
        <box gap={1}>
          <text fg={theme.textMuted}>{props.authorization.instructions}</text>
          <Link href={props.authorization.url} fg={theme.primary} />
          <Show when={error()}>
            <text fg={theme.error}>Invalid code</text>
          </Show>
        </box>
      )}
    />
  )
}

interface ApiMethodProps {
  providerID: string
  title: string
  metadata?: Record<string, string>
  custom?: boolean
  onConnected?: (providerID: string) => void
}
function ApiMethod(props: ApiMethodProps) {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const toast = useToast()
  const { theme } = useTheme()
  const request = useDialogRequest()
  const [busy, setBusy] = createSignal(false)
  const [failed, setFailed] = createSignal(false)

  return (
    <DialogPrompt
      title={props.title}
      placeholder="API key"
      busy={busy()}
      busyText="Saving account…"
      description={() => (
        <box gap={1}>
          <Show when={failed()}>
            <text fg={theme.error}>Could not save this account. Check the connection and try again.</text>
          </Show>
          {{
            openrouter: (
              <box gap={1}>
                <text fg={theme.textMuted}>Create a key in your own OpenRouter account, then paste it here.</text>
                <Link href="https://openrouter.ai/settings/keys" fg={theme.primary} />
              </box>
            ),
            groq: (
              <box gap={1}>
                <text fg={theme.text}>
                  Go to <span style={{ fg: theme.primary }}>https://console.groq.com/keys</span> to get a key
                </text>
              </box>
            ),
            mistral: (
              <box gap={1}>
                <text fg={theme.text}>
                  Go to <span style={{ fg: theme.primary }}>https://console.mistral.ai</span> (API Keys) to get a key
                </text>
              </box>
            ),
          }[props.providerID] ?? undefined}
        </box>
      )}
      onConfirm={async (value) => {
        if (!value.trim() || busy()) return
        setBusy(true)
        setFailed(false)
        try {
          const saved = await request((signal) =>
            sdk.client.auth.set(
              {
                providerID: props.providerID,
                auth: {
                  type: "api",
                  key: value.trim(),
                  ...(props.metadata ? { metadata: props.metadata } : {}),
                },
              },
              { signal },
            ),
          )
          if (saved.error) throw new Error("Credential save failed")
          const refreshed = await request((signal) => sdk.client.instance.dispose(undefined, { signal }))
          if (refreshed.error) throw new Error("Provider refresh failed")
          await request(() => sync.bootstrap())
          if (props.custom && !sync.data.provider_next.all.some((provider) => provider.id === props.providerID)) {
            toast.show({
              variant: "info",
              message: `Saved credential for ${props.providerID}. Configure it in olivecode.json to use it.`,
            })
            dialog.clear()
            return
          }
          if (props.onConnected) {
            props.onConnected(props.providerID)
            return
          }
          dialog.replace(() => <DialogModel providerID={props.providerID} />)
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true)
        } finally {
          setBusy(false)
        }
      }}
    />
  )
}

interface PromptsMethodProps {
  dialog: ReturnType<typeof useDialog>
  prompts: NonNullable<ProviderAuthMethod["prompts"]>[number][]
}
export async function PromptsMethod(props: PromptsMethodProps) {
  const inputs: Record<string, string> = {}
  for (const prompt of props.prompts) {
    if (prompt.when) {
      const value = inputs[prompt.when.key]
      if (value === undefined) continue
      const matches = prompt.when.op === "eq" ? value === prompt.when.value : value !== prompt.when.value
      if (!matches) continue
    }

    if (prompt.type === "select") {
      const value = await new Promise<string | null>((resolve) => {
        props.dialog.replace(
          () => (
            <DialogSelect
              title={prompt.message}
              options={prompt.options.map((x) => ({
                title: x.label,
                value: x.value,
                description: x.hint,
              }))}
              onSelect={(option) => resolve(option.value)}
            />
          ),
          () => resolve(null),
        )
      })
      if (value === null) return null
      inputs[prompt.key] = value
      continue
    }

    const value = await new Promise<string | null>((resolve) => {
      props.dialog.replace(
        () => (
          <DialogPrompt title={prompt.message} placeholder={prompt.placeholder} onConfirm={(value) => resolve(value)} />
        ),
        () => resolve(null),
      )
    })
    if (value === null) return null
    inputs[prompt.key] = value
  }
  return inputs
}
