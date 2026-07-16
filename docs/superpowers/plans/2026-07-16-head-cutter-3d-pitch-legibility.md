# Head Cutter 3D — Pitch Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้การ์ด "หัวเจาะ 3D" บนหน้าระดับหัวเจาะ อ่านออกทันทีว่าหัวเจาะ **เงย** หรือ **ก้ม**

**Architecture:** แก้ 2 ไฟล์ — (1) `utils/headPosture.js` เปลี่ยนสูตร pitch จาก linear gain เป็น sqrt saturation (pure + jest-testable) และเพิ่ม helper `pitchLabel()` สำหรับป้ายบอกทิศ (2) `components/views/HeadCutter3D.jsx` เปลี่ยนกล้องเป็น orthographic มองข้างตรง ปิด autoRotate เพิ่มเส้นอ้างอิง 2 เส้นที่วาดทับโมเดล และป้ายบอกค่า ตรรกะที่ทดสอบได้อยู่ใน util ทั้งหมด ส่วน `.jsx` เหลือแต่งาน three.js ที่ต้อง verify ด้วยตา

**Tech Stack:** React 18 (CRA) · three.js (dynamic import) · OrbitControls · jest (CRA built-in) · Tailwind

**Spec:** `docs/superpowers/specs/2026-07-16-head-cutter-3d-pitch-legibility-design.md`

## Global Constraints

- **Zero Hallucination** — ห้ามแสดงองศาจริงของ pitch เพราะไม่รู้ระยะจุดวัด Head↔Tail บน shield แสดง **mm อย่างเดียว** พร้อมกำกับว่ามุมในภาพขยายแล้ว
- **ค่าคงที่ทั้งหมดอิงข้อมูลจริง 370 ริง** (ดึงสดจาก GAS 2026-07-16): `|Head−Tail|` p50 = 23 mm, p90 = 77 mm, max 427 mm
- `PITCH_MAX = 15` (deg) · `PITCH_REF_MM = 75` — ค่าเหล่านี้ต้องตรงกันทั้ง spec/plan/code
- **ห้ามผูก `PITCH_REF_MM` เข้ากับ `HEAD_TOL_MM`** ถึงจะเป็น 75 เท่ากัน — คนละความหมาย (tol = ค่าเบี่ยงต่อจุด, ref = ผลต่าง head−tail)
- **ห้ามแตะ:** การ์ดเป้า 2 แกน · กราฟแนวโน้ม · กราฟ VRT · GAS · โมเดล GLB · `HEAD_TOL_MM` · outlier P487
- **ห้าม commit ไฟล์ของ session อื่น** — `src/components/views/RouteScheduleView.jsx`, `src/ui-ux-pro-max/components/Sidebar.jsx`, `tools/` ค้างอยู่ใน working tree ให้ `git add` เฉพาะไฟล์ที่ระบุในแต่ละ task
- **ต้องคงไว้:** dynamic import ของ three (jest-safe + แยก chunk), dispose ครบทุก geometry/material/renderer/controls, `preserveDrawingBuffer: true` (print), fail-soft เมื่อไม่มี WebGL, print snapshot ผ่าน `toDataURL`

## File Structure

| ไฟล์ | สถานะ | หน้าที่ |
|---|---|---|
| `src/utils/headPosture.js` | Modify | pure — แปลงค่าเบี่ยง mm → มุมแสดงผล + ป้ายบอกทิศ ไม่มี React/three |
| `src/utils/headPosture.test.js` | Modify | jest — คุมสูตรทั้งหมด |
| `src/components/views/HeadCutter3D.jsx` | Modify | three.js scene + กล้อง + เส้นอ้างอิง + ป้าย |

`HeadLevelView.jsx` **ไม่ต้องแก้** — ส่ง prop เดิม (`posture`, `printing`) ครบอยู่แล้ว

---

### Task 1: สูตร pitch แบบ sqrt + helper ป้ายบอกทิศ

**Files:**
- Modify: `src/utils/headPosture.js`
- Test: `src/utils/headPosture.test.js`

**Interfaces:**
- Consumes: (ไม่มี — ไฟล์ pure ไม่ import อะไร)
- Produces:
  - `headPostureAngles(posture) → { pitchDeg: number, rollDeg: number, yawDeg: number }` (signature เดิม, สูตร pitch เปลี่ยน)
  - `pitchLabel(posture) → { dir: "up"|"down"|"level", mm: number, word: string, hint: string } | null`
  - const: `PITCH_MAX = 15`, `PITCH_REF_MM = 75`, `ROLL_GAIN = 20`, `ROLL_MAX = 30`, `YAW_DEG_PER_MM = 0.10`, `YAW_MAX = 18`
  - **ลบ export `PITCH_DEG_PER_MM`** (grep ยืนยันแล้วว่าใช้แค่ในไฟล์ตัวเอง)

