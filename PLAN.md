# Plan: TBM System — 3 ฟีเจอร์ใหม่ (Secondary Grout · Head Level · Route Distance Table)
_Locked via grill — by Claude + Rattanaphong (2026-07-06) · rev4 after Codex rounds 1–3_

Stack: React 18 (CRA) + Tailwind + `recharts` + `lucide-react`; backend Google Apps Script via `apiCall(action, data)` POST; per-machine via `getData?action=getData&machine=TBM1|TBM2`. **Authoritative GAS file = `../gas-live/Code.js`** (clasp-managed; the local `gas/` folder holds only docs — do NOT edit it). React repo root = `TunnelBoringMonitoring/`.

## Goal
เพิ่ม 3 ฟีเจอร์ต่อยอดจากโครงเดิม/ reuse pipeline ให้มากสุด โดยไม่ทำข้อมูล/หน้าจอเดิมพัง และรองรับ viewer read-only (`?view=1`) + print (`fitAndPrint`): (1) **Secondary grout** dataset แยก แสดงรวมในหน้า Grout เดิม + ตัด Re-Grout; (2) แท็บ **ระดับหัวเจาะ** กรอก Head/Art/Tail (แนวดิ่ง)+VRT ต่อริงในฟอร์ม segment แล้วแสดง side-view ท่าทาง + trend + VRT + tolerance ±75; (3) **ตารางระยะทาง** เส้นทางซ้อนชั้น แก้ config ได้ในแอพ แสดง TBM1+TBM2+รวม ต่อในหน้า Route เดิม.

---

## Shared infrastructure (ทำก่อน — ทุกฟีเจอร์พึ่ง)

