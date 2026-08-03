# Task 10 — app-wide sync, conflict, install and update UI

**Closed at `11ab10b`.** Not deployed.

## What shipped

`src/components/offline/` — `NetworkStatusButton` (counts on the button itself, never behind a tap),
`SyncCenter` (four tabs: กำลังส่ง / ติดค้าง / ขัดแย้ง / ประวัติ, with a payload editor for refused
writes, retry, and a two-step discard), `ConflictResolver` (field-by-field, three strategies),
`InstallAppPanel`, `UpdateAvailableBanner`, and `OfflineControls`, which holds the one open/close
state the button and the panels share.

Behind them: `getSyncCenterView` and `discardMutation` in `mutationStore.js`, `syncSummary.js`, and
the repository/hook wiring that makes a screen re-read when a crew action rewrites the stored row.

## Gates at close

| Gate | Result |
|---|---|
| `npx cross-env CI=true npx react-scripts test --watchAll=false` | 87 suites / 1254 tests pass |
| `node tools/gas-sync-contract.test.cjs` | 92 pass, 0 fail |
| `npx cross-env CI=true npx react-scripts build` | Compiled successfully |
| `node -c "..\gas-live\Code.js"` | clean |
| `git diff --check` | clean |

GAS was not modified by this task, so no backup was taken. The backups that exist
(`gas-live/Code.js.bak`, `.pre-inst`, `.pre-pwa-sync`) belong to earlier work and are the rollback
points named in the runbook.

## Review

The spec axis passed at round 6. The quality axis ran **17 rounds** and every one of them found
something; the last two found no BLOCKER and no MAJOR. Commits: `26ba5d1`, `c180b6c`, `e237ec8`,
`c58c06e`, `1c15964`, `3aeb718`, `5958942`, `39b9597`, `11ab10b`.

The loop was stopped at round 17 by the project owner's decision after the severity trend flattened
into MINOR/NIT — the gate as written ("re-review until both verdicts pass") does not terminate on a
codebase where a reviewer can always find one more NIT.

## What the 17 rounds were actually about

Roughly half of them fixed a defect introduced by the previous round's fix. That is the finding worth
carrying forward, more than any individual bug:

- **A rule that lives in more than one place gets moved at one site only.** Found in every round from
  13 to 16, in a different pair each time: `hidesRecord` (four inline copies), `patchSnapshotKeys`
  (called from one of three enqueue paths), `restoreDeletedKey` (in one of two branches, twice, in
  two sibling functions), `cascadeOf`, `splitByBlocked`, `formatSyncStamp`, `payloadForWire`. Each
  fix that unified a rule was correct; each fix that touched one site created the next round's
  finding.
- **A rule enforced on the screen but not in the durable store lasts until the next launch** — and
  the reverse: rounds 14 and 15 were the same rule enforced in the store but not on the screen.
- **Six of my own tests passed while pinning nothing.** A guard written in two places (break one, the
  other covers); a race that raced `refresh()`, which claims a new request token and would drop the
  result regardless; a delete-restore test where `mutate` re-added the snapshot key by itself so the
  branch under test never ran; two that asserted an end state both implementations produced. The only
  reliable check is to break the source and watch the named test go red — that is now done for every
  rule this task added.
- **`CI=true react-scripts build` is not a lint gate here.** `.eslintrc.json` loads no rules, so an
  undefined identifier compiled cleanly and wrote `syncStatus: ""` on every optimistic row. The suite
  caught it.
- **`grep -c FAIL` on a test run exits 0 on a match.** A red suite was committed that way once.

## Left open, deliberately

Resolving a conflicted delete after a mid-conflict refresh leaves one entity row named by no
snapshot. It costs one IndexedDB row, nothing reads it, and the fix reorders `confirmMutation`'s
entity write around the restore — more risk than a leaked row is worth in that function's current
state. Recorded in `11ab10b`.
