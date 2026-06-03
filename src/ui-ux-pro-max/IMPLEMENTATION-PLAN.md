# CMI AI Mark 2 Reskin — Implementation Plan (TBM1 System)

> **For agentic workers:** REQUIRED SUB-SKILL: ใช้ superpowers:subagent-driven-development (แนะนำ) หรือ superpowers:executing-plans เพื่อ implement ทีละ task. Steps ใช้ checkbox (`- [ ]`).

**Goal:** เปลี่ยน visual language ของแอป TBM1 ทั้งหมดให้เป็น CMI AI Mark 2 (TEAM Navy / IBM Plex / enterprise) โดยไม่กระทบ logic, ข้อมูล, การกรอก, กราฟ, ตาราง, export

**Architecture:** สร้าง central design layer ที่ `src/ui-ux-pro-max/` (tokens + Tailwind CDN config + chart theme + shared primitives) แล้วแก้ shell (App.jsx) + retone 8 views ในที่เดิม โดยเปลี่ยนแค่ className/CSS/wrapper — โครง DOM/props/state เดิม

**Tech Stack:** React 18 (CRA) · **Tailwind via Play CDN** (`cdn.tailwindcss.com` — theme ผ่าน inline `tailwind.config` ใน `public/index.html`) · recharts · lucide-react · GAS backend · IBM Plex (self-hosted)

---

## วิธีอ่านแผนนี้ (สำคัญ — ต่างจาก TDD ทั่วไป)

งานนี้เป็น **presentational reskin** ไม่ใช่ feature ใหม่ จึงปรับ verification:

- **ไม่มี git** — โฟลเดอร์ `Tunnel Boring App - Copy` เป็น copy ทดลองอยู่แล้ว (safety net). แทน "commit" ด้วย **Checkpoint** (build + visual + functional check)
- **ไม่ใช้ TDD red-green** — แอปไม่มี test suite สำหรับ views และการเทสต์ "div มี class navy ไหม" ไร้ค่า. verification = `npm start` รันได้ + ตรวจสายตา + ยืนยัน feature เดิมทำงาน
- **Bulk className changes** ใช้ **Token Mapping (§3 ของ DESIGN-PLAN)** เป็นกฎแปลงเชิงกล — ไม่เขียน code block ซ้ำทุกบรรทัด (5,000 บรรทัด). แผนนี้ให้ **code เต็มเฉพาะของใหม่ (Phase 0–1) + จุดเสี่ยงสูง (charts/export/stripe)** + checklist ตรวจรายเฟส

### 🔁 Checkpoint (ทำทุกจบ task ที่แก้โค้ด)
1. `npm start` → แอปรัน ไม่มี console error ใหม่
2. ตรวจ visual ตาม checklist ของ task
3. ยืนยัน feature เดิมของหน้านั้นทำงาน (กรอก/กราฟ/ตาราง/export ตามเกี่ยวข้อง)
4. *(ไม่ commit — เป็น copy)*

---

## File Structure

### สร้างใหม่ (`src/ui-ux-pro-max/`)
| ไฟล์ | หน้าที่ |
|---|---|
| `tokens.css` | copy จาก `CMI AI Mark 2 Design System/colors_and_type.css` (มี `:root` vars + `@font-face`) |
| `fonts/*.ttf` | copy IBM Plex จาก design system (self-hosted) |
| `assets/*.svg` | copy `cmi-mark.svg`, `cmi-ai-lockup.svg`, `team-group-logo.svg` |
| `chartTheme.js` | CMI recharts palette + tick/tooltip styles (single source สีกราฟ) |
| `components/Badge.jsx` | status Code A/B/C/D + generic badge |
| `components/Button.jsx` | primary/secondary/ghost button |
| `components/Card.jsx` | card surface (radius-card, shadow-card) |
| `components/StatCard.jsx` | KPI card (CMI version) |
| `components/SegmentedToggle.jsx` | `[Segment | Grout]` toggle |
| `components/Sidebar.jsx` | desktop navy sidebar (grouped) |
| `components/TopBar.jsx` | desktop content top bar |
| `components/BottomNav.jsx` | mobile docked bottom nav (safe-area, reserve space) |
| `components/MoreSheet.jsx` | mobile bottom sheet |
| `components/StickyActionBar.jsx` | ปุ่มหลัก sticky เหนือ nav (mobile) |
| `components/Shell.jsx` | responsive shell ประกอบทุกชิ้น |
| `components/index.js` · `index.js` | re-exports |

