import { Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { useDirectoryPicker } from "../components/directory-picker"
import { OliveCodeStarters } from "../components/olivecode-starters"
import { ServerConnection } from "../context/server"
import { useTabs } from "../context/tabs"
import { createHomeController } from "./home/home-controller"
import { createHomeSessionsController } from "./home/home-sessions-controller"
import { createHomeSessionSearchController } from "./home/home-session-search-controller"
import { createHomeScrollController } from "./home/home-scroll-controller"
import { HomeSessions } from "./home/home-sessions"

export function NewHome() {
  const home = createHomeController()
  const sessions = createHomeSessionsController(home)
  const search = createHomeSessionSearchController(home, sessions)
  const scroll = createHomeScrollController(sessions.data.groups)
  const language = sessions.copy.language
  const tabs = useTabs()
  const pick = useDirectoryPicker()
  const start = (prompt?: string) => {
    const conn = home.server.focused()
    if (!conn) return
    const open = (directory: string) => {
      home.project.add(conn, [directory])
      void tabs.newDraft({ server: ServerConnection.key(conn), directory }, prompt)
    }
    const project = home.project.newSession()
    if (project) return open(project.worktree)
    pick({
      server: conn,
      title: language.t("command.project.open"),
      onSelect: (value) => {
        const directory = Array.isArray(value) ? value[0] : value
        if (directory) open(directory)
      },
    })
  }
  return (
    <div data-component="olivecode-home" class="olive-home-surface">
      <ScrollView
        class="h-full"
        viewportRef={scroll.viewport.setViewport}
        onScroll={(event) => scroll.viewport.update(event.currentTarget.scrollTop)}
      >
        <div class="olive-home-content">
          <section class="olive-home-intro">
            <h1>{language.t("olivecode.starter.heading")}</h1>
            <Button variant="primary" size="large" icon="plus-small" onClick={() => start()}>
              {language.t("olivecode.workspace.new")}
            </Button>
            <OliveCodeStarters onChoose={start} />
          </section>
          <Show when={sessions.data.groups().length > 0}>
            <div class="olive-home-history">
              <HomeSessions sessions={sessions} search={search} scroll={scroll} showCreateAction={false} />
            </div>
          </Show>
        </div>
      </ScrollView>
    </div>
  )
}
