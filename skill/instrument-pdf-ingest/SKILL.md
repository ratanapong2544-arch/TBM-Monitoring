---
name: instrument-pdf-ingest
description: อ่าน PDF รายงานการตรวจวัด instrument (LJT) แล้วสกัดค่า → review กับผู้ใช้ในแชท → เขียนเข้า Google Sheets ผ่าน GAS. ใช้เมื่อผู้ใช้ส่งไฟล์ PDF report ของ instrument (inclinometer/extensometer/piezometer/settlement, ชื่อแบบ TA-LJT-DR-...) เข้ามาเพื่ออัพเดทค่าการตรวจวัด/สถานะ ในแอป TBM Monitoring
---

# Instrument PDF Ingestion

นำเข้าค่าการตรวจวัด instrument จาก PDF report เข้าระบบ TBM Monitoring **ผ่าน Claude session** (ไม่มี extraction engine ในแอป — คนกลางคือ Claude + human review)

## เมื่อไหร่ใช้
ผู้ใช้ส่ง PDF report การตรวจวัด (ชื่อแบบ `TA-LJT-DR-NN-NNN-TBM_1 STA X+XXX (DDMMYYYY).pdf`) จาก Leo Jovian Thai (LJT) เข้ามาใน session เพื่ออัพเดทค่า

## หลักการ (บังคับ)
**Human-in-the-loop:** อ่าน PDF → สกัด → **แสดง review table ในแชท → รอผู้ใช้ยืนยัน/แก้** → ค่อยเขียนเข้า Sheets. **ห้ามเขียนก่อนผู้ใช้ยืนยัน**

## Data model (Google Sheets ผ่าน GAS)
- **GAS_URL** = `src/utils/constants.js` (`https://script.google.com/macros/s/AKfycbyRUl5.../exec`)
- อ่าน state ปัจจุบัน: `GET {GAS_URL}?action=getData&machine=TBM1` → คีย์ `instLocations`, `instInstruments`, `instThresholds`, `instReadings`, `instSchedules`
- เขียน: `POST {GAS_URL}` body `{"action": "...", "data": {...}}` content-type `text/plain` (หรือ `apiCall(action, data)` ใน `src/utils/api.js`)

**คีย์อ้างอิงที่ต้องใช้ map:**
- `Inst_Locations`: `id · name · chainage · actualChainage` — map STA ใน PDF → locationId (เทียบ chainage; ใช้ actualChainage ถ้ามี เช่น 8+300 = 8360)
- `Inst_Instruments`: `id · locationId · code · type` — `code` = physical tag จริง (เช่น P6379, PI-T1-01); `type` = `INCLINOMETER|EXTENSOMETER|PIEZOMETER|SETTLEMENT_POINT`
- `Inst_Thresholds`: `scope · key · alert · alarm · action` — scope=`type` (default per-ประเภท) หรือ `instrument` (override per-เครื่อง)

## ขั้นตอน

### 1. อ่าน PDF (multimodal)
เปิด PDF ระบุ: **location (STA)** · **วันที่ตรวจ** · **ครั้งที่ (Nth measurement)** · **TBM chainage ณ วันวัด** · ชนิดเครื่องในรายงาน (INC/EXT/PI/SS)

### 2. Map location → id
ดึง `getData` → หา `instLocations` ที่ chainage/STA ตรงกับ PDF → ได้ `locationId` + `instInstruments` ของจุดนั้น (map code ในกราฟ PDF ↔ instrument.id)

### 3. สกัดค่าต่อเครื่อง
- **INC (inclinometer):** depth profile A-axis + B-axis ทุกความลึก → `profileJson = [{depth, a, b}, ...]`
- **EXT (extensometer):** settlement ต่อ ring/datum ต่อวันที่ → `profileJson` = history array
- **PI (piezometer):** pressure (kPa) + water level (m) → `valuePrimary` = pressure, `valueSecondary` = water level
- **SS (settlement point):** ค่าทรุด → `valuePrimary`
- `maxValue` = ค่าสูงสุด (abs) สำหรับ dashboard/alert

### 4. แสดง review table ในแชท (สำคัญ)
สร้างตารางให้ผู้ใช้ตรวจ:
| instrument (code) | type | ค่าที่สกัด | maxValue | threshold (alert/alarm/action) | สถานะ | หมายเหตุ |
- คำนวณสถานะเทียบ threshold (จาก `instThresholds`): normal < alert < alarm < action (ใช้ absolute)
- **ไฮไลต์:** ค่าที่อ่านไม่ชัด (⚠️ ต้องถาม) · ค่าที่เกิน alert/alarm/action (🔴 เตือนชัดเจน)

### 5. รอผู้ใช้ยืนยัน/แก้ → เขียนเข้า Sheets
ต่อ instrument ต่อวันที่:
```
apiCall("addInstReading", {
  id: "rd_<unique>",           // ใหม่: gen เอง; แก้: ใช้ id เดิม (query getData ก่อน)
  instrumentId, date, seq,
  tbmChainage,                 // STA ณ วันวัด
  valuePrimary, valueSecondary,
  profileJson,                 // JSON string ตาม format ข้อ 3
  maxValue,
  sourcePdf: "<ชื่อไฟล์ PDF>",
  enteredBy: "claude"
})
```
แล้ว mark วาระที่ตรงวันตรวจ:
```
apiCall("saveInstSchedule", { ...schedule เดิม, isMeasured: true, measuredAt: "<ISO date>", measuredBy: "claude" })
```
(POST ผ่าน `fetch(GAS_URL, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body: JSON.stringify({action, data})})`)

## Guardrails (บังคับ — CLAUDE.md zero-hallucination)
- **อ่านเลขไม่ชัด → ถามผู้ใช้ ห้ามเดา** (นี่คือ engineering data — ค่าผิดอันตราย)
- **ห้ามแก้ threshold ตามค่าใน PDF** — threshold มาจาก shop drawing เก็บใน `Inst_Thresholds` เท่านั้น (report ใน PDF อาจโชว์เส้น ±15/17/20 ของ 8+300 ซึ่งเก็บใน profileJson แยก ไม่ใช่ threshold กลาง)
- `profileJson` serialize ให้ตรง format ที่ report viewer parse (`src/utils/instrumentData.js` → `parseProfile`)
- ยืนยัน `id` ไม่ชนของเดิม (query `getData` ก่อน; ถ้า update reading เดิมใช้ id เดิม)
- ค่าเกิน **action** → เตือนผู้ใช้ให้ชัดเจนในตาราง review (อาจต้องแจ้งทีมทันที)

## หลังเขียนเสร็จ
- ยืนยัน `getData` คืนค่าใหม่ (reading เข้าแล้ว)
- แจ้งผู้ใช้: instrument ไหนอัพเดท, สถานะเปลี่ยนไหม, มีจุดเกินเกณฑ์ไหม
