import { expect, test } from "bun:test"
import path from "path"
import { syntaxProblem } from "../../src/tool/syntax-check"
import { tmpdir } from "../fixture/fixture"

test("reports syntax errors that a free model's edit introduced", async () => {
  await using tmp = await tmpdir()
  const file = (name: string, content: string) => Bun.write(path.join(tmp.path, name), content).then(() => path.join(tmp.path, name))
  const python = await syntaxProblem(await file("bad.py", "def f():\n    return 1\n        x = 2\n"))
  if (Bun.which("python3")) expect(python).toContain("line 3")
  expect(await syntaxProblem(await file("bad.json", '{"a": 1,}'))).toBeDefined()
  expect(await syntaxProblem(await file("bad.ts", "const x = (1\n"))).toBeDefined()
  expect(await syntaxProblem(await file("ok.py", "def f():\n    return 1\n"))).toBeUndefined()
  expect(await syntaxProblem(await file("ok.tsx", "export const A = () => <div />\n"))).toBeUndefined()
  expect(await syntaxProblem(await file("tsconfig.json", '{ // comments are allowed here\n}'))).toBeUndefined()
  expect(await syntaxProblem(await file("notes.md", "# not code ("))).toBeUndefined()
})
