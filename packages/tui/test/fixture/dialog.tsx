/** @jsxImportSource @opentui/solid */
import { testRender, useRenderer } from "@opentui/solid"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { onCleanup, onMount, type JSX } from "solid-js"
import path from "node:path"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"
import { createFetch, eventSource, type FetchHandler } from "../fixture/tui-sdk"
import { ArgsProvider } from "../../src/context/args"
import { ExitProvider } from "../../src/context/exit"
import { SDKProvider } from "../../src/context/sdk"
import { ProjectProvider } from "../../src/context/project"
import { SyncProvider } from "../../src/context/sync"
import { LocalProvider, useLocal } from "../../src/context/local"
import { PermissionProvider } from "../../src/context/permission"
import { RouteProvider } from "../../src/context/route"
import { KVProvider } from "../../src/context/kv"
import { ThemeProvider } from "../../src/context/theme"
import { TuiConfigProvider } from "../../src/config"
import { Toast, ToastProvider } from "../../src/ui/toast"
import { DialogProvider, useDialog } from "../../src/ui/dialog"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../../src/keymap"

export async function mountDialog(
  root: string,
  content: () => JSX.Element,
  fetch: FetchHandler,
  options: {
    width?: number
    height?: number
    mode?: "dark" | "light"
    inline?: () => JSX.Element
    saved?: Record<string, unknown>
    autoOpen?: boolean
  } = {},
) {
  if (!(await Bun.file(path.join(root, "kv.json")).exists()))
    await Bun.write(path.join(root, "kv.json"), JSON.stringify(options.saved ?? {}))
  const config = createTuiResolvedConfig()
  const calls = createFetch(fetch)
  let open!: () => void
  let current!: () => { providerID: string; modelID: string } | undefined

  function Launcher() {
    const dialog = useDialog()
    current = useLocal().model.current
    open = () => dialog.replace(content)
    onMount(() => {
      if (options.autoOpen !== false) open()
    })
    return <box>{options.inline?.()}</box>
  }

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    onCleanup(registerOpencodeKeymap(keymap, renderer, config))
    return (
      <TestTuiContexts directory={root} paths={{ home: root, state: root, worktree: root }}>
        <ExitProvider
          exit={(error) => {
            throw error ?? new Error("unexpected exit")
          }}
        >
          <OpencodeKeymapProvider keymap={keymap}>
            <ArgsProvider>
              <TuiConfigProvider config={config}>
                <KVProvider>
                  <ToastProvider>
                    <RouteProvider>
                      <SDKProvider url="http://test" directory={root} fetch={calls.fetch} events={eventSource()}>
                        <PermissionProvider>
                          <ProjectProvider>
                            <SyncProvider>
                              <ThemeProvider mode={options.mode ?? "dark"}>
                                <LocalProvider>
                                  <DialogProvider>
                                    <Launcher />
                                    <Toast />
                                  </DialogProvider>
                                </LocalProvider>
                              </ThemeProvider>
                            </SyncProvider>
                          </ProjectProvider>
                        </PermissionProvider>
                      </SDKProvider>
                    </RouteProvider>
                  </ToastProvider>
                </KVProvider>
              </TuiConfigProvider>
            </ArgsProvider>
          </OpencodeKeymapProvider>
        </ExitProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { width: options.width ?? 100, height: options.height ?? 40 })
  return {
    ...app,
    open: () => open(),
    current: () => current(),
    async search(text: string) {
      const start = Date.now()
      while (!app.renderer.currentFocusedRenderable) {
        if (Date.now() - start > 2000) throw new Error("Dialog input did not gain focus")
        await Bun.sleep(1)
      }
      app.mockInput.pressKey("u", { ctrl: true })
      await app.mockInput.typeText(text)
      await app.renderOnce()
    },
    async frame(text: string, present = true, timeout = 2000) {
      const start = Date.now()
      for (;;) {
        await app.renderOnce()
        if (app.captureCharFrame().includes(text) === present) return app.captureCharFrame()
        if (Date.now() - start > timeout)
          throw new Error(`Expected "${text}" ${present ? "present" : "absent"}:\n${app.captureCharFrame()}`)
        await Bun.sleep(10)
      }
    },
  }
}
