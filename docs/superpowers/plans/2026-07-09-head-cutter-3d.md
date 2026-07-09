# Interactive 3D Cutterhead in Head-Level View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static PNG cutterhead sprite in `HeadLevelView`'s side-view panel with a live, orbit-controllable GLB model (Shield + CutterHead only) that tilts to the latest ring's real posture.

**Architecture:** A new self-contained `HeadCutter3D` component owns all three.js lifecycle (dynamic-imported GLTFLoader + OrbitControls on a standalone canvas, disposed on unmount). A pure `headPosture` util converts the latest ring's Head/Art/Tail/VRT deviations into exaggerated display angles. `HeadLevelView` swaps its side-view SVG panel for `<HeadCutter3D>`; bullseye, trend, and VRT charts are untouched. The GLB asset is baked head-only (TunnelLining stripped) into `public/models/`.

**Tech Stack:** React 18 (CRA), three `^0.184` (dynamic import), GLTFLoader + OrbitControls (three/examples/jsm), Tailwind (CMI design system), jest (react-scripts).

## Global Constraints

- three stays `^0.184.0` — do NOT downgrade; import via `await import(...)` only (never top-level) so it stays out of the main bundle and jest-safe.
- Materials: `MeshStandardMaterial` only (GLB already complies) — `MeshPhysicalMaterial` corrupts shared GL contexts.
- Angles shown are EXAGGERATED for visibility; the real mm/° values MUST always be displayed alongside.
- Do NOT touch: GAS backend, data schema, Bullseye / Trend / VRT sections, `ProfileSectionView`, `AlignmentMapView`.
- Do NOT delete `src/utils/tbmSprite.js` (still used by `ProfileSectionView`).
- CMI design tokens for any DOM: `bg-surface`, `border-line`, `rounded-card`, `shadow-card`, `text-ink` / `text-ink-2` / `text-ink-3`.
- Work on branch `feat/head-cutter-3d`. Do NOT push (push → Vercel prod) until the user approves.
- Every task ends green: run `npm test` (CRA jest) — baseline must stay passing.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

Paths below are relative to repo root `TunnelBoringMonitoring/` unless prefixed `../` (the sibling `export-3d/`).

---

## Task 1: Posture util `headPosture.js` (pure, TDD)

**Files:**
- Create: `src/utils/headPosture.js`
- Test: `src/utils/__tests__/headPosture.test.js`

**Interfaces:**
- Produces: `headPostureAngles(posture)` → `{ pitchDeg, rollDeg, yawDeg }` (numbers, degrees). `posture` is a `latestRingState` object `{ headV, tailV, headH, tailH, vrt, ... }` or `null`.
- Produces (constants): `PITCH_DEG_PER_MM=0.10`, `PITCH_MAX=18`, `ROLL_GAIN=20`, `ROLL_MAX=30`, `YAW_DEG_PER_MM=0.10`, `YAW_MAX=18`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/headPosture.test.js`:

```js
import { headPostureAngles, PITCH_MAX, ROLL_MAX } from "../headPosture";

