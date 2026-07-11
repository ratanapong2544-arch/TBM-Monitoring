# Instrument Monitoring Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มโมดูล "Instrument" (เครื่องมือวัด: settlement/inclinometer/piezometer/extensometer) เข้าแอป TBM Monitoring — dashboard สถานะ + report viewer + วาระตรวจวัด + blueprint plot โดยข้อมูลอยู่บน Google Sheets และนำเข้าค่าจาก PDF ผ่าน Claude session (skill)

**Architecture:** nav group ที่ 6 + 3 views ใหม่ใน React CRA เดิม · ข้อมูล 5 ตาราง `Inst_*` บน Sheets ผ่าน GAS (`../gas-live/Code.js`) · logic เป็น pure util (TDD) · migrate seed จากแอป Next.js เดิม · report viewer port จาก `tunnel-monitoring/.../reports/` · ingestion ผ่าน skill ไม่ build ในแอป

**Tech Stack:** React 18 (CRA), recharts 3, lucide-react, Google Apps Script + Google Sheets, jest (jsdom), Node script สำหรับ migration

## Global Constraints

- **Backend แก้ที่ `D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\gas-live\Code.js` เท่านั้น** — ห้ามแตะ `TunnelBoringMonitoring/gas/` (เอกสาร)
- **ห้าม hardcode GAS_URL ใน component** — ผ่าน `src/utils/constants.js` + `src/utils/api.js` เท่านั้น
- **Tailwind = Play CDN** — token สีนิยามใน `public/index.html` (`tailwind.config={...}`) ไม่มี `tailwind.config.js`; token ที่ใช้มีครบ: `navy/navy-dark`, `ink/ink-2/ink-3`, `line`, `surface/surface-page/surface-alt`, badge `code-a`(เขียว)/`code-b`(gold)/`code-c`(ส้ม)/`code-d`(แดง)
- **สถานะ instrument → Badge code:** `normal→a` · `alert→b` · `alarm→c` · `action→d`
- **Zero-hallucination:** ค่า engineering (ค่าวัด/threshold/chainage) ห้ามเดา — migration/skill ต้องอ่านจากต้นทางจริงเท่านั้น
- **Scope = project-wide** — instrument sheets ไม่ split `_TBM2` (ต่างจาก Segments); ไม่มีคอลัมน์ machine
- **Persistence pattern:** getData โหลดครั้งเดียว → state ใน `App.jsx` → mirror `localStorage` + write ผ่าน `apiCall(action, data)` แบบ fire-and-forget `.catch(warn)` (offline-first ตาม issues)
- **jest baseline ต้องเขียว** (ปัจจุบัน 143+ ผ่าน) — งานนี้เพิ่ม test ใหม่ ห้าม break เดิม
- **ทุก write action ฝั่ง GAS:** ผ่าน `LockService.tryLock` + `ensureSheet_`/`ensureHeaders_` + คืน `jsonOut_` + `lock.releaseLock()` ก่อน return ทุก path
- **Deploy GAS = manual** หลังแก้ Code.js: `clasp push -f` → `clasp redeploy AKfycbyRUl5...aTw` → เปิด editor รัน `setupSheets` 1 ครั้ง (owner-only) — Claude ทำแทนไม่ได้; ต้องแจ้ง user
- ทุก view รับ prop `readOnly` (จาก `isViewer`) เพื่อซ่อนปุ่ม edit

---

## File Structure

**Create (ใหม่):**
- `src/utils/instrumentStatus.js` — classify สถานะ + threshold model (pure)
- `src/utils/instrumentSchedule.js` — DISTANCE/LONG_TERM due logic (pure)
- `src/utils/chainageAdapter.js` — TBM position → STA chainage (reuse route logic เดิม)
- `src/utils/instruments.js` — localStorage cache + helper (mirror pattern issues.js)
- `src/utils/instrumentData.js` — profileJson parse/serialize + preset transform helper
- `src/components/views/InstrumentDashboardView.jsx`
- `src/components/views/InstrumentLocationView.jsx`
- `src/components/views/InstrumentScheduleView.jsx`
- `src/components/instrument/InstrumentReportTabs.jsx` — tabs INC/EXT/PI/SS (port ReportTabs)
- `src/components/instrument/reports/InclinometerReport.jsx` / `ExtensometerReport.jsx` / `PiezometerReport.jsx` / `SurfaceSettlementReport.jsx`
- `src/components/instrument/reports/shared/ChartFrame.jsx` / `RawDataTable.jsx` / `chartUtils.js`
- `src/components/instrument/BlueprintPlot.jsx`
- `src/components/instrument/InstrumentFormModal.jsx` — edit เบาๆ (port IssueFormModal)
- `src/components/instrument/InstrumentStatusBadge.jsx`
- `tools/migrate-instruments.mjs` — one-time seed → bulkImport payload
- `skill/instrument-pdf-ingest/SKILL.md` — ingestion workflow
- test: `*.test.js` ข้างไฟล์ util แต่ละตัว

**Modify:**
- `../gas-live/Code.js` — HEADERS + setupSheets + getData + write actions + bulkImport
- `src/App.jsx` — state + getData parse + handlers + view routes
- `src/ui-ux-pro-max/components/navModel.js` — nav group ที่ 6 + MOBILE_MORE_TABS
- `src/utils/viewerMode.js` — VIEWER_TABS + navModel `viewerGroups()`

---

## Phase 1 — Core Logic Utils (TDD, ไม่แตะ UI/GAS)

### Task 1.1: `instrumentStatus.js` — classify สถานะเทียบ threshold

**Files:**
- Create: `src/utils/instrumentStatus.js`
- Test: `src/utils/instrumentStatus.test.js`

**Interfaces:**
- Produces:
  - `classifyStatus(value: number|null, th: {alert,alarm,action}|null) → "normal"|"alert"|"alarm"|"action"`
  - `STATUS_BADGE = { normal:"a", alert:"b", alarm:"c", action:"d" }`
  - `STATUS_ORDER = { normal:0, alert:1, alarm:2, action:3 }`
  - `worstStatus(list: string[]) → string` — สถานะรุนแรงสุดในกลุ่ม

- [ ] **Step 1: เขียน test ที่ fail**

```js
// src/utils/instrumentStatus.test.js
import { classifyStatus, STATUS_BADGE, STATUS_ORDER, worstStatus } from "./instrumentStatus";

describe("classifyStatus", () => {
  const th = { alert: 15, alarm: 17, action: 20 };
  test("null/ไม่มี threshold → normal", () => {
    expect(classifyStatus(null, th)).toBe("normal");
    expect(classifyStatus(10, null)).toBe("normal");
  });
  test("ต่ำกว่า alert → normal", () => expect(classifyStatus(14.9, th)).toBe("normal"));
  test("ถึง alert → alert", () => expect(classifyStatus(15, th)).toBe("alert"));
  test("ถึง alarm → alarm", () => expect(classifyStatus(17, th)).toBe("alarm"));
  test("ถึง action → action", () => expect(classifyStatus(21, th)).toBe("action"));
  test("ค่าติดลบใช้ absolute (inclinometer ±)", () => expect(classifyStatus(-21, th)).toBe("action"));
});

test("STATUS_BADGE map ครบ 4 ระดับ", () => {
  expect(STATUS_BADGE).toEqual({ normal:"a", alert:"b", alarm:"c", action:"d" });
});

test("worstStatus คืนระดับรุนแรงสุด", () => {
  expect(worstStatus(["normal","alarm","alert"])).toBe("alarm");
  expect(worstStatus(["normal","normal"])).toBe("normal");
  expect(worstStatus([])).toBe("normal");
});
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npx react-scripts test src/utils/instrumentStatus.test.js --watchAll=false`
Expected: FAIL — "Cannot find module './instrumentStatus'"

- [ ] **Step 3: เขียน implementation**

```js
// src/utils/instrumentStatus.js
// จัดระดับสถานะจากค่าที่วัด เทียบ threshold (alert < alarm < action, ใช้ absolute รองรับ ±)
export const STATUS_BADGE = { normal: "a", alert: "b", alarm: "c", action: "d" };
export const STATUS_ORDER = { normal: 0, alert: 1, alarm: 2, action: 3 };

export function classifyStatus(value, th) {
  if (value == null || value === "" || !th) return "normal";
  const v = Math.abs(Number(value));
  if (isNaN(v)) return "normal";
  const action = Number(th.action), alarm = Number(th.alarm), alert = Number(th.alert);
  if (!isNaN(action) && v >= action) return "action";
  if (!isNaN(alarm) && v >= alarm) return "alarm";
  if (!isNaN(alert) && v >= alert) return "alert";
  return "normal";
}

export function worstStatus(list) {
  return (list || []).reduce(
    (worst, s) => (STATUS_ORDER[s] > STATUS_ORDER[worst] ? s : worst),
    "normal"
  );
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npx react-scripts test src/utils/instrumentStatus.test.js --watchAll=false`
Expected: PASS ทุก test

- [ ] **Step 5: Commit**

```bash
git add src/utils/instrumentStatus.js src/utils/instrumentStatus.test.js
git commit -m "feat(instrument): add status classification util"
```

---

### Task 1.2: `chainageAdapter.js` — ตำแหน่ง TBM → STA chainage

> **Interfaces ก่อนเริ่ม:** ต้องรู้รูปของ `machineProgress` และ `routeConfig` ที่ getData คืน — โครงคือ `machineProgress = { TBM1:{rings,dist}, TBM2:{rings,dist} }` (จาก Code.js) และ route ใช้ constant `CH_EXCAV_START`, `TOTAL_ROUTE_DISTANCE` ใน `constants.js` การขุดเริ่มที่ CH สูงแล้วเดินหน้าลด CH ลง (ตรวจทิศทางจริงใน Step 1)

**Files:**
- Create: `src/utils/chainageAdapter.js`
- Test: `src/utils/chainageAdapter.test.js`
- Read (อ้างอิง): `src/utils/routeConfig.js`, `src/components/views/RouteScheduleView.jsx`, `src/utils/constants.js`

**Interfaces:**
- Produces:
  - `currentChainage(machineProgress: object, machine: string) → number|null` — คืน STA (เมตร) ปัจจุบันของเครื่อง
  - `stationLabel(sta: number) → string` — เช่น `8375.35 → "8+375"`

