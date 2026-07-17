# ระดับหัวเจาะ — กราฟอ่านรู้เรื่อง + ข้อมูลชุดใหม่ · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แทนข้อมูลหัวเจาะที่ผูกเลขริงผิด 370 ริง ด้วยข้อมูลถูกต้อง 629 ริง แล้วปรับกราฟหน้า "ระดับหัวเจาะ" จากที่ excursion −587mm ยึดแกน Y จนอ่านไม่ออก → เป็นโฟกัส 150 ริงล่าสุด + แถบสถานะภาพรวมคลิกได้

**Architecture:** logic คำนวณทั้งหมด (หน้าต่างโฟกัส / domain / ช่วงเกินเกณฑ์ / สถานะ) แยกเป็น pure util `headTrend.js` ทดสอบด้วย jest โดยไม่ต้อง render (โปรเจกต์นี้ไม่มี @testing-library — ทุก test เป็น pure util). แถบสถานะเป็น SVG ตรงๆ ไม่ผ่าน recharts (635 แท่งใน 48px). กราฟหลักยังเป็น recharts LineChart แต่เปลี่ยนแกน X เป็น `type="number"` เพื่อให้ ReferenceArea อ้างช่วงริงได้.

**Tech Stack:** React 18 (CRA) · recharts · Tailwind · jest ผ่าน react-scripts · GAS backend (ไม่แก้)

**Spec:** `docs/superpowers/specs/2026-07-17-head-level-chart-legibility-design.md`

## Global Constraints

- **jest baseline = 569 tests / 49 suites ผ่านหมด** (วัดจริง 2026-07-17 — ไม่ใช่ 557 ที่ memory จำไว้) ทุก task ต้องไม่ทำให้ตก
- **HEAD_TOL_MM = 75** import จาก `src/utils/constants.js` เสมอ ห้าม hardcode
- **ห้ามแตะหน้าตา/กล้อง/ป้าย/โมเดลของ `HeadCutter3D.jsx`** — แก้ได้เฉพาะบรรทัด 83 และ 87 (ตัด roll) เท่านั้น
- **ห้ามแก้ `gas-live/Code.js`** — ใช้ action `bulkUpdateSegmentHead` ที่มีอยู่
- **ห้าม commit ไฟล์ของ session อื่น** — working tree มี `src/components/views/RouteScheduleView.jsx` และ `src/ui-ux-pro-max/Sidebar.jsx` ค้างอยู่ **อย่า `git add -A`** ให้ `git add` ทีละไฟล์ตามที่ระบุใน task
- **สี:** `C_HEAD="#243B53"` `C_ART="#2F5D50"` `C_TAIL="#B08D4C"` `C_BREACH="#B23A34"` (มีอยู่แล้วหัวไฟล์ `HeadLevelView.jsx`)
- **root font-size = 14px** → Tailwind `text-xs` = 10.5px จริง ใช้ `text-[11px]` ตรงๆ เมื่อต้องคุมขนาด
- ภาษา UI = ไทย · commit message = ไทยได้

---

## File Structure

| ไฟล์ | รับผิดชอบ |
|---|---|
| `src/utils/headTrend.js` (**ใหม่**) | pure logic: หน้าต่างโฟกัส, Y domain, ช่วงเกินเกณฑ์, สถานะแถบ, สถานะริงล่าสุด |
| `src/utils/headTrend.test.js` (**ใหม่**) | TDD ครบทุก fn ใน headTrend |
| `src/components/views/HeadTrendContext.jsx` (**ใหม่**) | แถบสถานะ 635 ริง (SVG) + กรอบหน้าต่าง + คลิกเลื่อน |
| `src/components/views/HeadLevelView.jsx` (แก้) | ต่อ util + ปุ่มช่วง + ฝังแถบ + KPI/bullseye/VRT label |
| `src/utils/headPosture.js` (แก้) | ตัด roll ออก |
| `src/utils/headPosture.test.js` (แก้) | ลบ/แก้ test ที่ยืนยัน roll |
| `src/components/views/HeadCutter3D.jsx` (แก้ 2 บรรทัด) | เลิกใช้ rollDeg |
| scratchpad `import-head.mjs` (**ไม่ commit**) | สคริปต์นำเข้าข้อมูลครั้งเดียว |

---

## Task 1: นำเข้าข้อมูลที่ถูกต้อง (629 ริง) + verify round-trip

ทำก่อนงาน UI ทั้งหมด เพื่อให้ทุก task ถัดไป verify กับข้อมูลจริง

**Files:**
- Create: `<scratchpad>/import-head.mjs` (ไม่ commit เข้า repo)
- อ่าน: `D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\Ring_Typical_M7-R00510.csv`
- อ่าน: `D:\TEAM\โครงการก่อสร้างอุโมงค์ระบายน้ำคลองเปรมประชากร\งานอุโมงค์\APP Tunnel\TBM1_Ring321-699.csv`

**Interfaces:**
- Produces: ชีท `Segments` (TBM1) มี `headV/artV/tailV/vrt/headH/artH/tailH` ถูกต้อง 629 ริง — task อื่นไม่ต้อง import อะไรจาก task นี้

**ข้อเท็จจริงที่ยืนยันแล้ว (อย่า re-derive):**
- `app ring N ↔ guidance Segment Ring (N−1)` — d=1 ให้ 111/150 exact triple (d=0 ได้ 7, d=2 ได้ 31)
- คอลัมน์ guidance: `[853] Segment Ring` `[765]/[766]/[767] V Deviation (Head/Art/Tail)` `[762]/[763]/[764] H Deviation (Head/Art/Tail)` `[36] Articulation vertical angle` = VRT
- ช่วงทับ P321–P509 ให้ **CSV ใหม่ชนะ** guidance
- **ตัด H ของ P164 ทิ้ง** (−492/−425/−357 ขณะที่ V ปกติ = แถวเสีย)
- GAS `bulkUpdateSegmentHead` **skip ค่า `null`/`undefined`** → ล้างค่าต้องส่ง `""`
- GAS `idToRow` = **แถวท้ายชนะ** เมื่อ id ซ้ำ → เขียนได้เฉพาะแถวที่เป็น last-occurrence ของ id นั้น
- **id ปลอมพิมพ์มือ 7 ตัวถูกใช้ข้ามริง** (`seg_1a2b3c4d5e6f` = P37/P41/P71/P81 ฯลฯ) → **P41/P42/P44/P53/P59/P71 เขียนไม่ได้** (จะไปลงริงผิด) ต้อง **skip** → เขียนได้ 629/635 · ทั้ง 6 ริงตอนนี้ว่างอยู่ = ไม่มีค่าเพี้ยนตกค้าง

- [ ] **Step 1: เขียนสคริปต์นำเข้า**

สร้าง `<scratchpad>/import-head.mjs`:

