# Task 9 — completion record

**Both review axes PASS.** Spec compliance at round 3; code quality at round 6; a final combined
pass confirmed both at `3489bcb` and its four findings closed in `ba2129f`.

| Evidence | Value |
|---|---|
| jest | 75 suites / 1071 tests |
| GAS sync contract | 92 pass, 0 fail |
| `node -c ../gas-live/Code.js` | clean |
| `CI=true npx react-scripts build` | compiles, leaves the tree clean |
| `git diff --check` | clean |
| GAS backup | **not needed — Task 9 never edited `gas-live/Code.js`.** Every server-side finding is recorded, not applied. |

**Not deployed.** The promotion gate binds Tasks 7, 8 and 9 to ship together, and open item 3k now
argues it should extend to Task 10.

## What it did

Routed the remaining business writes through the offline queue — issues, daily reports, prep tasks,
plan/distance/route configs, instruments, readings, schedules — and retired `localStorage` as a
durable store for every one of them. `apiCall` survives at exactly three sites, all online-only
proxies: `getDriveImages`, `getImage`, `generateSummary`.

Legacy reconciliation, written and tested since Task 7 and connected to nothing, now runs on the
first server payload of a session. Deletion propagation (Step 5b) is answered by the SyncMeta
tombstone GAS already ships, which is what tells a real deletion from a partial response — emptiness
never could, because `getSheetDataAsJson` returns `[]` for a sheet that does not exist.

## Review history

Ten rounds across the two axes. Spec: FAIL, FAIL, PASS. Quality: FAIL ×5, PASS. Every round after
the first found a defect the previous round's own fix had introduced, or one it had made reachable.

## The defects worth remembering

1. **A rule enforced on the screen and not in the cache lasts until the next launch.** App refused
   to let an empty collection remove a record; `writeServerSnapshot` replaced collections wholesale.
   The durable half won at the next launch. Same shape three times: the config singletons, the
   collections, and the prep-task carve-out that is still asymmetric (open item 3v).
2. **`machine` was answering two different questions.** On an envelope it is a scope hint — which
   snapshot the write belongs in. On a payload it is the record's own column. One field, and every
   permutation of the two was a defect: stamping the hint over the column re-tagged an issue to TBM1
   for good; withholding the hint left a record on no screen after a relaunch.
3. **Removing a store makes every hole in its replacement reachable at once.** Step 5 retired the
   localStorage copy. Five separate defects followed — an offline launch showing factory route
   distances, a queued write vanishing on a tab switch, a config lost on relaunch, a record raised on
   a never-fetched machine going nowhere, an empty response emptying the cache — all of them holes
   that had always existed in the snapshot path and had never mattered.
4. **A synthesised scope has to ask about the right thing.** "Does the device have a snapshot" and
   "does this machine have one" differ on exactly the phone the crew is holding.
5. **Two tests I wrote were vacuous and passed for the wrong reason** — a draft that survives because
   the guard never touched it, and a modal whose inputs go uncontrolled when fed the wrong field
   names. Both were found by breaking the source, neither by reading the test.
6. **A comment that was true when written is a defect once the code moves.** Four in this task,
   including one the same commit falsified, and three open items whose stated reasoning Task 9 made
   false.

## Where the remaining risk is

`docs/superpowers/task8-open-items.md` is the complete list. New in this task: **3s** (two instrument
write handlers with no caller), **3t** (a machine with only a queued config says "showing saved
data"), **3u** (the rules no test pins, by reason), **3v** (the prep-task carve-out exists on the
screen and not in the cache). **3o** is closed. **3k** is now live and argues the promotion gate
should include Task 10: a legacy difference counts into "N รายการติดค้าง" and nothing in the app can
clear it until the Sync Center exists.

Still blocking the pilot, both server-side and both untouched: `gas-live/Code.js:1327` tombstones a
ring KEY rather than a row, and `readRowById_` resolves by record id and stops at the first match.