- [ ] **Step 1: อ่านสูตร chainage ที่ใช้อยู่จริง**

อ่าน `src/utils/routeConfig.js` + `src/components/views/RouteScheduleView.jsx` + constants `CH_EXCAV_START`/`TOTAL_ROUTE_DISTANCE`/`CH_START_P36` ใน `src/utils/constants.js` เพื่อหา:
- `machineProgress[machine].dist` (ระยะที่เจาะแล้ว, m) แปลงเป็น STA ปัจจุบันอย่างไร (บวก/ลบจาก CH เริ่ม)
- ทิศทางการเดินหน้า (STA เพิ่มหรือลด)
จดสูตรจริงที่ได้ (เช่น `sta = CH_EXCAV_START - dist` หรือ `+ dist`) เพื่อใช้เขียน test/impl — **ห้ามเดา ใช้ค่าจากไฟล์จริง**

- [ ] **Step 2: เขียน test ด้วยค่าจริงจาก Step 1**

```js
// src/utils/chainageAdapter.test.js
import { currentChainage, stationLabel } from "./chainageAdapter";

test("stationLabel format STA", () => {
  expect(stationLabel(8375.35)).toBe("8+375");
  expect(stationLabel(1690)).toBe("1+690");
});

test("currentChainage คืน null เมื่อไม่มีข้อมูล", () => {
  expect(currentChainage(null, "TBM1")).toBeNull();
  expect(currentChainage({}, "TBM1")).toBeNull();
});

test("currentChainage แปลง dist → STA ตามสูตรจริง", () => {
  // ⚠ แทนค่า EXPECTED จากสูตรที่ยืนยันใน Step 1 (เช่น ถ้า sta = CH_EXCAV_START - dist)
  const mp = { TBM1: { rings: 100, dist: 200 }, TBM2: { rings: 0, dist: 0 } };
  const sta = currentChainage(mp, "TBM1");
  expect(typeof sta).toBe("number");
  // expect(sta).toBeCloseTo(<ค่าจากสูตรจริง>, 1);
});
```

- [ ] **Step 3: รัน test ให้ fail**

Run: `npx react-scripts test src/utils/chainageAdapter.test.js --watchAll=false`
Expected: FAIL — module not found

- [ ] **Step 4: เขียน implementation ตามสูตรจริงจาก Step 1**

```js
// src/utils/chainageAdapter.js
import { CH_EXCAV_START } from "./constants";

// แปลงระยะที่เจาะแล้วของเครื่อง → STA chainage ปัจจุบัน
// ⚠ ทิศทาง (+/-) ต้องตรงกับที่ยืนยันใน Step 1 จาก routeConfig/RouteScheduleView
export function currentChainage(machineProgress, machine) {
  if (!machineProgress || !machineProgress[machine]) return null;
  const dist = Number(machineProgress[machine].dist);
  if (isNaN(dist)) return null;
  return CH_EXCAV_START - dist; // ← แก้เป็นสูตรจริงจาก Step 1
}

export function stationLabel(sta) {
  if (sta == null || isNaN(Number(sta))) return "-";
  const n = Math.round(Number(sta));
  const km = Math.floor(n / 1000);
  const m = String(n % 1000).padStart(3, "0");
  return `${km}+${m}`;
}
```

- [ ] **Step 5: รัน test ให้ผ่าน + Commit**

Run: `npx react-scripts test src/utils/chainageAdapter.test.js --watchAll=false`
Expected: PASS
```bash
git add src/utils/chainageAdapter.js src/utils/chainageAdapter.test.js
git commit -m "feat(instrument): add TBM chainage adapter"
```

---

### Task 1.3: `instrumentSchedule.js` — วาระตรวจวัด DISTANCE/LONG_TERM

**Files:**
- Create: `src/utils/instrumentSchedule.js`
- Test: `src/utils/instrumentSchedule.test.js`

**Interfaces:**
- Consumes: `currentChainage` (Task 1.2)
- Produces:
  - `distanceDue(sched, curChainage) → boolean` — DISTANCE ถึงกำหนดหรือยัง (TBM ผ่าน tbmChainage แล้ว)
  - `longTermTargetDate(sched) → string|null` — วันครบกำหนด (ISO) จาก measuredAt ของ trigger + longTermDays; null ถ้ายังไม่ trigger
  - `scheduleStatus(sched, curChainage, today) → "done"|"overdue"|"due"|"pending"|"na"`
  - `summarizeSchedules(list, curChainage, today) → {due,overdue,done,pending}` (นับ)

- [ ] **Step 1: เขียน test ที่ fail**

```js
// src/utils/instrumentSchedule.test.js
import { distanceDue, longTermTargetDate, scheduleStatus, summarizeSchedules } from "./instrumentSchedule";

describe("distanceDue (STA ลดลงเมื่อเจาะหน้า)", () => {
  // tbmChainage = STA ที่ TBM ต้องถึงเพื่อ trigger; ถึงเมื่อ curChainage <= tbmChainage
  test("ยังไม่ถึง", () => expect(distanceDue({ scheduleType:"DISTANCE", tbmChainage:8300 }, 8360)).toBe(false));
  test("ถึงแล้ว", () => expect(distanceDue({ scheduleType:"DISTANCE", tbmChainage:8300 }, 8290)).toBe(true));
});

test("longTermTargetDate = triggerDate + days", () => {
  const s = { scheduleType:"LONG_TERM", longTermDays:7, triggerMeasuredAt:"2026-01-01T00:00:00.000Z" };
  expect(longTermTargetDate(s)).toBe("2026-01-08T00:00:00.000Z");
});
test("longTermTargetDate null เมื่อยังไม่ trigger", () => {
  expect(longTermTargetDate({ scheduleType:"LONG_TERM", longTermDays:7 })).toBeNull();
});

describe("scheduleStatus", () => {
  const today = "2026-02-01T00:00:00.000Z";
  test("measured → done", () => expect(scheduleStatus({ isMeasured:true }, 8000, today)).toBe("done"));
  test("DISTANCE ยังไม่ถึง → pending", () =>
    expect(scheduleStatus({ scheduleType:"DISTANCE", tbmChainage:8300, isMeasured:false }, 8360, today)).toBe("pending"));
  test("DISTANCE ถึงแล้วยังไม่วัด → due", () =>
    expect(scheduleStatus({ scheduleType:"DISTANCE", tbmChainage:8300, isMeasured:false }, 8290, today)).toBe("due"));
});

test("summarizeSchedules นับถูก", () => {
  const list = [
    { isMeasured:true },
    { scheduleType:"DISTANCE", tbmChainage:8300, isMeasured:false },
  ];
  const s = summarizeSchedules(list, 8290, "2026-02-01T00:00:00.000Z");
  expect(s.done).toBe(1);
  expect(s.due).toBe(1);
});
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npx react-scripts test src/utils/instrumentSchedule.test.js --watchAll=false`
Expected: FAIL — module not found

- [ ] **Step 3: เขียน implementation**

```js
// src/utils/instrumentSchedule.js
// วาระตรวจวัด: DISTANCE trigger ตามตำแหน่ง TBM (STA ลดลงเมื่อเจาะหน้า), LONG_TERM ตามวันที่
export function distanceDue(sched, curChainage) {
  if (!sched || sched.scheduleType !== "DISTANCE") return false;
  if (curChainage == null || sched.tbmChainage == null) return false;
  return Number(curChainage) <= Number(sched.tbmChainage); // TBM ผ่านจุด trigger แล้ว
}

export function longTermTargetDate(sched) {
  if (!sched || sched.scheduleType !== "LONG_TERM") return null;
  if (!sched.triggerMeasuredAt || sched.longTermDays == null) return null;
  const base = new Date(sched.triggerMeasuredAt).getTime();
  if (isNaN(base)) return null;
  return new Date(base + Number(sched.longTermDays) * 86400000).toISOString();
}

export function scheduleStatus(sched, curChainage, today) {
  if (!sched) return "pending";
  if (sched.isMeasured) return "done";
  if (sched.status === "na") return "na";
  if (sched.scheduleType === "LONG_TERM") {
    const target = longTermTargetDate(sched);
    if (!target) return "pending";
    return new Date(today) > new Date(target) ? "overdue" : "due";
  }
  // DISTANCE
  return distanceDue(sched, curChainage) ? "due" : "pending";
}

export function summarizeSchedules(list, curChainage, today) {
  const acc = { due: 0, overdue: 0, done: 0, pending: 0 };
  (list || []).forEach((s) => {
    const st = scheduleStatus(s, curChainage, today);
    if (st === "na") return;
    if (acc[st] != null) acc[st] += 1;
  });
  return acc;
}
```

- [ ] **Step 4: รัน test ให้ผ่าน + Commit**

Run: `npx react-scripts test src/utils/instrumentSchedule.test.js --watchAll=false`
Expected: PASS
```bash
git add src/utils/instrumentSchedule.js src/utils/instrumentSchedule.test.js
git commit -m "feat(instrument): add measurement schedule logic"
```

---

### Task 1.4: `instrumentData.js` — profileJson + threshold resolve

**Files:**
- Create: `src/utils/instrumentData.js`
- Test: `src/utils/instrumentData.test.js`

**Interfaces:**
- Produces:
  - `parseProfile(json: string) → Array<{depth,a,b}>` — ปลอดภัยกับ string ว่าง/พัง
  - `serializeProfile(arr) → string`
  - `resolveThreshold(thresholds, instrument) → {alert,alarm,action}|null` — หา override (per-instrument) ก่อน ไม่มีใช้ default (per-type)
  - `latestReading(readings, instrumentId) → object|null` — reading ล่าสุดตาม date

- [ ] **Step 1: เขียน test ที่ fail**

