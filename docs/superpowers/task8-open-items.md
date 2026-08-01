# Task 8 — open items at the end of the client work

Everything here is known, reproduced, and deliberately not fixed inside Task 8. Each says why, and
what closing it would take. Written down because two of them were found by review, fixed badly, and
had to be withdrawn — the record is what stops that happening a third time.

## 1. Deleting one row of a ring makes the other one uneditable (server-side) — BLOCKS THE PILOT

**Reproduced against the real `handleSyncMutation_`. This one must be fixed and contract-tested on
the deployment that opens the gate.** A crew that hits it has a bricked ring number; ring numbers
here are sequential and never skipped, so it is a ring the machine will actually reach. It is listed
as a prerequisite under Task 12 in `CLAUDE_HANDOFF.md`.

`gas-live/Code.js` tombstones the ring KEY on a delete, not the row: `applySyncMutation_` then
answers `SYNC_RECORD_DELETED` to every later UPDATE on that key. A ring legitimately carries two
rows — the cache keys per row and five views run `deduplicateRecords` for exactly that reason — so
deleting one makes every later correction of the other terminal. It parks at the head of that ring's
domain and blocks what is queued behind it. The crew sees their correction on screen, the sheet keeps
the old value, and the status strip counts it as stuck.

This worked before Task 8: the legacy write merged the row and cleared the flag.

**Do not work around it in the client.** Commit `8afd19d` rewrote such an update into a create,
because the server's own message says "recreate it instead of updating". That was worse and was
reverted in `77dcb9c`: a create merges onto an existing row only when the metadata is ALIVE, so
against a tombstone GAS appended a second row with the same record id and blank fields — duplicate
ids, a blanked photo link, and the sheet still holding the old value. `operation` is also a
row-identity input to the local snapshot merge, so the disguise let an edit overwrite a neighbour.

**And the remedy the app itself prescribes cannot run.** After the refusal the ring's domain has a
terminal head: `validation_error` is not terminal for ORDERING, so `domainHeads` keeps it as head
and `isClaimable` never claims it again. The crew then does what the message tells them — delete the
row and record it again — and neither the delete nor the new record ever leaves the device, while
`deletePending` takes the deleted row off screen (see 3b) and the new one appears beside it. The
data log then shows precisely the corrected state they intended; the sheet holds the original,
uncorrected row. Executed end to end. It is counted (`3 รายการติดค้าง`), and it is a regression
from pre-Task-8 behaviour, where the legacy write merged the row and cleared the flag.

**The fix is in `gas-live/Code.js:1327`**: tombstone the row rather than the key, or revive the key
when a create arrives with a matching base. It needs the pre-sync backup, a contract test in
`tools/gas-sync-contract.test.cjs`, and a deployment — all of which this task is gated from.

## 2. The server does not check that a `domainKey` matches the row it names

`validateSyncEnvelope_` compares the submitted key against the payload (`Code.js:607`) but never
against the stored row's own key. An update carrying a changed ring is accepted, and both keys end up
with live metadata — so the real ring, when the machine reaches it, is refused as `SYNC_META_ORPHAN`,
terminally.

No shipped path reaches it: the data logs no longer offer identity fields, the shift report's date
and shift select which report is loaded rather than rename it, and the segment record form passes
`identity` so the envelope refuses first. But the client guard is the only defence, and it is opt-in
per call site. Task 9 adds call sites to the same API.

## 2a. A record id is not unique on the sheet, and the server resolves by it alone

**Reproduced against the captured payload and read in the deployed source.**

`data.json` carries SEVEN record ids spread over sixteen segment rows, and every pair is on a
DIFFERENT ring — `seg_1a2b3c4d5e6f` alone sits on P37, P41, P71 and P81. On the client this broke
three separate rules (all closed now: `entityKeyForRecord` takes the domain key, `applyOptimisticRow`
matches on it, and `recordFor` demotes a row only on a true record collision). **On the server it is
still true.**

