# CMI AI Mark 2 — แผน Redesign UX/UI (TBM1 System)

> เอกสารออกแบบ (design spec) สำหรับ reskin แอป Tunnel Boring Monitoring ให้เป็นภาษาดีไซน์ **CMI AI Mark 2**
> โฟลเดอร์ทำงาน: `TunnelBoringMonitoring/src/ui-ux-pro-max/` · วันที่: 2026-05-31 · สถานะ: **รอ review**

---

## 1. เป้าหมาย & ขอบเขต (Goal & Scope)

เปลี่ยน **"ผิว" (visual language)** ของทั้งแอปให้เป็น CMI AI Mark 2 (TEAM Navy / IBM Plex / corporate enterprise) โดย **ไม่กระทบการทำงานเดิมแม้แต่น้อย**

**ระดับงาน: B** — Reskin เต็ม + ปรับ Shell (header/nav/layout) ให้เป็น enterprise dashboard

### 🔒 ข้อจำกัดเด็ดขาด (Hard constraints)
สิ่งเหล่านี้ **ต้องเหมือนเดิม 100%** — เปลี่ยนได้แค่สี/ฟอนต์/มุม/เงา/ระยะ/ตำแหน่ง chrome:

| ห้ามกระทบ | รายละเอียด |
|---|---|
| **Data flow / State** | `currentModule`, `activeTab`, `groutRecords`, `segmentRecords`, `shiftReports`, props ทุกตัว |
| **การกรอกข้อมูล** | ทุก input/select/textarea/slider/file-upload + validation + auto-link logic |
| **การคำนวณ** | soil volume, ratio, CH, ring offset, cumulative, delay — ทุก formula |
| **API** | `GAS_URL` + `apiCall` + Gemini summary — ไม่แตะ |
| **กราฟ (charts)** | recharts ทุกตัว: โครงสร้าง, dataKey, แกน, logic — เปลี่ยนได้แค่ **สี** (ผ่าน chartTheme) |
| **ตารางแสดงเวลาการทำงาน** | work-time table ใน ShiftReportView (hour-cell grid + activity bars) |
| **หน้าสรุป (summary)** | OverviewView, ReportView, ExecutiveDashboardView — ตัวเลข/โครงเดิม |
| **Export** | html2canvas → JPG + `window.print()` → PDF + `@media print` ทุกจุด |

### หลักการ
- **Presentational-only**: แตะแค่ `className`, CSS, shell layout, component wrapper — ไม่แตะ logic
- **Token-driven**: CMI Mark 2 tokens เป็น single source of truth
- **โครงสร้าง DOM/props เดิม**: เพื่อให้ export (html2canvas อิง DOM tree) ไม่พัง
- **ใช้เฉพาะที่จำเป็น** จาก design system — ส่วนที่แอปไม่มี (เช่น component อื่น) ไม่เอามา

---

## 2. Design Tokens (อ้างอิง `CMI AI Mark 2 Design System/colors_and_type.css`)

| กลุ่ม | Token | ค่า |
|---|---|---|
| **Brand** | navy / navy-dark / navy-deepest | `#003B84` / `#0C2C65` / `#00246C` |
| **Secondary** | cyan / cyan-med / cyan-tint | `#38A7CE` / `#1E80BD` / `#E5F1FF` |
| **Sustainability** | green-dark / green-med | `#10463A` / `#44C473` |
| **Status** | Code A / B / C / D | `#10463A` / `#B8860B` / `#C8500A` / `#B91C1C` |
| **Surface** | bg-page / bg-surface | `#F8FAFD` / `#FFFFFF` |
| **Text** | fg-1 / fg-2 / fg-3 | `#333` / `#666` / `#999` |
| **Border** | default / input | `#E8E8E8` / `#D8D8D8` |
| **Radii** | badge / button / input / card / modal | `4 / 6 / 6 / 8 / 12 px` |
| **Shadow** | card / hover / modal | `0 1px 2px` / `0 2px 8px` / `0 12px 32px` (navy-tinted, เบามาก) |
| **Font** | sans / mono | IBM Plex Sans Thai+Sans / IBM Plex Mono |
| **Chart** | planned / actual / paid / grid / axis | navy / green-dark / cyan-med / `#F0F0F0` / gray-400 |

**การเปลี่ยนที่เห็นชัดสุด:** font-weight headings จาก `font-black (900)` → `semibold (600)`, radii จาก `24px (rounded-3xl)` → `8px`, เงาจาก `shadow-2xl` → เบามาก, ฟอนต์ Inter → IBM Plex, ตัวเลข engineering → IBM Plex Mono