```js
// src/utils/instrumentData.test.js
import { parseProfile, serializeProfile, resolveThreshold, latestReading } from "./instrumentData";

test("parseProfile ปลอดภัย", () => {
  expect(parseProfile("")).toEqual([]);
  expect(parseProfile("ไม่ใช่ json")).toEqual([]);
  expect(parseProfile('[{"depth":5,"a":1.2,"b":-0.3}]')).toEqual([{ depth:5, a:1.2, b:-0.3 }]);
});
test("serialize→parse round-trip", () => {
  const arr = [{ depth:0, a:0, b:0 }, { depth:5, a:1.1, b:2.2 }];
  expect(parseProfile(serializeProfile(arr))).toEqual(arr);
});

describe("resolveThreshold", () => {
  const ths = [
    { scope:"type", key:"INCLINOMETER", alert:18, alarm:20, action:22 },
    { scope:"instrument", key:"inst-1", alert:15, alarm:17, action:20 },
  ];
  test("มี override per-instrument", () =>
    expect(resolveThreshold(ths, { id:"inst-1", type:"INCLINOMETER" })).toMatchObject({ alert:15, action:20 }));
  test("ไม่มี override → default per-type", () =>
    expect(resolveThreshold(ths, { id:"inst-9", type:"INCLINOMETER" })).toMatchObject({ alert:18, action:22 }));
  test("ไม่มีเลย → null", () =>
    expect(resolveThreshold(ths, { id:"x", type:"VIBRATION" })).toBeNull();
});

test("latestReading คืนอันวันที่ล่าสุด", () => {
  const rs = [
    { instrumentId:"a", date:"2026-01-01", valuePrimary:1 },
    { instrumentId:"a", date:"2026-03-01", valuePrimary:9 },
    { instrumentId:"b", date:"2026-05-01", valuePrimary:5 },
  ];
  expect(latestReading(rs, "a").valuePrimary).toBe(9);
  expect(latestReading(rs, "z")).toBeNull();
});
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npx react-scripts test src/utils/instrumentData.test.js --watchAll=false`
Expected: FAIL — module not found

- [ ] **Step 3: เขียน implementation**

```js
// src/utils/instrumentData.js
export function parseProfile(json) {
  if (!json || typeof json !== "string") return [];
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
export function serializeProfile(arr) {
  return JSON.stringify(Array.isArray(arr) ? arr : []);
}
export function resolveThreshold(thresholds, instrument) {
  if (!instrument || !Array.isArray(thresholds)) return null;
  const override = thresholds.find((t) => t.scope === "instrument" && String(t.key) === String(instrument.id));
  if (override) return { alert: Number(override.alert), alarm: Number(override.alarm), action: Number(override.action) };
  const byType = thresholds.find((t) => t.scope === "type" && t.key === instrument.type);
  if (byType) return { alert: Number(byType.alert), alarm: Number(byType.alarm), action: Number(byType.action) };
  return null;
}
export function latestReading(readings, instrumentId) {
  const rs = (readings || []).filter((r) => String(r.instrumentId) === String(instrumentId));
  if (!rs.length) return null;
  return rs.reduce((a, b) => (new Date(b.date) > new Date(a.date) ? b : a));
}
```

- [ ] **Step 4: รัน test ให้ผ่าน + Commit**

Run: `npx react-scripts test src/utils/instrumentData.test.js --watchAll=false`
Expected: PASS
```bash
git add src/utils/instrumentData.js src/utils/instrumentData.test.js
git commit -m "feat(instrument): add profile/threshold data helpers"
```

---

### Task 1.5: `instruments.js` — localStorage cache + id (mirror issues.js)

**Files:**
- Create: `src/utils/instruments.js`
- Test: `src/utils/instruments.test.js`
- Read (ต้นแบบ): `src/utils/issues.js`

**Interfaces:**
- Produces: `makeInstId(prefix)` · `loadCache(key)` · `persistCache(key,data)` · `STORE = {locations:"instLocations", instruments:"instInstruments", thresholds:"instThresholds", readings:"instReadings", schedules:"instSchedules"}`

- [ ] **Step 1: เขียน test**

```js
// src/utils/instruments.test.js
import { makeInstId, loadCache, persistCache, STORE } from "./instruments";
beforeEach(() => localStorage.clear());
test("makeInstId มี prefix + unique", () => {
  const a = makeInstId("rd"), b = makeInstId("rd");
  expect(a.startsWith("rd_")).toBe(true);
  expect(a).not.toBe(b);
});
test("persist→load round-trip", () => {
  persistCache(STORE.readings, [{ id:1 }]);
  expect(loadCache(STORE.readings)).toEqual([{ id:1 }]);
});
test("load คืน [] เมื่อว่าง/พัง", () => {
  expect(loadCache("nope")).toEqual([]);
  localStorage.setItem("bad", "{{{");
  expect(loadCache("bad")).toEqual([]);
});
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npx react-scripts test src/utils/instruments.test.js --watchAll=false`
Expected: FAIL — module not found

- [ ] **Step 3: เขียน implementation**

```js
// src/utils/instruments.js
export const STORE = {
  locations: "instLocations", instruments: "instInstruments",
  thresholds: "instThresholds", readings: "instReadings", schedules: "instSchedules",
};
export function makeInstId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}
export function loadCache(key) {
  try { const raw = localStorage.getItem(key); if (!raw) return []; const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
  catch (e) { return []; }
}
export function persistCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { /* ignore quota */ }
}
```

- [ ] **Step 4: รัน test ให้ผ่าน + Commit**

Run: `npx react-scripts test src/utils/instruments.test.js --watchAll=false`
Expected: PASS
```bash
git add src/utils/instruments.js src/utils/instruments.test.js
git commit -m "feat(instrument): add localStorage cache helpers"
```

---

## Phase 2 — GAS Backend (`../gas-live/Code.js`)

> **หลัง Phase 2 ต้อง deploy manual** (ดู Global Constraints). Phase 3+ ทดสอบกับ getData จริงได้หลัง deploy

### Task 2.1: HEADERS + setupSheets + getData (อ่าน 5 ตาราง)

**Files:**
- Modify: `../gas-live/Code.js` (HEADERS ~บรรทัด 16, `setupSheets` ~29-42, `doGet`/getData ~84-130)

**Interfaces:**
- Produces (ใน getData payload): คีย์ `instLocations, instInstruments, instThresholds, instReadings, instSchedules` (array of row-objects)

- [ ] **Step 1: เพิ่ม HEADERS constants** (หลังบรรทัด `PREP_HEADERS`, ~บรรทัด 16)

```js
const INST_LOC_HEADERS = ['id','name','type','chainage','actualChainage','note'];
const INST_INS_HEADERS = ['id','locationId','code','type','blueprintPage','blueprintX','blueprintY','installStatus','installedAt','installPhotoUrl','note'];
const INST_TH_HEADERS  = ['id','scope','key','alert','alarm','action','unit','source','note'];
const INST_RD_HEADERS  = ['id','instrumentId','date','seq','tbmChainage','valuePrimary','valueSecondary','profileJson','maxValue','sourcePdf','enteredBy','note'];
const INST_SC_HEADERS  = ['id','locationId','scheduleType','instrumentGroup','distanceOffset','tbmChainage','longTermLabel','longTermDays','triggerOffset','targetDate','isMeasured','measuredAt','measuredBy','photoUrl','notes'];
```

- [ ] **Step 2: เพิ่มใน `setupSheets()`** (ก่อน `return` ของฟังก์ชัน)

```js
  ensureSheet_(ss, 'Inst_Locations', INST_LOC_HEADERS);
  ensureSheet_(ss, 'Inst_Instruments', INST_INS_HEADERS);
  ensureSheet_(ss, 'Inst_Thresholds', INST_TH_HEADERS);
  ensureSheet_(ss, 'Inst_Readings', INST_RD_HEADERS);
  ensureSheet_(ss, 'Inst_Schedules', INST_SC_HEADERS);
```

- [ ] **Step 3: เพิ่มการโหลดใน getData** (กลุ่ม project-wide ~บรรทัด 112-114 หลัง `prepTasks`)

```js
  const instLocations   = getSheetDataAsJson(ss.getSheetByName('Inst_Locations'));
  const instInstruments = getSheetDataAsJson(ss.getSheetByName('Inst_Instruments'));
  const instThresholds  = getSheetDataAsJson(ss.getSheetByName('Inst_Thresholds'));
  const instReadings    = getSheetDataAsJson(ss.getSheetByName('Inst_Readings'));
  const instSchedules   = getSheetDataAsJson(ss.getSheetByName('Inst_Schedules'));
```

- [ ] **Step 4: เพิ่มคีย์ใน return object ของ getData** (ในบล็อก `jsonOut_({...})` ~บรรทัด 116-130)

```js
    instLocations: instLocations,
    instInstruments: instInstruments,
    instThresholds: instThresholds,
    instReadings: instReadings,
    instSchedules: instSchedules,
```

- [ ] **Step 5: ตรวจ syntax + Commit** (ยังไม่ deploy — deploy หลัง Task 2.2)

Run: `node -c "D:/TEAM/Knowlegh/App/Tunnel Boring App - Copy/gas-live/Code.js"`
Expected: ไม่มี error (exit 0)
```bash
git add "../gas-live/Code.js"
git commit -m "feat(instrument): add Inst_ sheets read to GAS getData"
```

---

### Task 2.2: Write actions + bulkImport

**Files:**
- Modify: `../gas-live/Code.js` (`doPost` — เพิ่ม save/delete แบบตอบเร็วก่อนบรรทัด ~224; และ if-chain)

**Interfaces:**
- Produces (actions): `addInstReading` · `updateInstReading` · `deleteInstReading` · `saveInstSchedule` · `updateInstrument` · `saveInstThreshold` · `bulkImportInstrument`
- ทุก action ยึด row `id` เป็น key; ใช้ `upsertById_`/`deleteById_` ที่มีอยู่

- [ ] **Step 1: เพิ่มบล็อก actions** (สไตล์ตอบเร็ว วางก่อนบรรทัด image-upload ~224 ในบล็อกเดียวกับ `saveIssue`)

```js
    if (action === 'saveInstThreshold') { const r = upsertById_(ensureSheet_(ss,'Inst_Thresholds',INST_TH_HEADERS), INST_TH_HEADERS, data); lock.releaseLock(); return jsonOut_(r); }
    if (action === 'updateInstrument')   { const r = upsertById_(ensureSheet_(ss,'Inst_Instruments',INST_INS_HEADERS), INST_INS_HEADERS, data); lock.releaseLock(); return jsonOut_(r); }
    if (action === 'saveInstSchedule')   { const r = upsertById_(ensureSheet_(ss,'Inst_Schedules',INST_SC_HEADERS), INST_SC_HEADERS, data); lock.releaseLock(); return jsonOut_(r); }
    if (action === 'addInstReading' || action === 'updateInstReading') {
      const r = upsertById_(ensureSheet_(ss,'Inst_Readings',INST_RD_HEADERS), INST_RD_HEADERS, data); lock.releaseLock(); return jsonOut_(r);
    }
    if (action === 'deleteInstReading')  { const r = deleteById_(ss.getSheetByName('Inst_Readings'), data.id); lock.releaseLock(); return jsonOut_(r); }
```

