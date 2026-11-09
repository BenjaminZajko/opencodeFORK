import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { OliveCodeStarters } from "../../components/olivecode-starters"
import { usePrompt } from "../../context/prompt"
import { useLocal } from "../../context/local"
import { useSettings } from "../../context/settings"
import { Show, createMemo, createSignal, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { Portal } from "solid-js/web"
import createPresence from "solid-presence"
import { PromptInputV2Composer } from "@/components/prompt-input-v2"
import { PromptGitStatus, PromptWorkspaceSelector } from "@/components/prompt-workspace-selector"
import {
  PromptProjectAddButton,
  PromptProjectSelector,
  type PromptProjectController,
} from "@/components/prompt-project-selector"
import { StatusPopoverV2 } from "@/components/status-popover"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useServerSync } from "@/context/server-sync"
import { useProviders } from "@/hooks/use-providers"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"
import { Persist, persisted } from "@/utils/persist"
import type { NewSessionDraftController } from "./new-session-draft-controller"
import type { NewSessionWorkspaceController } from "./new-session-workspace-controller"

const providerTipDismissalDuration = 30 * 24 * 60 * 60 * 1000

export function NewSessionView(props: {
  input: NewSessionDraftController["input"]
  project: PromptProjectController
  workspace: NewSessionWorkspaceController
}) {
  const language = useLanguage()
  const prompt = usePrompt()
  const local = useLocal()
  const settings = useSettings()
  const seed = (text: string) => {
    prompt.set([{ type: "text", content: text, start: 0, end: text.length }], text.length)
    props.input.restoreFocus()
  }
  const mode = (value: "plan" | "build") => {
    settings.general.setShowCustomAgents(true)
    local.agent.set(value)
    props.input.restoreFocus()
  }
  return (
    <div class="@container relative flex flex-col min-h-0 h-full flex-1">
      <div
        data-component="session-new-design"
        class="relative flex-1 min-h-0 overflow-hidden rounded-[10px] bg-v2-background-bg-deep"
      >
        <div class="olive-new-session-position">
          <div class={`${NEW_SESSION_CONTENT_WIDTH} olive-new-session-content`}>
            <div class="olive-new-session-heading">
              <h1>{language.t("olivecode.starter.heading")}</h1>
            </div>
            <div class="olive-draft-composer flex flex-col gap-5">
              <PromptInputV2Composer
                controller={props.input}
                agentControl={
                  !local.agent.current() || ["build", "plan"].includes(local.agent.current()!.name) ? (
                    <div class="olive-mode-picker" role="group" aria-label={language.t("olivecode.starter.mode")}>
                      <button
                        type="button"
                        aria-pressed={local.agent.current()?.name === "build"}
                        onClick={() => mode("build")}
                      >
                        {language.t("olivecode.starter.build")}
                      </button>
                      <button
                        type="button"
                        aria-pressed={local.agent.current()?.name === "plan"}
                        onClick={() => mode("plan")}
                      >
                        {language.t("olivecode.starter.plan")}
                      </button>
                    </div>
                  ) : undefined
                }
              />
              <div class="olive-draft-context">
                <Show when={props.project.empty()}>
                  <PromptProjectAddButton controller={props.project} />
                </Show>
                <Show when={props.project.selected()}>
                  <div class="flex min-h-7 min-w-0 flex-col items-center justify-center gap-0 text-v2-text-text-faint sm:flex-row">
                    <PromptProjectSelector controller={props.project} placement="bottom" />
                    <Show
                      when={props.workspace.bar.visible()}
                      fallback={
                        <PromptGitStatus branch={props.workspace.bar.branch()} noGit={!props.workspace.project.git()} />
                      }
                    >
                      <PromptWorkspaceSelector
                        value={props.workspace.selection.value()}
                        projectRoot={props.workspace.project.root()}
                        workspaces={props.workspace.project.workspaces()}
                        branch={props.workspace.bar.branch()}
                        onChange={props.workspace.selection.set}
                        onDone={props.input.restoreFocus}
                      />
                    </Show>
                  </div>
                </Show>
              </div>
            </div>
            <OliveCodeStarters onChoose={seed} />
          </div>
        </div>
        <ProviderTip />
      </div>
    </div>
  )
}

