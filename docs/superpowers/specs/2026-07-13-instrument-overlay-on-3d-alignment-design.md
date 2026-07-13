# Design: แสดง Instrument + Settlement บนแผนที่ 3D (Executive Dashboard)

วันที่: 2026-07-13
ผู้เขียน: Claude (brainstorm ร่วมกับ user)
สถานะ: รออนุมัติ spec → writing-plans

## 1. เป้าหมาย

เพิ่มการแสดง **เครื่องมือตรวจวัดธรณีเทคนิค** และ **จุด settlement** จากไฟล์ KML
(`Klongprem Project.kml`) ลงบน section "ตำแหน่งหัวเจาะ · แนวอุโมงค์ 3D"
(`AlignmentMapView`) ในหน้า Executive Dashboard — วางตามพิกัดจริงบนภาพถ่ายดาวเทียม
ให้ผู้บริหาร/เจ้าของงานเห็นว่ามี instrument monitoring อยู่ตรงไหนของแนวอุโมงค์
สัมพันธ์กับตำแหน่งหัวเจาะปัจจุบัน

**ที่มา:** user ทำงานใน Google Earth เห็น instrument (ไอคอนเขียว) + settlement (กากบาทส้ม)
ในไฟล์ KML แล้วอยากได้ layer นั้นในแอป

## 2. ขอบเขต (ตัดสินใจแล้วกับ user)

| หัวข้อ | มติ |
|---|---|
| แหล่งข้อมูลตำแหน่ง | **KML** (พิกัด lat/lng จริง) — ไม่ดึงจากระบบ Instrument Monitoring ที่กำลัง build |
| ประเภทที่แสดง | เครื่องมือ 3 ชนิด (Extensometer / Inclinometer / VW Piezometer) **+ จุด settlement** |
| สัญลักษณ์เครื่องมือ | ไอคอนเขียวตามชนิด (คลีน เข้ากับ dashboard) — วงกลม=Inclinometer / สี่เหลี่ยม=Extensometer / สามเหลี่ยม=VW Piezometer |
| Settlement | กากบาทส้มตามจริงจาก KML |
| Default | **โชว์เลย**ตอนเปิดหน้า + มีปุ่ม toggle ซ่อน/แสดง |

**Non-goals (รอบนี้ไม่ทำ):**
- ไม่เชื่อมกับระบบ Instrument Monitoring (readings/status/schedule) — แต่ออกแบบให้ต่อยอดได้ (section มี chainage)
- ไม่แสดง benchmark (BMKR/BMLK), GPS, survey alignment points, base map CAD
- ไม่แตะ GAS, ไม่แตะ `src/components/instrument/*` หรือ `src/utils/instrument*.js` (งาน rebuild คนละส่วน)
- ไม่ทำ CRUD / แก้ไขข้อมูล instrument

## 3. ข้อเท็จจริงจาก KML (verify แล้วด้วยพิกัด)

ไฟล์: `TBM-3D-Real/kmz/Klongprem Project.kml` (GIS export ทั้งโปรเจกต์, 5.6 MB, อยู่**นอก** repo)

- **เครื่องมือ 3 ชนิด** = Point Features ชื่อ `Extensometer` (13) / `Inclinometer` (13) / `VW Piezometer` (9) = 35 จุดดิบ
  - มี duplicate + ติดตั้งเป็นชุด → **จัดกลุ่มได้ 10 monitoring sections** (cluster รัศมี <25 ม.)
  - 8 section มี Ext+Inc+VW ครบ · 2 section เป็น "Above Tunnel" มี Ext+Inc
  - chainage (คำนวณจากแนว): 423, 1058, 2007, 2908, 3626, 4291, 4914, 6599(AT), 7394(AT), 8131 · offset จาก centerline 0–21 ม.
  - หมายเหตุ: label point เป็นไอคอน PNG **โปร่งใส** — สีเขียวที่เห็นใน Google Earth มาจากรูปวาด polygon; เราจะ render สัญลักษณ์ใหม่เอง ไม่ใช้ไอคอน KML
- **Settlement** = LineString สั้น 1–3 ม. ใต้ description `"Instrument Tunnel"` = **656 เส้น** (แต่ละกากบาท "+" = 2 เส้นไขว้) → ~258–328 จุดกากบาท
  - render เป็นเส้นตรงๆ (faithful) ไม่ต้อง cluster เป็นจุด
