import { createEffect, createMemo, For, on, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useQuery } from "@tanstack/solid-query"
import { useLocation, useNavigate } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "../context/language"
import { ServerConnection } from "../context/server"
import { tabHref, tabKey, useTabs } from "../context/tabs"
import { useGlobal } from "../context/global"
import { loadHomeSessionIndex, type HomeSessionEvents } from "../context/global-sync/home-session-index"
import { workspaceConversations } from "./olivecode-workspace-history"
import { createHomeController } from "../pages/home/home-controller"
import { createHomeProjectsController } from "../pages/home/home-projects-controller"
import { displayName } from "../pages/layout/helpers"
import { DialogOliveCodeSetup } from "./dialog-olivecode-setup"
import { DialogOliveCodeTools } from "./dialog-olivecode-tools"

export function OliveCodeWorkspaceSidebar() {
  const home = createHomeController()
  const projects = createHomeProjectsController(home, { registerSettings: false })
  const language = useLanguage()
  const dialog = useDialog()
  const tabs = useTabs()
  const global = useGlobal()
  const location = useLocation()
  const navigate = useNavigate()
  const [state, setState] = createStore({ query: "", collapsed: {} as Record<string, boolean> })
  const active = createMemo(() => tabs.store.find((tab) => tabHref(tab) === location.pathname + location.search))
  const activeServer = createMemo(
    () =>
      global.servers.list().find((conn) => ServerConnection.key(conn) === active()?.server) ?? home.server.focused(),
  )
  const activeDirectory = () => {
    const tab = active()
    if (tab?.type === "draft") return tab.directory
    if (tab) return tabs.info[tabKey(tab)]?.directory
    return home.project.newSession()?.worktree
  }
  createEffect(() => {
    const conn = activeServer()
    if (conn && active()) home.selection.focusServer(conn)
  })
  createEffect(
    on(
      () => [activeServer(), activeDirectory(), active()] as const,
      ([conn, directory, tab]) => {
        if (!tab || !conn || !directory) return
        const projects = global.ensureServerCtx(conn).projects
        if (projects.list().some((project) => project.worktree === directory || project.sandboxes?.includes(directory)))
          return
        projects.open(directory)
      },
    ),
  )
  const context = home.server.focusedContext
  const events = useQuery(() => ({
    queryKey: home.server.focusedSync().homeSessions.eventsKey,
    queryFn: async (): Promise<HomeSessionEvents> => ({ sequence: 0, entries: [] }),
    initialData: { sequence: 0, entries: [] } satisfies HomeSessionEvents,
    enabled: false,
  }))
  const history = useQuery(() => ({
    queryKey: home.server.focusedSync().homeSessions.indexKey,
    enabled: !!context(),
    staleTime: 30_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const ctx = context()
      if (!ctx) return { sessions: [], eventSequence: 0 }
      const sequence = ctx.sync.homeSessions.eventSequence()
      const result = await loadHomeSessionIndex(
        (input, options) => ctx.sdk.client.v2.session.list(input, options),
        sequence,
        signal,
      )
      ctx.sync.homeSessions.complete(sequence)
      return result
    },
  }))
  const query = () => state.query.trim().toLocaleLowerCase()
  const recent = createMemo(() => home.server.focusedSync().homeSessions.sessions(history.data, events.data))
  const sessions = (directory: string) => {
    const project = home.project.list().find((item) => item.worktree === directory)
    if (!project) return []
    return workspaceConversations(recent(), project, query(), displayName(project))
  }
  const visible = createMemo(() =>
    home.project
      .list()
      .filter(
        (project) =>
          !query() ||
          displayName(project).toLocaleLowerCase().includes(query()) ||
          sessions(project.worktree).length > 0,
      ),
  )

  const choose = () => {
    const conn = home.server.focused()
    if (conn) projects.project.choose(conn)
  }
  const draft = (directory?: string) => {
    const conn = home.server.focused()
    const path = directory ?? home.project.newSession()?.worktree
    if (!conn || !path) return choose()
    home.project.openProjectNewSession(conn, path)
  }
  const tools = () => dialog.show(() => <DialogOliveCodeTools directory={activeDirectory()} server={activeServer()} />)

  return (
    <aside
      id="olivecode-project-sidebar"
      class="olive-sidebar"
      aria-label={language.t("olivecode.workspace.navigation")}
    >
      <div class="olive-sidebar-brand">
        <Mark class="olive-sidebar-mark" />
        <span>{language.t("olivecode.name")}</span>
      </div>
      <div class="olive-sidebar-actions">
        <button class="olive-new-chat" onClick={() => draft()}>
          <Icon name="plus-small" />
          {language.t("olivecode.workspace.new")}
        </button>
        <button
          class="olive-nav-row"
          aria-current={location.pathname === "/" ? "page" : undefined}
          onClick={() => navigate("/")}
        >
          <Icon name="dot-grid" size="small" />
          {language.t("olivecode.workspace.overview")}
        </button>
      </div>
      <div class="olive-sidebar-search">
        <Icon name="magnifying-glass" size="small" />
        <input
          type="search"
          value={state.query}
          onInput={(event) => setState("query", event.currentTarget.value)}
          aria-label={language.t("olivecode.workspace.search")}
          placeholder={language.t("olivecode.workspace.search")}
        />
      </div>
      <div class="olive-sidebar-section-heading">
        <span>{language.t("home.projects")}</span>
        <Show when={home.project.list().length > 0}>
          <button class="olive-icon-button" onClick={choose} aria-label={language.t("command.project.open")}>
            <Icon name="plus-small" size="small" />
          </button>
        </Show>
      </div>
      <div class="olive-sidebar-projects">
        <Show
          when={visible().length > 0}
          fallback={
            <p class="olive-sidebar-empty">
              {language.t(query() ? "olivecode.workspace.noMatches" : "olivecode.workspace.noProjects")}
            </p>
          }
        >
          <For each={visible()}>
            {(project) => (
              <section class="olive-sidebar-project">
                <div class="olive-sidebar-project-heading">
                  <button
                    class="olive-project-disclosure"
                    aria-expanded={!state.collapsed[project.worktree]}
                    onClick={() => setState("collapsed", project.worktree, !state.collapsed[project.worktree])}
                  >
                    <Icon name={state.collapsed[project.worktree] ? "chevron-right" : "chevron-down"} size="small" />
                    <Icon name="folder" size="small" />
                    <span>{displayName(project)}</span>
                  </button>
                  <button
                    class="olive-icon-button"
                    onClick={() => draft(project.worktree)}
                    aria-label={language.t("olivecode.workspace.newIn", { project: displayName(project) })}
                  >
                    <Icon name="plus-small" size="small" />
                  </button>
                  <MenuV2 gutter={6} modal={false} placement="bottom-end">
                    <MenuV2.Trigger
                      as={IconButtonV2}
                      variant="ghost-muted"
                      size="small"
                      icon={<IconV2 name="outline-dots" />}
                      aria-label={language.t("common.moreOptions")}
                    />
                    <MenuV2.Portal>
                      <MenuV2.Content>
                        <MenuV2.Item
                          onSelect={() => {
                            const conn = home.server.focused()
                            if (conn) projects.project.edit(conn, project)
                          }}
                        >
                          {language.t("dialog.project.edit.title")}
                        </MenuV2.Item>
                        <MenuV2.Item
                          onSelect={() => {
                            const conn = home.server.focused()
                            if (conn) projects.project.close(conn, project.worktree)
                          }}
                        >
                          {language.t("common.close")}
                        </MenuV2.Item>
                      </MenuV2.Content>
                    </MenuV2.Portal>
                  </MenuV2>
                </div>
                <Show when={!state.collapsed[project.worktree] || query()}>
                  <For
                    each={sessions(project.worktree)}
                    fallback={
                      <span class="olive-sidebar-project-empty">
                        {language.t(history.isLoading ? "common.loading" : "olivecode.workspace.noConversations")}
                      </span>
                    }
                  >
                    {(session) => (
                      <button
                        class="olive-thread-row"
                        title={session.title}
                        aria-current={location.pathname.endsWith(`/session/${session.id}`) ? "page" : undefined}
                        onClick={() => {
                          const conn = home.server.focused()
                          if (!conn) return
                          tabs.select(tabs.addSessionTab({ server: ServerConnection.key(conn), sessionId: session.id }))
                        }}
                      >
                        <span class="olive-thread-indicator" />
                        <span>{session.title}</span>
                      </button>
                    )}
                  </For>
                </Show>
              </section>
            )}
          </For>
        </Show>
        <Show when={history.isError}>
          <p class="olive-sidebar-empty" role="status">
            {language.t("olivecode.workspace.historyError")}
          </p>
        </Show>
        <Show when={home.project.list().length === 0}>
          <button class="olive-nav-row olive-add-project" onClick={choose}>
            <Icon name="folder" size="small" />
            {language.t("command.project.open")}
          </button>
        </Show>
      </div>
      <div class="olive-sidebar-footer">
        <button
          class="olive-nav-row"
          onClick={() => dialog.show(() => <DialogOliveCodeSetup server={activeServer()} />)}
        >
          <Icon name="providers" size="small" />
          {language.t("olivecode.models")}
        </button>
        <button class="olive-nav-row" onClick={tools}>
          <Icon name="sliders" size="small" />
          {language.t("olivecode.tools.title")}
        </button>
        <button class="olive-nav-row" onClick={projects.utility.settings}>
          <Icon name="settings-gear" size="small" />
          {language.t("command.settings.open")}
        </button>
      </div>
    </aside>
  )
}
