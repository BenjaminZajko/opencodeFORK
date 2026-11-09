import { pathKey } from "../utils/path-key"

type Conversation = {
  id: string
  title: string
  directory: string
  parentID?: string
  time: { created: number; updated: number; archived?: number }
}

export function workspaceConversations<T extends Conversation>(
  all: T[],
  project: { worktree: string; sandboxes?: string[] },
  query: string,
  name: string,
) {
  const directories = new Set([project.worktree, ...(project.sandboxes ?? [])].map(pathKey))
  const search = query.trim().toLocaleLowerCase()
  const projectMatch = name.toLocaleLowerCase().includes(search)
  return all
    .filter(
      (session) =>
        !session.time.archived &&
        !session.parentID &&
        directories.has(pathKey(session.directory)) &&
        (!search || projectMatch || session.title.toLocaleLowerCase().includes(search)),
    )
    .sort((a, b) => b.time.updated - a.time.updated)
    .slice(0, 8)
}