- [ ] **Step 2: เพิ่ม bulkImportInstrument** (รับ arrays หลายตารางในครั้งเดียว สำหรับ migration)

```js
    if (action === 'bulkImportInstrument') {
      const map = {
        Inst_Locations: INST_LOC_HEADERS, Inst_Instruments: INST_INS_HEADERS,
        Inst_Thresholds: INST_TH_HEADERS, Inst_Readings: INST_RD_HEADERS, Inst_Schedules: INST_SC_HEADERS,
      };
      const counts = {};
      Object.keys(map).forEach(function (name) {
        const rows = (data && data[name]) || [];
        if (!rows.length) return;
        const sh = ensureSheet_(ss, name, map[name]);
        rows.forEach(function (row) { upsertById_(sh, map[name], row); });
        counts[name] = rows.length;
      });
      lock.releaseLock();
      return jsonOut_({ status: 'success', imported: counts });
    }
```

- [ ] **Step 3: ตรวจ syntax**

Run: `node -c "D:/TEAM/Knowlegh/App/Tunnel Boring App - Copy/gas-live/Code.js"`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add "../gas-live/Code.js"
git commit -m "feat(instrument): add Inst_ write + bulkImport actions to GAS"
```

- [ ] **Step 5: Deploy manual (แจ้ง user ทำ — Claude ทำแทนไม่ได้)**

แจ้ง user รัน (ในโฟลเดอร์ `gas-live/`):
```
clasp push -f
clasp redeploy AKfycbyRUl5BVmZYDhw_Z0Uo2LWBLmaQAaOjJZR4jLGw-MuxHIFcKEhu7FBF9tV33JAnKz1aTw
```
แล้วเปิด Apps Script editor รัน `setupSheets` 1 ครั้ง (สร้าง 5 ชีต + authorize)
Verify: เปิด `<GAS_URL>?action=getData&machine=TBM1` เห็นคีย์ `instLocations: []` … ครบ 5 คีย์

---

## Phase 3 — Client Data Layer + Scaffolding (nav + state + stub views)

> เป้าหมาย milestone: เปิดแอปเห็น nav group ใหม่, กด tab แล้วเห็นหน้า placeholder + จำนวนข้อมูลจาก state (ยังว่างจนกว่า Phase 4 migrate) — ทำงานได้จริง

### Task 3.1: nav group + viewer whitelist

**Files:**
- Modify: `src/ui-ux-pro-max/components/navModel.js` (import ~บรรทัด 1, group ~27-28, MOBILE_MORE_TABS ~33, viewerGroups ~36-42)
- Modify: `src/utils/viewerMode.js` (VIEWER_TABS ~บรรทัด 3)

**Interfaces:**
- Produces: tab ids `"inst_dashboard"`, `"inst_schedule"` ใน NAV_GROUPS; `"inst_location"` เป็น drill-down (ไม่อยู่ใน nav)

- [ ] **Step 1: เพิ่ม icon import** (navModel.js บรรทัด 1 — เติม `Activity`, `CalendarClock` เข้า import list ที่มีอยู่)

```js
import { Home, PlusCircle, LayoutDashboard, Database, Clock, FileText, TrendingUp, Droplet, MapPin, Gauge, ClipboardList, CalendarRange, ArrowUpDown, Activity, CalendarClock } from "lucide-react";
```

- [ ] **Step 2: เพิ่ม group ที่ 6** (แทรกระหว่างบรรทัดปิดกลุ่ม "รายงาน" `]},` กับบรรทัดปิด `];` ของ NAV_GROUPS)

```js
  { label: "เครื่องมือวัด", items: [
    { id:"inst-dash", tab:"inst_dashboard", label:"Instrument", short:"Inst", icon:Activity },
    { id:"inst-sched", tab:"inst_schedule", label:"วาระตรวจวัด", short:"วาระ", icon:CalendarClock },
  ]},
```

- [ ] **Step 3: เพิ่มใน MOBILE_MORE_TABS** (บรรทัด ~33 — เติมท้าย array)

```js
export const MOBILE_MORE_TABS = ["analysis","head_level","prep_gantt","performance","datalog","report","daily_report","inst_dashboard","inst_schedule"];
```

- [ ] **Step 4: (viewer) เพิ่ม inst tabs** — `viewerMode.js` บรรทัด 3 + `navModel.js` `viewerGroups()`

`src/utils/viewerMode.js`:
```js
export const VIEWER_TABS = ["dashboard", "analysis", "head_level", "prep_gantt", "performance", "shift_report", "inst_dashboard", "inst_location", "inst_schedule"];
```
`navModel.js` `viewerGroups()` — เพิ่มกลุ่ม instrument เข้า viewer (หลังบรรทัด push "รายงาน"):
```js
  const inst = NAV_GROUPS.find((g) => g.label === "เครื่องมือวัด");
  if (inst) groups.push({ ...inst });
```

- [ ] **Step 5: Commit**

```bash
git add src/ui-ux-pro-max/components/navModel.js src/utils/viewerMode.js
git commit -m "feat(instrument): add nav group + viewer tabs"
```

### Task 3.2: stub views (ให้ route import ได้)

**Files:**
- Create: `src/components/views/InstrumentDashboardView.jsx`, `InstrumentLocationView.jsx`, `InstrumentScheduleView.jsx`

- [ ] **Step 1: สร้าง stub ทั้ง 3 ไฟล์** (placeholder — เติมจริงใน Phase 5-7)

```jsx
// src/components/views/InstrumentDashboardView.jsx
export default function InstrumentDashboardView({ locations = [], instruments = [], readings = [], thresholds = [], machineProgress, onOpenLocation, readOnly = false }) {
  return (
    <div className="max-w-full mx-auto space-y-6 animate-fade-in pb-24">
      <div className="bg-surface rounded-card shadow-card border border-line p-6">
        <h2 className="font-semibold text-ink text-lg">Instrument Dashboard</h2>
        <p className="text-ink-2 text-sm mt-1">locations: {locations.length} · instruments: {instruments.length} · readings: {readings.length}</p>
      </div>
    </div>
  );
}
```
สร้าง `InstrumentLocationView.jsx` และ `InstrumentScheduleView.jsx` ในรูปแบบเดียวกัน (props: LocationView `{ location, instruments, readings, thresholds, onBack, readOnly }`; ScheduleView `{ schedules, locations, machineProgress, onMark, readOnly }`) โดยแสดงหัวข้อ + count

- [ ] **Step 2: Commit**

```bash
git add src/components/views/InstrumentDashboardView.jsx src/components/views/InstrumentLocationView.jsx src/components/views/InstrumentScheduleView.jsx
git commit -m "feat(instrument): add stub views"
```

### Task 3.3: App.jsx — state + getData parse + routes

**Files:**
- Modify: `src/App.jsx` (import ~23, state ~47, getData reset ~96 + parse ~168-197, routes ~307-315)

**Interfaces:**
- Consumes: getData คีย์ `instLocations/instInstruments/instThresholds/instReadings/instSchedules` (Task 2.1); stub views (Task 3.2)

- [ ] **Step 1: import views + util** (หัวไฟล์ ~บรรทัด 23)

```js
import InstrumentDashboardView from "./components/views/InstrumentDashboardView";
import InstrumentLocationView from "./components/views/InstrumentLocationView";
import InstrumentScheduleView from "./components/views/InstrumentScheduleView";
import { STORE, loadCache, persistCache } from "./utils/instruments";
```

- [ ] **Step 2: เพิ่ม state** (กลุ่ม state ~บรรทัด 47)

```js
const [instLocations, setInstLocations] = useState(() => loadCache(STORE.locations));
const [instInstruments, setInstInstruments] = useState(() => loadCache(STORE.instruments));
const [instThresholds, setInstThresholds] = useState(() => loadCache(STORE.thresholds));
const [instReadings, setInstReadings] = useState(() => loadCache(STORE.readings));
const [instSchedules, setInstSchedules] = useState(() => loadCache(STORE.schedules));
const [selectedInstLocId, setSelectedInstLocId] = useState(null);
```

- [ ] **Step 3: parse ใน getData success** (ในบล็อก `if (result.status === "success")` ~หลังบรรทัด 197 — instrument เป็น project-wide จึง set เสมอ ไม่ขึ้นกับ machine)

```js
if (Array.isArray(result.instLocations))   { setInstLocations(result.instLocations); persistCache(STORE.locations, result.instLocations); }
if (Array.isArray(result.instInstruments)) { setInstInstruments(result.instInstruments); persistCache(STORE.instruments, result.instInstruments); }
if (Array.isArray(result.instThresholds))  { setInstThresholds(result.instThresholds); persistCache(STORE.thresholds, result.instThresholds); }
if (Array.isArray(result.instReadings))    { setInstReadings(result.instReadings); persistCache(STORE.readings, result.instReadings); }
if (Array.isArray(result.instSchedules))   { setInstSchedules(result.instSchedules); persistCache(STORE.schedules, result.instSchedules); }
```

- [ ] **Step 4: เพิ่ม view routes** (ในบล็อก route ~ก่อน `</Shell>` บรรทัด 316)

```jsx
{activeTab === "inst_dashboard" && (
  <InstrumentDashboardView
    locations={instLocations} instruments={instInstruments} readings={instReadings}
    thresholds={instThresholds} machineProgress={machineProgress}
    onOpenLocation={(id) => { setSelectedInstLocId(id); setActiveTab("inst_location"); }}
    readOnly={isViewer} />
)}
{activeTab === "inst_location" && (
  <InstrumentLocationView
    location={instLocations.find((l) => String(l.id) === String(selectedInstLocId)) || null}
    instruments={instInstruments.filter((i) => String(i.locationId) === String(selectedInstLocId))}
    readings={instReadings} thresholds={instThresholds}
    onBack={() => setActiveTab("inst_dashboard")} readOnly={isViewer} />
)}
{activeTab === "inst_schedule" && (
  <InstrumentScheduleView
    schedules={instSchedules} locations={instLocations} machineProgress={machineProgress}
    onMark={null} readOnly={isViewer} />
)}
```

- [ ] **Step 5: verify build + smoke**

Run: `npm run build`
Expected: build สำเร็จ ไม่มี error
เปิดแอป (preview) → เห็น nav group "เครื่องมือวัด" → กด Instrument เห็นหน้า placeholder + count (0 ถ้ายังไม่ migrate)

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat(instrument): wire state + getData + view routes"
```

