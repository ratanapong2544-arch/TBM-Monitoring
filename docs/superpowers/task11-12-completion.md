# Tasks 11 and 12 — offline recovery safeguards, and the operations record

**Task 11 closed at `c5770fe`. Task 12's written half closed at `44a40d7`.** Not deployed.

## Task 11 — what shipped

Four features need the network. Each now says so instead of failing its own way:

| Feature | Before | Now |
|---|---|---|
| Gemini analysis | opened a full-screen modal, spun, ended on a connection error | button disabled, `title` says ต้องเชื่อมต่ออินเทอร์เน็ต; the handler refuses too |
| Drive slideshow | fetched, timed out, then advised checking the folder's sharing setting | does not call at all; says the photos need a link and the rest of the page is fine |
| PDF helper | 2 s abort timer on every attempt, then told whoever held the phone to run `python build_report.py` | returns false immediately with no link; the message names the phone case and points at browser print |
| Alignment map | a black rectangle, read as a broken map | one line naming the missing basemap; route, shafts, tube, head and instruments still drawn |

`useIsOnline` is the single place any of them asks the platform — four inline `navigator.onLine`
reads with four listeners is the shape that cost Task 10 a fix in most of its rounds.
`isBasemapTileError` lives in its own module because `AlignmentMapView` pulls in maplibre and
three.js, which cannot be imported in a jsdom test; the decision can be, and is.

New: `getStorageHealth()` (usage, quota, whether the browser may evict, `supported:false` rather than
a throw or a made-up zero) and `exportPendingBundle(repository)` — the recovery file, with
`downloadExportBundle` writing it and revoking its object URL. The Sync Center shows the storage line
and **ส่งออกข้อมูลที่ยังไม่ซิงก์**; no "clear all data" button was added, and discard stays
per-record and confirmed.

### The export's two rules

1. **It must be enough to replay the work.** Request ids and full payloads — a recovery that cannot
   name the write cannot put the ring on the sheet.
2. **It must not be a way in.** No GAS URL, no key, no confirmed business data; a test asserts it.
   Photo bytes are reported as `{omitted:true, reason:"binary payload"}` rather than deleted — unlike
   `withoutPhotoBytes` in the store, which deletes the key because `retryMutationAsSuccessor` reads a
   missing key as "the editor never had the bytes". This file is read by a person, and a photo that
   vanishes silently reads as one the crew never took.

Test-first throughout: both new modules were written against a red suite, and all 15 rules added by
this task go red on exactly the test named for each.

## Task 12 — what is written, and what is not

Written: `docs/mobile-pwa-runbook.md` (promotion gate, GAS backup-and-hash, deploy and rollback
order, export-before-maintenance, the no-login warning, the three pilot gates) and
`docs/mobile-pwa-test-matrix.md` (automated results as recorded; 26 device rows, none signed).
`README.md` replaced "Created with CodeSandbox".

**Not done, and not doable from here** — Steps 2, 3, 4 and 6:

- the production-build offline shell check in a real browser,
- the two-profile conflict scenarios,
- Android and iPhone install / offline / reconnect / update,
- **timing a real `getData` and a real write on the underground link.** Both wire deadlines are 90 s
  (`SNAPSHOT_FETCH_TIMEOUT_MS`, `SYNC_POST_TIMEOUT_MS`) and neither has been measured against
  anything. The plan's third deadline, the 45 s shift-save, no longer exists — Task 8 removed the
  interim write bookkeeping it belonged to.
- the three pilot gates.

## Gates at close

| Gate | Result |
|---|---|
| `npx cross-env CI=true npx react-scripts test --watchAll=false` | 91 suites / 1286 tests pass |
| `node tools/gas-sync-contract.test.cjs` | 92 pass, 0 fail |
| `npm run test:pwa` | 3 pass, 0 fail |
| `npm run build` | Compiled successfully |
| `node -c "..\gas-live\Code.js"` | clean |
| `git diff --check` | clean |

GAS was not modified by either task. No deployment of any kind has been made from this branch.

## Suite growth across the work

852 (Task 7) → 991 (Task 8) → 1071 (Task 9) → 1254 (Task 10) → 1286 (Task 11).
