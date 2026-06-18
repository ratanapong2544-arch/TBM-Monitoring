# Design — Profile ใต้ดิน + การเชิด/ตกของหัวเจาะ (Underground Geological Section + Head Deviation)

- **วันที่:** 2026-06-18
- **โปรเจกต์:** TunnelBoringMonitoring (React 18 CRA + Tailwind + GAS)
- **สถานะ:** Design (รอ user review → writing-plans)
- **เครื่อง:** TBM1 ก่อน (ตามแนว/ข้อมูลที่มี) · TBM2 = empty-state จนกว่าจะมี profile

---

## 1. ที่มา & เป้าหมาย

ไฟล์ `01.TBM1 Daily Progress.dwg` คือ **alignment (plan) + profile (longitudinal geological section)** ของงานขุดเจาะ.
ส่วน **alignment ทำเสร็จแล้ว** เป็น 3D Alignment (MapLibre + Esri + ท่อ 3D + หัวเจาะตาม chainage จาก KMZ — `alignmentGeo.js` + `AlignmentMapView.jsx`) ซึ่ง **ไม่มีมิติความลึก** (altitude = 0).

สิ่งที่ขาด = **profile ใต้ดิน** เพื่อ:
1. รายงานชั้นดินตามแนวอุโมงค์ (รู้ว่าหัวเจาะอยู่ในดินอะไร)
2. **เก็บและแสดงค่าเชิด/ตก (vertical deviation) ของหัวเจาะ** เทียบแนวออกแบบ tolerance ±75mm — แบบกราฟ "ค่าระดับหัวเจาะ TBM1" (Head/Art/Tail + VRT) ที่เป็นรูปตัวอย่าง

> หมายเหตุสำคัญ (verified): schema `segments` ปัจจุบันมีแค่ `ringNo / startCH / finishCH / soilType / soilVolume / วันเวลา` — **ยังไม่มีฟิลด์ค่าระดับหัว/VRT** ดังนั้นกราฟตัวอย่างยังไม่ถูก back ด้วยข้อมูลในแอป ต้องเพิ่มทั้ง field + การกรอก.

## 2. ขอบเขต

**In scope**
- ภาคตัดธรณีตามยาว (geology-first section) จาก DWG แสดงในแอป ซิงก์ตำแหน่งหัวเจาะ
- การแสดงค่าเชิด/ตก (vertical) ของหัวเจาะ: Head / Articulation / Tail deviation + VRT (pitch)
- การกรอกค่าต่อ ring + backfill ข้อมูลเก่าจากไฟล์ Excel/CSV
- ฝังใน Executive Dashboard ใต้ 3D Alignment · รองรับ viewer mode · per-machine

**Out of scope (ตอนนี้)**
- **Horizontal deviation (ซ้าย/ขวา) + roll** — ออกแบบ schema เผื่อไว้ แต่ยังไม่ทำ
- TBM2 profile (ยังไม่มีแบบ/ข้อมูล) — แค่ empty-state
- การแก้ไฟล์ DWG / re-survey

## 3. การตัดสินใจหลัก (จาก brainstorm)

| หัวข้อ | เลือก |
|---|---|
| รูปแบบ visualization | **A — ภาคตัดธรณีรวม** (geology-first section เหมือน DWG, อุโมงค์วิ่งทะลุชั้นดิน, หัวเจาะเอียงตาม VRT) |
| การแสดง deviation | **A2 + A1** — vertical exaggeration ×N (toggle ×10/×30/×50) ระบายแดงเมื่อเกิน ±75 + callout ตัวเลขจริงที่หัวเจาะ. A3 (กล่องซูม focus inset) = mode เสริมทีหลัง |
| แหล่ง profile ดิน | **สกัดอัตโนมัติจาก DWG** (ODA File Converter → DXF → ezdxf → JSON) |
| นิยาม Head/Art/Tail | **deviation (mm) จากแนวออกแบบ**, ±75mm tolerance; VRT = มุมก้ม/เงย; เส้นจริง = design + deviation |
| แหล่ง design line | **มีในแบบ DWG** (สกัดออกมาพร้อมชั้นดิน) |
| ตำแหน่งแสดง | **ฝังเป็น section ใน Executive Dashboard ใต้ 3D Alignment** |
| Backfill ของเก่า | **ไฟล์ Excel/CSV** (user จะวางไฟล์ให้ import — ฟอร์แมตจริงดูตอนได้ไฟล์) |
| Bore diameter + จุดอ้างอิง | **สกัดจาก DWG/แบบ** (ไม่เดาค่า) |

## 4. สถาปัตยกรรม (3 เลเยอร์ — ตามแพทเทิร์น alignment เดิม)