```js
import fs from 'fs';
const GAS = "https://script.google.com/macros/s/AKfycbyRUl5BVmZYDhw_Z0Uo2LWBLmaQAaOjJZR4jLGw-MuxHIFcKEhu7FBF9tV33JAnKz1aTw/exec";
const GUID = 'D:/TEAM/Knowlegh/App/Tunnel Boring App - Copy/Ring_Typical_M7-R00510.csv';
const NEWC = 'D:/TEAM/โครงการก่อสร้างอุโมงค์ระบายน้ำคลองเปรมประชากร/งานอุโมงค์/APP Tunnel/TBM1_Ring321-699.csv';

// ---- 1. guidance: ring N-1 -> {V,H,vrt} ----
const raw = fs.readFileSync(GUID,'utf8').replace(/^﻿/,'').trim().split(/\r?\n/);
const H = raw[0].split(',').map(s=>s.trim());
const ix = n => { const i = H.indexOf(n); if (i < 0) throw new Error('ไม่พบคอลัมน์ ' + n); return i; };
const C = { ring:ix('[853] Segment Ring'), vH:ix('[765] V Deviation (Head)'), vA:ix('[766] V Deviation (Art)'),
  vT:ix('[767] V Deviation (Tail)'), hH:ix('[762] H Deviation (Head)'), hA:ix('[763] H Deviation (Art)'),
  hT:ix('[764] H Deviation (Tail)'), vrt:ix('[36] Articulation vertical angle') };
const g = new Map();
for (const line of raw.slice(1)) { const p = line.split(',');
  const r = +p[C.ring]; if (isNaN(r) || p[C.vH] === '' || isNaN(+p[C.vH])) continue;
  g.set(r, { headV:+p[C.vH], artV:+p[C.vA], tailV:+p[C.vT],
             headH:+p[C.hH], artH:+p[C.hA], tailH:+p[C.hT], vrt:+p[C.vrt] }); }

// ---- 2. CSV ใหม่: ring -> {V,vrt} ----
const nc = new Map();
for (const line of fs.readFileSync(NEWC,'utf8').trim().split(/\r?\n/).slice(1)) {
  const p = line.split(',');
  nc.set(+p[1], { tailV:+p[2], artV:+p[3], headV:+p[4], vrt:+p[6] }); }

// ---- 3. merge: CSV ชนะเมื่อทับ · H มาจาก guidance เสมอ ----
const want = new Map(); // appRing -> fields
for (const [gr, v] of g) { const n = gr + 1; if (n < 2) continue; want.set(n, { ...v }); }
for (const [n, v] of nc) { const prev = want.get(n) || {};
  want.set(n, { headV:v.headV, artV:v.artV, tailV:v.tailV, vrt:v.vrt,
                headH:prev.headH ?? null, artH:prev.artH ?? null, tailH:prev.tailH ?? null }); }
const p164 = want.get(164); if (p164) { p164.headH = null; p164.artH = null; p164.tailH = null; } // แถว H เสีย
console.log('want rings:', want.size);

// ---- 4. ดึงชีทสด เพื่อเอา id + หาแถวที่เขียนถึงได้ ----
const live = await (await fetch(GAS + '?action=getData&machine=TBM1')).json();
const segs = live.segments;
const rn = s => { const m = String(s.ringNo).match(/\d+/); return m ? +m[0] : null; };
const isP = s => /^P\d/i.test(String(s.ringNo));
const lastIdx = new Map(); segs.forEach((s,i) => lastIdx.set(String(s.id), i));
const reachable = segs.filter((s,i) => lastIdx.get(String(s.id)) === i); // GAS เขียนถึงเฉพาะแถวนี้

// ริงที่ id ชนข้ามริง -> แถวที่เขียนถึงได้เป็นของริงอื่น -> ห้ามเขียน
const reachRing = new Map(); // ring -> [rows]
reachable.filter(isP).forEach(s => { const n = rn(s); if (!reachRing.has(n)) reachRing.set(n, []); reachRing.get(n).push(s); });

const BLANK = { headV:'', artV:'', tailV:'', vrt:'', headH:'', artH:'', tailH:'' };
const num = v => (v == null || isNaN(v)) ? '' : v;
const rows = [], skipped = [];
for (const s of reachable) {
  const n = isP(s) ? rn(s) : null;
  const w = n != null ? want.get(n) : null;
  const canonical = n != null && reachRing.get(n) && reachRing.get(n)[0].id === s.id;
  if (w && canonical) rows.push({ id: s.id, headV:num(w.headV), artV:num(w.artV), tailV:num(w.tailV),
      vrt:num(w.vrt), headH:num(w.headH), artH:num(w.artH), tailH:num(w.tailH) });
  else rows.push({ id: s.id, ...BLANK }); // ล้างค่าเพี้ยนเดิมทุกแถวที่ไม่ใช่เป้าหมาย
}
for (const n of want.keys()) if (!reachRing.has(n)) skipped.push(n);
console.log('payload rows:', rows.length, '| เขียนค่าจริง:', rows.filter(r => r.headV !== '').length);
console.log('SKIP (id ชนข้ามริง เขียนไม่ได้):', skipped.length, skipped);

// ---- 5. POST เป็น batch ----
for (let i = 0; i < rows.length; i += 200) {
  const chunk = rows.slice(i, i + 200);
  const res = await fetch(GAS, { method:'POST', redirect:'follow',
    headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body: JSON.stringify({ action:'bulkUpdateSegmentHead', data:{ machine:'TBM1', rows: chunk } }) });
  console.log(' batch', i, '->', (await res.text()).slice(0, 120));
}
fs.writeFileSync('want.json', JSON.stringify([...want]));
console.log('เขียนเสร็จ — ไป step 3 เพื่อ verify');
```

- [ ] **Step 2: รันสคริปต์**

```bash
cd <scratchpad> && node import-head.mjs
```

Expected: `want rings: 635` · `เขียนค่าจริง: 629` · `SKIP ... 6 [41,42,44,53,59,71]` · ทุก batch ตอบ `{"status":"success","updated":...}`

> คำเตือน: `curl`/fetch POST อาจคืน 411 จาก redirect แต่เขียนเข้าจริง — **ห้ามสรุปจาก response** ให้ยึดผล verify ใน step 3 เท่านั้น

- [ ] **Step 3: verify round-trip — ดึงสดกลับมาเทียบทุกค่า**

สร้าง `<scratchpad>/verify-head.mjs`:

```js
import fs from 'fs';
const GAS = "https://script.google.com/macros/s/AKfycbyRUl5BVmZYDhw_Z0Uo2LWBLmaQAaOjJZR4jLGw-MuxHIFcKEhu7FBF9tV33JAnKz1aTw/exec";
const want = new Map(JSON.parse(fs.readFileSync('want.json','utf8')));
const live = await (await fetch(GAS + '?action=getData&machine=TBM1')).json();
const rn = s => { const m = String(s.ringNo).match(/\d+/); return m ? +m[0] : null; };
const has = s => [s.headV,s.artV,s.tailV].some(v => v !== '' && v != null);
const got = new Map();
live.segments.filter(s => /^P\d/i.test(String(s.ringNo)) && has(s)).forEach(s => got.set(rn(s), s));
console.log('ริงที่มีข้อมูลในชีทตอนนี้:', got.size);
let ok = 0, bad = [], missing = [];
for (const [n, w] of want) { const s = got.get(n);
  if (!s) { missing.push(n); continue; }
  const eq = (a, b) => (a == null || isNaN(a)) ? (s[b] === '' || s[b] == null) : Math.abs(+s[b] - a) < 0.005;
  if (eq(w.headV,'headV') && eq(w.artV,'artV') && eq(w.tailV,'tailV') && eq(w.vrt,'vrt')) ok++;
  else bad.push({ ring:n, want:`${w.headV}/${w.artV}/${w.tailV} vrt ${w.vrt}`, got:`${s.headV}/${s.artV}/${s.tailV} vrt ${s.vrt}` }); }
console.log('ตรงเป๊ะ:', ok, '| ไม่ตรง:', bad.length, '| ไม่พบในชีท:', missing.length, missing);
bad.slice(0,10).forEach(b => console.log('  P'+b.ring, 'want', b.want, '| got', b.got));
// ต้องไม่มีริงที่มีข้อมูลแต่เราไม่ได้ตั้งใจให้มี
const extra = [...got.keys()].filter(n => !want.has(n));
console.log('ริงที่มีข้อมูลค้างทั้งที่ไม่ควรมี:', extra.length, extra.slice(0,20));
console.log(bad.length === 0 && extra.length === 0 ? '\n✅ PASS' : '\n❌ FAIL');
```

Run: `node verify-head.mjs`
Expected: `ตรงเป๊ะ: 629` · `ไม่พบในชีท: 6 [41,42,44,53,59,71]` · `ริงที่มีข้อมูลค้างทั้งที่ไม่ควรมี: 0` · `✅ PASS`

**ถ้า FAIL: หยุด อย่าไป task ถัดไป** — วิเคราะห์ก่อน ห้ามเขียนทับซ้ำมั่ว

- [ ] **Step 4: ไม่ต้อง commit** (ไม่มีไฟล์ใน repo เปลี่ยน — สคริปต์อยู่ scratchpad)

---

## Task 2: `headTrend.js` — pure logic + TDD

**Files:**
- Create: `src/utils/headTrend.js`
- Test: `src/utils/headTrend.test.js`

**Interfaces:**
- Consumes: `HEAD_TOL_MM` จาก `./constants`
- Produces (task 3+4 ใช้):
  - `RANGE_OPTIONS: {value:number,label:string}[]` — `[{value:50,label:'50 ริง'},{value:150,label:'150 ริง'},{value:0,label:'ทั้งหมด'}]` (0 = ทั้งหมด)
  - `focusWindow(series, size, endRing=null) → series[]`
  - `niceDomain(series, tol) → [lo:number, hi:number]`
  - `breachSpans(series, tol) → {from:number,to:number}[]`
  - `ribbonStatus(series, tol) → {ringN:number, status:'ok'|'near'|'over', mag:number}[]`
  - `latestStatus(series, tol) → {ringN, status, mag} | null`
- รูปร่าง `series` ที่ทุก fn รับ = `{ringN:number, headV:number|null, artV:number|null, tailV:number|null}[]` (มาจาก `chartData` ใน HeadLevelView)

- [ ] **Step 1: เขียน test ที่ต้องแดงก่อน**

สร้าง `src/utils/headTrend.test.js`:

