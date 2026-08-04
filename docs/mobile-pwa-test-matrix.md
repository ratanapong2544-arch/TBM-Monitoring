# Mobile PWA — verification matrix

Branch `feat/mobile-pwa-offline-sync`, at the wire-timing commit (see `git log`).
Two kinds of row below: **automated**, which a machine has already checked, and **device**, which a
person has to do on a real phone before this ships. Nothing here has been run on a phone yet.

---

## 1. Automated gate — recorded, not predicted

| Command | Result, as read |
|---|---|
| `npm test -- --watchAll=false --runInBand` | **92 suites / 1302 tests pass** |
| `npm run test:gas-sync` | **92 pass, 0 fail** |
| `npm run test:pwa` | build + **3 pass, 0 fail** |
| `npm run build` | `Compiled successfully` |
| `node -c "..\gas-live\Code.js"` | clean |
| `git diff --check` | clean |

The frontend suite grew with the work: 852 (Task 7) → 991 (Task 8) → 1071 (Task 9) → 1254 (Task 10)
→ 1286 (Task 11) → 1302 (final review + wire timing).

---

## 2. Device rows — none of these are done

Sign a row only after doing it on the named device. "It worked in DevTools" is not this column.

### Install and launch

| # | Device | Steps | Expected | Done |
|---|---|---|---|---|
| 1 | Android Chrome | install from the preview URL, open from the home screen | standalone window, no browser chrome, app icon correct | ☐ |
| 2 | iPhone Safari | Share → Add to Home Screen, open it | standalone, status bar readable, safe area respected | ☐ |
| 3 | both | open every tab once with signal | every tab renders, no console error | ☐ |

### Offline shell and reads

| # | Device | Steps | Expected | Done |
|---|---|---|---|---|
| 4 | both | after #3, enable airplane mode, force-quit, reopen | app opens; every tab navigable | ☐ |
| 5 | both | tab whose data was never loaded online | explicit empty state, not a spinner and not a crash | ☐ |
| 6 | both | check the status button | says ออฟไลน์ with the date AND time of the snapshot | ☐ |

### Queue and conflict

| # | Device | Steps | Expected | Done |
|---|---|---|---|---|
| 7 | both | offline: record a segment, a grout, a shift report | rows appear immediately, counted as "รอส่ง" | ☐ |
| 8 | both | force-quit and reopen while still offline | the queued writes are still there and still counted | ☐ |
| 9 | both | restore signal, leave the app open | queue drains by itself, count reaches 0, rows on the sheet exactly once | ☐ |
| 10 | two browser profiles | same record on both; A offline edits; B edits and syncs; A reconnects | A gets a conflict; **B's row is not overwritten** | ☐ |
| 11 | two profiles | resolve with เก็บของเซิร์ฟเวอร์ / เก็บของเครื่องนี้ / พิมพ์ค่าเอง on **three separate test records** | each behaves as its button says; the ring never disappears from the data log | ☐ |
| 12 | any | post the same `requestId` twice (kill the app mid-POST and let it retry) | **one** row on the sheet | ☐ |

> Use dedicated test rings, agreed with the site team and written down here before the run. **Never
> use production engineering records for conflict or smoke testing.**
>
> Test records used: _(fill in before testing)_

### Network behaviour

| # | Device | Steps | Expected | Done |
|---|---|---|---|---|
| 13 | both | drop the link **during** a POST | write stays queued, retried, still lands once | ☐ |
| 14 | both | slow link (throttle or real edge-of-coverage) | no duplicate write, no lost write | ☐ |
| 15 | **underground** | in the tunnel, with whatever signal there is: switch machine TBM1 → TBM2 → TBM1 (each switch is one real `getData`), then record one segment and let it send. Back up top, open **สถานะการซิงก์** and read "เวลาที่ใช้จริงล่าสุด" | two numbers, in seconds. No cable, no desktop, no Mac — see §3 | ☐ |

### Recovery and storage

| # | Device | Steps | Expected | Done |
|---|---|---|---|---|
| 16 | both | Sync Center with writes queued → ส่งออกข้อมูลที่ยังไม่ซิงก์ | a `tbm-offline-recovery-*.json` file is saved and openable | ☐ |
| 17 | both | read the exported file | contains the request ids and full payloads; photos as `{omitted:true}`; no key, no backend URL | ☐ |
| 18 | both | Sync Center storage line | usage/quota shown; says whether the browser may evict | ☐ |