**(a) Build-time extraction (Python — รันเมื่อแบบเปลี่ยน ไม่ใช่ runtime)**
`tools/extract_profile.py` → ใช้ `ezdxf.addons.odafc` แปลง DWG (AC1032) → DXF → อ่าน layer ที่เป็นขอบชั้นดิน / เส้นออกแบบ / หลุมเจาะ → เขียน `src/utils/profileGeo.js` (pure data, jest-safe — เลียนแบบ `alignmentGeo.js`)

**(b) Pure geometry util (testable, ไม่ import React/SVG)**
`src/utils/profileSection.js` — ฟังก์ชันคณิต: map `(ch, rl)` → px, สร้างเส้นจริง = design + deviation×ตัวคูณ, ตรวจช่วงเกิน ±75, map ring↔chainage (ใช้ `startCH/finishCH`), คำนวณ scale/viewport/follow-head

**(c) View (React + SVG)**
`src/components/views/ProfileSectionView.jsx` — render ภาคตัด + controls; ใช้ค่าจาก (b) ล้วน

```
DWG ──extract_profile.py──▶ profileGeo.js ─┐
                                            ├─▶ profileSection.js (math) ─▶ ProfileSectionView.jsx
records (ring + deviation, จาก GAS) ────────┘
```

## 5. Data model

### 5.1 profileGeo.js (สกัดจาก DWG — static)
```js
export const LAYERS = [
  { name:'Medium Clay', code:'CH', color:'#5f8f86',
    top:    [{ch, rl}, ...],   // ขอบบนชั้น (chainage, RL ม.)
    bottom: [{ch, rl}, ...] }, // ขอบล่างชั้น
  // ... SM / SP-SM / CL ...
];
export const DESIGN_LINE = [{ ch, rl }, ...];   // แนวแกนอุโมงค์ออกแบบ
export const BORE_DIA = <สกัดจาก DWG>;          // เส้นผ่านศูนย์กลางเจาะ (ม.)
export const BOREHOLES = [
  { id:'BH-27', ch, groundRL, strata:[{code, fromRL, toRL}], spt:[{rl, n}] }
];
export const CH_RANGE = { min, max };           // ช่วง chainage ที่ profile ครอบคลุม
```
ข้อกำหนดความถูกต้อง: chainage เรียงทิศเดียว, ชั้นดินไม่ทับซ้อนผิดลำดับ, sync กับ `CH_MIN/CH_MAX` ของ alignmentGeo (chainage system เดียวกัน).

### 5.2 ฟิลด์ deviation ต่อ ring (ใหม่ — กรอกมือ + backfill)
```
headV : number (mm)  // vertical deviation ที่ cutterhead  (+ = เชิด/ขึ้น, − = ตก/ลง — ยืนยัน sign ตอนได้ไฟล์)
artV  : number (mm)  // ที่ articulation joint
tailV : number (mm)  // ที่ tail shield
vrt   : number (deg) // pitch (เงย +, ก้ม −)
guideTime : ISO datetime (optional)
// เผื่ออนาคต: headH/tailH (horizontal), roll
```
- จัดเก็บที่ **GAS per-machine sheet** (เพิ่มคอลัมน์ใน `segments_TBMx` หรือ sheet ใหม่ `Guidance_TBMx` keyed by `ringNo`) — ตัดสินตอน implement หลังดู GAS เดิม
- **เส้นจริง** ที่ ring: `actualRL(ch) = designRL(ch) + headV/1000`
- Head/Art/Tail 3 จุด → ใช้วาด "ลำตัวเครื่องเอียง" + ตรวจ/แสดง VRT

## 6. Pipeline สกัด DWG (Phase 1 — เสี่ยงสุด)

1. user ลง **ODA File Converter** (ฟรี, opendesign.com) — ผมจะให้ step
2. `pip install ezdxf` (ผมลงเอง)
3. `extract_profile.py`: odafc แปลง DWG→DXF → `ezdxf.readfile` → **list layer names ก่อน** (เพราะชื่อ layer จริงยังไม่รู้ — ห้ามเดา) → ผมเลือก layer ที่ตรงกับ ชั้นดิน/เส้นออกแบบ/BH → ดึง polyline/text → ออก `profileGeo.js`
4. ตรวจ: plot SVG preview เทียบ DWG (เหมือน `centerline-preview.svg` ของ alignment) + spot-check ช่วง chainage/จำนวน entity

> ความเสี่ยง: section ใน DWG อาจวาดเป็น hatch/exploded ไม่ใช่ polyline สะอาด → อาจต้อง clean/simplify เพิ่ม (มี fallback: digitize กึ่ง-มือจาก preview)