```js
import { focusWindow, niceDomain, breachSpans, ribbonStatus, latestStatus, RANGE_OPTIONS } from "./headTrend";

const mk = (ringN, headV, artV = headV, tailV = headV) => ({ ringN, headV, artV, tailV });
const seq = (from, to, v = 10) => Array.from({ length: to - from + 1 }, (_, i) => mk(from + i, v));

describe("RANGE_OPTIONS", () => {
  test("3 ตัวเลือก และ 0 = ทั้งหมด", () => {
    expect(RANGE_OPTIONS.map(o => o.value)).toEqual([50, 150, 0]);
  });
});

describe("focusWindow", () => {
  test("size 0 → คืนทั้งหมด เรียงตามเลขริง", () => {
    const s = [mk(5, 1), mk(1, 2), mk(3, 3)];
    expect(focusWindow(s, 0).map(x => x.ringN)).toEqual([1, 3, 5]);
  });
  test("size น้อยกว่าจำนวนข้อมูล → เอา N ตัวท้าย", () => {
    expect(focusWindow(seq(1, 10), 3).map(x => x.ringN)).toEqual([8, 9, 10]);
  });
  test("size มากกว่าจำนวนข้อมูล → คืนทั้งหมด ไม่ throw", () => {
    expect(focusWindow(seq(1, 3), 50)).toHaveLength(3);
  });
  test("endRing → หน้าต่างจบที่ริงนั้น (ใช้ตอนคลิกแถบภาพรวม)", () => {
    expect(focusWindow(seq(1, 100), 5, 50).map(x => x.ringN)).toEqual([46, 47, 48, 49, 50]);
  });
  test("endRing ที่ต้นเส้น → ไม่หลุดขอบ คืนหน้าต่างแรกเต็ม size", () => {
    expect(focusWindow(seq(1, 100), 10, 3).map(x => x.ringN)).toEqual([1,2,3,4,5,6,7,8,9,10]);
  });
  test("endRing ที่ไม่มีจริง → เลือกริงถัดไปที่มี", () => {
    const s = [mk(1,0), mk(5,0), mk(9,0)];
    expect(focusWindow(s, 2, 4).map(x => x.ringN)).toEqual([1, 5]);
  });
  test("series ว่าง → []", () => {
    expect(focusWindow([], 50)).toEqual([]);
  });
});

describe("niceDomain", () => {
  test("ข้อมูลอยู่ในเกณฑ์ → อย่างน้อย ±100 (แถบ ±75 ไม่ชิดขอบ)", () => {
    expect(niceDomain(seq(1, 5, 30), 75)).toEqual([-100, 100]);
  });
  test("ข้อมูลจริง 150 ริงล่าสุด (−40…+79) → [-100, 100]", () => {
    expect(niceDomain([mk(1, -40), mk(2, 79)], 75)).toEqual([-100, 100]);
  });
  test("excursion −587 → ขยายลงเป็นเลขกลมขั้น 25", () => {
    expect(niceDomain([mk(1, -587), mk(2, 79)], 75)).toEqual([-600, 100]);
  });
  test("ค่าบวกจัด → ขยายขึ้นเป็นเลขกลม", () => {
    expect(niceDomain([mk(1, 260)], 75)).toEqual([-100, 275]);
  });
  test("ดูทุก metric ไม่ใช่แค่ headV", () => {
    expect(niceDomain([{ ringN: 1, headV: 10, artV: 10, tailV: -300 }], 75)).toEqual([-300, 100]);
  });
  test("ข้าม null/NaN ไม่พัง", () => {
    expect(niceDomain([{ ringN: 1, headV: null, artV: NaN, tailV: 20 }], 75)).toEqual([-100, 100]);
  });
  test("series ว่าง → ±100", () => {
    expect(niceDomain([], 75)).toEqual([-100, 100]);
  });
});

describe("breachSpans", () => {
  test("ช่วงติดกันยุบเป็นช่วงเดียว", () => {
    const s = [mk(1, 10), mk(2, 90), mk(3, 95), mk(4, 10)];
    expect(breachSpans(s, 75)).toEqual([{ from: 2, to: 3 }]);
  });
  test("เกินด้านลบก็นับ", () => {
    expect(breachSpans([mk(1, -90)], 75)).toEqual([{ from: 1, to: 1 }]);
  });
  test("หลายช่วงแยกกัน", () => {
    const s = [mk(1, 90), mk(2, 10), mk(3, 90)];
    expect(breachSpans(s, 75)).toEqual([{ from: 1, to: 1 }, { from: 3, to: 3 }]);
  });
  test("ช่วงที่ยังเปิดอยู่ตอนจบ series ต้องถูกปิด", () => {
    expect(breachSpans([mk(1, 10), mk(2, 90)], 75)).toEqual([{ from: 2, to: 2 }]);
  });
  test("metric ใดเกินก็นับ (artV เกินตัวเดียว)", () => {
    expect(breachSpans([{ ringN: 1, headV: 0, artV: 90, tailV: 0 }], 75)).toEqual([{ from: 1, to: 1 }]);
  });
  test("ที่ tolerance พอดี = ยังไม่เกิน", () => {
    expect(breachSpans([mk(1, 75)], 75)).toEqual([]);
  });
  test("ไม่มีเกินเลย → []", () => {
    expect(breachSpans(seq(1, 5, 10), 75)).toEqual([]);
  });
});

describe("ribbonStatus", () => {
  test("จัดชั้น ok / near / over ตาม |ค่า| สูงสุดของริง", () => {
    const s = [mk(1, 10), mk(2, 60), mk(3, 90)];
    expect(ribbonStatus(s, 75).map(x => x.status)).toEqual(["ok", "near", "over"]);
  });
  test("near = เกิน 0.66×tol (49.5) แต่ไม่เกิน tol", () => {
    expect(ribbonStatus([mk(1, 50)], 75)[0].status).toBe("near");
    expect(ribbonStatus([mk(1, 49)], 75)[0].status).toBe("ok");
  });
  test("mag = |ค่า| สูงสุดของริงนั้น ใช้คุมความเข้มสี", () => {
    expect(ribbonStatus([{ ringN: 1, headV: -300, artV: 10, tailV: 5 }], 75)[0].mag).toBe(300);
  });
  test("ริงที่ไม่มีค่าเลย → ข้ามไป ไม่ใช่ ok", () => {
    expect(ribbonStatus([{ ringN: 1, headV: null, artV: null, tailV: null }], 75)).toEqual([]);
  });
  test("เรียงตามเลขริง", () => {
    expect(ribbonStatus([mk(3, 1), mk(1, 1)], 75).map(x => x.ringN)).toEqual([1, 3]);
  });
});

describe("latestStatus", () => {
  test("เอาริงเลขมากสุด ไม่ใช่ตัวท้าย array", () => {
    expect(latestStatus([mk(9, 10), mk(2, 90)], 75).ringN).toBe(9);
  });
  test("ริงล่าสุดอยู่ในเกณฑ์ → ok (แม้ประวัติเคยหลุด)", () => {
    expect(latestStatus([mk(1, 500), mk(2, 30)], 75).status).toBe("ok");
  });
  test("ริงล่าสุดเกิน → over พร้อม mag", () => {
    expect(latestStatus([mk(1, 90)], 75)).toEqual({ ringN: 1, status: "over", mag: 90 });
  });
  test("ไม่มีข้อมูล → null", () => {
    expect(latestStatus([], 75)).toBeNull();
  });
});
```

- [ ] **Step 2: รัน test ให้เห็นว่าแดง**

```bash
cd "D:/TEAM/Knowlegh/App/Tunnel Boring App - Copy/TunnelBoringMonitoring" && npx cross-env CI=true npx react-scripts test --watchAll=false -t "headTrend" 2>&1 | tail -8
```

Expected: FAIL — `Cannot find module './headTrend'`

- [ ] **Step 3: เขียน implementation**

สร้าง `src/utils/headTrend.js`:

```js
// pure logic ของกราฟแนวโน้มระดับหัวเจาะ — ไม่ import React/recharts (jest-safe)
// series ที่รับ = {ringN, headV, artV, tailV}[] จาก chartData ใน HeadLevelView

export const RANGE_OPTIONS = [
  { value: 50, label: "50 ริง" },
  { value: 150, label: "150 ริง" },
  { value: 0, label: "ทั้งหมด" },
];

const STEP = 25;        // ขั้นเลขกลมของแกน Y
const MIN_HALF = 100;   // ครึ่งแกนขั้นต่ำ — ให้แถบ ±75 ไม่ชิดขอบและอยู่ที่เดิมทุกช่วง
const NEAR_RATIO = 0.66; // เกินเท่านี้ของ tolerance = "ใกล้ขอบ"

const vals = (d) => [d.headV, d.artV, d.tailV].filter((v) => v != null && !isNaN(v));
const maxAbs = (d) => { const v = vals(d); return v.length ? Math.max(...v.map(Math.abs)) : null; };
const byRing = (s) => [...s].sort((a, b) => a.ringN - b.ringN);

// N ริงท้าย (size<=0 = ทั้งหมด) · endRing != null → ให้หน้าต่างจบที่ริงนั้น
export function focusWindow(series, size, endRing = null) {
  const s = byRing(series);
  if (!size || size <= 0 || size >= s.length) return s;
  let end = s.length;
  if (endRing != null) {
    const i = s.findIndex((d) => d.ringN >= endRing);
    if (i >= 0) end = Math.min(s.length, Math.max(size, i + 1));
  }
  return s.slice(end - size, end);
}

// [lo, hi] เลขกลมขั้น 25 · ครอบ ±tol+25 เสมอ (อย่างน้อย ±MIN_HALF)
export function niceDomain(series, tol) {
  const all = series.flatMap(vals);
  const lo = Math.min(-MIN_HALF, -(tol + STEP), ...all);
  const hi = Math.max(MIN_HALF, tol + STEP, ...all);
  return [Math.floor(lo / STEP) * STEP, Math.ceil(hi / STEP) * STEP];
}

// ช่วงริงที่เกิน tolerance ติดกัน → วาดเป็นพื้นหลังแดงแทนจุดรายริง
export function breachSpans(series, tol) {
  const out = [];
  let cur = null;
  for (const d of byRing(series)) {
    const m = maxAbs(d);
    if (m != null && m > tol) {
      if (!cur) cur = { from: d.ringN, to: d.ringN };
      else cur.to = d.ringN;
    } else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

const classify = (m, tol) => (m > tol ? "over" : m > tol * NEAR_RATIO ? "near" : "ok");

// สถานะรายริงสำหรับแถบภาพรวม — ริงที่ไม่มีค่าเลยถูกข้าม (ไม่ใช่ ok)
export function ribbonStatus(series, tol) {
  return byRing(series).reduce((acc, d) => {
    const m = maxAbs(d);
    if (m != null) acc.push({ ringN: d.ringN, status: classify(m, tol), mag: m });
    return acc;
  }, []);
}

// สถานะของริงเลขมากสุด — ตอบ "ตอนนี้เป็นไง" ไม่ใช่ "เคยเป็นไง"
export function latestStatus(series, tol) {
  const s = ribbonStatus(series, tol);
  return s.length ? s[s.length - 1] : null;
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
npx cross-env CI=true npx react-scripts test --watchAll=false -t "headTrend" 2>&1 | tail -8
```