### แก้ไขในที่เดิม
| ไฟล์ | การแก้ |
|---|---|
| `public/index.html` | เพิ่ม inline `tailwind.config` (CMI theme extend) หลัง CDN script |
| `src/index.tsx` | `import "./ui-ux-pro-max/tokens.css"` |
| `src/App.jsx` | ใช้ `Shell` (sidebar/topbar/bottom nav), grouped nav — คง state/routing |
| `src/styles/globals.css` | body font Inter→IBM Plex · `bg-stripe-*`→โทน CMI (คง 3 ความหมาย) · คง `@media print` |
| `src/components/common/StatCard.jsx` | retone (หรือ re-export จาก ui-ux-pro-max) |
| `src/components/common/RingVisualizer.jsx` | recolor hatch/stroke (คง geometry) |
| `src/components/views/*.jsx` (8 ไฟล์) | retone className + import primitives + chartTheme (คงโครง/logic/export) |

---

## Phase 0 — Foundation (design layer)

### Task 0.1: Baseline — ยืนยันแอปรันก่อนแก้
**Files:** —
- [ ] **Step 1:** `cd TunnelBoringMonitoring && npm start`
- [ ] **Step 2:** เปิด browser → คลิกครบทุก tab (Home/Record/Dashboard/Data Log/Shift/Stats), ลอง export 1 ครั้ง → **จดว่าอะไรทำงาน** (baseline สำหรับเทียบหลัง reskin)
- [ ] **Step 3:** หยุด dev server

### Task 0.2: คัดลอก tokens + fonts + assets
**Files:** Create `src/ui-ux-pro-max/tokens.css`, `fonts/`, `assets/`
- [ ] **Step 1:** copy ทั้งโฟลเดอร์ `fonts/` จาก `CMI AI Mark 2 Design System/` → `src/ui-ux-pro-max/fonts/`
- [ ] **Step 2:** copy `colors_and_type.css` → `src/ui-ux-pro-max/tokens.css` (ไฟล์นี้ url ฟอนต์เป็น `fonts/...ttf` relative อยู่แล้ว → ตรงกับโครงใหม่ webpack จะ bundle ให้)
- [ ] **Step 3:** copy `assets/cmi-mark.svg`, `cmi-ai-lockup.svg`, `team-group-logo.svg` → `src/ui-ux-pro-max/assets/`