---

## 3. Token Mapping: ปัจจุบัน → CMI (หัวใจของงาน reskin)

### 3.1 สี UI ทั่วไป
| ปัจจุบัน (Tailwind) | บทบาท | → CMI |
|---|---|---|
| `slate-50` | page bg | `--bg-page` #F8FAFD |
| `white` | card surface | `--bg-surface` #FFFFFF |
| `slate-900/800` (nav, header dark) | chrome เข้ม | `--color-navy-dark` #0C2C65 |
| `slate-800/900` (body text) | text หลัก | `--fg-1` #333 |
| `slate-500/400` | text รอง | `--fg-2` #666 / `--fg-3` #999 |
| `slate-200/100` | border | `--border-default` #E8E8E8 |
| `blue-600` #2563eb (Grout, primary) | accent หลัก | `--color-navy` #003B84 |
| `#2e266a` (ExecDashboard brand) | dashboard brand | `--color-navy-dark` #0C2C65 |
| `emerald-500/600` (Segment, สำเร็จ) | accent | `--color-green-med` #44C473 / `green-dark` #10463A |
| `amber-500` (กำลังขุด) | สถานะ warn | `--status-code-b` #B8860B |
| `orange-500` #F97316 (in-progress / secondary grout) | accent รอง | `--status-code-c` #C8500A หรือ `cyan-med` #1E80BD |
| `red-500` #ef4444 / rose (error/ค้าง/เกิน) | error/alert | `--status-code-d` #B91C1C |
| `indigo/violet/purple` #8b5cf6 #6366f1 (route, re-grout) | decorative/route | navy→cyan ramp / `--status-escalated` #7C2D92 |

### 3.2 สีกราฟ (recharts) — แมพแบบ "รักษาความหมาย" (semantic-aware)
> ⚠️ ห้ามเปลี่ยนสีแบบสุ่ม — สีในกราฟมีความหมาย (เช่น แดง = ช้ากว่าแผน) ต้องคงความหมายไว้

| recharts ปัจจุบัน (hex) | ความหมาย | → CMI |
|---|---|---|
| `#0f172a` / `#8b5cf6` (planAcc) | เส้นแผน (Plan) | `--chart-planned` navy #003B84 |
| `#ef4444` (actualAcc) | เส้นจริง (Actual) | `--chart-actual` green-dark #10463A *(ปกติ)* — เปลี่ยนเป็น `status-d` แดงเมื่อ "ช้ากว่าแผน" |
| `#fde047` (dayRings, Day Shift) | กะกลางวัน | `--status-code-b` #B8860B (gold = วัน) |
| `#3b82f6` (nightRings, Night Shift) | กะกลางคืน | `--color-navy` #003B84 (เข้ม = คืน) |
| `#cbd5e1` (tempRings) | ชั่วคราว | `gray-300` #C0C0C0 |
| `#94a3b8` (plan line) | เส้นแผนรอง | `--chart-axis` gray-400 |
| `#ec4899` / `#9b1c1c` (delay) | ล่าช้า | `--status-code-d` #B91C1C |
| grid `#E2E8F0` / `#e2e8f0` | เส้น grid | `--chart-grid` #F0F0F0 |
| axis tick `#475569` | label แกน | `--fg-2` #666 |

*(จุดที่ต้องยืนยัน: คู่สี Day/Night — เสนอ gold/navy; ทางเลือก cyan/navy)*

### 3.3 RingVisualizer (SVG hatch) — `components/common/RingVisualizer.jsx`
| ปัจจุบัน | → CMI |
|---|---|
| hatch น้ำเงิน `#EFF6FF` / `#3B82F6` (primary) | navy-tint / `--color-navy` #003B84 |
| hatch ส้ม `#FFF7ED` / `#F97316` (secondary) | cyan-tint #E5F1FF / `--color-cyan-med` #1E80BD |
| ring เส้นประ `#CBD5E1` | `--border-input` #D8D8D8 |
| label `#2563EB`/`#F97316`/`#94A3B8` | navy / cyan-med / fg-3 |

---

## 4. สถาปัตยกรรมโค้ด (Architecture)

