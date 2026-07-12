# Instrument Rebuild — Full-Fidelity (match original tunnel-monitoring)

> **For agentic workers:** ใช้ superpowers:subagent-driven-development. Steps checkbox `- [ ]`.
> **บริบท:** โมดูล instrument รอบแรก port แบบ "แกนหลัก" (simplify) — **ผิด**. งานนี้ rebuild UI+logic ให้เหมือน `tunnel-monitoring` เดิม. Feature รอบแรก merged main แล้ว (18c02fc) — งานนี้ทับ/ขยายของเดิม.

**Goal:** ทำ instrument report viewer + location detail + dashboard + measurement logic ให้ **เหมือน tunnel-monitoring เดิม** (layout/features/logic ครบ)

**Decisions (ยืนยันกับ user 2026-07-12):**
- **ธีม = navy (CMI Mark 2) ของ TBM app** — คงไว้ (ของเดิมจริงเป็น slate/sky+glassmorphism แต่ user เลือกคง navy; แปลง slate/sky → navy tokens: `surface/surface-alt/navy/navy-dark/ink/ink-2/ink-3/line/cyan-tint`, badge `code-a`(เขียว)/`b`(ทอง)/`c`(ส้ม)/`d`(แดง), status colors alert#22c55e/alarm#eab308/action#dc2626 คงเดิม)
- **Write เบา:** mark วาระ (done/N-A/cancel + เลือกวันที่) = **มี** (modal); admin CRUD (เพิ่ม/ลบ/แก้เครื่อง, ลากแก้พิกัด blueprint) = **ตัด** (ผ่าน Claude skill/seed)
- ข้อมูลคง model ปัจจุบัน (dynamic per-location: readings[].profileJson / thresholds[] / schedules[] บน Sheets) — ไม่กลับไป preset ก้อนเดียว
- **ห้าม simplify อีก** — default fidelity สูง; ถ้าจะตัดอะไรต้องถาม

## Source of truth (ของเดิม — อ่าน+port จากนี่)
`D:\TEAM\Knowlegh\App\Instument Monitoring\tunnel-monitoring\src\`
- `components/location/reports/` — ReportTabs, {Inclinometer,Extensometer,Piezometer,SurfaceSettlement}Report(+Group), shared/{ReportShell,ChartFrame,RawDataTable,SummaryStats,TabBar,chartUtils}
- `app/location/[id]/LocationDetailClient.tsx` (1168 บรรทัด — timeline/installation/blueprint/modals)
- `app/page.tsx` + `components/dashboard/DataGrid.tsx` (compliance dashboard)
- `app/actions.ts` (markMeasurementDone cascade, markMeasurementNA, cancelMeasurement, getEffectiveLongTermTargetDate)

## Target (ที่ต้องแก้/สร้าง)
`D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\TunnelBoringMonitoring\src\`

## Global Constraints
- navy theme tokens (public/index.html) · reuse chartTheme/utils · recharts v3 · CRA jest
- GAS = `../gas-live/Code.js` (clasp, deployed @17) — ถ้าเพิ่ม action/field ต้อง node -c + user re-deploy
- data model: readings มี `tbmChainage` ต่อวันที่ (มีแล้ว), profileJson object-shape `{points,_thresholds}` (parseProfile/parseThresholds)
- commit `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; jest ต้องเขียว; build clean; classifier intermittent → retry Bash

---

## Gap Summary (จาก gap analysis 2026-07-12 — อ้างอิงเต็ม)

### D. Logic (ทำก่อน — มี bug จริง)
- 🐞 `instrumentSchedule.js longTermTargetDate` อ่าน `sched.triggerMeasuredAt` ที่**ไม่มีในdata** → LONG_TERM ค้าง pending ตลอด. แก้: `scheduleStatus` อ่าน `sched.targetDate` (มีใน INST_SC_HEADERS) แทน
- ขาด **cascade**: mark DISTANCE ครบทุกตัวที่ offset → set LONG_TERM `targetDate = completion + longTermDays` (port `markMeasurementDone` จาก actions.ts) → persist ผ่าน saveInstSchedule
- ขาด: `markMeasurementNA` (isMeasured=true, notes="N/A", measuredAt=null), `cancelMeasurement` (reset), เลือก/แก้วันที่วัด
- ขาด: `approachingIndex` (≤50m), `isPassed` (tbm≤node.tbmChainage), `isTbmHere`, grouping (offset ลบ→บวก, คง dup 0 เฉพาะ SHAFT), `getEffectiveLongTermTargetDate` (read-side fallback)
- ✅ เก็บได้: distanceDue direction, classifyStatus/threshold

### A. Report viewer
- สร้าง shared ที่ขาด: **ReportShell** (header card: แถบสีชนิด+typeLabel+code+stat trio Date/TBM Station/Ring+amber maxLine), **SummaryStats** (Initial/Latest/Max/Min ต่อ series + จุดสี), **TabBar** (primary icon + secondary sub-tabs)
- InstrumentReportTabs: ReportHeader card (locationName/sourceFile/Report Date/Cover STA/Instrument STA/pill TBM STA+Ring) + primary TabBar icon (Activity/Layers/Droplets/MapPin)
- **INC:** A/B sub-tabs (secondary), Time History dual-axis (เส้นต่อ highlightedDepths + แกนขวา TBM Station + station overlay dashed + time X tick~10วัน เอียง−45° + fixed domain −30..30/8100..8400), Depth Profile overlay **ทุกวันที่ 17 เส้น** สีไล่วันที่ h=900 (X −50..50 tick5 / Y depth 0..35 tick1), SummaryStats by depth
- **EXT:** Time History dual-axis + station overlay + fixed −30..30, SummaryStats by ring (มี latest profile+threshold แล้ว)
- **PI:** 3-sensor secondary sub-tabs (ของเดิม PiezometerGroupReport), SummaryStats 3 series (มี pressure/water+band 6 เส้นแล้ว)
- **SS:** 2-group sub-tabs (01-04/05-08), Time History dual-axis+station overlay (threshold −only), Settlement Profile X=ตำแหน่ง fixed, SummaryStats
- cross-cutting: แกนขวา TBM Station + station overlay (dashed #475569→navy), time-based X (parseDateToMs/weeklyTickTimestamps มีใน chartUtils แล้ว), fixed domains, profile overlay ทุกวันที่, date-gradient palette (เดิม hardcode per-date; คง dynamic ได้ถ้าใกล้เคียง)

### B. Location detail (ใหญ่สุด — 37 vs 1168 บรรทัด)
- **Measurement Schedule timeline** แนวนอน: node group ตาม DISTANCE offset (ลบ→บวก), สถานะ node (measured เขียว/skipped slate+Ban/pending rose pulse/**approaching amber**/future เทา), **TBM marker** (ป้าย"TBM"เด้ง), approachingIndex, ปุ่มย่อย SURFACE/DEEP (SRF/DEP), ป้ายวันวัด, คลิก→SchedReportModal
- **Long Term timeline** cards (side priority L/FINAL/INIT + days): Due/Checked/Skipped/Wait-trigger + ปุ่มวัด
- **Installation Status panel** (ซ้าย): progress bar installed/total, legend, list เครื่อง (icon ชนิด+badge สถานะ+icon รูป), คลิก→InstReportModal *(read-only ตาม write-light: แสดงสถานะ+รูป; ไม่แก้ในแอป — หรือ mark installed เบา)*
- แท็บ **BLUEPRINT/CHART** (ขวา)
- **BlueprintPane เต็ม:** banner (INSTRUMENT PLAN/Ref STA/Install STA/Page), **marker รูปทรงตามชนิด** (วงกลม INC/สี่เหลี่ยม EXT/สามเหลี่ยม PI/กากบาท SS), **photo callout** (สถานะไทย+วันติดตั้ง+รูป+เส้นโยง), **legend** — **ตัด Edit Positions mode** (admin, write-light)
- **modals:** SchedReportModal (done/N-A/cancel+date) = **ทำ**; InstReportModal (แสดงสถานะติดตั้ง+รูป) = แสดง/เบา; ManageInstrumentsModal = **ตัด**

### C. Dashboard (คนละแนวคิด — rebuild)
- Header: title gradient + subtitle โครงการ + TBM Position badge (STA+Ring)
- **5 compliance cards:** TBM Chainage / Upcoming Nodes(≤50m) / Action Required(pending, pulse) / Meas.Progress(measured/total%) / Inst.Installation(installed/total%)
- **DataGrid:** toolbar (filter pills ชนิด location + sort ใกล้TBM/chainage + search) + **LocationCard ต่อจุด** (badge REF/STA, type, location status NOT_ACTIVE/SCHEDULED/ACTIVE/COMPLETED, TBM distance+approaching, progress bar, **timeline เดียวกับ location detail**, long-term cards, instrument mini-list) + SchedConfirmModal
- *(BlueprintViewer/TbmAutoSync เดิมไม่ถูก import — ข้าม; TBM sync ใช้ machineProgress อยู่แล้ว)*

### E. Style
คง navy — แปลง slate/sky/glass ของเดิม → navy tokens ทุก view

---

## Phases (subagent-driven; ลำดับ D→A→B→C)

### Phase R1 — Logic (แก้ bug + port measurement logic เต็ม)
- **Files:** `src/utils/instrumentSchedule.js` (rewrite), `src/utils/instrumentSchedule.test.js`, `src/App.jsx` (handleMarkInstSchedule cascade), อาจ `../gas-live/Code.js` (ถ้า saveInstSchedule ต้องรับ cascade batch — น่าจะไม่ ใช้ upsert ต่อ row)
- port จาก `tunnel-monitoring/src/app/actions.ts` + `page.tsx getEffectiveLongTermTargetDate`
- Tasks (TDD): (1) fix `scheduleStatus` อ่าน targetDate + `longTermTargetDate` จาก targetDate/effective calc (2) `markMeasurementDone` cascade (DISTANCE offset ครบ → LONG_TERM targetDate) (3) markNA/cancel (4) approachingIndex/isPassed/isTbmHere/grouping helpers (5) getEffectiveLongTermTargetDate. เขียน test ครบ (all-nodata, cascade, approaching)
- ⚠ ตรวจ: worstStatus/nodata (มีแล้ว) ไม่ break

### Phase R2 — Report viewer (navy, full fidelity)
- **Files:** สร้าง `src/components/instrument/reports/shared/{ReportShell,SummaryStats,TabBar}.jsx`; rewrite 4 reports + InstrumentReportTabs; เสริม chartUtils (station overlay, fixed domains, date palette)
- port จาก `reports/*.tsx` — navy reskin. ครบ: sub-tabs, dual-axis+station overlay, time X, fixed domains, profile overlay ทุกวันที่, SummaryStats, ReportShell
- verify: build + smoke 8+300 (4 tabs + sub-tabs + summary + station overlay แสดง)

### Phase R3 — Location detail (navy, full, write-light)
- **Files:** rewrite `src/components/views/InstrumentLocationView.jsx`; rewrite `src/components/instrument/BlueprintPlot.jsx` (banner/รูปทรง/callout/legend, ไม่มี edit); สร้าง `SchedReportModal.jsx` (done/N-A/cancel+date); `InstReportModal.jsx` (แสดงสถานะ+รูป, เบา); timeline component
- port จาก LocationDetailClient.tsx — navy, **ตัด edit-coords + ManageInstruments**
- verify: build + smoke (timeline + TBM marker + long-term + installation panel + Blueprint/Chart tabs + mark modal)

### Phase R4 — Dashboard (navy, compliance)
- **Files:** rewrite `src/components/views/InstrumentDashboardView.jsx`; สร้าง DataGrid-equiv (filter/sort/search + LocationCard + SchedConfirmModal)
- port จาก page.tsx + DataGrid.tsx — navy
- verify: build + smoke (compliance cards + LocationCard timeline + filter/sort/search)

### Phase R5 — Final verify + merge
- full jest + build + smoke ทุก view + whole-branch review (opus) + finishing-branch

## Data prerequisites (เช็คก่อน R2)
- readings 8+300 มี tbmChainage ต่อวันที่ (station overlay) ✅ (179 readings มี) + profile overlay ต้องมี readings หลายวัน (17 วัน 8+300) ✅
- ถ้า field ขาดสำหรับ fidelity (เช่น sourceFile, coverStationLabel) → เพิ่มตอน migrate/skill

## Notes
- gap analysis เต็มอยู่ใน session transcript 2026-07-12 (chapter "Rebuild to match original")
- รอบแรก (simplified) commits: navModel/App wiring/utils เก็บได้ (foundation); report viewer + location + dashboard + schedule logic = rewrite
