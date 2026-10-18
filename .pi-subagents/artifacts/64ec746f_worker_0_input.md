# Task for worker

Headless browser verification of a static meme site. Use the web-debug skill (pia-browser CLI). The site is already running at http://127.0.0.1:8791 (python http.server, cwd /Users/merlinkraemer/dev/projects/hourbreak). Read /Users/merlinkraemer/dev/projects/hourbreak/{index.html,app.js,style.css,sounds/manifest.json} first so you know what to assert. Do NOT edit any files — report findings only.

Verify each of these with concrete evidence (eval output, console output, network output, screenshots). Report PASS/FAIL per item plus the raw evidence:

1. `pia-browser open http://127.0.0.1:8791` then `pia-browser console` and `pia-browser errors`. Assert zero uncaught page errors and zero errors in the log box (the div#log must not contain the text "MANIFEST NOT LOADED").
2. Assert `document.querySelectorAll('#jukebox tbody tr').length === 22` and that `#lib-count` reads "(22 CLIPS)".
3. Assert all 22 mp3s return HTTP 200 via `pia-browser network requests --filter sounds` (or by fetching manifest.json and checking each entry with curl).
4. Countdown hiding: assert `#next` textContent is exactly "??:??" before any session is started, and that `#meter` has class `hidden-bar` at rest.
5. Click the `#guestbook-link` link; assert the `#guestbook` modal becomes visible and `#entries` contains at least 5 entries. Type a name and message into `#sign-name` / `#sign-text`, click the SIGN IT button, and assert the new entry appears at the top of `#entries`. Close it with `#guestbook-close` and assert `#guestbook` is hidden.
6. Click a jukebox PLAY button (row 1). Assert `#now` shows that row's label, `#lcd-label` becomes "NOISE!!", `#flash` gains class `on`, and a new line appears in `#log` containing "(test)".
7. Tick the `#cheat` checkbox. Assert `#meter` no longer has class `hidden-bar` and a log line mentioning "countdown revealed" appears. Untick it.
8. Click `#start`. Assert `#start` becomes disabled, `#stop` becomes enabled, and `#log` contains "SESSION STARTED". Then WAIT up to 90 seconds polling `#log` (e.g. `pia-browser eval "document.getElementById('log').innerText.split('\n').pop()"` every 5s, or `pia-browser wait` on a selector). Assert that within that window a real scheduled noise fires: a log line starting with "\u25b6 " appears, `#noise-count` becomes "1", `#now` shows a label, and one jukebox row gets class `played` with a non-zero FIRED cell. Report the observed label and how many seconds it took from the click.
9. Immediately after that noise, assert `#lcd-label` reads "SILENCE" again once the clip has finished (poll up to 15s).
10. Click `#stop`; assert `#start` enabled again, `#stop` disabled, and a log line containing "STOPPED BY THE OPERATOR".
11. Screenshot the full page at 1280x900 (`pia-browser screenshot /tmp/hb-desktop.png`) and at a narrow mobile viewport (e.g. `pia-browser eval` + resize if supported, else just take a 420x900 screenshot). Then `read` both PNGs and describe what you actually see: does the WordArt logo render as large rainbow gradient text (not blank/invisible), is the navy/teal panel styling applied, is the starfield background visible, are badges/counter/webring present, is anything overflowing, overlapping, clipped, or unreadable? Report specifics — quote legible text and name any element that looks broken.
12. Assert no horizontal scrollbar at 1280 wide: `pia-browser eval "document.documentElement.scrollWidth <= window.innerWidth"`.

Finally `pia-browser close`. Return: per-item PASS/FAIL, the exact evidence strings, the two screenshot paths, and any bug that needs fixing. Do not fix anything yourself.

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: review-findings, residual-risks

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```