PowerShell:
```powershell
$src = "D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\CMI AI Mark 2 Design System"
$dst = "D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\TunnelBoringMonitoring\src\ui-ux-pro-max"
Copy-Item "$src\fonts" "$dst\fonts" -Recurse -Force
Copy-Item "$src\colors_and_type.css" "$dst\tokens.css" -Force
Copy-Item "$src\assets" "$dst\assets" -Recurse -Force
```
- [ ] **Checkpoint:** ไฟล์ครบใน `ui-ux-pro-max/` (tokens.css, fonts/*.ttf, assets/*.svg)

### Task 0.3: โหลด tokens.css เข้าแอป
**Files:** Modify `src/index.tsx`
- [ ] **Step 1:** เพิ่มบรรทัดแรกของ import (ก่อน `import App`):
```tsx
import "./ui-ux-pro-max/tokens.css";
```
- [ ] **Step 2:** `npm start` → ตรวจ Network tab: ฟอนต์ IBMPlex*.ttf โหลด 200, ตัวอักษรเปลี่ยนทรง (ยังไม่ต้องสวย)
- [ ] **Checkpoint:** ไม่มี error, ฟอนต์โหลด

### Task 0.4: ใส่ CMI theme เข้า Tailwind CDN config
**Files:** Modify `public/index.html`
- [ ] **Step 1:** หลัง `<script src="https://cdn.tailwindcss.com"></script>` (บรรทัด 4) เพิ่ม:
```html
<script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          navy:    { DEFAULT:'#003B84', dark:'#0C2C65', deepest:'#00246C', pressed:'#001A57' },
          cyan:    { DEFAULT:'#38A7CE', med:'#1E80BD', tint:'#E5F1FF', vtint:'#F5FAFF' },
          sgreen:  { dark:'#10463A', med:'#44C473' },
          code:    { a:'#10463A', b:'#B8860B', c:'#C8500A', d:'#B91C1C' },
          ink:     { DEFAULT:'#333333', 2:'#666666', 3:'#999999' },
          surface: { DEFAULT:'#FFFFFF', page:'#F8FAFD', alt:'#F5FAFF' },
          line:    { DEFAULT:'#E8E8E8', input:'#D8D8D8', divider:'#F0F0F0' },
        },
        borderRadius: { badge:'4px', input:'6px', card:'8px', modal:'12px' },
        boxShadow: {
          card:'0 1px 2px rgba(0,59,132,0.04)',
          hover:'0 2px 8px rgba(0,59,132,0.06)',
          modal:'0 12px 32px rgba(12,44,101,0.18)',
        },
        fontFamily: {
          sans:['"IBM Plex Sans Thai"','"IBM Plex Sans"','sans-serif'],
          mono:['"IBM Plex Mono"','Consolas','monospace'],
        },
      },
    },
  }
</script>
```
- [ ] **Step 2:** ทดสอบ utility ใหม่: เพิ่ม `<div className="bg-navy text-white rounded-card shadow-card p-4 font-sans">test</div>` ชั่วคราวใน OverviewView → ควรเห็นกล่องน้ำเงิน มุม 8px ฟอนต์ IBM Plex → ลบออก
- [ ] **Checkpoint:** `bg-navy`, `rounded-card`, `shadow-card`, `font-sans` ทำงานผ่าน CDN

> **Note (out of scope):** Play CDN เป็น dev-CDN แต่แอปนี้ใช้ใน production อยู่แล้ว — คงไว้ตามเดิม (surgical, ไม่เปลี่ยน build system). การ migrate ไป PostCSS Tailwind เป็นงานแยกในอนาคต

### Task 0.5: chartTheme.js
**Files:** Create `src/ui-ux-pro-max/chartTheme.js`
- [ ] **Step 1:** เขียน:
```js
// CMI Mark 2 — palette กลางสำหรับ recharts (semantic-aware)
export const chartColors = {
  planned:    "#003B84", // navy — เส้น/ค่าตามแผน
  actual:     "#10463A", // green-dark — ค่าจริง (ปกติ)
  actualAlert:"#B91C1C", // Code D — ค่าจริงเมื่อช้ากว่าแผน
  paid:       "#1E80BD", // cyan-med
  dayShift:   "#B8860B", // Code B (gold) — กะกลางวัน
  nightShift: "#003B84", // navy — กะกลางคืน
  temporary:  "#C0C0C0", // gray-300 — ชั่วคราว
  delay:      "#B91C1C", // Code D — ล่าช้า
  grid:       "#F0F0F0",
  axis:       "#999999",
  axisLabel:  "#666666",
  routeRamp:  ["#0C2C65", "#003B84", "#1E80BD", "#38A7CE"], // แทน purple route
};
export const SHIFT_COLORS = [chartColors.dayShift, chartColors.nightShift];
export const axisTick   = { fontSize: 10, fill: chartColors.axisLabel, fontWeight: 600 };
export const gridProps  = { strokeDasharray: "3 3", stroke: chartColors.grid };
export const tooltipStyle = {
  contentStyle: { border: "1px solid #E8E8E8", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,59,132,0.06)", fontSize: 12 },
  labelStyle:   { color: "#666", fontWeight: 600, marginBottom: 4 },
};
```
- [ ] **Checkpoint:** import ได้ ไม่มี error

### Task 0.6: Primitive — Badge
**Files:** Create `src/ui-ux-pro-max/components/Badge.jsx`
- [ ] **Step 1:**
```jsx
import React from "react";
const MAP = {
  a: "bg-code-a/10 text-code-a", b: "bg-code-b/10 text-code-b",
  c: "bg-code-c/10 text-code-c", d: "bg-code-d/10 text-code-d",
  info: "bg-cyan-tint text-cyan-med", neutral: "bg-line/40 text-ink-2",
};
export default function Badge({ code = "neutral", children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-badge text-[11px] font-semibold ${MAP[code] || MAP.neutral} ${className}`}>
      {children}
    </span>
  );
}
```
- [ ] **Checkpoint:** render `<Badge code="a">Code A</Badge>` ได้สีเขียวเข้ม

### Task 0.7: Primitives — Button, Card, StatCard, SegmentedToggle
**Files:** Create `Button.jsx`, `Card.jsx`, `StatCard.jsx`, `SegmentedToggle.jsx`
- [ ] **Step 1 — Button.jsx:**
```jsx
import React from "react";
const V = {
  primary:   "bg-navy hover:bg-navy-deepest text-white shadow-card",
  secondary: "bg-surface border border-line text-ink hover:bg-cyan-tint",
  ghost:     "text-ink-2 hover:bg-cyan-tint",
  danger:    "bg-code-d hover:opacity-90 text-white",
};
export default function Button({ variant = "primary", className = "", children, ...p }) {
  return <button {...p} className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-button text-sm font-semibold transition-colors ${V[variant]} ${className}`}>{children}</button>;
}
```
- [ ] **Step 2 — Card.jsx:**
```jsx
import React from "react";
export default function Card({ className = "", children, ...p }) {
  return <div {...p} className={`bg-surface border border-line rounded-card shadow-card ${className}`}>{children}</div>;
}
```
- [ ] **Step 3 — StatCard.jsx** (CMI version — แทน common/StatCard, props เดิม `label,value,subtext,color,icon`):
```jsx
import React from "react";
export default function StatCard({ label, value, subtext, color = "text-navy", icon: Icon }) {
  return (
    <div className="bg-surface p-4 rounded-card border border-line shadow-card relative overflow-hidden flex flex-col justify-between">
      {Icon && <div className={`absolute -right-3 -top-3 opacity-[0.06] ${color}`}><Icon size={72} /></div>}
      <div className="relative z-10">
        <div className="text-[11px] text-ink-2 uppercase font-semibold tracking-wide mb-1.5">{label}</div>
        <div className="text-2xl font-semibold text-ink tracking-tight font-mono">{value}</div>
      </div>
      {subtext && <div className="text-[11px] font-medium mt-3 pt-2 border-t border-divider text-ink-2 relative z-10">{subtext}</div>}
    </div>
  );
}
```
- [ ] **Step 4 — SegmentedToggle.jsx** (props: `value`, `onChange`, `options=[{value,label}]`):
```jsx
import React from "react";
export default function SegmentedToggle({ value, onChange, options }) {
  return (
    <div className="flex bg-surface-alt border border-line rounded-input p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`flex-1 px-4 py-2 rounded-[5px] text-xs font-semibold transition-colors ${value === o.value ? "bg-navy text-white shadow-card" : "text-ink-2 hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
```
- [ ] **Checkpoint:** ทุก primitive render ถูกต้องในหน้า test ชั่วคราว

### Task 0.8: Shell primitives — Sidebar, TopBar, BottomNav, MoreSheet, StickyActionBar
**Files:** Create `Sidebar.jsx`, `TopBar.jsx`, `BottomNav.jsx`, `MoreSheet.jsx`, `StickyActionBar.jsx`

> โครงสร้าง nav กลาง (ใช้ร่วม desktop sidebar + mobile): กำหนด array เดียวใน `Shell.jsx` แล้วส่งให้ทุกชิ้น เพื่อชื่อ/กลุ่มตรงกันทุกจอ (§5 DESIGN-PLAN)

- [ ] **Step 1 — nav model** (ใน `components/navModel.js`):
```js
import { Home, PlusCircle, LayoutDashboard, Database, Clock, FileText } from "lucide-react";
// tab = activeTab value เดิม, module = currentModule (ถ้ามี)
export const NAV_GROUPS = [
  { label: "ภาพรวม", items: [{ id:"overview", tab:"overview", label:"Home", icon:Home }] },
  { label: "บันทึกข้อมูล", items: [
    { id:"rec-seg", tab:"record", module:"segment", label:"Record · Segment", icon:PlusCircle },
    { id:"rec-grt", tab:"record", module:"grout",   label:"Record · Grout",   icon:PlusCircle },
  ]},
  { label: "Dashboard & Data", items: [
    { id:"dash", tab:"dashboard", label:"Executive Dashboard", icon:LayoutDashboard },
    { id:"log-seg", tab:"datalog", module:"segment", label:"Data Log · Segment", icon:Database },
    { id:"log-grt", tab:"datalog", module:"grout",   label:"Data Log · Grout",   icon:Database },
  ]},
  { label: "รายงาน", items: [
    { id:"shift",  tab:"shift_report", label:"Shift Report", icon:Clock },
    { id:"report", tab:"report",       label:"Stats Report", icon:FileText },
  ]},
];
// mobile bottom bar = 5 ปุ่มหลัก, ที่เหลือเข้า More
export const MOBILE_PRIMARY = ["overview","record","dashboard","shift_report"]; // + More
export const MOBILE_MORE_TABS = ["datalog","report"];
```
- [ ] **Step 2 — Sidebar.jsx:** navy-dark bg, brand (cmi-ai-lockup) ด้านบน, render `NAV_GROUPS` (group label + items), active item `bg-navy text-white` + แถบซ้าย `border-l-2 border-code-b`(เขียว Code A ใช้ `sgreen`); onClick → `onNavigate(item)`. props: `active`(tab+module), `onNavigate`, `liveStatus`. ใส่ `print:hidden`.
- [ ] **Step 3 — TopBar.jsx:** white bg, border-b line, page title (จาก active item label), live status `<Badge>`, project meta (date/shift). props: `title`, `liveStatus`, `projectInfo`. `print:hidden`.
- [ ] **Step 4 — BottomNav.jsx (docked, แก้ overlap):**
```jsx
import React from "react";
export default function BottomNav({ items, activeTab, onNavigate, onMore }) {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-navy-dark border-t border-white/10 print:hidden"
         style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex justify-around items-stretch">
        {items.map((it) => (
          <button key={it.id} onClick={() => onNavigate(it)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 min-h-[48px] text-[10px] font-semibold ${activeTab === it.tab ? "text-white" : "text-cyan-tint/70"}`}>
            <it.icon size={20} /> {it.label}
          </button>
        ))}
        <button onClick={onMore} className="flex-1 flex flex-col items-center gap-0.5 py-2.5 min-h-[48px] text-[10px] font-semibold text-cyan-tint/70">⋯ More</button>
      </div>
    </nav>
  );
}
```
> สำคัญ: `<main>` ต้องมี `pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0` เพื่อ **จองพื้นที่** ไม่ให้ nav บัง (set ใน Shell/App)
- [ ] **Step 5 — MoreSheet.jsx:** bottom sheet (fixed inset-0 z-50, backdrop `bg-navy-dark/35`, panel ล่าง `rounded-t-modal bg-surface`), render กลุ่มที่เหลือ (Data Log·Seg/Grout, Stats). props: `open`, `onClose`, `onNavigate`. respect safe-area.
- [ ] **Step 6 — StickyActionBar.jsx:**
```jsx
import React from "react";
export default function StickyActionBar({ children }) {
  return (
    <div className="lg:static fixed inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-line p-3 print:hidden"
         style={{ bottom: "calc(56px + env(safe-area-inset-bottom))" }}>
      {children}
    </div>
  );
}
```
- [ ] **Checkpoint:** แต่ละชิ้น render เดี่ยวๆ ได้ (mock props) — ยังไม่ต่อ App

### Task 0.9: Shell.jsx + index re-exports
**Files:** Create `Shell.jsx`, `components/index.js`, `index.js`
- [ ] **Step 1 — Shell.jsx:** ประกอบ: desktop `lg:flex` → `<Sidebar>` (w-60) + `<div>` (`<TopBar>` + `<main>` children); mobile → `<TopBar compact>` + `<main className="pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0">` + `<BottomNav>` + `<MoreSheet>`. props: `active`, `onNavigate`, `title`, `liveStatus`, `projectInfo`, `children`, `moreOpen`, `setMoreOpen`.
- [ ] **Step 2 — index.js:** re-export ทุก primitive + Shell + chartTheme + NAV_GROUPS
- [ ] **Checkpoint:** `npm run build` ผ่าน (ทั้ง layer compile ได้)

---

## Phase 1 — Shell integration (App.jsx)

### Task 1.1: เปลี่ยน App.jsx ใช้ Shell
**Files:** Modify `src/App.jsx`
- [ ] **Step 1:** เก็บ state/effect/fetch/parse/`liveHeaderStatus` เดิมทั้งหมด **ไม่แตะ** (บรรทัด 19–137)
- [ ] **Step 2:** เพิ่ม state `const [moreOpen, setMoreOpen] = useState(false)`
- [ ] **Step 3:** สร้าง `handleNavigate(item)` → `setActiveTab(item.tab); if(item.module) setCurrentModule(item.module); setMoreOpen(false)` (แทน logic ปุ่ม nav เดิม + module toggle)
- [ ] **Step 4:** แทน `<header>` + `<main>` + `<nav>` (บรรทัด 140–185) ด้วย `<Shell active={{tab:activeTab,module:currentModule}} onNavigate={handleNavigate} title={...} liveStatus={liveHeaderStatus} projectInfo={projectInfo} moreOpen={moreOpen} setMoreOpen={setMoreOpen}>` ครอบ block `{activeTab === ...}` เดิมทั้งหมด (บรรทัด 164–171 — **คงเดิมทุกบรรทัด**)
- [ ] **Step 5:** loading screen (131–137) retone เป็น navy/IBM Plex
- [ ] **Checkpoint:**
  - ทุก tab สลับได้ (Home/Record·Seg/Record·Grout/Dashboard/Log·Seg/Log·Grout/Shift/Stats)
  - Desktop: sidebar จัดกลุ่ม + active ถูก · Segment/Grout ทางลัดเปลี่ยน module ถูก
  - Mobile (DevTools responsive): bottom nav docked, More sheet เปิด/ปิด, **nav ไม่บัง content** (scroll ถึงล่างสุดเห็นครบ)
  - `projectInfo` editable เหมือนเดิม

---

## Phase 2 — Common + Overview

### Task 2.1: RingVisualizer recolor
**Files:** Modify `src/components/common/RingVisualizer.jsx`
- [ ] **Step 1:** เปลี่ยนค่าสี (คง geometry/rotation/onClick ทุกอย่าง):
  - `#EFF6FF`→`#E5F1FF`, `#3B82F6`→`#003B84` (primary, ทั้ง pattern/stroke/center/label `#2563EB`→`#003B84`)
  - `#FFF7ED`→`#F5FAFF`, `#F97316`→`#1E80BD` (secondary)
  - ring เส้นประ `#CBD5E1`→`#D8D8D8`, label inactive `#94A3B8`→`#999999`
- [ ] **Checkpoint:** ring แสดง primary=navy / secondary=cyan, คลิก toggle ตำแหน่งได้, rotation ตาม key ถูก

### Task 2.2: StatCard (common) → ใช้ CMI version
**Files:** Modify `src/components/common/StatCard.jsx`
- [ ] **Step 1:** แทนเนื้อใน `common/StatCard.jsx` ด้วย re-export: `export { default } from "../../ui-ux-pro-max/components/StatCard";` (props เดิม `label,value,subtext,color,icon` ใช้ได้ทันที)
- [ ] **Checkpoint:** ทุกหน้าที่ใช้ StatCard แสดงการ์ด CMI

### Task 2.3: OverviewView retone
**Files:** Modify `src/components/views/OverviewView.jsx`
- [ ] **Step 1:** hero gradient (40–66) → `Card` ขาว + แถบซ้าย Code A สีตามสถานะ (EXCAVATING=code-b, INSTALLING=sgreen, WAITING=ink-2, IDLE=navy) แทน gradient; ตัวเลข ring เป็น `font-mono`; คง `liveStatus`/`groutStatus` logic (7–36) ทุกบรรทัด
- [ ] **Step 2:** action cards 2 ใบ (68–95) → `Card` + icon box สี navy/sgreen, มุม rounded-card, คง onClick navigation
- [ ] **Checkpoint:** Home แสดงสถานะถูกตามข้อมูลจริง, กดการ์ดไป Record ถูก module

---

## Phase 3 — Record views

### Task 3.1: SegmentedToggle + StickyActionBar เข้า Record
**Files:** Modify `GroutRecordView.jsx`, `SegmentRecordView.jsx`
- [ ] **Step 1:** แทน module toggle เดิม (ที่ย้ายมาจาก header) ด้วย `<SegmentedToggle>` บนสุดของฟอร์ม (ผูก `currentModule`/`setCurrentModule` หรือ props ที่ส่งมา) — *ถ้า toggle อยู่ App header เดิม ให้คงพฤติกรรม, เพิ่ม segmented ในหน้าเป็นทางเลือก*
- [ ] **Step 2:** ปุ่ม submit เดิม → ครอบด้วย `<StickyActionBar>` บน mobile (`lg:` กลับเป็น static ในฟอร์ม). คง `onClick`/`apiCall`/validation เดิม
- [ ] **Checkpoint:** ปุ่มบันทึก mobile อยู่เหนือ nav, กดได้, ไม่โดนบัง

### Task 3.2: GroutRecordView retone
**Files:** Modify `src/components/views/GroutRecordView.jsx`
- [ ] **Step 1:** header gradient `from-blue-600..`/`from-orange-500..`(re-grout) → navy / Code C; volume box `bg-blue-50`/`bg-orange-50` → cyan-tint / code-c/10; ratio colors → sgreen/code-b/code-d; inputs `focus:border-blue-400`→`focus:border-navy`; radius rounded-3xl→rounded-card; font-black→font-semibold
- [ ] **Step 2:** คง inputs/slider/file-upload/ratio calc/RingVisualizer wiring/apiCall (ทุก logic)
- [ ] **Checkpoint:** กรอก+บันทึก Grout (รวม Re-Grout) ได้, ratio คำนวณถูก, RingVisualizer sync

### Task 3.3: SegmentRecordView retone
**Files:** Modify `src/components/views/SegmentRecordView.jsx`
- [ ] **Step 1:** header `bg-[#0b8261]`→`bg-sgreen-dark`; phase accent orange/emerald → code-b/sgreen; CH dark section `bg-slate-900`→`bg-navy-dark` (label `text-emerald-400`→`text-cyan`); soil volume box → sgreen tint; inputs focus → navy/sgreen; radius/font ตามกฎ
- [ ] **Step 2:** คง time inputs/soil volume calc/key slider/type dropdown/CH logic/apiCall
- [ ] **Checkpoint:** กรอก+บันทึก Segment ได้, soil volume คำนวณถูก, CH chevron ถูก

---

## Phase 4 — Dashboards & tables (Grout / Segment)

### Task 4.1: GroutDashboardView retone
**Files:** Modify `src/components/views/GroutDashboardView.jsx`
- [ ] **Step 1:** status card gradient `from-indigo-500..`→navy; filter bar `bg-slate-50`→surface-alt; table header/rows → navy-dark header + zebra surface-page + `hover:bg-cyan-tint`; badges (Re-Grout purple, position) → Badge code (purple→escalated `#7C2D92` หรือ code-c); modal header gradient → navy; radius/font ตามกฎ
- [ ] **Step 2:** คง pagination/filter/edit modal logic
- [ ] **Checkpoint:** ตาราง, filter (All/Last N/Daily/Monthly/Range), edit modal save ทำงาน

### Task 4.2: SegmentDashboardView retone + chart
**Files:** Modify `src/components/views/SegmentDashboardView.jsx`
- [ ] **Step 1:** table/filter/modal retone (เหมือน 4.1, accent = sgreen/teal→sgreen); left border accent orange/emerald → code-b/sgreen
- [ ] **Step 2:** **chart (ComposedChart)** → import `chartColors, axisTick, gridProps, tooltipStyle` จาก chartTheme; แทนสี: bars/lines/grid/axis ตาม §3.2 (คง dataKey/แกน/logic)
- [ ] **Checkpoint:** ตาราง, edit, plan modal (localStorage), chart render + สี CMI + ความหมายเดิม

---

## Phase 5 — Executive Dashboard (ใหญ่สุด — ระวัง)

### Task 5.1: แทนสีแบรนด์ + recolor recharts ทั้งหมด
**Files:** Modify `src/components/views/ExecutiveDashboardView.jsx`
- [ ] **Step 1:** หาแทนทุก `#2e266a` → `navy-dark`/`#0C2C65` (brand), class `bg-[#2e266a]`→`bg-navy-dark`
- [ ] **Step 2:** import chartTheme; แทนสี recharts ตามแผนที่ verified:
  - SHIFT_COLORS (587) + pie data (379–380) → `SHIFT_COLORS` จาก chartTheme; legend swatch (906–907) `bg-[#fde047]`/`bg-[#3b82f6]` → `bg-code-b`/`bg-navy`
  - Segment chart (958–962): `fill="#fde047"`→dayShift, `"#3b82f6"`→nightShift, `"#cbd5e1"`→temporary; plan `#94a3b8`→axis, planAcc `#0f172a`→planned, actualAcc `#ef4444`→actual (+ alert logic ถ้ามี)
  - Distance chart (1063,1073-74): planAcc `#8b5cf6`→planned; delay `#ec4899`/`#9b1c1c`→delay; grid `#e2e8f0`→grid; axis tick `#475569`→axisLabel
- [ ] **Step 3:** cards/modals/filters/AI modal (`from-purple-600 to-indigo-600`→navy gradient) retone; radius/font ตามกฎ
- [ ] **Checkpoint:** กราฟทุกตัว (segment, distance, shift pie) render + สี CMI + ความหมายเดิม; plan modal, AI modal, filter (daily/weekly/monthly) ทำงาน; **window.print() chart ยังออกถูก**

---

## Phase 6 — Reports & Export (รักษา export/print ให้ครบ)

### Task 6.1: ReportView retone (รักษา export)
**Files:** Modify `src/components/views/ReportView.jsx`
- [ ] **Step 1:** retone report header (`border-b-4 border-slate-900`→navy), stat cards grid (359–399)→`StatCard`/Card, tables→navy-dark header + zebra, status/pressure badges→Badge code, AI modal gradient→navy; radius/font ตามกฎ
- [ ] **Step 2:** 🚨 **ห้ามแตะ** export block (181–209): `data-html2canvas-id` flow, `loadHtml2Canvas`, `onclone`, `toDataURL`, `link.download/.click`. ห้ามเปลี่ยน `<input>` เป็น component ที่ไม่ render input จริง. คง `print:` classes ทุกตัว + ปุ่ม print (341)
- [ ] **Checkpoint:** Daily/Monthly report ถูก; **Export JPG ได้ไฟล์ตรงเหมือน baseline**; **Print PDF จัดหน้า A4 ถูก, sidebar/topbar/nav ไม่โผล่** (มี print:hidden ครบ); AI summary ทำงาน

### Task 6.2: ShiftReportView retone (รักษา work-time table + export)
**Files:** Modify `src/components/views/ShiftReportView.jsx`
- [ ] **Step 1:** retone header/meta inputs/manpower grid/result/signature; container `rounded-[2rem]`→rounded-modal; radius/font ตามกฎ; คง `print:` classes
- [ ] **Step 2:** **work-time table** (300–342): คงโครง `table-fixed min-w-[800px]`, hour cells, activity bar absolute positioning, total. แค่ retone border/bg (คง `print:border-black`)
- [ ] **Step 3:** `getBarColorClasses` (187–191): `bg-stripe-blue/red/green` คงไว้ (จะปรับสี stripe ใน globals.css ที่ Task 7.1) + border `border-blue-500`→`border-navy`, `border-red-500`→`border-code-d`, `border-green-500`→`border-sgreen-med` (**คง 3 ความหมาย** Main/Delay/Service)
- [ ] **Step 4:** 🚨 **ห้ามแตะ** export block (205–233) + `#shift-report-container` id + onclone
- [ ] **Checkpoint:** **work-time table ถูกต้อง** (hour cells, bars 3 ความหมาย, total min); manpower/result/signature ครบ; **Export JPG + Print PDF ตรง baseline**

---

## Phase 7 — Global polish & QA

### Task 7.1: globals.css
**Files:** Modify `src/styles/globals.css`
- [ ] **Step 1:** `@layer base body` font `'Inter'`→`'IBM Plex Sans Thai','IBM Plex Sans',sans-serif`, `background-color:#F8FAFC`→`#F8FAFD`
- [ ] **Step 2:** `bg-stripe-blue/red/green` (21–34): เปลี่ยน base color + stripe color เป็นโทน CMI (navy / code-d / sgreen) — คงรูปแบบ repeating-linear-gradient (Main/Delay/Service ยังแยกออกชัด)
- [ ] **Step 3:** 🚨 **คง `@media print` block ทั้งหมด** (48–97) ไม่แตะ (A4, scale 0.88, input dotted)
- [ ] **Checkpoint:** ฟอนต์ทั้งแอป IBM Plex, stripe ในตารางกะดูเป็น CMI แต่ 3 ความหมายแยกออก, print ยังถูก

### Task 7.2: Full regression QA (ตาม §9 DESIGN-PLAN)
**Files:** —
- [ ] **Step 1:** `npm run build` ผ่าน ไม่มี error/warning ใหม่
- [ ] **Step 2:** เดินครบ checklist DESIGN-PLAN §9 (ทุก tab, เพิ่ม/แก้/ลบ Grout+Segment, กราฟทุกตัว, work-time table, export JPG×2, print PDF×3, mobile nav ไม่บัง + ปุ่มบันทึก + safe-area, desktop sidebar)
- [ ] **Step 3:** เทียบกับ baseline (Task 0.1) — feature เดิมครบ
- [ ] **Checkpoint:** ผ่านทุกข้อ → reskin เสร็จ

---

## Self-Review (ผู้เขียนแผนตรวจเอง)
- **Spec coverage:** ทุก § ของ DESIGN-PLAN มี task รองรับ (tokens→0.2-0.4, nav→0.8/1.1, mapping→2-6, charts→4.2/5.1, export→6, stripe→6.2/7.1, verify→7.2) ✓
- **Placeholder scan:** ไม่มี TBD/TODO; bulk retone ระบุกฎ + ไฟล์ + บรรทัดเสี่ยงชัดเจน ✓
- **Type/name consistency:** primitive props (Badge.code, SegmentedToggle.value/options, StatCard.label/value/subtext/color/icon) ใช้ตรงกันทุก task; chartTheme exports (chartColors/SHIFT_COLORS/axisTick/gridProps/tooltipStyle) อ้างตรงกัน ✓
- **เสี่ยงสูง** (export/charts/work-time table) มี task เฉพาะ + 🚨 ห้ามแตะ marker ✓
