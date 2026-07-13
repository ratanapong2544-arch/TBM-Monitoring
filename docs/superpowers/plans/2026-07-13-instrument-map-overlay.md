# Instrument + Settlement Overlay on 3D Alignment Map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overlay KML geotechnical instruments (10 monitoring sections) and settlement crosses (656) onto the Executive Dashboard 3D alignment map, positioned by real lat/lng.

**Architecture:** Add a pure-data module `src/utils/instrumentGeo.js` (generated from the KML by `tools/extract-instrument-geo.py`, committed as static data, jest-safe like `alignmentGeo.js`). Then extend `AlignmentMapView.jsx` with a MapLibre orange line layer (settlement), 10 green HTML markers (instruments) with a click callout, and a toggle button — without disturbing the existing 3D tube / TBM head / shafts / km-labels.

**Tech Stack:** React 18 (CRA), MapLibre GL `^5.24`, three.js `^0.184`, Python 3 (dev-time extraction), Jest (react-scripts, jsdom).

## Global Constraints

- Data source = KML real lat/lng only. Do NOT read from the Instrument Monitoring store (`src/utils/instrument*.js`, `src/components/instrument/*`) — that is a separate in-progress subsystem.
- `src/utils/instrumentGeo.js` MUST NOT import `maplibre-gl` or `three` (jest-safe pure data + math), same discipline as `alignmentGeo.js`.
- Instrument symbol mapping is fixed: `INC` = circle, `EXT` = square, `VW` = triangle; symbol color green `#16A34A`. Settlement line color orange `#F97316`.
- Overlay (instruments + settlement) is visible by default; one toggle button controls both.
- Do NOT touch GAS, `App.jsx`, or the Instrument Monitoring subsystem.
- Preserve existing `AlignmentMapView` behavior: `embedded` mode, TBM2 notice, three.js dispose-on-cleanup.
- KML path (dev-time only, outside repo): `../TBM-3D-Real/kmz/Klongprem Project.kml` relative to repo root (`../` = `Tunnel Boring App - Copy/`). The KML is NOT committed; only the generated JS is.
- Work happens in worktree `wt-instmap`, branch `feat/instrument-map-overlay` (from origin/main). Do not touch other worktrees.

---

## File Structure

| File | Responsibility |
|---|---|
| `tools/extract-instrument-geo.py` (create) | Dev-time: parse KML + `alignmentGeo.js` → emit `instrumentGeo.js`. One-shot. |
| `src/utils/instrumentGeo.js` (create, generated) | Static data: `INSTRUMENT_SECTIONS`, `SETTLEMENT_CROSSES`, `INSTRUMENT_META`, `settlementGeoJSON()`. |
| `src/utils/instrumentGeo.test.js` (create) | Structural assertions on the generated module. |
| `src/components/views/AlignmentMapView.jsx` (modify) | Add settlement layer + instrument markers + callout + toggle + CSS. |

---

## Task 0: Worktree environment setup

**Files:** none (dependency install only)

- [ ] **Step 1: Install dependencies (real install, no junction)**

Run (in `wt-instmap`):
```bash
npm ci
```
Expected: completes; `node_modules/` present with `maplibre-gl`, `three`, `react-scripts`.

- [ ] **Step 2: Baseline — existing jest suite green**

Run:
```bash
CI=true npx react-scripts test --env=jsdom --watchAll=false 2>&1 | tail -15
```
Expected: all existing suites PASS (baseline before changes). Note the total count.

---

## Task 1: `instrumentGeo.js` data module + extraction script

**Files:**
- Create: `tools/extract-instrument-geo.py`
- Create (generated): `src/utils/instrumentGeo.js`
- Test: `src/utils/instrumentGeo.test.js`

**Interfaces:**
- Produces:
  - `INSTRUMENT_SECTIONS: Array<{ id:string, lng:number, lat:number, chainage:number, types:string[], aboveTunnel:boolean }>` (length 10; `types` ⊆ `["EXT","INC","VW"]`)
  - `SETTLEMENT_CROSSES: Array<[[number,number],[number,number]]>` (length 656)
  - `INSTRUMENT_META: { EXT:{label,shape}, INC:{label,shape}, VW:{label,shape} }`
  - `settlementGeoJSON(): { type:"FeatureCollection", features:[{ type:"Feature", geometry:{ type:"MultiLineString", coordinates: [[number,number][]] } }] }` (one feature, 656 segments)

- [ ] **Step 1: Write the failing test**