`readRowById_` (`Code.js:874`), `updateRow` (`Code.js:1371`) and the delete path all scan for the
first row whose `id` matches and stop there. So an update of P71 posts `recordId:
seg_1a2b3c4d5e6f`, GAS writes P37's row, and `SyncMeta` advances `segment:TBM1:P71:Permanent`. The
crew's correction lands on a ring they were not looking at, and the version the client then holds
describes a row the server never touched.

This is NOT item 2 — that is a client sending a CHANGED ring on a row whose identity is otherwise
sound. This is two rows the sheet itself cannot tell apart.

`dedupSegmentIds()` (`Code.js:1396`) repaired TBM1's sheet by hand on 2026-07-18 and is presumably
why prod is clean today. It is not an invariant:

- it is manual — nothing calls it, it is run from the Apps Script editor;
- it is segments-only — there is no equivalent for Grouts, SecondaryGrouts or ShiftReports;
- `dedupSegmentIdsTBM2` is marked "เผื่อ" and may never have run;
- `appendRow` (`Code.js:1366`) enforces no uniqueness at write time;
- item 1 above has GAS appending a duplicate id itself.

A repaired sheet is a moment, not a guarantee. The client no longer relies on one; the server still
does. Belongs with item 1 on the deployment that opens the gate.

**The client refuses this in ONE view.** `SegmentRecordView` now refuses a save whose record id names
more than one row, because it would land on a ring the crew is not looking at. `SegmentDashboardView`
queues its edits and deletes by record id with no such check — and those are the paths that can reach
all sixteen duplicate-id rows on the captured sheet today. The deployment that closes this item
should know both call sites exist.

## 3. Two rows of one ring cannot both hold a queued edit — CLOSED

The optimistic entity was keyed per DOMAIN, so two records sharing a ring shared one local copy: the
second queued write overwrote the first, and the snapshot's key list ended up naming that single key
twice — the same record rendered twice while the other was deleted. It is keyed per record now
(`entity:optimistic:<domainKey>:id:<recordId>`), with a DB_VERSION 3 migration that re-keys existing
rows from the record id their payload already carries and drops the snapshot cache, which named the
old keys.

Left open here for two rounds, and both of the patches attempted in the meantime made it worse — the
lesson being that a key that cannot express the domain's real shape produces a new defect for every
rule written on top of it.

## 3a. Which views deduplicate, and which do not

The reasoning "two rows on one ring is a state the data logs dedupe for" is true of SEGMENTS only.
`deduplicateRecords` runs in `ExecutiveDashboardView`, `RouteScheduleView`, `SegmentAnalysisView` and
`SegmentDashboardView`, and all four key on `ringNo`.