- [ ] **Step 1: เขียน test ที่ต้องแดงก่อน**

แทนที่ `src/utils/headPosture.test.js` ทั้งไฟล์:

```js
import { headPostureAngles, pitchLabel, PITCH_MAX, PITCH_REF_MM, ROLL_MAX } from "./headPosture";

describe("headPostureAngles — pitch (sqrt saturation)", () => {
  test("null posture → all zero", () => {
    expect(headPostureAngles(null)).toEqual({ pitchDeg: 0, rollDeg: 0, yawDeg: 0 });
  });

  // sqrt mapping: sign(d) * PITCH_MAX * min(1, sqrt(|d| / PITCH_REF_MM))
  test("ริงล่าสุดจริง P497: +6mm → ~4.2° (เดิม linear ได้แค่ 0.6° = มองไม่เห็น)", () => {
    expect(headPostureAngles({ headV: 41, tailV: 35 }).pitchDeg).toBeCloseTo(4.2426, 3);
  });
  test("มัธยฐานของจริง 23mm → ~8.3°", () => {
    expect(headPostureAngles({ headV: 23, tailV: 0 }).pitchDeg).toBeCloseTo(8.3066, 3);
  });
  test("head สูงกว่า tail → เงย (pitch เป็นบวก)", () => {
    expect(headPostureAngles({ headV: 60, tailV: 0 }).pitchDeg).toBeCloseTo(13.4164, 3);
  });
  test("head ต่ำกว่า tail → ก้ม (pitch เป็นลบ) และสมมาตรกับค่าบวก", () => {
    const down = headPostureAngles({ headV: -50, tailV: 50 }).pitchDeg; // d = -100 → ชนเพดาน
    expect(down).toBe(-PITCH_MAX);
    expect(down).toBe(-headPostureAngles({ headV: 50, tailV: -50 }).pitchDeg);
  });
  test("ที่ PITCH_REF_MM พอดี → ชนเพดาน PITCH_MAX", () => {
    expect(headPostureAngles({ headV: PITCH_REF_MM, tailV: 0 }).pitchDeg).toBe(PITCH_MAX);
  });
  test("outlier P487 (-427mm) → ชนเพดาน ไม่ทำให้ภาพพัง", () => {
    expect(headPostureAngles({ headV: -465, tailV: -38 }).pitchDeg).toBe(-PITCH_MAX);
  });
  test("ค่าน้อยได้มุมมากกว่า linear เดิมเสมอ แต่ยังแยกลำดับได้", () => {
    const a = headPostureAngles({ headV: 6, tailV: 0 }).pitchDeg;
    const b = headPostureAngles({ headV: 23, tailV: 0 }).pitchDeg;
    const c = headPostureAngles({ headV: 53, tailV: 0 }).pitchDeg;
    expect(a).toBeGreaterThan(6 * 0.10);   // ดีกว่าสูตรเดิม
    expect(a).toBeLessThan(b);             // ยังเรียงลำดับถูก
    expect(b).toBeLessThan(c);
  });
  test("head=tail → 0", () => {
    expect(headPostureAngles({ headV: 20, tailV: 20 }).pitchDeg).toBe(0);
  });
});

describe("headPostureAngles — roll/yaw (ไม่เปลี่ยน)", () => {
  test("roll จาก vrt คูณ gain", () => {
    expect(headPostureAngles({ vrt: 0.5 }).rollDeg).toBeCloseTo(10, 5); // 0.5 * 20
  });
  test("roll clamp ที่ ±ROLL_MAX", () => {
    expect(headPostureAngles({ vrt: 10 }).rollDeg).toBe(ROLL_MAX);
  });
  test("yaw จาก headH-tailH", () => {
    expect(headPostureAngles({ headH: 40, tailH: 0 }).yawDeg).toBeCloseTo(4, 5);
  });
  test("metric ขาด → แกนนั้นเป็น 0", () => {
    expect(headPostureAngles({ headV: 30 })).toMatchObject({ rollDeg: 0, yawDeg: 0 });
  });
});

describe("pitchLabel", () => {
  test("null posture → null", () => {
    expect(pitchLabel(null)).toBeNull();
  });
  test("headV หรือ tailV ขาด → null (ไม่เดาว่าเป็น 0)", () => {
    expect(pitchLabel({ headV: 41 })).toBeNull();
    expect(pitchLabel({ tailV: 35 })).toBeNull();
  });
  test("P497 (+6mm) → เงย", () => {
    expect(pitchLabel({ headV: 41, tailV: 35 })).toEqual({
      dir: "up", mm: 6, word: "เงย", hint: "หัวสูงกว่าหาง",
    });
  });
  test("head ต่ำกว่า tail → ก้ม พร้อม mm ติดลบ", () => {
    expect(pitchLabel({ headV: -56, tailV: -3 })).toEqual({
      dir: "down", mm: -53, word: "ก้ม", hint: "หัวต่ำกว่าหาง",
    });
  });
  test("เท่ากัน → ระดับ", () => {
    expect(pitchLabel({ headV: 20, tailV: 20 })).toEqual({
      dir: "level", mm: 0, word: "ระดับ", hint: "หัวเท่าหาง",
    });
  });
  test("headV = 0 ถือว่ามีค่า ไม่ใช่ค่าขาด", () => {
    expect(pitchLabel({ headV: 0, tailV: 10 }).dir).toBe("down");
  });
  test("ปัดเศษ mm เป็นจำนวนเต็ม", () => {
    expect(pitchLabel({ headV: 41.4, tailV: 35.1 }).mm).toBe(6);
  });
});
```