- ที่ไม่เอา: benchmark BMKR/BMLK (~86), GPS (14), survey alignment TS/SC/CS/ST/PI/N/R/Mid (~350), STA labels, base map CAD (road/curb/tunnel-outline polygon)

## 4. สถาปัตยกรรม

ยึดแพตเทิร์นเดิมของ `alignmentGeo.js` (pure data static module + helper, jest-safe)

### 4.1 ไฟล์ข้อมูลใหม่ `src/utils/instrumentGeo.js`

pure data + math ล้วน — **ไม่ import maplibre/three** (jest-safe เหมือน `alignmentGeo.js`)

```js
// 10 monitoring sections (จัดกลุ่มจาก 35 จุด KML)
export const INSTRUMENT_SECTIONS = [
  { id: "IM-01", lng: ..., lat: ..., chainage: 423.1,  types: ["EXT","INC","VW"], aboveTunnel: false },
  ...
  { id: "IM-10", lng: ..., lat: ..., chainage: 8131.0, types: ["EXT","INC","VW"], aboveTunnel: false },
];

// settlement crosses — เก็บ compact เป็นคู่พิกัด (656 เส้น)
export const SETTLEMENT_CROSSES = [
  [[lng,lat],[lng,lat]],  // เส้นไขว้เส้นที่ 1
  ...
];

// helper: build GeoJSON FeatureCollection สำหรับ MapLibre source
export function settlementGeoJSON() { ... }

// metadata สำหรับสัญลักษณ์
export const INSTRUMENT_META = {
  EXT: { label: "Extensometer",  shape: "square"   },
  INC: { label: "Inclinometer",  shape: "circle"   },
  VW:  { label: "VW Piezometer", shape: "triangle" },
};
```

- ตัวเลข `chainage` ใช้เพื่อโชว์ใน callout (`CH 8+131`) และเปิดทางเชื่อมระบบ Instrument ภายหลัง
- ขนาดไฟล์ประเมิน: sections เล็กมาก + settlement 656 คู่พิกัด ≈ 20–30 KB (อ่านได้ ยอมรับได้)

### 4.2 สคริปต์ generate `tools/extract-instrument-geo.py`

- อ่าน KML → สกัด instrument points + settlement crosses
- จัดกลุ่ม instrument เป็น section (cluster <25 ม., รวม type, ตั้ง `aboveTunnel` ถ้า desc มี "Above Tunnel")
- คำนวณ chainage ต่อ section ด้วย nearest-point บนแนว (reuse `LINE`/`CH` จาก `alignmentGeo.js`)
- เขียนทับ `src/utils/instrumentGeo.js` (คน commit ผลลัพธ์ที่ได้ — เหมือน `alignmentGeo.js` ที่เป็น static data)
- รันครั้งเดียวตอน build data (ไม่ใช่ runtime) — KML ไม่ต้องเข้า repo

### 4.3 การแสดงผลใน `src/components/views/AlignmentMapView.jsx`

เพิ่ม 2 layer + 1 ปุ่ม (ไม่รื้อของเดิม — ท่อ 3D/หัวเจาะ/ปล่อง/กม. คงเดิม)

**A. Settlement (กากบาทส้ม)** — MapLibre GeoJSON `line` layer
- `map.addSource("settlement", { type:"geojson", data: settlementGeoJSON() })`
- `map.addLayer({ id:"settlement-cross", type:"line", paint:{ "line-color":"#F97316", "line-width":1.4, "line-opacity":0.9 } })`
- เร็ว: 656 เส้นเป็น layer เดียว ไม่สร้าง DOM node (ต่างจาก HTML marker)

**B. เครื่องมือ (10 sections)** — HTML Marker (แพตเทิร์นเดียวกับ `SHAFTS`)
- แต่ละ section = 1 marker: กล่องเล็ก แสดงสัญลักษณ์เขียวของทุก type ที่มี (วงกลม/สี่เหลี่ยม/สามเหลี่ยม) + label chainage
- section "Above Tunnel" เน้นสี/ขอบต่าง
- คลิก marker → callout (reuse แพตเทิร์น `.a3m-head-callout`): ชื่อ section, `CH X+YYY`, รายชื่อเครื่องมือที่มี, badge "Above Tunnel"
- สัญลักษณ์วาดด้วย inline SVG/CSS (วงกลม/สี่เหลี่ยม/สามเหลี่ยม) สีเขียว (`#16A34A`) — ไม่พึ่งไอคอน KML

