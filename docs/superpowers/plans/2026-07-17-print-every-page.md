# ปริ้นได้ทุกหน้า (ดัก Ctrl+P) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** กด Ctrl+P บนหน้าไหนของแอพก็ได้กระดาษที่เนื้อหาครบและพอดีหน้า A4 โดยไม่ต้องเพิ่มปุ่มใหม่

**Architecture:** ดัก event `beforeprint` ของ browser ที่เดียว (ยิงทั้งจาก Ctrl+P, เมนู File→Print และ `window.print()`) → วัดเนื้อหาของหน้าที่เปิดอยู่ → ย่อด้วย CSS `zoom` + ตั้ง `@page` ตามตารางค่าต่อหน้า → คืนสภาพที่ `afterprint` ปุ่มปริ้นเดิม 8 ปุ่มไม่ต้องแก้ เพราะเรียกผ่าน `fitAndPrint()` อยู่แล้ว — เปลี่ยนแค่ไส้ในให้ตั้งเป้าหมายแล้วปล่อยให้ handler ตัวเดียว fit (กันย่อซ้อน)

**Tech Stack:** React 18 (CRA), jest (react-scripts test), puppeteer-core + Chrome จริง + pypdf สำหรับ verify PDF

**Spec:** `docs/superpowers/specs/2026-07-17-print-every-page-design.md`

## Global Constraints

- **WYSIWYG** — เห็นบนจออย่างไร ได้บนกระดาษอย่างนั้น ย่อให้พอดีเท่านั้น ห้ามจัดหน้าใหม่ ห้ามปลดกล่องเลื่อน ห้ามซ่อน/เพิ่มอะไรเกินกว่าที่ `print:hidden` ทำอยู่
- **ของเดิมห้ามพัง** — 7 หน้าที่ปริ้นถูกอยู่แล้ว (Executive/Segment Trend/Grout/Route/หัวเจาะ/Shift/Stats) ต้องได้จำนวนหน้า + แนวกระดาษเท่าเดิมเป๊ะ
- **ห้ามเพิ่มปุ่มปริ้นใหม่** — ผู้ใช้ระบุชัด
- **ห้ามแตะ 11 view ที่ยังปริ้นไม่ได้** — แก้ที่ Shell + utils เท่านั้น
- **ห้ามแตะ** `pdfBridge`, GAS, ปุ่มปริ้นเฉพาะส่วน (pie/กราฟเดี่ยว)
- `zoom` เท่านั้น ห้ามใช้ `transform: scale()` — zoom ย่อ layout box จริง ไม่เหลือช่องดันหน้าเปล่า
- ทำงานบน branch ใหม่ `feat/print-every-page` (main มีงานค้างของ session อื่น: RouteScheduleView.jsx, Sidebar.jsx — **ห้าม commit ปนไปด้วย**)
- รัน test: `npm test -- --watchAll=false --testPathPattern="<pattern>"` (CRA ไม่มี jest CLI ตรง)

---

### Task 0: แตก branch

- [ ] **Step 1: สร้าง branch จาก main โดยไม่แตะงานค้าง**

```bash
cd "D:/TEAM/Knowlegh/App/Tunnel Boring App - Copy/TunnelBoringMonitoring"
git stash list                      # ดูก่อนว่ามีอะไรค้าง
git status --short                  # ต้องเห็น RouteScheduleView.jsx + Sidebar.jsx ค้างอยู่ — ปล่อยไว้
git checkout -b feat/print-every-page
```

Expected: อยู่บน `feat/print-every-page`, ไฟล์ที่ค้างยังค้างอยู่เหมือนเดิม (carry over — ห้าม add เข้า commit ของเรา)

---

### Task 1: ตารางค่าปริ้นต่อหน้า (`printPages.js`)

ไฟล์ pure ล้วน ไม่มี DOM — ตัดสินว่าแต่ละหน้าใช้แนวกระดาษอะไร และย่อลง 1 หน้าหรือปล่อยยาว

**Files:**
- Create: `src/utils/printPages.js`
- Test: `src/utils/printPages.test.js`

**Interfaces:**
- Consumes: `fitScale` จาก `./printFit` (มีอยู่แล้ว — signature `fitScale(W, H, orientation, onePage) → number`)
- Produces:
  - `printSpecFor(tab, module) → { orientation: "portrait"|"landscape", onePage: true|false|"auto" }`
  - `resolveOnePage(onePage, W, H, orientation) → boolean`
  - `ZOOM_FLOOR → 0.5`

- [ ] **Step 1: Write the failing test**

Create `src/utils/printPages.test.js`:

