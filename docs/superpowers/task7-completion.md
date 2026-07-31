# Task 7 Completion Record — Offline Hydration of the App Shell

**Status:** Code complete and independently reviewed on both axes. **Deployment NOT performed** (still gated on explicit owner confirmation — unchanged from Task 6).

## Verdicts

Round 11 returned PASS on both axes and recommended shipping. Round 12 — run against the round-11 fixes, with both reviewers told what had changed — returned **FAIL on both axes**, with two BLOCKERs the earlier rounds had missed. Round 13 then failed again, on a BLOCKER introduced *by* a round-12 fix. That is the useful fact about this task: a PASS from a reviewer that has not seen the latest commit is not a verdict on it, and a fix is not finished until it has been reviewed as harshly as the defect was.

Fourteen review rounds ran. Every round from 4 onward surfaced a real defect the earlier rounds missed. The recurring shape, found in three separate forms, is worth carrying forward:

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
| `8d347a9` | fix: close the round-12 blockers and the offline hang |
| `c3cee78` | fix: decide a queued save's identity when the crew acts, not when it runs |
| `bfdb203` | fix: stop one dead request from wedging every shift-report save |
| `644e907` | fix: stop a timed-out save from appending a second row |
| `9b5cc10` | fix: release an unknown save outcome only on a real server answer |
| _(pending)_ | fix: make the release causal and delete the machinery that inferred it |

## Round 12 — what both PASSes had missed

**Quality (FAIL): 2 BLOCKER, 2 MAJOR, 4 MINOR.**

- The machine guard added in round 11 covered the *rows* write but not the *form* write. On a machine switch mid-save, `SegmentRecordView` still wrote the finished row's id into a form that now held the other machine's next ring — so the crew's next Save went out as `updateSegment` against a row that machine's sheet has never seen. GAS finds no match and no-ops, the local map matches nothing, and the ring and its surveyed chainage are lost with no error shown. `GroutRecordView` had the twin: `resetFormAfterSave()` outside the guard wiped measured Part A / Part B volumes typed for the new machine.
- Sharing one id was not enough to stop the duplicate shift-report row: `addShiftReport` appends without checking the id, and two saves in flight together both read a falsy `existingReport` and both sent `add`. Saves now run one at a time and each picks its action when it starts. The round-11 test had pinned the wrong half — equal ids, action unchecked — so it certified `addShiftReport` twice as correct.
- The machine-at-resolve check read a ref written during render, so it froze the moment the form unmounted. The machine switcher lives in the TopBar and is reachable from every tab, so submit → tap another tab → switch machine defeated it entirely. App now answers the question, because App never unmounts.

**Spec (FAIL): 1 MAJOR, 6 MINOR.** `indexedDB.open()` had no `onblocked` handler and no timeout, so a blocked upgrade (a second tab on an older `DB_VERSION` after a service-worker update) or the WebKit stall on iOS never settled. Every caller awaits it and `loading` is only cleared inside those callers, so the crew sat on the splash screen with the server payload already in memory. It now rejects, and the runner starts even when the database cannot be opened — otherwise a session that lost the open race had no automatic sync for its whole life.

The same review verified the domain-key vectors independently: `tools/sync-domain-vectors.json` matches both `src/offline/domainKey.js` and `makeSyncRecordKey_` in the out-of-repo GAS, and both suites assert against it. No drift. Rounds 13 and 14 re-verified this by hand, vector by vector, against the authoritative out-of-repo file.

## Round 13 — the fix that was worse than the defect

