# TunnelBoringMonitoring

Tunnel Monitoring System — segment and grout records, shift reports, dashboards, alignment map and
instrument monitoring for the Khlong Prem Prachakon drainage tunnel. React 18 (CRA) + Tailwind, with
Google Apps Script over a Google Sheet as the backend.

## Offline-first mobile app

On branch `feat/mobile-pwa-offline-sync` the app installs to a phone and works underground with no
signal:

- **Reads** come from an IndexedDB snapshot of the last successful `getData`. Every tab that has been
  opened once online opens again offline; a tab whose data was never loaded says so explicitly.
- **Writes** go into a durable mutation queue — segment, grout, shift report, issue, daily report,
  prep task, instrument and config families — and are posted when the link returns. Each write
  carries a `requestId`, so a retry after a dropped POST produces one row on the sheet, not two.
- **Conflicts** are shown, never silently applied: the crew sees both sides field by field and
  chooses the server's row, this device's row, or a value they type.
- **สถานะการซิงก์** (the Sync Center) shows what is queued, what is stuck and why, storage usage,
  and can export everything unsynced to a file for recovery.
- Online-only features — the Gemini analysis, the localhost PDF helper, the Drive slideshow, the
  satellite basemap — say what is missing instead of failing slowly.

### Working on it

```powershell
npm start                                  # dev server
npm test -- --watchAll=false --runInBand   # 91 suites / 1294 tests
npm run test:gas-sync                      # 92 contract assertions against gas-live/Code.js
npm run test:pwa                           # build + manifest/service-worker assertions
npm run build
```

The Apps Script backend is **outside this repository**, at `../gas-live/Code.js`. The `gas/`
directory here holds a setup note only — there is no deployable copy in this repo.

### Before deploying

Read [`docs/mobile-pwa-runbook.md`](docs/mobile-pwa-runbook.md) — deploy order, the GAS backup
procedure, rollback, and the promotion gate — and work through
[`docs/mobile-pwa-test-matrix.md`](docs/mobile-pwa-test-matrix.md), whose device rows cannot be
signed off from a desktop browser.

**This app has no login.** Anyone with the URL can read and write, and `?view=1` is a convenience
flag, not a permission boundary.