### Update

| # | Device | Steps | Expected | Done |
|---|---|---|---|---|
| 19 | both | deploy a new build while the app is open with writes queued | update banner appears; reload only after tapping it | ☐ |
| 20 | both | after the update | **the queue is still there** and still drains | ☐ |

### Online-only features (Task 11)

| # | Device | Steps | Expected | Done |
|---|---|---|---|---|
| 21 | both | offline: the AI analysis button | disabled, says ต้องเชื่อมต่ออินเทอร์เน็ต, does not open the modal | ☐ |
| 22 | both | offline: site-photo slideshow | says the photos need a link; no spinner loop; rest of the page normal | ☐ |
| 23 | both | offline: alignment map | route, shafts, tube, head still drawn; one line about the missing basemap | ☐ |
| 24 | phone | daily report → build PDF | names the phone case and points at browser print; bundle still downloads | ☐ |

### Layout

| # | Device | Steps | Expected | Done |
|---|---|---|---|---|
| 25 | both | every tab in portrait | nothing hidden behind the bottom nav; charts, map, 3D, reports render | ☐ |
| 26 | both | print / Ctrl+P from a phone-sized viewport | pages fit as they do on desktop | ☐ |

---

## 3. The three deadlines — estimates, not measurements

| Constant | Value | Where | Basis |
|---|---|---|---|
| `SNAPSHOT_FETCH_TIMEOUT_MS` | 90 s | `src/offline/apiTransport.js` | reasoned from a 463 KB `getData` and an assumed ~100 kbps floor — **the payload is now 1.84 MB**, see below |
| `SYNC_POST_TIMEOUT_MS` | 90 s | `src/offline/apiTransport.js` | sized for an unresized phone photo, above GAS's lock wait plus cold start |
| `SYNC_LEASE_MS` | POST + 30 s | `src/offline/syncRunner.js` | derived, deliberately longer than the POST deadline |

### The payload has quadrupled since the deadline was chosen

Measured 2026-08-04 against deployment `@20`: one `getData` for TBM1 returns **1,839,003 bytes**. The
90 s deadline was reasoned from 463 KB at an assumed ~100 kbps floor — about 37 s of transfer, with
headroom. At 1.84 MB the same floor gives **roughly 147 s, which is past the deadline**: the request
would be called dead while it was still arriving, and the app would fall back to the cached snapshot
every time on a link that slow.

Nothing is changed on that basis yet, because the ~100 kbps floor is itself an assumption. Row 15
measures the real thing, and the payload size is now a measured input to it rather than a guess. If
the tunnel reading is anywhere near the deadline, the fix is not only a longer timeout — a 1.84 MB
snapshot on a metered phone link is worth reducing at the source.

**None of these has been timed against a real underground link.** Row 15 is what fixes that. A false
"dead" verdict on the GET costs a stale snapshot; on the write it costs a report whose outcome is
unknown until the next refresh.

**There is no manual refresh button.** A `getData` happens on app launch and on a machine switch, and
nothing else calls it — `refresh()` exists on the hook with no caller. So the way to make one happen
on purpose is to switch machine, or to close the app and open it again.

The app measures both itself. `เวลาที่ใช้จริงล่าสุด` at the bottom of the Sync Center shows the last
**successful** `getData` and the last **successful** write, in seconds, recorded on the device and
kept across relaunches — the phone is read after coming back up, not during. Remote inspection needs
a USB cable and a desktop for Android, and a Mac for an iPhone; neither goes down a shaft.

Measured on \_\_\_\_\_\_ (date), \_\_\_\_\_\_ (location): `getData` \_\_\_\_ s, segment write \_\_\_\_ s.
Adjust the constants and re-run the automated gate if either measurement is within 2× of its deadline.

---

## 4. Pilot record

One row per gate. Promotion needs duplicates `0` **and** losses `0` — see the runbook §9.

| Gate | Date | Users | Oldest pending | Sync failures | Conflicts | Storage | **Duplicates** | **Records lost** | Promoted? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | ☐ |
| 2 | | | | | | | | | ☐ |
| 3 | | | | | | | | | ☐ |
