# Task 7 Completion Record — Offline Hydration of the App Shell

**Status:** Code complete and independently reviewed on both axes. **Deployment NOT performed** (still gated on explicit owner confirmation — unchanged from Task 6).

## Verdicts

Round 11 returned PASS on both axes and recommended shipping. Round 12 — run against the round-11 fixes, with both reviewers told what had changed — returned **FAIL on both axes**, with two BLOCKERs the earlier rounds had missed. That is the useful fact about this task: a PASS from a reviewer that has not seen the latest commit is not a verdict on it.

Twelve review rounds ran. Every round from 4 onward surfaced a real defect the earlier rounds missed. The recurring shape, found in three separate forms, is worth carrying forward:

> An effect that resets user-editable state, keyed on a prop that `App.jsx` re-mirrors with a **new array identity on every snapshot**. Before Task 7 the app only ever mirrored once, on load; now the cache pass, the server pass and every machine switch each land a fresh identity while the crew is typing. A reset keyed on `segmentRecords`/`shiftReports` therefore fires mid-edit and wipes typed manpower, ring numbers, chainage and grout volumes — none of which have an auto-save to recover from.

A systematic sweep of every effect in the view layer established that only `ShiftReportView`, `SegmentRecordView` and `GroutRecordView` had it.

## Commit trail (application commits, oldest first)

| SHA | Summary |
|---|---|
| `6be4121` | feat: hydrate app from offline snapshots |
| `b7dfaa1` | fix: make offline hydration actually reach the app |
| `733ac04` | fix: stop the hydration fixes from eating local data |
| `82c38ee` | fix: close the remaining offline data-loss paths in hydration |
| `44f110b` | fix: signal the machine-switch window and name the real fault |
| `758219f` | fix: reset the whole record form and pin the rules that guard data |
| `6735e70` | fix: reset the grout key segment and pin the guards that matter |
| `44ac67a` | test: pin the reset fields and guards that were only assumed |
| `9916c08` | fix: stop the shift selector wiping the open segment record |
| `0285c99` | fix: stop a landing snapshot wiping the shift report mid-edit |
| `18b5957` | fix: never load a server copy over a shift report being filled in |
| `f00adbb` | fix: reset the shift report on a machine switch |
| `020f41f` | fix: keep input typed while a save is in flight |
| `43024a2` | fix: stop a save from writing into the wrong report or machine |
| _(pending)_ | fix: close the round-12 blockers and the offline hang |

## Round 12 — what both PASSes had missed

**Quality (FAIL): 2 BLOCKER, 2 MAJOR, 4 MINOR.**

- The machine guard added in round 11 covered the *rows* write but not the *form* write. On a machine switch mid-save, `SegmentRecordView` still wrote the finished row's id into a form that now held the other machine's next ring — so the crew's next Save went out as `updateSegment` against a row that machine's sheet has never seen. GAS finds no match and no-ops, the local map matches nothing, and the ring and its surveyed chainage are lost with no error shown. `GroutRecordView` had the twin: `resetFormAfterSave()` outside the guard wiped measured Part A / Part B volumes typed for the new machine.
- Sharing one id was not enough to stop the duplicate shift-report row: `addShiftReport` appends without checking the id, and two saves in flight together both read a falsy `existingReport` and both sent `add`. Saves now run one at a time and each picks its action when it starts. The round-11 test had pinned the wrong half — equal ids, action unchecked — so it certified `addShiftReport` twice as correct.
- The machine-at-resolve check read a ref written during render, so it froze the moment the form unmounted. The machine switcher lives in the TopBar and is reachable from every tab, so submit → tap another tab → switch machine defeated it entirely. App now answers the question, because App never unmounts.

**Spec (FAIL): 1 MAJOR, 6 MINOR.** `indexedDB.open()` had no `onblocked` handler and no timeout, so a blocked upgrade (a second tab on an older `DB_VERSION` after a service-worker update) or the WebKit stall on iOS never settled. Every caller awaits it and `loading` is only cleared inside those callers, so the crew sat on the splash screen with the server payload already in memory. It now rejects, and the runner starts even when the database cannot be opened — otherwise a session that lost the open race had no automatic sync for its whole life.

The same review verified the domain-key vectors independently: `tools/sync-domain-vectors.json` matches both `src/offline/domainKey.js` and `makeSyncRecordKey_` in the out-of-repo GAS, and both suites assert against it. No drift.

## Test evidence (at the round-12 commit)

- `npm test -- --watchAll=false --runInBand` → 66 suites / 809 tests pass
- `npm run test:gas-sync` → 92 pass / 0 fail
- `npm run build` → Compiled successfully (build output restored with `git checkout -- build/`; the build artefact is not committed — Vercel builds from source)
- `node --check ../gas-live/Code.js` → OK
- `git diff --check` → clean

No GAS change was made during Task 7 — the backend is untouched since Task 6 converged (`gas-live\Code.js` last modified 2026-07-30 12:32, before this task started). Hashes recorded so later tasks can prove the same:

- `gas-live\Code.js.pre-pwa-sync` — SHA256 `EBD0E1D13B8A56AC828ECB20780F6110F652BB6D44F5BDD720202EA7855C9AAF` (the pre-sync backup, verified unchanged, never overwritten)
- `gas-live\Code.js` — SHA256 `1BA0E16444BE983B0D171CCCB07E24EFC2F2FDA261B2DA0682F090619BC8CF40` (Task 6 output, the state reviewed and gated for deployment)

## What Task 7 delivered

