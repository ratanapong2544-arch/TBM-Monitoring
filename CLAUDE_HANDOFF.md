# Claude Handoff — Mobile PWA Offline Sync

**Prepared:** 2026-07-30 (Asia/Bangkok)
**Implementation status:** Tasks 1–5 complete and independently reviewed; resume at Task 6
**Application implementation tip:** `930b082`
**Branch at handoff preparation:** `feat/mobile-pwa-offline-sync`

## Read This First

Continue the approved mobile PWA/offline-sync implementation in this linked worktree:

```text
D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\wt-mobile-pwa
```

Do not continue in the original checkout:

```text
D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\TunnelBoringMonitoring
```

The original checkout is on `feat/head-level-chart` and contains unrelated user-owned untracked files. Do not copy, restore, clean, or overwrite those files.

The next implementation unit is **Task 6: Add GAS idempotency and optimistic version checks**. Tasks must remain sequential because Task 6 supplies the server contract consumed by later write migration and UI work.

## Product Requirements

The approved product is a full PWA around the existing React application:

- Android and iPhone users install it from the existing Vercel HTTPS link.
- It is for internal use and is not published through Google Play or the Apple App Store.
- Every current application page remains available.
- Previously loaded application assets and the latest downloaded data open while offline.
- Business writes are saved durably on the device first and synchronized later.
- Repeated delivery must not create duplicate server effects.
- Concurrent edits become visible conflicts; engineering data is never merged or overwritten silently.
- Initial rollout is approximately ten users.
- There is no login in this release, but the data contracts preserve future `actorId`/authorization integration.
- GAS remains the system of record.
- Timestamps shown to users follow Asia/Bangkok.

Explicitly out of scope:

- Native Android/iOS packages and app-store publishing.
- Guaranteed sync while the PWA is closed.
- Offline Gemini/AI processing, localhost PDF helper operation, or bulk third-party map-tile download.
- Authentication and role management.

## Repository and Branch

```text
Repository checkout:
D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\TunnelBoringMonitoring

Linked feature worktree:
D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\wt-mobile-pwa

Feature branch:
feat/mobile-pwa-offline-sync

Merge base:
8363e14d4ec1fee4cf7407b72ef09b4965620268

Application implementation tip before handoff-only docs:
930b082
```

At handoff preparation, the branch also contains these documentation commits:

```text
84fa322 docs: design Claude implementation handoff
4b4503c docs: plan Claude implementation handoff
```

Run these before making changes:

```powershell
Set-Location 'D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\wt-mobile-pwa'
git branch --show-current
git status --short
git log --oneline -15
```

Expected branch: `feat/mobile-pwa-offline-sync`. Resolve unexpected worktree changes before editing; never discard them by assumption.

## Source of Truth

Read these committed files completely:

1. Product design:
   `docs/superpowers/specs/2026-07-29-mobile-pwa-offline-sync-design.md`
2. Detailed 12-task implementation plan:
   `docs/superpowers/plans/2026-07-29-mobile-pwa-offline-sync.md`
3. Handoff-document design:
   `docs/superpowers/specs/2026-07-30-claude-handoff-design.md`
4. This handoff.

The detailed implementation plan is authoritative if this summary and the plan ever differ.

On the current machine, the ignored working ledger and reports are under:

```text
.superpowers\sdd\2026-07-29-mobile-pwa-offline-sync\
```

Important: `.superpowers/sdd` is intentionally ignored and may not exist in a new clone or copied repository. This document contains the durable completion summary needed to continue without it.

## Architecture Implemented

### Installable production bundle

- Tailwind 3 is compiled locally; production no longer depends on the Tailwind CDN.
- Root-scoped standalone manifest and PNG icons exist for iPhone, Android, and maskable installation.
- Icon generation is reproducible through `tools/generate-pwa-icons.mjs`.
- Installed dependencies include `idb`, `fake-indexeddb`, `tailwindcss`, `workbox-build`, and `sharp`.

### Offline application shell

- `src/pwa/service-worker.js` is injected by Workbox after the CRA build.
- The service worker precaches the application shell, uses navigation fallback, and bounds runtime cache entries.
- It never caches non-GET business writes and excludes GAS POST, Gemini, the localhost PDF helper, and ArcGIS requests.
- `registerServiceWorker()` is production/secure-origin guarded and distinguishes first offline readiness from an available update.

### Durable local storage

IndexedDB database: `tbm-monitoring`, schema version `1`.

Stores:

- `entities`
- `snapshots`
- `mutations`
- `conflicts`
- `syncMeta`
- `deviceMeta`

The implementation includes stable device identity, canonical domain keys, non-destructive legacy `localStorage` staging, and conflict-only reconciliation. Legacy staging never deletes original browser data or automatically enqueues writes.

### Offline-first reads

Key files:

- `src/offline/apiTransport.js`
- `src/offline/normalizeServerData.js`
- `src/offline/snapshotStore.js`
- `src/offline/repository.js`

Repository read results use:

```js
{ data, source, fetchedAt, stale }
```

`load(machine)` returns IndexedDB data immediately or an explicit empty shape. `refresh(machine)` fetches and normalizes GAS data, writes one atomic snapshot, preserves unresolved optimistic records, and emits the merged committed result. `App.jsx` delegates parsing to the shared normalizer, but full React repository hydration is intentionally deferred to Task 7.

### Durable mutation queue

Key files:

- `src/offline/mutationStore.js`
- `src/offline/syncRunner.js`
- `src/offline/repository.js`
- `src/offline/apiTransport.js`

Implemented invariants:

- `repository.mutate()` validates and derives the canonical envelope.
- Optimistic entity and mutation are stored in one IndexedDB transaction.
- Mutation creation never calls the network directly.
- One `requestId` survives retries and database reopen.
- Sync uses per-runner owner leases and fencing, so crashed work can be reclaimed without allowing stale responses to overwrite a newer owner.
- Only the oldest nonterminal mutation per domain is claimable; unrelated domains continue independently.
- Retryable failures use deterministic exponential backoff capped at five minutes.
- Validation, conflict, malformed/permanent, retryable, and success responses are typed and validated through the shared transport contract.
- Newer unresolved optimistic state is not overwritten when an older same-domain mutation succeeds or a server snapshot refreshes.
- Server/local/manual conflict strategies retain an audit record.
- Local/manual conflict resolution atomically marks the original mutation `resolved`, resolves the conflict audit, and enqueues the successor against the server `currentVersion`.
- `permanent_error` deliberately remains blocking for its domain until a later recovery UI/API is implemented.

## Completed Work: Tasks 1–5

### Task 1 — Installable, self-contained production bundle

Commits:

```text
c09d0bf build: make mobile bundle installable offline
```

Final review: spec PASS, quality PASS.

### Task 2 — Service worker build and registration

Commits:

```text
d4cb68d feat: add offline application shell
```

Final review: spec PASS, quality PASS.

### Task 3 — IndexedDB, device identity, and legacy import

Commits:

```text
2bd768f feat: add durable offline storage
25b6cf3 fix: reconcile legacy config values safely
```

Review fixes included config domain matching across differing transport IDs and safe parsing of server string-encoded config values. Final review: spec PASS, quality PASS.

### Task 4 — Normalized snapshots and offline-first reads

Commits:

```text
5693a43 feat: add offline-first data repository
c1c24e2 fix: align offline repository read contract
ca077e9 fix: return transaction-local snapshot results
```

Review fixes included the public read wrapper, pending-state preservation, GAS failure classification, daily-report/config parity, `App.jsx` normalizer delegation, and concurrent refresh return values. Final review: spec PASS, quality PASS.

### Task 5 — Durable mutation queue and deterministic sync

Commits:

```text
0dc2297 feat: add durable sync queue
2cc4443 fix: harden durable sync queue
d83cc34 fix: lease durable sync claims
902f2b5 fix: preserve per-domain sync order
930b082 fix: atomically resolve queued conflicts
```

Review fixes included crash recovery, document visibility lifecycle, same-domain optimistic preservation, canonical envelope validation, shared response validation, cross-runner lease fencing, per-domain FIFO, and atomic local/manual conflict successors. Final review: spec PASS, quality PASS.

## Verification Baseline

Fresh verification on 2026-07-30:

```powershell
npm install
npm test -- --watchAll=false --runInBand
```

Result:

```text
Test Suites: 60 passed, 60 total
Tests:       688 passed, 688 total
Snapshots:   0 total
```

Known non-blocking output:

- Existing Recharts `ResponsiveContainer` width/height warnings in jsdom component tests.
- CRA/Node deprecation output may appear during production builds.
- `npm install` currently reports 91 audit findings: 5 low, 11 moderate, 73 high, and 2 critical. Do not run `npm audit fix --force` as part of this feature; it can make unrelated breaking dependency changes. Treat dependency remediation as separate reviewed work.