- [ ] **Step 2: รัน test ให้เห็นว่าแดง**

Run: `npx cross-env CI=true npx react-scripts test --testPathPattern=headPosture --watchAll=false`
Expected: FAIL — `pitchLabel is not a function` และเคส sqrt ทั้งหมดพัง (สูตรเดิมยัง linear)

> ถ้า `cross-env` ไม่มีให้ใช้ `set CI=true&& npx react-scripts test ...` (cmd) หรือ `$env:CI="true"; npx react-scripts test ...` (PowerShell)

- [ ] **Step 3: เขียน implementation ให้ผ่าน**

แทนที่ `src/utils/headPosture.js` ทั้งไฟล์:

```js
// แปลงค่าเบี่ยงหัวเจาะของริงล่าสุด → มุมแสดงผล (deg) แบบ EXAGGERATED สำหรับ 3D
// มุมจริงเล็กมาก (ผลต่าง head−tail ระดับ mm บน shield ยาวหลายเมตร) → ต้องขยายจึงจะเห็น
// view แสดงค่า mm จริงกำกับเสมอ · pure + ไม่มี dependency → jest-safe
//
// ทำไม sqrt ไม่ใช่ linear gain:
//   ข้อมูลจริง 370 ริง |head−tail| p50 = 23mm, p90 = 77mm, max 427mm
//   linear gain ที่แรงพอให้ 6mm มองเห็น (~0.67) จะทำให้ค่ามัธยฐาน 23mm ชนเพดานทันที
//   → ทุกริงตั้งแต่ ~27mm ขึ้นไปเอียงเท่ากันหมด เสียการแยกแยะทั้งช่วงที่ใช้งานจริง
//   sqrt ให้มุมเยอะกับค่าน้อย และอิ่มตัวนุ่มนวลกับค่ามาก

export const PITCH_MAX = 15;      // deg — มุมสูงสุดที่แสดง
export const PITCH_REF_MM = 75;   // mm — จุดอิ่มตัว = p90 ของข้อมูลจริง (บังเอิญเท่า HEAD_TOL_MM แต่คนละความหมาย ห้ามผูกกัน)
export const ROLL_GAIN = 20;      // vrt° → deg (roll)
export const ROLL_MAX = 30;
export const YAW_DEG_PER_MM = 0.10; // (headH - tailH) mm → deg (yaw, ซ้าย/ขวา)
export const YAW_MAX = 18;

const num = (v) => (v == null || isNaN(v) ? 0 : Number(v));
const numOrNull = (v) => (v == null || v === "" || isNaN(v) ? null : Number(v));
const clamp = (v, m) => Math.max(-m, Math.min(m, v));

// mm → deg: อิ่มตัวแบบ sqrt คงเครื่องหมายไว้
const pitchFromMM = (d) => Math.sign(d) * PITCH_MAX * Math.min(1, Math.sqrt(Math.abs(d) / PITCH_REF_MM));

export function headPostureAngles(posture) {
  if (!posture) return { pitchDeg: 0, rollDeg: 0, yawDeg: 0 };
  return {
    pitchDeg: pitchFromMM(num(posture.headV) - num(posture.tailV)),
    rollDeg: clamp(num(posture.vrt) * ROLL_GAIN, ROLL_MAX),
    yawDeg: clamp((num(posture.headH) - num(posture.tailH)) * YAW_DEG_PER_MM, YAW_MAX),
  };
}

// ป้ายบอกทิศ ก้ม/เงย สำหรับ overlay — null เมื่อข้อมูลไม่ครบ (ไม่เดาว่าค่าขาด = 0)
export function pitchLabel(posture) {
  if (!posture) return null;
  const h = numOrNull(posture.headV), t = numOrNull(posture.tailV);
  if (h == null || t == null) return null;
  const mm = Math.round(h - t);
  if (mm > 0) return { dir: "up", mm, word: "เงย", hint: "หัวสูงกว่าหาง" };
  if (mm < 0) return { dir: "down", mm, word: "ก้ม", hint: "หัวต่ำกว่าหาง" };
  return { dir: "level", mm: 0, word: "ระดับ", hint: "หัวเท่าหาง" };
}
```

