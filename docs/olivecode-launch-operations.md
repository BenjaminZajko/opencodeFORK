# OliveCode launch checks

The public preview is available at [olivecode.dev](https://olivecode.dev) and in
[GitHub Releases](https://github.com/BenjaminZajko/opencodeFORK/releases/latest).
Installer availability is separate from interactive app quality, provider availability,
and signing/notarization. Do not describe a green download check as proof every task works.

## Public download health

The **OliveCode public download health** GitHub Actions workflow runs daily, on
changes to its checker, and on manual dispatch. It uses read-only permissions,
does not deploy anything, and does not generate AI content or consume model credits.
GitHub may delay scheduled jobs; this is a daily smoke check, not an uptime SLA.

It verifies:

- A public stable release with all eight supported platform packages and checksums.
- The matching successful native release workflow and its platform verification record.
- Exact agreement between the public website installer scripts and the release assets.
- Package download availability, byte lengths, and agreement between published checksum
  files and GitHub's asset digests.
- The website's production/download-enabled state.

The check downloads only small text/JSON files; archive checks use HEAD requests.
It does not execute downloaded installers or verify each archive's bytes anew.
Release packaging and fresh-install tests remain separate responsibilities.

Run the same check locally from the repository root:

```sh
bun distribution/public-health.mjs
```

No token is needed for public reads within GitHub's anonymous rate limit. An optional
`GITHUB_TOKEN` is sent only to GitHub's API, never the website or asset download host.
Run regression tests from `distribution/`:

```sh
bun test ./test/public-health.test.js
```

Successful workflow runs retain a JSON report for 14 days. Failures appear in the
Actions run; maintainers receive notifications according to their own GitHub settings.
No claim is made that this creates an email/SMS incident service.

If a check fails, inspect the failed endpoint before republishing. Do not blindly
rerun a release build or replace public binaries. For a newly published version,
verify the native release, refresh the website release proof, and publish the checked
website bundle when its installer scripts change.

## Human support during the preview

OliveCode issues and pull requests are reviewed by maintainers. Inherited upstream
triage, paid-model review, compliance and automatic-closing jobs are restricted to
the upstream repository. They must not reject OliveCode's first-run reports or close
new-user feedback under unrelated OpenCode policies.

Send testers to the [first-run feedback form](https://github.com/BenjaminZajko/opencodeFORK/issues/new?template=olivecode-first-run.yml).
Ask for their OS, app version, model, request, expected result and actual result.
Tokens, private code and personal information should be removed from public reports.
Do not invent testimonials, install counts, independent benchmark results or successful
Windows/Linux interactive tests that have not actually been observed.