describe("headPostureAngles", () => {
  test("null posture → all zero", () => {
    expect(headPostureAngles(null)).toEqual({ pitchDeg: 0, rollDeg: 0, yawDeg: 0 });
  });
  test("head higher than tail → nose-up (positive pitch)", () => {
    expect(headPostureAngles({ headV: 60, tailV: 0 }).pitchDeg).toBeCloseTo(6, 5); // 60 * 0.10
  });
  test("head lower than tail → nose-down (negative pitch)", () => {
    expect(headPostureAngles({ headV: -50, tailV: 50 }).pitchDeg).toBeLessThan(0);
  });
  test("pitch clamps to ±PITCH_MAX", () => {
    expect(headPostureAngles({ headV: 1000, tailV: 0 }).pitchDeg).toBe(PITCH_MAX);
    expect(headPostureAngles({ headV: -1000, tailV: 0 }).pitchDeg).toBe(-PITCH_MAX);
  });
  test("roll from vrt with gain", () => {
    expect(headPostureAngles({ vrt: 0.5 }).rollDeg).toBeCloseTo(10, 5); // 0.5 * 20
  });
  test("roll clamps to ±ROLL_MAX", () => {
    expect(headPostureAngles({ vrt: 10 }).rollDeg).toBe(ROLL_MAX);
  });
  test("yaw from headH-tailH", () => {
    expect(headPostureAngles({ headH: 40, tailH: 0 }).yawDeg).toBeCloseTo(4, 5);
  });
  test("missing metrics → that axis 0", () => {
    expect(headPostureAngles({ headV: 30 })).toMatchObject({ rollDeg: 0, yawDeg: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false headPosture`
Expected: FAIL — "Cannot find module '../headPosture'".

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/headPosture.js`:

```js
// Convert the latest ring's head-attitude deviations into EXAGGERATED display
// angles (deg) for the 3D cutterhead. Real angles are ~0.4° (75 mm over a ~10 m
// shield) — invisible — so we scale them up for visualization; the view always
// shows the real mm/° values alongside. Pure + dependency-free → jest-safe.

export const PITCH_DEG_PER_MM = 0.10; // (headV - tailV) mm → deg (pitch, ก้ม/เงย)
export const PITCH_MAX = 18;
export const ROLL_GAIN = 20;          // vrt° → deg (roll)
export const ROLL_MAX = 30;
export const YAW_DEG_PER_MM = 0.10;   // (headH - tailH) mm → deg (yaw, ซ้าย/ขวา)
export const YAW_MAX = 18;

const num = (v) => (v == null || isNaN(v) ? 0 : Number(v));
const clamp = (v, m) => Math.max(-m, Math.min(m, v));

export function headPostureAngles(posture) {
  if (!posture) return { pitchDeg: 0, rollDeg: 0, yawDeg: 0 };
  return {
    pitchDeg: clamp((num(posture.headV) - num(posture.tailV)) * PITCH_DEG_PER_MM, PITCH_MAX),
    rollDeg: clamp(num(posture.vrt) * ROLL_GAIN, ROLL_MAX),
    yawDeg: clamp((num(posture.headH) - num(posture.tailH)) * YAW_DEG_PER_MM, YAW_MAX),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watchAll=false headPosture`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/headPosture.js src/utils/__tests__/headPosture.test.js
git commit -m "feat(head-level): headPosture util — exaggerated posture angles (pure, tested)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Bake head-only GLB asset

**Files:**
- Modify: `../export-3d/build-tbm-glb.mjs`
- Create: `public/models/prem-tbm-head.glb` (build output, copied in)

**Interfaces:**
- Produces: static asset served at `${PUBLIC_URL}/models/prem-tbm-head.glb` containing nodes `Shield`, `CutterHead`, `CutterFace` — NO `TunnelLining`.

**Primary path (B1 — bake head-only). If the build errors, use the B2 fallback block at the end of this task.**

- [ ] **Step 1: Point the build script at the app's three, and drop TunnelLining**

In `../export-3d/build-tbm-glb.mjs`:

Change the two import lines (currently `../web/node_modules/...`, but `web/` no longer exists):

```js
import * as THREE from '../TunnelBoringMonitoring/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../TunnelBoringMonitoring/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
```

Remove the tunnel lining. Delete the whole block that builds and adds it (from the `// ---- precast concrete segment lining` comment through `machine.add(tunnel);` — originally lines 81–104). The Shield and CutterHead blocks stay.

Change the output filename (do NOT overwrite the original full model):

```js
const out = join(outDir, 'prem-tbm-head.glb');
```

- [ ] **Step 2: Run the build**

Run: `node "../export-3d/build-tbm-glb.mjs"` (from repo root), or `node "export-3d/build-tbm-glb.mjs"` from the parent folder.
Expected: prints `VERIFY OK`; `CutterFace node : present ✓`; `group nodes : Shield, CutterHead, CutterFace` (no `TunnelLining`); mesh count ~308.

If it printed `VERIFY FAILED` or threw (module resolution / GLTFExporter API mismatch on three 0.184) → skip to the **B2 fallback** below.

- [ ] **Step 3: Copy the asset into public/**

```bash
mkdir -p public/models
cp "../export-3d/prem-tbm-head.glb" public/models/prem-tbm-head.glb
```

- [ ] **Step 4: Sanity-check the served file exists and is smaller than the full model**

Run: `ls -l public/models/prem-tbm-head.glb ../export-3d/prem-tbm-epb.glb`
Expected: `prem-tbm-head.glb` exists and is < 1171 KB (TunnelLining removed).

- [ ] **Step 5: Commit**

```bash
git add ../export-3d/build-tbm-glb.mjs public/models/prem-tbm-head.glb
git commit -m "feat(head-level): bake head-only TBM GLB (Shield+CutterHead, no lining)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**B2 fallback (only if Step 2 failed) — ship the full GLB, strip at runtime:**

```bash
mkdir -p public/models
cp "../export-3d/prem-tbm-epb.glb" public/models/prem-tbm-head.glb   # same served name; Task 3 removes TunnelLining after load
git add public/models/prem-tbm-head.glb
git commit -m "feat(head-level): ship full TBM GLB (TunnelLining stripped at runtime)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Task 3's loader already calls `getObjectByName('TunnelLining')?.removeFromParent()`, so it is correct for both paths. Leave `../export-3d/build-tbm-glb.mjs` unmodified in the fallback.

---

## Task 3: `HeadCutter3D` component (live 3D canvas)

**Files:**
- Create: `src/components/views/HeadCutter3D.jsx`
- Test: `src/components/views/__tests__/HeadCutter3D.test.jsx`

**Interfaces:**
- Consumes: `headPostureAngles` (Task 1); asset `/models/prem-tbm-head.glb` (Task 2).
- Produces: `export default function HeadCutter3D({ posture, machine, readOnly, className })` — `posture` = `latestRingState` object or `null`.

- [ ] **Step 1: Write the jest-safe smoke test**

Create `src/components/views/__tests__/HeadCutter3D.test.jsx`. In jsdom there is no WebGL, so the component must fail soft (show a fallback), never throw:

```jsx
import React from "react";
import { render, screen } from "@testing-library/react";
import HeadCutter3D from "../HeadCutter3D";

test("renders without crashing in jsdom (no WebGL) and shows a fallback", async () => {
  render(<HeadCutter3D posture={{ headV: 10, tailV: 0, vrt: 0.2 }} />);
  // mount container is always present; three init is async + WebGL-gated
  expect(await screen.findByTestId("head-cutter-3d")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false HeadCutter3D`
Expected: FAIL — "Cannot find module '../HeadCutter3D'".

- [ ] **Step 3: Implement the component**

Create `src/components/views/HeadCutter3D.jsx`:

```jsx
import React, { useRef, useEffect, useState } from "react";
import { headPostureAngles } from "../../utils/headPosture";

const MODEL_URL = (process.env.PUBLIC_URL || "") + "/models/prem-tbm-head.glb";
const DEG = Math.PI / 180;

export default function HeadCutter3D({ posture = null, machine = "TBM1", readOnly = false, className = "" }) {
  const mountRef = useRef(null);
  const applyRef = useRef(null); // (posture) => void, set once scene is built
  const [err, setErr] = useState(false);

  // Build the three.js scene exactly once.
  useEffect(() => {
    let alive = true;
    let cleanup = () => {};
    (async () => {
      if (typeof document === "undefined") return;
      let THREE, GLTFLoader, OrbitControls;
      try {
        THREE = await import("three");
        ({ GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js"));
        ({ OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js"));
      } catch (e) { if (alive) setErr(true); return; }
      const mount = mountRef.current;
      if (!mount || !alive) return;

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      } catch (e) { if (alive) setErr(true); return; }
      const w = mount.clientWidth || 400, h = mount.clientHeight || 300;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h);
      renderer.setClearColor(0x000000, 0);
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xbcd2ec, 0x0a1530, 0.95));
      const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(6, 8, 7); scene.add(key);
      const fill = new THREE.DirectionalLight(0xcfe0ff, 0.5); fill.position.set(-6, 3, -4); scene.add(fill);

      const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 1000);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.6;

      // Faint design-line reference (the axis the head tilts against): red dashed +Z line.
      const refMat = new THREE.LineBasicMaterial({ color: 0xB23A34, transparent: true, opacity: 0.55 });
      const refGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, -6), new THREE.Vector3(0, 0, 6),
      ]);
      scene.add(new THREE.Line(refGeo, refMat));

      // Posture tilt is applied to this group; the model lives inside it.
      const tiltGroup = new THREE.Group();
      scene.add(tiltGroup);

      let cutterFace = null, raf = 0, ro = null, disposed = false;

      const applyPosture = (p) => {
        const { pitchDeg, rollDeg, yawDeg } = headPostureAngles(p);
        // +Z = drilling axis. pitch about X (nose up/down), yaw about Y, roll about Z.
        // NOTE: signs verified against real data in Step 5.
        tiltGroup.rotation.set(-pitchDeg * DEG, yawDeg * DEG, rollDeg * DEG);
      };
      applyRef.current = applyPosture;

      new GLTFLoader().load(
        MODEL_URL,
        (gltf) => {
          if (disposed) return;
          const model = gltf.scene;
          model.getObjectByName("TunnelLining")?.removeFromParent(); // no-op if already head-only
          cutterFace = model.getObjectByName("CutterFace");
          const box = new THREE.Box3().setFromObject(model);
          const ctr = box.getCenter(new THREE.Vector3());
          const sz = box.getSize(new THREE.Vector3());
          model.position.sub(ctr); // center at origin
          tiltGroup.add(model);
          const maxd = Math.max(sz.x, sz.y, sz.z) || 6;
          camera.position.set(maxd * 0.9, maxd * 0.5, maxd * 1.05);
          camera.lookAt(0, 0, 0);
          controls.update();
          applyPosture(posture);
        },
        undefined,
        () => { if (alive) setErr(true); }
      );

      const tick = () => {
        controls.update();
        if (cutterFace) cutterFace.rotation.z += 0.004; // slow head spin
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      ro = new ResizeObserver(() => {
        const W = mount.clientWidth, H = mount.clientHeight;
        if (!W || !H) return;
        camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H);
      });
      ro.observe(mount);

      cleanup = () => {
        disposed = true;
        cancelAnimationFrame(raf);
        ro && ro.disconnect();
        controls.dispose();
        scene.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose && m.dispose());
        });
        renderer.dispose();
        const el = renderer.domElement;
        if (el && el.parentNode) el.parentNode.removeChild(el);
        applyRef.current = null;
      };
    })();
    return () => { alive = false; cleanup(); };
  }, []); // build once

  // Push posture updates without rebuilding the scene.
  useEffect(() => { applyRef.current && applyRef.current(posture); }, [posture]);

  return (
    <div className={`relative ${className}`} data-testid="head-cutter-3d">
      <div ref={mountRef} style={{ width: "100%", height: 300 }} />
      {err ? (
        <div className="absolute inset-0 grid place-items-center text-sm text-ink-3 text-center px-4">
          แสดงหัวเจาะ 3D ไม่ได้ (เบราว์เซอร์ไม่รองรับ WebGL)
        </div>
      ) : (
        <div className="absolute left-3 bottom-2 text-[11px] text-ink-3 font-semibold pointer-events-none">
          {posture ? <>H {fmt(posture.headV)}·A {fmt(posture.artV)}·T {fmt(posture.tailV)} mm · VRT {fmt(posture.vrt)}° <span className="opacity-70">(มุมขยายให้เห็นชัด)</span></> : "—"}
        </div>
      )}
    </div>
  );
}

const fmt = (v) => (v == null || isNaN(v) ? "—" : `${v > 0 ? "+" : ""}${Math.round(v)}`);
```

- [ ] **Step 4: Run the smoke test**

Run: `npm test -- --watchAll=false HeadCutter3D`
Expected: PASS — container `head-cutter-3d` present; no throw (WebGL init fails soft in jsdom).

- [ ] **Step 5: Browser verification (evidence before done)**

Start the app (`npm start`, port 3000) and temporarily render `<HeadCutter3D posture={{headV:60,tailV:-20,vrt:0.4,artV:10,headH:20,tailH:-10}} />` (or verify after Task 4 wiring). Confirm via the preview tools — NOT screenshot (RAF loop times out; use eval/toDataURL):
- canvas mounts, GLB loads, no WebGL context-lost, no console error;
- OrbitControls: drag rotates, wheel zooms, idle auto-rotates;
- **posture signs correct:** `headV > tailV` visibly noses the head UP; `vrt > 0` rolls it the direction that matches the VRT convention. If a sign is inverted, flip it in `applyPosture` (`tiltGroup.rotation.set(...)`) and note it.
- unmount (navigate away) → remount: no context leak (check `renderer` count / no "Too many WebGL contexts" warning).

- [ ] **Step 6: Commit**

```bash
git add src/components/views/HeadCutter3D.jsx src/components/views/__tests__/HeadCutter3D.test.jsx
git commit -m "feat(head-level): HeadCutter3D — live orbit-controllable cutterhead, posture-driven tilt

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Wire `HeadCutter3D` into `HeadLevelView` (replace side-view panel)

**Files:**
- Modify: `src/components/views/HeadLevelView.jsx`

**Interfaces:**
- Consumes: `HeadCutter3D` (Task 3). `latest = latestRingState(segmentRecords)` already computed in the view.

- [ ] **Step 1: Swap imports**

In `src/components/views/HeadLevelView.jsx`:
- Remove: `import { renderTBMSprite } from "../../utils/tbmSprite";` (line ~14).
- Add: `import HeadCutter3D from "./HeadCutter3D";`

- [ ] **Step 2: Remove the sprite state + effect**

Delete (lines ~22–24):

```jsx
const [tbm, setTbm] = useState(null); // หัวเจาะ 3D (PNG dataURL) — โมเดลเดียวกับ 3D Alignment
useEffect(() => { let alive = true; renderTBMSprite(300).then((s) => { if (alive) setTbm(s); }).catch(() => {}); return () => { alive = false; }; }, []);
```

Keep the `printing` state. If `useEffect`/`useState` become unused after this and Step 3, drop them from the React import (verify by grep before removing). `pitch` (line ~49) stays — the KPI card uses it.

- [ ] **Step 3: Replace the side-view panel body**

Find the panel `{/* ── Side-view (attitude) ── */}` (the `<div>` starting ~line 152, ending ~line 185). Replace the ENTIRE panel with:

```jsx
{/* ── Cutterhead 3D (attitude, live) ── */}
<div className="bg-surface rounded-card shadow-card border border-line p-5 sm:p-6">
  <h3 className="font-semibold text-ink text-base mb-1">หัวเจาะ 3D (ท่าทางด้านข้าง)</h3>
  <p className="text-xs text-ink-3 font-semibold mb-3">ลากเพื่อหมุน · สกอลล์เพื่อซูม · เอียงตามท่าจริงของริง {latest ? latest.ringNo : ""} (ขยายมุมให้เห็นชัด)</p>
  <HeadCutter3D posture={latest} machine={machine} readOnly={readOnly} className="w-full" />
</div>
```

- [ ] **Step 4: Remove the now-dead `sv` geometry memo**

The side-view SVG used the `sv` memo (lines ~56–66). Grep the file for `sv.` — if the only references were inside the panel you just replaced, delete the `const sv = useMemo(... [latest]);` block. (If any `sv.` reference remains, leave it and stop — that means it was shared; re-check.)

- [ ] **Step 5: Run the full test suite**

Run: `npm test -- --watchAll=false`
Expected: PASS — baseline count unchanged (HeadLevelView still renders; new smoke test green).

- [ ] **Step 6: Browser verification**

`npm start` → open the "ระดับหัวเจาะ" tab (machine with head data, e.g. TBM1). Confirm:
- 3D canvas sits in the RIGHT column of the attitude grid; Bullseye is in the LEFT column; Trend + VRT below — all intact;
- head tilts to the latest ring; overlay shows real `H·A·T mm · VRT °`;
- `?view=1` (viewer): 3D still rotates/zooms; no edit buttons.

- [ ] **Step 7: Commit**

```bash
git add src/components/views/HeadLevelView.jsx
git commit -m "feat(head-level): replace side-view sprite panel with live HeadCutter3D

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Print snapshot (static PNG when printing)

**Files:**
- Modify: `src/components/views/HeadCutter3D.jsx`
- Modify: `src/components/views/HeadLevelView.jsx`

**Interfaces:**
- Consumes: `printing` state (HeadLevelView) — true during `doPrint()`.
- Produces: `HeadCutter3D` accepts `printing` prop; when true, freezes to a `<img>` of the last rendered frame (canvas can't print reliably).

- [ ] **Step 1: Capture a data URL and swap to an <img> when printing**

In `HeadCutter3D.jsx`, add `printing = false` to props. Add state `const [snap, setSnap] = useState(null);`. Because the renderer uses `preserveDrawingBuffer: true`, expose the canvas via a ref and, in a `useEffect([printing])`, capture it:

```jsx
const canvasRef = useRef(null); // set to renderer.domElement after creation
// ...inside scene build, right after mount.appendChild(renderer.domElement):
canvasRef.current = renderer.domElement;
// ...cleanup: canvasRef.current = null;

useEffect(() => {
  if (printing && canvasRef.current) {
    try { setSnap(canvasRef.current.toDataURL("image/png")); } catch (e) { setSnap(null); }
  } else { setSnap(null); }
}, [printing]);
```

Render the frozen image over the canvas while printing:

```jsx
{printing && snap && (
  <img src={snap} alt="หัวเจาะ" className="absolute inset-0 w-full h-full object-contain bg-white" />
)}
```

- [ ] **Step 2: Pass `printing` from HeadLevelView**

In `HeadLevelView.jsx`, pass the existing `printing` state:

```jsx
<HeadCutter3D posture={latest} machine={machine} readOnly={readOnly} printing={printing} className="w-full" />
```

- [ ] **Step 3: Run tests**

Run: `npm test -- --watchAll=false`
Expected: PASS (unchanged).

- [ ] **Step 4: Browser verification**

`npm start` → "ระดับหัวเจาะ" → click Print. In the print preview confirm the cutterhead appears as a static image (not blank), one landscape page, alongside bullseye/trend/VRT.

- [ ] **Step 5: Commit**

```bash
git add src/components/views/HeadCutter3D.jsx src/components/views/HeadLevelView.jsx
git commit -m "feat(head-level): print-mode PNG snapshot of the 3D cutterhead

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done criteria

- `npm test -- --watchAll=false` green (baseline + `headPosture` 8 tests + `HeadCutter3D` smoke).
- "ระดับหัวเจาะ" tab shows a live, orbit-controllable head-only cutterhead in the side-view slot, tilting to the latest ring's posture, with real mm/° values shown.
- Bullseye, Trend, VRT unchanged; `ProfileSectionView`/`AlignmentMapView`/`tbmSprite.js` untouched (tbmSprite still imported by ProfileSection).
- Print produces a static image. Nothing pushed to remote.