Create `src/utils/instrumentGeo.test.js`:
```js
import {
  INSTRUMENT_SECTIONS, SETTLEMENT_CROSSES, INSTRUMENT_META, settlementGeoJSON,
} from "./instrumentGeo";

const num = (v) => typeof v === "number" && !Number.isNaN(v);

test("10 instrument sections, all well-formed", () => {
  expect(INSTRUMENT_SECTIONS).toHaveLength(10);
  for (const s of INSTRUMENT_SECTIONS) {
    expect(num(s.lng) && num(s.lat) && num(s.chainage)).toBe(true);
    expect(s.types.length).toBeGreaterThan(0);
    expect(s.types.every((t) => ["EXT", "INC", "VW"].includes(t))).toBe(true);
    expect(typeof s.aboveTunnel).toBe("boolean");
  }
});

test("chainages within alignment span", () => {
  for (const s of INSTRUMENT_SECTIONS) {
    expect(s.chainage).toBeGreaterThanOrEqual(0);
    expect(s.chainage).toBeLessThanOrEqual(8882.226);
  }
  // at least one section is 'Above Tunnel'
  expect(INSTRUMENT_SECTIONS.some((s) => s.aboveTunnel)).toBe(true);
});

test("656 settlement crosses, each a 2-point segment", () => {
  expect(SETTLEMENT_CROSSES).toHaveLength(656);
  for (const seg of SETTLEMENT_CROSSES) {
    expect(seg).toHaveLength(2);
    expect(num(seg[0][0]) && num(seg[0][1]) && num(seg[1][0]) && num(seg[1][1])).toBe(true);
  }
});

test("settlementGeoJSON returns one MultiLineString FeatureCollection with 656 segments", () => {
  const fc = settlementGeoJSON();
  expect(fc.type).toBe("FeatureCollection");
  expect(fc.features).toHaveLength(1);
  expect(fc.features[0].geometry.type).toBe("MultiLineString");
  expect(fc.features[0].geometry.coordinates).toHaveLength(656);
});

test("INSTRUMENT_META shape mapping fixed", () => {
  expect(INSTRUMENT_META.INC.shape).toBe("circle");
  expect(INSTRUMENT_META.EXT.shape).toBe("square");
  expect(INSTRUMENT_META.VW.shape).toBe("triangle");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
CI=true npx react-scripts test --env=jsdom --watchAll=false src/utils/instrumentGeo.test.js 2>&1 | tail -15
```
Expected: FAIL — `Cannot find module './instrumentGeo'`.

- [ ] **Step 3: Write the extraction script**

