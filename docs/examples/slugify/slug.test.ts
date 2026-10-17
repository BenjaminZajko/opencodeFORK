import { expect, test } from "bun:test"
import { slugify } from "./slug"

for (const [input, expected] of [
  ["Hello World", "hello-world"],
  ["  Hello   World  ", "hello-world"],
  ["Ship It Now", "ship-it-now"],
  ["Fix: bug #42!", "fix-bug-42"],
  ["already-a-slug", "already-a-slug"],
  ["a---b___c", "a-b-c"],
  ["", ""],
  [" --- !!! ", ""],
  ["Version 2", "version-2"],
  ["API / Client", "api-client"],
]) test(JSON.stringify(input), () => expect(slugify(input)).toBe(expected))