Useful commands:

```powershell
npm test -- --watchAll=false --runInBand
npm run build
npm run test:pwa
git diff --check
```

`npm run test:gas-sync` does not exist until Task 6 adds it.

## Remaining Work: Tasks 6–12

Follow the detailed plan exactly and keep this order.

### Task 6 — GAS idempotency and optimistic version checks

This is the next task.

Authoritative backend:

```text
D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\gas-live\Code.js
```

Do not edit the stale repository copy:

```text
D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\wt-mobile-pwa\gas\
```

Current authoritative `Code.js` state observed at handoff:

```text
Length: 29986 bytes
Last modified: 2026-07-18 10:36:13
SHA256: EBD0E1D13B8A56AC828ECB20780F6110F652BB6D44F5BDD720202EA7855C9AAF
Existing Code.js.pre-pwa-sync* backups: 0
```

Before editing, create the exact backup required by the plan and verify matching SHA256 hashes. Never overwrite an existing backup.

Task 6 must:

- Add repository-owned `tools/gas-sync-contract.test.cjs`.
- Add `npm run test:gas-sync`.
- Add additive `SyncMeta` and `SyncRequests` sheets without removing or reordering business columns.
- Add shared domain-key, version-check, and response helpers with guarded Node exports.
- Check `requestId` idempotency under the existing GAS script lock before applying a mutation.
- Return the original stored response for duplicate requests.
- Validate `baseVersion`; return structured conflicts with current server/local records and sorted conflicting fields.
- Return a diagnostic `SYNC_META_ORPHAN` validation error instead of guessing when metadata and business rows disagree.
- Make legacy write paths advance sync metadata.
- Add `syncMeta` to `getData` responses.
- Run syntax, contract, and frontend regression tests.

The GAS file is outside the Git repository. Commit only repository-owned contract/test assets. For review, include an explicit no-index diff between the verified backup and current `Code.js`; normal `git diff` cannot show the backend change.

Deployment is an external production mutation. Confirm the deployed code, backup, test evidence, and exact target before running:

```powershell
Set-Location 'D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\gas-live'
clasp push -f
clasp redeploy AKfycbyRUl5BVmZYDhw_Z0Uo2LWBLmaQAaOjJZR4jLGw-MuxHIFcKEhu7FBF9tV33JAnKz1aTw
```

After deployment, run `setupSheets()` once as the owner and perform only the non-destructive GET smoke check specified in the plan.

### Task 7 — React hydration from IndexedDB

- Add `OfflineProvider` and `useOfflineData`.
- Open/stage/create/start offline services once and clean them up on unmount.
- Request persistent storage where supported.
- Replace the direct `App.jsx` GET effect with cached-first repository hydration.
- Preserve all existing component state/prop contracts while write migration remains pending.
- Ignore late responses after machine switches.

### Task 8 — Queue segment, grout, and shift writes

- Add integration tests for create/update/delete envelopes.
- Add one App-level mutation adapter.
- Replace direct core `apiCall` writes for segments, primary grout, secondary grout, and shift reports.
- Use `syncMeta[domainKey]?.version || 0` as the base version.
- Preserve validation/form behavior and distinguish device-local save from server confirmation.

### Task 9 — Queue all remaining business writes

- Migrate issues, daily reports, prep tasks/baselines, plan/distance/route configs, instruments, readings, and schedules.
- Reconcile staged legacy caches without silent import.
- Stop active React paths from using business `localStorage`; retain only UI preferences and migration-only compatibility reads.
- Keep online-only proxies such as Drive/Gemini behind `apiCall`.

### Task 10 — App-wide sync, conflict, install, and update UI

- Add global network/sync status available from every page.
- Add Sync Center tabs for pending, errors, conflicts, and recent confirmations.
- Add server/local/manual conflict resolution UI.
- Add Android install prompt and iPhone Safari Add to Home Screen instructions.
- Add safe service-worker update confirmation without clearing IndexedDB.
- Wire shared state at the Shell root for desktop and mobile.

### Task 11 — Online-only guards and recovery

- Add storage-health checks and an emergency recovery JSON export.
- Warn at 80% storage usage without deleting business stores.
- Redact binary image payloads from recovery exports.
- Add explicit offline behavior for Gemini, PDF helper, Drive slideshow, and ArcGIS background tiles.
- Add recovery controls to Sync Center; do not add a destructive “clear all data” action.

### Task 12 — Production verification and staged rollout

