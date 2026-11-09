import { expect, test } from "bun:test"
import { workspaceConversations } from "./olivecode-workspace-history"

const conversation = (id: string, directory: string, updated = 1) => ({
  id,
  title: id,
  directory,
  time: { created: 1, updated },
})

test("keeps project history separate while including its worktrees", () => {
  const data = [conversation("root", "/repo"), conversation("branch", "/branch"), conversation("other", "/other")]
  expect(
    workspaceConversations(data, { worktree: "/repo", sandboxes: ["/branch"] }, "", "Project").map((s) => s.id),
  ).toEqual(["root", "branch"])
})
test("searches history before limiting and matches project names", () => {
  const data = Array.from({ length: 12 }, (_, index) => conversation(`task-${index}`, "/repo", index))
  expect(workspaceConversations(data, { worktree: "/repo" }, "task-0", "Project").map((s) => s.id)).toEqual(["task-0"])
  expect(workspaceConversations(data, { worktree: "/repo" }, "project", "Project")).toHaveLength(8)
  expect(data[0].id).toBe("task-0")
})
test("omits archived conversations and internal child sessions", () => {
  const data = [
    conversation("visible", "/repo"),
    { ...conversation("archived", "/repo"), time: { created: 1, updated: 2, archived: 3 } },
    { ...conversation("child", "/repo"), parentID: "visible" },
  ]
  expect(workspaceConversations(data, { worktree: "/repo/" }, "", "Project").map((s) => s.id)).toEqual(["visible"])
})