**C. ปุ่ม Toggle** — เพิ่มในกลุ่ม `.a3m-ctrl` เดิม
- ปุ่ม "🔬 เครื่องมือตรวจวัด" — สลับ visibility ของทั้ง settlement layer + instrument markers
- state `showInstruments` (default `true`)
- toggle ทำผ่าน `map.setLayoutProperty("settlement-cross","visibility",...)` + ซ่อน/แสดง marker elements

**พฤติกรรมเดิมที่ต้องคง:**
- `embedded` mode (ฝังใน dashboard), `readOnly` (viewer `?view=1`) — markers เห็นได้ (read-only info), ปุ่ม toggle ใช้ได้
- TBM2 → ยังโชว์ notice เดิม (instrument layer ผูกกับแนว TBM1 เท่านั้น)
- dispose layer/source/marker ตอน cleanup (กัน WebGL/DOM leak — ตามบทเรียนเดิม)

## 5. ไฟล์ที่แตะ

| ไฟล์ | ชนิด | หมายเหตุ |
|---|---|---|
| `src/utils/instrumentGeo.js` | 🆕 | static data + helper (jest-safe) |
| `src/utils/instrumentGeo.test.js` | 🆕 | ตรวจ 10 sections, chainage, 656 crosses, no NaN |
| `tools/extract-instrument-geo.py` | 🆕 | generate script (dev tool) |
| `src/components/views/AlignmentMapView.jsx` | ✏️ | เพิ่ม 2 layer + toggle + callout (เพิ่ม CSS ในตัวแปร `CSS`) |

ไม่แตะ: GAS, `App.jsx` (ยกเว้นถ้าจำเป็นต้องส่ง prop — คาดว่าไม่ต้อง), ระบบ Instrument Monitoring

## 6. การทดสอบ / verify

- **jest** `instrumentGeo.test.js`: sections = 10, ทุก section มี ≥1 type + พิกัด/chainage เป็นเลข (ไม่ NaN), settlement crosses = 656, `settlementGeoJSON()` คืน FeatureCollection ถูก schema
- **jest suite เดิม** ต้องไม่แตก (AlignmentMapView ไม่มี jest test เพราะ WebGL — คงเดิม)
- **verify ภาพจริง** (ตามบทเรียน preview throttle): รัน dev server, เปิดหน้า Executive Dashboard, ยืนยันว่า
  - เห็นกากบาทส้ม + marker เครื่องมือเขียวตามแนว
  - marker คลิกได้ → callout ถูกตำแหน่ง/ข้อมูล
  - toggle ซ่อน/แสดงได้
  - หัวเจาะ/ท่อ 3D เดิมไม่เพี้ยน
  - (preview เปิดหน้า `document.hidden` → rAF throttle: ใช้ eval workaround + `canvas.toDataURL` ตรวจ ตามที่เคยทำใน memory)
- **build** production compile clean

## 7. ความเสี่ยง / ข้อควรระวัง

- **KML อยู่นอก repo** → generate `instrumentGeo.js` เป็น static commit (ผู้ใช้/dev รัน `extract-instrument-geo.py` เองถ้า KML เปลี่ยน)
- **chainage นอกช่วง / ทิศ** — เจาะทิศ chainage ลดลง (launch 8830 → 0); ตรวจว่า section chainage สมเหตุสมผล (423–8131) แล้ว
- **การจัดกลุ่ม section (25 ม.)** — ถ้ามี instrument ห่าง>25 ม. แต่เป็นชุดเดียว อาจแยกผิด → ยืนยันด้วยผล 10 sections ที่ตรวจแล้ว
- **HMR hot-swap** ของ maplibre+three อาจโยน console error (dev-only artifact ตามบทเรียน) — ไม่ใช่บั๊กจริง
- **isolation:** ทำบน worktree `wt-instmap` (branch `feat/instrument-map-overlay` จาก origin/main) — ไม่ชน `feat/instrument-rebuild` ที่กำลัง active