### 4.1 โครงสร้างโฟลเดอร์ `src/ui-ux-pro-max/` (central design layer)
```
src/ui-ux-pro-max/
├── DESIGN-PLAN.md              ← เอกสารนี้
├── tokens.css                  ← @font-face + :root CSS variables (จาก CMI colors_and_type.css)
├── fonts/                      ← IBM Plex *.ttf (copy จาก design system, self-hosted)
├── assets/                     ← cmi-mark.svg, team-group-logo.svg, cmi-ai-lockup.svg
├── theme/
│   └── cmiTailwindTheme.js     ← token mapping → ใส่ใน tailwind.config.js (colors/radii/shadow/font)
├── chartTheme.js               ← CMI recharts palette + helper (stroke/fill/grid/axis/tooltip)
├── components/
│   ├── Shell.jsx               ← responsive shell หลัก
│   ├── Sidebar.jsx             ← desktop: navy sidebar จัดกลุ่ม
│   ├── TopBar.jsx              ← desktop: page title + status + วันที่/กะ
│   ├── BottomNav.jsx           ← mobile: docked bar (จองพื้นที่ + safe-area)
│   ├── MoreSheet.jsx           ← mobile: bottom sheet "เพิ่มเติม"
│   ├── StickyActionBar.jsx     ← ปุ่มบันทึก sticky เหนือ nav
│   ├── Card.jsx · StatCard.jsx · Badge.jsx · Button.jsx · SegmentedToggle.jsx
│   └── index.js
└── index.js                    ← re-export ทั้งหมด
```

### 4.2 วิธี bridge Tailwind ↔ CMI tokens
1. `tokens.css` ประกาศ `@font-face` (IBM Plex) + `:root { --color-navy: ... }` → import ใน `src/index.tsx`
2. `tailwind.config.js` ดึง `cmiTailwindTheme.js` มา extend theme → ได้ utility ใหม่:
   - `bg-navy` `bg-navy-dark` `text-cyan-med` `border-default` `bg-codeA/B/C/D`
   - `rounded-card` (8px) `rounded-input` (6px) · `shadow-card` `shadow-hover`
   - `font-sans` → IBM Plex Sans Thai · `font-mono` → IBM Plex Mono
3. แก้ `className` ใน views ทีละหน้า: `bg-blue-600` → `bg-navy`, `rounded-3xl` → `rounded-card`, `font-black` → `font-semibold` ฯลฯ

### 4.3 หลักการแก้ไฟล์
- **Generic UI primitives** (Card, Badge, Button, นำทาง) → อยู่ใน `ui-ux-pro-max/` (canonical)
- **Domain components** (RingVisualizer) → คงที่เดิม `components/common/` แค่ **recolor**
- **Views** → แก้ในที่เดิม เปลี่ยน className + นำเข้า primitives ใหม่ — **โครงสร้าง JSX/props เดิม**

---

## 5. Navigation & Shell

### 5.1 Desktop (≥ lg) — Navy Sidebar จัดกลุ่ม + Top Bar
```
ภาพรวม          → Home
บันทึกข้อมูล    → Record · Segment | Record · Grout
Dashboard & Data → Executive Dashboard | Data Log · Segment | Data Log · Grout
รายงาน          → Shift Report | Stats Report
```
- Sidebar `--color-navy-dark` #0C2C65, active item = navy #003B84 + แถบ `--status-code-a` เขียวซ้าย
- Segment/Grout ดึงออกเป็นเมนูย่อย (ทางลัด) — **wire เข้า state เดิม** (`setCurrentModule` + `setActiveTab`)
- Top bar: page title + live status badge + วันที่/กะ

### 5.2 Mobile (< lg) — Docked Bottom Nav (แก้ปัญหา nav บังเนื้อหา)
- **5 ปุ่ม**: Home · Record · Dashboard · Shift · More (เลือกจากงานหน้างานที่ทำบ่อยสุด)
- **More** → bottom sheet: Data Log · Segment/Grout, Stats Report (กลุ่ม/ชื่อตรงกับ sidebar)
- **Record / Data Log** → `SegmentedToggle [Segment | Grout]` ในหน้า (logic เดิม)

### 5.3 🔑 กติกาแก้ nav บังเนื้อหา (ปัญหาหลักที่ระบุ)
1. **Docked ชิดขอบล่าง** (ไม่ลอย) เต็มความกว้าง — content เว้น `padding-bottom = nav height + safe-area`
2. **เคารพ `env(safe-area-inset-bottom)`** (home indicator iPhone / gesture Android) ทุกหน้า
3. **ปุ่มหลัก (บันทึก) = `StickyActionBar` เหนือ nav เสมอ** — กดได้ตลอด ไม่โดนทับ
4. **คีย์บอร์ดเด้ง** → nav ซ่อนชั่วคราว ให้ input + ปุ่มบันทึกโผล่
5. *(ออปชั่น)* หน้าตาราง/รายงานยาว → nav auto-hide ตอนเลื่อนลง โผล่ตอนเลื่อนขึ้น

