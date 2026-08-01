# Task 8 — completion record

**Both review axes PASS.** Spec compliance at `565e846` and again at `a435bdb`; code quality at
`3aa1cf6`. Head of the task: `a435bdb` plus the summary-field pin that closed the last round's only
finding.

| Evidence | Value |
|---|---|
| jest | 70 suites / 991 tests |
| GAS sync contract | 92 pass, 0 fail |
| `node -c ../gas-live/Code.js` | clean |
| `CI=true npx react-scripts build` | compiles, leaves the tree clean |
| `git diff --check` | clean |
| GAS backup | **not needed — Task 8 never edited `gas-live/Code.js`.** The two server-side items it found are recorded, not applied (open items 1 and 2a). |

**Not deployed.** The promotion gate binds Tasks 7, 8 and 9 to ship together; nothing on this branch
has reached Vercel or clasp.

## What it did

Routed the five core TBM writes — segment create/update/delete, primary grout, secondary grout,
shift report create/update — through the offline mutation queue instead of `apiCall`. Eight call
sites across five views, all building envelopes through `buildMutationEnvelope` → `onMutate` →
`repository.mutate`. The plan's delete list was applied in full; the three survivors are argued in
open items §4.

## Review history

Sixteen rounds across the two axes. The verdict pattern is the story:

- **Spec:** FAIL ×4 (rounds 9–12) → PASS 13 → PASS 14 → FAIL 15 → PASS 16–24 with one FAIL at 21
  and one at 22, each on a defect the previous round's own fix had introduced.
- **Quality:** PASS 1 (with findings) → FAIL 2–8 → PASS 9.

Round 9 of the quality axis broke 29 rules one at a time and 26 were killed by a named test; it was
the first round with nothing at blocker or major severity.

## The defects worth remembering

Every one of these was reachable, and none was found by the tests that existed when it was written.

1. **A DB upgrade took the crew's queued work off every screen.** The migration cleared the snapshot
   store; `readServerSnapshot` rebuilds each list from `entityKeys` alone, so the rows survived in
   IndexedDB and appeared nowhere. Re-entering the work filed a second create that then lost the
   drain race.
2. **The unit is the record, not the ring** — and then not the record id either. The captured
   production sheet spreads seven record ids over sixteen rows on sixteen *different* rings. Row
   identity became `(domainKey, recordId)`, and which id to read became a question of provenance: a
   sheet row is named by its `id` column, anything that could have been through the queue by the
   `recordId` its key was built from.
3. **The same rule lived in five or six places and moved one at a time, six rounds running.**
   `entityKeys` / `snapshotStore` / `displayRecord` / `db.js` / the views. Each fix passed the suite
   and left another site behind.
4. **The Performance page printed 18 hours of delay inside a 12-hour shift.** Two rows describing
   one shift are two transcriptions of it; matching their time bars by label collapsed nothing,
   because the real duplicates differ by one space. Counting the minutes they occupy is the rule.
5. **Two views the crew uses could not complete a write, or completed it wrongly.** A ring whose id
   the sheet holds four times could not be saved at all; un-ticking one grout injection position
   inverted the record and dropped every other position.
6. **A failed shift-report save poisoned that report forever** — twice, from two directions. The
   fix is that whether a save is a create is a fact another send establishes, so it is read after
   that send settles, while every fact about the mount is sampled when the crew acts.

## Where the remaining risk is

`docs/superpowers/task8-open-items.md` is the complete list — around twenty entries, each
reproduced and each saying what closing it would take. Two block the pilot and both are server-side:

- **`gas-live/Code.js:1327`** tombstones the ring KEY rather than the row, so deleting one row of a
  ring makes every later correction of the other terminal — and the remedy the app itself prints
  makes it worse.
- **`readRowById_` / `updateRow` / the delete path** resolve by record id and stop at the first
  match, so a duplicated id writes to the wrong ring. The client refuses this in all three views
  that write by record id; the server does not.

## For Task 9

It migrates the remaining business writes to the same seam and edits `optimisticEntity`. The items
written specifically for it: 3l (a blank machine column gives one row a different identity per
machine), 3n (the JSON-blob entities persist the queue's own metadata into the sheet), 3o (a queued
config edit is invisible after a relaunch), and the note in `entityKeys.js` explaining why
`rowIdOf` and `optimisticRecordIdOf` must stay two functions.
