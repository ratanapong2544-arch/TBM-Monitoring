# Task 6 Completion Record — GAS Idempotency and Optimistic Version Checks

**Status:** Code complete and independently reviewed on both axes. **Deployment NOT performed** (gated on explicit owner confirmation — see below).

## Verdicts

Task 6 converged at application commit `aaf523a` (round 11), where an independent spec-compliance review and an independent code-quality review both returned PASS. The quality review's only two findings were missing regression guards (the code was verified correct); both were pinned in `c0f893f`.

Eleven review rounds ran. Rounds 4–10 each surfaced a real MAJOR or BLOCKER defect that earlier rounds missed — most in the value-crossing-the-wire seam (sheet Date cells serialized as UTC ISO, structured columns reaching the sheet raw, unlocked `doGet` metadata ordering) and in the DB_VERSION 2 migration added in round 8. All were fixed with regression coverage before convergence.

## Commit trail (application commits, oldest first)

| SHA | Summary |
|---|---|
| `4a3a21b` | test: lock GAS sync contract |
| `36b6af5` | test: pin GAS sync state machine |
| `8967adc` | fix: align sync machine scope and pin degraded ledger |
| `79226ab` | fix: make deterministic sync failures terminal |
| `8af9b6d` | fix: size JSON-blob records by their stored cell |
| `3370724` | fix: restore the device label on the sync contract |
| `c1c77fb` | fix: keep shift report keys stable across the wire |
| `27e40b8` | fix: keep sheet values and versions consistent across the wire |
| `c4a49ba` | fix: stop losing fields and records the caller did not resubmit |
| `71b57f8` | fix: preserve offline edits the cache used to drop |
| `3e32fd4` | fix: make the domain-key migration correct under real data |
| `aaf523a` | fix: discard the stale cache on domain-key migration |
| `c0f893f` | test: pin the config-strip scope and empty-remap cache guard |

Every commit is repository-owned (`package.json`, `tools/`, `src/offline/`, `docs/`). Nothing from `gas-live/` is in git history — the GAS backend is outside the repository by design.

## Test evidence (at `c0f893f`)

- `npm run test:gas-sync` → 92 pass / 0 fail
- `npm test -- --watchAll=false --runInBand` → 60 suites / 725 tests pass
- `node --check ../gas-live/Code.js` → OK
- `git diff --check` → clean

## GAS backend (outside the repository)

- Authoritative source: `D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\gas-live\Code.js`
- Pre-sync backup: `gas-live\Code.js.pre-pwa-sync` — SHA256 `EBD0E1D13B8A56AC828ECB20780F6110F652BB6D44F5BDD720202EA7855C9AAF` (matches the handoff-recorded source hash; single backup, never overwritten)
- The backend change is additive: two new sheets (`SyncMeta`, `SyncRequests`), an idempotent `syncMutation` endpoint, optimistic version checks, structured conflicts, legacy-write metadata bumps, and an additive `getData.syncMeta`. No business column was removed or reordered; legacy actions are unchanged for old browser tabs.
- Review diff: `git diff --no-index gas-live/Code.js.pre-pwa-sync gas-live/Code.js`.

## Deployment — NOT DONE, requires explicit owner action

Per the handoff and Critical Safety Note 3, GAS/Vercel deployment is an externally visible production mutation and was not performed autonomously. The preconditions are met (verified backup + hash, all local gates green, known target), but the deploy itself needs the owner's explicit go. When authorized, from `gas-live/`:

```
clasp push -f
clasp redeploy AKfycbyRUl5BVmZYDhw_Z0Uo2LWBLmaQAaOjJZR4jLGw-MuxHIFcKEhu7FBF9tV33JAnKz1aTw
```

Then run `setupSheets()` once as owner and perform only the non-destructive GET smoke check (`?action=getData&machine=TBM1`, verify `status:"success"` and `syncMeta`). Rollback: restore `Code.js.pre-pwa-sync`, `clasp push -f`, redeploy the same deployment ID. Never use production engineering records for smoke or conflict testing.

## Deferred follow-ups (task chips filed)

- Validate unknown sync payload keys per entity (a non-header key is silently dropped, then reported as a phantom conflict). Best done after Tasks 8–9 wire the real write call sites so the payload keys per entity are pinned.

## Carry-forward notes for Tasks 7–12

- Task 8/9 must always supply `machine` for `dailyReport`/`prepTask` writes; `normalizeReport` can emit an empty machine, and both the client validator and GAS now require it.
- The client mutation envelope's `domainKey` must stay canonical; a stale key fails loudly as `SYNC_ENVELOPE_INVALID`, and a key-format change needs a `DB_VERSION` bump (the v2 migration is the template).
- Task 10's conflict UI can render the server-side device label and time via `currentUpdatedByDevice` / `currentUpdatedAt` on the conflict response and `updatedByDevice` in the `getData.syncMeta` map.
- Task 10/11 should add a Sync Center "retry" control calling `repository.retryMutation` and a review surface for legacy staged conflicts (they have no `requestId` and cannot go through `resolveConflict`).