---

## Phase 4 — Migration (seed → Sheets)

### Task 4.1: port seed data → pure JS module

**Files:**
- Create: `tools/instrument-seed-data.mjs`
- Read (ต้นทาง): `Instument Monitoring/tunnel-monitoring/prisma/seed.ts`

**Interfaces:**
- Produces: `export function buildSeed() → { locations[], instruments[], thresholds[], schedules[] }` (row-objects ตรงตาม INST_*_HEADERS)

- [ ] **Step 1: port ค่าคงที่ + logic จาก seed.ts** (คัดลอกเป็น JS ล้วน — ลบ prisma/await/create ออก เหลือแค่สร้าง arrays)

คัดจาก `seed.ts`: `LOCATIONS` (29), `INSTRUMENTS` (record keyed by location name), `THRESHOLDS` (4), offset arrays (`BRIDGE_ABOVE_OFFSETS`, `SHAFT_INITIAL_OFFSETS`, `SHAFT_FINAL_OFFSETS`, `LONG_TERM_DEFS`), และ schedule-gen logic ใน `main()`. สร้างเป็น:

```js
// tools/instrument-seed-data.mjs
const LOCATIONS = [ /* ...คัดลอก 29 records จาก seed.ts... */ ];
const INSTRUMENTS = { /* ...คัดลอก record keyed by location name... */ };
const THRESHOLDS = [
  { instrumentType:"INCLINOMETER", alert:18, alarm:20, action:22, unit:"mm" },
  { instrumentType:"EXTENSOMETER", alert:20, alarm:25, action:30, unit:"mm" },
  { instrumentType:"PIEZOMETER", alert:50, alarm:75, action:100, unit:"kPa" },
  { instrumentType:"SETTLEMENT_POINT", alert:15, alarm:20, action:25, unit:"mm" },
];
const BRIDGE_ABOVE_OFFSETS = [-20,-10,-5,-2,-1,0,2,5,10,20,30,40];
const SHAFT_INITIAL_OFFSETS = [0,5,10,20,40,60];
const SHAFT_FINAL_OFFSETS = [-100,-95,-65,-35,-5,0];
const LONG_TERM_DEFS = [{label:"1W",days:7},{label:"2W",days:14},{label:"3M",days:90},{label:"6M",days:180}];

let _n = 0;
const rid = (p) => `${p}_${++_n}`; // id เสถียร (ไม่ใช้ random) เพื่อ migrate ซ้ำได้ idempotent

export function buildSeed() {
  const locations = [], instruments = [], schedules = [];
  const thresholds = THRESHOLDS.map((t) => ({
    id:`th_${t.instrumentType}`, scope:"type", key:t.instrumentType,
    alert:t.alert, alarm:t.alarm, action:t.action, unit:t.unit, source:"seed", note:"",
  }));
  LOCATIONS.forEach((loc) => {
    const locId = `loc_${loc.name.replace(/[^a-zA-Z0-9]/g,"_")}`;
    locations.push({ id:locId, name:loc.name, type:loc.type, chainage:loc.chainage, actualChainage:loc.actualChainage ?? "", note:"" });
    (INSTRUMENTS[loc.name] || []).forEach((ins) => {
      instruments.push({ id:rid("ins"), locationId:locId, code:ins.code, type:ins.type,
        blueprintPage:ins.blueprintPage ?? "", blueprintX:ins.blueprintX ?? "", blueprintY:ins.blueprintY ?? "",
        installStatus:ins.status || "PENDING", installedAt:"", installPhotoUrl:"", note:"" });
    });
    // schedule-gen: port logic จาก main() — DISTANCE ต่อ offset (+DEEP ถ้า bridge/above) + LONG_TERM ต่อ trigger
    const base = loc.actualChainage ?? loc.chainage;
    const isShaft = loc.type === "SHAFT";
    const distOffsets = isShaft ? Array.from(new Set([...SHAFT_INITIAL_OFFSETS, ...SHAFT_FINAL_OFFSETS])) : BRIDGE_ABOVE_OFFSETS;
    const hasDeep = loc.type === "BRIDGE" || loc.type === "ABOVE_TUNNEL";
    distOffsets.forEach((off) => {
      ["SURFACE", ...(hasDeep ? ["DEEP"] : [])].forEach((grp) => {
        schedules.push({ id:rid("sc"), locationId:locId, scheduleType:"DISTANCE", instrumentGroup:grp,
          distanceOffset:off, tbmChainage:base - off, longTermLabel:"", longTermDays:"", triggerOffset:"",
          targetDate:"", isMeasured:false, measuredAt:"", measuredBy:"", photoUrl:"", notes:"" });
      });
    });
    const triggers = isShaft ? [{title:"Init",offset:60},{title:"Final",offset:0}] : [{title:"LT",offset:40}];
    triggers.forEach((trig) => LONG_TERM_DEFS.forEach((lt) => {
      schedules.push({ id:rid("sc"), locationId:locId, scheduleType:"LONG_TERM", instrumentGroup:"ALL",
        distanceOffset:"", tbmChainage:"", longTermLabel:`${trig.title} ${lt.label}`, longTermDays:lt.days,
        triggerOffset:trig.offset, targetDate:"", isMeasured:false, measuredAt:"", measuredBy:"", photoUrl:"", notes:"" });
    }));
  });
  return { locations, instruments, thresholds, schedules };
}
```

- [ ] **Step 2: verify count ตรงต้นทาง**

Run: `node -e "import('./tools/instrument-seed-data.mjs').then(m=>{const s=m.buildSeed();console.log('loc',s.locations.length,'ins',s.instruments.length,'th',s.thresholds.length,'sc',s.schedules.length)})"`
Expected: `loc 29 ins 245 th 4 sc ~731` (ถ้า ins ≠ 245 → ตรวจ INSTRUMENTS ที่ port มาว่าครบ)

- [ ] **Step 3: Commit**

```bash
git add tools/instrument-seed-data.mjs
git commit -m "feat(instrument): port seed data to JS module"
```

### Task 4.2: migration runner → POST bulkImport

**Files:**
- Create: `tools/migrate-instruments.mjs`
- Read: `src/utils/constants.js` (GAS_URL)

- [ ] **Step 1: เขียน runner** (map เป็น sheet-name payload → POST)

```js
// tools/migrate-instruments.mjs
import { buildSeed } from "./instrument-seed-data.mjs";
const GAS_URL = process.env.GAS_URL; // copy จาก src/utils/constants.js ตอนรัน
if (!GAS_URL) { console.error("set GAS_URL env"); process.exit(1); }

const s = buildSeed();
const payload = {
  action: "bulkImportInstrument",
  data: {
    Inst_Locations: s.locations, Inst_Instruments: s.instruments,
    Inst_Thresholds: s.thresholds, Inst_Schedules: s.schedules,
  },
};
const res = await fetch(GAS_URL, { method:"POST", headers:{ "Content-Type":"text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
console.log(await res.text());
```

- [ ] **Step 2: รัน migration บนสำเนา Sheet ก่อน** (ตาม PLAN.md — สร้าง copy ของ spreadsheet, ชี้ SPREADSHEET_ID ชั่วคราว หรือรันแล้วตรวจ)

Run: `GAS_URL="<paste จาก constants.js>" node tools/migrate-instruments.mjs`
Expected: `{"status":"success","imported":{"Inst_Locations":29,"Inst_Instruments":245,...}}`
Verify: เปิดแอป reload → dashboard count = 29 loc / 245 inst

- [ ] **Step 3: Commit**

```bash
git add tools/migrate-instruments.mjs
git commit -m "feat(instrument): add migration runner"
```

### Task 4.3: copy blueprint assets + preset readings (8+300)

**Files:**
- Copy: `Instument Monitoring/tunnel-monitoring/public/blueprints/page_*.png` (27 ไฟล์) → `TunnelBoringMonitoring/public/blueprints/`
- Create: `tools/preset-to-readings.mjs`
- Read: `Instument Monitoring/tunnel-monitoring/src/lib/reportMeasurementPresets.ts`

- [ ] **Step 1: copy blueprint PNG**

Run: `cp -r "D:/TEAM/Knowlegh/App/Instument Monitoring/tunnel-monitoring/public/blueprints" "D:/TEAM/Knowlegh/App/Tunnel Boring App - Copy/TunnelBoringMonitoring/public/blueprints"`
Expected: 27 ไฟล์ page_*.png ใน public/blueprints/

- [ ] **Step 2: port preset → readings rows** (แปลง profile/history ของ 8+300 → row-objects Inst_Readings พร้อม profileJson + report thresholds ฝังใน note/profileJson)

port `aboveTunnel8300MeasurementPreset` เป็น JS (คัดค่าจาก `reportMeasurementPresets.ts`) แล้ว emit rows: ต่อ instrument (INC A/B, EXT, PI×3, SS) ต่อวันที่วัด → `{ id, instrumentId, date, seq, tbmChainage, valuePrimary, valueSecondary, profileJson, maxValue, sourcePdf, enteredBy:"migrate" }` โดย `profileJson` เก็บ profile ของวันนั้น + key `_thresholds` (±15/17/20) สำหรับวาดเส้น. map instrumentId ให้ตรง code ใน Inst_Instruments ของ location 8+300

Run: `GAS_URL="..." node tools/preset-to-readings.mjs`
Expected: `{"status":"success"...}` + dashboard 8+300 มี readings

- [ ] **Step 3: Commit**

```bash
git add public/blueprints tools/preset-to-readings.mjs
git commit -m "feat(instrument): migrate blueprints + 8+300 readings"
```

---

## Phase 5 — Instrument Dashboard View

### Task 5.1: `InstrumentStatusBadge` + Dashboard จริง

**Files:**
- Create: `src/components/instrument/InstrumentStatusBadge.jsx`
- Modify: `src/components/views/InstrumentDashboardView.jsx` (แทน stub)

