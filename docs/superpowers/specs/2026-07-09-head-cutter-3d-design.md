# หัวเจาะ 3D สด (interactive) ในหน้า "ระดับหัวเจาะ"

- **วันที่:** 2026-07-09
- **สถานะ:** design (รอ user review)
- **ขอบเขต:** เปลี่ยนหัวเจาะในหน้า `HeadLevelView` จาก PNG snapshot นิ่ง → โมเดล GLB 3D สด หมุน/ซูมได้ + เอียงตามท่าจริงของริงล่าสุด

---

## 1. Context & Goal

หน้า **"ระดับหัวเจาะ"** ([HeadLevelView.jsx](../../../src/components/views/HeadLevelView.jsx)) แสดงค่าเบี่ยงหัวเจาะ Head/Art/Tail (แนวดิ่ง V + แนวราบ H) + roll (VRT) เทียบแนวออกแบบ ปัจจุบัน panel "ท่าทางหัวเจาะ (ด้านข้าง)" ใช้ **PNG snapshot นิ่ง** ที่ render จากโมเดล procedural หยาบ (`renderTBMSprite` → `makeTBM`, 6 แขน ฟันเป็นกล่อง) วางทับตรงตำแหน่งหัวใน SVG schematic

**เป้าหมาย:** แทนด้วยหัวเจาะ **3D สด** จากโมเดล GLB ที่ละเอียดสวยกว่า (`export-3d/prem-tbm-epb.glb`) — โต้ตอบได้ (หมุน/ซูม) และเอียงตามท่าจริง (ก้ม/เงย/roll) เพื่อสื่อความหมาย "ระดับหัวเจาะ" โดยตรง

**Requirements ที่เคาะกับผู้ใช้แล้ว:**
- ขอบเขตโมเดล = `Shield` + `CutterHead` เท่านั้น (ตัด `TunnelLining`)
- ปลายทาง = หน้า `HeadLevelView` (ไม่ใช่แผนที่ 3D)
- รูปแบบ = 3D สด หมุน/ซูมได้ + เอียงตามท่าจริง
- Layout = **A1**: 3D แทน panel "Side-view" เดิม (ช่องขวาใน grid) — เก็บ Bullseye + Trend + VRT ครบ

## 2. ข้อเท็จจริงที่ verify แล้ว

| รายการ | ผล |
|--------|-----|
| three version | `^0.184.0` — GLTFLoader + OrbitControls มีใน `node_modules` ✓ |
| GLB scene graph | `PremTBM_EPB` → `Shield` (14 meshes) · `TunnelLining` (81) · `CutterHead` (294); root ตรงตาม README แยก node ได้ |
| โมเดลที่เอา | Shield + CutterHead = **308 meshes** (ตัด TunnelLining ออก 81) |
| perf note | CutterHead หนัก 294 meshes → live canvas มี ~308 draw calls/เฟรม (desktop ไหว, มือถือกลาง-ล่างอาจ jank ตอนหมุน) |
| `public/` | มีอยู่ (index.html, tbm-3d-a.html, ...) ยังไม่มี `models/` → สร้างใหม่ |
| `tbmSprite.js` usage | ใช้ที่ `HeadLevelView` (จะแก้) + `ProfileSectionView` (คงอยู่) → **ห้ามลบ** tbmSprite.js |

## 3. Architecture

```
HeadLevelView (แก้)
├── KPI cards            คงเดิม
├── grid 2 คอลัมน์
│   ├── Bullseye 2 แกน    คงเดิม
│   └── HeadCutter3D ◄──  ใหม่ (แทน side-view SVG + PNG sprite)
├── Trend chart          คงเดิม
└── VRT bar              คงเดิม

HeadCutter3D (ใหม่) ── dynamic import three/GLTFLoader/OrbitControls
   ├── โหลด /models/prem-tbm-head.glb  (asset ใหม่)
   ├── headPostureAngles(posture) ◄── util ใหม่ (pure, jest-test)
   └── dispose ครบตอน unmount
```

**หลัก isolation:** `HeadCutter3D` เป็นหน่วยเดียวจบ — รับ `posture` เข้า, จัดการ three.js lifecycle เอง, ไม่รู้เรื่อง chart/state อื่น สลับเข้า-ออก HeadLevelView ได้โดยไม่กระทบส่วนอื่น

## 4. Asset prep (Claude เลือกตอนทำ: B1 ก่อน, fallback B2)

**B1 (primary) — bake ไฟล์ head-only ใหม่**
- แก้ `export-3d/build-tbm-glb.mjs`:
  1. เปลี่ยน import path `../web/node_modules/three` → `../TunnelBoringMonitoring/node_modules/three` (web/ หายแล้ว; three 0.184 GLTFExporter API compatible)
  2. `buildMachine()` ไม่ต้อง add `tunnel` group (ตัด TunnelLining) — เก็บ Shield + CutterHead
  3. verify block ตรวจ `CutterFace` present เหมือนเดิม
