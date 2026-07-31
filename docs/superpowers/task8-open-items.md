# Task 8 — open items at the end of the client work

Everything here is known, reproduced, and deliberately not fixed inside Task 8. Each says why, and
what closing it would take. Written down because two of them were found by review, fixed badly, and
had to be withdrawn — the record is what stops that happening a third time.

## 1. Deleting one row of a ring makes the other one uneditable (server-side)

**Reproduced against the real `handleSyncMutation_`.**

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

**The fix is in `gas-live/Code.js`**: tombstone the row rather than the key, or revive the key when a
create arrives with a matching base. It needs the pre-sync backup, a contract test in
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

- **shiftReport** — nothing dedupes. Two rows for one (date, shift) make `PerformanceView` count the
  shift twice, halving availability and double-counting any delay bar present in both.
- **grout / secondaryGrout** — nothing dedupes; `GroutDashboardView`'s average volume and ratio are
  `sum / length`, so a second row shifts both.
- **segment** — the dedupe fires and prefers the Completed sheet row over an In Progress local one,
  so a newly recorded ring can be invisible in the data log while the strip says it is queued.

None of this is new to Task 8 — the queue does not create the duplicate rows, the sheet does — but
Task 8 is what makes both rows visible at once, so it is what makes the gap matter.

## 3b. A delete queued behind a stuck head still takes its row off screen

`unresolvedByDomain` holds the NEWEST unresolved mutation per domain, not the queue head. So when a
domain already has a terminal head, a delete queued behind it — which `claimDueMutations` will never
post — still hides its row from the refreshed list. The ring is off every screen on this device and
still on the sheet, and the crew has affirmative feedback for a destructive action that did not
happen.

It is counted (`errors` plus `blocked`), so the strip is not lying about the total, and it needs a
stuck head to reach — which today means item 1. Fixing it properly means the tombstone asking whether
its mutation is actually the claimable head, which is a queue question the snapshot merge currently
cannot ask. Task 10 owns both the head and the resolution UI.

## 3c. Deletes are not "visible as pending tombstones to repository reads"

Step 4's wording. `deletePending` filters the row out of the merge instead of marking it, so a reader
cannot tell a deleted-pending row from an absent one without joining the mutations store itself.
Task 10 can reconstruct it; nothing in Task 8 needs it. Recorded because it is a deviation from the
written contract, not an oversight.

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

## 5. Guards that cannot be pinned, and say so where they sit

Not defects — recorded so a future reviewer does not mistake them for untested rules:

- `repository.js` — the `Date.parse(0)` sentinel and the null-snapshot fallback subsume each other;
  either alone leaves the suite green.
- `mutationStore.js` — `patchSnapshotSyncMeta`'s scope bootstrap cannot fire while `patchSnapshotKeys`
  creates the scope first. It earns its place with Task 9's project-wide entities.
- `App.jsx` — the photo strip on the snapshot mirror is invisible to the DOM: carrying the bytes and
  dropping them render identically. The rule is tested on the reducer in `displayRecord.test.js`.
