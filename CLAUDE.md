# Tunnel Boring Monitoring (TBM1 System)

> Real-time monitoring app สำหรับ TBM (Tunnel Boring Machine) — Grout records, Segment records, Shift report, Dashboards React 18 (CRA) + Tailwind + GAS backend

## Stack

- **Framework:** React 18 (Create React App)
- **Styling:** Tailwind CSS via `className` + custom `globals.css`
- **Icons:** `lucide-react`
- **Charts:** `recharts`
- **Backend:** Google Apps Script (GAS) ผ่าน `fetch` API
- **Type:** mixed JavaScript + TypeScript (`App.d.ts` definitions)

## Status

⚠ **อยู่ระหว่าง refactor** — ดู `implementation_plan.md` ที่ root parent (`D:\TEAM\Knowlegh\App\Tunnel Boring App\`)

`src/App.jsx` ปัจจุบัน ~2,890 บรรทัด — รวมทุกอย่างไว้ที่เดียว แผนคือแยกเป็น `components/` + `utils/` + `views/`

## โครงสร้างที่ต้องการ (target)

```
src/
├── App.jsx                ← state + view router (เล็กลง)
├── components/
│   ├── common/
│   │   ├── StatCard.jsx
│   │   ├── RingSegment.jsx
│   │   └── RingVisualizer.jsx
│   └── views/
│       ├── OverviewView.jsx
│       ├── GroutRecordView.jsx
│       ├── SegmentRecordView.jsx
│       ├── GroutDashboardView.jsx
│       ├── SegmentDashboardView.jsx
│       ├── ReportView.jsx
│       └── ShiftReportView.jsx
├── utils/
│   ├── constants.js
│   ├── formatters.js
│   ├── helpers.js
│   └── api.js
└── styles/globals.css
```

## Conventions

- **State หลัก** อยู่ใน `App.jsx` (page routing + global state)
- **Common components** = ใช้ซ้ำหลาย view (StatCard, RingSegment, RingVisualizer)
- **Views** = หน้าหลักแต่ละแท็บ
- **Utils** = pure functions (formatters, helpers, API calls)
- **API ผ่าน fetch ไป GAS** — endpoint URL ใน `utils/api.js` (after refactor)
- **Tailwind utility-first** — หลีกเลี่ยง custom CSS เว้นแต่จำเป็น (`globals.css` เป็น overflow)

## Domain constraints (TBM monitoring data)

- **Ring number** เป็น integer sequential — ห้าม skip / duplicate
- **Grout volume, pressure, ring chainage (CH)** เป็นตัวเลข engineering — ห้าม hallucinate
- **Time/date stamps** ใช้ Asia/Bangkok timezone
- **Segment records** ต้องอ้างอิงกับ Ring number ที่มีจริง
- **K-type (key type)** ของ segment (K1-K10) ต้องตรงตาม TBM design

## Skill folder

`src/../skill/` (ใน TunnelBoringMonitoring) — SOP เฉพาะถ้ามี ใช้อ้างอิงก่อน implement feature ใหม่

## Output format

- Web app บน browser (`npm start`)
- Build artifact ใน `build/`
- Reports ส่งออกเป็น PDF / Excel (ผ่าน utility functions)

## ห้าม

- ห้าม commit changes ที่ break refactor plan — ดู `implementation_plan.md` ก่อนเพิ่มไฟล์
- ห้าม hardcode API endpoint ใน component — ต้องผ่าน `utils/api.js`
- ห้ามใส่ secret/API key ใน source — ใช้ env

## Inherits

ดู `~/.claude/CLAUDE.md` สำหรับ Identity + Layer 2 Rules (Adaptable Code Quality สำคัญใน refactor นี้) + UI Aesthetics