> `Math.sign(0)` คืน `0` → `pitchFromMM(0)` = `0` ถูกต้อง ไม่ต้องกันเคสแยก

- [ ] **Step 4: รัน test ให้เขียว**

Run: `npx cross-env CI=true npx react-scripts test --testPathPattern=headPosture --watchAll=false`
Expected: PASS ทั้งหมด (22 tests)

- [ ] **Step 5: รัน test ทั้งชุด กันของเดิมพัง**

Run: `npx cross-env CI=true npx react-scripts test --watchAll=false`
Expected: PASS ทั้งหมด (baseline ล่าสุด 557 tests) — ถ้ามีตัวแดงที่ไม่ใช่ `headPosture` ให้หยุดและรายงาน อย่าแก้ไฟล์อื่น

- [ ] **Step 6: Commit**

```bash
git add src/utils/headPosture.js src/utils/headPosture.test.js
git commit -m "feat(head-3d): pitch แบบ sqrt saturation + helper ป้าย ก้ม/เงย

สูตรเดิม linear 0.10 deg/mm ทำให้ริงล่าสุด P497 (+6mm) ได้มุมแค่ 0.6°
sqrt: 6mm→4.2° · 23mm(p50)→8.3° · >=75mm(p90)→15° ชนเพดาน
ค่าคงที่อิงข้อมูลจริง 370 ริงจาก GAS ไม่ได้เดา"
```

---

### Task 2: กล้อง orthographic มองข้างตรง + ปิด autoRotate + ปุ่มกลับมุมมาตรฐาน

**Files:**
- Modify: `src/components/views/HeadCutter3D.jsx`

**Interfaces:**
- Consumes: `headPostureAngles(posture) → {pitchDeg, rollDeg, yawDeg}` จาก Task 1
- Produces: (ภายในไฟล์) `resetRef.current: () => void` — React button เรียกเพื่อกลับมุมมาตรฐาน

**บริบทที่ต้องรู้ก่อนแก้:** โมเดล GLB เป็น head-only (Shield + CutterHead) แกนเจาะคือ **+Z** โค้ดเดิมวัด bounding box ตอน GLTF โหลดเสร็จ (`sz = box.getSize(...)`) → ขนาดจริงรู้ได้เฉพาะใน callback ดังนั้นทุกอย่างที่อิงขนาดต้องสร้าง**ใน callback** ไม่ใช่ก่อนหน้า

กล้องอยู่บนแกน X ที่ y = 0 มองเข้า origin → บนจอ: **screen-up = +Y**, **screen-right = −Z** (แกนเจาะชี้ไปทางซ้ายจอ ตรงกับภาพปัจจุบัน) ทำให้ pitch (หมุนรอบ X = แกนสายตา) กลายเป็นการหมุนในระนาบจอตรงๆ = เห็นชัดที่สุด

- [ ] **Step 1: เปลี่ยนกล้องเป็น orthographic + ปิด autoRotate**

ใน `src/components/views/HeadCutter3D.jsx` แทนที่บล็อกกล้อง/controls (บรรทัด ~45-50):

```js
      const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 1000);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.6;
```

ด้วย:

```js
      // Orthographic = ไม่มี perspective มาบิดเบือนการอ่านมุมเอียง (frustum ตั้งจริงหลัง GLB โหลด)
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.autoRotate = false; // มุมข้างตรงมีความหมาย — หมุนเองทำให้อ่าน ก้ม/เงย ไม่ได้

      // fit* ตั้งค่าหลัง GLB โหลด (ต้องรู้ขนาดโมเดลก่อน); camDist ใช้แค่ near/far ไม่มีผลกับขนาดภาพในโหมด ortho
      let fitW = 12, fitH = 8, camDist = 30;
      const setFrustum = () => {
        const W = mount.clientWidth || 400, H = mount.clientHeight || 300;
        const a = W / H;
        const halfH = Math.max(fitH / 2, fitW / 2 / a); // กันโมเดลล้นทั้งแนวตั้งและแนวนอน
        camera.left = -halfH * a; camera.right = halfH * a;
        camera.top = halfH; camera.bottom = -halfH;
        camera.updateProjectionMatrix();
      };
      const resetView = () => {
        camera.position.set(camDist, 0, 0); // แกน X, y=0 → มองข้างตรง 90°
        camera.zoom = 1;
        controls.target.set(0, 0, 0);
        setFrustum();
        controls.update();
      };
      resetRef.current = resetView;
```