- `useOfflineData(machine)` hydrates from the IndexedDB snapshot first and then from the server, with a `serverSettled` ordering guard so a slow cache read cannot overwrite fresher server data, and a request token so a machine switch mid-fetch discards the superseded response.
- `App.jsx` consumes the hook, gates rows behind `rowsMachine`/`rowsReady` so no view is ever handed the previous machine's records, keeps localStorage-primary collections server-only, and shows an `offlineNotice` strip describing provenance and staleness.
- Because the app is now interactive during the server fetch, the three record forms were hardened against snapshots landing mid-edit: content-keyed report loading, a dirty flag with an edit serial, an own-write key, one draft id per report being composed, and a machine comparison at both the synchronous reset and the asynchronous save resolve.

## Mutation-testing note

Three round-10 regression tests stopped discriminating once round 11 added the own-write key: they passed against the reverted fix. Every test added in `43024a2` was checked against the mutated source first and confirmed to fail — same-data-different-key-order, the own-write banner, both machine guards, the duplicate row, and the draft-id reset. A test that has never been seen to fail pins nothing.

## Deployment — NOT DONE, requires explicit owner action

Unchanged from Task 6. Nothing has been pushed to Vercel and no `clasp push`/`redeploy` has run. The rollback path and the smoke-check restriction (never use production engineering records) still stand as recorded in `task6-completion.md`.

## Recorded decisions (deviations, taken deliberately)

- **Task 7 Step 4 says "do not clear arrays at machine switch before cached data has loaded"; the code does clear them.** `App.jsx` exposes `EMPTY_ROWS` for the four machine-scoped collections from the moment `activeMachine` changes until the new snapshot lands. Showing machine A's rows under machine B's label is not cosmetic here: `SegmentRecordView`'s prefill derives the next ring number and chainage from the last row it can see, so the crew would be handed machine A's next ring for machine B. This reproduces pre-Task-7 behaviour and is pinned by `appDataFlow.test.jsx`.
- **`source:"empty"` can be returned while `data` still holds the previous machine's records.** Blanking `data` instead would make `data.machine === activeMachine` and flip `rowsReady` true over empty arrays, which is the prefill hazard above. The hook now also returns `dataMachine`, so a consumer can tell whose data it is holding; App already made the equivalent check before mirroring.
- **Three files in Task 8's file list were modified** (`SegmentRecordView`, `GroutRecordView`, `ShiftReportView`). Forced by Task 7: hydration now lands two snapshots per load plus one per machine switch, each a fresh array identity, so reset effects keyed on those props fire mid-edit. **No write was routed through the mutation queue** — all three still call `apiCall`, so no Task 8 work was done early (independently verified in round 13: none of the three imports `repository`, `mutate` or `useOffline`). Task 8 Step 4's "preserve their existing form reset behavior" now means preserving the guards listed above.
- **Files outside Task 7's list that were also modified**, for completeness: `src/offline/repository.js` (the `setSyncMetaValue` passthrough Task 7 Step 3 requires, plus the `cacheError` branch that keeps a server-fresh payload usable when the cache write fails) and `src/offline/mutationStore.js`. Four new test files were added outside the list as well.
- **`ShiftReportView` gained user-facing surface** — the server-copy notice with its two-step discard confirmation. It follows from the mid-edit hazard Task 7 creates and matches the design's "never silently overwrite" posture, but the discard/confirm pattern overlaps what Task 10's Sync Center will own. **Task 10 should absorb it, not duplicate it.**

## Deferred follow-ups (task chips filed)

- Validate unknown sync payload keys per entity (carried from Task 6).
- Close `PrepTaskModal` on a machine switch — an open modal keeps editing the previous machine's task.
- **Deletion propagation has no owner.** An empty server collection no longer clears local state (`App.jsx`: `if (data.issues.length)`, `if (data.machineProgress)`, `mirrorInst`'s `!rows.length`), so deleting the last issue on device B leaves device A showing it forever, labelled server-confirmed. The trade is deliberate — `normalizeServerData` maps an absent key to `[]`, so an older GAS deployment or a partial `doGet` is indistinguishable from a real deletion, and losing a field record outranks showing a stale one — but Task 9's Steps 4–5 never mention restoring it. It needs to be added there or it ships as-is.

## Promotion gate — do not deploy between Task 7 and Task 9

Tasks 2 and 7 are what make the app openable and usable offline, which makes a pre-existing hole reachable for the first time: a **non-empty** server response still replaces the localStorage-primary collections wholesale (`App.jsx`, the `serverAuthoritative` branch), so an issue or daily report created offline whose `apiCall` never landed is destroyed the first time the server answers. Offline reads are new; durable offline writes are not — they arrive with the mutation queue (Task 8) and legacy reconciliation (Task 9).

Shipping Task 7 on its own would therefore contradict the design's "offline writes survive normal application and device-browser restarts". Deployment is already gated on explicit owner action, so this is a sequencing constraint rather than a defect — but it belongs in Task 12's runbook as a promotion gate, not only in a code comment: **Tasks 8 and 9 go out with Task 7, or none of them do.**

## Carry-forward notes for Tasks 8–12

- Task 8's mutation queue replaces the direct `apiCall` in these three forms. When it does, the draft id, the edit serial and the machine-at-submit comparison must move into the queued mutation rather than being dropped: the queue makes the write durable, but the window between "payload built" and "row applied" gets longer, not shorter.
- The Shift Report `Result` block intentionally prefers the ring-derived figure over a stored one (owner-confirmed). A correction has to be made against the ring records; typing over the total does not survive the next form load, and the code comment at `ShiftReportView.jsx` says so.
- `App.jsx` gates rows on `rowsMachine`; any new machine-scoped collection added later must join that gate or it will leak across a switch.