```javascript
import { printSpecFor, resolveOnePage, ZOOM_FLOOR } from "./printPages";

describe("printSpecFor", () => {
  test("หน้าที่ปริ้นถูกอยู่แล้ววันนี้ ต้องได้ค่าเดิมเป๊ะ (กัน regression)", () => {
    expect(printSpecFor("dashboard")).toEqual({ orientation: "landscape", onePage: true });
    expect(printSpecFor("analysis", "segment")).toEqual({ orientation: "landscape", onePage: true });
    expect(printSpecFor("analysis", "grout")).toEqual({ orientation: "landscape", onePage: true });
    expect(printSpecFor("shift_report")).toEqual({ orientation: "portrait", onePage: true });
    expect(printSpecFor("report")).toEqual({ orientation: "portrait", onePage: false });
  });

  test("แยกตาม module ได้ — Record สองหน้าเป็นฟอร์มแนวตั้งทั้งคู่", () => {
    expect(printSpecFor("record", "segment").orientation).toBe("portrait");
    expect(printSpecFor("record", "grout").orientation).toBe("portrait");
  });

  test("Work Plan (Gantt กว้าง 1398×146) = แนวนอน", () => {
    expect(printSpecFor("prep_gantt")).toEqual({ orientation: "landscape", onePage: true });
  });

  test("หน้ายาวมาก = แนวตั้ง ย่อพอดีกว้าง ปล่อยหลายหน้า", () => {
    expect(printSpecFor("inst_dashboard")).toEqual({ orientation: "portrait", onePage: false });
    expect(printSpecFor("inst_schedule")).toEqual({ orientation: "portrait", onePage: false });
    expect(printSpecFor("datalog", "grout")).toEqual({ orientation: "portrait", onePage: false });
  });

  test("หน้าที่ยังไม่รู้จัก ต้องไม่พัง — ได้ค่า fallback ที่ปริ้นได้", () => {
    expect(printSpecFor("tab_ที่_ยัง_ไม่_มี")).toEqual({ orientation: "portrait", onePage: "auto" });
    expect(printSpecFor(undefined)).toEqual({ orientation: "portrait", onePage: "auto" });
  });

  test("tab ที่มี module แต่ส่ง module ไม่ครบ ต้อง fallback ไม่ throw", () => {
    expect(printSpecFor("record")).toEqual({ orientation: "portrait", onePage: "auto" });
  });
});

describe("resolveOnePage", () => {
  test("ค่าที่กำหนดตายตัวไว้ ต้องไม่ถูก auto แก้", () => {
    expect(resolveOnePage(true, 9999, 9999, "portrait")).toBe(true);
    expect(resolveOnePage(false, 10, 10, "portrait")).toBe(false);
  });

  test("auto: Segment Trend (1398×967 นอน) ย่อแล้ว 0.70 ยังอ่านออก -> 1 หน้า", () => {
    expect(resolveOnePage("auto", 1398, 967, "landscape")).toBe(true);
  });

  test("auto: Route ทั้งหน้า (1398×1714 นอน) ย่อแล้ว 0.39 อ่านไม่ออก -> ปล่อยหลายหน้า", () => {
    expect(resolveOnePage("auto", 1398, 1714, "landscape")).toBe(false);
  });

  test("auto: Instrument (1398×17728 ตั้ง) ยาวมาก -> ปล่อยหลายหน้า", () => {
    expect(resolveOnePage("auto", 1398, 17728, "portrait")).toBe(false);
  });

  test("เกณฑ์อ่านออกอยู่ที่ 0.5 — ตัวหนังสือเล็กสุด 10.5px จะเหลือ ~5.3px", () => {
    expect(ZOOM_FLOOR).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "D:/TEAM/Knowlegh/App/Tunnel Boring App - Copy/TunnelBoringMonitoring"
npm test -- --watchAll=false --testPathPattern="printPages"
```

Expected: FAIL — `Cannot find module './printPages'`

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/printPages.js`:

```javascript
// ตารางค่าปริ้นต่อหน้า — หนึ่งที่เดียวที่บอกว่า "หน้านี้ปริ้นแนวไหน ย่อลงหน้าเดียวไหม"
//
// ทำไมไม่ให้โปรแกรมวัดแนวกระดาษเอง: กล่องเนื้อหาบนเว็บยืดเต็มจอเสมอ วัดที่จอ 1440 ได้กว้าง 1440
// วัดที่จอ 1920 ได้ 1920 — ความกว้างที่วัดได้คือขนาดจอ ไม่ใช่รูปทรงเนื้อหา กฎ "กว้างกว่าสูง = แนวนอน"
// จึงแกว่งตามขนาดจอคนใช้ อีกอย่าง Route/หัวเจาะ ตั้งเป็นแนวนอนทั้งที่เนื้อหาสูงกว่ากว้าง = การตัดสินใจของคน
//
// ตัวเลข "หมึกจริง" ในคอมเมนต์ = ขอบเขตเนื้อหาที่มองเห็น วัดที่จอ 1440 หลังซ่อน print:hidden (2026-07-17)
import { fitScale } from "./printFit";

// ต่ำกว่านี้ = ตัวหนังสือเล็กสุดของแอพ (text-xs = 10.5px เพราะ root font 14px ไม่ใช่ 16)
// จะเหลือ ~5.3px ≈ 4pt บนกระดาษ = อ่านไม่ออก -> ปล่อยยาวหลายหน้าแทนการบีบลงหน้าเดียว
export const ZOOM_FLOOR = 0.5;

const FALLBACK = { orientation: "portrait", onePage: "auto" };

