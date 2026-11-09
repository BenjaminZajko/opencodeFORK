# A repeatable OliveCode coding task

A small maintainer-authored example for checking real file edits and test execution. This is not an independent benchmark, a comparison score, or evidence about large projects.

## Repeat it

1. Install Bun from https://bun.sh and OliveCode from https://olivecode.dev/guide.
2. Copy only `slug.ts` and `slug.test.ts` into an empty disposable folder. No project dependencies are required.
3. Run `bun test ./slug.test.ts`. The starter has 4 passing and 6 failing tests.
4. Run `olivecode` in that folder. Select your cloud or downloaded local model.
5. Send:

```text
Fix slug.ts so all existing slug.test.ts cases pass.
Read the files, change only slug.ts, run bun test ./slug.test.ts,
and report the actual results. Do not modify the tests.
```

6. Review the actual file changes, confirm the test file was not changed, and run the tests yourself.

The contract is deliberately ASCII-only: lowercase letters, retain digits, turn runs of non-ASCII-alphanumeric characters into one hyphen, and remove leading/trailing hyphens. This example does not assess Unicode transliteration, package security, general reasoning, or large-repository performance.

Free cloud providers retain their own quotas. Local inference avoids a cloud-model request quota but depends on model capability and hardware. Assist may use additional configured cloud models; local selection alone does not prove all activity stays offline.

See https://olivecode.dev/free-ai-coding-agent and https://olivecode.dev/local-ai-coding for setup and limitations.
