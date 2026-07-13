import React, { useRef, useEffect, useMemo, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  LINE, KM_LABELS, SHAFTS, CH_EXCAV_START, CH_MIN, TOTAL_ROUTE_DISTANCE,
  drilledMetersFromRecords, headChainageFromRecords, lngLatAtCh, lineBetween, bearingAtCh,
} from "../../utils/alignmentGeo";
import { INSTRUMENT_META, settlementGeoJSON } from "../../utils/instrumentGeo";
import { instrumentShapesGeoJSON } from "../../utils/instrumentShapes";

/* ────────────────────────────────────────────────────────────────────────
   แผนที่ดาวเทียม + หัวเจาะ 3D บนแนวจริง (KMZ Klongprem) — TBM1 only
   maplibre-gl + three.js ถูก dynamic-import (กัน bundle หลัก + jest ที่ไม่มี WebGL)
   หัวเจาะวางตาม chainage จริงจาก records (finishCH ที่น้อยสุด) → ขยับเมื่อ records อัปเดต
   ──────────────────────────────────────────────────────────────────────── */

const SAT_STYLE = {
  version: 8,
  sources: {
    sat: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [
    // พื้นหลังเข้ม + ภาพดาวเทียมจาง/desaturate → ให้ท่อแนว 3D โดดเด่น
    { id: "bg", type: "background", paint: { "background-color": "#0a1526" } },
    {
      id: "sat", type: "raster", source: "sat",
      paint: {
        "raster-opacity": 0.92,
        "raster-saturation": -0.35,
        "raster-brightness-max": 0.82,
        "raster-contrast": -0.04,
      },
    },
  ],
};

// แปลง chainage → "X+YYY.YYY"
function fmtCH(ch) {
  const km = Math.floor(ch / 1000);
  const m = (ch - km * 1000).toFixed(0).padStart(3, "0");
  return `${km}+${m}`;
}

// โมเดลหัวเจาะ TBM (three.js) — แกนยาวตาม +Z, หัวคัตเตอร์ (แดง) ที่ปลาย +Z
// หัวเจาะ TBM — port จาก tbm-3d-a.html (Studio Porcelain makeHead, recreated จาก reference render ของ user):
// shield ขาว clearcoat (seam/port/fittings) + ขอบหน้าแดง + หัวคัตเตอร์ 6 ก้านมีฟัน/spike · แกนยาว +Z = ทิศเจาะ
// สเกลเป็นเมตรสำหรับแผนที่ (DIA ≈ 18 ม.) — เล็กลงจากเวอร์ชันหยาบเดิมมาก
function makeTBM(THREE, rimColor = 0xE03524) {
  const R = 0.5;                 // scene-unit เดิม
  const DIA_M = 5;               // เส้นผ่านศูนย์กลางหัวเจาะบนแผนที่ (เมตร) — ปรับเลขนี้ถ้าใหญ่/เล็กไป (bore จริง ~3.6)
  const METER = DIA_M / (R * 1.12 * 2 * 0.85);
  const core = new THREE.Group();
  const mShield = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.38, metalness: 0.1 });
  const mRim    = new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.3, metalness: 0.2, emissive: rimColor, emissiveIntensity: 0.18 });
  const mBack   = new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.5 });
  const mDark   = new THREE.MeshStandardMaterial({ color: 0x232e44, roughness: 0.45, metalness: 0.3 });
  const mTooth  = new THREE.MeshStandardMaterial({ color: 0x2b3850, roughness: 0.5, metalness: 0.2 });
  const mWhite  = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.4 });
  const add = (mesh, parent) => { (parent || core).add(mesh); return mesh; };

  // shield body (แกน +Z = ทิศเจาะ)
  const body = add(new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.0, 1.05, 40), mShield));
  body.rotation.x = Math.PI / 2; body.position.z = -0.38;
  // ตัวเครื่อง/gantry ยาวด้านหลัง — ให้รูปทรงยาวตามแนว (ไม่ใช่แผ่นกลม)
  const mBody = new THREE.MeshStandardMaterial({ color: 0xC8500A, roughness: 0.5, metalness: 0.2 });
  const tail = add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.86, R * 0.8, 2.8, 32), mBody));
  tail.rotation.x = Math.PI / 2; tail.position.z = -1.95;
  const ring = add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.9, 0.03, 8, 36), new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.5 })));
  ring.position.z = -0.95;
  const seam = add(new THREE.Mesh(new THREE.TorusGeometry(R * 1.045, 0.012, 8, 48), new THREE.MeshStandardMaterial({ color: 0xcfd5dc, roughness: 0.6 })));
  seam.position.z = -0.38;
  const port = add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshStandardMaterial({ color: 0x1c2533, roughness: 0.4 })));
  port.scale.set(1.3, 0.8, 0.55); port.position.set(R * 0.42, R * 0.78, -0.18);
  const box1 = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.12), mWhite)); box1.position.set(-0.12, R * 0.99, -0.62);
  const box2 = add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.1), mWhite)); box2.position.set(0.16, R * 1.0, -0.7);

  // หน้า: ขอบแดงระบุตัวตน (อ่านออกว่าหัวคัตเตอร์ทุกระยะ)
  const rim = add(new THREE.Mesh(new THREE.TorusGeometry(R * 1.08, 0.115, 18, 56), mRim)); rim.position.z = 0.1;
  const blk = add(new THREE.Mesh(new THREE.TorusGeometry(R * 1.09, 0.02, 8, 56), new THREE.MeshStandardMaterial({ color: 0x10161f, roughness: 0.6 }))); blk.position.z = -0.04;
  const back = add(new THREE.Mesh(new THREE.CylinderGeometry(R * 1.0, R * 1.0, 0.08, 40), mBack));
  back.rotation.x = Math.PI / 2; back.position.z = 0.14;

  // หัวคัตเตอร์: hub + 6 ก้านมีฟัน + spike ยื่นพ้นขอบ
  const w = new THREE.Group(); w.position.z = 0.24; core.add(w);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.2), mDark), w);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.3), mTooth), w);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const arm = add(new THREE.Mesh(new THREE.BoxGeometry(R * 2.1, 0.17, 0.15), mDark), w);
    arm.position.set(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 0); arm.rotation.z = a;
    for (let t = 0; t < 5; t++) {
      const r0 = R * (0.2 + t * 0.18);
      for (const s of [-1, 1]) {
        const tooth = add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.2), mTooth), w);
        tooth.position.set(Math.cos(a) * r0 - Math.sin(a) * s * 0.12, Math.sin(a) * r0 + Math.cos(a) * s * 0.12, 0.1);
      }
    }
    const spike = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.12), mTooth), w);
    spike.position.set(Math.cos(a) * R * 1.12, Math.sin(a) * R * 1.12, 0.02); spike.rotation.z = a;
    const tip = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.12), mBack), w);
    tip.position.set(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95, 0.08);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i + 0.5) * Math.PI / 3;
    const cube = add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), mWhite), w);
    cube.position.set(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9, 0.08);
  }
  core.scale.setScalar(0.85);

  const g = new THREE.Group();
  g.add(core);
  g.scale.setScalar(METER);
  g.position.y = R * 1.08 * 0.85 * METER; // ยกให้นั่งบนพื้นพอดี
  return g;
}