## 7. Geometry util — profileSection.js (pure, jest)
- `chToX(ch, viewport)`, `rlToY(rl, viewport)` — สเกลจริง
- `buildActualLine(designLine, deviationsByRing, ringToCh, exagg)` — เส้นจริงขยาย ×exagg รอบ design
- `toleranceBreaches(deviations, ±75)` — คืนช่วงที่เกิน → ระบายแดง
- `ringToChainage(ring)` / `chainageToRing(ch)` — จาก startCH/finishCH
- `headState(records)` — chainage/ring/deviation/VRT ล่าสุด (head = finishCH น้อยสุด, ตามที่ AlignmentMapView ใช้)

## 8. UI/UX (แบบ A2 + A1)
- **แกน:** X = chainage (ป้าย ring กำกับ) · Y = RL (ม., สเกลจริง)
- ชั้นดิน = แถบสีตาม DWG + ป้ายชนิดดิน + เส้น/คอลัมน์ BH (SPT)
- เส้นออกแบบ (ประฟ้า) + envelope ±75 (ขยาย) · เส้นจริง (ส้ม, ขยาย ×N) · ช่วงเกิน = แดง
- หัวเจาะเอียงตาม VRT ที่ ring ล่าสุด + callout `R### · Head ±mm · VRT ±°`
- controls: ตัวคูณขยาย ×10/×30/×50 · ปุ่ม "ตามหัวเจาะ" · zoom/pan ช่วง chainage
- mode เสริม (later): A3 กล่องซูม focus inset ตรงหัวเจาะ
- โทน: CMI Mark 2 (navy, minimalist) ให้เข้ากับ dashboard เดิม

## 9. Integration
- **ตำแหน่ง:** section ใน `ExecutiveDashboardView` ใต้ `AlignmentMapView` (แพทเทิร์น embedded เดิม — prop `embedded`)
- **per-machine:** อ่าน machine ปัจจุบัน (machineConfig); TBM1 = profile จริง, TBM2 = empty-state
- **3D sync (MVP):** ทั้ง 2 view คำนวณ head จาก records ชุดเดียวกัน → ตำแหน่งตรงกันอัตโนมัติ. **(enhancement)** คลิก ring/chainage บน profile → เลื่อนหัวเจาะบนแผนที่ 3D (shared focus state)
- **viewer mode (`?view=1`):** แสดง read-only, ซ่อนการกรอก (ตามแพทเทิร์น viewerMode.js)

## 10. การกรอก & backfill
- เพิ่มช่อง `headV / artV / tailV / vrt` ในหน้า **Record Daily** (ที่กรอก soil อยู่แล้ว) → เขียนผ่าน GAS
- **backfill:** import จากไฟล์ **Excel/CSV** ที่ user จะวางให้ → สคริปต์ map คอลัมน์ → push เข้า sheet (ฟอร์แมต + sign convention ยืนยันตอนได้ไฟล์จริง)

## 11. Testing
- **jest:** `profileSection.js` (chToX/rlToY, buildActualLine+exagg, toleranceBreaches, ring↔ch, headState) · `profileGeo` integrity (chainage เรียง, layers ลำดับถูก, sync CH range)
- **Python:** spot-check จำนวน entity/ช่วง chainage หลังสกัด + SVG preview เทียบ DWG ด้วยตา
- ไม่ลดทอน: ไม่แตะ test เดิม (ปัจจุบัน jest เขียว)

## 12. Phasing
1. **สกัด DWG** → profileGeo.js (+ ลง ODA/ezdxf, ระบุ layer, preview) ← ทำก่อน เสี่ยงสุด
2. `profileSection.js` util + jest
3. `ProfileSectionView` + ฝังใน Executive (ใช้ mock deviation ก่อน)
4. ฟิลด์กรอก headV/artV/tailV/vrt + GAS + backfill จาก Excel
5. 3D sync (scrub) + viewer mode + TBM2 empty-state

## 13. Open items / inputs ที่ต้องได้จาก user
- [ ] ลง **ODA File Converter** (ผมให้ step ตอน Phase 1)
- [ ] ไฟล์ **Excel/CSV** ข้อมูล Head/Art/Tail/VRT เก่า (backfill)
- [ ] ยืนยัน **sign convention** ของ deviation/VRT ตอนเห็นไฟล์จริง

## 14. ความเสี่ยง
- DWG section อาจไม่ใช่ polyline สะอาด → สกัดยาก (fallback: digitize กึ่งมือ)
- chainage system ของ profile ต้องตรงกับ alignment (ตรวจ cross-reference)
- deviation mm เล็ก → พึ่ง exaggeration + label ชัด กันอ่านผิด (เลือก A2 แก้จุดนี้แล้ว)
