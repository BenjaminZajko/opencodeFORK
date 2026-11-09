# Observed public-release run

17 October 2026 · OliveCode 0.1.0 · macOS ARM64 · Bun 1.4.2.

The public macOS ARM64 archive matched its release checksum:
`26891b3e9333bb9865108d9583786c6da3427d16d2353253e510d4f5b9c470be`.

The requested and recorded worker model was `openrouter/poolside/laguna-s-2.1:free`. Assist used GPT OSS 120B and Codestral (latest). No paid-only model was selected. The command used `run --pure --format json`, with file operations and the example's test command allowed, and other tools denied. No production repository or private project code was used as task input.

Observed tool sequence (paths shortened to example filenames):

1. Teamwork planning and second opinion.
2. Read `slug.test.ts`.
3. Read `slug.ts`.
4. Edit `slug.ts`.
5. Run `bun test ./slug.test.ts`: 10 pass, 0 fail.
6. Follow-through reviews reported completion.

Before the run, the unchanged starter tests produced 4 pass and 6 fail. Afterward a separate test execution also produced 10 pass, 0 fail. The test file was compared byte-for-byte with the original and was unchanged. The actual resulting function is in `solution.ts`; `slug.ts` remains the incomplete starter so the example can be repeated. The machine-readable record includes the test hash.

Elapsed wall time was 55.3 seconds for this one observed public-release run, including coordination; this is not a latency benchmark. No retries of this public-release run were needed. An earlier exploratory run used a development build and is not included as a release result.

These ten authored cases cover a small ASCII slug function. They do not establish general correctness, reliability on larger projects, superiority over other products, Unicode handling or local-model quality. Repeating the same prompt with another provider/model may yield different results.

## Walkthrough

[Watch a 36-second condensed playback of the captured CLI events](https://github.com/BenjaminZajko/opencodeFORK/releases/download/v0.1.0/OliveCode-real-coding-walkthrough.mp4). This is an illustrated event transcript, explicitly labeled as a rendering rather than a screen recording. It uses the actual observed action sequence and resulting code; its playback duration is not the model run time.