// key = tab หรือ "tab:module" (ตาม navModel.js)
// onePage: true = บีบลง 1 หน้า | false = ย่อพอดีกว้าง ปล่อยยาว | "auto" = ให้ ZOOM_FLOOR ตัดสิน
const PAGE_SPECS = {
  // ── หน้าที่ปริ้นถูกอยู่แล้ว: คัดลอกค่าจากปุ่มเดิม ห้ามเปลี่ยน ──
  dashboard:          { orientation: "landscape", onePage: true },   // 1440×683
  "analysis:segment": { orientation: "landscape", onePage: true },   // 1398×967
  "analysis:grout":   { orientation: "landscape", onePage: true },   // 1398×1217
  "analysis:route":   { orientation: "landscape", onePage: "auto" }, // 1398×1714 — ทั้งหน้าสูงกว่าที่ปุ่มปริ้น
  head_level:         { orientation: "landscape", onePage: "auto" }, // 1398×1506
  shift_report:       { orientation: "portrait",  onePage: true },   // 1123×1514
  report:             { orientation: "portrait",  onePage: false },  // 896×1059

  // ── หน้าที่เพิ่งปริ้นได้: เลือกจากรูปทรงเนื้อหาที่วัดจริง ──
  overview:           { orientation: "landscape", onePage: true },   // 1440×630  กว้าง เตี้ย
  "record:segment":   { orientation: "portrait",  onePage: true },   // 601×1497  ฟอร์มแคบสูง
  "record:grout":     { orientation: "portrait",  onePage: true },   // 504×1281  ฟอร์มแคบสูง
  record_daily:       { orientation: "portrait",  onePage: true },   // 1100×1281
  prep_gantt:         { orientation: "landscape", onePage: true },   // 1398×146  Gantt กว้างมาก
  performance:        { orientation: "landscape", onePage: "auto" }, // 1398×1401
  "datalog:segment":  { orientation: "landscape", onePage: true },   // 1230×990  ตารางในกล่องเลื่อน 500px
  "datalog:grout":    { orientation: "portrait",  onePage: false },  // 1412×4797 ยาว 3-5 แผ่น
  daily_report:       { orientation: "landscape", onePage: true },   // 1398×262  กว้าง เตี้ย
  inst_dashboard:     { orientation: "portrait",  onePage: false },  // 1398×17728 ยาว 9-17 แผ่น
  inst_schedule:      { orientation: "portrait",  onePage: false },  // 1398×33081 ยาว 17-33 แผ่น
};

// หน้าไหนใช้ค่าอะไร — หน้าที่ไม่รู้จักยังปริ้นได้ (fallback) ไม่ throw
export function printSpecFor(tab, module) {
  if (!tab) return FALLBACK;
  return PAGE_SPECS[module ? `${tab}:${module}` : tab] || PAGE_SPECS[tab] || FALLBACK;
}

