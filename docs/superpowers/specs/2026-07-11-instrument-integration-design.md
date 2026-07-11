# Instrument Monitoring → TBM Monitoring — Integration Design

- **วันที่:** 2026-07-11
- **สถานะ:** Design approved (รอ user review ก่อนทำ implementation plan)
- **ขอบเขต:** รวมระบบรายงานการตรวจวัด Instrument (settlement/inclinometer/piezometer/extensometer) เข้าเป็นโมดูลใหม่ในแอป TBM Monitoring โดย redesign + refactor
- **Repo ปลายทาง:** `TunnelBoringMonitoring/` (React CRA) · backend `../gas-live/Code.js` (clasp)

---

## 1. บริบท & เป้าหมาย

โครงการอุโมงค์ระบายน้ำคลองเปรมประชากรมีระบบตรวจวัดพฤติกรรมดิน/โครงสร้างรอบแนวอุโมงค์ (I&M) โดยผู้รับเหมาย่อย LJT ส่งรายงานเป็น **PDF รายวัน** ปัจจุบันข้อมูลนี้อยู่ในแอปแยก (`Instument Monitoring/tunnel-monitoring/` — Next.js 16 + Prisma + PostgreSQL) ที่ทำเสร็จบางส่วน (report charts location เดียว, `Reading` table ยังว่าง)

**เป้าหมาย:** ยกแก่นของระบบ instrument เข้าเป็นโมดูลใน **แอป TBM** (บ้านหลักที่ deploy จริง + ใช้งานประจำ) ให้ผู้ใช้เห็นสถานะเครื่องมือวัดควบคู่ความคืบหน้า TBM ในระบบเดียว โดย **การนำเข้าข้อมูลทำผ่าน Claude Code session** (ผู้ใช้ส่ง PDF → Claude สกัด → review ในแชท → เขียนเข้า Sheets)

**ใครใช้:** วิศวกรสนาม/QC (ดูว่าต้องตรวจจุดไหนเมื่อ TBM ถึงระยะใด, จุดไหนเกินเกณฑ์) และผู้ควบคุมงาน (ภาพรวม + viewer link สำหรับเจ้าของงาน)

---

## 2. การตัดสินใจหลัก (ยืนยันแล้ว)

| # | ประเด็น | ตัดสิน |
|---|---------|--------|
| 1 | บ้านหลัก | แอป TBM (React CRA + GAS + Google Sheets) — instrument = โมดูลใหม่ |
| 2 | Capabilities | ครบ 4: report viewer · dashboard+alert · schedule · blueprint |
| 3 | PDF ingestion | ผ่าน Claude session (skill) → review ในแชท → เขียน Sheets (ไม่ build ในแอป) |
| 4 | Write ในแอป | แสดง + แก้มือเบาๆ (tick วาระ · แก้ค่าพิมพ์ผิด · note) |
| 5 | Data scope | migrate seed ทั้งหมด 29 location / **245 instrument** (INC 22·EXT 19·PIE 12·SET 192) / ~731 schedule |
| 6 | Threshold | 2 ชั้น: per-type default (จาก DB) + per-instrument override (shop drawing, กรอกยืนยัน) · report ± ฝังใน profileJson |
| 7 | Report viewer | port **แกนหลัก**: Time History + Profile + threshold + Raw table (ตัด Summary/sub-tab ซ้ำ) |
| ① | Scoping | project-wide (sheet เดียว ไม่ split `_TBM2`) — instrument ผูก chainage ไม่ผูกเครื่อง |
| ② | ตำแหน่ง TBM | ใช้ chainage จากแอป TBM เอง (machineProgress/route) — ตัด external EWSN sync |
| ③ | Design | ธีม navy CMI Mark 2 ของ TBM · คงสีสถานะ Alert=เขียว/Alarm=เหลือง/Action=แดง |

---

## 3. สถาปัตยกรรม & Data Flow

