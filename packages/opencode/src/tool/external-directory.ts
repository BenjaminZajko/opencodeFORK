import path from "path"
import { existsSync } from "fs"
import { Effect } from "effect"
import { InstanceState } from "@/effect/instance-state"
import type * as Tool from "./tool"
import { containsPath } from "../project/instance-context"
import { FSUtil } from "@opencode-ai/core/fs-util"

type Kind = "file" | "directory"

type Options = {
  bypass?: boolean
  kind?: Kind
}

export const assertExternalDirectoryEffect = Effect.fn("Tool.assertExternalDirectory")(function* (
  ctx: Tool.Context,
  target?: string,
  options?: Options,
) {
  if (!target) return false

  if (options?.bypass) return false

  const ins = yield* InstanceState.context
  const full = process.platform === "win32" ? FSUtil.normalizePath(target) : target
  if (containsPath(full, ins)) return false

  const kind = options?.kind ?? "file"
  const dir = kind === "directory" ? full : path.dirname(full)
  // Models sometimes garble long absolute paths. Asking permission for a folder
  // that does not exist is confusing; point at the matching project path instead.
  if (!existsSync(dir)) {
    const suggestion = projectSuggestion(full, ins.directory)
    if (suggestion)
      throw new Error(`${full} does not exist. Did you mean ${suggestion}? Use paths inside the project (${ins.directory}).`)
  }
  const glob =
    process.platform === "win32"
      ? FSUtil.normalizePathPattern(path.join(dir, "*"))
      : path.join(dir, "*").replaceAll("\\", "/")

  yield* ctx.ask({
    permission: "external_directory",
    patterns: [glob],
    always: [glob],
    metadata: {
      filepath: full,
      parentDir: dir,
    },
  })
  return true
})

/** The longest trailing part of `target` that names an existing path inside `root`. */
function projectSuggestion(target: string, root: string) {
  const parts = target.split(/[\\/]+/).filter(Boolean)
  // At least two segments (folder + name), so a new outside file such as
  // ~/newapp/app.py is not redirected just because the project has an app.py.
  return parts
    .slice(0, -1)
    .map((_, index) => path.join(root, ...parts.slice(index)))
    .find((candidate) => existsSync(candidate))
}

export async function assertExternalDirectory(ctx: Tool.Context, target?: string, options?: Options) {
  return Effect.runPromise(assertExternalDirectoryEffect(ctx, target, options))
}