---

## 6. การปรับแต่งรายหน้า (Per-View Treatment)

| View | บรรทัด | เปลี่ยน (visual) | คงเดิม (logic/structure) |
|---|---|---|---|
| **App.jsx** | 190 | shell ใหม่ (sidebar/topbar/docked nav), navy, IBM Plex | state, routing, fetch, parse, liveHeaderStatus |
| **OverviewView** | 101 | hero gradient → CMI status card (navy + แถบ Code A), action cards retone | liveStatus/groutStatus logic, navigation onClick |
| **GroutRecordView** | 257 | form retone, SegmentedToggle, StickyActionBar, volume box สี CMI | inputs, ratio calc, RingVisualizer wiring, apiCall |
| **SegmentRecordView** | 262 | header `#0b8261`→green-dark, phase สี CMI, CH dark section → navy | time inputs, soil volume, key slider, apiCall |
| **GroutDashboardView** | 379 | table/filter/modal retone, badge → Code colors | pagination, filter, edit logic |
| **SegmentDashboardView** | 602 | table/filter/modal retone, chart สี (chartTheme) | filter, plan localStorage, edit |
| **ExecutiveDashboardView** | 1886 | `#2e266a`→navy, **recolor recharts ทุกตัว (chartTheme)**, cards/modals/AI modal retone | charts logic, plan config, distance calc, Gemini |
| **ReportView** | 561 | report retone, stat cards, table → zebra CMI | filter, **html2canvas export, window.print**, AI |
| **ShiftReportView** | 412 | retone, **work-time table สี CMI (คง bg-stripe semantics)** | hour-cell grid, activity bars, manpower, **export/print** |

---

## 7. 🚨 จุดเสี่ยงสูง & การรักษา (Verified จากโค้ดจริง)

### 7.1 Export — `ReportView.jsx` + `ShiftReportView.jsx`
- กลไก: `loadHtml2Canvas()` → `html2canvas(element, {onclone})` → `canvas.toDataURL("image/jpeg",0.9)` → `link.download = *.jpg` → `.click()` *(ReportView:181-209, ShiftReportView:205-233)*
- onclone แทนค่า input ด้วย text node ผ่าน `data-html2canvas-id`
- **ต้องรักษา**: id ของ container (`#shift-report-container`), โครงสร้าง DOM ที่ html2canvas จับ, `print:` classes ทุกตัว, attribute flow ของ onclone
- **เสี่ยง**: ถ้าเปลี่ยนโครง DOM / ลบ id / เปลี่ยน input เป็น component ที่ไม่ render `<input>` จริง → export พัง → **กฎ: คงโครง input เดิม แตะแค่ className**

### 7.2 Print — `window.print()` (ReportView:341, ShiftReport:198, ExecDashboard:22/801) + `@media print` ใน `globals.css`
- **ต้องรักษา**: `@media print` block ใน globals.css (A4, scale 0.88, input→dotted underline), `print:*` utility ทุกจุด, `.no-print`
- **เสี่ยง**: navy header/sidebar ต้องมี `no-print` / `print:hidden` ให้ครบ ไม่งั้นโผล่ในรายงาน

### 7.3 Work-time table — `ShiftReportView.jsx`
- `getBarColorClasses()` (187-191): `bg-stripe-blue/red/green` + `border-{blue/red/green}-500` (Main/Delay/Service)
- `bg-stripe-*` นิยามใน `globals.css` (repeating-linear-gradient)
- ตาราง `table-fixed min-w-[800px]`, hour cells, activity bar `absolute`
- **แผน**: เปลี่ยน `bg-stripe-*` เป็นโทน CMI (navy/Code-D/Code-A) แต่ **คง 3 ความหมาย** (Main/Delay/Service) + คง grid/bar positioning + `print:border-black`

### 7.4 Charts — `ExecutiveDashboardView.jsx` (+ SegmentDashboard)
- สี hardcode เป็น hex ใน props จำนวนมาก: `fill=` `stroke=` `<Cell fill=>` tick fill, SHIFT_COLORS (587), legend swatch (906-907)
- **แผน**: ย้ายสีทั้งหมดไป `chartTheme.js` (constants) แล้วอ้างอิง — **คง dataKey, แกน, ReferenceLine, logic เดิม** เปลี่ยนแค่ค่าสี (semantic-aware ตาม §3.2)

