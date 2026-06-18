# Profile Section (Front-End Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มมุมมอง "ภาคตัดธรณีตามยาว + การเชิด/ตกของหัวเจาะ" (geology-first longitudinal section, แบบ A2+A1) ฝังใต้ 3D Alignment ใน Executive Dashboard — build/test บน sample `profileGeo.js` fixture โดยยังไม่ต้องรอสกัด DWG จริง

**Architecture:** 3 เลเยอร์ตามแพทเทิร์น `alignmentGeo.js`+`AlignmentMapView.jsx` เดิม — (1) ข้อมูล static `profileGeo.js` (ชั้นดิน/เส้นออกแบบ/หลุมเจาะ ตาม data contract; ตอนนี้เป็น **sample fixture** รอ extraction plan มาแทน), (2) คณิตศาสตร์ pure `profileSection.js` (jest-tested), (3) view `ProfileSectionView.jsx` (SVG). ค่า deviation อ่านจากฟิลด์ `headV/artV/tailV/vrt` บน segment record — ถ้ายังไม่มี (ปัจจุบัน) view แสดงชั้นดิน+แนวออกแบบ + โน้ต "รอข้อมูล"; เมื่อ backfill/กรอกแล้วจะวาดเส้นจริง+เชิด/ตกอัตโนมัติ

**Tech Stack:** React 18 (CRA) · plain SVG · `react-scripts test` (jest, jsdom) · Tailwind · lucide-react · reuse `chartTheme.js` tokens + `alignmentGeo.parseCH`

---

## Out of scope — ทำเป็นแผนแยกภายหลัง (พึ่ง external input)

- **DWG extraction plan** — ลง ODA File Converter + `pip install ezdxf` → `tools/extract_profile.py` อ่านชื่อ layer จริง → เขียน `profileGeo.js` ของจริงแทน fixture (เขียน exact code ตอนนี้ไม่ได้ เพราะชื่อ layer ยังไม่รู้ — ห้ามเดา)
- **Deviation data plan** — เพิ่มคอลัมน์ `headV/artV/tailV/vrt` ใน GAS per-machine sheet + หน้า Record Daily + import backfill จากไฟล์ Excel/CSV (map คอลัมน์ตอนเห็นไฟล์จริง)

แผนนี้ทำให้ front-end ทำงาน+เทสต์ได้ครบบน fixture; สองแผนข้างบนแค่ "ป้อนข้อมูลจริง" เข้า contract เดิม ไม่ต้องแก้ view/util

## Data contract (`profileGeo.js` exports — fixture และของจริงต้องตรงนี้)

```
LAYERS      : [{ name, code, color, top:[{ch,rl}], bottom:[{ch,rl}] }]   // rl = RL เมตร, ch = chainage เมตร
DESIGN_LINE : [{ ch, rl }]            // แนวแกนอุโมงค์ออกแบบ
BORE_DIA    : number                 // เส้นผ่านศูนย์กลางเจาะ (ม.)
BOREHOLES   : [{ id, ch, groundRL, strata:[{code,fromRL,toRL}], spt:[{rl,n}] }]
CH_RANGE    : { min, max }
```
deviation ต่อ ring (บน segment record): `headV,artV,tailV` (mm), `vrt` (deg) — `actualRL(ch) = designRL(ch) + headV/1000`

## File structure

| ไฟล์ | สร้าง/แก้ | หน้าที่ |
|---|---|---|
| `src/utils/profileGeo.js` | สร้าง | ข้อมูล static (sample fixture, contract เดียวกับของจริง) |
| `src/utils/profileGeo.test.js` | สร้าง | integrity ของ fixture/contract |
| `src/utils/profileSection.js` | สร้าง | คณิต pure: scale, interpolate, deviation series, breaches |
| `src/utils/profileSection.test.js` | สร้าง | unit tests |
| `src/components/views/ProfileSectionView.jsx` | สร้าง | SVG view (A2+A1) |
| `src/components/views/ExecutiveDashboardView.jsx` | แก้ (import + JSX หลังบรรทัด 215) | ฝัง section ใต้ 3D Alignment |

---

### Task 1: profileGeo.js — sample fixture (data contract)