**Interfaces:**
- Consumes: `classifyStatus`/`worstStatus`/`STATUS_BADGE` (1.1), `resolveThreshold`/`latestReading` (1.4), `currentChainage`/`stationLabel` (1.2), `Badge`/`StatCard`
- Produces: dashboard KPI (นับ normal/alert/alarm/action) + list locations เรียง chainage คลิกเปิด location

- [ ] **Step 1: สร้าง `InstrumentStatusBadge.jsx`**

```jsx
// src/components/instrument/InstrumentStatusBadge.jsx
import Badge from "../../ui-ux-pro-max/components/Badge";
import { STATUS_BADGE } from "../../utils/instrumentStatus";
const LABEL = { normal: "ปกติ", alert: "Alert", alarm: "Alarm", action: "Action" };
export default function InstrumentStatusBadge({ status = "normal" }) {
  return <Badge code={STATUS_BADGE[status] || "neutral"}>{LABEL[status] || status}</Badge>;
}
```

- [ ] **Step 2: เขียน DashboardView จริง** (แทน stub ทั้งไฟล์)

```jsx
// src/components/views/InstrumentDashboardView.jsx
import { useMemo } from "react";
import { Activity, AlertTriangle } from "lucide-react";
import StatCard from "../common/StatCard";
import { classifyStatus, worstStatus } from "../../utils/instrumentStatus";
import { resolveThreshold, latestReading } from "../../utils/instrumentData";
import { currentChainage, stationLabel } from "../../utils/chainageAdapter";
import InstrumentStatusBadge from "../instrument/InstrumentStatusBadge";

export default function InstrumentDashboardView({ locations = [], instruments = [], readings = [], thresholds = [], machineProgress, onOpenLocation, readOnly = false }) {
  const instStatus = useMemo(() => {
    const map = {};
    instruments.forEach((ins) => {
      const r = latestReading(readings, ins.id);
      const th = resolveThreshold(thresholds, ins);
      map[ins.id] = r ? classifyStatus(r.maxValue ?? r.valuePrimary, th) : "normal";
    });
    return map;
  }, [instruments, readings, thresholds]);

  const counts = useMemo(() => {
    const c = { normal: 0, alert: 0, alarm: 0, action: 0 };
    Object.values(instStatus).forEach((s) => { c[s] = (c[s] || 0) + 1; });
    return c;
  }, [instStatus]);

  const cur = { TBM1: currentChainage(machineProgress, "TBM1"), TBM2: currentChainage(machineProgress, "TBM2") };

  const locRows = useMemo(() =>
    [...locations].sort((a, b) => Number(a.chainage) - Number(b.chainage)).map((loc) => {
      const insList = instruments.filter((i) => String(i.locationId) === String(loc.id));
      return { loc, count: insList.length, status: worstStatus(insList.map((i) => instStatus[i.id])) };
    }), [locations, instruments, instStatus]);

  return (
    <div className="max-w-full mx-auto space-y-6 animate-fade-in pb-24">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="ปกติ" value={counts.normal} subtext="Normal" color="text-code-a" icon={Activity} />
        <StatCard label="Alert" value={counts.alert} subtext="เฝ้าระวัง" color="text-code-b" icon={AlertTriangle} />
        <StatCard label="Alarm" value={counts.alarm} subtext="เตือน" color="text-code-c" icon={AlertTriangle} />
        <StatCard label="Action" value={counts.action} subtext="วิกฤต" color="text-code-d" icon={AlertTriangle} />
      </div>
      <div className="bg-surface rounded-card shadow-card border border-line overflow-hidden">
        <div className="px-6 py-4 border-b border-line bg-surface-alt flex items-center justify-between">
          <h3 className="font-semibold text-ink">จุดตรวจวัด ({locRows.length})</h3>
          <span className="text-xs text-ink-2">TBM1 {stationLabel(cur.TBM1)} · TBM2 {stationLabel(cur.TBM2)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-white uppercase bg-navy-dark">
              <tr><th className="px-4 py-2">จุด</th><th className="px-4 py-2">STA</th><th className="px-4 py-2">เครื่อง</th><th className="px-4 py-2">สถานะ</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {locRows.map(({ loc, count, status }) => (
                <tr key={loc.id} className="hover:bg-cyan-tint cursor-pointer" onClick={() => onOpenLocation(loc.id)}>
                  <td className="px-4 py-2.5 text-ink font-medium">{loc.name}</td>
                  <td className="px-4 py-2.5 text-ink-2">{stationLabel(loc.chainage)}</td>
                  <td className="px-4 py-2.5 text-ink-2">{count}</td>
                  <td className="px-4 py-2.5"><InstrumentStatusBadge status={status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: verify build + smoke**

Run: `npm run build`
Expected: build สำเร็จ · dashboard แสดง 4 KPI + list 29 จุด เรียง chainage · คลิกแถวเปิด location

- [ ] **Step 4: Commit**

```bash
git add src/components/instrument/InstrumentStatusBadge.jsx src/components/views/InstrumentDashboardView.jsx
git commit -m "feat(instrument): implement dashboard view"
```

---

## Phase 6 — Location Detail + Report Viewer (แกนหลัก)

### Task 6.1: shared chart helpers (port)

**Files:**
- Create: `src/components/instrument/reports/shared/chartUtils.js`, `ChartFrame.jsx`, `RawDataTable.jsx`
- Read (ต้นทาง): `Instument Monitoring/tunnel-monitoring/src/components/location/reports/shared/{chartUtils.ts,ChartFrame.tsx,RawDataTable.tsx}`

**Interfaces:**
- Produces: `formatShortDate(d)`, `parseDateToMs(d)`, `stationLabelKm(sta)`, `thresholdColors={alert,alarm,action}`, `depthSeriesPalette[]`, `getDateColor(date,allDates)` · `<ChartFrame title subtitle height>` · `<RawDataTable title rowLabel columnLabels rows digits unit highlightColumn>`

- [ ] **Step 1: port `chartUtils.js`** (คัดจาก .ts ต้นทาง ลบ type annotations → JS; คง `thresholdColors={alert:"#22c55e",alarm:"#eab308",action:"#dc2626"}`, palettes, date helpers)

- [ ] **Step 2: port `ChartFrame.jsx`** (กล่องครอบกราฟ: title + subtitle + `<div style={{height}}>{children}</div>`, ใช้ class `bg-surface border border-line rounded-card`)

- [ ] **Step 3: port `RawDataTable.jsx`** (sticky header + sticky first col, props ตาม interface, `highlightColumn` = ไฮไลต์คอลัมน์วันที่ report; ใช้ class navy header ตาม dashboard)

- [ ] **Step 4: build + Commit**

Run: `npm run build`  Expected: สำเร็จ (ยังไม่ถูกใช้)
```bash
git add src/components/instrument/reports/shared
git commit -m "feat(instrument): port shared report chart helpers"
```

### Task 6.2: `BlueprintPlot` + `InstrumentLocationView` shell

**Files:**
- Create: `src/components/instrument/BlueprintPlot.jsx`
- Modify: `src/components/views/InstrumentLocationView.jsx` (แทน stub)

**Interfaces:**
- Consumes: `InstrumentReportTabs` (Task 6.3, import ล่วงหน้าได้ — สร้าง stub ก่อนถ้าจำเป็น), `latestReading`/`resolveThreshold`/`classifyStatus`
- Produces: หน้า detail = header (ชื่อ+STA+ปุ่ม back) + blueprint plot (หมุด instrument) + report tabs; ถ้า location ไม่มี reading → empty state

- [ ] **Step 1: `BlueprintPlot.jsx`** — แสดง `/blueprints/page_${page}.png` + หมุดตาม blueprintX/Y (%)

```jsx
// src/components/instrument/BlueprintPlot.jsx
export default function BlueprintPlot({ page, instruments = [], statusOf }) {
  if (!page) return <div className="text-ink-3 text-sm p-4">ไม่มีแบบแปลนสำหรับจุดนี้</div>;
  return (
    <div className="relative w-full overflow-hidden rounded-card border border-line bg-surface">
      <img src={`/blueprints/page_${page}.png`} alt={`blueprint ${page}`} className="w-full" />
      {instruments.filter((i) => i.blueprintX !== "" && i.blueprintY !== "").map((i) => (
        <div key={i.id} title={i.code}
          className="absolute -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full ring-2 ring-white"
          style={{ left: `${i.blueprintX}%`, top: `${i.blueprintY}%`,
            background: ({normal:"#10463A",alert:"#B8860B",alarm:"#C8500A",action:"#B91C1C"})[statusOf ? statusOf(i) : "normal"] }} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: `InstrumentLocationView.jsx`** (header + tabs + blueprint; empty state ถ้าไม่มี reading)

```jsx
// src/components/views/InstrumentLocationView.jsx
import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import BlueprintPlot from "../instrument/BlueprintPlot";
import InstrumentReportTabs from "../instrument/InstrumentReportTabs";
import { latestReading, resolveThreshold } from "../../utils/instrumentData";
import { classifyStatus } from "../../utils/instrumentStatus";
import { stationLabel } from "../../utils/chainageAdapter";

export default function InstrumentLocationView({ location, instruments = [], readings = [], thresholds = [], onBack, readOnly = false }) {
  const hasReadings = useMemo(() => instruments.some((i) => latestReading(readings, i.id)), [instruments, readings]);
  const statusOf = (ins) => {
    const r = latestReading(readings, ins.id);
    return r ? classifyStatus(r.maxValue ?? r.valuePrimary, resolveThreshold(thresholds, ins)) : "normal";
  };
  if (!location) return <div className="p-6 text-ink-2">ไม่พบจุดตรวจวัด <button className="text-navy underline" onClick={onBack}>กลับ</button></div>;
  const page = instruments.find((i) => i.blueprintPage)?.blueprintPage;

  return (
    <div className="max-w-full mx-auto space-y-6 animate-fade-in pb-24">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-input hover:bg-cyan-tint"><ArrowLeft size={18} /></button>
        <div>
          <h2 className="font-semibold text-ink text-lg">{location.name}</h2>
          <p className="text-ink-2 text-sm">STA {stationLabel(location.chainage)} · {instruments.length} เครื่อง</p>
        </div>
      </div>
      <div className="bg-surface rounded-card shadow-card border border-line p-4">
        <h3 className="font-semibold text-ink text-sm mb-3">ตำแหน่งบนแบบแปลน</h3>
        <BlueprintPlot page={page} instruments={instruments} statusOf={statusOf} />
      </div>
      {hasReadings
        ? <InstrumentReportTabs location={location} instruments={instruments} readings={readings} thresholds={thresholds} />
        : <div className="bg-surface rounded-card shadow-card border border-line p-8 text-center text-ink-2">ยังไม่มีข้อมูลการตรวจวัด — รอส่ง PDF report เข้าระบบ</div>}
    </div>
  );
}
```

- [ ] **Step 3: build + Commit** (ต้องมี `InstrumentReportTabs` stub ก่อน — สร้างใน 6.3 หรือ stub ชั่วคราว)

```bash
git add src/components/instrument/BlueprintPlot.jsx src/components/views/InstrumentLocationView.jsx
git commit -m "feat(instrument): location detail shell + blueprint plot"
```

### Task 6.3: Report tabs + charts (แกนหลัก — port)

**Files:**
- Create: `src/components/instrument/InstrumentReportTabs.jsx`
- Create: `src/components/instrument/reports/{InclinometerReport,ExtensometerReport,PiezometerReport,SurfaceSettlementReport}.jsx`
- Read (ต้นทาง): `tunnel-monitoring/src/components/location/reports/*.tsx`

**Interfaces:**
- Consumes: shared (6.1), `parseProfile` (1.4), recharts, `chartTheme`
- Produces: `<InstrumentReportTabs location instruments readings thresholds>` — tabs INC/EXT/PI/SS สลับ report ต่อ type (เฉพาะ type ที่มี instrument ใน location)

- [ ] **Step 1: `InstrumentReportTabs.jsx`** — TabBar 4 type + render report ตาม type ที่มี

```jsx
// src/components/instrument/InstrumentReportTabs.jsx
import { useState, useMemo } from "react";
import SegmentedToggle from "../../ui-ux-pro-max/components/SegmentedToggle";
import InclinometerReport from "./reports/InclinometerReport";
import ExtensometerReport from "./reports/ExtensometerReport";
import PiezometerReport from "./reports/PiezometerReport";
import SurfaceSettlementReport from "./reports/SurfaceSettlementReport";
const REPORTS = { INCLINOMETER: InclinometerReport, EXTENSOMETER: ExtensometerReport, PIEZOMETER: PiezometerReport, SETTLEMENT_POINT: SurfaceSettlementReport };
const LABEL = { INCLINOMETER:"INC", EXTENSOMETER:"EXT", PIEZOMETER:"PI", SETTLEMENT_POINT:"SS" };
export default function InstrumentReportTabs({ location, instruments = [], readings = [], thresholds = [] }) {
  const types = useMemo(() => Object.keys(REPORTS).filter((t) => instruments.some((i) => i.type === t)), [instruments]);
  const [tab, setTab] = useState(types[0]);
  const Cur = REPORTS[tab] || (() => null);
  if (!types.length) return null;
  return (
    <div className="bg-surface rounded-card shadow-card border border-line p-4 space-y-4">
      <SegmentedToggle value={tab} onChange={setTab} options={types.map((t) => ({ value: t, label: LABEL[t] }))} />
      <Cur instruments={instruments.filter((i) => i.type === tab)} readings={readings} thresholds={thresholds} location={location} />
    </div>
  );
}
```

- [ ] **Step 2: `InclinometerReport.jsx`** (แกนหลัก: Time History + Depth Profile + threshold + RawDataTable — **ตัด** A/B sub-tab แยก, Summary stats)

port จาก `reports/InclinometerReport.tsx` แบบย่อ — ใช้ `parseProfile` ดึง profile ล่าสุด, recharts LineChart 2 อัน + `ReferenceLine` threshold. ใช้ chart snippet template:

```jsx
// โครง (ต่อ instrument ที่เลือก): แสดง A-axis + B-axis เป็น 2 เส้นในกราฟเดียว
// Time History: XAxis=date, YAxis=mm, ReferenceLine y=±alert/alarm/action (จาก reading.profileJson._thresholds หรือ resolveThreshold)
// Depth Profile: LineChart layout="vertical", YAxis=depth (reversed), XAxis=deflection, ReferenceLine x=±threshold
// RawDataTable: depth × dates
```
ใช้ recharts (`LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer`) + `chartTheme` (`axisTick, gridProps, tooltipStyle`) + `thresholdColors` จาก shared (6.1). Threshold ±: อ่านจาก `reading.profileJson._thresholds` (migrate ฝังไว้) fallback `resolveThreshold`

- [ ] **Step 3: `ExtensometerReport.jsx` / `PiezometerReport.jsx` / `SurfaceSettlementReport.jsx`** (แกนหลักเช่นกัน)

- EXT: Time History (settlement ต่อ ring) + Settlement Profile + RawDataTable (ring × date) + threshold lines
- PI: Time History pressure (kPa) + water level (m) + upper/lower threshold bands (`ReferenceLine` จาก profileJson thresholds); **รวม 3 sensors เป็น dropdown เดียว** (ไม่แยก sub-report เต็ม) หรือแสดงเรียงกัน
- SS: Time History ต่อจุด + Settlement Profile + RawDataTable; **รวมทุกจุดในกราฟเดียว** (ไม่แยก 2 groups)
- ทุกตัว: reading จาก `readings` filter ตาม instrument + `parseProfile`; ถ้าไม่มี → "ยังไม่มีข้อมูล"

- [ ] **Step 4: verify build + smoke** (location 8+300)

Run: `npm run build`
Expected: build สำเร็จ · เปิด location 8+300 → เห็น tabs INC/EXT/PI/SS · แต่ละ tab มี Time History + Profile + เส้น threshold + ตารางค่า · location อื่น (ไม่มี reading) → empty state

- [ ] **Step 5: Commit**

```bash
git add src/components/instrument/InstrumentReportTabs.jsx src/components/instrument/reports
git commit -m "feat(instrument): port core report viewer (INC/EXT/PI/SS)"
```

---

## Phase 7 — Schedule View + Edit เบาๆ

### Task 7.1: `InstrumentScheduleView`

**Files:**
- Modify: `src/components/views/InstrumentScheduleView.jsx` (แทน stub)

**Interfaces:**
- Consumes: `scheduleStatus`/`summarizeSchedules` (1.3), `currentChainage`/`stationLabel` (1.2)
- Produces: checklist จัดกลุ่มตาม location · filter · ไฮไลต์ overdue/due · ปุ่ม tick (เรียก `onMark(schedule)`)

- [ ] **Step 1: เขียน ScheduleView จริง**

```jsx
// src/components/views/InstrumentScheduleView.jsx
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import StatCard from "../common/StatCard";
import { scheduleStatus, summarizeSchedules } from "../../utils/instrumentSchedule";
import { currentChainage, stationLabel } from "../../utils/chainageAdapter";

const STATUS_CLS = { due:"text-code-b", overdue:"text-code-d", done:"text-code-a", pending:"text-ink-3", na:"text-ink-3" };
const today = () => new Date().toISOString();

export default function InstrumentScheduleView({ schedules = [], locations = [], machineProgress, onMark, readOnly = false }) {
  const [locFilter, setLocFilter] = useState("all");
  const cur = currentChainage(machineProgress, "TBM1"); // อ้าง TBM1 เป็นหลัก (project-wide)
  const now = today();
  const locName = useMemo(() => Object.fromEntries(locations.map((l) => [String(l.id), l.name])), [locations]);
  const sum = useMemo(() => summarizeSchedules(schedules, cur, now), [schedules, cur, now]);
  const rows = useMemo(() => {
    const list = locFilter === "all" ? schedules : schedules.filter((s) => String(s.locationId) === locFilter);
    return list.map((s) => ({ s, st: scheduleStatus(s, cur, now) }))
      .sort((a, b) => ({ overdue:0, due:1, pending:2, done:3, na:4 })[a.st] - ({ overdue:0, due:1, pending:2, done:3, na:4 })[b.st]);
  }, [schedules, locFilter, cur, now]);

  return (
    <div className="max-w-full mx-auto space-y-6 animate-fade-in pb-24">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="ถึงกำหนด" value={sum.due} subtext="Due" color="text-code-b" />
        <StatCard label="เลยกำหนด" value={sum.overdue} subtext="Overdue" color="text-code-d" />
        <StatCard label="รอ" value={sum.pending} subtext="Pending" color="text-ink-2" />
        <StatCard label="เสร็จ" value={sum.done} subtext="Done" color="text-code-a" />
      </div>
      <div className="bg-surface rounded-card shadow-card border border-line overflow-hidden">
        <div className="px-6 py-4 border-b border-line bg-surface-alt flex items-center gap-3">
          <h3 className="font-semibold text-ink">วาระตรวจวัด</h3>
          <select className="ml-auto border border-line rounded-input px-2 py-1 text-sm" value={locFilter} onChange={(e) => setLocFilter(e.target.value)}>
            <option value="all">ทุกจุด</option>
            {locations.map((l) => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-white uppercase bg-navy-dark">
              <tr><th className="px-4 py-2">จุด</th><th className="px-4 py-2">ชนิด</th><th className="px-4 py-2">กำหนด</th><th className="px-4 py-2">สถานะ</th>{!readOnly && <th className="px-4 py-2"></th>}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(({ s, st }) => (
                <tr key={s.id} className="hover:bg-cyan-tint">
                  <td className="px-4 py-2.5 text-ink">{locName[String(s.locationId)] || s.locationId}</td>
                  <td className="px-4 py-2.5 text-ink-2">{s.scheduleType === "LONG_TERM" ? s.longTermLabel : `${s.instrumentGroup} @${s.distanceOffset}m`}</td>
                  <td className="px-4 py-2.5 text-ink-2">{s.scheduleType === "DISTANCE" ? stationLabel(s.tbmChainage) : (s.targetDate || "-")}</td>
                  <td className={`px-4 py-2.5 font-semibold ${STATUS_CLS[st]}`}>{st}</td>
                  {!readOnly && <td className="px-4 py-2.5">{st !== "done" && onMark && <button onClick={() => onMark({ ...s, isMeasured:true, measuredAt: today() })} className="p-1.5 rounded hover:bg-code-a/10 text-code-a"><Check size={16} /></button>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: build + Commit**

Run: `npm run build`  Expected: สำเร็จ
```bash
git add src/components/views/InstrumentScheduleView.jsx
git commit -m "feat(instrument): implement schedule view"
```

### Task 7.2: write handlers ใน App + wire tick/edit

**Files:**
- Modify: `src/App.jsx` (handlers หลังกลุ่ม issue handlers ~บรรทัด 92; import `makeInstId` ~23; wire props)

**Interfaces:**
- Consumes: `apiCall` (api.js), `makeInstId`/`STORE`/`persistCache` (instruments.js)
- Produces: `handleSaveInstReading`, `handleMarkInstSchedule`, `handleUpdateInstrument`

- [ ] **Step 1: เพิ่ม import** (แก้ import instruments.js ~บรรทัด 23 ให้รวม `makeInstId`)

```js
import { STORE, loadCache, persistCache, makeInstId } from "./utils/instruments";
```

- [ ] **Step 2: เพิ่ม handlers** (หลัง `handleDeleteIssue` ~บรรทัด 92)

```js
const handleSaveInstReading = (reading) => {
  const row = reading.id ? reading : { ...reading, id: makeInstId("rd"), enteredBy: "manual" };
  const next = reading.id ? instReadings.map((r) => (r.id === row.id ? row : r)) : [row, ...instReadings];
  setInstReadings(next); persistCache(STORE.readings, next);
  apiCall(reading.id ? "updateInstReading" : "addInstReading", row).catch((e) => console.warn("inst reading sync:", e.message));
};
const handleMarkInstSchedule = (sched) => {
  const next = instSchedules.map((s) => (s.id === sched.id ? sched : s));
  setInstSchedules(next); persistCache(STORE.schedules, next);
  apiCall("saveInstSchedule", sched).catch((e) => console.warn("inst schedule sync:", e.message));
};
const handleUpdateInstrument = (ins) => {
  const next = instInstruments.map((i) => (i.id === ins.id ? ins : i));
  setInstInstruments(next); persistCache(STORE.instruments, next);
  apiCall("updateInstrument", ins).catch((e) => console.warn("inst update sync:", e.message));
};
```

- [ ] **Step 3: wire เข้า view routes** (แก้ route ที่ Phase 3 — เปลี่ยน `onMark={null}` เป็น `onMark={handleMarkInstSchedule}`; ถ้า viewer ให้ `readOnly` ซ่อน tick อยู่แล้ว)

```jsx
{activeTab === "inst_schedule" && (
  <InstrumentScheduleView schedules={instSchedules} locations={instLocations} machineProgress={machineProgress}
    onMark={isViewer ? null : handleMarkInstSchedule} readOnly={isViewer} />
)}
```

- [ ] **Step 4: verify (smoke) + Commit**

Run: `npm run build`
Expected: สำเร็จ · กด tick วาระ → สถานะเป็น done · reload (จาก localStorage) ยังคง done
```bash
git add src/App.jsx
git commit -m "feat(instrument): wire write handlers (reading/schedule/instrument)"
```

> **หมายเหตุ edit reading เต็มรูปแบบ** (InstrumentFormModal port จาก IssueFormModal) — ทำเมื่อจำเป็น; แกนหลักของการแก้ค่าคือผ่าน Claude skill (Phase 8) ส่วนในแอปมีแค่ tick วาระ + `handleUpdateInstrument` (installStatus/note) พอสำหรับ "แก้มือเบาๆ"

---

## Phase 8 — PDF-Ingestion Skill

### Task 8.1: เขียน skill `instrument-pdf-ingest`

**Files:**
- Create: `skill/instrument-pdf-ingest/SKILL.md`
- Read (ต้นแบบ): `Instument Monitoring/skill/update-from-pdf-report.md`

- [ ] **Step 1: เขียน SKILL.md** (workflow + guardrails)

````markdown
---
name: instrument-pdf-ingest
description: อ่าน PDF รายงานการตรวจวัด instrument (LJT) แล้วสกัดค่า → review กับผู้ใช้ → เขียนเข้า Google Sheets ผ่าน GAS. ใช้เมื่อผู้ใช้ส่งไฟล์ PDF report ของ instrument (INC/EXT/PI/SS) เข้ามาเพื่ออัพเดทค่า/สถานะ
---

# Instrument PDF Ingestion

## เมื่อไหร่ใช้
ผู้ใช้ส่ง PDF report การตรวจวัด (ชื่อแบบ `TA-LJT-DR-...`) เข้ามาใน session เพื่ออัพเดทค่า

## ขั้นตอน (human-in-the-loop — ห้ามเขียนก่อนผู้ใช้ยืนยัน)

1. **อ่าน PDF** (multimodal) — ระบุ: location (STA), วันที่ตรวจ, ครั้งที่ (Nth), TBM chainage ณ วันวัด, ชนิดเครื่องในรายงาน
2. **map location → id** — เทียบ STA กับ `Inst_Locations` (ดึงจาก `<GAS_URL>?action=getData&machine=TBM1`) หา locationId + instruments ของจุดนั้น
3. **สกัดค่าต่อเครื่อง:**
   - INC: depth profile A/B (depth, aAxis, bAxis) ทุกความลึก
   - EXT: settlement ต่อ ring + datum
   - PI: pressure (kPa) + water level (m) ต่อ sensor
   - SS: settlement ต่อจุด
4. **แสดงตาราง review ในแชท** — ค่าที่สกัด + เทียบ threshold (`Inst_Thresholds`) + **ไฮไลต์: ค่าที่อ่านไม่ชัด, ค่าที่เกิน alert/alarm/action**
5. **รอผู้ใช้ยืนยัน/แก้**
6. **เขียนเข้า Sheets** — ต่อ instrument ต่อวันที่: `apiCall("addInstReading", { id, instrumentId, date, seq, tbmChainage, valuePrimary, valueSecondary, profileJson, maxValue, sourcePdf, enteredBy:"claude" })` (POST ไป GAS_URL); แล้ว `saveInstSchedule` mark วาระที่ตรงวันตรวจเป็น measured

## Guardrails (บังคับ — CLAUDE.md zero-hallucination)
- **อ่านเลขไม่ชัด → ถามผู้ใช้ ห้ามเดา** (engineering data)
- **ห้ามแก้ threshold ตามค่าใน PDF** — threshold มาจาก shop drawing เก็บใน `Inst_Thresholds` เท่านั้น
- profileJson: `[{depth, a, b}, ...]` (INC) หรือ history array (EXT/SS/PI) — serialize ให้ตรง format ที่ report viewer parse (`parseProfile`)
- ยืนยัน `id` ไม่ชนของเดิม (query getData ก่อน; update ใช้ id เดิม)
- ถ้าค่าเกิน action → เตือนผู้ใช้ชัดเจนในตาราง review
````

- [ ] **Step 2: Commit**

```bash
git add skill/instrument-pdf-ingest/SKILL.md
git commit -m "feat(instrument): add PDF ingestion skill"
```

---

## Phase 9 — Final Verify + Deploy

### Task 9.1: full verification

- [ ] **Step 1: jest ทั้งชุด (baseline + ใหม่ ต้องเขียว)**

Run: `CI=true npx react-scripts test --watchAll=false`
Expected: ทุก suite PASS (143 เดิม + instrument ใหม่) — ถ้าใน worktree หา test ไม่เจอ ให้รันบน path สะอาด + `npm ci` (ดู memory: worktree jest Windows gotcha)

- [ ] **Step 2: build clean**

Run: `npm run build`
Expected: `Compiled successfully` ไม่มี warning ร้ายแรง

- [ ] **Step 3: smoke ผ่าน preview** (dev server)

- nav group "เครื่องมือวัด" ปรากฏ (desktop sidebar + mobile More)
- Instrument dashboard: 4 KPI + list 29 จุด · คลิกเปิด location
- location 8+300: tabs INC/EXT/PI/SS + chart + threshold + blueprint plot
- วาระตรวจวัด: KPI + list + tick ได้
- `?view=1`: เห็น instrument แบบ read-only (ไม่มีปุ่ม tick)
- console ไม่มี error, network POST สำเร็จตอน tick

- [ ] **Step 4: front-end deploy (Vercel)** — ตาม repo-topology-deploy: push `main` (origin `ratanapong2544-arch/TBM-Monitoring`) → Vercel auto-build จาก source (อย่า commit `build/`)

- [ ] **Step 5: GAS deploy** — ยืนยัน Task 2.2 Step 5 ทำแล้ว (clasp push+redeploy + setupSheets) และ getData คืน 5 array จริง

---

## Self-Review (ผู้เขียน plan ตรวจเทียบ spec)

**1. Spec coverage:**
- §3 architecture (nav+flow+chainage adapter) → Task 3.1, 1.2 ✅
- §4 data model 5 ตาราง → Task 2.1 (headers) ✅
- §5 GAS actions → Task 2.1, 2.2 ✅
- §6 views (dashboard/location/schedule + viewer/mobile) → Phase 5,6,7 + Task 3.1 ✅
- §7 edit เบาๆ → Task 7.2 ✅
- §8 PDF skill → Task 8.1 ✅
- §9 migration (245/731 + blueprint + 8+300 readings + threshold 2 ชั้น) → Phase 4 ✅
- §10 testing → Phase 1 (TDD) + Phase 9 ✅
- §12 risk (Tailwind CDN, gas-live only, chainage adapter real) → Global Constraints + Task 1.2 Step 1 ✅

**2. Placeholder scan:** logic/GAS/migration = complete code. View/report tasks (6.3 Step 2-3) = structure + port refs + key snippet (ไม่ paste 1000 บรรทัด) — legit port จาก source ที่ระบุชัด + chart template จริง. Task 1.2 Step 4 มีคอมเมนต์ "แก้เป็นสูตรจริงจาก Step 1" — โดยเจตนา (สูตร chainage มีอยู่จริงในโค้ด ต้องอ่านก่อน ไม่ใช่เดา)

**3. Type consistency:** `classifyStatus`, `resolveThreshold`, `latestReading`, `currentChainage`, `scheduleStatus`, `makeInstId`, `STORE`, `parseProfile` — ชื่อ+signature ตรงกันข้าม Phase 1 → ที่เรียกใน Phase 5-7 ✅ · GAS action names (`addInstReading` ฯลฯ) ตรงกันข้าม Task 2.2 → App handlers 7.2 + skill 8.1 ✅ · sheet headers `INST_*_HEADERS` ตรงกับ migration row-objects (Task 4.1) ✅