### 7.5 RingVisualizer SVG (§3.3) — recolor hatch/stroke เท่านั้น คง geometry/rotation/onClick

---

## 8. แผนดำเนินงานเป็นเฟส (Phased — verify ก่อนไปต่อทุกเฟส)

| Phase | งาน | Verify |
|---|---|---|
| **0 — Foundation** | สร้าง `ui-ux-pro-max/` layer: fonts, assets, tokens.css, cmiTailwindTheme→tailwind.config, chartTheme.js, primitives ทั้งหมด | `npm run build` ผ่าน, primitives render |
| **1 — Shell** | rewrite App.jsx ใช้ Shell (sidebar/topbar desktop + docked BottomNav/MoreSheet mobile), grouped nav | ทุก tab สลับได้, mobile nav ไม่บัง content |
| **2 — Common + Overview** | retone StatCard, RingVisualizer (recolor), OverviewView | hero/cards ถูก, navigation ทำงาน |
| **3 — Record views** | GroutRecordView, SegmentRecordView: form + SegmentedToggle + StickyActionBar | เพิ่ม/แก้ record + save ได้, RingVisualizer ทำงาน |
| **4 — Dashboards/Tables** | GroutDashboardView, SegmentDashboardView: table/filter/modal + chart (chartTheme) | table, edit modal, chart render + สีถูก |
| **5 — Executive Dashboard** | ExecutiveDashboardView: navy brand, recolor recharts ทุกตัว, modals | กราฟทุกตัว, plan modal, AI modal, print ปกติ |
| **6 — Reports + Export** | ReportView, ShiftReportView: retone + **รักษา export/print/work-time table** | **JPG export + Print PDF เทียบของเดิม pixel-by-pixel**, ตารางกะถูก |
| **7 — Polish + QA** | globals.css (bg-stripe→CMI, คง @media print), full regression | checklist §9 ครบ |

---

## 9. Verification Plan (Definition of Done)

- [ ] `npm run build` ผ่าน ไม่มี error/warning ใหม่
- [ ] เปิดแอป → ไม่มี console error, ฟอนต์ IBM Plex โหลด, สี navy
- [ ] ทุก tab (Home/Record/Dashboard/Data Log/Shift/Stats) แสดงครบ
- [ ] เพิ่ม / แก้ / ลบ Grout + Segment ได้ (props ส่งผ่านถูก)
- [ ] กราฟทุกตัว render + สีตรงตาม chartTheme + ความหมายเดิม (plan/actual/day/night/delay)
- [ ] **work-time table** (ShiftReport) ถูกต้อง: hour cells, activity bars, 3 ความหมาย, total
- [ ] **Export JPG** (Report + Shift) ได้ไฟล์ตรงเหมือนเดิม
- [ ] **Print PDF** (Report + Shift + ExecChart) จัดหน้า A4 ถูก, header navy ไม่โผล่
- [ ] **Mobile**: nav ไม่บัง content/ปุ่ม, ปุ่มบันทึกกดได้, safe-area, keyboard ไม่ทับ
- [ ] Desktop: sidebar จัดกลุ่ม + active state + Segment/Grout ทางลัดทำงาน

---

## 10. นอกขอบเขต (Out of Scope / YAGNI)

- ❌ ไม่แตะ logic / formula / API / state / GAS_URL
- ❌ ไม่เพิ่ม feature ใหม่ที่ไม่ได้ขอ
- ❌ ไม่ดึง component จาก design system ที่แอปไม่มี/ไม่เกี่ยว
- ❌ ไม่รื้อ IA ภายใน view (จัดลำดับ KPI / รื้อ section ใหม่ = ระดับ C — ไม่ทำ)
- ❌ ไม่เปลี่ยนพฤติกรรม responsive ของ "เนื้อหา" (เปลี่ยนแค่ shell/nav)

---

## 11. จุดที่รอยืนยันก่อนเริ่ม (Open questions)
1. คู่สีกราฟ Day/Night: เสนอ **gold (#B8860B) / navy (#003B84)** — OK ไหม หรือ cyan/navy?
2. เส้น "Actual" ในกราฟ: ใช้ green-dark ปกติ + แดง (Code D) เมื่อช้ากว่าแผน — OK ไหม?
3. logo บน header/sidebar: ใช้ `cmi-mark.svg` หรือ `team-group-logo.svg` หรือทั้งคู่?