Expected: PASS ทั้งหมด **31 tests** (RANGE_OPTIONS 1 · focusWindow 7 · niceDomain 7 · breachSpans 7 · ribbonStatus 5 · latestStatus 4)

- [ ] **Step 5: รัน suite เต็มกันพัง**

```bash
npx cross-env CI=true npx react-scripts test --watchAll=false 2>&1 | tail -5
```

Expected: `Tests: 600 passed, 600 total` (569 + 31) · `Test Suites: 50 passed`

- [ ] **Step 6: Commit**

```bash
git add src/utils/headTrend.js src/utils/headTrend.test.js
git commit -m "feat(head-level): headTrend util — หน้าต่างโฟกัส/domain เลขกลม/ช่วงเกินเกณฑ์/สถานะ"
```

---

## Task 3: `HeadTrendContext.jsx` — แถบสถานะภาพรวม

**Files:**
- Create: `src/components/views/HeadTrendContext.jsx`

**Interfaces:**
- Consumes: `ribbonStatus()` จาก `../../utils/headTrend`
- Produces (task 4 ใช้):
  ```jsx
  <HeadTrendContext
    series={chartData}      // {ringN,headV,artV,tailV}[] ทั้งหมด
    tol={HEAD_TOL_MM}
    windowFrom={number}     // ริงแรกของหน้าต่างที่กราฟบนแสดง
    windowTo={number}       // ริงสุดท้ายของหน้าต่าง
    onPick={(ringN) => {}}  // คลิกแถบ → ริงที่คลิก (ให้ parent ตั้ง endRing)
  />
  ```

**หมายเหตุ:** ใช้ SVG ตรง ไม่ผ่าน recharts — 635 แท่งใน 48px recharts overkill และคุม hit-area เองง่ายกว่า

- [ ] **Step 1: เขียน component**

สร้าง `src/components/views/HeadTrendContext.jsx`:

```jsx
import React, { useMemo } from "react";
import { ribbonStatus } from "../../utils/headTrend";

const COLOR = { ok: "#4E7D6B", near: "#D9A441", over: "#B23A34" };
const W = 1000, H = 34, BAR_TOP = 0;

// ความเข้ม: เกินเกณฑ์ยิ่งลึกยิ่งเข้ม (ให้แถบบอกได้คร่าวๆ ว่าหลุดแรงแค่ไหน ไม่ใช่แค่หลุด/ไม่หลุด)
const opacityFor = (s) => (s.status === "over" ? Math.min(1, 0.45 + s.mag / 700) : 0.85);

export default function HeadTrendContext({ series = [], tol, windowFrom, windowTo, onPick }) {
  const bars = useMemo(() => ribbonStatus(series, tol), [series, tol]);
  if (!bars.length) return null;

  const bw = W / bars.length;
  const idxFrom = bars.findIndex((b) => b.ringN >= windowFrom);
  const idxTo = bars.findIndex((b) => b.ringN >= windowTo);
  const x0 = (idxFrom < 0 ? 0 : idxFrom) * bw;
  const x1 = ((idxTo < 0 ? bars.length - 1 : idxTo) + 1) * bw;

  const pick = (e) => {
    if (!onPick) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - r.left) / r.width) * bars.length);
    const b = bars[Math.max(0, Math.min(bars.length - 1, i))];
    if (b) onPick(b.ringN);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 flex-wrap mt-3 pt-3 border-t border-dashed border-line">
        <p className="text-[11px] text-ink-3 font-semibold">
          ภาพรวมทั้งเส้นทาง P{bars[0].ringN}–P{bars[bars.length - 1].ringN} ({bars.length} ริง) — คลิกเพื่อเลื่อนช่วงที่ดู
        </p>
        <div className="flex gap-3 text-[10.5px] font-semibold text-ink-3">
          {[["ok", "ในเกณฑ์"], ["near", "ใกล้ขอบ"], ["over", `เกิน ±${tol}`]].map(([k, l]) => (
            <span key={k} className="flex items-center gap-1.5">
              <i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: COLOR[k] }} />{l}
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none"
        onClick={pick} style={{ display: "block", cursor: "pointer" }} role="presentation">
        {bars.map((b, i) => (
          <rect key={b.ringN} x={i * bw} y={BAR_TOP} width={Math.max(0.7, bw + 0.3)} height={H}
            fill={COLOR[b.status]} opacity={opacityFor(b)} />
        ))}
        <rect x={x0} y={0.8} width={Math.max(3, x1 - x0)} height={H - 1.6}
          fill="none" stroke="#243B53" strokeWidth={2} rx={2} />
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: ตรวจว่า compile ผ่านและ suite ไม่พัง**

```bash
npx cross-env CI=true npx react-scripts test --watchAll=false 2>&1 | tail -5
```

Expected: `Tests: 600 passed` (component นี้ไม่มี test — logic อยู่ใน headTrend ที่ test แล้ว ตาม pattern เดิมของโปรเจกต์ที่ไม่มี @testing-library)

- [ ] **Step 3: Commit**

```bash
git add src/components/views/HeadTrendContext.jsx
git commit -m "feat(head-level): แถบสถานะภาพรวมทั้งเส้นทาง (คลิกเลื่อนช่วงได้)"
```

---

## Task 4: ต่อ `HeadLevelView.jsx` — โฟกัส + แถบ + KPI + ป้าย

**Files:**
- Modify: `src/components/views/HeadLevelView.jsx`

**Interfaces:**
- Consumes: `focusWindow/niceDomain/breachSpans/latestStatus/RANGE_OPTIONS` จาก `../../utils/headTrend` · `HeadTrendContext` จาก `./HeadTrendContext`

- [ ] **Step 1: เพิ่ม import + state**

แก้บรรทัด 1–26 — เพิ่ม import และ state 2 ตัว:

```jsx
import React, { useMemo, useState } from "react";
import { ArrowUpDown, Printer, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip, ReferenceArea, ReferenceLine,
} from "recharts";
import { chartColors, axisTick, tooltipStyle } from "../../ui-ux-pro-max/chartTheme";
import { HEAD_TOL_MM } from "../../utils/constants";
import { DESIGN_LINE } from "../../utils/profileGeo";
import { deviationSeries, latestRingState, toleranceBreaches, parseRingNo } from "../../utils/profileSection";
import { focusWindow, niceDomain, breachSpans, latestStatus, RANGE_OPTIONS } from "../../utils/headTrend";
import SectionHeader from "../common/SectionHeader";
import StatCard from "../common/StatCard";
import { fitAndPrint } from "../../utils/printFit";
import HeadCutter3D from "./HeadCutter3D";
import HeadTrendContext from "./HeadTrendContext";
```

> ลบ `LabelList` ออกจาก import recharts (ไม่ได้ใช้อยู่แล้ว) — เก็บ `Cell` ไว้ (กราฟ VRT ใช้)

ใน component เพิ่ม state ใต้ `const [printing, setPrinting] = useState(false);`:

```jsx
  const [winSize, setWinSize] = useState(150);   // ค่าเริ่มต้น = 150 ริงล่าสุด
  const [winEnd, setWinEnd] = useState(null);    // null = เกาะริงล่าสุดเสมอ · เลข = ตำแหน่งที่คลิกบนแถบภาพรวม