export function NewSessionStatus(props: { mount: Accessor<HTMLElement | null>; visible: Accessor<boolean> }) {
  const language = useLanguage()

  return (
    <Show when={props.mount()} keyed>
      {(mount) => (
        <Portal mount={mount}>
          <Show when={props.visible()}>
            <Tooltip placement="bottom" value={language.t("status.popover.trigger")}>
              <StatusPopoverV2 />
            </Tooltip>
          </Show>
        </Portal>
      )}
    </Show>
  )
}

function ProviderTip() {
  const language = useLanguage()
  const dialog = useDialog()
  const sdk = useSDK()
  const serverSync = useServerSync()
  const providers = useProviders(() => sdk().directory)
  const [persistedState, setPersistedState, , persistedReady] = persisted(
    Persist.global("new-session.provider-tip"),
    createStore({ dismissedAt: 0 }),
  )
  const visible = createMemo(
    () =>
      serverSync().child(sdk().directory)[0].provider_ready &&
      persistedReady() &&
      providers.paid().length === 0 &&
      Date.now() - persistedState.dismissedAt >= providerTipDismissalDuration,
  )
  const [ref, setRef] = createSignal<HTMLDivElement>()
  const presence = createPresence({
    show: visible,
    element: () => ref() ?? null,
  })
  const openProviders = () => {
    void import("@/components/dialog-connect-provider").then(({ DialogConnectProvider }) => {
      void dialog.show(() => <DialogConnectProvider directory={() => sdk().directory} />)
    })
  }

  return (
    <Show when={presence.present()}>
      <div class="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-10">
        <div
          ref={setRef}
          data-component="provider-tip"
          data-visible={visible()}
          class="group/provider-tip pointer-events-auto relative flex h-6 max-w-full items-center transition-[opacity,transform] duration-[250ms] ease-[cubic-bezier(0.215,0.61,0.355,1)] motion-reduce:transition-none"
          classList={{ "data-[visible=false]:animate-out fade-out slide-out-to-bottom-4": true }}
        >
          <button
            type="button"
            class="flex h-6 min-w-0 items-center rounded-[4px] pl-1.5 text-[13px] leading-none tracking-[-0.04px] text-v2-text-text-faint transition-[background-color,color] duration-150 ease-in-out hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-muted focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:text-v2-text-text-muted focus-visible:outline-none"
            onClick={openProviders}
          >
            <span class="truncate">{language.t("home.providerTip")}</span>
            <span class="flex size-6 shrink-0 items-center justify-center" aria-hidden="true">
              <IconV2 name="chevron-down" size="small" class="-rotate-90" />
            </span>
          </button>
          <TooltipV2
            class="hover-reveal absolute left-full top-0 flex h-6 w-7 items-center justify-end delay-0 duration-0 group-hover/provider-tip:delay-[250ms] group-hover/provider-tip:duration-150 group-hover/provider-tip:opacity-100 focus-within:delay-0 focus-within:duration-0 focus-within:opacity-100"
            placement="top"
            openDelay={1000}
            value={language.t("common.dismiss")}
          >
            <button
              type="button"
              class="flex size-6 items-center justify-center rounded-[4px] text-v2-icon-icon-muted transition-[background-color,color] duration-150 ease-in-out hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:text-v2-icon-icon-base focus-visible:outline-none"
              aria-label={language.t("common.dismiss")}
              onClick={() => setPersistedState("dismissedAt", Date.now())}
            >
              <IconV2 name="xmark-small" />
            </button>
          </TooltipV2>
        </div>
      </div>
    </Show>
  )
}