- Run PWA, GAS contract, frontend, build, syntax, and diff gates.
- Serve and test the production build offline.
- Verify conflict/idempotency using dedicated non-production test records in two browser profiles.
- Create the Android/iPhone Vercel preview matrix.
- Write deploy/rollback runbook and test matrix.
- Pilot in three gates: Android+iPhone, 2–3 field users, then approximately ten users.
- Promote only with duplicate count `0` and data-loss count `0`.

## Critical Safety Notes

1. **Do not edit `TunnelBoringMonitoring/gas/`.** The deployed/clasp-managed source is the sibling `gas-live/Code.js`.
2. **Back up GAS before Task 6.** Verify the backup hash before any edit.
3. **Do not deploy merely because local tests pass.** GAS and Vercel deployment are externally visible actions; validate the exact target and rollback artifact first.
4. **Do not use production engineering records for smoke/conflict testing.**
5. **Do not remove pending mutations, conflicts, or IndexedDB business records automatically.**
6. **Do not let an older same-domain mutation or stale runner owner overwrite newer optimistic state.**
7. **Do not bypass per-domain FIFO.** Unrelated domains may proceed, but successors in the same domain wait for the head to become terminal.
8. **Do not silently merge engineering conflicts.**
9. **Do not claim server success before GAS confirms it.**
10. **Do not clean the original checkout or other worktrees.** They contain unrelated user work.
11. **Do not commit generated `build/` newline-only changes.** Regenerate production output for verification/deployment, then keep source commits scoped.
12. **Do not run destructive dependency upgrades or audit fixes in this feature.**

## How to Resume

1. Open the feature worktree and verify branch/status.
2. Read this file, the approved design, and the detailed implementation plan.
3. Confirm commits through `930b082` exist.
4. Run the full baseline tests.
5. Extract only Task 6 from the detailed plan.
6. Follow strict test-first development: add failing contract tests, capture the expected failure, then implement.
7. Back up and hash `gas-live/Code.js` before editing it.
8. Run focused tests, `node -c` for GAS, the full frontend suite, and `git diff --check`.
9. Review spec compliance and code quality separately.
10. Fix every blocker/major/minor finding with regression tests and re-review until both verdicts pass.
11. Record the completed task, commit SHAs, review verdicts, and test counts in a durable committed document. The ignored SDD ledger may also be updated on this machine.
12. Continue Tasks 7–12 sequentially.

Recommended Task 6 verification:

```powershell
Set-Location 'D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\wt-mobile-pwa'
node -c '..\gas-live\Code.js'
npm run test:gas-sync
npm test -- --watchAll=false --runInBand
git diff --check
git status --short
```

## Copy-Ready Prompt for Claude

```text
Continue the approved mobile PWA offline-sync implementation.

Work only in:
D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\wt-mobile-pwa

Branch:
feat/mobile-pwa-offline-sync

First read completely:
1. CLAUDE_HANDOFF.md
2. docs/superpowers/specs/2026-07-29-mobile-pwa-offline-sync-design.md
3. docs/superpowers/plans/2026-07-29-mobile-pwa-offline-sync.md

Tasks 1–5 are complete through application commit 930b082 and passed independent spec and code-quality review. The latest verified frontend baseline is 60 suites / 688 tests.

Resume at Task 6 only: “Add GAS idempotency and optimistic version checks.”

The authoritative GAS backend is outside the repository:
D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\gas-live\Code.js

Do not edit the stale wt-mobile-pwa\gas directory. Before changing Code.js, create the exact pre-sync backup required by Task 6 and verify matching SHA256 hashes. At handoff the source hash was:
EBD0E1D13B8A56AC828ECB20780F6110F652BB6D44F5BDD720202EA7855C9AAF

Use strict test-first development:
- add the Task 6 contract test and prove it fails for the expected missing helpers;
- implement the smallest correct GAS/server contract;
- preserve existing business columns and legacy actions;
- run node syntax, focused contract, full frontend, and diff checks;
- include a no-index backup-vs-current GAS diff in review because Code.js is outside Git;
- review spec compliance and code quality separately;
- fix every finding with regression coverage and re-review until both pass;
- record commit SHA, backend hash/backup path, test counts, and review verdicts.

Do not deploy GAS or Vercel until the exact target, verified backup, rollback path, and all required tests have been confirmed. Never use production engineering records for smoke tests.

After Task 6 passes review, continue Tasks 7–12 in the written order. Preserve unrelated worktrees and user-owned files.
```