- output → คัดลอกไป `public/models/prem-tbm-head.glb`

**B2 (fallback ถ้า B1 build ไม่ผ่าน) — strip runtime**
- คัดลอก `prem-tbm-epb.glb` เต็ม → `public/models/`
- ใน `HeadCutter3D`: หลังโหลด `gltf.scene.getObjectByName('TunnelLining')?.removeFromParent()` + dispose geometry/material ของ subtree นั้น

เกณฑ์เลือก: ลอง B1 ก่อน (ไฟล์เล็ก + สะอาด "มีแค่หัวเจาะ"); ถ้ารัน build ไม่ผ่าน (dependency/API) → B2

## 5. Component: `HeadCutter3D.jsx`

**Props:** `{ posture, machine = "TBM1", readOnly = false, className }`
`posture` = ค่าริงล่าสุด (`latestRingState`): `{ ringNo, headV, artV, tailV, headH, artH, tailH, vrt }`

**พฤติกรรม:**
- Mount: dynamic `import("three")` + GLTFLoader + OrbitControls (jest-safe — ไม่ import ที่ top-level; คืน null ถ้าไม่มี WebGL/`document`)
- Scene: หัวเจาะ (โหลดครั้งเดียว) + `HemisphereLight` + `DirectionalLight` ×1–2 + เส้น/ระนาบ "แนวออกแบบ" อ้างอิงบางๆ (ให้เห็นว่าเอียงเทียบอะไร) + พื้น grid จาง (optional)
- Camera: perspective, fit จาก `Box3` ของโมเดล (เหมือน tbmSprite) มุมเริ่ม 3/4 ด้านข้าง
- `OrbitControls`: enable หมุน/ซูม, `autoRotate` ช้าๆ ตอน idle (หยุดเมื่อผู้ใช้จับ), จำกัด zoom min/max
- RAF loop: `controls.update()` + render; ผูก/คืนด้วย mount/unmount
- **Resize:** `ResizeObserver` บน container → ปรับ `camera.aspect` + `renderer.setSize`
- **Dispose ตอน unmount:** traverse geometry/material dispose + `renderer.dispose()` + `controls.dispose()` + ยกเลิก RAF + disconnect observer (กัน WebGL context leak — บทเรียนจาก AlignmentMap)
- **Overlay (HTML บน canvas):** ป้ายค่าจริงริงล่าสุด — `H {headV} · A {artV} · T {tailV} mm` + สถานะ "ก้ม/เงย {Head−Tail} mm" + "VRT {vrt}°" + หมายเหตุ "*มุมขยายให้เห็นชัด*"

**หมายเหตุ material:** GLB ใช้ `MeshStandardMaterial` อยู่แล้ว (ปลอดภัย — bug MeshPhysicalMaterial ทำ GL เพี้ยนเกิดตอน share context กับ maplibre เท่านั้น; หน้านี้ canvas แยก ไม่ share)

## 6. Posture mapping: `utils/headPosture.js` (pure, jest-test)

`headPostureAngles(posture)` → `{ pitchDeg, rollDeg, yawDeg }` (deg สำหรับหมุนกลุ่มโมเดล)

**ปัญหาเชิงกายภาพ (สำคัญ):** ค่าเบี่ยงจริงเล็กมากเทียบความยาว shield — Head−Tail 75 mm บน shield ~10 m ≈ arctan(0.075/10) ≈ **0.43°** มองด้วยตาไม่เห็น → ต้อง **ขยายมุม (exaggerate)** ให้เห็น *พร้อมแสดงค่าจริง (mm/°) กำกับเสมอ* — ผู้ใช้ยืนยัน default นี้แล้ว (เหมือน side-view เดิมที่ป้าย "ขยายมาตราส่วนให้เห็นชัด")

**สูตร (visualization constants — ค่าเริ่มต้น ปรับได้):**
- `pitchDeg = clamp((headV − tailV) × PITCH_DEG_PER_MM, ±PITCH_MAX)` — เริ่ม `PITCH_DEG_PER_MM = 0.10`, `PITCH_MAX = 18°` (75mm→7.5°, 150mm→15°)
- `rollDeg  = clamp(vrt × ROLL_GAIN, ±ROLL_MAX)` — เริ่ม `ROLL_GAIN = 20`, `ROLL_MAX = 30°` (0.3°→6°, 1°→20°)
- `yawDeg   = clamp((headH − tailH) × YAW_DEG_PER_MM, ±YAW_MAX)` — optional (มีเมื่อมี H data); เริ่มค่าเดียวกับ pitch

