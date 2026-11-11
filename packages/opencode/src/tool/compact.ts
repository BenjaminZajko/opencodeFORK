// Short tool descriptions for models whose provider allows only a small request
// (Groq's free tokens-per-minute cap, Ollama's default 4K context). The full
// descriptions alone are ~23K characters; parameter schemas are unchanged.
const DESCRIPTIONS: Record<string, string> = {
  bash: "Run a shell command in the project (tests, builds, git, package managers). Use workdir instead of `cd`. Do not use it to read, write, edit or search files; use the dedicated tools. Quote paths with spaces. Give a short description of what the command does.",
  read: "Read a file (or list a directory) by absolute path. Lines are returned as `<line>: <content>`; that prefix is not part of the file. Use offset/limit for large files.",
  edit: "Replace exact text in a file. Read the file first. oldString must match the file exactly (without the `<line>: ` prefix, same indentation) and be unique, or set replaceAll. Prefer editing existing files over writing new ones.",
  write: "Create or overwrite a file with the given content. Read an existing file first. Prefer edit for changes to existing files.",
  glob: "Find files by glob pattern (e.g. `**/*.py`), sorted by modification time.",
  grep: "Search file contents with a regular expression. Optionally limit by path and an include glob such as `*.ts`.",
  task: "Start a subagent for a self-contained research or multi-step task and get its final report back. Give it a complete, specific prompt.",
  todowrite: "Keep a short task list for multi-step work: list steps, mark one in_progress at a time, mark each completed when done. Skip it for simple tasks.",
  webfetch: "Fetch a URL and return its content as markdown, text or html.",
  websearch: "Search the web for current information. Returns result titles, URLs and snippets.",
  skill: "Load a listed skill's instructions when the task matches its description.",
  apply_patch: "Apply a patch that adds, updates, moves or deletes files. Read files before updating them.",
  browser: "Control OliveCode's own hidden browser for website tasks: open a URL (visible: true to show the window), then click/type/fill/select/press using numbered targets and the revision from the latest observation; scroll to read more. Private fields, payments and logins are for the person.",
  desktop: "Use apps on this computer. Call action status first; if a permission is missing, call setup and ask the person to enable it. Then find_app/activate, observe, and click/type with targets and revision from the latest observation, one action per turn.",
  question: "Ask the user a question with suggested answers when you are genuinely blocked on their decision.",
}

export function compactDescription(id: string, description: string) {
  return DESCRIPTIONS[id] ?? description.split(/\n\s*\n/)[0]!.slice(0, 400)
}
