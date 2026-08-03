# Mobile PWA — deploy, rollback and recovery runbook

Branch: `feat/mobile-pwa-offline-sync` · run `git log --oneline -1` for the current head
**Nothing in this branch has been deployed.** Neither Vercel nor GAS has been touched by it.

---

## 0. What this branch changes, in one paragraph

The app becomes installable and usable with no signal. Reads come from an IndexedDB snapshot of the
last successful `getData`; writes go into a durable mutation queue and are posted when the link
returns, once each, with conflicts surfaced to the crew instead of being silently applied. A Sync
Center shows what is queued, what is stuck, and what disagrees with the sheet, and can export
everything unsynced to a file.

---

## 1. Promotion gate — not negotiable

**Tasks 7, 8 and 9 ship together, or none of them do.**

Tasks 2 and 7 are what make the app openable and usable offline, and that made a pre-existing hole
reachable for the first time: a non-empty server response replaced the localStorage-primary
collections wholesale — the `serverAuthoritative` branch in `App.jsx`, **removed on this branch at
`8e1ce19`** (`src/App.jsx` documents the removal and why keeping the rule would have made an offline
launch show none of those collections). A record created offline whose `apiCall` never landed was
destroyed the first time the server answered. Offline **reads** are new; durable offline **writes**
arrive with the mutation queue (Task 8) and legacy reconciliation (Task 9). Deploying Task 7 alone
would contradict the one promise this work exists to make.

Tasks 10 and 11 (Sync Center, online-only guards, recovery export) are on the same branch and ship
with them.

---

## 2. Pre-deploy gate — every command must be read, not grepped

```powershell
npm run test:pwa          # build + 3 manifest/build assertions
npm run test:gas-sync     # 92 contract assertions against gas-live/Code.js
npm test -- --watchAll=false --runInBand
npm run build
node -c "..\gas-live\Code.js"
git diff --check
```

Recorded results: **92 suites / 1302 tests pass**, GAS contract **92 pass 0 fail**,
`Compiled successfully`, `node -c` clean, `git diff --check` clean.

> `grep -c FAIL` on a test run exits 0 on a match. A red suite was committed that way once on this
> branch. Read the summary line.

---

## 3. Deploy order — GAS first

**The live Apps Script is still the pre-sync version.** `gas-live/Code.js` holds the sync work
locally (86 KB, modified 2026-07-30); `gas-live/Code.js.pre-pwa-sync` (30 KB, 2026-07-18) is what was
deployed before it and what the web app is still running. Nothing on this branch has been pushed.

So: **GAS is deployed before the front end.** A front end that stamps `requestId` and `baseVersion`
on every write, talking to a backend that ignores them, has no idempotency and no conflict detection
— a retry after a dropped POST writes the row twice, which is the exact failure this work exists to
prevent.

Rollback runs the other way round (§5): front end first, GAS only from a verified backup.

## 4. GAS backend

The authoritative backend is **outside the repo**: `D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\gas-live\Code.js`
(scriptId in `gas-live/.clasp.json`). Nothing in `wt-mobile-pwa/gas` is deployable — it holds one
setup note, no `Code.js` — so `gas-live` is the only place to edit.

### Before any change to Code.js

```powershell
Copy-Item "..\gas-live\Code.js" "..\gas-live\Code.js.pre-<change-name>"
Get-FileHash "..\gas-live\Code.js", "..\gas-live\Code.js.pre-<change-name>" -Algorithm SHA256
```

Both hashes must match. **Never overwrite an existing backup** — the backups already present
(`Code.js.bak`, `Code.js.pre-inst`, `Code.js.pre-pwa-sync`) are the rollback points for earlier work.

### Deploy

```powershell
cd "..\gas-live"
clasp push
clasp deploy -d "<what changed>"
clasp deployments        # note the new @N and its AKfycb... id
```

The front end talks to the **web app URL of the deployment it was built against**. A new deployment
id that the front end does not know about changes nothing until the front end is rebuilt.

### Owner action that cannot be automated

`setupSheets()` must be run once from the Apps Script editor by the sheet owner for any new sync
sheet. It creates the additive sync columns; it does not touch existing business columns.

---

## 5. Front end (Vercel)

Production project: **tbm-monitoring-mhkr**, from GitHub `ratanapong2544-arch/TBM-Monitoring`.
Vercel builds from source — do not commit `build/`.

1. Push the branch and let Vercel build a **preview**.
2. Verify the preview against `mobile-pwa-test-matrix.md` — on real devices, not only DevTools.
3. Promote to production only after the matrix rows that need a device are signed.

### Service-worker update behaviour

A new build installs in the background and waits. The app shows the update banner; the reload
happens only after `controllerchange` — which IS asserted by the suite — so a crew is never swapped
onto a new build mid-write. An update never clears IndexedDB: the `activate` handler deletes stale
`tbm-precache-*` Cache Storage keys and nothing else (`src/pwa/service-worker.js`). That part is true
by inspection, **not by test** — no test imports the service worker. Row 20 of the matrix is what
checks it on a device.

---

## 6. Rollback

**Order matters.**

1. **Front end first**, if the wire contract is unchanged: redeploy the previous Vercel production
   deployment. The queue's envelopes and the sheet's sync columns are additive, so an older front end
   still reads a newer sheet.
2. **GAS only from a verified backup**, and only if the contract itself is the problem:
   ```powershell
   Copy-Item "..\gas-live\Code.js.pre-pwa-sync" "..\gas-live\Code.js"
   Get-FileHash ...   # confirm it matches the backup
   clasp push ; clasp deploy -d "rollback to pre-pwa-sync"
   ```
3. Never roll GAS back while a newer front end is live in production: the front end stamps
   `requestId`/`baseVersion` on every write and an older backend ignores them, which is exactly the
   duplicate-row failure this work exists to prevent.

### Before rolling anything back

Ask the crews to open **สถานะการซิงก์ → ส่งออกข้อมูลที่ยังไม่ซิงก์** and send the file. A rollback
that strands queued writes is recoverable from those files and from nothing else.

---

## 7. Device and browser maintenance

Before wiping site data, changing browser, or handing a phone over:

1. open the app while the phone still has the data,
2. **สถานะการซิงก์ → ส่งออกข้อมูลที่ยังไม่ซิงก์**,
3. keep the `tbm-offline-recovery-YYYYMMDD-HHmm.json` file.

The file holds request ids and full payloads for everything not yet on the sheet. Photo bytes are
reported as `{ "omitted": true, "reason": "binary payload" }` rather than carried — the file stays
sendable and still says a photo existed.

**Known limitation, state it to the crews:** clearing site data, uninstalling the PWA, or losing the
device removes any write that has not reached the sheet. The queue is durable against app restarts,
device restarts and updates — not against deletion.

---

## 8. Security note — no login

This app has no authentication. Anyone with the URL can read and write, and `?view=1` is a
convenience flag, not a permission boundary. The recovery export contains engineering records: treat
the file as project data, do not post it anywhere public. It contains no key and no backend URL, and
a test asserts that.

---

## 9. Pilot — three gates

Do not go from zero to ten users.

| Gate | Who | Minimum before promotion |
|---|---|---|
| 1 | one Android + one iPhone, one shift | duplicate count 0, data-loss count 0 |
| 2 | two or three field users, one week | duplicate count 0, data-loss count 0 |
| 3 | all ~10 users | — |

At each gate record: oldest pending age, sync failures, conflicts raised and how they were resolved,
storage usage from the Sync Center, **duplicate rows created**, **records lost**. Promotion requires
duplicates `0` and losses `0`. Anything else stops the rollout and is investigated before gate 3.