```

- [ ] **Step 2: คำนวณหน้าต่างโฟกัส แทน yDomain เดิม**

แทนที่ block `yDomain` (บรรทัด 38–45 เดิม) ด้วย:

```jsx
  const view = useMemo(() => focusWindow(chartData, winSize, winEnd), [chartData, winSize, winEnd]);
  const yDomain = useMemo(() => niceDomain(view, HEAD_TOL_MM), [view]);
  const spans = useMemo(() => breachSpans(view, HEAD_TOL_MM), [view]);
  const status = useMemo(() => latestStatus(chartData, HEAD_TOL_MM), [chartData]);
  const winFrom = view.length ? view[0].ringN : 0;
  const winTo = view.length ? view[view.length - 1].ringN : 0;
```

> `status` คิดจาก `chartData` ทั้งหมด **ไม่ใช่ `view`** — การ์ด KPI ต้องตอบสถานะริงล่าสุดจริงเสมอ ไม่ว่ากำลังดูช่วงไหนอยู่

`breachSet` เดิมไม่ใช้แล้ว (จุดแดงรายริง → พื้นหลังช่วง) — **ลบ block `breachSet`** (บรรทัด 37 เดิม)

- [ ] **Step 3: เปลี่ยนการ์ด KPI ใบที่ 4 เป็นสถานะริงล่าสุด**

แทน `StatCard` ใบสุดท้าย (บรรทัด 84 เดิม) ด้วย:

```jsx
              <StatCard
                label="สถานะริงล่าสุด"
                value={status == null ? "—" : status.status === "over" ? "เกินเกณฑ์" : "อยู่ในเกณฑ์"}
                subtext={breaches.length ? `เคยหลุด ${spansAll.length} ช่วง · ${breaches.length} ริง` : "ไม่เคยหลุดเกณฑ์"}
                color={status && status.status === "over" ? "text-code-d" : "text-sgreen-dark"}
                valueColor={status && status.status === "over" ? "text-code-d" : "text-sgreen-dark"}
                icon={status && status.status === "over" ? AlertTriangle : CheckCircle2}
              />
```

เพิ่ม memo `spansAll` ไว้ข้าง `status`:

```jsx
  const spansAll = useMemo(() => breachSpans(chartData, HEAD_TOL_MM), [chartData]);