Create `tools/extract-instrument-geo.py`:
```python
"""
Generate src/utils/instrumentGeo.js from the Klongprem KML.
One-shot dev tool. Re-run if the KML changes.

Reads:
  - ../TBM-3D-Real/kmz/Klongprem Project.kml   (GIS export, outside repo)
  - src/utils/alignmentGeo.js                  (for LINE + CH, to compute chainage)
Writes:
  - src/utils/instrumentGeo.js                 (committed static data)

Run from repo root (wt-instmap):  python tools/extract-instrument-geo.py
"""
import xml.etree.ElementTree as ET
import json, math, re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KML = os.path.join(ROOT, "..", "TBM-3D-Real", "kmz", "Klongprem Project.kml")
ALIGN = os.path.join(ROOT, "src", "utils", "alignmentGeo.js")
OUT = os.path.join(ROOT, "src", "utils", "instrumentGeo.js")
NS = "{http://www.opengis.net/kml/2.2}"

# --- parse LINE + CH out of alignmentGeo.js (keep chainage in sync) ---
def js_array(name, text):
    m = re.search(r"export const %s = (\[.*?\]);" % name, text, re.S)
    arr = m.group(1)
    arr = re.sub(r",(\s*\])", r"\1", arr)   # strip trailing commas -> valid JSON
    return json.loads(arr)

with open(ALIGN, encoding="utf-8") as f:
    atext = f.read()
LINE = js_array("LINE", atext)
CH = js_array("CH", atext)

def m_dist(a, b):
    R = 6371000.0
    la1, la2 = math.radians(a[1]), math.radians(b[1])
    x = math.radians(b[0] - a[0]) * math.cos((la1 + la2) / 2)
    y = la2 - la1
    return R * math.hypot(x, y)

def chainage_of(lng, lat):
    best = (1e9, 0.0)
    for i in range(len(LINE) - 1):
        a, b = LINE[i], LINE[i + 1]
        bx = m_dist(a, [b[0], a[1]]) * (1 if b[0] > a[0] else -1)
        by = m_dist(a, [a[0], b[1]]) * (1 if b[1] > a[1] else -1)
        px = m_dist(a, [lng, a[1]]) * (1 if lng > a[0] else -1)
        py = m_dist(a, [a[0], lat]) * (1 if lat > a[1] else -1)
        L2 = bx * bx + by * by
        t = 0 if L2 == 0 else max(0.0, min(1.0, (px * bx + py * by) / L2))
        cx, cy = t * bx, t * by
        d = math.hypot(px - cx, py - cy)
        if d < best[0]:
            best = (d, CH[i] + t * (CH[i + 1] - CH[i]))
    return best[1]

tree = ET.parse(KML)
doc = tree.getroot().find(f"{NS}Document")

def find_folder(name):
    for c in doc.iter(f"{NS}Folder"):
        nm = c.find(f"{NS}name")
        if nm is not None and nm.text == name:
            return c
    return None

# --- instruments: Ext/Inc/VW points -> cluster into sections (<25 m) ---
pf = find_folder("Point Features")
raw = []
for p in pf.findall(f".//{NS}Placemark"):
    nm = p.find(f"{NS}name"); name = nm.text if nm is not None else ""
    de = p.find(f"{NS}description"); desc = (de.text or "") if de is not None else ""
    ce = p.find(f".//{NS}Point/{NS}coordinates")
    if ce is None or not name:
        continue
    t = None
    for k, lbl in (("Extensometer", "EXT"), ("Inclinometer", "INC"), ("VW Piezometer", "VW")):
        if name.startswith(k):
            t = lbl
    if not t:
        continue
    lng, lat = map(float, ce.text.strip().split(",")[:2])
    raw.append((t, lng, lat, "Above Tunnel" in desc))

secs = []
for t, lng, lat, ab in raw:
    hit = None
    for s in secs:
        if m_dist((lng, lat), (s["lng"], s["lat"])) < 25:
            hit = s; break
    if hit is None:
        hit = {"lng": lng, "lat": lat, "types": set(), "ab": False, "n": 0}
        secs.append(hit)
    hit["types"].add(t); hit["ab"] = hit["ab"] or ab
    hit["lng"] = (hit["lng"] * hit["n"] + lng) / (hit["n"] + 1)
    hit["lat"] = (hit["lat"] * hit["n"] + lat) / (hit["n"] + 1)
    hit["n"] += 1

# sort by chainage descending (drill direction: high -> low), id IM-01..
secs_out = []
order = sorted(secs, key=lambda s: -chainage_of(s["lng"], s["lat"]))
TYPE_ORDER = {"EXT": 0, "INC": 1, "VW": 2}
for i, s in enumerate(order, 1):
    secs_out.append({
        "id": f"IM-{i:02d}",
        "lng": round(s["lng"], 7),
        "lat": round(s["lat"], 7),
        "chainage": round(chainage_of(s["lng"], s["lat"]), 1),
        "types": sorted(s["types"], key=lambda t: TYPE_ORDER[t]),
        "aboveTunnel": bool(s["ab"]),
    })

# --- settlement crosses: 'Instrument Tunnel' 2-point linestrings ---
crosses = []
for pm in doc.iter(f"{NS}Placemark"):
    de = pm.find(f"{NS}description")
    if de is None or (de.text or "").strip() != "Instrument Tunnel":
        continue
    ls = pm.find(f".//{NS}LineString/{NS}coordinates")
    if ls is None:
        continue
    pts = [list(map(float, c.split(",")[:2])) for c in ls.text.strip().split()]
    if len(pts) < 2:
        continue
    a, b = pts[0], pts[-1]
    crosses.append([[round(a[0], 7), round(a[1], 7)], [round(b[0], 7), round(b[1], 7)]])

# --- emit JS ---
def js(o):
    return json.dumps(o, ensure_ascii=False, separators=(",", ":"))

lines = []
lines.append("// GENERATED by tools/extract-instrument-geo.py — do not edit by hand")
lines.append("// Instrument monitoring sections + settlement crosses (real lat/lng from Klongprem KML)")
lines.append("// pure data + math — no maplibre/three import (jest-safe)")
lines.append("")
lines.append("export const INSTRUMENT_META = {")
lines.append('  EXT: { label: "Extensometer", shape: "square" },')
lines.append('  INC: { label: "Inclinometer", shape: "circle" },')
lines.append('  VW:  { label: "VW Piezometer", shape: "triangle" },')
lines.append("};")
lines.append("")
lines.append("export const INSTRUMENT_SECTIONS = [")
for s in secs_out:
    lines.append("  " + js(s) + ",")
lines.append("];")
lines.append("")
lines.append("// each entry = one drawn stroke [[lng,lat],[lng,lat]] (2 strokes make a '+')")
lines.append("export const SETTLEMENT_CROSSES = [")
for c in crosses:
    lines.append("  " + js(c) + ",")
lines.append("];")
lines.append("")
lines.append("// MapLibre GeoJSON source: one MultiLineString feature holding all strokes")
lines.append("export function settlementGeoJSON() {")
lines.append("  return {")
lines.append('    type: "FeatureCollection",')
lines.append('    features: [{ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: SETTLEMENT_CROSSES } }],')
lines.append("  };")
lines.append("}")
lines.append("")

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"sections={len(secs_out)} crosses={len(crosses)} -> {OUT}")
```