### S1. GAS schema migration (idempotent) — แก้ finding #2,#3,#15
ปัจจุบัน `ensureSheet_` เติม header **เฉพาะ**ตอนสร้าง sheet ใหม่ หรือ sheet ว่าง (`getLastRow()===0`) — **ไม่เติมคอลัมน์ให้ sheet ที่มีข้อมูลแล้ว** และ `appendRow`/`updateRow` map ตาม **ชื่อ header** (key ที่ไม่มีคอลัมน์ = ถูกดรอปเงียบ). ดังนั้น:
- เพิ่ม `ensureHeaders_(sheet, headers)`: อ่าน row1 ปัจจุบัน → หา header ที่ยังไม่มี → append คอลัมน์ท้าย row1 (ไม่ย้าย/ลบคอลัมน์เดิม ข้อมูลเก่าไม่เลื่อน). Idempotent.
- `setupSheets()` เรียก `ensureHeaders_` ให้ทุก sheet ที่ headers เปลี่ยน (Segments, Segments_TBM2 = SEG_HEADERS ใหม่) + สร้าง SecondaryGrouts/_TBM2.
- **ทุก add/update action** ของฟีเจอร์ใหม่ต้องเรียก `ensureSheet_`+`ensureHeaders_` ก่อนเขียน (ไม่พึ่งว่าผู้ใช้รัน setupSheets มาก่อน) — เหมือน pattern `saveIssue`/`savePrepTask` ที่ inline `ensureSheet_`.
- **แก้ branch `addSegment`/`updateSegment` เดิมด้วย (แก้ finding #R3.1)**: head fields (headV..vrt) ไปผ่าน action segment เดิม ไม่ใช่ action ใหม่ → ต้องเติม `ensureHeaders_(sheetFor_('Segments',machine), SEG_HEADERS)` ก่อนเขียนใน branch เดิม ไม่งั้นถ้ายังไม่รัน setupSheets ค่า head ถูกดรอป.

### S2. Shared ring parser — แก้ finding #11,#12,#R2.12
`getRingNumeric` (helpers.js:50, regex `/\d+/`) รองรับ prefix "P41"→41. `parseRingNo` (profileSection.js:13, regex `/^\d+$/`) **reject** "P41"→null. ⇒ **แก้ `parseRingNo` ให้ prefix-aware ในตัว** (เปลี่ยนเป็น extract `/\d+/` แบบเดียวกับ getRingNumeric) — **ไม่ import `getRingNumeric` เข้า profileSection.js** เพราะ helpers.js ดึง browser-only (`handleFileUpload`/FileReader) จะทำให้ไฟล์ geometry ที่ pure เสีย testability (แก้ #R2.12). Route status (F3) อยู่ UI layer ใช้ `getRingNumeric` ได้ตามปกติ. เพิ่ม test: "P41"/"653"/" P41 " → 41/653/41.

### S3. doPost lock — แก้ finding #10
`lock.tryLock(10000)` ไม่เช็ค return. ⇒ `if (!lock.tryLock(10000)) return jsonOut_({status:'error', message:'busy'})`. release เฉพาะเมื่อได้ lock (try/finally ให้ครบทุก path รวม action ใหม่).

### S4. Error/observability contract — แก้ finding #24,#R2.1
- action เขียนใหม่ (secondary grout, route config, segment-with-head) คืน `{status:'error', message, action}` เมื่อ fail.
- **เพิ่ม unknown-action fallback ใน `doPost`**: ถ้า action ไม่ match ใดเลย → `return jsonOut_({status:'error', message:'unknown action', action})` (กัน typo เช่น `saveRouteConfig` พิมพ์ผิดแล้ว "save" เงียบ).
- `apiCall` (api.js): parse JSON แล้ว **ถ้า `status==='error'` → throw** (ไม่คืนเป็น success object); caller แสดง toast ต่อฟีเจอร์.

### S5. Fetch race guard — แก้ finding #R2.7
`App.jsx` fetch ต่อ activeMachine ไม่มี guard — response TBM1 ที่ช้าอาจทับ state TBM2 หลังสลับเครื่อง (ยิ่งเพิ่ม secondary/machineProgress/routeConfigs ยิ่งเสี่ยง). ⇒ ใส่ `AbortController` หรือ request-sequence id: commit state เฉพาะ response ของ machine ล่าสุดที่เลือก.

### S6. Positions encode-once — แก้ finding #R2.6,#R3.2
ปัจจุบัน client stringify `positions` แล้ว GAS ก็ stringify ซ้ำ (`if(data.positions) data.positions=JSON.stringify(...)`) → double-encoded JSON. ⇒ normalize ครั้งเดียวใน GAS: `if (typeof data.positions !== 'string') data.positions = JSON.stringify(data.positions)` — ใช้กับ **grout write paths ทุกตัว: addGrout/updateGrout (primary) + addSecondaryGrout/updateSecondaryGrout** (ไม่ใช่แค่ secondary; primary ก็เจอบั๊กเดิม โดยเฉพาะ primary ใหม่หลังตัด Re-Grout). ฝั่ง parse (`parsePositions`) รองรับ legacy double-encoded (JSON.parse ซ้ำถ้ายังเป็น string).

---

## Feature 1 — Secondary Grout (dataset แยก, แสดงรวม, ตัด Re-Grout)

### GAS (`../gas-live/Code.js`)
- `const SECONDARY_GROUT_HEADERS = ['id','date','shift','ringNo','excavRing','key','partA','partB','total','pressure','positions','remark','imageUrl','timestamp'];` (= GROUT_HEADERS ลบ `ratio`,`groutPass`). — แก้ finding #4
- setupSheets + ensureHeaders_ สร้าง `SecondaryGrouts`(+`_TBM2`).
- action `addSecondaryGrout`/`updateSecondaryGrout`/`deleteSecondaryGrout`: ทำ `const sh = ensureSheet_(ss, sheetFor_('SecondaryGrouts',machine), SECONDARY_GROUT_HEADERS); ensureHeaders_(sh, SECONDARY_GROUT_HEADERS);` ก่อน append/update/delete + image-upload branch เดิม + stringify positions. — แก้ finding #3
- `getData` เพิ่ม `secondaryGrouts:[...]` ต่อ machine.

### App.jsx (state contract — แก้ finding #7)
- state `secondaryGroutRecords` + `setSecondaryGroutRecords`, parse (`parsePositions`), fetch ต่อ machine.
- ส่ง prop `secondaryGroutRecords` + `setSecondaryGroutRecords` ให้ GroutRecordView / GroutDashboardView / GroutAnalysisView (มี state contract ชัด ไม่ทำ mutation ลอย).

### GroutRecordView.jsx
- ลบ `existingRecord`/`isReGrout` (บรรทัด 16–22,49–53) + branch updateGrout-merge. Primary save = record ธรรมดา.
- `SegmentedToggle` โหมด `Primary|Secondary`; ฟอร์ม/ฟิลด์เดียวกัน; Secondary → `addSecondaryGrout` (ไม่มี `ratio`).
- **Duplicate primary (แก้ finding #5)**: โหมด Primary ถ้า ringNo มี primary อยู่แล้ว → banner เตือน (แนะ Secondary) แต่บันทึกได้. นิยาม dedupe: analysis/summary ใช้ **primary ล่าสุดต่อ ring** (เรียงตาม `timestamp` desc, ตัวแรกต่อ ringNo); Data Log แสดงทุกแถว.
- **RingVisualizer (แก้ finding #8)**: secondary record แสดง `positions` ของตัวเอง เป็นสี secondary (ส้ม) เสมอ — ไม่ overlay กับ primary.

### GroutDashboardView.jsx (Data Log)
- merge `groutRecords`(tag `groutType:'primary'`) + `secondaryGroutRecords`(tag `'secondary'`); คอลัมน์ "ประเภท" + ฟิลเตอร์ All/Primary/Secondary.
- edit/delete route ตาม `groutType` → action + setter ที่ถูก (ใช้ setter จาก props).
- **ratio UI (แก้ finding #6)**: ทุกที่ที่อ่าน `ratio` (status card, badge สี, edit modal) ต้อง branch: `groutType==='secondary'` → แสดง `—`/ซ่อน (ไม่ให้ 0.0% กลายเป็น fail-spec).
- record `groutPass:'Re-Grout'` เก่า: fallback แสดงเป็น primary, ป้องกัน crash เมื่อ field เก่าหาย.

### GroutAnalysisView.jsx (แก้ finding #9)
- ฟิลเตอร์ All/Primary/Secondary. **All-mode = นับ record อิสระ** (ไม่รวม primary+secondary ต่อ ring): total volume/pressure = sum ทุก record ใน scope; unique rings = union ของ ringNo. กราฟ/КPI ที่อิง ratio (histogram, avg ratio, below-spec) = **primary-only** (ซ่อนเมื่อ scope=Secondary; ใน All คิดจาก primary เท่านั้น).

---

## Feature 2 — Head Level tab (Concept A: side-view + trend + VRT)

### Schema/GAS
- `SEG_HEADERS` += `'headV','artV','tailV','vrt'` (ต่อท้าย). Sign: **+ = สูงกว่า design line**. รัน ensureHeaders_ migration (S1).
- **สำรอง** `headH/artH/tailH` (แนวราบ) — ยังไม่เพิ่มเฟสนี้ (เพิ่มเมื่อยืนยันจอ guidance มีแนวราบ → อัปเป็นแบบ B).
- **Audit (แก้ finding #15)**: ตรวจ key ที่ `SegmentRecordView` ส่งเทียบ SEG_HEADERS ก่อน — SEG_HEADERS ปัจจุบัน = [id,date,shift,ringNo,typeRing,keyPos,startTime,endTime,length,startCH,finishCH,problem,imageUrl,timestamp,installType,excavStartTime,excavEndTime,installStartTime,installEndTime,soilVolume,status]. เพิ่มเฉพาะ head fields; ไม่แตะ/ไม่รับผิดชอบ field pre-existing ที่ form อาจส่งแต่ไม่มี header (นอก scope).

### SegmentRecordView.jsx
- เพิ่ม 4 ช่อง optional (Head/Art/Tail mm, VRT °) ส่งไปกับ payload `addSegment`/`updateSegment` เดิม.
- **Reset (แก้ finding #14)**: หลัง save สำเร็จ ต้องล้าง `headV/artV/tailV/vrt` (ไม่ carry ค่าเก่าไปริงถัดไป); คงค่าเฉพาะตอน edit แถวเดิม.

### App.jsx
- parse `headV/artV/tailV/vrt` เป็น number + NaN-guard (`Number.isFinite`).

### constants.js
- `export const HEAD_TOL_MM = 75;` (ย้าย TOL จาก ProfileSectionView.jsx:13 + profileSection.js:40) → import จุดเดียว.

### HeadLevelView.jsx (ใหม่)
- reuse deviationSeries/latestRingState/toleranceBreaches/classifyDeviation (หลังแก้ S2).
- **deviationSeries per-metric filter (แก้ finding #13)**: ไม่ตัดทั้ง record เพราะ `headV` หาย — เก็บ record ที่มีอย่างน้อย 1 ค่า (head/art/tail/vrt) แล้วแต่ละกราฟ/การ์ด filter เฉพาะ metric ของตัวเอง.
- **breach metric-aware (แก้ finding #R2.10)**: `toleranceBreaches` ปัจจุบันดูแค่ `headV` — ทำให้ metric-aware: นับริงที่ **ค่าใดค่าหนึ่งของ Head/Art/Tail** เกิน ±HEAD_TOL_MM (ไม่ใช่ head อย่างเดียว).
- **latestRingState metric-aware (แก้ finding #R3.3)**: ปัจจุบัน filter ทิ้ง record ที่ไม่มี `headV` → เปลี่ยนเป็นเลือกริงล่าสุดที่มี **ค่าใดค่าหนึ่งของ headV/artV/tailV/vrt** แล้ว render ค่าที่ขาดเป็น `—` (ไม่ให้การ์ดว่างเมื่อกรอกแค่บาง metric).
- การ์ด: ริงล่าสุด · Head/Art/Tail ล่าสุด (latestRingState) · pitch = Head−Tail · จำนวนริงเกิน ±75 (นับแบบ metric-aware).
- side-view (แบบ A): จุด H/A/T ตามค่าเบี่ยง (exaggerated) เทียบ design line + แถบ ±75; pitch = Head−Tail (mm).
- trend: Head/Art/Tail vs เลขริง (recharts) + แถบ tolerance + จุด breach. VRT: กราฟแท่งต่อริง.
- รองรับ `readOnly` + `fitAndPrint`.

### Nav/viewer (แก้ finding #16)
- navModel: เพิ่ม `{ id:'head', tab:'head_level', label:'ระดับหัวเจาะ', icon:... }` ในกลุ่ม **Dashboard**.
- App.jsx route: `activeTab==='head_level' → <HeadLevelView readOnly={isViewer} .../>`.
- viewerMode: `VIEWER_TABS` += `'head_level'`. default viewer active tab คงเดิม (`dashboard`).
- mobile: `MOBILE_MORE_TABS` += `'head_level'` (ไม่แตะ bottom bar 5 ปุ่ม).
- `ProfileSectionView` (ภาพตัดธรณีใน Executive) คงเดิม ไม่แตะ.

---

## Feature 3 — Route Distance Table (config แก้ได้, project-wide, ต่อในหน้า Route)

### routeConfig.js (ใหม่) — แก้ finding #17,#18,#23
- **โครงสร้าง**: per-machine leg list (แต่ละเครื่องเส้นทางคนละชุด) + shared project total. Key: `tbmRouteConfig__{machine}` (localStorage) + GAS `PlanConfig` key `routeConfig_{machine}` (key/value pattern เดิม เหมือน `planConfig_`/`distPlanConfig_`). project total เก็บ key `routeProjectTotal` (shared).
- **getData คืนทั้ง 2 เครื่องพร้อมกัน (แก้ finding #R2.3)**: ตารางเป็น project-wide → `getData` ต้องคืน `routeConfigs:{ TBM1, TBM2 }` + `routeProjectTotal` (ไม่ filter ตาม active machine). storage per-machine แต่ read รวม (ไม่ขัดกัน).
- **precedence + naming (แก้ finding #18,#R3.6)**: contract ชื่อ **`routeConfigs` (พหูพจน์) ทุกที่**. อ่านต่อเครื่อง: `getData.routeConfigs[machine]` → ถ้าไม่มี ใช้ localStorage `tbmRouteConfig__{machine}` → ถ้าไม่มี/parse พัง ใช้ seed default (จากรูปที่ 2). malformed JSON = catch → seed (ไม่ throw). **save/load keys**: GAS `PlanConfig` key `routeConfig_TBM1`, `routeConfig_TBM2` (ต่อเครื่อง) + `routeProjectTotal` (shared); `saveRouteConfig` เขียน key ของเครื่องที่แก้.
- leg row: `{ order:'1.2.1', level:int, name, plannedDistance:num, ringStart, ringEnd, remark, statusOverride? }`.
- **validation (แก้ finding #23)**: plannedDistance ≥ 0 (numeric), level ≥ 1, ringStart/ringEnd parse ได้ด้วย getRingNumeric และ ringStart ≤ ringEnd, order ไม่ซ้ำ (ใช้เป็น key). ผิด → กันบันทึก + ชี้จุดผิด.

### Cross-machine progress (GAS) — แก้ finding #19,#R2.5
- `getData` เพิ่ม `machineProgress:{ TBM1:{rings,dist}, TBM2:{rings,dist} }` คำนวณ **เฉพาะ field ตัวเลข**.
- **ต้อง mirror client dedupe (แก้ finding #R2.5)**: RouteScheduleView ทำ `deduplicateRecords` (dedupe ตาม ringNo, prefer Completed) ก่อนรวมระยะ. GAS summary ต้องทำ dedupe แบบเดียวกัน (permanent-only, ต่อ ringNo เลือก Completed) ก่อนนับ/รวม length — ไม่งั้น double-count ริงที่มีแถวซ้ำ/partial. ต้องให้ client cumulative กับ GAS machineProgress ตรงกัน (เพิ่ม test เทียบ 2 ทาง).
- perf: ยอมรับตอนข้อมูลโต (TBM2=0/ข้อมูลไม่ใหญ่); cache = future (risks/out-of-scope).
- client fallback: ถ้า `machineProgress` ไม่มี → เครื่องที่ไม่ได้เลือกโชว์ 0/"—" (ไม่ error).

### Compute (util) — แก้ finding #20,#21,#43
- **record set เดียวใช้ทั้ง actual+status (แก้ finding #R2.5,#R3.5)**: นิยาม `selected(machine)` = permanent ring หลัง dedupe ตาม ringNo (prefer `Completed`; ถ้าริงนั้นมีแต่ `In Progress` ก็ใช้แถวนั้น) — เซ็ตเดียวกันนี้ใช้ทั้งคำนวณ actual และ status และต้องตรงกับ GAS `machineProgress`.
- cumulative bored (machine) = sum length ของ `selected(machine)`.
- ต่อ leg: `actualDoneInLeg` = sum length ของ `selected` ที่ `getRingNumeric(ringNo) ∈ [ringStart, ringEnd]`.
- **status เกณฑ์ตายตัว (แก้ finding #R2.11,#R3.5)**: `maxRing = max(getRingNumeric ของ selected ใน [ringStart,ringEnd])` (นับริงที่ติดตั้งจริงทั้ง Completed/In Progress). **เสร็จ** ถ้า `maxRing ≥ ringEnd`; **กำลังทำ** ถ้ามี selected ในช่วงแต่ `maxRing < ringEnd` (รวมกรณี frontier เป็น In Progress); **ยังไม่เริ่ม** ถ้าไม่มี. `statusOverride` ทับได้.
- **rollup ตายตัว (deterministic)**: คอลัมน์ระยะทางแสดง `plannedDistance` สำหรับแถวโครงสร้าง/แผน; **leaf ที่ status='กำลังทำ'** แสดง `actualDoneInLeg` (= 857.70 ในรูป). แถว parent leg แสดง `plannedDistance` ของ leg (ตรงรูปที่ 2 — parent ไม่ใช่ผลรวม child). Summary rows = machine cumulative actual + %: TBM1% = actual/routeTotal(TBM1); รวม% = (TBM1+TBM2 actual)/projectTotal. (นิยามนี้จงใจให้ parent=planned, ไม่ใช่ sum-of-children เพราะรูปแบบรายงานเป็นแบบนั้น.)
- **ความสอดคล้อง total/% (แก้ finding #R3.4)**: `projectTotal` (13,600) เป็น **authoritative** สำหรับตัวหาร รวม%; seed machine totals (8,874.683 + 4,726 = 13,600.683) ไม่จำเป็นต้องรวมได้พอดี (ตัวเลขจริงรอผู้ใช้ยืนยัน). กัน % เกิน 100 ด้วยการ **clamp `min(100, ...)`** ทุก %; ระบุใน UI ว่า seed totals แก้ได้/โดยประมาณ. (ทางเลือก: ถ้าผู้ใช้ให้เลขเป๊ะ ให้ projectTotal = ผลรวม machine totals.)

### App.jsx state (แก้ finding #R2.4)
- เพิ่ม state + parse + pass-through: `routeConfigs:{TBM1,TBM2}`, `routeProjectTotal`, `machineProgress` → ส่งเข้า `RouteScheduleView` (ไม่ให้ view ไปสร้าง fetch path เอง; ให้ App เป็นเจ้าของ contract ชัดเจน เหมือน secondaryGrout).

### RouteScheduleView.jsx — แก้ finding #22,#R2.8
- **enumerate consumer ของ `TOTAL_ROUTE_DISTANCE`** (chart cumulative, forecast, progress bar, Y-axis domain, route placement, %). **มติ (แก้ contradiction #R2.8): consumer เหล่านี้อยู่ใน scope** — เปลี่ยนจากค่าคงที่เดียวเป็น `routeTotal(activeMachine)` (ปรับ input ของ chart/bar/forecast/Y-axis ให้ตามเครื่องที่เลือก, **ไม่ redesign** ตรรกะภายใน). ไม่มีบรรทัด "ไม่แตะกราฟ" อีกต่อไป.
- **precision (แก้ finding #R2.9)**: routeTotal เก็บค่าละเอียด (TBM1 = **8874.683** ตามเดิม, TBM2 = 4726 จนกว่าผู้ใช้ยืนยันเลขจริง) ภายใน; ปัดเฉพาะตอนแสดง (รูปโชว์ 8,874.00).
- เพิ่มตารางซ้อนชั้น (ลำดับ·เส้นทาง·ระยะทาง·หมายเหตุ) + summary rows ต่อจาก progress bar เดิม.
- โหมด config (ปุ่ม "แก้ไขเส้นทาง"): แก้ค่าแต่ละแถว + เพิ่ม/ลบแถว (order พิมพ์เอง ไม่มี drag) + validation (ข้างบน) → save localStorage + GAS `saveRouteConfig`. `readOnly` viewer ซ่อนปุ่มแก้.

### constants.js
- project total 13,600 + `ROUTE_TOTAL = { TBM1:8874.683, TBM2:4726 }` (ค่าละเอียด seed default; override ได้จาก config; ปัดตอนแสดง).

---

## Testing
- Jest baseline 143 passing — ห้ามทำแดง. เพิ่ม unit test pure functions ใหม่:
  - S2 ring parser: prefix/numeric/whitespace.
  - F1: merge+tag, dedupe primary-ล่าสุด-ต่อ-ring, All-mode aggregation.
  - F2: latestRingState/pitch, per-metric filter (record ที่มีแค่ tailV).
  - F3: routeConfig parse/seed-fallback/validation, actualDoneInLeg (in-range), status (overlap), percent (TBM1% vs รวม%).
- Verify จริง: `npm test` + เปิดแอพ (preview) 3 หน้า + print + viewer + ยิง GAS setupSheets/migration บน sheet สำเนา ก่อนแตะ prod sheet.

## Key decisions & tradeoffs (grill ตัดสิน — ให้ Codex กัด)
1. Secondary = sheet แยก ไม่ผูก primary (ตัด Re-Grout ที่ merge). 2. แสดงรวมในหน้า Grout เดิม (toggle/column/filter). 3. Secondary ไม่คิด ratio → ratio UI เป็น primary-only. 4. Duplicate primary → เตือนแต่บันทึกได้; analysis ใช้ primary-ล่าสุด-ต่อ-ring. 5. Head = Concept A + trend + VRT, เก็บแนวดิ่งเฟสนี้ (สำรองแนวราบ). 6. Sign + = สูงกว่าแบบ. 7. Head กรอกในฟอร์ม segment. 8. ตาราง project-wide (2 เครื่อง+รวม) → ต้องมี GAS machineProgress. 9. routeConfig แก้ค่า+เพิ่ม/ลบแถว (ไม่มี drag/nesting UI). 10. viewer เห็นทั้ง F2+F3.

## Risks / open questions
- Migration GAS ต้องรันบน sheet สำเนา + verify ก่อน prod (S1 ensureHeaders_ additive แต่ยัง touch prod schema).
- ตัด Re-Grout ขณะมีข้อมูลเก่า: legacy record ต้องไม่ crash UI (test ด้วย fixture Re-Grout).
- Cross-machine progress perf ตอนข้อมูลโต (accept now; cache = future).
- ตัวเลข seed F3 (3,056/857.70/TBM2 4,700/ชื่อ "ปากคลองขุง") รอผู้ใช้ยืนยัน — แก้ในแอพได้ ไม่บล็อก.
- **Pre-existing security (finding #R2.2, ยกออกจาก scope):** GAS write endpoint **ทุกตัว**ของแอพ (addGrout/addSegment/saveIssue/... รวมของใหม่) ไม่มี server-side auth — ใครมี GAS URL ยิง write ได้; viewer read-only เป็น client-side UI เท่านั้น. **ไม่ใช่ปัญหาที่ 3 feature นี้สร้าง** (posture เดิมทั้งแอพ) และการใส่ write-token/แยก read-write endpoint กระทบทุก endpoint + front-end = งาน hardening แยก. → บันทึกเป็น follow-up task เฉพาะด้าน security, ไม่ขยาย scope แผนนี้.

## Out of scope (เฟสนี้)
แบบ B (bullseye 2 แกน) + เก็บ head แนวราบ · migration ข้อมูล Re-Grout เก่าเข้า SecondaryGrouts · drag-reorder/nested-tree editor · import/paste head จาก guidance · แตะ `ProfileSectionView` (ภาพตัดธรณี) + **redesign** ตรรกะ chart/bar/forecast (แตะเฉพาะ swap total ให้ per-machine) · แก้ field pre-existing ที่ form ส่งแต่ไม่มี header · caching machineProgress · server-side write auth (follow-up แยก) · deploy→Vercel (หลังผู้ใช้อนุมัติ+ผ่าน review).