- **shiftReport** — **CLOSED for `PerformanceView`**, which now counts one shift per (date, shift)
  and counts its time bars by the MINUTES THEY OCCUPY within each category, not per bar. It was
  counting each row as a shift of its own: 24 hours of availability for a 12 hour shift, and every
  delay bar present in both counted twice, on a page that gets printed for the owner. Two attempts
  before this one were wrong, both measured against the captured production payload:
  - **Keep the first row** loses work — the later row of 2026-04-09 Day carries an hour of
    `Locomotive / Rail System` (14:00–15:00) that the first does not.
  - **Match bars by category, window and label** collapsed NOTHING. The duplicated rows are two
    transcriptions of one shift by a crew who could not see the first, so they agree on when the
    machine stood still and on nothing else: 2026-04-09 Day carries `Clean Area 08:00-17:00` on both
    rows with labels differing by one space, and 2026-03-02 Night records the same rail work as
    19:00–20:00 and as 19:00–20:30. It printed **18.0 ชม. of delay inside a 12 hour shift, and
    150%** — worse than either of the states it replaced.

  The rule is a TIME BUDGET, not a claim about activities: the donut divides 720 minutes per shift,
  and minutes counted twice under one category cannot fit in it. It is not "one category is one
  activity" — **`Other 1`–`Other 4` are free-text catch-alls, and two genuinely concurrent
  activities can share one**. The payload has exactly that, and it is the one place the rule
  collapses minutes that are NOT a duplicate:

  ```
  2026-03-07 Day (shift_1772865588115, a SINGLE row) — Other 1: per-bar 319 → coverage 259
     11:24-12:24  "พักกลางวัน"     ← the lunch break
     10:00-12:24  "ขนดินขึ้น"       ← hauling muck, running through it
  ```

  60 minutes of Support, and the number after is still the right one: 319 minutes of one category
  inside a 12-hour shift double-counts an hour the shift only had once. Recorded because it is the
  exception to the sentence above, and because "measured against the payload" is the claim that
  produced two bad fixes already.

  **It does not bound the delay GROUP.** Two different categories over the same minutes still add,
  so `Delay รวม` can exceed the shift — and does, unchanged by any of this:

  ```
  2026-03-15 Day    delay 916 min  = 15.3 h
  2026-04-04 Night  delay 1020 min = 17.0 h
  ```

  (The payload holds a THIRD duplicated shift, 2026-04-08 Day, not named above because it costs
  nothing: its second row's only bar is `Clean Area 19:45-06:00` — night hours filed under a Day
  shift, which clamps to zero minutes either way.)

  It does not print above 100% on today's data — the worst group across every filter state of the
  captured payload is 85.4% (`daily 2026-03-30`, 1230 min over two shifts). **That is a measurement,
  not a bound.** The mechanism usually saving it is that the finest filter is a DATE
  (`useGlobalFilter`'s `daily`), which is normally two shifts and so divides by 1440 — but 3 of the
  payload's 49 dates carry only one shift (2026-02-25 Day, 2026-03-02 Night, 2026-04-25 Day), and
  those divide by 720. A lone shift with 2026-04-04 Night's pattern prints `141.7% ของเวลาทั้งหมด`.
  Nothing else dedupes shift reports.
  - **Latent:** a row with a blank `date` keys as `__<shift>`, so every undated row of one shift name
    collapses into one. The captured payload holds none, and `filterByState` does not filter them out
    in the default mode, so this is waiting on the first blank-dated sheet row.
- **grout / secondaryGrout** — nothing dedupes; `GroutDashboardView`'s average volume and ratio are
  `sum / length`, so a second row shifts both. Still open.
- **segment** — the dedupe fires and prefers the Completed sheet row over an In Progress local one,
  so a newly recorded ring can be invisible in the data log while the strip says it is queued.

**The earlier claim here — "the queue does not create the duplicate rows, the sheet does" — was
wrong**, and it is why the consequence went uncosted for two rounds. The queue supplies the second
row on its own, with one row on the sheet and no migration involved: a shift report created on a
fresh install with no link is refused when the link returns (GAS answers `conflict` against the row
already there), `UNRESOLVED_STATUSES` includes `CONFLICT`, so `preserveLocal` re-injects the refused
copy into every merge — deliberately, since there is no conflict UI until Task 10 and the crew must
be able to see their own work. Two rows for one shift, from then on.

## 3b. A delete queued behind a stuck head still takes its row off screen

`unresolvedByRecord` holds the NEWEST unresolved mutation per record, not the queue head. So when a
domain already has a terminal head, a delete queued behind it — which `claimDueMutations` will never
post — still hides its row from the refreshed list. The ring is off every screen on this device and
still on the sheet, and the crew has affirmative feedback for a destructive action that did not
happen.

**This is not a corner: it is the second half of item 1's remedy.** The prescribed fix for a ring
whose neighbour was deleted is delete-and-re-record, and behind that terminal head the delete hides
the old row while the create adds the new one — so the screen shows exactly the corrected state
while nothing at all has left the device. Reproduced end to end.

It is counted (`errors` plus `blocked`), so the strip is not lying about the total, and it needs a
stuck head to reach — which today means item 1. Fixing it properly means the tombstone asking whether
its mutation is actually the claimable head, which is a queue question the snapshot merge currently
cannot ask. Task 10 owns both the head and the resolution UI.

## 3c. Deletes are not "visible as pending tombstones to repository reads"

Step 4's wording. `deletePending` filters the row out of the merge instead of marking it, so a reader
cannot tell a deleted-pending row from an absent one without joining the mutations store itself.
Task 10 can reconstruct it; nothing in Task 8 needs it. Recorded because it is a deviation from the
written contract, not an oversight.

## 3d. A refused record's STORED row still reads `syncStatus: "pending"`

`saveConflict` and `updateMutation` move the mutation to `conflict`, `validation_error` or
`permanent_error` and never rewrite the optimistic entity's `payload.syncStatus`, which was stamped
`pending` when the write was queued. `writeServerSnapshot` papers over it — the merge overlays the
mutation's live status — so anything read through a refresh is right. `readServerSnapshot` is not:
a relaunch, and every offline load, hands back the stored payload, and a refused record claims to be
on its way indefinitely.

Nothing in Task 8 renders it (the status strip counts the queue, not the row). Task 10's per-row
badges read exactly this field, so it has to be closed before they can be trusted — and any rule
written on the refusal statuses must not depend on the stored value until it is. The dedupe in 3a
deliberately does not.

## 3e. After a DB upgrade the dashboards show progress over an almost-empty ring list

The rebuilt snapshot keeps every singleton the old one held — including `machineProgress`, which is
server-derived — while its row lists hold only what the queue is carrying. So until the first
refresh the Executive Dashboard reports the real ring and chainage above a list containing the
crew's queued rings and nothing else.

Dropping `machineProgress` instead would report a machine that has bored nothing, which is further
from the truth, and the strip already says "แสดงข้อมูลที่บันทึกไว้" with no timestamp, because
`fetchedAt` is null. Recorded because it is a state no screen names explicitly.

## 3f. A full-size photo still cannot reach the sheet over a tunnel link

`SYNC_POST_TIMEOUT_MS` is 90 s, argued from the same 100 kbps the read ceiling uses — about 1.1 MB.
Every field of an envelope except `imageBase64` is bounded by GAS's own 50 000-character cell limit,
so an ordinary ring or shift report is a few tens of kilobytes and lands comfortably. `imageBase64`
is not bounded, because it goes to Drive rather than into a cell: `handleFileUpload` reads the file
whole with `readAsDataURL` and never resizes, so a phone photo rides inside the envelope at some
megabytes and takes minutes on that link.

It times out, is classified retryable, and retries forever at the head of its ring's domain while the
strip reports it as still on its way. Raising the ceiling further does not fix it — nothing bounded
would, and the lease has to stay above whatever the ceiling is. **The fix is resizing at capture**
(`utils/helpers.js`, `handleFileUpload`), which is outside Task 8's file list and changes a form the
plan says to preserve. Before Task 8 the same save went through `apiCall` with no deadline at all,
so the queue is what made the failure deterministic rather than merely slow.

## 3g. A claim abandoned mid-post waits out the whole lease, and nothing ticks

`SYNC_LEASE_MS` is 120 s, so a write whose device was killed while posting is reclaimable 121 s
later rather than 31 s. That would be unremarkable if anything woke the runner, but its only
triggers are `start()`, `online`, `focus`, `visibilitychange`, and the `runNow()` that follows each
save — there is no periodic tick. A crew who reopens the app inside the window, then leaves it
foregrounded and idle, has no event left to fire: the write sits `syncing` until they switch away
and back or record the next ring. Measured: reopening at 60 s posts nothing even after
`online` + `focus` + `runNow`; at 121 s it posts.

Nothing is lost, and the strip counts it under `syncing` — "on its way", which it is, just not yet.
The hole is pre-existing (the same shape existed at 30 s); the lease widened it 4×, in exchange for
a write path that can deliver a 60 s upload at all. Task 10 owns the Sync Center and its manual
"sync now", which closes it properly; a periodic tick would close it sooner.

## 3h. A ring whose sheet cell is spelled differently from the form's normalisation shows twice

`SegmentRecordView` sends `String(ringNo).trim().toUpperCase()`; `SegmentDashboardView`'s edit path
deliberately does not normalise, and `reidentifies` normalises only for its comparison, so the
envelope is accepted. If the sheet cell holds `" p643 "`, the envelope's domain key is
`segment:TBM1:P643:Permanent` and the row rebuilds as `segment:TBM1: p643 :Permanent`, so the queued
copy is appended beside the row it was meant to replace.

Zero of the 373 rings in the captured payload are spelled dirty, the write still posts, the server
resolves by id so the sheet ends correct, and the duplicate clears on the first refresh after the
write lands. It is also not a regression: before the row identity became domain-aware, the screen and
the relaunch showed one row while the refresh showed two — now all three agree with each other.
Normalising in the dashboard's envelope would fix it, and would change a form Step 4 says to
preserve, on a state no live row is in.

## 3i. The one grout row with a blank id can no longer be edited or deleted

`requireMutationEnvelope` refuses an empty `recordId`, so `GroutDashboardView` reports
`อัปเดตข้อมูลล้มเหลว: Mutation requires recordId`. The legacy `apiCall` path resolved it as the
first blank-id match; the queue cannot, because a mutation has to name the record it is about.

One row of 338 in the captured payload (P96). It fails loudly and loses nothing — but it is a
behaviour change Task 8 makes, and this document is meant to be the complete list.

## 3j. `recordFor`'s key shape changed without a DB_VERSION bump

A snapshot written by an earlier commit on this branch carries `row:N` for every duplicate-id row
after the first; an offline edit of such a row then appends rather than replaces, until the first
`getData` rewrites the list.

Unreachable today: nothing on this branch has been deployed and the promotion gate binds Tasks 7, 8
and 9 to ship together, so no device holds a snapshot from any of these commits. **It stops being
free the moment anything here is deployed ahead of Task 9** — bump `DB_VERSION` first if that
happens, since the migration already rebuilds the key lists from the surviving rows.

## 3k. `reconcileLegacyStage` is written, tested and wired to nothing

`legacyMigration.js` exports it, its own tests call it eight times, and no production path does:
`OfflineProvider` wires `stageLegacyLocalStorage` and stops there. It is a Task 7 plan deliverable
that was built and not connected.

It is not inert if it is ever connected: it writes `conflicts` rows with
`reason: "legacy_local_difference"`, and `getSyncCounts` counts every open conflict — so wiring it
would put a number in the status strip that no screen can resolve until Task 10. Predates Task 8 and
untouched by it; recorded because it is the one piece of production code on this branch with no
caller, and a future reader should know it was parked rather than missed.

## 3l. A daily report with a blank machine has a different identity on each machine (Task 9)

`dailyReport` and `prepTask` are machine-keyed in `makeDomainKey` but returned project-wide by
getData, and they carry a `machine` column. `normalizeReport` writes `machine: ""` for any report
whose stored machine is not one of the known ones, and `domainKeyForRow` reads a blank machine as
"no machine of its own" and falls back to the ACTIVE one — so the same sheet row is
`dailyReport:TBM1:d3` on TBM1 and `dailyReport:TBM2:d3` on TBM2. A copy queued on one machine is
then appended beside the server row on the other rather than replacing it.

Unreachable in Task 8: neither type is queued, so nothing builds an optimistic copy of one. It is
not a regression either — `recordFor` has always read `payload.machine || machine`. Task 9 queues
both types, and has to decide what a blank machine cell means before it does: either it is data (and
the row belongs to no machine, which `makeDomainKey` spells GLOBAL) or it is missing (and the row
belongs to whoever is looking at it, which is what happens now).

## 3m. The screen infers a row's provenance; the merge knows it

The merge decides how to read a stored row's id from its KEY — `isOptimisticKey` picks
`optimisticRecordIdOf` for a queued row and `rowIdOf` for a cached server row. The on-screen list has
no key to look at, so it infers the same thing from the row's fields: `recordId` first, because only
a row that went through the queue carries one.

A row carrying a stray `recordId` FIELD would break that inference — the screen would read it, the
merge would not, and a queued edit of that row would be appended on screen and overlaid on the next
refresh. No sheet whose rows reach a getData collection has such a column: checked against the
fourteen `*_HEADERS` lists in `gas-live/Code.js`, and `ensureHeaders_` only ever adds from those.
`SYNC_META_HEADERS` does carry one — SyncMeta is the exception, and it never reaches a collection.

**But a header column is not the only way in: see 3n.** The two JSON-blob entities store the whole
payload in one cell, so a `recordId` the queue injected comes back as a row-level field with no
column involved. 3m is safe today because neither of those types is queued yet; 3n is the same trap
seen from the other end.

Recorded because the two halves genuinely ask the question differently, and the reason that is safe
is a property of the sheets rather than of this code.

## 3n. Task 9's JSON-blob entities will persist the queue's own metadata into the sheet

`SYNC_JSON_BLOB_ENTITIES` is `{ dailyReport, prepTask }`, and `gas-live/Code.js` stores those two by
copying EVERY key of the payload into one `json` cell — no header list filters them. The record views
already re-post the on-screen row as the next save's payload, and for a queued row that row is the
optimistic payload, which carries `recordId`, `entityType`, `machine`, `domainKey`, `version` and
`syncStatus`.

Harmless today: neither type is queued, and the four core sheets are header-mapped so GAS drops the
extra keys. The moment Task 9 queues `prepTask`, they land in the `json` cell and echo back through
`getJsonRows_` unfiltered — `normalizeServerData` whitelists `dailyReports` and not `prepTasks`.
`snapshotStore.INJECTED_PAYLOAD_KEYS` already solves exactly this for the config singletons and is
the pattern to reuse, on the write side.

## 3o. A config edit made offline is invisible after a relaunch (Task 9)

`patchSnapshotKeys` returns early when the entity type has no collection field, which is the case for
`planConfig`, `distPlanConfig` and `routeConfig`. So a queued config edit reaches the entities store
and nothing else: `readServerSnapshot` rebuilds the singletons from `snapshot[key]`, and
`overlayConfigSingletons` runs only inside `writeServerSnapshot`. The edit is on screen until the app
is closed, and gone when it reopens, until a `getData` succeeds.

It is the same shape as the collection bug this branch calls routine data loss — a whole shift's work
invisible after a relaunch — and it is unreachable today only because no view queues a config type
(grepped: no `entityType: "planConfig"|"distPlanConfig"|"routeConfig"` outside the offline module and
its tests). Task 9 wires the plan and route editors to the queue, and has to carry the singletons
into the stored snapshot when it does.

## 4. Deliberate deviations from the plan

- **"บันทึกในเครื่องแล้ว" is only in the shift report.** Step 3 asks for it on every core write. The
  record forms save many rings a shift, and a modal after each would be dismissed reflexively — the
  status strip reports "N รายการรอซิงก์ขึ้นเซิร์ฟเวอร์" continuously instead, which is the same
  fact and harder to miss. Flagged rather than silently skipped.
- **The data logs no longer offer the ring, install type or grout pass for editing.** Step 4 says to
  preserve existing form behaviour. Those edits cannot be expressed by the sync protocol (see 2), so
  the alternative was a field that always refuses — and for a Re-Grout row, which no view can create,
  the prescribed remedy of delete-and-re-record does not exist either.
- **The shift report and the Performance page now count one shift's minutes differently.**
  `ShiftReportView`'s `getTotalMinutes` sums per bar; `PerformanceView` counts the minutes occupied.
  For 2026-03-07 Day the report prints 319 minutes of `Other 1` and the Performance page counts 259.
  They answer different questions — what was written down, and how long the machine stood still —
  but nothing on either page says so. It matters more after the merge than it does here: this branch
  has no print path at all (`utils/printPages.js` does not exist on it), while `origin/main` prints
  both pages in one 18-page set.
- **A create claims a tombstone's version, not 0.** Step 4 says the base version is
  `syncMeta[domainKey]?.version || 0`. `createBaseVersion` (`mutationEnvelope.js`) sends the
  tombstone's version when the key carries one, because GAS refuses a create that does not claim it —
  which is the whole of delete-and-re-record. Argued in code, and it belongs on this list.
- **`__resetShiftSaveStateForTests` survived Step 4's delete list** along with the draft-id map it
  now exists to clear. The name still says "shift save state", which is the bookkeeping the step
  deleted; what it resets is the map the same step's exception keeps.
- **The shift-report "create already composed" set survives too** — the second of the three things
  Step 4's delete list names. The step's rationale for deleting it, that "the per-domain ordering
  makes a second send an update rather than an append", is wrong: ordering decides when a send goes,
  never what it is, and `operation` is frozen when a save is composed. Two saves started before the
  first one's row comes back both filed a create, the second posted base 0 against a row that by then
  existed, and it parked at `conflict` — head of that report's domain, unresolvable before Task 10.
  It is released when a save fails, since nothing was queued then and the retry has to be a create.
- **The shift-report draft-id map survives**, against Step 4's delete list. Without it a remount
  mints a new id, which files a second report for one shift. Its three regression tests are in
  `shiftReportMidEdit.test.jsx`.

## 5. Guards whose failure the tests cannot see

Not defects — recorded so a future reviewer does not mistake them for untested rules. **Check the
claim before trusting it.** An earlier version of this section said the `Date.parse(0)` sentinel in
`repository.js` could not be pinned; review disproved that in twelve lines (the second launch, not
the first, is where it bites) and it now has a test. A note that discourages testing a reachable
data-loss path is worse than no note.

- `mutationStore.js` — `patchSnapshotSyncMeta`'s scope bootstrap cannot fire while `patchSnapshotKeys`
  creates the scope first. **It will not earn its place with Task 9's project-wide entities either**,
  and the earlier claim that it would was wrong: `scopesFor` returns early on `!machineScoped`, so
  for a project-wide entity on a device holding no snapshot the bootstrap is unreachable by
  construction and the confirmed version is simply dropped. Task 9 needs a different change — a
  machineless scope has no scope key to be created under, which is a design question that task owns.
- `App.jsx` — the photo strip on the snapshot mirror is invisible to the DOM: carrying the bytes and
  dropping them render identically. The rule is tested on the reducer in `displayRecord.test.js`.
- `App.jsx` — `applyOptimisticRecord`'s dev-time warning for an entity type with no setter has no
  test: it fires on a state Task 8 cannot reach (every type it queues has one) and pinning a
  `console.warn` string would break on any rewording. It exists for Task 9, which adds the types.
- `PerformanceView.jsx` — a delay bar wholly inside one already counted names no Pareto theme, since
  it has no minutes to show on a chart of minutes; which of two overlapping bars keeps its cause is
  array order. Not testable as a rule (attributing it zero minutes is the same thing), so it is
  written down instead. The invariant that the themes DO add up to their category is testable — the
  Pareto renders nothing in jsdom, so `shiftMinutesByCategory` is exported and tested directly.
  (Removed by accident with the false `rowIdOf` claim; still true, still untestable.)
- `repository.js` — the null-snapshot fallback in `refresh` (`(overtaken && read) || write`) is
  unreachable now that a request is only recorded as newest once its write has landed. It stays
  because the alternative is handing the caller a null it then reads `fetchedAt` off.
- `snapshotStore.js` — measured, one guard at a time, by breaking it and running the whole suite:
  - **PINNED, not free** — the SYNCING lease check (2 tests) and `localByRecord`'s preference for the
    queued copy over the cached one (1 test, added with the duplicate-id fix). An earlier version of
    this list called both of them untested. They were, when it was written; they are not now, and a
    list of "do not bother testing these" is worth nothing if it is not re-measured.
  - **Survives removal** — `localOnly`'s preference for the queued copy (`localByRecord` decides
    first in every path that reaches it), `deletePending`'s null-id check (`recordSlot` already makes
    an empty id unmatchable), and `>=` versus `>` on the confirmed-after-request comparison (the
    repository clock is strictly monotonic, so the two stamps are never equal).
  - **Half pinned** — `localByRecord`'s preference is pinned against FIRST-wins (1 test) and not
    against LAST-wins, and a fixture cannot close the gap: for the two copies to compete,
    `patchSnapshotKeys`' orphan pass would have to leave the cached row in the store, and it deletes
    it the moment the write is queued. A review proposed pinning it with a machine id that sorts
    after `optimistic` so the store hands them back the other way round; the test passes with the
    guard removed, because the cached row is not there to win.
  - **No longer a guard** — `claimWithinDomain`'s "only within this ring" test survived removal too,
    so it was replaced by a Map keyed on the domain: the rule is the shape of the lookup now, and
    there is no predicate left to drop.