**Files:**
- Create: `src/utils/profileGeo.js`
- Test: `src/utils/profileGeo.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/utils/profileGeo.test.js
import { LAYERS, DESIGN_LINE, BORE_DIA, BOREHOLES, CH_RANGE } from "./profileGeo";

test("CH_RANGE: min < max", () => {
  expect(CH_RANGE.min).toBeLessThan(CH_RANGE.max);
});

test("LAYERS: ทุกชั้นมี top/bottom และ ch อยู่ใน CH_RANGE", () => {
  expect(LAYERS.length).toBeGreaterThan(0);
  for (const l of LAYERS) {
    expect(Array.isArray(l.top)).toBe(true);
    expect(Array.isArray(l.bottom)).toBe(true);
    expect(l.top.length).toBeGreaterThan(0);
    for (const p of [...l.top, ...l.bottom]) {
      expect(p.ch).toBeGreaterThanOrEqual(CH_RANGE.min);
      expect(p.ch).toBeLessThanOrEqual(CH_RANGE.max);
      expect(typeof p.rl).toBe("number");
    }
  }
});

test("DESIGN_LINE: ≥2 จุด และ rl เป็นตัวเลข", () => {
  expect(DESIGN_LINE.length).toBeGreaterThanOrEqual(2);
  for (const p of DESIGN_LINE) expect(typeof p.rl).toBe("number");
});

test("BORE_DIA เป็นตัวเลขบวก; BOREHOLES มี strata เรียงลง", () => {
  expect(BORE_DIA).toBeGreaterThan(0);
  for (const b of BOREHOLES) {
    expect(typeof b.ch).toBe("number");
    expect(b.strata.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx react-scripts test src/utils/profileGeo.test.js --watchAll=false`
Expected: FAIL — "Cannot find module './profileGeo'"

- [ ] **Step 3: Write the fixture**

```js
// src/utils/profileGeo.js
// ⚠ SAMPLE / FIXTURE — ค่าทั้งหมดเป็น schematic ไม่ใช่ค่าสำรวจจริง
// จะถูกแทนด้วยข้อมูลที่สกัดจาก 01.TBM1 Daily Progress.dwg (ดู DWG extraction plan)
// contract: ดู docs/superpowers/specs/2026-06-18-...-design.md §5.1
// chainage system เดียวกับ alignmentGeo.js (เจาะทิศ chainage "ลดลง")

export const CH_RANGE = { min: 8000, max: 8400 };

export const LAYERS = [
  { name: "Soft–Medium Clay", code: "CH", color: "#5f8f86",
    top:    [{ ch: 8400, rl: 0.5 }, { ch: 8000, rl: -0.5 }],
    bottom: [{ ch: 8400, rl: -12 }, { ch: 8000, rl: -14 }] },
  { name: "Stiff Clay", code: "CL", color: "#c7a98b",
    top:    [{ ch: 8400, rl: -12 }, { ch: 8000, rl: -14 }],
    bottom: [{ ch: 8400, rl: -18 }, { ch: 8000, rl: -20 }] },
  { name: "Dense Sand", code: "SM", color: "#c7bd7a",
    top:    [{ ch: 8400, rl: -18 }, { ch: 8000, rl: -20 }],
    bottom: [{ ch: 8400, rl: -31 }, { ch: 8000, rl: -33 }] },
];

export const DESIGN_LINE = [
  { ch: 8400, rl: -19.5 }, { ch: 8200, rl: -20.2 }, { ch: 8000, rl: -21.0 },
];

export const BORE_DIA = 6.0; // ⚠ SAMPLE — ต้องสกัด/ยืนยันค่าจริงจาก DWG

export const BOREHOLES = [
  { id: "BH-27", ch: 8186, groundRL: 1.0,
    strata: [
      { code: "CH", fromRL: 0.5, toRL: -13 },
      { code: "CL", fromRL: -13, toRL: -19 },
      { code: "SM", fromRL: -19, toRL: -32 },
    ],
    spt: [{ rl: -2, n: 4 }, { rl: -10, n: 8 }, { rl: -20, n: 35 }, { rl: -28, n: 50 }] },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx react-scripts test src/utils/profileGeo.test.js --watchAll=false`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/profileGeo.js src/utils/profileGeo.test.js
