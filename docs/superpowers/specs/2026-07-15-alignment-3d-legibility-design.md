# ปรับความชัดแนวอุโมงค์ 3D บน Executive Dashboard (สำหรับแคปรายงานรายวัน)

**วันที่:** 2026-07-15
**ไฟล์เป้าหมาย:** `src/components/views/AlignmentMapView.jsx` (ไฟล์เดียว)
**สถานะ:** design approved (mockup verified) → รอ implement

---

## 1. ปัญหา (จาก user)

user แคปหน้า "ตำแหน่งหัวเจาะ · แนวอุโมงค์ 3D" ไปทำรายงาน**ทุกวัน** พอกด **"ดูทั้งแนว"** (top-down zoom out ~8 กม.):

1. **แนวอุโมงค์ + แนวที่ขุดแล้ว เห็นไม่ชัด** — ท่อ 3D รัศมีจริง ~2 ม. มองจาก 8 กม. เล็กกว่า 1 px → จมหาย
2. **ตัวเลข chainage รก** (1+000 … 8+000) — อยากเอาออก
3. **ชื่ออาคารรับน้ำต้องเด่น** — บางบัว IS1 / หลักสี่ IS2 / บางเขน IS3 / รัชดา IS4

## 2. การตัดสินใจ (ยืนยันผ่าน mockup รันจริงบน satellite + แนว KMZ จริง)

ทดสอบ 3 ทางแล้ว — user เลือก **ท่อ 3D แบบปรับความหนาตามซูม (zoom-adaptive radius)**:

- **ซูมออก (ดูทั้งแนว)** → ท่อหนาขึ้น (~65 ม. บนโลกจริง ≈ เส้นหนาบนจอ) เห็นชัดทั้งเส้น
- **ซูมเข้า (ตามหัวเจาะ / ใกล้ๆ)** → ท่อกลับเป็นขนาดจริง (~2 ม.) เห็นมิติ 3D
- สูตร: `radius(m) = clamp( K / 2^zoom , REAL_R , MAX_R )` โดย `K≈390000, REAL_R=2, MAX_R=90`
  - รักษา 3D ที่ user ชอบไว้ครบ แก้เฉพาะปัญหา "จมหาย" ตอนซูมออก

**โทนสี (ยืนยัน):** ขุดแล้ว = **ส้มสด เด่น** / เหลือ = **เทาจางโปร่ง** (subtle) — เน้น progress, ดู minimalist
**ความหนาซูมออก:** บางลงจาก 100 → **~65 ม.** (เพรียว)
**chainage:** เอา label ออกทั้งหมด (ทุกโหมด)
**ป้ายอาคาร:** ใหญ่/ชัดขึ้น + IS2 กางไปทางซ้าย ไม่ทับ IS1

> mockup อ้างอิง: `/alignment-mockup.html` (นอกแอป) · ภาพ proof: `adaptive3-wide.jpg`, `adaptive3-head.jpg`

## 3. จุดที่จะแก้ใน `AlignmentMapView.jsx`

| # | จุด | เดิม | ใหม่ |
|---|-----|------|------|
| A | **ลบ chainage** (บรรทัด ~187-193 `KM_LABELS.forEach`) | วาด marker `.a3m-km` 9 จุด | ลบทั้ง block + ลบ `KM_LABELS` จาก import (ถ้าไม่ใช้ที่อื่น) + ลบ CSS `.a3m-km` |
| B | **สีท่อ** (`matDrilled`/`matRest` ~272-273) | ส้ม `0xF2741B` / ฟ้าโปร่ง `0x9fc4e8` opacity .5 | drilled `0xF15A22` emissive `0xB23C0A` roughness 1 metalness 0 · rest **เทา** `0xB4BCC6` emissive `0x2C333B` opacity .6 |
| C | **แสง** (~257-259) | ambient 1.6 + dir 2.2/0.9 | ambient 0.95 + dir 0.85/0.35 (กันสีล้น/highlight เหลือง) |
| D | **ท่อ adaptive** (`buildTube`/`setHead` ~280-294) | สร้าง `TubeGeometry` รัศมี `TUBE_R=2` คงที่ | เก็บ `curveDrilled/curveRest` + แยก `buildGeom(R)` + `setRadius(R)` + ฟัง `map.on('zoom')` (throttle rAF) → `setRadius(tubeRadius(zoom))` |
| E | **ป้ายอาคาร** (marker ~180-185 + CSS `.a3m-shaft` ~456-461) | navy pill เล็ก (b 11px), anchor "left" ตายตัว | b ~13-14px, pin ใหญ่ขึ้น, contrast สูง · IS2 anchor "right" + `row-reverse` กางซ้าย |

## 4. ข้อควรระวัง (gotchas)

- **headCh เปลี่ยนได้** (records อัปเดต) ต่างจาก mockup ที่ fix — ต้องแยก 2 trigger:
  `setHead(ch)` = rebuild **curve** (แบ่ง drilled/rest ใหม่) + reposition หัว + build geom ด้วย radius ปัจจุบัน · `setRadius(R)` = build geom ด้วย curve เดิม + R ใหม่
- **performance:** `TubeGeometry` rebuild ทุก zoom-frame หนัก → throttle ด้วย rAF flag + guard `Δradius < 0.05` (ทำใน mockup แล้ว ลื่นพอ) · ปรับ `tubularSegments` ลงได้ถ้าหนัก
- **jest** (ปัจจุบัน 248 tests): AlignmentMapView ใช้ dynamic import maplibre/three (jest ไม่มี WebGL) — ต้องไม่ break test เดิม
- **print snapshot** (มี `preserveDrawingBuffer`) — ท่อ adaptive ใช้ radius ตาม zoom ณ ตอน print (โหมดไหนก็ถูกตามนั้น) ไม่ต้องแก้เพิ่ม
- **viewer mode / per-machine (TBM1 only)** — โค้ดเดิม guard `isTBM1` อยู่แล้ว ไม่แตะ
- ค่าคงที่ `K/REAL_R/MAX_R` วางเป็น const ต้นไฟล์ (จูนง่าย) — ponytail marker

## 5. เกณฑ์ verify (ก่อนเคลมเสร็จ)

1. `npm test` เดิมผ่านครบ (ไม่ลด)
2. build ผ่าน (`npm run build`)
3. เปิดแอปจริง → Executive Dashboard → กด "ดูทั้งแนว": ท่อหนาเห็นชัด, ส้ม/เทาแยกชัด, **ไม่มีเลข chainage**, ป้ายอาคาร 4 ตัวอ่านชัดไม่ทับ
4. กด "ตามหัวเจาะ": ท่อกลับเล็ก (ขนาดจริง) เห็นมิติ 3D, สีส้มสด (ไม่เหลือง)
5. ซูมเข้า-ออก: ท่อยืด-หดลื่น ไม่กระตุกรุนแรง

## 6. Out of scope

- ไม่แตะ GAS / data layer / instrument / settlement overlay
- ไม่แตะ machine switching, viewer mode logic
- ไม่เปลี่ยนโครงสร้าง navigation / dashboard อื่น
- TBM2 (แนวนี้ TBM1 เท่านั้น — คงเดิม)
