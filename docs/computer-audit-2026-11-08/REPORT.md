# Advanced computer-control audit — 2026-11-08

This audit found a real macOS focus-safety defect and two saved-file verification
defects. The corrections are built and locally installed. The strengthened live
Mac test passed 20 checks, including app switching and Stop during actual typing.
Do not treat this as public-release acceptance of every app or platform.
Windows/Linux live operation remains unverified.

## What the advanced test actually exercised

The test used OliveCode's real installed native helper, Microsoft Excel and a
new TextEdit document. Only synthetic files under `advanced/workspace` were used.
It is a native transport/application test; a script supplies the actions, not a
language model. The action log is `advanced/native-workflow-attempt-1.jsonl`.

- Entered quantities, prices and formulas in a copy of the existing test workbook.
- Corrected a unit price from 19.99 to 24.99, committed each edit, revisited cells,
  checked the unrelated `KEEP-THIS-CELL` marker and saved the workbook.
- Independently read the actual saved XLSX XML: D2 = 74.97 (`B2*C2`), D3 = 99
  (`B3*C3`), D4 = 173.97 (`SUM(D2:D3)`). This verifies persisted calculations,
  rather than trusting a keypress or model summary. Evidence:
  `advanced/budget-first-save-verification.json`.
- Created a fresh TextEdit report with currency symbols, Slovak Unicode and emoji.
- Confirmed an outdated revision was rejected without modifying its report.
- Deliberately changed the active app from a separate helper instance before
  attempting another edit. This revealed the defect below. No private files
  were involved.

## Confirmed defects and corrections

### Cached foreground identity could permit misdirected input

The persistent helper used `NSWorkspace.shared.frontmostApplication`. With its
blocking stdin loop, that process could retain an outdated app identity while
another app had already become active. In the failure-injection trial, the
helper began typing the synthetic `WRONG APP INPUT` into the test workbook,
then detected the mismatch and stopped. The observed workbook editor contained
`W`. Returning an error after sending a character is not sufficient protection.
The independent observer also briefly reported its cached previous app.

All four foreground checks now query the system-wide accessibility server's
`kAXFocusedApplicationAttribute` directly. Failure to get fresh ownership stops
input; there is no cached fallback. This affects initial checks, activation
confirmation, restoration after an approval and post-action verification.
Apple documents that attribute as the application accepting keyboard input:
https://developer.apple.com/documentation/applicationservices/kaxfocusedapplicationattribute

The strengthened real-app retest checks **both** documents, rejects any failure
receipt that says input was already sent, checks the independent worker sees
the newly active app, and then interrupts actual typing after detecting its
first characters. After refreshing the existing helper permission, that retest
passed. Excel received zero characters during the rejected cross-app input and
retained its marker cell. The independent worker identified the newly focused
TextEdit app. Stop interrupted confirmed typing in 4ms; repeated observations
showed no additional text for 700ms afterward. These are measurements of this
trial, not a universal timing guarantee. Evidence: `advanced/native-result.json`
and `advanced/native-workflow.jsonl`.

### Correct name in the wrong folder could pass save verification

`failedComputerAction` checked TextEdit's filename but ignored the user's
explicit destination. A matching name under `/tmp/Wrong` could therefore be
accepted for a report requested in another workspace.

The new check compares the normalized decoded file URL with the explicit full
path or workspace/folder, including spaces and Unicode. It still rejects dirty
documents, incorrect filenames, non-file URLs and missing save evidence. The
operator prompt now instructs checking both filename and folder.

The new regression failed against the old logic (20 pass / 1 fail), then passed
after the correction (21 pass / 0 fail). It tests a wrong folder, a folder with a
misleading common prefix, the correct Unicode folder and an explicit quoted
full filename with spaces.

### Valid Unicode filenames were rejected after Cocoa decomposed their accents

The actual saved report's Cocoa URL contains `Z` plus a combining caron, while
the requested name contains the single character `Ž`. A literal comparison
rejected that valid save. The regression first reproduced this failure, then
passed after applying Unicode NFC normalization to both sides of the filename
and path comparison. This does not merge unrelated letters or different folders.
`advanced/verify-native-save.ts` also passed against the actual saved Cocoa URL.

The final RTF was independently converted to plain text and matched the complete
expected report exactly. The saved corrected workbook independently contained
the 173.97 total and the unchanged unrelated marker. Deliberate failure-test
changes to the first disposable workbook were discarded through Excel; the
saved correct file was retained.

## Completed verification of the updated build

- 98 focused backend tests passed, zero failed and zero skipped. Includes actual
  local-browser tests, native protocol/guard tests, authenticated app launch,
  Stop before connection, cancellation, tool restrictions and Ollama Local/cloud
  separation. Log: `/private/tmp/olivecode-v7-regression.log`.
- 24 TUI computer-menu/clipboard/selection tests passed.
- Backend and TUI typechecks passed.
- Updated Swift helper compilation and `--self-test` passed.
- Compiled `0.3.1-local.20261108.7` background-browser chat integration passed:
  actual Chromium tabs/form editing, dropdown selection, approval scope,
  screenshot transport of the local fixture, Assist review, provider-error
  recovery and Stop. Model replies are scripted for this integration test;
  this does not prove autonomous planning by a real model.
- Built executable's version smoke check passed; prior local executable retained
  as a backup. Build metadata and hashes: `BUILD-STATUS.json`.
- Final `0.3.1-local.20261108.8` adds Unicode filename comparison; the focused
  completion tests, backend typecheck and actual Cocoa-URL integration passed.
  Its native helper is byte-identical to the approved, physically tested helper.

## Remaining acceptance work

1. The real-model multi-app trial is running through the existing Groq free
   provider, which answered its availability probe. The configured free North
   model returned HTTP 429 / daily quota exhausted. Evidence:
   `advanced/model-probe-result.json` and `advanced/model-probe-result-groq.json`.
   No paid plan was enabled. The trial reads two synthetic local vendor pages,
   checks price/shipping/deadline constraints, resists an instruction planted in
   a page, then must create, save and verify a new TextEdit report. See
   `advanced/REAL-PROMPT.txt` and `advanced/real-workflow.py`.
2. Perform separate physical Ubuntu and Windows acceptance tests before a
   stable cross-platform release. Their earlier preview builds are unchanged.

The first failed attempt remains preserved alongside the successful retest.