- [ ] **Step 2: เพิ่ม `resetRef` ที่หัวคอมโพเนนต์**

เพิ่มถัดจาก `applyRef` (บรรทัด ~9):

```js
  const resetRef = useRef(null); // () => void, กลับมุมมองมาตรฐาน (ตั้งเมื่อ scene พร้อม)
```

- [ ] **Step 3: ตั้ง frustum จากขนาดโมเดลจริงใน GLTF callback**

แทนที่ 4 บรรทัดท้ายของ callback (บรรทัด ~85-88):

```js
          const maxd = Math.max(sz.x, sz.y, sz.z) || 6;
          camera.position.set(maxd * 0.9, maxd * 0.5, maxd * 1.05);
          camera.lookAt(0, 0, 0);
          controls.update();
```

ด้วย:

```js
          // มองจากแกน X: แนวนอนบนจอ = ความยาว (Z), แนวตั้ง = เส้นผ่านศูนย์กลาง (Y)
          // เผื่อ Y เยอะกว่าเพราะพอเอียง 15° ตัวโมเดลกินที่แนวตั้งเพิ่ม
          fitW = (sz.z || 6) * 1.30;
          fitH = (sz.y || 6) * 1.55;
          camDist = (Math.max(sz.x, sz.y, sz.z) || 6) * 3;
          resetView();
```

- [ ] **Step 4: ให้ ResizeObserver ใช้ setFrustum แทนการแก้ aspect**

แทนที่ callback ของ `ro` (บรรทัด ~103-107):

```js
      ro = new ResizeObserver(() => {
        const W = mount.clientWidth, H = mount.clientHeight;
        if (!W || !H) return;
        camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H);
      });
```

ด้วย:

```js
      ro = new ResizeObserver(() => {
        const W = mount.clientWidth, H = mount.clientHeight;
        if (!W || !H) return;
        renderer.setSize(W, H);
        setFrustum(); // ortho ใช้ left/right/top/bottom ไม่ใช่ aspect
      });
```

- [ ] **Step 5: เคลียร์ resetRef ตอน cleanup**

ใน `cleanup` แก้บรรทัด `applyRef.current = null;` เป็น:

```js
        applyRef.current = null;
        resetRef.current = null;
```

- [ ] **Step 6: เพิ่มปุ่มกลับมุมมาตรฐาน**

ใน JSX เพิ่มถัดจาก `<div ref={mountRef} ... />` (ก่อนบล็อก `{printing && snap && ...}`):

```jsx
      {!err && !printing && (
        <button
          type="button"
          onClick={() => resetRef.current && resetRef.current()}
          className="absolute right-2 top-2 px-2 py-1 text-[11px] font-semibold text-ink-3 hover:text-navy bg-surface/80 hover:bg-cyan-tint rounded-input border border-line print:hidden"
          title="กลับมุมมองด้านข้างมาตรฐาน"
        >
          มุมมาตรฐาน
        </button>
      )}
```

- [ ] **Step 7: verify ด้วยตาว่ากล้องเข้าที่และ pitch อ่านได้**

Run: เปิด preview (`preview_start` ตาม `.claude/launch.json`) → ไปแท็บ **ระดับหัวเจาะ**
Expected:
- หัวเจาะเป็นภาพด้านข้าง หัว (หน้าตัด) อยู่ **ซ้าย** ไม่หมุนเอง
- P497 (+6mm) เอียง 4.2° → **หัวชี้ขึ้นเล็กน้อย = เงย** ถ้าเห็นหัวชี้ลง แสดงว่า sign กลับด้าน → แก้ที่ `applyPosture` (`tiltGroup.rotation.set(-pitchDeg*DEG, ...)` → ตัด `-` ออก) แล้ว verify ซ้ำ
- กดปุ่ม "มุมมาตรฐาน" หลังลากหมุน → กลับมามองข้างตรง
- ย่อ/ขยายหน้าต่าง → ภาพไม่ยืดผิดสัดส่วน
- console ไม่มี error

- [ ] **Step 8: Commit**

```bash
git add src/components/views/HeadCutter3D.jsx
git commit -m "feat(head-3d): กล้อง orthographic มองข้างตรง + ปิด autoRotate + ปุ่มมุมมาตรฐาน

หัวข้อการ์ดเขียน 'ท่าทางด้านข้าง' แต่กล้องเดิมอยู่มุม 3/4 ยกสูงและหมุนตลอด
ทำให้ไม่มีเส้นขอบฟ้านิ่งให้ตาเทียบ"
```