- [ ] **Step 4: Generate the data module**

Run (from `wt-instmap`):
```bash
PYTHONIOENCODING=utf-8 python tools/extract-instrument-geo.py
```
Expected: prints `sections=10 crosses=656 -> ...instrumentGeo.js`; file `src/utils/instrumentGeo.js` created.

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
CI=true npx react-scripts test --env=jsdom --watchAll=false src/utils/instrumentGeo.test.js 2>&1 | tail -15
```
Expected: all 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/extract-instrument-geo.py src/utils/instrumentGeo.js src/utils/instrumentGeo.test.js
git commit -m "feat(alignment): instrumentGeo data module + KML extraction script"
```

---

## Task 2: Settlement orange line layer in AlignmentMapView

**Files:**
- Modify: `src/components/views/AlignmentMapView.jsx`

**Interfaces:**
- Consumes: `settlementGeoJSON` from `../../utils/instrumentGeo`.
- Produces: MapLibre source `"settlement"` + layer `"settlement-cross"` on the map (relied on by Task 4 toggle).

- [ ] **Step 1: Import the data helper**

In `src/components/views/AlignmentMapView.jsx`, extend the existing `alignmentGeo` import block (top of file) by adding a new import line right after it:
```js
import { INSTRUMENT_SECTIONS, INSTRUMENT_META, settlementGeoJSON } from "../../utils/instrumentGeo";
```

- [ ] **Step 2: Add the settlement source + layer on map load**

Inside `map.on("load", () => { ... try {`, immediately AFTER the `KM_LABELS.forEach(...)` block and BEFORE the `// ── callout หัวเจาะ ──` block, insert:
```js
// ── settlement crosses (orange line layer) ──
map.addSource("settlement", { type: "geojson", data: settlementGeoJSON() });
map.addLayer({
  id: "settlement-cross", type: "line", source: "settlement",
  layout: { visibility: "visible" },
  paint: { "line-color": "#F97316", "line-width": 1.4, "line-opacity": 0.9 },
});
```

- [ ] **Step 3: Verify in browser (no jest — WebGL component)**

Start dev server and open Executive Dashboard:
```bash
# via preview_start {name} per project launch config, then open the dashboard route
```
Then, in the map area, confirm orange cross-marks appear along the alignment. Because preview throttles rAF on hidden tabs, verify by evaluating in the page:
```js
mapInstance.getLayer('settlement-cross') // should be defined
mapInstance.getSource('settlement')._data.features[0].geometry.coordinates.length // 656
```
Expected: layer defined, 656 segments. Visually: thin orange crosses over the satellite imagery.

- [ ] **Step 4: Commit**

```bash
git add src/components/views/AlignmentMapView.jsx
git commit -m "feat(alignment): settlement cross line layer on 3D map"
```

---

## Task 3: Instrument section markers + click callout

**Files:**
- Modify: `src/components/views/AlignmentMapView.jsx`

**Interfaces:**
- Consumes: `INSTRUMENT_SECTIONS`, `INSTRUMENT_META` from `../../utils/instrumentGeo`; existing `fmtCH()` in this file.
- Produces: `instMarkersRef` (a ref array of MapLibre `Marker`s) relied on by Task 4 toggle + cleanup.

- [ ] **Step 1: Add a ref for instrument markers + a symbol map**