**Quality (FAIL): 1 BLOCKER, 2 MAJOR.** Serializing the shift-report saves (round 12's answer to the duplicate row) introduced a worse one. A queued save froze its **payload** when the crew acted but resolved its **row identity** — the id, and the append-versus-update decision — when the request finally started. Anything the crew did in between therefore changed which row their earlier edit landed in:

- change the date while a save is in flight, and the queued save minted a fresh id and appended a **second row for the first date** — the exact defect the queue existed to prevent;
- if the new date already had a report, the queued save adopted **that** row's id and overwrote the 31st's report with the 30th's content;
- with a machine switch instead of a date change, it sent an `updateShiftReport` to the old machine's sheet carrying an id that sheet has never seen, and GAS no-opped it away.

The edit serial had the same fault: sampled at execution, it counted edits made after queueing as already sent and cleared the dirty flag over them. And the bookkeeping was per-mount, so a nav tap and a return minted a second id for a report the sheet already had.

Everything except "has this id reached the sheet yet" is now captured when the crew acts. That one fact cannot be known earlier, and it is what decides append versus update.

**Spec (PASS, 7 MINOR)** — all consequences of the round-12 fixes: an unhandled `runNow()` rejection in exactly the session that starts the runner without a database; `refresh()`'s catch re-entering `openDb` and reporting "IndexedDB open timed out" for what was really a server or permission failure; an abandoned open's timer clearing a newer promise; and the network half of the hang still unbounded — a link that completes the handshake and goes quiet left "refreshing" up forever, which also **suppresses the snapshot-age strip**, so the crew is told data is coming instead of how old what they are looking at is.

## Round 14 — both reviewers found the same blocker independently

**Quality (FAIL): 1 BLOCKER, 3 MAJOR. Spec (FAIL): 2 MAJOR.** The blocker was the same on both axes, reached from different directions: round 13 moved the save chain to module scope so it would survive an unmount, but `apiCall` has no deadline of its own. One request that never answers — the same captive-portal / quiet-link failure the snapshot fetch had just been bounded against — therefore stalled **every** shift-report save for the rest of the session, across both machines and every date, with the button stuck reading "Saving…" and every time-bar auto-save silently swallowed. Moving the chain out of the component had removed the one escape that used to exist (navigate away and back). Fixed on both sides: one chain **per report**, so a dead request cannot block records it has nothing to do with, and a 45 s deadline on the save itself, after which the crew is told the outcome is unknown rather than being told nothing.

The other findings:

- **The own-write key was claimed for a payload the form no longer held.** Leave the report and come back while a save travels, and the form reloads from the stored copy — without the time bar that save is carrying. Claiming the key then made the view skip loading the row its own save produced, so the next save rebuilt its payload from the stale form and **erased the recorded time bar from the sheet**. Delay minutes gone from an official shift report, no error shown. The claim now also requires that nothing was reloaded or retyped since the payload was frozen. The cost is that a crew typing during the round trip sees their own row announced as a server copy — which is honest, because the arriving row genuinely lacks what they typed.
- **The 30 s snapshot ceiling was too tight for the real payload.** A `getData` response for one machine measures 463 KB in this worktree, and GAS burns several seconds before the first byte; at 100 kbps — ordinary underground — an honest transfer needs ~45 s. A 30 s ceiling would have turned a working link into a deterministic failure the crew could not raise, pinning them to the previous shift's snapshot. Now 90 s, which still bounds the never-settles case.
- The timeout now covers the body read (a portal that answers headers then stalls was reported as "cancelled"), `syncRunner`'s event trigger no longer raises an unhandled rejection in a session without a database, and the false claim that a caller's abort signal is what abandons a machine switch was corrected — nothing passes one; the request token does that.

Two round-13 fixes had shipped unpinned, and one test was tautological (it asserted that `ApiFailure`'s constructor kept its own arguments). Both are pinned now, and the earlier "input typed while a save is in flight" test — which the review showed had stopped discriminating — was replaced by two that state the sharper rule.

## Round 15 — the deadline that traded a wedge for a duplicate

**Both axes FAIL, same blocker again, and again it came from the previous round's fix.** The 45 s save deadline rejects the *wrapper*; it cannot cancel the request, because `apiCall` has no abort path. The request keeps travelling, `savedIds` records nothing, and the per-report chain is released — so the next time bar the crew added sent `addShiftReport` **again with the same id**, and GAS appends without checking ids. Two rows for one date and shift, the shift and its delay minutes double-counted, and on the auto-save path nothing appeared on screen at all. The quality review found a second shape of it: two updates in flight together, the older payload landing last and erasing a time bar recorded in between.

The server is what settles the question, so that is what the code now waits for. A timed-out save marks the report's outcome unknown; further writes to it are refused until a fresh snapshot has been seen, at which point either the row is there (so the next save updates it) or it never landed (so an append is correct again). The crew sees a standing notice rather than silence — the auto-save path previously said nothing whatsoever.

Also from that round: the own-write claim now tracks **everything the form displays**, not just typed edits — a ring recorded mid-save rewrites the derived Result without any typing, and claiming the key then let screen and sheet disagree on a report that gets printed. And "saving" is tracked per report, so a stalled save on the 30th no longer disables the button for the 31st.

## Round 16 — "the array changed" is not "the server answered"

**Both axes FAIL, blocker in the same place a fourth consecutive time.** Round 15's block was released by a counter incremented whenever the `shiftReports` prop changed identity — which is not the same fact as the server having answered. App re-mirrors that array on the offline cache pass, on every machine switch, and on this view's own optimistic writes, so **saving a different report released the block**; the counter was also per-mount while the block it guarded is module-scope, so any nav tap released it too. Either route led straight back to the duplicate row. A third: a snapshot fetched *before* the timed-out write reached the sheet proves nothing about where it ended up.

The view now receives when the **server** last answered (`serverSnapshotAt`, non-null only for `source === "server"`), and a block clears only when a snapshot fetched *after* the moment we gave up has arrived. The notice moved into the same module-scope, per-report state as the block itself — held in component state it vanished on a nav tap while writes were still being refused — and it now carries a button that actually re-reads the server, because the previous wording promised a recovery no code performed.

**What this costs, stated plainly** (the previous round recorded only the favourable half, which is the same fault it criticised the round before it for): while a report is blocked, every further time bar is refused and exists only in component state, so a nav tap or reload loses it. Two things bound that. `apiCall` uses plain `fetch` with no signal, which **rejects immediately on a genuinely offline device** — so an offline crew is never blocked; only a connection that completes and then goes quiet arms it. And the block is per report, so the rest of the shift's work continues on any other date or machine. It is still a real cost, and it is the reason Tasks 8 and 9 are gated to ship with this one.

## Round 17 — stop inferring, and delete what was inferring

**Both axes FAIL, fifth consecutive round with the blocker in this one path, and again carried by the previous round's fix.** Round 16 released the block when a server snapshot's `fetchedAt` was later than the give-up moment — but `repository.refresh` stamps `fetchedAt` when the response *arrives*, not when the request was *issued*. The launch snapshot is designed to be in flight while the crew works (the cache pass clears `loading` precisely so the app is usable), so a GET issued at launch, which read the sheet seconds later, could land after a 45 s give-up and release the block having never seen the write. Next time bar: `addShiftReport` again, same id, two rows. The code's own comment two lines above stated the rule it did not implement.

Both reviewers reached the same conclusion independently, and it is the right one: **every round has answered "did my row reach the sheet?" by inferring from a proxy — a prop identity, a mount-scoped counter, an arrival timestamp — and each proxy was a different fact from the one needed.** So the inference is gone. The only fetch in the app whose ordering is knowable is one the crew issues *after* we gave up, from the notice itself. That check is now the sole releaser:

- deleted: `serverSnapshotAt` (App and view), `serverSnapshotAtRef`, `settledByServerSince`, the `Date.parse` comparison — and with them the clock-step sensitivity, the cross-machine bleed (a TBM2 snapshot could satisfy a TBM1 block) and the re-arm on every machine switch;
- deleted: `editSerialRef`, which decided nothing — every bump of it also bumped `formSerialRef`;
- the notice now says what the crew must not do ("อย่าเพิ่งออกจากหน้านี้"), because bars added while blocked live only in component state.

**The seam that hid two of these blockers is now tested.** `serverSnapshotAt` and `onRefresh` existed only between App and this view, every view test hand-fed them, and nothing asserted App supplied them — the same shape as the round-16 defect, where the view's tests all passed while App fed it the wrong fact. `appDataFlow.test.jsx` now drives the real App: it arms a block, asserts the notice, clicks the check, and asserts it reached the repository and unblocked the report. Removing the prop from App fails it.

## Test evidence (at the round-17 commit)

- `npm test -- --watchAll=false --runInBand` → 66 suites / 835 tests pass
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
- **Files outside Task 7's list that were also modified**, for completeness: `src/offline/repository.js` (the `setSyncMetaValue` passthrough Task 7 Step 3 requires, the `cacheError` branch that keeps a server-fresh payload usable when the cache write fails, and the guarded catch that stops an unopenable database masking a network fault), `src/offline/mutationStore.js`, `src/offline/db.js` (Task 3's file — the `onblocked`/timeout fix), `src/offline/apiTransport.js` (Task 4's file — the snapshot timeout) and `src/offline/syncRunner.js` (Task 5's file — the unhandled-rejection fix on its event trigger). Five new test files were added outside the list as well.
- **`ShiftReportView` keeps save bookkeeping in module scope** — the draft id, the set of ids known to be on the sheet, and the save chain, keyed per report (`machine|date|shift`), with a test-only reset export. It lives outside the component because a save outlives the form that started it: any nav tap unmounts the view while the request is still travelling, and per-instance state let the remounted form mint a second id for a report the sheet already had. **Task 8 removes this** — the mutation queue is the durable, idempotent version of exactly this bookkeeping, and the module-level state should be deleted when writes move onto it, not carried alongside it.
- **`ShiftReportView` gained user-facing surface** — the server-copy notice with its two-step discard confirmation, a standing per-report notice when a save's outcome is unknown (with a button that re-reads the server), and three alerts: a timed-out save, a save refused because an earlier outcome is still unknown, and a save that landed after a machine switch. It follows from the mid-edit hazard Task 7 creates and matches the design's "never silently overwrite" posture, but the discard/confirm pattern overlaps what Task 10's Sync Center will own. **Task 10 should absorb it, not duplicate it.**

## Deferred follow-ups (task chips filed)

- Validate unknown sync payload keys per entity (carried from Task 6).
- Close `PrepTaskModal` on a machine switch — an open modal keeps editing the previous machine's task.
- **A shift report whose row is deleted from the sheet by hand locks into `updateShiftReport`.** `savedIds` records that an id reached the sheet and nothing removes it, so if the row is later deleted or overwritten directly in Sheets, every later save sends an update GAS cannot match, no-ops silently, and the crew is told "บันทึกสำเร็จ" while nothing is written. The app has no shift-report delete, so this needs someone editing the sheet. **Task 8 removes it structurally** — the mutation queue keys on `requestId` and version rather than on a client-side memory of what was sent.
- **Deletion propagation has no owner.** An empty server collection no longer clears local state (`App.jsx`: `if (data.issues.length)`, `if (data.machineProgress)`, `mirrorInst`'s `!rows.length`), so deleting the last issue on device B leaves device A showing it forever, labelled server-confirmed. The trade is deliberate — `normalizeServerData` maps an absent key to `[]`, so an older GAS deployment or a partial `doGet` is indistinguishable from a real deletion, and losing a field record outranks showing a stale one — but Task 9's Steps 4–5 never mention restoring it. It needs to be added there or it ships as-is.

## Promotion gate — do not deploy between Task 7 and Task 9

Tasks 2 and 7 are what make the app openable and usable offline, which makes a pre-existing hole reachable for the first time: a **non-empty** server response still replaces the localStorage-primary collections wholesale (`App.jsx`, the `serverAuthoritative` branch), so an issue or daily report created offline whose `apiCall` never landed is destroyed the first time the server answers. Offline reads are new; durable offline writes are not — they arrive with the mutation queue (Task 8) and legacy reconciliation (Task 9).

Shipping Task 7 on its own would therefore contradict the design's "offline writes survive normal application and device-browser restarts". Deployment is already gated on explicit owner action, so this is a sequencing constraint rather than a defect — but it belongs in Task 12's runbook as a promotion gate, not only in a code comment: **Tasks 8 and 9 go out with Task 7, or none of them do.**

## Carry-forward notes for Tasks 8–12

- Task 8's mutation queue replaces the direct `apiCall` in these three forms. When it does, the draft id, the edit serial and the machine-at-submit comparison must move into the queued mutation rather than being dropped: the queue makes the write durable, but the window between "payload built" and "row applied" gets longer, not shorter.
- The Shift Report `Result` block intentionally prefers the ring-derived figure over a stored one (owner-confirmed). A correction has to be made against the ring records; typing over the total does not survive the next form load, and the code comment at `ShiftReportView.jsx` says so.
- `App.jsx` gates rows on `rowsMachine`; any new machine-scoped collection added later must join that gate or it will leak across a switch.
- **The 90 s snapshot ceiling is reasoned, not measured.** It comes from the 463 KB payload in this worktree and an assumed ~100 kbps floor. Task 12's matrix measures POST latency on a slow network but has no row for the GET, so nobody has yet timed a real `getData` from underground. Measure it there and adjust; a deadline that resets on progress would be strictly better than any fixed number.
- **A timed-out save is genuinely ambiguous, and the app now says so instead of guessing.** The legacy `addShiftReport` is not idempotent and the request cannot be cancelled, so a save that gives up may still land. Further writes to that report are refused until the crew presses "ตรวจสอบกับเซิร์ฟเวอร์"; that fetch is issued after the give-up, so what it shows is causally meaningful, unlike any snapshot the app fetched on its own. **A residual window remains and cannot be closed here:** a write still in flight can land after the check has read the sheet, so a check that finds no row and an append that follows can still produce a duplicate. Nothing available to Task 7 can rule that out — the write is neither idempotent nor cancellable. Task 8's queue removes the ambiguity outright (a resubmitted `requestId` returns the original result), and when it lands, the block, the notice and the check should all be deleted rather than kept alongside it.
- **Three wire deadlines now exist and only one is measured**: 15 s sync POST, 45 s shift save, 90 s snapshot GET. Task 12's matrix has a row for timing the last two on a real underground link.
- **`SegmentRecordView` and `GroutRecordView` have no deadline at all.** The same never-answering request leaves their submit button reading "Saving…" for the rest of the mount, and the excavation times, soil type and head-level readings are lost if the crew navigates away. Pre-existing and untouched by Task 7 — adding a deadline there is riskier than it looks, because those submits carry base64 photographs and a duplicate ring would be appended the same way — but it is the identical fault the shift-report deadline was added for, and Task 8's queue should cover all three together.