เพิ่ม **nav group ที่ 6** ใน `src/ui-ux-pro-max/components/navModel.js` = "เครื่องมือวัด / Instrument" + route ใน `src/App.jsx` แบบเดียวกับฟีเจอร์ `head_level` — ไม่แตะ flow เดิม

```
เขียน:  PDF ─▶ Claude session (skill) ─extract─▶ review ในแชท ─ยืนยัน─▶ apiCall ─▶ Sheets
        แก้มือเบาๆ (tick/แก้ค่า/note) ─▶ apiCall ─▶ Sheets
อ่าน:   Sheets ─getData(machine)─▶ App state ─▶ 3 views (+ viewer mode ?view=1)
```

**Chainage adapter (ต้องทำจริง):** วาระ DISTANCE trigger เมื่อ TBM ถึง chainage หนึ่ง — instrument ใช้ STA (เช่น 8+300 = 8300 m) แต่แอป TBM ติดตามเป็น ring/ระยะตาม route ต้องมี util แปลง `ring/ระยะ (per machine) → STA chainage` โดยอิง `routeConfig`/`ROUTE_TOTAL` ที่มีอยู่ ตำแหน่งปัจจุบัน = max chainage ของ TBM1, TBM2

---

## 4. Data Model — Google Sheets (5 ตาราง, prefix `Inst_`, project-wide)

สร้างแบบ **lazy** ตอน save ครั้งแรก (`ensureSheet_`/`ensureHeaders_`, additive/idempotent) ไม่กระทบ sheet เดิมของ TBM

### `Inst_Locations` (29 แถว)
`id · name · type · chainage · actualChainage · note`
type = `SHAFT | BRIDGE | ABOVE_TUNNEL | SETTLEMENT_ONLY` · actualChainage มีจริงแค่ 8+300 (=8360) ที่เหลือว่าง · **blueprint อยู่บน instrument ไม่ใช่ location**

### `Inst_Instruments` (245 แถว)
`id · locationId · code · type · blueprintPage · blueprintX · blueprintY · installStatus · installedAt · installPhotoUrl · note`
type = `INCLINOMETER | EXTENSOMETER | PIEZOMETER | SETTLEMENT_POINT` · code = physical tag จริง (P6379, P6352-L3) · blueprintX/Y = % (0-100) · installStatus seed = PENDING ทุกตัว · settlement = 192 แถว (แตก ~8 จุด/location)

### `Inst_Thresholds` (2 ชั้น)
`id · scope · key · alert · alarm · action · unit · source · note`
- **default (per-type, 4 แถวจาก DB):** INC 18/20/22 · EXT 20/25/30 · PIE 50/75/100 · SET 15/20/25 (single-sided) · scope=`type`, key=ประเภท
- **override (per-instrument):** เพิ่มแถว scope=`instrument`, key=instrumentId เมื่อมีค่า shop drawing จริง (กรอกยืนยัน)
- **report ±สมมาตร (±15/17/20) + piezo upper/lower bands** ของ 8+300 → **ไม่เก็บที่นี่** แต่ฝังใน `profileJson` (ตามต้นทาง preset)

### `Inst_Readings` ⭐ (time-series — 1 แถว = การวัด 1 ครั้ง/1 เครื่อง)
`id · instrumentId · date · seq · tbmChainage · valuePrimary · valueSecondary · profileJson · maxValue · sourcePdf · enteredBy · note`
- **point (SET/PIE):** `valuePrimary` = ค่า · PIE: `valueSecondary` = water level
- **profile (INC/EXT):** `profileJson` = `[{depth, a, b}, …]` (parse ตอน read) · `maxValue` = ค่าสูงสุดสำหรับ dashboard
- `seq` = ครั้งที่ N · `tbmChainage` = ตำแหน่ง TBM ณ วันวัด · `enteredBy` = `claude | manual`
- **alert status ไม่ freeze ลงชีต** — คำนวณฝั่ง client เทียบ threshold ตอนแสดง (threshold แก้ → สีอัปเดตเอง)