Near the other refs (after `const calloutRef = useRef(null);`), add:
```js
const instMarkersRef = useRef([]);
```
Above the component (next to `makeTBM`), add the green symbol SVG map:
```js
// green instrument symbols — INC=circle, EXT=square, VW=triangle
const SYM = {
  INC: '<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="#16A34A" stroke="#fff" stroke-width="1.2"/></svg>',
  EXT: '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.2" y="1.2" width="9.6" height="9.6" rx="1.5" fill="#16A34A" stroke="#fff" stroke-width="1.2"/></svg>',
  VW:  '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 1 L11 10.5 L1 10.5 Z" fill="#16A34A" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>',
};
```

- [ ] **Step 2: Create instrument markers on map load**

Inside `map.on("load", ...)`, AFTER the settlement layer block from Task 2, insert:
```js
// ── instrument section markers (green symbols per type) ──
const instPopup = new maplibregl.Popup({ closeButton: true, offset: 16, className: "a3m-inst-popup" });
INSTRUMENT_SECTIONS.forEach((s) => {
  const el = document.createElement("div");
  el.className = "a3m-inst" + (s.aboveTunnel ? " above" : "");
  el.innerHTML =
    `<span class="sym">${s.types.map((t) => SYM[t]).join("")}</span>` +
    `<span class="lab">${fmtCH(s.chainage)}</span>`;
  el.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const rows = s.types.map((t) => `<div class="r">${SYM[t]}<span>${INSTRUMENT_META[t].label}</span></div>`).join("");
    instPopup
      .setLngLat([s.lng, s.lat])
      .setHTML(
        `<div class="a3m-inst-card"><b>${s.id}${s.aboveTunnel ? ' · <i>Above Tunnel</i>' : ''}</b>` +
        `<div class="ch">CH ${fmtCH(s.chainage)}</div>${rows}</div>`
      )
      .addTo(map);
  });
  const mk = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([s.lng, s.lat]).addTo(map);
  instMarkersRef.current.push(mk);
});
```

- [ ] **Step 3: Add CSS for markers + popup**

At the END of the `CSS` template-literal string (before the closing backtick), append:
```css
.a3m-inst{display:flex;align-items:center;gap:4px;cursor:pointer;transform:translateY(-2px);
  background:rgba(12,44,101,.86);border:1px solid rgba(255,255,255,.35);border-radius:7px;padding:2px 6px;white-space:nowrap}
.a3m-inst.above{background:rgba(22,101,52,.9);border-color:#4ade80}
.a3m-inst .sym{display:flex;gap:2px;line-height:0}
.a3m-inst .lab{font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:600;color:#fff}
.a3m-inst-card{font-family:'IBM Plex Sans Thai',sans-serif;min-width:150px}
.a3m-inst-card b{font-size:12px;color:#0C2C65}
.a3m-inst-card b i{font-weight:600;color:#166534;font-style:normal}
.a3m-inst-card .ch{font-family:'IBM Plex Mono',monospace;font-size:10px;color:#C8500A;margin:2px 0 6px}
.a3m-inst-card .r{display:flex;align-items:center;gap:6px;font-size:11px;color:#334155;margin:2px 0}
```

- [ ] **Step 4: Dispose markers + popup on unmount**

In the cleanup `return () => { ... }` of the mount effect, inside the `if (api) { try { ... }` block is for three.js; ADD a separate block right AFTER `sceneApiRef.current = null;` (still inside the returned cleanup, before `if (map) map.remove();`):
```js
instMarkersRef.current.forEach((mk) => { try { mk.remove(); } catch (e) {} });
instMarkersRef.current = [];
```

- [ ] **Step 5: Verify in browser**

Reload the dashboard. Confirm:
- 10 green markers along the alignment (2 with green "Above Tunnel" style).
- Each marker shows the correct shapes (circle/square/triangle) for its types + a `CH X+YYY` label.
- Clicking a marker opens a popup with `IM-NN`, chainage, and the instrument list.
Evaluate to confirm count:
```js
document.querySelectorAll('.a3m-inst').length // 10
```

- [ ] **Step 6: Commit**

```bash
git add src/components/views/AlignmentMapView.jsx
git commit -m "feat(alignment): instrument section markers + click callout"
```

---

## Task 4: Toggle button for the instrument overlay

**Files:**
- Modify: `src/components/views/AlignmentMapView.jsx`

**Interfaces:**
- Consumes: `instMarkersRef` (Task 3), settlement layer `"settlement-cross"` (Task 2), `mapRef`.
- Produces: `showInst` state + `applyInstVisibility()` controlling both layers.