```

- [ ] **Step 4: ใส่ปุ่มเลือกช่วง + แก้กราฟหลักเป็นแกน X ตัวเลข + พื้นหลังช่วงเกินเกณฑ์**

แทน block กราฟ trend ทั้งก้อน (บรรทัด 148–176 เดิม `<div className="bg-surface rounded-card ...">` ถึง `</div>` ที่ปิดการ์ด) ด้วย:

```jsx
            <div className="bg-surface rounded-card shadow-card border border-line p-5 sm:p-6">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h3 className="font-semibold text-ink text-base">
                  แนวโน้มค่าเบี่ยง Head / Art / Tail
                  {view.length > 0 && <span className="ml-2 text-[11px] font-bold text-ink-3">P{winFrom}–P{winTo}</span>}
                </h3>
                <div className="flex gap-4 text-xs font-semibold">
                  <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-[3px] rounded" style={{ background: C_HEAD }} /> Head</span>
                  <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-[3px] rounded" style={{ background: C_ART }} /> Art</span>
                  <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-[3px] rounded" style={{ background: C_TAIL }} /> Tail</span>
                </div>
              </div>
              <p className="text-[11px] text-ink-3 font-semibold mb-3">
                แกน X = เลขริง · แถบเขียว = ช่วงยอมรับ ±{HEAD_TOL_MM} mm · พื้นแดง = ช่วงที่เกินเกณฑ์
              </p>
              <div className="flex gap-1.5 mb-3 print:hidden">
                {RANGE_OPTIONS.map((o) => (
                  <button key={o.value}
                    onClick={() => { setWinSize(o.value); setWinEnd(null); }}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-input border transition-colors ${
                      winSize === o.value ? "bg-navy text-white border-navy" : "bg-surface text-ink-3 border-line hover:bg-cyan-tint"
                    }`}>{o.label}</button>
                ))}
                {winEnd != null && (
                  <button onClick={() => setWinEnd(null)}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-input border border-line text-ink-3 bg-surface hover:bg-cyan-tint">
                    ← กลับไปริงล่าสุด
                  </button>
                )}
              </div>
              <div className="w-full" style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={view} margin={{ top: 12, right: 24, left: -6, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                    <XAxis dataKey="ringN" type="number" domain={["dataMin", "dataMax"]} allowDecimals={false}
                      tick={axisTick} axisLine={false} tickLine={false} minTickGap={28}
                      tickFormatter={(v) => `P${v}`}
                      label={{ value: "Ring No.", position: "insideBottomRight", offset: -4, style: { fontSize: 12, fill: chartColors.axisLabel, fontWeight: "bold" } }} />
                    <YAxis domain={yDomain} tick={axisTick} axisLine={false} tickLine={false}
                      label={{ value: "ค่าเบี่ยง (mm)", angle: -90, position: "insideLeft", offset: 16, style: { fontSize: 12, fill: chartColors.axisLabel, fontWeight: "bold" } }} />
                    <Tooltip {...tooltipStyle} labelFormatter={(v) => `Ring P${v}`} />
                    {spans.map((s, i) => (
                      <ReferenceArea key={i} x1={s.from} x2={s.to} fill={C_BREACH} fillOpacity={0.10} />
                    ))}
                    <ReferenceArea y1={-HEAD_TOL_MM} y2={HEAD_TOL_MM} fill="#2F5D50" fillOpacity={0.08} />
                    <ReferenceLine y={HEAD_TOL_MM} stroke="#2F5D50" strokeDasharray="5 5" label={{ position: "insideTopRight", value: `+${HEAD_TOL_MM}`, fill: "#2F5D50", fontSize: 11, fontWeight: "bold" }} />
                    <ReferenceLine y={-HEAD_TOL_MM} stroke="#2F5D50" strokeDasharray="5 5" label={{ position: "insideBottomRight", value: `−${HEAD_TOL_MM}`, fill: "#2F5D50", fontSize: 11, fontWeight: "bold" }} />
                    <ReferenceLine y={0} stroke="#B9C2CC" strokeWidth={1} />
                    <Line type="monotone" dataKey="tailV" stroke={C_TAIL} strokeWidth={1.8} dot={false} connectNulls name="Tail" isAnimationActive={!printing} />
                    <Line type="monotone" dataKey="artV" stroke={C_ART} strokeWidth={1.8} dot={false} connectNulls name="Art" isAnimationActive={!printing} />
                    <Line type="monotone" dataKey="headV" stroke={C_HEAD} strokeWidth={2.6} dot={false} connectNulls name="Head" isAnimationActive={!printing} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <HeadTrendContext series={chartData} tol={HEAD_TOL_MM}
                windowFrom={winFrom} windowTo={winTo}
                onPick={(r) => setWinEnd(r)} />
            </div>
```

> เส้น 0 เปลี่ยนจากแดง (`C_BREACH`) เป็นเทา `#B9C2CC` — สีแดงตอนนี้สงวนไว้สื่อ "เกินเกณฑ์" อย่างเดียว เส้นแนวออกแบบไม่ใช่ของเสีย

- [ ] **Step 5: แก้ป้าย VRT + ล็อกแกน**

แทน block VRT (บรรทัด 179–198 เดิม) — เปลี่ยน 2 บรรทัดป้าย และเพิ่ม `domain`:

```jsx
                <h3 className="font-semibold text-ink text-base mb-1">VRT (°) ต่อริง</h3>
                <p className="text-[11px] text-ink-3 font-semibold mb-3">
                  มุมงอข้อต่อ articulation แนวดิ่ง — ค่าบวก = บังคับหัวขึ้น · ยิ่งมาก = ยิ่งดัดกลับแรง · แดง = |VRT| ≥ 0.3°
                </p>
```

และใน `<YAxis>` ของ BarChart เพิ่ม domain:

```jsx
                      <YAxis domain={[-0.6, 0.6]} tick={axisTick} axisLine={false} tickLine={false} />
```

- [ ] **Step 6: แก้ป้าย bullseye ให้บอกว่าไม่มีค่าแนวราบ**

ใน block bullseye — แทนบรรทัด `<p className="text-xs text-ink-3 font-semibold mb-3">` (บรรทัด 92 เดิม) ด้วย:

```jsx
              <p className="text-[11px] text-ink-3 font-semibold mb-3">
                ตำแหน่ง Head / Art / Tail เทียบแนวออกแบบ (สูง-ต่ำ × ซ้าย-ขวา) · วง = ±{HEAD_TOL_MM} mm · ริง {latest ? latest.ringNo : ""}
                {latest && latest.headH == null && (
                  <span className="block text-code-d mt-0.5">ริงนี้ไม่มีข้อมูลแนวราบ — จุดจึงตกบนแกนตั้ง (ค่าแนวราบมีถึง P509)</span>
                )}
              </p>
```

- [ ] **Step 7: รัน suite + build**

```bash
npx cross-env CI=true npx react-scripts test --watchAll=false 2>&1 | tail -5
npx cross-env CI=true npx react-scripts build 2>&1 | tail -6
```

Expected: `Tests: 600 passed` · build `Compiled successfully.` (ไม่มีคำเตือน eslint จากไฟล์ที่แก้)

- [ ] **Step 8: Commit**

```bash
git add src/components/views/HeadLevelView.jsx
git commit -m "feat(head-level): กราฟโฟกัส 150 ริงล่าสุด + แถบภาพรวม + KPI สถานะริงล่าสุด + แก้ป้าย VRT"
```

---

## Task 5: ตัด roll ออกจาก headPosture

**Files:**
- Modify: `src/utils/headPosture.js:13-14,26,29`
- Modify: `src/utils/headPosture.test.js:1,5,42-55`
- Modify: `src/components/views/HeadCutter3D.jsx:83,87`

**Interfaces:**
- Produces: `headPostureAngles(posture) → {pitchDeg:number, yawDeg:number}` (ไม่มี `rollDeg` อีก) · ไม่ export `ROLL_GAIN`/`ROLL_MAX` แล้ว

**เหตุผล:** VRT = `[36] Articulation vertical angle` = มุมงอข้อต่อบังคับเลี้ยว ไม่ใช่ roll (corr กับค่าเบี่ยง −0.862 · ตอนดึงกลับสูงกว่าตอนวิ่งนิ่ง 25 เท่า · ไฟล์มีคอลัมน์ Rolling จริง 5 ตัวแต่ไม่มีตัวไหนตรง) — เราไม่มีข้อมูล roll จริง จึงไม่ควรอ้างว่ารู้

- [ ] **Step 1: แก้ test ก่อน (ต้องแดง)**

`src/utils/headPosture.test.js` — แก้บรรทัด 1:

```js
import { headPostureAngles, pitchLabel, PITCH_MAX, PITCH_REF_MM } from "./headPosture";
```

แก้บรรทัด 5:

```js
    expect(headPostureAngles(null)).toEqual({ pitchDeg: 0, yawDeg: 0 });
```

แทน describe block บรรทัด 42–55 ทั้งก้อนด้วย:

```js
describe("headPostureAngles — yaw + ไม่มี roll แล้ว", () => {
  test("yaw จาก headH-tailH", () => {
    expect(headPostureAngles({ headH: 40, tailH: 0 }).yawDeg).toBeCloseTo(4, 5);
  });
  test("metric ขาด → แกนนั้นเป็น 0", () => {
    expect(headPostureAngles({ headV: 30 })).toMatchObject({ yawDeg: 0 });
  });
  // VRT = มุมงอข้อต่อ articulation แนวดิ่ง (คอลัมน์ [36]) ไม่ใช่ roll — เราไม่มีข้อมูล roll จริง
  // หลักฐาน: corr(VRT, ค่าเบี่ยง Head) = -0.862 · ช่วงดึงกลับสูงกว่าช่วงวิ่งนิ่ง 25 เท่า
  test("ไม่คืน rollDeg อีกแล้ว แม้ส่ง vrt มา", () => {
    expect(headPostureAngles({ vrt: 0.5 })).not.toHaveProperty("rollDeg");
  });
  test("vrt ไม่มีผลต่อ pitch/yaw", () => {
    expect(headPostureAngles({ vrt: 10 })).toEqual({ pitchDeg: 0, yawDeg: 0 });
  });
});
```

- [ ] **Step 2: รัน test ให้เห็นว่าแดง**

```bash
npx cross-env CI=true npx react-scripts test --watchAll=false -t "headPosture" 2>&1 | tail -8
```

Expected: FAIL — `ROLL_MAX` ยัง export อยู่ / `rollDeg` ยังถูกคืนมา

- [ ] **Step 3: แก้ implementation**

`src/utils/headPosture.js` — ลบบรรทัด 13–14 (`ROLL_GAIN`, `ROLL_MAX`) และแทนบรรทัด 25–32 ด้วย:

```js
export function headPostureAngles(posture) {
  if (!posture) return { pitchDeg: 0, yawDeg: 0 };
  return {
    pitchDeg: pitchFromMM(num(posture.headV) - num(posture.tailV)),
    yawDeg: clamp((num(posture.headH) - num(posture.tailH)) * YAW_DEG_PER_MM, YAW_MAX),
  };
}
```

- [ ] **Step 4: แก้ HeadCutter3D (2 บรรทัดเท่านั้น)**

`src/components/views/HeadCutter3D.jsx` บรรทัด 83:

```js
        const { pitchDeg, yawDeg } = headPostureAngles(p);
```

บรรทัด 87:

```js
        tiltGroup.rotation.set(-pitchDeg * DEG, yawDeg * DEG, 0);
```

**ห้ามแตะบรรทัดอื่นในไฟล์นี้**

- [ ] **Step 5: รัน test ให้ผ่าน + suite เต็ม**

```bash
npx cross-env CI=true npx react-scripts test --watchAll=false 2>&1 | tail -5
```

Expected: `Tests: 600 passed` — **จำนวนเท่าเดิม** เพราะ describe เดิม "roll/yaw" มี 4 test (roll gain · roll clamp · yaw · metric ขาด) และ describe ใหม่ก็ 4 test (yaw · metric ขาด · ไม่มี rollDeg · vrt ไม่มีผล) พอดี

- [ ] **Step 6: Commit**

```bash
git add src/utils/headPosture.js src/utils/headPosture.test.js src/components/views/HeadCutter3D.jsx
git commit -m "fix(head-3d): ตัด roll ออก — VRT คือมุมงอข้อต่อ articulation ไม่ใช่การหมุน"
```

---

## Task 6: Verify ของจริงบนจอ

**Files:** ไม่แก้ไฟล์ — เก็บหลักฐาน

**หมายเหตุสำคัญ:** Browser pane (`preview_*`) ใช้ verify หน้านี้ไม่ได้ — tab เป็น `visibilityState:"hidden"` → rAF ไม่ยิง → canvas 3D ว่าง **ต้องใช้ Playwright MCP**

- [ ] **Step 1: สตาร์ท dev server**

```bash
cd "D:/TEAM/Knowlegh/App/Tunnel Boring App - Copy/TunnelBoringMonitoring" && npx cross-env BROWSER=none npm start
```

รอจน `Compiled successfully` (~20–40s)

- [ ] **Step 2: เปิดหน้า "ระดับหัวเจาะ" ด้วย Playwright แล้ว screenshot ทั้ง 3 ช่วง**

ใช้ `mcp__playwright__browser_navigate` ไป `http://localhost:3000` → คลิกแท็บ "ระดับหัวเจาะ" → screenshot
จากนั้นกดปุ่ม `50 ริง` / `ทั้งหมด` → screenshot แต่ละอัน

ตรวจด้วยตาว่า:
- ช่วง 150: แถบเขียว ±75 เต็มกรอบ เส้น 3 เส้นแยกกันออก แกน Y = −100…+100 เลขกลม
- ช่วง ทั้งหมด: เห็น excursion 2 ก้อน พื้นแดงคลุมช่วง P33–P61 และ P325–P491
- แถบภาพรวม: เขียวเป็นหลัก แดงก้อนใหญ่กลางเส้นทาง กรอบอยู่ขวาสุด
- การ์ด KPI ใบที่ 4 = "อยู่ในเกณฑ์" สีเขียว

- [ ] **Step 3: ทดสอบคลิกแถบภาพรวม**

คลิกกลางโซนแดง (ประมาณ 60% ของความกว้าง) → กราฟบนต้องเลื่อนไปช่วง P400 กว่าๆ และปุ่ม "← กลับไปริงล่าสุด" ต้องโผล่ → screenshot

- [ ] **Step 4: ยืนยันว่าการ์ด 3D หน้าตาไม่เปลี่ยนหลังตัด roll**

screenshot การ์ด 3D (`[data-testid]` ของ HeadCutter3D) เทียบกับ `head3d-PROD-live.png` ที่ root
ต้องเหมือนเดิม — ถ้า**ต่าง** แปลว่าข้ออ้าง "roll มองไม่เห็นในมุม ortho" ผิด **ให้หยุดแล้วรายงาน**

- [ ] **Step 5: ปิด dev server + สรุปหลักฐาน**

รายงานผลพร้อม screenshot ทุกใบ · ระบุ jest count จริง · ระบุผล verify round-trip จาก Task 1

---

## เกณฑ์ว่าจบงาน

- [ ] ชีทมีข้อมูลถูกต้อง 629 ริง (verify round-trip PASS · ไม่มีค่าค้างที่ไม่ควรมี)
- [ ] เปิดหน้ามาเห็น 150 ริงล่าสุด แถบ ±75 เต็มกรอบ อ่านออกว่าอยู่ตรงไหนของเกณฑ์
- [ ] แถบภาพรวมบอกได้ใน 1 วินาทีว่าเคยหลุดช่วงไหน + คลิกไปดูได้
- [ ] การ์ด KPI ตอบ "อยู่ในเกณฑ์" ไม่ใช่ "เกิน 184 ริง"
- [ ] กราฟ VRT บอกความหมายถูก (มุมงอข้อต่อ = บังคับเลี้ยว)
- [ ] `headPostureAngles` ไม่คืน `rollDeg` · screenshot การ์ด 3D เหมือนเดิม
- [ ] jest **600** ผ่าน (569 baseline + 31 headTrend · headPosture คงที่ 20) · `npm run build` ผ่าน
- [ ] ไม่มีไฟล์ของ session อื่น (RouteScheduleView / Sidebar) ติดไปใน commit

## หมายเหตุที่ต้องบอกผู้ใช้ตอนจบ

- **6 ริง (P41/42/44/53/59/71) ไม่มีข้อมูล** เพราะ id ปลอมพิมพ์มือชนข้ามริง (`seg_1a2b3c4d5e6f` ใช้ทั้ง P37/P41/P71/P81) → เขียนผ่าน API ไม่ได้โดยไม่ลงผิดริง · ทั้ง 6 ริงเดิมก็ว่างอยู่แล้ว = ไม่ถอยหลัง
- **id ซ้ำ 7 ตัว / แถวริงซ้ำ 15 ริง** = หนี้ข้อมูลเดิม ควรเก็บกวาดเป็น task แยก
- **ค่าแนวราบ (H) มีถึง P509** เท่านั้น — ถ้า export guidance ใหม่ที่ครอบถึงริง 698 ได้ bullseye จะกลับมาเป็น 2 แกนจริงทุกริง