**Sign convention (ยืนยันกับข้อมูลจริงตอน implement):**
- `headV > tailV` (หัวสูงกว่าหาง) = **เงย/nose-up** → หัวเจาะเชิดขึ้น
- `vrt +` = โมเดล roll ตามทิศที่ตกลง (มองจากท้ายตามทิศเจาะ) — ต้องเทียบกับความหมาย VRT ในข้อมูลจริงตอน implement
- ค่า null → มุม = 0 (ไม่เอียง)

**Edge/temporal:** ไม่มีข้อมูลริง → HeadCutter3D แสดงหัวเจาะท่าตรง (มุม 0) หรือ empty note; `latest` เป็น null จัดการได้

## 7. HeadLevelView — สิ่งที่เปลี่ยน (surgical)

- **ลบ:** `import { renderTBMSprite }` (บรรทัด 14), `tbm` state + `useEffect` (บรรทัด 23–24), panel SVG "Side-view (attitude)" (บรรทัด 152–185) รวม geometry `sv` (บรรทัด 56–66) ถ้าไม่มีใช้ต่อ
- **เพิ่ม:** `import HeadCutter3D` + วางแทนช่องขวาใน grid: `<HeadCutter3D posture={latest} machine={machine} readOnly={readOnly} />`
- **คงเดิม:** KPI cards · Bullseye 2 แกน (ช่องซ้าย) · Trend chart · VRT bar
- **readOnly (viewer `?view=1`):** 3D หมุน/ซูมได้ (สอดคล้องที่เคยให้ปุ่มกล้อง 3D กดได้ในโหมด viewer); ไม่มีปุ่ม edit
- **Print:** canvas ปริ้นตรงไม่ได้ → ตอน `printing=true` render หัวเจาะเป็น **PNG snapshot** (reuse แนวคิด/หรือเรียก `renderTBMSprite` เวอร์ชันที่ชี้ GLB) วางแทน canvas ในโหมดปริ้น; คง `fitAndPrint` landscape 1 หน้า

## 8. Testing & Verification

**jest (ต้องคง baseline ผ่าน):**
- `headPosture.test.js` — pure util: sign ถูก (เงย/ก้ม), clamp ทำงาน, null → 0, roll จาก vrt, yaw เมื่อมี H
- `HeadCutter3D` ต้อง jest-safe: import ได้โดยไม่โหลด three (dynamic import) — เทสต์ render แบบ shallow ไม่ crash

**browser (verify ก่อนเคลมเสร็จ — evidence ก่อน assertion):**
- canvas mount: โมเดลโหลด, ไม่ WebGL context-lost, ไม่ console error
- หมุน/ซูมได้ (OrbitControls), autoRotate idle
- posture: เปลี่ยนริง/mock ค่า → หัวเจาะเอียงตาม + ป้ายค่าตรง
- unmount→remount (สลับแท็บ/เครื่อง): dispose สะอาด ไม่ leak context
- ⚠ screenshot หน้า 3D มัก **time out** เพราะ RAF loop (บทเรียน AlignmentMap) → verify ด้วย eval/`toDataURL` แทน screenshot ตรง

## 9. ไฟล์ที่กระทบ

| ไฟล์ | การเปลี่ยน |
|------|-----------|
| `export-3d/build-tbm-glb.mjs` | (B1) แก้ export head-only + fix three path |
| `public/models/prem-tbm-head.glb` (หรือ `-epb.glb` ถ้า B2) | **ใหม่** — asset |
| `src/components/views/HeadCutter3D.jsx` | **ใหม่** — 3D canvas component |
| `src/utils/headPosture.js` | **ใหม่** — pure util + test |
| `src/utils/__tests__/headPosture.test.js` | **ใหม่** — jest |
| `src/components/views/HeadLevelView.jsx` | แก้ — แทน side-view panel |
| `src/utils/tbmSprite.js` | **ไม่ลบ** (ProfileSection ใช้); อาจเพิ่มออปชันโหลด GLB สำหรับ print snapshot |

## 10. Out of scope / ความเสี่ยง

- **ไม่แตะ:** GAS backend, schema ข้อมูล, Bullseye/Trend/VRT, ProfileSectionView, AlignmentMapView
- **Perf (308 draw calls):** MVP ไม่ merge geometry ก่อน (YAGNI); ถ้าเจอ jank บนมือถือ → optimize ทีหลัง (merge ตามวัสดุ คง CutterFace แยก เหลือ ~16 draw calls — README ระบุทางไว้)
- **Branch:** implement บน feature branch แยก (ไม่ commit ตรง main/prod); push→Vercel เมื่อผู้ใช้ OK เท่านั้น
- **Sign convention** ต้องยืนยันกับข้อมูล VRT จริงตอน implement (กัน physical logic กลับด้าน)
