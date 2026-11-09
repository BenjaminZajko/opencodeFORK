import { createEffect, on, onMount, Show, Suspense, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { createMediaQuery } from "@solid-primitives/media"
import { useLocation } from "@solidjs/router"
import { OliveCodeWorkspaceSidebar } from "../components/olivecode-workspace-sidebar"
import { useLanguage } from "../context/language"
import { useCommand } from "../context/command"
import { makeEventListener } from "@solid-primitives/event-listener"
import { useSettingsCommand } from "../components/settings-dialog"
import { DebugBar } from "@/components/debug-bar"
import { TabsInfoPopup } from "@/components/help-button"
import { Titlebar, type TitlebarUpdate } from "@/components/titlebar"
import { usePlatform } from "@/context/platform"
import { setV2Toast, ToastRegion } from "@/utils/toast"

export default function NewLayout(props: ParentProps) {
  const platform = usePlatform()
  const language = useLanguage()
  const location = useLocation()
  const command = useCommand()
  useSettingsCommand()
  const desktop = createMediaQuery("(min-width: 900px)")
  const [state, setState] = createStore({ debugTools: false, sidebar: true, mobile: false })
  const opened = () => (desktop() ? state.sidebar : state.mobile)
  const close = () => (desktop() ? setState("sidebar", false) : setState("mobile", false))
  const toggle = () => (desktop() ? setState("sidebar", !state.sidebar) : setState("mobile", !state.mobile))
  command.register("olivecode.navigation", () => [
    {
      id: "sidebar.toggle",
      title: language.t("command.sidebar.toggle"),
      category: language.t("command.category.view"),
      keybind: "mod+b",
      onSelect: toggle,
    },
  ])
  onMount(() =>
    makeEventListener(window, "keydown", (event) => {
      if (event.key !== "Escape" || event.defaultPrevented || desktop() || !state.mobile) return
      setState("mobile", false)
      document.querySelector<HTMLButtonElement>('[data-action="workspace-sidebar-toggle"]')?.focus()
    }),
  )
  createEffect(
    on(
      () => location.pathname + location.search,
      () => setState("mobile", false),
    ),
  )

  createEffect(() => setV2Toast(true))

  const update: TitlebarUpdate = {
    version: () => {
      const state = platform.updater?.state()
      if (state?.status !== "ready") return
      return state.version
    },
    installing: () => platform.updater?.state().status === "installing",
    install: () => void platform.updater?.install(),
  }

  return (
    <div
      class="olive-workspace relative bg-v2-background-bg-deep flex-1 min-h-0 min-w-0 flex flex-col select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text"
      style={{
        "padding-top": "env(safe-area-inset-top, 0px)",
        "padding-bottom": "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <Titlebar
        navigation={{
          opened,
          toggle,
        }}
        update={update}
        debugTools={
          import.meta.env.DEV
            ? { visible: state.debugTools, toggle: () => setState("debugTools", (value) => !value) }
            : undefined
        }
      />
      <div class="olive-workspace-body">
        <Show when={opened()}>
          <Show when={!desktop()}>
            <button class="olive-sidebar-scrim" onClick={close} aria-label={language.t("common.close")} />
          </Show>
          <OliveCodeWorkspaceSidebar />
        </Show>
        <main
          inert={!desktop() && state.mobile}
          class="olive-workspace-content flex-1 min-h-0 min-w-0 overflow-x-hidden flex flex-col items-start contain-strict"
        >
          <Suspense>{props.children}</Suspense>
        </main>
      </div>
      {import.meta.env.DEV && state.debugTools && <DebugBar inline />}
      <TabsInfoPopup />
      <ToastRegion v2 />
    </div>
  )
}