- [ ] **Step 1: Add state + import useState**

Ensure `useState` is imported (change `import React, { useRef, useEffect, useMemo } from "react";` to include `useState`). Inside the component, near the top with other hooks, add:
```js
const [showInst, setShowInst] = useState(true);
```

- [ ] **Step 2: Add a visibility applier + effect**

After the existing `applyHead` function, add:
```js
// show/hide instrument markers + settlement layer together
function applyInstVisibility(on) {
  const map = mapRef.current;
  if (map && map.getLayer("settlement-cross"))
    map.setLayoutProperty("settlement-cross", "visibility", on ? "visible" : "none");
  instMarkersRef.current.forEach((mk) => {
    const el = mk.getElement(); if (el) el.style.display = on ? "" : "none";
  });
}
```
Then add an effect (after the `headCh` update effect):
```js
useEffect(() => { applyInstVisibility(showInst); }, [showInst]);
```

- [ ] **Step 3: Apply initial visibility after markers exist**

At the very end of the `map.on("load", ...)` `try` block (after `applyHead(headChRef.current);`), add:
```js
applyInstVisibility(showInstRef.current);
```
And add a ref mirror near the other refs so the load handler reads the current value:
```js
const showInstRef = useRef(showInst); showInstRef.current = showInst;
```

- [ ] **Step 4: Add the toggle button to the control group**

In the JSX, inside the existing `{isTBM1 && ( <div className="a3m-ov a3m-ctrl"> ... )}` block, add a third button after the two existing ones:
```jsx
<button onClick={() => setShowInst((v) => !v)} aria-pressed={showInst}>
  🔬 เครื่องมือตรวจวัด{showInst ? "" : " (ซ่อน)"}
</button>
```

- [ ] **Step 5: Verify in browser**

Reload. Confirm:
- On load, instruments + settlement are visible (button shows "🔬 เครื่องมือตรวจวัด").
- Click toggle → markers hide and orange crosses disappear; label shows "(ซ่อน)".
- Click again → both reappear.
Evaluate:
```js
mapInstance.getLayoutProperty('settlement-cross','visibility') // toggles 'visible'/'none'
```

- [ ] **Step 6: Commit**

```bash
git add src/components/views/AlignmentMapView.jsx
git commit -m "feat(alignment): toggle for instrument + settlement overlay"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full jest suite green**

Run:
```bash
CI=true npx react-scripts test --env=jsdom --watchAll=false 2>&1 | tail -15
```
Expected: all suites PASS, including the new `instrumentGeo.test.js` (baseline count from Task 0 + 5 new tests).

- [ ] **Step 2: Production build clean**

Run:
```bash
CI=true npm run build 2>&1 | tail -20
```
Expected: "Compiled successfully" (warnings OK), no errors.

- [ ] **Step 3: End-to-end browser check**

On the Executive Dashboard 3D map, confirm ALL of:
- Existing 3D orange tube + TBM head + shafts + km-labels still render correctly (not broken by the overlay).
- 10 green instrument markers + orange settlement crosses visible by default.
- Marker click → callout with correct CH + instrument types.
- Toggle hides/shows both overlays.
- "🎯 ตามหัวเจาะ" / "🗺️ ดูทั้งแนว" still work.
Capture a screenshot as proof (use the rAF workaround if the preview tab is throttled).

- [ ] **Step 4: Report result**

Summarize: jest count, build status, screenshot. Do NOT claim done without this evidence.

---

## Self-Review (completed by plan author)

- **Spec coverage:** data source KML ✓ (Task 1); 3 instrument types + settlement ✓ (Task 1 data, Tasks 2–3 render); green symbols circle/square/triangle ✓ (Task 3 SYM + INSTRUMENT_META); orange settlement ✓ (Task 2); default-on + toggle ✓ (Task 4); files list ✓; non-goals respected (no GAS / instrument-subsystem / App.jsx). ✓
- **Placeholder scan:** no TBD/TODO; all code blocks complete (extraction script, test, JSX/CSS). ✓
- **Type consistency:** `INSTRUMENT_SECTIONS` fields (`id/lng/lat/chainage/types/aboveTunnel`), `settlementGeoJSON()` return, `INSTRUMENT_META[t].label/.shape`, `SYM[t]`, layer id `"settlement-cross"`, source `"settlement"`, refs `instMarkersRef`/`showInstRef` — used consistently across Tasks 1–5. ✓
