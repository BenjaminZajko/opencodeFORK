import { Show } from "solid-js"
import { useTheme } from "../context/theme"
import { Prompt, type PromptRef } from "../component/prompt"
import { createEffect, createMemo, createSignal, onMount } from "solid-js"
import { Logo } from "../component/logo"
import { useSync } from "../context/sync"
import { Toast } from "../ui/toast"
import { useArgs } from "../context/args"
import { useRouteData } from "../context/route"
import { usePromptRef } from "../context/prompt"
import { useLocal } from "../context/local"
import { usePluginRuntime } from "../plugin/runtime"
import { useEditorContext } from "../context/editor"
import { useTerminalDimensions } from "@opentui/solid"
import { useTuiConfig } from "../config"
import { HomeSessionDestinationProvider } from "./home/session-destination"
import { StartGuide } from "../component/start-guide"
import { useKV } from "../context/kv"
import { SponsorPlacement } from "../component/sponsor-placement"
import { RemoteHint } from "../component/remote-hint"

let once = false
const placeholder = {
  normal: ["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"],
  shell: ["ls -la", "git status", "pwd"],
}

export function Home() {
  const pluginRuntime = usePluginRuntime()
  const sync = useSync()
  const route = useRouteData("home")
  const promptRef = usePromptRef()
  const [ref, setRef] = createSignal<PromptRef | undefined>()
  const args = useArgs()
  const local = useLocal()
  const editor = useEditorContext()
  const dimensions = useTerminalDimensions()
  const tuiConfig = useTuiConfig()
  const kv = useKV()
  const { theme } = useTheme()
  const compact = () => dimensions().height < 30 || dimensions().width < 60
  const hero = () => dimensions().height >= 30 && dimensions().width >= 75
  const stackedLogo = () => dimensions().height >= 30 && dimensions().width >= 60 && !hero()
  const promptMaxWidth = createMemo(() => {
    const configured = tuiConfig.prompt?.max_width
    if (configured === "auto") return Math.max(75, Math.floor(dimensions().width * 0.7))
    return configured ?? 88
  })
  let sent = false

  onMount(() => {
    editor.clearSelection()
  })

  const bind = (r: PromptRef | undefined) => {
    setRef(r)
    promptRef.set(r)
    if (once || !r) return
    if (route.prompt) {
      r.set(route.prompt)
      once = true
      return
    }
    if (!args.prompt) return
    r.set({ input: args.prompt, parts: [] })
    once = true
  }

  // Wait for sync and model store to be ready before auto-submitting --prompt
  createEffect(() => {
    const r = ref()
    if (sent) return
    if (!r) return
    if (!sync.ready || !local.model.ready) return
    if (!args.prompt) return
    if (r.current.input !== args.prompt) return
    sent = true
    r.submit()
  })

  return (
    <HomeSessionDestinationProvider>
      <box flexDirection="row" justifyContent="space-between" paddingLeft={3} paddingRight={3} paddingTop={1} paddingBottom={1} backgroundColor={theme.backgroundPanel}>
        <pluginRuntime.Slot name="home_logo" mode="replace"><Logo compact /></pluginRuntime.Slot>
        <text fg={theme.primary}>FREE WORKSPACE</text>
      </box>
      <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
        <Show when={hero() || stackedLogo()}>
          <box width="100%" maxWidth={promptMaxWidth()} alignItems="center" paddingTop={hero() ? 2 : 1} paddingBottom={1} flexShrink={0}>
            <Logo hero={hero() ? "wide" : "stacked"} />
          </box>
        </Show>
        <box flexGrow={1} minHeight={0} />
        <box width="100%" maxWidth={promptMaxWidth()} paddingLeft={1} flexShrink={0}>
          <StartGuide compact={compact()} />
        </box>
        <box width="100%" maxWidth={promptMaxWidth()} zIndex={1000} paddingTop={1} flexShrink={0}>
          <pluginRuntime.Slot name="home_prompt" mode="replace" ref={bind}>
            <Prompt
              ref={bind}
              right={<pluginRuntime.Slot name="home_prompt_right" />}
              placeholders={placeholder}
              onSubmit={() => kv.set("olivecode_guide_dismissed", true)}
            />
          </pluginRuntime.Slot>
        </box>
        <pluginRuntime.Slot name="home_bottom" />
        <box width="100%" maxWidth={promptMaxWidth()} paddingLeft={1} paddingTop={1} flexShrink={0}>
          <RemoteHint compact={compact()} />
        </box>
        <box width="100%" maxWidth={promptMaxWidth()} paddingLeft={1} paddingTop={1} flexShrink={0}>
          <SponsorPlacement placement="welcome" />
        </box>
        <box flexGrow={1} minHeight={0} />
        <Toast />
      </box>
      <box width="100%" flexShrink={0}>
        <pluginRuntime.Slot name="home_footer" mode="single_winner" />
      </box>
    </HomeSessionDestinationProvider>
  )
}