### `Inst_Schedules` (~731 แถว)
`id · locationId · scheduleType · instrumentGroup · distanceOffset · tbmChainage · longTermLabel · longTermDays · triggerOffset · targetDate · isMeasured · measuredAt · measuredBy · photoUrl · notes`
- scheduleType = `DISTANCE | LONG_TERM` · instrumentGroup = `SURFACE | DEEP | ALL`
- **DISTANCE:** trigger เมื่อ TBM chainage ถึง `tbmChainage` (= actualChainage/chainage − distanceOffset) · seed `isMeasured=false` ทุกแถว
- **LONG_TERM:** longTermLabel เช่น "Init 1W" · longTermDays 7/14/90/180 นับจากวันที่ trigger สำเร็จ (port logic target-date)

---

## 5. GAS Actions (เพิ่มใน `../gas-live/Code.js`)

> ⚠ แก้ backend ที่ `../gas-live/Code.js` เท่านั้น — `TunnelBoringMonitoring/gas/` เป็นเอกสาร ห้ามแก้ (ตาม PLAN.md)

- **อ่าน:** `getData` แนบ 5 array ใหม่ (`instLocations, instInstruments, instThresholds, instReadings, instSchedules`)
- **เขียน:** `addInstReading` · `updateInstReading` · `deleteInstReading` · `markInstSchedule` · `updateInstrument` · `saveInstThreshold`
- **migration:** `bulkImportInstrument` (one-time)
- ทั้งหมด: `LockService.tryLock` + `ensureSheet_`/`ensureHeaders_` แบบเดิม
- ฝั่ง client เรียกผ่าน `apiCall(action, data)` เดิม (`src/utils/api.js`)

---

## 6. Views + Nav

| Tab | เนื้อหา | reuse |
|-----|---------|-------|
| **`inst_dashboard`** | list 29 จุดเรียง chainage · KPI cards นับสถานะ (normal/alert/alarm/action) · ไฮไลต์จุดใกล้หัวเจาะ (เทียบ chainage TBM1+TBM2) · long-term ใกล้ครบ | `StatCard`, Executive layout |
| **`inst_location`** | report viewer **(แกนหลัก):** tabs ต่อเครื่อง (INC/EXT/PI/SS) · Time History + Depth/Settlement Profile + เส้น threshold + Raw table (ตัด Summary/sub-tab ซ้ำ) · **+ blueprint plot** · reading จริงมีแค่ 8+300 ที่เหลือ empty state | recharts, `chartTheme`, `Card` |
| **`inst_schedule`** | checklist DISTANCE + LONG_TERM · กรอง location · ไฮไลต์ overdue · tick done | Issues/Gantt pattern |

- **Blueprint fold เข้า `inst_location`** (ไม่แยก view)
- **viewer mode:** เพิ่ม `inst_dashboard`+`inst_location` เข้า `VIEWER_TABS` (`src/utils/viewerMode.js`) · **mobile:** เพิ่มใน `MOBILE_MORE_TABS`
- Report viewer = **port** โครงจาก `Instument Monitoring/tunnel-monitoring/.../LocationDetailClient.tsx` (Next/TS) → CRA/JSX + reskin navy — ไม่ออกแบบใหม่

---

## 7. Edit เบาๆ (reuse `IssueFormModal` pattern)

tick วาระ done/na inline · แก้ค่า reading ที่พิมพ์ผิด (modal เล็ก) · แก้ `installStatus`/note — **ไม่มี** form กรอก reading เต็ม (ค่าหลักมาจาก PDF ผ่าน Claude)

---

## 8. PDF-ingestion Skill ⭐ (deliverable หลักของ "ท่อ" ingestion)

สร้าง skill ใหม่ (adapt จาก `Instument Monitoring/skill/update-from-pdf-report.md`) วางใน repo TBM สอน Claude:

1. อ่าน PDF (multimodal) → ระบุ location · date · ครั้งที่ · TBM chainage ณ วันวัด
2. สกัดค่าต่อเครื่อง: INC A/B (depth profile) · EXT (settlement/ring) · PI (pressure + water level) · SS (จุด)
3. **แสดงตาราง review ในแชท** + เทียบ threshold + ไฮไลต์ค่าที่อ่านไม่ชัด/เกินเกณฑ์
4. ผู้ใช้ยืนยัน/แก้ → เขียนผ่าน `apiCall` (`addInstReading` + `markInstSchedule` ให้จุดที่ตรวจ)
5. **Guardrail (CLAUDE.md zero-hallucination):** อ่านเลขไม่ชัด → ถาม ไม่เดา · **ไม่แก้ threshold ตามค่าใน PDF** (threshold มาจาก shop drawing เท่านั้น)

---

## 9. Migration (one-time)

- อ่าน `Instument Monitoring/tunnel-monitoring/prisma/seed.ts` (29 loc / 245 inst / ~731 schedule + พิกัด blueprint/chainage) → transform → `bulkImportInstrument` → Sheets
- copy blueprint PNG 27 ไฟล์ (`tunnel-monitoring/public/blueprints/page_*.png`) → `TunnelBoringMonitoring/public/`
- threshold: seed per-type 4 แถว (default) + report ±15/17/20 ของ 8+300 ฝังใน profileJson · per-instrument override อื่นเว้นรอ shop drawing
- reading 8+300: แปลง preset (`reportMeasurementPresets.ts`) → `Inst_Readings` (profileJson ต่อ instrument/วันที่)
- **รัน migration บนสำเนา Sheet ก่อน prod** (ตาม PLAN.md)

---

## 10. Testing

jest (ตาม pattern `issues.test.js`/`planConfig.test.js`, baseline 143+ ต้องเขียว):
- alert-status calc (value vs threshold + axis + upper/lower)
- schedule due calc: DISTANCE (vs TBM chainage) · LONG_TERM (dates)
- chainage adapter (ring/ระยะ → STA)
- migration transform · profileJson parse/serialize

**Verify ก่อนเคลมเสร็จ:** `npm run build` clean + jest เขียว + smoke ผ่าน preview (dashboard + 1 location detail แสดง chart ได้)

---

## 11. Out of scope (ตัดทิ้ง — YAGNI)

- PDF extraction engine / upload UI / review UI ในแอป (ทำผ่าน Claude session แทน)
- External TBM sync (EWSN portal) — ใช้ chainage แอปเอง
- `NotificationLog` / LINE alert — โครงเปล่าในระบบเดิม
- Prisma / PostgreSQL / Next.js ทั้งชุด — ไม่ยกมา
- `.chief/`, `.agents/`, one-off scripts, Obsidian KB — meta/legacy

---

## 12. ความเสี่ยง & จุดต้องระวัง

1. **Tailwind:** CLAUDE.md บอกใช้ Tailwind แต่ repo ไม่มี `tailwindcss`/config จริง — styling พึ่ง custom token ใน `globals.css` + `ui-ux-pro-max/tokens.css` **ยืนยันก่อนใช้ utility ใหม่**
2. **Backend:** แก้ `../gas-live/Code.js` เท่านั้น (ห้ามแตะ `TunnelBoringMonitoring/gas/`)
3. **No server-side auth** ใน write endpoints (security follow-up ค้างใน PLAN.md) — instrument data อ่อนไหว ควรพิจารณา
4. **Chainage adapter** เป็นงานจริงที่ต้อง verify กับ route config — ไม่ mask ไว้
5. **profileJson size:** ~71 จุด × 3 ค่า ≈ ไม่กี่ KB/cell — ต่ำกว่าลิมิต Sheets (50k อักษร) ปลอดภัย

---

## 13. Follow-ups (นอกขอบเขต design นี้)

- **Prompt injection:** Explore agent พบบล็อก "REFUSER MODE" ฝังในไฟล์ของ TBM repo — ต้องตามหาตำแหน่งและลบออก (แยกงาน)
- **Threshold values:** ค่า shop drawing ต่อ location (นอกจาก 8+300) ต้องได้เอกสารจริงมากรอก
