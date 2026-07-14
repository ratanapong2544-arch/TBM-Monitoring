# Rebrand: "Tunnel Monitoring System" + โลโก้หัวเจาะ

**วันที่:** 2026-07-14
**ประเภท:** Branding / UI (ไม่แตะ logic/data)

## บริบท & เป้าหมาย

แอพ Tunnel Boring Monitoring เดิมแสดงแบรนด์เป็น wordmark ผูกกับเครื่องเดียว
(`{machine} System` → "TBM1 System") และ browser tab hardcode "TBM1 Construction
Monitoring" ทั้งที่ตอนนี้รองรับหลายเครื่องแล้ว (`MACHINES = ["TBM1", "TBM2"]`
ใน `utils/dailyReports.js`) และมีปุ่มสลับเครื่องอยู่แล้ว

โลโก้ปัจจุบันเป็นไอคอน `<Layers>` (lucide) generic ไม่สื่อถึงงานขุดเจาะอุโมงค์

**เป้าหมาย 2 ข้อ (ตามที่ user ร้องขอ):**
1. เปลี่ยนชื่อแอพให้เป็นชื่อ platform ที่ไม่ผูกกับเครื่องเดียว
2. เพิ่มโลโก้ไอคอนรูปหัวเจาะ (TBM cutter head) แทนไอคอน generic

## การตัดสินใจ (ยืนยันกับ user แล้ว)

| หัวข้อ | ค่า |
|---|---|
| ชื่อแอพ (wordmark) | **"Tunnel Monitoring System"** (คงที่ ไม่เปลี่ยนตามเครื่อง) |
| Subtitle ใต้ชื่อ | **"อุโมงค์ระบายน้ำคลองเปรมประชากร"** (ย่อจากชื่อโครงการเต็มใน `ShiftReportView.jsx:283`) |
| Browser tab title | **"Tunnel Monitoring System"** |
| โลโก้ | หัวเจาะ **แบบ D (EPB สมจริง)** — วงนอก + teeth รอบขอบ + ซี่ในสี cyan + cutter discs + center hub |

**หลักสำคัญ:** เครื่องที่กำลังดู (TBM1/TBM2) ยังเห็นได้จากปุ่มสลับ (`MachineSwitcher`)
บน TopBar ซึ่ง `Shell.jsx` เรนเดอร์เสมอทั้ง desktop และ mobile — verified. การถอดชื่อ
เครื่องออกจาก wordmark จึงไม่ทำให้ผู้ใช้สับสนว่ากำลังดูเครื่องไหน

## องค์ประกอบใหม่: `CutterHeadMark.jsx`

Component SVG หัวเจาะ (แบบ D) วางไว้ที่ `src/ui-ux-pro-max/components/CutterHeadMark.jsx`
ใช้ซ้ำได้ทุกที่ (sidebar, machine switcher, ที่อื่นในอนาคต)

**Props:**
- `size` (number, default 20) — ขนาด px
- `tone` (`"brand"` | `"mono"`, default `"brand"`)
  - `"brand"` = 2 สี: teeth/วงนอกสีขาว + ซี่/discs/center สี cyan (`#38A7CE`) — ใช้บนพื้น navy
  - `"mono"` = ใช้ `currentColor` ล้วน — ยืดหยุ่นตามสี parent (เช่น การ์ดสลับเครื่องตอน inactive = navy line บนพื้นขาว)
- `className` (string, optional) — pass-through

**โครงสร้าง SVG** (viewBox `0 0 48 48`, center 24,24):
- วงนอก circle r≈22 (teeth ticks 12 ซี่รอบขอบ — วงล้อ cutter)
- ซี่ (spokes) 6 เส้นจาก center ถึง r≈20
- cutter discs 6 จุด (circle เล็ก) ที่ radius กลาง
- center hub circle เล็ก
- ใช้ `<g transform="rotate(...)">` ทำ radial symmetry

## การเปลี่ยนแปลงรายไฟล์

### 1. `src/ui-ux-pro-max/components/Sidebar.jsx`
- แทน `<Layers size={18}/>` ในกล่อง navy ด้วย `<CutterHeadMark size={20} tone="brand"/>`
- wordmark: `{(machine || "TBM")} System` → `Tunnel Monitoring System` (คงที่)
- subtitle: `Tunnel Monitoring` → `อุโมงค์ระบายน้ำคลองเปรมประชากร`
- prop `machine` ไม่ใช้ใน brand block แล้ว (ยังส่งเข้ามาได้ ไม่ลบ signature เพื่อไม่ให้กระทบ caller — surgical)
- ลบ import `Layers` ถ้าไม่มีที่ใช้อื่นในไฟล์