git commit -m "feat(profile): add profileGeo sample fixture + contract test"
```

---

### Task 2: profileSection.js — scale + parse helpers

**Files:**
- Create: `src/utils/profileSection.js`
- Test: `src/utils/profileSection.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/utils/profileSection.test.js
import { linScale, parseRingNo } from "./profileSection";

test("linScale: map ค่าเชิงเส้นระหว่างสองช่วง", () => {
  expect(linScale(5, [0, 10], [0, 100])).toBe(50);
  expect(linScale(0, [0, 10], [20, 120])).toBe(20);
  expect(linScale(10, [0, 10], [20, 120])).toBe(120);
  // domain กลับด้าน (chainage ลดลง / RL สูงอยู่บน)
  expect(linScale(8400, [8400, 8000], [54, 884])).toBe(54);
  expect(linScale(8000, [8400, 8000], [54, 884])).toBe(884);
});

test("parseRingNo: numeric → int, อื่นๆ → null", () => {
  expect(parseRingNo("572")).toBe(572);
  expect(parseRingNo(572)).toBe(572);
  expect(parseRingNo("T7")).toBeNull();
  expect(parseRingNo("")).toBeNull();
  expect(parseRingNo(null)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx react-scripts test src/utils/profileSection.test.js --watchAll=false`
Expected: FAIL — "Cannot find module './profileSection'"

- [ ] **Step 3: Write minimal implementation**

```js
// src/utils/profileSection.js
// คณิตศาสตร์ pure สำหรับภาคตัด profile — ไม่ import React/SVG (jest-safe)
import { parseCH } from "./alignmentGeo";

export { parseCH };

// map ค่าเชิงเส้นจาก domain [d0,d1] → range [r0,r1] (รองรับ domain กลับด้าน)
export function linScale(v, [d0, d1], [r0, r1]) {
  if (d1 === d0) return r0;
  return r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

// ringNo ที่เป็นตัวเลขล้วน → int, อื่นๆ (เช่น "T7") → null
export function parseRingNo(ringNo) {
  if (ringNo == null) return null;
  const s = String(ringNo).trim();
  return /^\d+$/.test(s) ? parseInt(s, 10) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx react-scripts test src/utils/profileSection.test.js --watchAll=false`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/profileSection.js src/utils/profileSection.test.js
git commit -m "feat(profile): profileSection linScale + parseRingNo"
```

---

### Task 3: profileSection.js — RL interpolation, exaggeration, classify

**Files:**
- Modify: `src/utils/profileSection.js`
- Test: `src/utils/profileSection.test.js`

- [ ] **Step 1: Add failing tests**

```js
// เพิ่มท้าย src/utils/profileSection.test.js
import { designRLAtCh, exaggeratedRL, classifyDeviation } from "./profileSection";

const DLINE = [{ ch: 8400, rl: -19.5 }, { ch: 8200, rl: -20.2 }, { ch: 8000, rl: -21.0 }];

test("designRLAtCh: interpolate เชิงเส้น (ไม่สนลำดับ input)", () => {
  expect(designRLAtCh(DLINE, 8400)).toBeCloseTo(-19.5, 6);
  expect(designRLAtCh(DLINE, 8000)).toBeCloseTo(-21.0, 6);
  expect(designRLAtCh(DLINE, 8300)).toBeCloseTo(-19.85, 6); // กึ่งกลาง 8400↔8200
  expect(designRLAtCh(DLINE, 9999)).toBeNull(); // นอกช่วง
});

test("exaggeratedRL: design + (devMM/1000)*exagg", () => {
  // dev +75mm, exagg 30 → +0.075*30 = +2.25 ม.
  expect(exaggeratedRL(-20, 75, 30)).toBeCloseTo(-17.75, 6);
  expect(exaggeratedRL(-20, -100, 10)).toBeCloseTo(-21.0, 6);
  expect(exaggeratedRL(-20, 0, 30)).toBeCloseTo(-20, 6);
});

test("classifyDeviation: ok/over/under เทียบ tolerance", () => {
  expect(classifyDeviation(50)).toBe("ok");
  expect(classifyDeviation(75)).toBe("ok");
  expect(classifyDeviation(76)).toBe("over");
  expect(classifyDeviation(-90)).toBe("under");
  expect(classifyDeviation(120, 100)).toBe("over");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx react-scripts test src/utils/profileSection.test.js --watchAll=false`
Expected: FAIL — "designRLAtCh is not a function"

- [ ] **Step 3: Implement**

```js
// เพิ่มท้าย src/utils/profileSection.js

// RL ของแนวออกแบบที่ chainage ch (interpolate เชิงเส้น) — null ถ้านอกช่วง
export function designRLAtCh(designLine, ch) {
  const pts = [...designLine].sort((a, b) => a.ch - b.ch);
  if (ch < pts[0].ch || ch > pts[pts.length - 1].ch) return null;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].ch >= ch) {
      const a = pts[i - 1], b = pts[i];
      return linScale(ch, [a.ch, b.ch], [a.rl, b.rl]);
    }
  }
  return pts[pts.length - 1].rl;
}

// RL ที่แสดง (ขยาย deviation ×exagg รอบเส้นออกแบบ)
export function exaggeratedRL(designRL, devMM, exagg) {
  return designRL + (devMM / 1000) * exagg;
}

// จัดประเภทค่าเบี่ยงเบนเทียบ tolerance (mm)
export function classifyDeviation(devMM, tolMM = 75) {
  if (devMM > tolMM) return "over";
  if (devMM < -tolMM) return "under";
  return "ok";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx react-scripts test src/utils/profileSection.test.js --watchAll=false`
Expected: PASS (5 tests รวมของเดิม)

- [ ] **Step 5: Commit**

```bash
git add src/utils/profileSection.js src/utils/profileSection.test.js
git commit -m "feat(profile): designRLAtCh + exaggeratedRL + classifyDeviation"
```

---

### Task 4: profileSection.js — deviationSeries + latestRingState + toleranceBreaches

**Files:**
- Modify: `src/utils/profileSection.js`
- Test: `src/utils/profileSection.test.js`

- [ ] **Step 1: Add failing tests**

```js
// เพิ่มท้าย src/utils/profileSection.test.js
import { deviationSeries, latestRingState, toleranceBreaches } from "./profileSection";

const DLINE2 = [{ ch: 8400, rl: -19.5 }, { ch: 8000, rl: -21.0 }];
const RECS = [
  { ringNo: "570", finishCH: "8+300", headV: 50, artV: 40, tailV: 30, vrt: 0.2 },
  { ringNo: "571", finishCH: "8+200", headV: 90, artV: 80, tailV: 70, vrt: 0.4 },
  { ringNo: "572", finishCH: "8+100", headV: -120, artV: -100, tailV: -80, vrt: -0.3 },
  { ringNo: "T7",  finishCH: "8+050", headV: 10 },              // temporary-like → ข้าม latest
  { ringNo: "569", finishCH: "8+350" },                          // ไม่มี headV → ข้าม
];

test("deviationSeries: เฉพาะ record ที่มี headV, มี designRL/actualRL, เรียงตาม ch จากมาก→น้อย", () => {
  const s = deviationSeries(RECS, DLINE2);
  expect(s.map(r => r.ringNo)).toEqual(["570", "571", "572", "T7"]);
  const r571 = s.find(r => r.ringNo === "571");
  expect(r571.ch).toBe(8200);
  expect(r571.designRL).toBeCloseTo(-20.25, 6);          // กึ่งกลาง
  expect(r571.actualRL).toBeCloseTo(-20.16, 6);          // -20.25 + 90/1000
});

test("latestRingState: ring ตัวเลขมากสุดที่มี headV", () => {
  const l = latestRingState(RECS);
  expect(l.ringNo).toBe("572");
  expect(l.headV).toBe(-120);
  expect(l.vrt).toBe(-0.3);
  expect(latestRingState([])).toBeNull();
});

test("toleranceBreaches: คืน ring ที่ |headV| > tol พร้อม side", () => {
  const b = toleranceBreaches(deviationSeries(RECS, DLINE2), 75);
  expect(b).toEqual([
    { ringNo: "571", ch: 8200, side: "over" },
    { ringNo: "572", ch: 8100, side: "under" },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx react-scripts test src/utils/profileSection.test.js --watchAll=false`
Expected: FAIL — "deviationSeries is not a function"

- [ ] **Step 3: Implement**

```js
// เพิ่มท้าย src/utils/profileSection.js

// แปลง records → จุดค่าเบี่ยงเบน (เฉพาะที่มี headV ตัวเลข), เรียงตาม chainage มาก→น้อย (ทิศเจาะ)
export function deviationSeries(records = [], designLine = []) {
  const out = [];
  for (const r of records) {
    if (r == null || r.headV == null || isNaN(parseFloat(r.headV))) continue;
    const ch = parseCH(r.finishCH);
    if (isNaN(ch)) continue;
    const designRL = designRLAtCh(designLine, ch);
    const headV = parseFloat(r.headV);
    out.push({
      ringNo: r.ringNo, ch, headV,
      artV: r.artV == null ? null : parseFloat(r.artV),
      tailV: r.tailV == null ? null : parseFloat(r.tailV),
      vrt: r.vrt == null ? null : parseFloat(r.vrt),
      designRL,
      actualRL: designRL == null ? null : designRL + headV / 1000,
    });
  }
  return out.sort((a, b) => b.ch - a.ch);
}

// ring ตัวเลขมากสุดที่มี headV → state สำหรับ callout หัวเจาะ; null ถ้าไม่มี
export function latestRingState(records = []) {
  let best = null, bestN = -Infinity;
  for (const r of records) {
    if (r == null || r.headV == null || isNaN(parseFloat(r.headV))) continue;
    const n = parseRingNo(r.ringNo);
    if (n == null || n <= bestN) continue;
    bestN = n;
    best = {
      ringNo: r.ringNo,
      ch: parseCH(r.finishCH),
      headV: parseFloat(r.headV),
      artV: r.artV == null ? null : parseFloat(r.artV),
      tailV: r.tailV == null ? null : parseFloat(r.tailV),
      vrt: r.vrt == null ? null : parseFloat(r.vrt),
    };
  }
  return best;
}

// ring ที่เกิน tolerance (mm) จาก series → [{ringNo, ch, side}]
export function toleranceBreaches(series = [], tolMM = 75) {
  return series
    .map((s) => ({ ringNo: s.ringNo, ch: s.ch, side: classifyDeviation(s.headV, tolMM) }))
    .filter((s) => s.side !== "ok");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx react-scripts test src/utils/profileSection.test.js --watchAll=false`
Expected: PASS (8 tests รวม)

- [ ] **Step 5: Commit**

```bash
git add src/utils/profileSection.js src/utils/profileSection.test.js
git commit -m "feat(profile): deviationSeries + latestRingState + toleranceBreaches"
```

---

### Task 5: ProfileSectionView.jsx — SVG view (A2 + A1)

**Files:**
- Create: `src/components/views/ProfileSectionView.jsx`

> ไม่มี automated test (โปรเจกต์ไม่มี @testing-library; logic ทั้งหมดถูกเทสต์ใน profileSection.js แล้ว) — verify ด้วย `npm start`

- [ ] **Step 1: Write the component**

```jsx
// src/components/views/ProfileSectionView.jsx
import React, { useMemo, useState } from "react";
import { Mountain } from "lucide-react";
import SectionHeader from "../common/SectionHeader";
import { chartColors } from "../../ui-ux-pro-max/chartTheme";
import { LAYERS, DESIGN_LINE, CH_RANGE } from "../../utils/profileGeo";
import {
  linScale, designRLAtCh, exaggeratedRL, classifyDeviation,
  deviationSeries, latestRingState, toleranceBreaches,
} from "../../utils/profileSection";

const W = 900, H = 360;
const M = { l: 54, r: 16, t: 16, b: 30 };
const TOL = 75;
const EXAGGS = [10, 30, 50];
const BREACH_COLOR = { over: chartColors.delay, under: chartColors.delay };

export default function ProfileSectionView({ segmentRecords = [], machine = "TBM1", embedded = false, readOnly = false }) {
  const [exagg, setExagg] = useState(30);

  const series = useMemo(() => deviationSeries(segmentRecords, DESIGN_LINE), [segmentRecords]);
  const latest = useMemo(() => latestRingState(segmentRecords), [segmentRecords]);
  const breaches = useMemo(() => toleranceBreaches(series, TOL), [series]);

  // RL domain จากชั้นดิน
  const rls = LAYERS.flatMap((l) => [...l.top, ...l.bottom].map((p) => p.rl));
  const rlMin = Math.min(...rls), rlMax = Math.max(...rls);
  const x = (ch) => linScale(ch, [CH_RANGE.max, CH_RANGE.min], [M.l, W - M.r]); // chainage ลดลง ซ้าย→ขวา
  const y = (rl) => linScale(rl, [rlMax, rlMin], [M.t, H - M.b]);               // RL สูงอยู่บน

  if (machine !== "TBM1") {
    return (
      <Wrapper embedded={embedded}>
        <div className="p-8 text-center text-sm text-gray-500">
          ภาคตัด profile มีเฉพาะ <b>TBM1</b> — สลับเครื่องเป็น TBM1 เพื่อดู
        </div>
      </Wrapper>
    );
  }

  const polyPoints = (top, bottom) => {
    const t = top.map((p) => `${x(p.ch)},${y(p.rl)}`);
    const b = bottom.slice().reverse().map((p) => `${x(p.ch)},${y(p.rl)}`);
    return [...t, ...b].join(" ");
  };
  const designPts = DESIGN_LINE.map((p) => `${x(p.ch)},${y(p.rl)}`).join(" ");
  const actualPts = series
    .filter((s) => s.designRL != null)
    .map((s) => `${x(s.ch)},${y(exaggeratedRL(s.designRL, s.headV, exagg))}`)
    .join(" ");

  return (
    <Wrapper embedded={embedded}>
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs text-gray-500">ขยายแนวตั้ง (deviation)</span>
        <div className="flex gap-1">
          {EXAGGS.map((e) => (
            <button
              key={e}
              onClick={() => setExagg(e)}
              className={`px-2 py-0.5 text-xs rounded ${exagg === e ? "bg-[#003B84] text-white" : "bg-gray-100 text-gray-600"}`}
            >×{e}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="ภาคตัดธรณีตามแนวอุโมงค์">
        {/* ชั้นดิน */}
        {LAYERS.map((l, i) => (
          <polygon key={i} points={polyPoints(l.top, l.bottom)} fill={l.color} opacity="0.85" />
        ))}
        {LAYERS.map((l, i) => (
          <text key={"lbl" + i} x={x(l.top[0].ch) + 6} y={y(l.top[0].rl) + 14} fontSize="10" fill="#1a1a1a" opacity="0.8">
            {l.name}
          </text>
        ))}

        {/* เส้นออกแบบ (ประ navy) */}
        <polyline points={designPts} fill="none" stroke={chartColors.planned} strokeWidth="1.6" strokeDasharray="5 4" />

        {/* เส้นจริง (ส้ม/เขียว, ขยาย) */}
        {series.length > 0 && (
          <polyline points={actualPts} fill="none" stroke={chartColors.actual} strokeWidth="2.2" />
        )}

        {/* จุดเกิน tolerance = แดง */}
        {series
          .filter((s) => s.designRL != null && classifyDeviation(s.headV, TOL) !== "ok")
          .map((s, i) => (
            <circle key={"b" + i} cx={x(s.ch)} cy={y(exaggeratedRL(s.designRL, s.headV, exagg))} r="3.2"
              fill={BREACH_COLOR[classifyDeviation(s.headV, TOL)]} />
          ))}

        {/* callout หัวเจาะล่าสุด (A1) */}
        {latest && latest.ch != null && designRLAtCh(DESIGN_LINE, latest.ch) != null && (
          <g>
            <line x1={x(latest.ch)} y1={M.t} x2={x(latest.ch)} y2={H - M.b} stroke="#b8860b" strokeWidth="1" strokeDasharray="3 3" />
            <rect x={Math.min(x(latest.ch) + 6, W - 168)} y={M.t + 4} width="160" height="34" rx="6" fill="#11203a" opacity="0.92" />
            <text x={Math.min(x(latest.ch) + 14, W - 160)} y={M.t + 18} fontSize="11" fill="#ffd27f">
              R{latest.ringNo} · Head {latest.headV > 0 ? "+" : ""}{latest.headV}mm
            </text>
            <text x={Math.min(x(latest.ch) + 14, W - 160)} y={M.t + 31} fontSize="11" fill="#9fc3ff">
              VRT {latest.vrt != null ? (latest.vrt > 0 ? "+" : "") + latest.vrt + "°" : "—"}
            </text>
          </g>
        )}

        {/* แกน RL (ซ้าย) */}
        {[rlMax, (rlMax + rlMin) / 2, rlMin].map((rl, i) => (
          <text key={"y" + i} x={6} y={y(rl) + 3} fontSize="9" fill={chartColors.axisLabel}>
            {rl.toFixed(0)}
          </text>
        ))}
        {/* แกน chainage (ล่าง) */}
        <text x={M.l} y={H - 8} fontSize="9" fill={chartColors.axisLabel}>CH {(CH_RANGE.max / 1000).toFixed(0)}+{String(CH_RANGE.max % 1000).padStart(3, "0")}</text>
        <text x={W - M.r - 60} y={H - 8} fontSize="9" fill={chartColors.axisLabel}>{(CH_RANGE.min / 1000).toFixed(0)}+{String(CH_RANGE.min % 1000).padStart(3, "0")} →</text>
      </svg>

      {series.length === 0 && (
        <p className="text-xs text-gray-500 mt-2 px-1">
          แสดงชั้นดิน + แนวออกแบบ — รอข้อมูลค่าเชิด/ตก (กรอกใน Record Daily หรือ backfill) จึงจะวาดเส้นจริง
        </p>
      )}
    </Wrapper>
  );
}

function Wrapper({ embedded, children }) {
  return (
    <div>
      {!embedded && (
        <SectionHeader title="ภาคตัดธรณี · เชิด/ตกหัวเจาะ" subtitle="Geological Section · Head Deviation" icon={Mountain} />
      )}
      <div className="bg-white rounded-card border border-line p-3">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles + renders**

Run: `npm start` (เปิด browser) → ไปหน้า Executive (หลัง Task 6) หรือ import ชั่วคราว
Expected: ไม่มี error console; เห็นแถบชั้นดิน 3 ชั้น + เส้นออกแบบประ + โน้ต "รอข้อมูลค่าเชิด/ตก" (เพราะ records ยังไม่มี headV) + ปุ่ม ×10/×30/×50

- [ ] **Step 3: Commit**

```bash
git add src/components/views/ProfileSectionView.jsx
git commit -m "feat(profile): ProfileSectionView SVG section (A2+A1)"
```

---

### Task 6: ฝัง ProfileSectionView ใต้ 3D Alignment ใน Executive

**Files:**
- Modify: `src/components/views/ExecutiveDashboardView.jsx` (import หลังบรรทัด 14; JSX หลังบรรทัด 215)

- [ ] **Step 1: เพิ่ม import**

หา (บรรทัด ~14):
```jsx
import AlignmentMapView from "./AlignmentMapView";
```
เพิ่มบรรทัดถัดไป:
```jsx
import ProfileSectionView from "./ProfileSectionView";
```

- [ ] **Step 2: ฝัง JSX ใต้บล็อก 3D Alignment**

หาบล็อกนี้ (บรรทัด ~209-215):
```jsx
      {/* ═══ แนวอุโมงค์ 3D (อยู่บนสุด เหนือภาพรวมโครงการ) ═══ */}
      <div className="print:hidden">
        <SectionHeader title="ตำแหน่งหัวเจาะ · แนวอุโมงค์ 3D" subtitle="TBM Head Position · Live Alignment" icon={MapPin} />
        <div className="mt-4 rounded-card overflow-hidden shadow-card border border-line">
          <AlignmentMapView segmentRecords={segmentRecords} machine={machine} embedded />
        </div>
      </div>
```
แทรกบล็อกใหม่ทันทีหลัง `</div>` ปิดของบล็อกข้างบน (ก่อน `<SectionHeader title="ภาพรวมโครงการ" ...>`):
```jsx

      {/* ═══ ภาคตัดธรณี + เชิด/ตกหัวเจาะ (ใต้ 3D Alignment) ═══ */}
      <div className="print:hidden">
        <SectionHeader title="ภาคตัดธรณี · เชิด/ตกหัวเจาะ" subtitle="Geological Section · Head Deviation" icon={Mountain} />
        <div className="mt-4">
          <ProfileSectionView segmentRecords={segmentRecords} machine={machine} readOnly={readOnly} embedded />
        </div>
      </div>
```

- [ ] **Step 3: เพิ่ม icon `Mountain` ใน import lucide-react**

หา import จาก `lucide-react` (ที่มี `MapPin`, `BarChart3` อยู่แล้ว) แล้วเพิ่ม `Mountain` เข้าไปใน list (เรียงตามที่มีอยู่ ไม่ซ้ำ). ตัวอย่างถ้าบรรทัดเป็น:
```jsx
import { MapPin, BarChart3, ... } from "lucide-react";
```
→ เพิ่ม `Mountain`:
```jsx
import { MapPin, BarChart3, Mountain, ... } from "lucide-react";
```

- [ ] **Step 4: Verify**

Run: `npm start` → หน้า Executive (machine = TBM1)
Expected: ใต้แผนที่ 3D มี section "ภาคตัดธรณี · เชิด/ตกหัวเจาะ" แสดงชั้นดิน + เส้นออกแบบ + โน้ตรอข้อมูล; สลับ machine เป็น TBM2 → ข้อความ "มีเฉพาะ TBM1"; ไม่มี error console

- [ ] **Step 5: รัน test ทั้งชุดให้แน่ใจไม่พัง**

Run: `npx react-scripts test --watchAll=false`
Expected: PASS ทั้งหมด (ของเดิม + profileGeo 4 + profileSection 8)

- [ ] **Step 6: Commit**

```bash
git add src/components/views/ExecutiveDashboardView.jsx
git commit -m "feat(profile): embed ProfileSectionView under 3D Alignment in Executive"
```

---

## Self-Review (เทียบกับ spec)

**Spec coverage:**
- §3 A2 (vertical exaggeration ×N) → Task 5 ปุ่ม ×10/30/50 + `exaggeratedRL` (Task 3) ✅
- §3 A1 (callout) → Task 5 callout R###/Head/VRT ✅
- §3 แดงเมื่อเกิน ±75 → Task 4 `toleranceBreaches` + Task 5 จุดแดง ✅
- §5.1 contract → Task 1 fixture ✅
- §5.2 deviation = design + headV/1000 → Task 4 `actualRL` ✅
- §7 util ทั้งหมด → Task 2-4 ✅ (`headState` = `latestRingState`)
- §8 แกน/ชั้นดิน/เส้นออกแบบ/หัวเจาะ → Task 5 ✅
- §9 ฝังใต้ 3D + per-machine (TBM2 empty) + readOnly prop → Task 6 ✅
- §6 (สกัด DWG) + §10 (กรอก/backfill) → **แผนแยก** (ระบุใน "Out of scope") ✅
- §9 3D scrub-sync = enhancement → ไม่อยู่ใน MVP นี้ (ตรงกับ spec ที่ระบุ "enhancement")

**Placeholder scan:** ไม่มี TODO/“ภายหลัง” ในโค้ดที่ต้องรัน — มีแต่ค่าใน fixture ที่ label ⚠ SAMPLE ชัดเจน (ตามดีไซน์: แทนด้วย extraction plan)

**Type consistency:** `linScale(v,[d0,d1],[r0,r1])`, `designRLAtCh(designLine,ch)`, `exaggeratedRL(designRL,devMM,exagg)`, `deviationSeries(records,designLine)`, `latestRingState(records)`, `toleranceBreaches(series,tolMM)` — เรียกตรงกันทุก Task และใน view ✅

## หมายเหตุการ verify
หลังครบ Task 6: `npx react-scripts test --watchAll=false` ต้องเขียวทั้งหมด + `npm start` เห็น section ใต้ 3D. ค่าเชิด/ตกจะยังว่างจนกว่าจะมีฟิลด์ `headV...` (แผน deviation data)