---

### Task 3: เส้นอ้างอิง 2 เส้น + ป้ายบอกค่า + แก้บั๊ก VRT ปัดเศษ

**Files:**
- Modify: `src/components/views/HeadCutter3D.jsx`

**Interfaces:**
- Consumes: `pitchLabel(posture) → {dir, mm, word, hint} | null` จาก Task 1 · `resetRef` จาก Task 2
- Produces: (ไม่มี — ไม่มี task ต่อจากนี้)

**บั๊กที่แก้:** `fmt()` ใช้ `Math.round()` กับ VRT ที่เป็นทศนิยม → VRT จริง −0.3° แสดงเป็น `0°` (ข้อมูลจริง p50 = 0.15°, p90 = 0.48° → **ค่า VRT ส่วนใหญ่ปัดเป็น 0 หมด** ป้ายนี้แทบไม่เคยบอกอะไรเลย)

- [ ] **Step 1: import pitchLabel**

แก้บรรทัด 2:

```js
import { headPostureAngles } from "../../utils/headPosture";
```

เป็น:

```js
import { headPostureAngles, pitchLabel } from "../../utils/headPosture";
```

- [ ] **Step 2: ลบเส้นอ้างอิงเดิมที่โดน depth test บัง**

ลบบล็อกนี้ทั้งหมด (บรรทัด ~52-57) — เส้นนี้ลากผ่านใจกลางโมเดลเลยถูกบังจนเห็นแค่ปลายแดงสั้นๆ จะสร้างใหม่ใน GLTF callback ที่รู้ขนาดโมเดลแล้ว:

```js
      // Faint design-line reference (the axis the head tilts against): red dashed +Z line.
      const refMat = new THREE.LineBasicMaterial({ color: 0xB23A34, transparent: true, opacity: 0.55 });
      const refGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, -6), new THREE.Vector3(0, 0, 6),
      ]);
      scene.add(new THREE.Line(refGeo, refMat));
```

- [ ] **Step 3: สร้างเส้นอ้างอิง 2 เส้นใน GLTF callback**

ใน callback ต่อจาก `resetView();` (ที่เพิ่มใน Task 2 Step 3) เพิ่ม:

```js
          // เส้นอ้างอิง 2 เส้น — มุมระหว่างสองเส้นคือ ก้ม/เงย
          // depthTest:false + renderOrder สูง → วาดทับโมเดล (ของเดิมถูกตัวโมเดลบังจนมองไม่เห็น)
          const L = (sz.z || 6) * 0.58; // ครึ่งความยาว ยาวกว่าตัวโมเดลเล็กน้อย
          const mkLine = (Mat, color, extra) => {
            const m = new Mat({ color, depthTest: false, transparent: true, ...extra });
            const l = new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -L), new THREE.Vector3(0, 0, L)]),
              m
            );
            l.computeLineDistances(); // จำเป็นสำหรับเส้นประ; ไม่มีผลกับเส้นทึบ
            l.renderOrder = 999;
            return l;
          };
          // แนวออกแบบ: อยู่นอก tiltGroup → นอนราบเสมอ
          scene.add(mkLine(THREE.LineDashedMaterial, 0xB23A34, {
            opacity: 0.9, dashSize: (sz.z || 6) * 0.035, gapSize: (sz.z || 6) * 0.025,
          }));
          // แกนเครื่องจริง: อยู่ใน tiltGroup → เอียงตามหัวเจาะ
          tiltGroup.add(mkLine(THREE.LineBasicMaterial, 0x243B53, { opacity: 0.95 }));
```

> `LineBasicMaterial` ไม่รองรับ `dashSize/gapSize` — spread `extra` ที่ไม่มีคีย์เหล่านั้นจึงไม่มีผล
> **linewidth ใช้ไม่ได้บน WebGL** (เส้นหนา 1px เสมอ) — ถ้า verify แล้วเส้นบางเกินไป ให้เปลี่ยนเป็น `THREE.Mesh` + `BoxGeometry(t, t, L*2)` + `MeshBasicMaterial` ซึ่งคุมความหนาได้จริง

- [ ] **Step 4: แก้ป้ายล่าง — VRT ทศนิยม 1 ตำแหน่ง + คำอธิบายเส้น**

แทนที่บล็อกป้ายล่างใน JSX (บรรทัด ~150-152):