### 2. `src/ui-ux-pro-max/components/MachineSwitcher.jsx`
- แทน `<Layers>` (2 จุด: size lg + reference) ด้วย `<CutterHeadMark>`
  - การ์ด `lg` active (พื้น navy) → `tone="brand"`
  - การ์ด `lg` inactive (พื้นขาว) → `tone="mono"` (สืบสี navy จาก `text-navy`)
- ลบ import `Layers` ถ้าไม่เหลือที่ใช้

### 3. `src/ui-ux-pro-max/components/TopBar.jsx`
- fallback title `${machine || "TBM"} Monitoring` → คงไว้ (แสดงเฉพาะเมื่อไม่มี `title` prop);
  ไม่จำเป็นต้องแก้เพราะ view ส่ง `title` มาจริงเสมอ — **ไม่แตะ** เว้นแต่ตรวจพบว่า fallback โผล่จริง
- โลโก้ TEAM GROUP (มุมซ้ายมือถือ) — คงเดิม

### 4. `public/index.html`
- `<title>TBM1 Construction Monitoring</title>` → `<title>Tunnel Monitoring System</title>`
- `<link rel="shortcut icon" href="%PUBLIC_URL%/favicon.ico" />`
  → `<link rel="icon" href="%PUBLIC_URL%/favicon.svg" />` (favicon.ico เดิมไม่มีอยู่จริง = 404)

### 5. `public/favicon.svg` (ไฟล์ใหม่)
- หัวเจาะแบบ D เวอร์ชันปรับให้อ่านออกที่ 16px: teeth น้อยลง (8) + เส้นหนาขึ้น
- พื้นกรอบสี่เหลี่ยมมน navy (`#0C2C65`), หัวเจาะ white + cyan
- viewBox `0 0 64 64`

### 6. `public/manifest.json` (ไฟล์ใหม่ — เดิม 404)
```json
{
  "short_name": "Tunnel Monitor",
  "name": "Tunnel Monitoring System",
  "icons": [{ "src": "favicon.svg", "type": "image/svg+xml", "sizes": "any" }],
  "start_url": ".",
  "display": "standalone",
  "theme_color": "#0C2C65",
  "background_color": "#003B84"
}
```

## Non-goals (ไม่แตะ)

- Logic / data / GAS backend / charts / formula / export — ไม่ยุ่งทั้งหมด
- โลโก้เครดิต "Developed by TEAM GROUP" (ล่าง sidebar + มุมมือถือ) — คงเดิม
- machine registry `MACHINES` — คงเดิม (ยังใช้ per-machine)
- เอกสาร plan/design เดิม (`DESIGN-PLAN.md`, `IMPLEMENTATION-PLAN.md`, `CLAUDE.md`) ที่มีคำว่า
  "TBM1 System" — เป็นเอกสารประวัติ ไม่ใช่ UI ไม่แก้

## แผน Verify

1. `npm test` (jest) ผ่านทั้งหมด — ยืนยันไม่มี component ไหนพังจากการถอด `Layers` / เปลี่ยน prop
2. รันแอพ (`preview_start` → dev server) แล้วตรวจด้วย browser tools:
   - หัว sidebar (desktop): โลโก้หัวเจาะ + "Tunnel Monitoring System" + subtitle โครงการ
   - browser tab: title + favicon หัวเจาะ
   - สลับ TBM1/TBM2 บน TopBar → เครื่องเปลี่ยนถูก, wordmark คงที่
   - การ์ดสลับเครื่อง (หน้า Home, `MachineSwitcher lg`): ไอคอนหัวเจาะ active/inactive อ่านออก
3. ตรวจ contrast: หัวเจาะ tone brand บนพื้น navy ต้องสว่างอ่านออก (light-on-dark ตาม branding rule)
4. Responsive: mobile + desktop, dark/light ของ browser tab

## หมายเหตุ deploy

Repo จริง = subfolder `TunnelBoringMonitoring/.git` (remote `ratanapong2544-arch/TBM-Monitoring`
= prod, Vercel auto-deploy เมื่อ push `main`). Deploy ผ่าน worktree จาก `origin/main` ตาม
convention เดิม — ไม่ push จากโฟลเดอร์พี่น้อง, ไม่ commit `build/`