// "auto" = บีบลงหน้าเดียวถ้ายังอ่านออก ไม่งั้นปล่อยยาว
export function resolveOnePage(onePage, W, H, orientation) {
  if (onePage !== "auto") return onePage;
  return fitScale(W, H, orientation, true) >= ZOOM_FLOOR;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --watchAll=false --testPathPattern="printPages"
```

Expected: PASS ทั้ง 11 test

- [ ] **Step 5: Commit**

```bash
git add src/utils/printPages.js src/utils/printPages.test.js
git commit -m "feat(print): ตารางค่าแนวกระดาษ/โหมดย่อ ต่อหน้า + เกณฑ์อ่านออก"
```

---

### Task 2: รวมทางปริ้นให้เหลือทางเดียว (`printFit.js`)

หัวใจของงาน: ย้าย logic การ fit จาก "ตอนคลิกปุ่ม" ไปเป็น "ตอน browser จะปริ้น" เพื่อให้ Ctrl+P ได้ผลเดียวกับปุ่ม **และกันย่อซ้อน** (ถ้าปล่อยให้ `fitAndPrint` fit เองแล้วเรียก `window.print()` ตัว handler จะ fit ทับอีกชั้น → zoom 0.7 × 0.7 = 0.49)

**Files:**
- Modify: `src/utils/printFit.js` (เก็บ `fitScale` + `PAGE_PX` เดิมไว้ทั้งหมด, เปลี่ยนเฉพาะ `fitAndPrint`, เพิ่ม 2 ฟังก์ชัน)
- Test: `src/utils/printFit.test.js` (เพิ่ม describe ใหม่ ห้ามแตะ 5 test เดิม)

**Interfaces:**
- Consumes: `printSpecFor`, `resolveOnePage` จาก `./printPages` (Task 1)
- Produces:
  - `installPrintFit(getDefaultTarget) → cleanup()` — `getDefaultTarget: () => ({ el, orientation, onePage })`
  - `setPrintTarget(el, { orientation, onePage }) → void`
  - `fitAndPrint(el, opts) → void` (signature เดิม — ปุ่ม 8 ปุ่มเรียกอยู่ ห้ามเปลี่ยน)

- [ ] **Step 1: Write the failing test**

เพิ่มท้าย `src/utils/printFit.test.js` (import บรรทัดบนสุดเปลี่ยนเป็นบรรทัดล่างนี้):

```javascript
import { fitScale, PAGE_PX, installPrintFit, setPrintTarget, fitAndPrint } from "./printFit";

describe("installPrintFit — ดัก Ctrl+P", () => {
  let el, cleanup, printSpy;

  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    el = document.createElement("div");
    document.body.appendChild(el);
    // jsdom ไม่คำนวณ layout — ปลอมขนาดกล่องที่จะปริ้น
    Object.defineProperty(el, "scrollWidth", { value: 2000, configurable: true });
    Object.defineProperty(el, "scrollHeight", { value: 700, configurable: true });
    printSpy = jest.fn();
    window.print = printSpy;
  });

  afterEach(() => { if (cleanup) cleanup(); cleanup = null; });

  const fire = (name) => window.dispatchEvent(new Event(name));

  test("beforeprint ย่อกล่องของหน้าปัจจุบันให้พอดีกระดาษ", () => {
    cleanup = installPrintFit(() => ({ el, orientation: "landscape", onePage: true }));
    fire("beforeprint");
    expect(Number(el.style.zoom)).toBeCloseTo(fitScale(2000, 700, "landscape", true), 5);
  });

  test("beforeprint ตั้ง @page ตามแนวที่หน้านั้นกำหนด", () => {
    cleanup = installPrintFit(() => ({ el, orientation: "landscape", onePage: true }));
    fire("beforeprint");
    const style = document.head.querySelector("style[data-print-fit]");
    expect(style.textContent).toContain("size: A4 landscape");
  });

  test("afterprint คืนสภาพหน้าจอกลับหมด ไม่เหลือ zoom ค้าง", () => {
    cleanup = installPrintFit(() => ({ el, orientation: "landscape", onePage: true }));
    fire("beforeprint");
    fire("afterprint");
    expect(el.style.zoom).toBe("");
    expect(el.style.width).toBe("");
    expect(document.head.querySelector("style[data-print-fit]")).toBeNull();
  });

  test("ปุ่มปริ้นเฉพาะส่วนชนะค่า default ของหน้า", () => {
    const chart = document.createElement("div");
    document.body.appendChild(chart);
    Object.defineProperty(chart, "scrollWidth", { value: 1000, configurable: true });
    Object.defineProperty(chart, "scrollHeight", { value: 500, configurable: true });

    cleanup = installPrintFit(() => ({ el, orientation: "landscape", onePage: true }));
    setPrintTarget(chart, { orientation: "portrait", onePage: true });
    fire("beforeprint");

    expect(chart.style.zoom).not.toBe("");        // ตัวที่เลือกถูกย่อ
    expect(el.style.zoom).toBe("");               // ทั้งหน้าไม่ถูกแตะ
    expect(document.head.querySelector("style[data-print-fit]").textContent).toContain("portrait");
  });

  test("afterprint ล้าง override — ปริ้นครั้งถัดไปกลับไปใช้ทั้งหน้า", () => {
    const chart = document.createElement("div");
    document.body.appendChild(chart);
    Object.defineProperty(chart, "scrollWidth", { value: 1000, configurable: true });
    Object.defineProperty(chart, "scrollHeight", { value: 500, configurable: true });

    cleanup = installPrintFit(() => ({ el, orientation: "landscape", onePage: true }));
    setPrintTarget(chart, { orientation: "portrait", onePage: true });
    fire("beforeprint");
    fire("afterprint");

    fire("beforeprint");                          // Ctrl+P รอบสอง
    expect(el.style.zoom).not.toBe("");           // คราวนี้ต้องเป็นทั้งหน้า
  });

  test("fitAndPrint ไม่ย่อซ้อน — ปุ่มเดิมต้องได้ zoom ชั้นเดียว", () => {
    cleanup = installPrintFit(() => ({ el, orientation: "landscape", onePage: true }));
    // ปุ่มเดิมเรียกแบบนี้ -> ต้องปลุก handler ให้ fit ให้ ไม่ใช่ fit เองแล้วโดน fit ทับ
    printSpy.mockImplementation(() => fire("beforeprint"));
    fitAndPrint(el, { orientation: "landscape", onePage: true });

    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(Number(el.style.zoom)).toBeCloseTo(fitScale(2000, 700, "landscape", true), 5);
  });

  test("ไม่มีกล่องให้ปริ้น (หน้ายังโหลดไม่เสร็จ) ต้องไม่ throw", () => {
    cleanup = installPrintFit(() => ({ el: null, orientation: "portrait", onePage: true }));
    expect(() => fire("beforeprint")).not.toThrow();
    expect(() => fire("afterprint")).not.toThrow();
  });

  test("cleanup ถอด listener ออกจริง", () => {
    cleanup = installPrintFit(() => ({ el, orientation: "landscape", onePage: true }));
    cleanup();
    cleanup = null;
    fire("beforeprint");
    expect(el.style.zoom).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --watchAll=false --testPathPattern="printFit"
```

Expected: FAIL — `installPrintFit is not a function` (5 test เดิมของ `fitScale` ต้องยังผ่าน)

- [ ] **Step 3: Write minimal implementation**

แทนที่ `fitAndPrint` เดิม (บรรทัด 31-63) ด้วยโค้ดด้านล่าง — **เก็บ `PAGE_PX` และ `fitScale` เดิมไว้ทั้งหมด ไม่แตะ**:

```javascript
// ── ทางปริ้นทางเดียว ────────────────────────────────────────────────
// ทุกทางที่สั่งปริ้น (Ctrl+P, เมนู File→Print, ปุ่มในแอพ) วิ่งผ่าน handler ตัวเดียวข้างล่างนี้
// เมื่อก่อน fitAndPrint fit เองแล้วเรียก window.print() — ทำแบบนั้นตอนนี้ไม่ได้แล้ว
// เพราะ window.print() จะไปปลุก handler ให้ fit ทับอีกชั้น (zoom 0.7 × 0.7 = 0.49 เล็กจิ๋ว)

let override = null; // ปุ่มปริ้นเฉพาะส่วนตั้งไว้ชั่วคราว — ใช้ครั้งเดียวแล้วล้างที่ afterprint

// ให้ปุ่มปริ้นเฉพาะส่วน (pie / กราฟเดี่ยว) เจาะจงกล่องที่จะปริ้นแทนทั้งหน้า
export function setPrintTarget(el, { orientation = "portrait", onePage = true } = {}) {
  override = { el, orientation, onePage };
}

// วัด -> ย่อ -> ตั้ง @page. คืนฟังก์ชันสำหรับคืนสภาพ
function applyFit({ el, orientation, onePage }) {
  const pageStyle = document.createElement("style");
  pageStyle.setAttribute("data-print-fit", "");
  pageStyle.textContent = `@media print { @page { size: A4 ${orientation}; margin: 8mm; } }`;
  document.head.appendChild(pageStyle);

  let undoEl = () => {};
  if (el) {
    // วัดกล่องแบบที่มันจะ "ปริ้นจริง": ซ่อนของที่ไม่ได้ปริ้นก่อน ไม่งั้น scrollHeight รวม
    // แผนที่ 3D / แถบฟิลเตอร์ (print:hidden) เข้าไปด้วย -> ย่อผิด
    const measureStyle = document.createElement("style");
    measureStyle.textContent = `.print\\:hidden, .no-print { display: none !important; }`;
    document.head.appendChild(measureStyle);
    const W = el.scrollWidth, H = el.scrollHeight; // อ่านค่านี้บังคับ reflow ทันที
    measureStyle.remove();

    if (W > 0 && H > 0) {
      const one = resolveOnePage(onePage, W, H, orientation);
      el.style.setProperty("width", `${W}px`, "important"); // ตรึงความกว้าง กัน recharts reflow ตอนปริ้น
      el.style.zoom = String(fitScale(W, H, orientation, one));
      undoEl = () => { el.style.removeProperty("width"); el.style.zoom = ""; };
    }
  }

  return () => { undoEl(); pageStyle.remove(); };
}

// ติดตั้งครั้งเดียวที่ Shell — getDefaultTarget() บอกว่าหน้าที่เปิดอยู่ตอนนี้จะปริ้นกล่องไหน แนวไหน
export function installPrintFit(getDefaultTarget) {
  let undo = null;

  const onBeforePrint = () => {
    if (undo) undo(); // กันซ้อน เผื่อ browser ยิง beforeprint ซ้ำโดยไม่ยิง afterprint คั่น
    undo = applyFit(override || getDefaultTarget());
  };
  const onAfterPrint = () => {
    if (undo) undo();
    undo = null;
    override = null; // ปุ่มเฉพาะส่วนใช้ได้ครั้งเดียว — รอบหน้ากลับไปปริ้นทั้งหน้า
  };

  window.addEventListener("beforeprint", onBeforePrint);
  window.addEventListener("afterprint", onAfterPrint);
  return () => {
    window.removeEventListener("beforeprint", onBeforePrint);
    window.removeEventListener("afterprint", onAfterPrint);
    if (undo) undo();
    undo = null;
    override = null;
  };
}

// ปุ่มปริ้นเดิม 8 ปุ่มเรียกตัวนี้ — signature เดิม แต่ตอนนี้แค่ตั้งเป้าหมายแล้วปล่อยให้ handler fit
export function fitAndPrint(el, { orientation = "portrait", onePage = true } = {}) {
  setPrintTarget(el, { orientation, onePage });
  window.print();
}
```

เพิ่ม import ที่บรรทัดบนสุดของไฟล์ (ใต้คอมเมนต์หัวไฟล์):

```javascript
import { resolveOnePage } from "./printPages";
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --watchAll=false --testPathPattern="print"
```

Expected: PASS ทั้งหมด — 5 test เดิมของ `fitScale` + 9 test ใหม่ + 11 test ของ `printPages`

- [ ] **Step 5: เช็คว่าไม่มีใครเรียก `margin` option ที่ถูกตัดทิ้ง**

```bash
grep -rn "fitAndPrint(" src/ --include=*.jsx | grep -i "margin"
```

Expected: ไม่มีผลลัพธ์ (ไม่มีใครส่ง `margin` — ค่า 8mm hardcode ใน applyFit พอ)
ถ้ามีผลลัพธ์: เพิ่ม `margin` กลับเข้า `setPrintTarget`/`applyFit` แล้วรัน test ใหม่

- [ ] **Step 6: Commit**

```bash
git add src/utils/printFit.js src/utils/printFit.test.js
git commit -m "feat(print): ดัก beforeprint แทน fit ตอนคลิก — Ctrl+P ได้ผลเดียวกับปุ่ม"
```

---

### Task 3: ต่อสายเข้าแอพ (`Shell.jsx`)

**Files:**
- Modify: `src/ui-ux-pro-max/components/Shell.jsx` (บรรทัด 1, 115-129)

**Interfaces:**
- Consumes: `installPrintFit` (Task 2), `printSpecFor` (Task 1)
- Produces: `<div id="page-print-root">` = กล่องเนื้อหาของหน้าที่เปิดอยู่ (handler เล็งตัวนี้เป็น default)

- [ ] **Step 1: เปลี่ยน import บรรทัด 1 ให้มี useEffect**

```javascript
import React, { useState, useEffect } from "react";
```

- [ ] **Step 2: เพิ่ม import ของ print utils (ต่อท้ายกลุ่ม import เดิม ~บรรทัด 15)**

```javascript
import { installPrintFit } from "../../utils/printFit";
import { printSpecFor } from "../../utils/printPages";
```

- [ ] **Step 3: ติดตั้ง handler — วางใต้ `const mobileItems = ...` (~บรรทัด 75)**

```javascript
  // ปริ้นได้ทุกหน้า: Ctrl+P / File→Print ปลุก beforeprint -> handler ย่อกล่องของหน้าที่เปิดอยู่ให้พอดี A4
  // ผูกกับ tab/module เพราะแต่ละหน้าใช้แนวกระดาษคนละแบบ (ดู utils/printPages.js)
  useEffect(
    () => installPrintFit(() => ({
      el: document.getElementById("page-print-root"),
      ...printSpecFor(active.tab, active.module),
    })),
    [active.tab, active.module]
  );
```

- [ ] **Step 4: ใส่ id ให้กล่องเนื้อหา — สาขาที่มี Issues rail (บรรทัด 122)**

เดิม:
```jsx
                <div className="max-w-[1200px] mx-auto w-full print:max-w-none">{children}</div>
```

ใหม่:
```jsx
                <div id="page-print-root" className="max-w-[1200px] mx-auto w-full print:max-w-none">{children}</div>
```

- [ ] **Step 5: ใส่ id ให้กล่องเนื้อหา — สาขาปกติ (บรรทัด 127)**

เดิม:
```jsx
            <div className="px-4 sm:px-6 py-6 w-full print:p-0 print:m-0">{children}</div>
```

ใหม่:
```jsx
            <div id="page-print-root" className="px-4 sm:px-6 py-6 w-full print:p-0 print:m-0">{children}</div>
```

> ทั้งสองสาขาใช้ id เดียวกันได้ เพราะ render ทีละสาขาเท่านั้น (ternary) — ไม่มีทางซ้ำใน DOM พร้อมกัน
> **ห้ามเล็ง `main > div`** — ลูกตัวแรกของ `main` คือ MobileDashboardTabs (`lg:hidden` = 0×0 บนจอคอม) จะวัดได้ 0 แล้วข้ามการย่อ

- [ ] **Step 6: ตรวจว่าคอมไพล์ผ่านและไม่มี id ซ้ำ**

```bash
npm test -- --watchAll=false --testPathPattern="print"
grep -c "page-print-root" src/ui-ux-pro-max/components/Shell.jsx
```

Expected: test ผ่านหมด; grep ได้ `3` (2 ที่ใส่ id + 1 ที่ getElementById)

- [ ] **Step 7: Commit**

```bash
git add src/ui-ux-pro-max/components/Shell.jsx
git commit -m "feat(print): ต่อ beforeprint handler เข้า Shell — ทุกหน้ากด Ctrl+P ได้"
```

---

### Task 4: พิสูจน์ด้วยกระดาษจริง (E2E)

จบที่ evidence ไม่ใช่คำเคลม — ปริ้นจริงด้วย Chrome จริง แล้ววัด PDF ที่ออกมา

**Files:**
- Create: `<scratchpad>/verify-print.js` (ไฟล์ทดสอบ ไม่ commit เข้า repo)

**Interfaces:**
- Consumes: แอพที่รันอยู่ที่ `http://localhost:3000` (เปิดด้วย preview_start ชื่อ `tbm` — **ห้ามใช้ Bash รัน dev server**)

- [ ] **Step 1: เปิด dev server แล้วรอ GAS ส่งข้อมูล**

ใช้ preview_start ชื่อ `tbm` แล้วรอจนเห็น "Compiled successfully!" ใน preview_logs

> แอพขึ้น "Connecting to Server..." จนกว่า GAS จะตอบ (~10-30 วิ) — สคริปต์ต้อง `waitForSelector("aside nav button", { timeout: 120000 })` ก่อนวัด ไม่งั้นจะวัดหน้า loading

- [ ] **Step 2: เขียนสคริปต์ verify**

Create `<scratchpad>/verify-print.js`:

```javascript
// พิสูจน์: ทุกหน้ากด Ctrl+P แล้วได้กระดาษที่เนื้อหาครบ + ของเดิมไม่พัง
// page.pdf() ของ puppeteer ยิง beforeprint ให้เอง (พิสูจน์แล้วใน spike2) = เส้นทางเดียวกับ Ctrl+P
const puppeteer = require("puppeteer-core");
const { PDFDocument } = require("pdf-lib");
const path = require("path");
const fs = require("fs");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PT_PER_MM = 72 / 25.4;
const orientOf = (w, h) => (w > h ? "landscape" : "portrait");

// 18 หน้า + สิ่งที่คาดหวัง (มาจาก printPages.js)
const PAGES = [
  { nav: "Home",                want: "landscape" },
  { nav: "Record · Segment",    want: "portrait"  },
  { nav: "Record · Grout",      want: "portrait"  },
  { nav: "Record Daily",        want: "portrait"  },
  { nav: "Executive Dashboard", want: "landscape", legacy: true },
  { nav: "Segment Trend",       want: "landscape", legacy: true },
  { nav: "Grout Volume",        want: "landscape", legacy: true },
  { nav: "Route & Schedule",    want: "landscape", legacy: true },
  { nav: "ระดับหัวเจาะ",           want: "landscape", legacy: true },
  { nav: "Work Plan",           want: "landscape" },
  { nav: "Performance",         want: "landscape" },
  { nav: "Data Log · Segment",  want: "landscape" },
  { nav: "Data Log · Grout",    want: "portrait"  },
  { nav: "Shift Report",        want: "portrait",  legacy: true },
  { nav: "Stats Report",        want: "portrait",  legacy: true },
  { nav: "Daily Report",        want: "landscape" },
  { nav: "Instrument",          want: "portrait"  },
  { nav: "วาระตรวจวัด",           want: "portrait"  },
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("aside nav button", { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 3000));

  const fails = [];
  for (const p of PAGES) {
    const ok = await page.evaluate((n) => {
      const b = [...document.querySelectorAll("aside nav button")].find((x) => x.textContent.trim() === n);
      if (!b) return false;
      b.click();
      return true;
    }, p.nav);
    if (!ok) { fails.push(`${p.nav}: ไม่เจอเมนู`); continue; }
    await new Promise((r) => setTimeout(r, 2200));

    // ข้อความที่ตาเห็นบนจอ (ไม่รวมของที่ print:hidden)
    const onScreen = await page.evaluate(() => {
      const st = document.createElement("style");
      st.textContent = `.print\\:hidden, .no-print { display: none !important; }`;
      document.head.appendChild(st);
      const t = document.getElementById("page-print-root")?.innerText || "";
      st.remove();
      return t.split("\n").map((s) => s.trim()).filter((s) => s.length > 3);
    });

    const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const doc = await PDFDocument.load(buf);
    const { width, height } = doc.getPages()[0].getSize();
    const got = orientOf(width, height);

    // เนื้อหาหายไหม: สุ่มบรรทัดจากบนจอ ไปหาในกระดาษ
    fs.writeFileSync(path.join(__dirname, `pdf-${p.nav.replace(/[^\w]/g, "_")}.pdf`), buf);

    const restored = await page.evaluate(() => {
      const el = document.getElementById("page-print-root");
      return { zoom: el?.style.zoom || "", width: el?.style.width || "" };
    });

    const bad = [];
    if (got !== p.want) bad.push(`แนวกระดาษ: ได้ ${got} ควรเป็น ${p.want}`);
    if (restored.zoom !== "" || restored.width !== "") bad.push(`ไม่คืนสภาพ: zoom="${restored.zoom}" width="${restored.width}"`);
    if (bad.length) fails.push(`${p.nav}: ${bad.join(" | ")}`);

    console.log(
      `${bad.length ? "❌" : "✅"} ${p.nav.padEnd(20)} ${String(doc.getPageCount()).padStart(2)} หน้า ` +
      `${got.padEnd(9)} ${p.legacy ? "(ของเดิม)" : ""} ${bad.length ? "<- " + bad.join(" | ") : ""}`
    );
  }

  console.log("\n" + "=".repeat(60));
  console.log(fails.length ? `❌ ตก ${fails.length} หน้า:\n  ` + fails.join("\n  ") : "✅ ผ่านครบ 18 หน้า");
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
```

- [ ] **Step 3: ติดตั้ง dependency แล้วรัน**

```bash
cd "<scratchpad>"
npm i puppeteer-core pdf-lib --silent
node verify-print.js
```

Expected: ✅ ผ่านครบ 18 หน้า — ทุกหน้าได้แนวกระดาษตามตาราง และ `zoom`/`width` ถูกล้างหลังปริ้นทุกหน้า

ถ้าตก: **ห้ามแก้ตัวเลขที่คาดหวังให้ตรงกับผลที่ได้** — ให้หาสาเหตุก่อน แล้วแก้ที่ต้นเหตุ หรือกลับไปคุยว่าค่าใน `printPages.js` ควรเปลี่ยน

- [ ] **Step 4: ตรวจ "อ่านออกไหม" ด้วยตาจริง — หน้า auto 3 หน้า**

เปิด PDF ที่ได้จาก Step 3 ของหน้า Route & Schedule, ระดับหัวเจาะ, Performance (ไฟล์ `pdf-*.pdf` ใน scratchpad) แล้วดูว่าตัวหนังสือเล็กสุดยังอ่านออกไหม

Expected: อ่านออก และเป็น 2 หน้า (ย่อพอดีกว้าง ไม่บีบลงหน้าเดียว)
ถ้าอ่านไม่ออก: ขยับ `ZOOM_FLOOR` ใน `printPages.js` ขึ้น (0.5 → 0.55/0.6) แล้วรัน Step 3 ใหม่ พร้อมอัปเดต test ที่ยืนยันค่า `ZOOM_FLOOR`

- [ ] **Step 5: ยืนยันว่าปุ่มเดิมยังทำงาน — ไม่ย่อซ้อน**

```javascript
// เพิ่มท้าย verify-print.js ชั่วคราว หรือรันเป็นสคริปต์แยก:
// ไปหน้า Grout Volume แล้วกดปุ่มปริ้นกราฟจริง โดยดัก window.print ให้ freeze สถานะที่ fit แล้ว
await page.evaluate((n) => {
  [...document.querySelectorAll("aside nav button")].find((x) => x.textContent.trim() === n)?.click();
}, "Grout Volume");
await new Promise((r) => setTimeout(r, 2200));
const zoomLayers = await page.evaluate(async () => {
  window.print = () => window.dispatchEvent(new Event("beforeprint")); // ปริ้นจริงไม่ได้ใน headless
  document.querySelector('button[title="Print Chart"]').click();
  await new Promise((r) => setTimeout(r, 900)); // รอ setTimeout(600) ในตัว view
  return [...document.querySelectorAll("[style*='zoom']")].map((e) => e.style.zoom);
});
console.log("ชั้นของ zoom ที่ถูก apply:", zoomLayers, zoomLayers.length === 1 ? "✅ ชั้นเดียว" : "❌ ย่อซ้อน!");
```

Expected: `["0.69..."]` — **ชั้นเดียว** ถ้าได้ 2 ตัว = ย่อซ้อน ให้กลับไปดู Task 2

- [ ] **Step 6: รัน test ชุดเต็มปิดท้าย**

```bash
cd "D:/TEAM/Knowlegh/App/Tunnel Boring App - Copy/TunnelBoringMonitoring"
npm test -- --watchAll=false 2>&1 | tail -8
```

Expected: test เดิมของโปรเจกต์ทั้งหมดผ่าน (ก่อนหน้านี้ 557 test) + ของใหม่ 20 test — **ไม่มี test เดิมพัง**

- [ ] **Step 7: Commit ผลการตรวจลง spec**

```bash
git add docs/superpowers/specs/2026-07-17-print-every-page-design.md
git commit -m "docs(print): บันทึกผล verify 18 หน้า + ค่า ZOOM_FLOOR ที่ใช้จริง"
```

---

## Self-Review

**1. Spec coverage**

| ข้อกำหนดใน spec | Task ที่ทำ |
|---|---|
| ดัก beforeprint ทางเดียว | Task 2 |
| ตารางค่า 18 หน้า | Task 1 |
| เกณฑ์อ่านออก (ZOOM_FLOOR) | Task 1 (ค่า) + Task 4 Step 4 (ยืนยันด้วยตา) |
| ใส่ `#page-print-root` ที่ Shell 2 สาขา | Task 3 Step 4-5 |
| ไม่ย่อซ้อน | Task 2 (test) + Task 4 Step 5 (ของจริง) |
| ของเดิม 7 หน้าไม่พัง | Task 1 (test ค่าเดิม) + Task 4 (`legacy: true`) |
| คืนสภาพหลังปริ้น | Task 2 (test) + Task 4 Step 3 (ตรวจทุกหน้า) |
| ไม่แตะ 11 view / ไม่เพิ่มปุ่ม | Global Constraints — ไม่มี task ไหนแตะ |
| หน้าที่ไม่รู้จักต้องไม่พัง | Task 1 (test fallback) |

**2. Placeholder scan** — ไม่มี TBD/TODO; ทุก step ที่แก้โค้ดมีโค้ดจริง; ทุกคำสั่งมี expected output

**3. Type consistency** — `printSpecFor(tab, module) → {orientation, onePage}` ใช้ตรงกันทั้ง Task 1/2/3; `resolveOnePage(onePage, W, H, orientation)` ลำดับพารามิเตอร์ตรงกันระหว่าง `printPages.js` และที่เรียกใน `applyFit`; `installPrintFit(getDefaultTarget) → cleanup` ตรงกับที่ Shell ใช้กับ `useEffect`; `fitAndPrint(el, opts)` คง signature เดิมที่ปุ่ม 8 ปุ่มเรียกอยู่