```jsx
        <div className="absolute left-3 bottom-2 text-[11px] text-ink-3 font-semibold pointer-events-none">
          {posture ? <>H {fmt(posture.headV)}·A {fmt(posture.artV)}·T {fmt(posture.tailV)} mm · VRT {fmt(posture.vrt)}° <span className="opacity-70">(มุมขยายให้เห็นชัด)</span></> : "—"}
        </div>
```

ด้วย:

```jsx
        <div className="absolute left-3 bottom-2 right-3 text-[11px] text-ink-3 font-semibold pointer-events-none leading-relaxed">
          {posture ? (
            <>
              H {fmt(posture.headV)}·A {fmt(posture.artV)}·T {fmt(posture.tailV)} mm · VRT {fmtDeg(posture.vrt)}°
              <br />
              <span className="opacity-80">
                <i className="inline-block w-3 h-[2px] align-middle mr-1" style={{ background: "#B23A34" }} />แนวออกแบบ
                <i className="inline-block w-3 h-[2px] align-middle mr-1 ml-2.5" style={{ background: "#243B53" }} />แกนเครื่อง
                <span className="ml-2.5">มุมในภาพขยายให้เห็นชัด ไม่ใช่สเกลจริง</span>
              </span>
            </>
          ) : "—"}
        </div>
```

- [ ] **Step 5: เพิ่ม `fmtDeg` ท้ายไฟล์**

แก้บรรทัดสุดท้าย:

```js
const fmt = (v) => (v == null || isNaN(v) ? "—" : `${v > 0 ? "+" : ""}${Math.round(v)}`);
```

เป็น:

```js
const fmt = (v) => (v == null || isNaN(v) ? "—" : `${v > 0 ? "+" : ""}${Math.round(v)}`);
// VRT เป็นทศนิยม (ของจริง p50 = 0.15°, p90 = 0.48°) — Math.round ทำให้เกือบทุกริงกลายเป็น 0
const fmtDeg = (v) => (v == null || isNaN(v) ? "—" : `${v > 0 ? "+" : ""}${Number(v).toFixed(1)}`);
```

- [ ] **Step 6: เพิ่มป้ายเด่น ก้ม/เงย บนซ้าย**

เพิ่มก่อนบล็อก `{err ? ... : ...}` ใน JSX:

```jsx
      {!err && (() => {
        const pl = pitchLabel(posture);
        if (!pl) return null;
        const tone = pl.dir === "level" ? "text-ink-3" : "text-navy";
        const arrow = pl.dir === "up" ? "▲" : pl.dir === "down" ? "▼" : "–";
        return (
          <div className="absolute left-3 top-2 pointer-events-none">
            <div className={`text-[15px] font-bold ${tone}`}>
              {arrow} {pl.word} {pl.mm > 0 ? "+" : ""}{pl.mm} mm
            </div>
            <div className="text-[11px] text-ink-3 font-semibold">{pl.hint}</div>
          </div>
        );
      })()}
```

> ใช้โทน navy โทนเดียวสำหรับทั้ง เงย/ก้ม (ไม่ใช่เขียว/แดงอย่างที่ spec ร่างไว้ตอนแรก) — **ตั้งใจเบี่ยงจาก spec**: เงย/ก้ม เป็นทิศทาง ไม่ใช่ดี/แย่ ใส่สีเขียว-แดงจะสื่อการตัดสินที่ไม่มีอยู่จริง ลูกศร + คำไทยชัดพออยู่แล้ว · "ระดับ" ใช้สีจาง (ไม่มีอะไรต้องรายงาน)

- [ ] **Step 7: verify ด้วยตา**

Run: preview → แท็บ **ระดับหัวเจาะ**
Expected:
- เห็นเส้นแดงประนอนราบ (แนวออกแบบ) กับเส้น navy ทึบ (แกนเครื่อง) ตัดกันเป็นรูปลิ่ม **ทับตัวโมเดล ไม่โดนบัง**
- ป้ายบนซ้าย: `▲ เงย +6 mm` / `หัวสูงกว่าหาง` — **ทิศต้องตรงกับเส้น navy ที่เอียง และตรงกับการ์ด KPI "ก้ม/เงย (Head−Tail)" ด้านบน**
- ป้ายล่าง VRT แสดง `-0.3°` ไม่ใช่ `0°`
- ถ้าเส้นบางเกินไป → เปลี่ยนเป็น Mesh + BoxGeometry ตามหมายเหตุใน Step 3

- [ ] **Step 8: verify เคส "ก้ม" (ทิศตรงข้าม) — ปิดประเด็นค้างจาก spec เดิม**

spec เดิม (2026-07-09) ค้างไว้ว่า *"sign convention ยัง verify visual ไม่ชัด"* เพราะ 0.6° ดูไม่ออก คราวนี้ต้องปิดให้จบ

