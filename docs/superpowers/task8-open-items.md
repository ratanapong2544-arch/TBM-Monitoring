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
  and UNIONS the time bars across the rows describing it, identifying a bar by its category, window
  and label. It was counting each row as a shift of its own: 24 hours of availability for a 12 hour
  shift, and every delay bar present in both counted twice, on a page that gets printed for the
  owner. Keeping only the first row was tried and was also wrong — measured against the captured
  production payload, the live sheet's three duplicated shifts contain 510 minutes of genuine
  re-saves AND 60 minutes (2026-04-09 Day, `Locomotive / Rail System` 14:00–15:00) recorded on the
  later row alone. Two bars agreeing on category, window and label cannot be two things that
  happened. Nothing else dedupes shift reports.
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

## 4. Deliberate deviations from the plan

- **"บันทึกในเครื่องแล้ว" is only in the shift report.** Step 3 asks for it on every core write. The
  record forms save many rings a shift, and a modal after each would be dismissed reflexively — the
  status strip reports "N รายการรอซิงก์ขึ้นเซิร์ฟเวอร์" continuously instead, which is the same
  fact and harder to miss. Flagged rather than silently skipped.
- **The data logs no longer offer the ring, install type or grout pass for editing.** Step 4 says to
  preserve existing form behaviour. Those edits cannot be expressed by the sync protocol (see 2), so
  the alternative was a field that always refuses — and for a Re-Grout row, which no view can create,
  the prescribed remedy of delete-and-re-record does not exist either.
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
- `repository.js` — the null-snapshot fallback in `refresh` (`(overtaken && read) || write`) is
  unreachable now that a request is only recorded as newest once its write has landed. It stays
  because the alternative is handing the caller a null it then reads `fetchedAt` off.
- `snapshotStore.js` — several belt-and-braces guards survive removal: `localForRecord`'s and
  `localOnly`'s preference for the queued copy over the cached one, `deletePending`'s null-id check
  (`recordSlot` already makes an empty id unmatchable), the SYNCING lease check, and `>=` versus `>`
  on the confirmed-after-request comparison (the repository clock is strictly monotonic, so the two
  stamps are never equal).