// green instrument glyphs for the click-popup legend — INC=circle, EXT=square, VW=triangle
// (the on-map shapes are flat MapLibre polygons, see instrumentShapes.js)
const SYM = {
  INC: '<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="#16A34A" stroke="#fff" stroke-width="1.2"/></svg>',
  EXT: '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.2" y="1.2" width="9.6" height="9.6" rx="1.5" fill="#16A34A" stroke="#fff" stroke-width="1.2"/></svg>',
  VW:  '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 1 L11 10.5 L1 10.5 Z" fill="#16A34A" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>',
};

export default function AlignmentMapView({ segmentRecords = [], machine = "TBM1", embedded = false }) {
  const isTBM1 = machine === "TBM1";
  const [showInst, setShowInst] = useState(true);
  const drilledM = useMemo(() => (isTBM1 ? drilledMetersFromRecords(segmentRecords) : 0), [segmentRecords, isTBM1]);
  const headChRaw = useMemo(() => (isTBM1 ? headChainageFromRecords(segmentRecords) : null), [segmentRecords, isTBM1]);
  const headCh = headChRaw != null ? headChRaw : CH_EXCAV_START - drilledM;

  const pct = TOTAL_ROUTE_DISTANCE > 0 ? (drilledM / TOTAL_ROUTE_DISTANCE) * 100 : 0;

  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const sceneApiRef = useRef(null);   // custom layer API { setHead(ch) }
  const calloutRef = useRef(null);
  const headChRef = useRef(headCh);
  headChRef.current = headCh;
  const showInstRef = useRef(showInst);
  showInstRef.current = showInst;

  // ───────── mount: สร้าง map + 3D layer ครั้งเดียว ─────────
  useEffect(() => {
    if (!isTBM1) return;
    let disposed = false;
    let map = null;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      const THREE = await import("three");
      if (disposed || !hostRef.current) return;

      const start = lngLatAtCh(headChRef.current);
      map = new maplibregl.Map({
        container: hostRef.current,
        style: SAT_STYLE,
        center: start,
        zoom: 16.9,
        pitch: 58,
        bearing: bearingAtCh(headChRef.current) - 8,
        attributionControl: { compact: true },
        antialias: true,
        preserveDrawingBuffer: true,
        cooperativeGestures: embedded, // ฝังในหน้า scroll → ต้อง ctrl/2-นิ้ว ซูม (กันชนกับ scroll หน้า)
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
      map.scrollZoom.setWheelZoomRate(1 / 250);

      map.on("load", () => {
        if (disposed) return;
        try {

        // ── ปล่อง (HTML markers) ──
        SHAFTS.forEach((s) => {
          const el = document.createElement("div");
          el.className = "a3m-shaft";
          el.innerHTML = `<span class="dot ${s.id === "IS4" ? "launch" : ""}"></span><div class="lab"><b>${s.name}</b><small>${s.role}</small></div>`;
          new maplibregl.Marker({ element: el, anchor: "left" }).setLngLat([s.lng, s.lat]).addTo(map);
        });

        // ── ป้าย กม. ──
        KM_LABELS.forEach((k) => {
          const el = document.createElement("div");
          el.className = "a3m-km";
          el.textContent = k.name;
          new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([k.lng, k.lat]).addTo(map);
        });

        // ── settlement crosses (orange line layer) ──
        map.addSource("settlement", { type: "geojson", data: settlementGeoJSON() });
        map.addLayer({
          id: "settlement-cross", type: "line", source: "settlement",
          layout: { visibility: "visible" },
          paint: { "line-color": "#F97316", "line-width": 1.4, "line-opacity": 0.9 },
        });

        // ── instrument section symbols — flat green shapes on the ground (like settlement) ──
        // ◯ Inclinometer · ▢ Extensometer · △ VW Piezometer · เขียวสด = Above Tunnel
        map.addSource("instruments", { type: "geojson", data: instrumentShapesGeoJSON() });
        map.addLayer({
          id: "instrument-fill", type: "fill", source: "instruments",
          layout: { visibility: "visible" },
          paint: {
            "fill-color": ["case", ["get", "aboveTunnel"], "#22C55E", "#16A34A"],
            "fill-opacity": 0.55,
          },
        });
        map.addLayer({
          id: "instrument-line", type: "line", source: "instruments",
          layout: { visibility: "visible" },
          paint: {
            "line-color": ["case", ["get", "aboveTunnel"], "#4ADE80", "#15803D"],
            "line-width": 1.6,
          },
        });

        // คลิกที่สัญลักษณ์ → popup รายละเอียด (ไม่ลอยจนกว่าจะคลิก)
        const instPopup = new maplibregl.Popup({ closeButton: true, offset: 12, className: "a3m-inst-popup" });
        map.on("click", "instrument-fill", (e) => {
          const p = e.features[0].properties;
          const above = p.aboveTunnel === true || p.aboveTunnel === "true";
          const rows = String(p.types).split(",")
            .map((t) => `<div class="r">${SYM[t]}<span>${INSTRUMENT_META[t].label}</span></div>`).join("");
          instPopup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div class="a3m-inst-card"><b>${p.sectionId}${above ? ' · <i>Above Tunnel</i>' : ''}</b>` +
              `<div class="ch">CH ${fmtCH(Number(p.chainage))}</div>${rows}</div>`
            )
            .addTo(map);
        });
        map.on("mouseenter", "instrument-fill", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "instrument-fill", () => { map.getCanvas().style.cursor = ""; });

        // ── callout หัวเจาะ ──
        const cEl = document.createElement("div");
        cEl.className = "a3m-head-callout";
        calloutRef.current = new maplibregl.Marker({ element: cEl, anchor: "bottom", offset: [0, -26] }).setLngLat(start).addTo(map);
        calloutRef.current._el = cEl;

        // ── 3D custom layer: ท่อแนวอุโมงค์ (TubeGeometry) + หัวเจาะ ──
        // ทั้ง scene อยู่ใน local-meters จาก origin กลางแนว · ใช้ transform เดียว
        const TUBE_Y = 2.0, TUBE_R = 2.0;
        const customLayer = {
          id: "tbm-3d", type: "custom", renderingMode: "3d",
          onAdd(m, gl) {
            this.renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
            this.renderer.autoClear = false;
            this.camera = new THREE.Camera();
            this.scene = new THREE.Scene();
            this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
            const dir = new THREE.DirectionalLight(0xffffff, 2.2); dir.position.set(0, 80, 60); this.scene.add(dir);
            const dir2 = new THREE.DirectionalLight(0xbfd4ee, 0.9); dir2.position.set(60, 40, -60); this.scene.add(dir2);

            // origin (กลางแนว) + scale เมตร→mercator
            const ORIGIN = LINE[Math.floor(LINE.length / 2)];
            this.merc0 = maplibregl.MercatorCoordinate.fromLngLat(ORIGIN, 0);
            this.mscale = this.merc0.meterInMercatorCoordinateUnits();
            const merc0 = this.merc0, mscale = this.mscale;
            this.toLocal = (lng, lat) => {
              const mc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0);
              return new THREE.Vector3((mc.x - merc0.x) / mscale, TUBE_Y, (mc.y - merc0.y) / mscale);
            };

            // ท่อ: ขุดแล้ว (ส้มทึบ) + เหลือ (ฟ้าจางโปร่ง)
            this.matDrilled = new THREE.MeshStandardMaterial({ color: 0xF2741B, roughness: 0.5, metalness: 0.15 });
            this.matRest = new THREE.MeshStandardMaterial({ color: 0x9fc4e8, roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.5 });
            this.tubeRest = new THREE.Mesh(undefined, this.matRest);
            this.tubeDrilled = new THREE.Mesh(undefined, this.matDrilled);
            this.scene.add(this.tubeRest); this.scene.add(this.tubeDrilled);
            this.model = makeTBM(THREE);
            this.scene.add(this.model);

            const buildTube = (chHi, chLo) => {
              const pts = lineBetween(chHi, chLo).map(([lng, lat]) => this.toLocal(lng, lat));
              if (pts.length < 2) return null;
              const curve = new THREE.CatmullRomCurve3(pts);
              return new THREE.TubeGeometry(curve, Math.max(8, pts.length * 6), TUBE_R, 16, false);
            };
            this.setHead = (ch) => {
              if (this.tubeDrilled.geometry) this.tubeDrilled.geometry.dispose();
              if (this.tubeRest.geometry) this.tubeRest.geometry.dispose();
              this.tubeDrilled.geometry = buildTube(CH_EXCAV_START, ch) || new THREE.BufferGeometry();
              this.tubeRest.geometry = buildTube(ch, CH_MIN) || new THREE.BufferGeometry();
              const ll = lngLatAtCh(ch);
              this.model.position.copy(this.toLocal(ll[0], ll[1])); // coaxial กับท่อ (y = TUBE_Y)
              this.model.rotation.y = (-bearingAtCh(ch) * Math.PI) / 180; // คัตเตอร์ชี้ทิศเจาะ
            };
            sceneApiRef.current = this;
            this.setHead(headChRef.current);
          },
          render(gl, args) {
            if (!this.renderer || !this.merc0) return;
            const rotX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
            const l = new THREE.Matrix4()
              .makeTranslation(this.merc0.x, this.merc0.y, this.merc0.z)
              .scale(new THREE.Vector3(this.mscale, -this.mscale, this.mscale))
              .multiply(rotX);
            // MapLibre v5: ใช้ defaultProjectionData.mainMatrix (mercator world→clip)
            const mtxArr = (args.defaultProjectionData && args.defaultProjectionData.mainMatrix) || args.modelViewProjectionMatrix;
            this.camera.projectionMatrix = new THREE.Matrix4().fromArray(mtxArr).multiply(l);
            this.renderer.resetState();
            this.renderer.render(this.scene, this.camera);
          },
        };
        map.addLayer(customLayer);
        applyHead(headChRef.current);
        applyInstVisibility(showInstRef.current);
        } catch (err) {
          console.error("AlignmentMapView load error:", err);
        }
      });
    })();

    return () => {
      disposed = true;
      const api = sceneApiRef.current;
      if (api) {
        try {
          api.tubeDrilled && api.tubeDrilled.geometry && api.tubeDrilled.geometry.dispose();
          api.tubeRest && api.tubeRest.geometry && api.tubeRest.geometry.dispose();
          api.matDrilled && api.matDrilled.dispose();
          api.matRest && api.matRest.dispose();
          api.model && api.model.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((mm) => mm && mm.dispose && mm.dispose());
          });
          api.renderer && api.renderer.dispose();
        } catch (e) { /* best-effort dispose */ }
        sceneApiRef.current = null;
      }
      if (map) map.remove();
      mapRef.current = null;
    };
  }, [isTBM1]);

  // helper: ตั้งตำแหน่งหัว + ท่อที่ขุดแล้ว + callout ตาม chainage
  function applyHead(ch) {
    if (sceneApiRef.current) sceneApiRef.current.setHead(ch);
    if (calloutRef.current) {
      calloutRef.current.setLngLat(lngLatAtCh(ch));
      if (calloutRef.current._el)
        calloutRef.current._el.innerHTML = `<b>หัวเจาะ TBM1</b><span>CH ${fmtCH(ch)} · ขุดแล้ว ${drilledM.toFixed(1)} ม.</span>`;
    }
    if (mapRef.current) mapRef.current.triggerRepaint();
  }

  // show/hide instrument shapes + settlement layer together
  function applyInstVisibility(on) {
    const map = mapRef.current; if (!map) return;
    ["settlement-cross", "instrument-fill", "instrument-line"].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    });
  }

  useEffect(() => { applyInstVisibility(showInst); }, [showInst]);

  // ───────── update เมื่อ headCh เปลี่ยน (records อัปเดต) ─────────
  useEffect(() => {
    if (!isTBM1) return;
    applyHead(headCh);
  }, [headCh, drilledM, isTBM1]);

  function flyToHead() {
    const map = mapRef.current; if (!map) return;
    map.flyTo({ center: lngLatAtCh(headChRef.current), zoom: 16.9, pitch: 58, bearing: bearingAtCh(headChRef.current) - 8, duration: 1400 });
  }
  function fitRoute() {
    const map = mapRef.current; if (!map) return;
    let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
    LINE.forEach(([lng, lat]) => { minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng); minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat); });
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 70, pitch: 0, bearing: 0, duration: 1400 });
  }

  return (
    <div className="a3m-root max-w-full mx-auto animate-fade-in">
      <style>{CSS}</style>

      {/* map + overlay ทั้งหมด อยู่ใน wrapper เดียว → ปุ่ม/ป้าย absolute เกาะแผนที่ ไม่หลุดไปทับการ์ดใต้แผนที่ */}
      <div className="a3m-mapwrap">
        <div ref={hostRef} className="a3m-stage" style={embedded ? { height: "clamp(420px, 56vh, 600px)", minHeight: "420px" } : undefined} />

        {/* header — ซ่อนเมื่อ embed (หน้า Dashboard มีหัวข้อ section อยู่แล้ว) */}
        {!embedded && (
        <div className="a3m-ov a3m-hdr">
          <div className="eb">ความคืบหน้าการขุดเจาะ · TBM ALIGNMENT</div>
          <h2>แนวอุโมงค์จริง · {machine}</h2>
          <p>คลองเปรมประชากร · ภาพถ่ายดาวเทียม + แนว KMZ · หัวเจาะตามระยะขุดจริง</p>
          <span className="demo">📍 chainage จริง · launch รัชดา IS4 (CH 8830) → เจาะลด CH</span>
        </div>
        )}

        {/* controls (ปุ่มกล้องอย่างเดียว — เปิดให้กดได้ทุกโหมดรวม viewer) — overlay บนแผนที่ */}
        {isTBM1 && (
          <div className="a3m-ov a3m-ctrl">
            <button onClick={flyToHead}>🎯 ตามหัวเจาะ</button>
            <button onClick={fitRoute}>🗺️ ดูทั้งแนว</button>
            <button onClick={() => setShowInst((v) => !v)} aria-pressed={showInst}>
              🔬 เครื่องมือตรวจวัด{showInst ? "" : " (ซ่อน)"}
            </button>
          </div>
        )}

        {/* TBM1-only notice */}
        {!isTBM1 && (
          <div className="a3m-notbm"><div><b>แนวนี้สำหรับ TBM1</b><small>สลับเครื่องเป็น TBM1 เพื่อดูตำแหน่งหัวเจาะบนแผนที่</small></div></div>
        )}
      </div>

      {/* progress card — ใต้แผนที่ สไตล์เดียวกับ dashboard · โชว์เฉพาะ % ความคืบหน้า (ไม่ซ้ำ KPI cards) */}
      {isTBM1 && (
        <div className="mt-4 bg-surface border border-line rounded-card shadow-card p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#C8500A" }} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink truncate">Route 1 · {machine}</div>
                <div className="text-[11px] text-ink-3">ความคืบหน้าการขุดเจาะทั้งแนว</div>
              </div>
            </div>
            <div className="text-2xl font-mono font-semibold shrink-0" style={{ color: "#C8500A" }}>{pct.toFixed(1)}%</div>
          </div>
          <div className="h-2.5 bg-line/50 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: "#C8500A" }} />
          </div>
        </div>
      )}
    </div>
  );
}


const CSS = `
.a3m-root{position:relative}
.a3m-mapwrap{position:relative}
.a3m-stage{position:relative;width:100%;height:78vh;min-height:480px;border-radius:12px;overflow:hidden;
  border:1px solid #E8E8E8;box-shadow:0 1px 2px rgba(12,44,101,.05),0 12px 32px rgba(12,44,101,.10)}
.a3m-stage .maplibregl-ctrl-attrib{font-size:9px}
.a3m-ov{position:absolute;font-family:'IBM Plex Sans Thai',sans-serif;z-index:2}
.a3m-hdr{top:14px;left:14px;max-width:420px;background:rgba(255,255,255,.93);backdrop-filter:blur(10px);
  border:1px solid #E8E8E8;border-radius:12px;padding:12px 16px;box-shadow:0 8px 24px rgba(12,44,101,.12);pointer-events:none}
.a3m-hdr .eb{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#C8500A}
.a3m-hdr h2{font-size:16px;font-weight:700;color:#0C2C65;margin-top:3px}
.a3m-hdr p{font-size:11px;color:#5a6b84;margin-top:2px}
.a3m-hdr .demo{display:inline-block;margin-top:8px;font-size:10px;font-weight:700;color:#92400E;background:#FEF3C7;border:1px solid #FDE68A;padding:3px 9px;border-radius:999px}
.a3m-ctrl{bottom:16px;left:14px;display:flex;gap:8px}
.a3m-ctrl button{font-family:inherit;font-size:11px;font-weight:600;color:#0C2C65;background:rgba(255,255,255,.94);
  border:1px solid #E8E8E8;border-radius:8px;padding:7px 12px;cursor:pointer;box-shadow:0 4px 14px rgba(12,44,101,.12)}
.a3m-ctrl button:hover{background:#fff;border-color:#C8500A}
.a3m-shaft{display:flex;align-items:center;gap:6px;pointer-events:none;transform:translateX(6px)}
.a3m-shaft .dot{width:11px;height:11px;border-radius:50%;background:#1E80BD;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);flex:none}
.a3m-shaft .dot.launch{background:#F4B740}
.a3m-shaft .lab{background:rgba(12,44,101,.86);border-radius:7px;padding:3px 8px;white-space:nowrap}
.a3m-shaft .lab b{display:block;font-size:11px;font-weight:700;color:#fff;line-height:1.1}
.a3m-shaft .lab small{font-size:8.5px;color:#bcd0ec}
.a3m-km{font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;color:#fff;background:rgba(12,44,101,.62);
  border:1px solid rgba(255,255,255,.35);border-radius:5px;padding:1px 5px;pointer-events:none;white-space:nowrap}
.a3m-head-callout{pointer-events:none;background:#C8500A;border:1.5px solid #fff;border-radius:8px;padding:4px 9px;text-align:center;
  box-shadow:0 6px 18px rgba(200,80,10,.45);white-space:nowrap}
.a3m-head-callout b{display:block;font-size:11px;font-weight:700;color:#fff;line-height:1.1}
.a3m-head-callout span{font-family:'IBM Plex Mono',monospace;font-size:9px;color:#ffe4d0}
.a3m-notbm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:3}
.a3m-notbm div{background:rgba(255,255,255,.95);border:1px solid #E8E8E8;border-radius:12px;padding:18px 28px;text-align:center;box-shadow:0 8px 24px rgba(12,44,101,.14)}
.a3m-notbm b{font-size:15px;color:#0C2C65}.a3m-notbm small{display:block;font-size:11px;color:#7c8aa0;margin-top:4px}
/* มือถือ/จอแคบ — ย่อ overlay ไม่ให้บังแผนที่ */
@media (max-width:640px){
  .a3m-head-callout{padding:3px 7px;border-radius:7px}
  .a3m-head-callout b{font-size:9.5px}
  .a3m-head-callout span{font-size:8px}
  .a3m-ctrl{bottom:10px;left:8px;gap:6px}
  .a3m-ctrl button{font-size:10px;padding:5px 9px}
  .a3m-shaft .lab{padding:2px 6px}
  .a3m-shaft .lab b{font-size:9.5px}
  .a3m-shaft .lab small{display:none}
  .a3m-km{font-size:8px;padding:1px 4px}
  .a3m-hdr{max-width:200px;padding:8px 11px}
  .a3m-hdr h2{font-size:13px}
  .a3m-hdr p,.a3m-hdr .demo{display:none}
}
.a3m-inst-card{font-family:'IBM Plex Sans Thai',sans-serif;min-width:150px}
.a3m-inst-card b{font-size:12px;color:#0C2C65}
.a3m-inst-card b i{font-weight:600;color:#166534;font-style:normal}
.a3m-inst-card .ch{font-family:'IBM Plex Mono',monospace;font-size:10px;color:#C8500A;margin:2px 0 6px}
.a3m-inst-card .r{display:flex;align-items:center;gap:6px;font-size:11px;color:#334155;margin:2px 0}
`;