Run: ใน DevTools console ของ preview
```js
// P489 ของจริงเป็นเงย (+48) — ใช้ค่าติดลบเพื่อทดสอบทิศตรงข้าม
```
วิธีที่เชื่อถือได้กว่า: แก้ `HeadLevelView.jsx` ชั่วคราวให้ส่ง `posture={{...latest, headV: -56, tailV: -3}}` เข้า `<HeadCutter3D/>` แล้วดูภาพ
Expected: ป้ายเป็น `▼ ก้ม -53 mm` และหัวเจาะ (ฝั่งซ้ายจอ) **ชี้ลง** ต่ำกว่าเส้นแดง
**สำคัญ: revert การแก้ชั่วคราวก่อน commit** — `git diff src/components/views/HeadLevelView.jsx` ต้องว่าง

- [ ] **Step 9: รัน test + build**

Run: `npx cross-env CI=true npx react-scripts test --watchAll=false`
Expected: PASS ทั้งหมด

Run: `npm run build`
Expected: `Compiled successfully.` ไม่มี warning ใหม่

- [ ] **Step 10: Commit**

```bash
git add src/components/views/HeadCutter3D.jsx
git commit -m "feat(head-3d): เส้นแนวออกแบบ/แกนเครื่องวาดทับโมเดล + ป้าย ก้ม/เงย + fix VRT ปัดเศษ

- เส้นอ้างอิงเดิมลากผ่านใจกลางโมเดล โดน depth test บังจนเห็นแค่ปลาย
- VRT ใช้ Math.round ทำให้ค่าจริงส่วนใหญ่ (p90 = 0.48°) แสดงเป็น 0 -> ทศนิยม 1 ตำแหน่ง"
```

---

## Self-Review

**1. Spec coverage**

| หัวข้อ spec | Task ที่รับผิดชอบ |
|---|---|
| §4A สูตร sqrt (`PITCH_MAX=15`, `PITCH_REF_MM=75`) | Task 1 Step 3 |
| §4A roll/yaw คงเดิม | Task 1 Step 3 + test ใน Step 1 |
| §4B ortho + ข้างตรง + ปิด autoRotate + resize + ปุ่ม reset | Task 2 Steps 1-6 |
| §4B คงการหมุนหน้าหัวเจาะ | ไม่แตะ `cutterFace.rotation.z` — คงอยู่ |
| §4C เส้นอ้างอิง 2 เส้น (depthTest:false, renderOrder) | Task 3 Steps 2-3 |
| §4D ป้ายเด่น ▲/▼/– | Task 3 Step 6 |
| §4D VRT ทศนิยม 1 ตำแหน่ง | Task 3 Steps 4-5 |
| §4D ไม่แสดงองศาจริงของ pitch | Task 1 `pitchLabel` คืนแค่ `mm` — ไม่มีทางแสดงองศาจริงได้ |
| §6.1 jest ผ่าน | Task 1 Step 5, Task 3 Step 9 |
| §6.2 build ผ่าน | Task 3 Step 9 |
| §6.3 screenshot ที่ P497 บอกได้ว่าเงย | Task 3 Step 7 |
| §6.4 verify ค่าลบ = ก้ม ทิศไม่กลับ | Task 3 Step 8 |
| §7 ความเสี่ยง sign กลับด้าน | Task 2 Step 7 + Task 3 Step 8 ระบุวิธีแก้ไว้ชัด |

ครบทุกข้อ ไม่มีช่องว่าง

**2. Placeholder scan** — ไม่มี TBD/TODO/"handle edge cases" ทุก step ที่แก้โค้ดมีโค้ดจริงครบ

**3. Type consistency**
- `pitchLabel` → `{dir, mm, word, hint}` — ประกาศใน Task 1 Interfaces, test ใน Task 1 Step 1, ใช้ใน Task 3 Step 6 ชื่อคีย์ตรงกันทั้งหมด ✓
- `resetRef.current` — ประกาศ Task 2 Step 2, เซ็ต Step 1, ใช้ Step 6, เคลียร์ Step 5 ✓
- `setFrustum` / `resetView` / `fitW` / `fitH` / `camDist` — นิยาม Task 2 Step 1, ใช้ Steps 3-4 ✓
- `fmtDeg` — นิยาม Task 3 Step 5, ใช้ Step 4 ✓ (Step 4 ใช้ก่อน Step 5 นิยาม แต่เป็น function declaration ระดับ module → hoisting ไม่เกี่ยง เพราะเป็น `const` arrow ที่ประเมินตอน import ก่อน render — ปลอดภัย)
- `L` / `mkLine` — นิยามและใช้ใน Task 3 Step 3 scope เดียวกัน ✓
