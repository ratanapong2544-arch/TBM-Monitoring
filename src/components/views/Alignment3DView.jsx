import React, { useRef, useEffect } from "react";
import {
  REAL_PTS, REAL_CUM_M, TOTAL_M, OFFICIAL_TOTAL_M, SHAFTS, drilledMetersFromRecords,
} from "../../utils/alignmentReal";

/* ────────────────────────────────────────────────────────────────────────
   Three.js scene builder — three is dynamic-imported (keeps it out of the
   main bundle + jest, which has no WebGL). Returns a cleanup fn.
   Route geometry = real TBM1 alignment from KMZ. Head position is driven by
   the actual drilled distance (setDistance), so it advances as records grow.
   ──────────────────────────────────────────────────────────────────────── */
function buildScene(THREE, OrbitControls, CSS2DRenderer, CSS2DObject, host, apiRef) {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const AXIS_Z = V3(0, 0, 1);
  const RY = 0.6;
  let W = host.clientWidth || 800, H = host.clientHeight || 500;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 400);
  camera.position.set(3, 42, 40);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  Object.assign(renderer.domElement.style, { position: "absolute", inset: "0" });
  host.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(W, H);
  Object.assign(labelRenderer.domElement.style, { position: "absolute", top: "0", left: "0", pointerEvents: "none", zIndex: "1" });
  host.appendChild(labelRenderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(8, 1, -11);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.minDistance = 6; controls.maxDistance = 90;
  controls.zoomToCursor = true;
  controls.screenSpacePanning = false;

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const onDbl = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(scene.children, true);
    for (const h of hits) { if (h.object.isMesh) { controls.target.copy(h.point); break; } }
  };
  renderer.domElement.addEventListener("dblclick", onDbl);

  /* lighting */
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe7f0, 0.55));
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));
  const key = new THREE.DirectionalLight(0xfff2e2, 1.55);
  key.position.set(24, 38, 18); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004;
  Object.assign(key.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 5, far: 130 });
  key.shadow.camera.updateProjectionMatrix(); scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe9ff, 0.4); fill.position.set(-26, 16, -14); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.25); rim.position.set(-6, 20, 40); scene.add(rim);

  /* floor (soft shadow catcher) */
  {
    const cv = document.createElement("canvas"); cv.width = cv.height = 512;
    const g = cv.getContext("2d");
    const rg = g.createRadialGradient(256, 256, 40, 256, 256, 256);
    rg.addColorStop(0, "#fdfeff"); rg.addColorStop(0.55, "#f3f7fb"); rg.addColorStop(1, "#e2eaf3");
    g.fillStyle = rg; g.fillRect(0, 0, 512, 512);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(150, 72),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  }

  /* curve from real alignment */
  function makeCurve(pts) { const c = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.2); c.arcLengthDivisions = 400; c.updateArcLengths(); return c; }
  const curve1 = makeCurve(REAL_PTS.map((p) => V3(p[0], RY, p[1])));
  function uAtPoint(curve, p) { let bu = 0, bd = Infinity; for (let i = 0; i <= 400; i++) { const u = i / 400, d = curve.getPointAt(u).distanceToSquared(p); if (d < bd) { bd = d; bu = u; } } return bu; }
  const anch = REAL_PTS.map((p, i) => ({ km: REAL_CUM_M[i] / 1000, u: uAtPoint(curve1, V3(p[0], RY, p[1])) }));
  anch[0].u = 0; anch[anch.length - 1].u = 1;
  const TOTAL_KM = TOTAL_M / 1000;
  function kmToU(km) {
    km = Math.max(0, Math.min(anch[anch.length - 1].km, km));
    for (let i = 1; i < anch.length; i++) { if (km <= anch[i].km) { const a = anch[i - 1], b = anch[i]; return a.u + (b.u - a.u) * ((km - a.km) / ((b.km - a.km) || 1)); } }
    return 1;
  }

  /* ---- label manager (scale w/ camera, declutter, leader lines) ---- */
  const LABELS = [], REDRAWS = [];
  function makeL(cls, prio, gate, near) {
    const outer = document.createElement("div"), inner = document.createElement("div");
    inner.className = cls + " l2d"; outer.appendChild(inner);
    const o = new CSS2DObject(outer); scene.add(o);
    const rec = { inner, outer, o, prio, gate: gate || 0, near: near || 0, far: false, d0: 0, leader: null };
    LABELS.push(rec); return { el: inner, o, rec };
  }
  const leaderMat = new THREE.LineBasicMaterial({ color: 0xa8b3c2, transparent: true, opacity: 0.85 });
  function makeLeader() { const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3)); const ln = new THREE.Line(geo, leaderMat); ln.frustumCulled = false; scene.add(ln); return ln; }
  const _lv = new THREE.Vector3();
  function setLeader(ln, a, b) { _lv.copy(b).sub(a).multiplyScalar(0.85).add(a); const p = ln.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, _lv.x, _lv.y, _lv.z); p.needsUpdate = true; }
  const labV = new THREE.Vector3();
  function labelScalePass() {
    for (const L of LABELS) {
      if (!L.o.visible) continue;
      const d = camera.position.distanceTo(L.o.getWorldPosition(labV));
      if (!L.d0) L.d0 = d;
      L.inner.style.transform = "scale(" + Math.max(0.5, Math.min(1.25, L.d0 / d)).toFixed(3) + ")";
      L.far = (L.gate > 0 && d > L.gate) || (L.near > 0 && d < L.near);
      if (L.far) { L.inner.style.opacity = "0"; if (L.leader) L.leader.visible = false; }
    }
  }
  function declutter() {
    const cands = [];
    for (const L of LABELS) {
      if (!L.o.visible) { if (L.leader) L.leader.visible = false; continue; }
      if (L.far) { L.inner.style.opacity = "0"; if (L.leader) L.leader.visible = false; continue; }
      const r = L.inner.getBoundingClientRect(); if (!r.width) continue; cands.push({ L, r });
    }
    cands.sort((a, b) => b.L.prio - a.L.prio || a.r.top - b.r.top);
    const kept = [], pad = 3;
    for (const c of cands) {
      let hit = false;
      for (const k of kept) { if (c.r.left < k.r.right + pad && c.r.right > k.r.left - pad && c.r.top < k.r.bottom + pad && c.r.bottom > k.r.top - pad) { hit = true; break; } }
      c.L.inner.style.opacity = hit ? "0" : "1";
      if (c.L.leader) c.L.leader.visible = !hit;
      if (!hit) kept.push(c);
    }
  }
  /* on-model sprite for the head callout */
  function makeTextSprite(w = 512, h = 128) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.renderOrder = 10; scene.add(sp); return { cv, tex, sp, last: "" };
  }
  function drawPlate(ts, text) {
    if (ts.last === text) return; ts.last = text;
    const c = ts.cv.getContext("2d"), Wd = ts.cv.width, Hd = ts.cv.height; c.clearRect(0, 0, Wd, Hd);
    c.font = '700 50px "IBM Plex Mono","IBM Plex Sans Thai",sans-serif';
    const tw = Math.min(Wd - 16, c.measureText(text).width + 56), x = (Wd - tw) / 2, r = Hd * 0.32;
    c.beginPath(); c.moveTo(x + r, 8); c.arcTo(x + tw, 8, x + tw, Hd - 8, r); c.arcTo(x + tw, Hd - 8, x, Hd - 8, r); c.arcTo(x, Hd - 8, x, 8, r); c.arcTo(x, 8, x + tw, 8, r); c.closePath();
    c.fillStyle = "rgba(12,44,101,.92)"; c.fill(); c.strokeStyle = "rgba(12,44,101,.25)"; c.lineWidth = 3; c.stroke();
    c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, Wd / 2, Hd / 2 + 2); ts.tex.needsUpdate = true;
  }

  /* shafts */
  const capMat = new THREE.MeshStandardMaterial({ color: 0x0c2c65, metalness: 0.9, roughness: 0.32 });
  const topMat = new THREE.MeshStandardMaterial({ color: 0xf2f5fa, roughness: 0.4, metalness: 0.15 });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0xe7ecf3, roughness: 0.6, metalness: 0.1 });
  function addShaft(s, p) {
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.2, 0.14, 48), baseMat); base.position.y = 0.07; base.castShadow = base.receiveShadow = true; g.add(base);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, s.h, 48), new THREE.MeshPhysicalMaterial({ color: s.tint, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.12, transparent: true, opacity: 0.5 })); body.position.y = s.h / 2 + 0.14; body.castShadow = true; g.add(body);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.07, 16, 48), capMat); ring.rotation.x = Math.PI / 2; ring.position.y = s.h + 0.14; ring.castShadow = true; g.add(ring);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.1, 48), topMat); cap.position.y = s.h + 0.18; cap.castShadow = true; g.add(cap);
    const bcv = document.createElement("canvas"); bcv.width = 1024; bcv.height = 128;
    const btx = new THREE.CanvasTexture(bcv); btx.colorSpace = THREE.SRGBColorSpace; btx.anisotropy = 4;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.87, 0.87, 0.6, 48, 1, true), new THREE.MeshBasicMaterial({ map: btx, transparent: true }));
    band.position.y = s.h - 0.28; band.rotation.y = -Math.PI / 2; g.add(band);
    const drawBand = () => { const c = bcv.getContext("2d"); c.clearRect(0, 0, 1024, 128); c.fillStyle = "rgba(12,44,101,.88)"; c.fillRect(0, 0, 1024, 128); c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle"; c.font = '700 54px "IBM Plex Sans Thai",sans-serif'; c.fillText(s.name, 256, 68); c.fillText(s.name, 768, 68); btx.needsUpdate = true; };
    drawBand(); REDRAWS.push(drawBand); scene.add(g);
    const lab = makeL("a3d-stn", 5, 0, 30);
    lab.el.innerHTML = `<i style="background:#${s.tint.toString(16).padStart(6, "0")}"></i><b>${s.name}</b><div class="a3d-more"><span>${s.en}</span><em>${s.note}</em></div>`;
    lab.o.position.set(p.x, 4.6, p.z);
    lab.rec.leader = makeLeader(); setLeader(lab.rec.leader, V3(p.x, s.h + 0.35, p.z), V3(p.x, 4.6, p.z));
    return g;
  }
  const shaftPts = SHAFTS.map((s) => { const pt = curve1.getPointAt(kmToU(s.km)); return V3(pt.x, 0, pt.z); });
  SHAFTS.forEach((s, i) => addShaft(s, shaftPts[i]));

  /* tubes */
  const matRest = new THREE.MeshPhysicalMaterial({ color: 0xb9c7d8, roughness: 0.45, clearcoat: 0.7, clearcoatRoughness: 0.25, transparent: true, opacity: 0.45, depthWrite: false });
  const matD1 = new THREE.MeshPhysicalMaterial({ color: 0xc8500a, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15, emissive: 0xf2741b, emissiveIntensity: 0.25 });
  const restMesh = new THREE.Mesh(new THREE.BufferGeometry(), matRest); scene.add(restMesh);
  const drillMesh = new THREE.Mesh(new THREE.BufferGeometry(), matD1); drillMesh.castShadow = true; scene.add(drillMesh);
  class SubCurve extends THREE.Curve { constructor(c, u1) { super(); this.c = c; this.u1 = Math.max(1e-4, u1); } getPoint(t, o = new THREE.Vector3()) { return o.copy(this.c.getPointAt(this.u1 * t)); } }
  class RangeCurve extends THREE.Curve { constructor(c, u0, u1) { super(); this.c = c; this.u0 = u0; this.span = Math.max(1e-4, u1 - u0); } getPoint(t, o = new THREE.Vector3()) { return o.copy(this.c.getPointAt(Math.min(1, this.u0 + this.span * t))); } }

  /* TBM cutter-head model */
  function makeHead(rimColor, accent) {
    const R = 0.5, g = new THREE.Group();
    const mShield = new THREE.MeshPhysicalMaterial({ color: 0xf2f4f7, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    const mRim = new THREE.MeshPhysicalMaterial({ color: rimColor, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.2, emissive: rimColor, emissiveIntensity: 0.12 });
    const mBack = new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.5 });
    const mDark = new THREE.MeshStandardMaterial({ color: 0x232e44, roughness: 0.45, metalness: 0.3 });
    const mTooth = new THREE.MeshStandardMaterial({ color: 0x2b3850, roughness: 0.5, metalness: 0.2 });
    const mWhite = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.4 });
    const add = (m, parent) => { m.castShadow = true; (parent || g).add(m); return m; };
    const body = add(new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.0, 1.05, 40), mShield)); body.rotation.x = Math.PI / 2; body.position.z = -0.38;
    const seam = add(new THREE.Mesh(new THREE.TorusGeometry(R * 1.045, 0.012, 8, 48), new THREE.MeshStandardMaterial({ color: 0xcfd5dc, roughness: 0.6 }))); seam.position.z = -0.38;
    const port = add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshStandardMaterial({ color: 0x1c2533, roughness: 0.4 }))); port.scale.set(1.3, 0.8, 0.55); port.position.set(R * 0.42, R * 0.78, -0.18);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.12), mWhite)).position.set(-0.12, R * 0.99, -0.62);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.1), mWhite)).position.set(0.16, R * 1.0, -0.7);
    const rim = add(new THREE.Mesh(new THREE.TorusGeometry(R * 1.08, 0.115, 18, 56), mRim)); rim.position.z = 0.1;
    const blk = add(new THREE.Mesh(new THREE.TorusGeometry(R * 1.09, 0.02, 8, 56), new THREE.MeshStandardMaterial({ color: 0x10161f, roughness: 0.6 }))); blk.position.z = -0.04;
    const back = add(new THREE.Mesh(new THREE.CylinderGeometry(R * 1.0, R * 1.0, 0.08, 40), mBack)); back.rotation.x = Math.PI / 2; back.position.z = 0.14;
    const w = new THREE.Group(); w.position.z = 0.24; g.add(w);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.2), mDark), w);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.3), mTooth), w);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const arm = add(new THREE.Mesh(new THREE.BoxGeometry(R * 2.1, 0.17, 0.15), mDark), w); arm.position.set(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 0); arm.rotation.z = a;
      for (let t = 0; t < 5; t++) { const r0 = R * (0.2 + t * 0.18); for (const s of [-1, 1]) { const th = add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.2), mTooth), w); th.position.set(Math.cos(a) * r0 - Math.sin(a) * s * 0.12, Math.sin(a) * r0 + Math.cos(a) * s * 0.12, 0.1); } }
      const spike = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.12), mTooth), w); spike.position.set(Math.cos(a) * R * 1.12, Math.sin(a) * R * 1.12, 0.02); spike.rotation.z = a;
      add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.12), mBack), w).position.set(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95, 0.08);
    }
    for (let i = 0; i < 6; i++) { const a = (i + 0.5) * Math.PI / 3; add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), mWhite), w).position.set(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9, 0.08); }
    g.scale.setScalar(0.85);
    const pl = new THREE.PointLight(accent, 7, 10, 2); pl.position.set(0, 0.5, 1.0); g.add(pl);
    scene.add(g); return { g, w };
  }
  const head = makeHead(0xe03524, 0xf2741b);
  const callout = makeL("a3d-callout", 4.5, 30);
  callout.rec.leader = makeLeader();
  const plate = makeTextSprite(); plate.base = [4.4, 1.1];

  /* segment distance labels printed on the tube */
  function tubeLabel(km, text, width = 4.8) {
    const u = kmToU(km), p = curve1.getPointAt(u), t = curve1.getTangentAt(u);
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 112;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const draw = () => { const c = cv.getContext("2d"); c.clearRect(0, 0, 512, 112); c.fillStyle = "rgba(255,255,255,.85)"; c.beginPath(); c.roundRect(10, 16, 492, 80, 40); c.fill(); c.fillStyle = "#3b4a63"; c.textAlign = "center"; c.textBaseline = "middle"; c.font = '600 46px "IBM Plex Mono","IBM Plex Sans Thai",sans-serif'; c.fillText(text, 256, 58); tex.needsUpdate = true; };
    draw(); REDRAWS.push(draw);
    const grp = new THREE.Group(); grp.position.set(p.x, 1.06, p.z); grp.rotation.y = Math.atan2(-t.z, t.x);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 112 / 512), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 1; grp.add(mesh); scene.add(grp);
  }
  tubeLabel(0.785, "รัชดา–บางเขน ~1,571 ม.");
  tubeLabel(2.624, "บางเขน–หลักสี่ ~2,107 ม.");
  tubeLabel(5.319, "หลักสี่–บางบัว ~3,283 ม.");
  { const b3 = shaftPts[1]; const t = makeL("a3d-note", 3, 55); t.el.innerHTML = "<b>ตรวจฟันหัวเจาะ</b><span>Cutter-head inspection · 1-2 เดือน</span>"; t.o.position.copy(V3(b3.x + 3.5, 1.7, b3.z)); t.rec.leader = makeLeader(); setLeader(t.rec.leader, V3(b3.x, 1.4, b3.z), t.o.position); }

  /* ---- the live update: place head + drilled tube at drilled km ---- */
  const segs = 260, L = curve1.getLength();
  let curKm = 0, hasData = false;
  function setDistance(km) {
    curKm = Math.max(0, Math.min(TOTAL_KM, km || 0));
    hasData = (km || 0) > 0;
    const uA = kmToU(curKm);
    const uTail = Math.max(0, uA * L - 0.85) / L;
    drillMesh.geometry.dispose();
    if (hasData && uTail > 0.004) { drillMesh.geometry = new THREE.TubeGeometry(new SubCurve(curve1, uTail), Math.max(12, Math.round(segs * uTail)), 0.42, 16, false); drillMesh.visible = true; }
    else { drillMesh.geometry = new THREE.BufferGeometry(); drillMesh.visible = false; }
    const r0 = hasData ? Math.min(uA + 1.1 / L, 0.995) : 0;
    restMesh.geometry.dispose();
    restMesh.geometry = new THREE.TubeGeometry(new RangeCurve(curve1, r0, 1), Math.max(12, Math.round(segs * (1 - r0))), 0.3, 16, false);
    const hp = curve1.getPointAt(uA), tg = curve1.getTangentAt(uA);
    hp.addScaledVector(tg, Math.max(0, 0.95 - uA * L));
    head.g.position.copy(hp); head.g.quaternion.setFromUnitVectors(AXIS_Z, tg); head.g.visible = hasData;
    const pct = (curKm / TOTAL_KM * 100).toFixed(1);
    callout.el.textContent = `${curKm.toFixed(2)} กม. · ${pct}%`;
    callout.o.position.copy(hp).add(V3(-3.2, 1.1, 0)); callout.o.visible = hasData;
    setLeader(callout.rec.leader, hp, callout.o.position);
    plate.sp.position.set(hp.x, hp.y + 1.5, hp.z);
    drawPlate(plate, `${curKm.toFixed(2)} กม. · ${pct}%`);
  }
  apiRef.current = { setDistance };

  /* loop */
  const clock = new THREE.Clock(); let frame = 0, raf = 0;
  const SPRITE_NEAR = 32;
  function tick() {
    raf = requestAnimationFrame(tick);
    frame++;
    head.w.rotation.z += Math.min(clock.getDelta(), 0.05) * 0.7;
    const d = camera.position.distanceTo(plate.sp.position);
    const on = hasData && d < SPRITE_NEAR; plate.sp.visible = on;
    if (on) { const k = Math.max(0.35, Math.min(1, d / 20)); plate.sp.scale.set(plate.base[0] * k, plate.base[1] * k, 1); }
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    labelScalePass();
    if (frame % 8 === 0) declutter();
  }
  tick();

  /* responsive to container size */
  const ro = new ResizeObserver(() => {
    W = host.clientWidth || W; H = host.clientHeight || H;
    camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.setSize(W, H); labelRenderer.setSize(W, H);
  });
  ro.observe(host);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { REDRAWS.forEach((f) => f()); plate.last = ""; setDistance(curKm); });
  }

  /* cleanup */
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    renderer.domElement.removeEventListener("dblclick", onDbl);
    controls.dispose();
    renderer.dispose();
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.()); } });
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    if (labelRenderer.domElement.parentNode) labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
  };
}

/* ════════════════════════════════════════════════════════════════════════ */
export default function Alignment3DView({ segmentRecords = [], machine = "TBM1", readOnly = false }) {
  const stageRef = useRef(null);
  const apiRef = useRef(null);
  const isTBM1 = machine === "TBM1";
  const km = isTBM1 ? drilledMetersFromRecords(segmentRecords) / 1000 : 0;
  const kmRef = useRef(km); kmRef.current = km;

  const totalKm = TOTAL_M / 1000;
  const pct = totalKm > 0 ? km / totalKm * 100 : 0;
  const officialPct = (km * 1000) / OFFICIAL_TOTAL_M * 100;
  const remainKm = Math.max(0, totalKm - km);

  useEffect(() => {
    let disposed = false, cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
      const { CSS2DRenderer, CSS2DObject } = await import("three/addons/renderers/CSS2DRenderer.js");
      if (disposed || !stageRef.current) return;
      cleanup = buildScene(THREE, OrbitControls, CSS2DRenderer, CSS2DObject, stageRef.current, apiRef);
      if (apiRef.current) apiRef.current.setDistance(kmRef.current);
    })();
    return () => { disposed = true; cleanup(); apiRef.current = null; };
  }, []);

  useEffect(() => { if (apiRef.current) apiRef.current.setDistance(km); }, [km]);

  return (
    <div className="a3d-root max-w-full mx-auto animate-fade-in">
      <style>{`
        .a3d-root{position:relative}
        .a3d-stage{position:relative;width:100%;height:78vh;min-height:460px;border-radius:12px;overflow:hidden;
          background:linear-gradient(180deg,#f7fafe 0%,#e9f0f8 55%,#dde6f1 100%);border:1px solid #E8E8E8;
          box-shadow:0 1px 2px rgba(12,44,101,.05),0 12px 32px rgba(12,44,101,.08)}
        .a3d-stage canvas{display:block}
        .a3d-ov{position:absolute;pointer-events:none;font-family:'IBM Plex Sans Thai',sans-serif}
        .a3d-hdr{top:16px;left:16px;max-width:420px;background:rgba(255,255,255,.92);backdrop-filter:blur(10px);
          border:1px solid #E8E8E8;border-radius:12px;padding:13px 17px;box-shadow:0 8px 24px rgba(12,44,101,.10)}
        .a3d-hdr .eb{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#C8500A}
        .a3d-hdr h2{font-size:17px;font-weight:700;color:#0C2C65;margin-top:3px}
        .a3d-hdr p{font-size:11px;color:#5a6b84;margin-top:2px}
        .a3d-hdr .demo{display:inline-block;margin-top:8px;font-size:10px;font-weight:700;color:#92400E;background:#FEF3C7;border:1px solid #FDE68A;padding:3px 9px;border-radius:999px}
        .a3d-card{top:16px;right:16px;width:268px;background:rgba(255,255,255,.94);backdrop-filter:blur(10px);
          border:1px solid #E8E8E8;border-radius:12px;padding:13px 15px;box-shadow:0 8px 24px rgba(12,44,101,.10)}
        .a3d-card .ch{display:flex;align-items:center;gap:8px}
        .a3d-card .dot{width:10px;height:10px;border-radius:50%;background:#C8500A}
        .a3d-card .ch b{font-size:13px;font-weight:700;color:#0C2C65;line-height:1.2}
        .a3d-card .ch small{font-size:9.5px;color:#7c8aa0;display:block}
        .a3d-card .big{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:25px;font-weight:700;color:#C8500A;line-height:1}
        .a3d-card .rows{margin-top:9px;display:flex;flex-direction:column;gap:4px}
        .a3d-card .rows div{display:flex;justify-content:space-between;font-size:11px}
        .a3d-card .rows span{color:#7c8aa0}
        .a3d-card .rows b{font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:600;color:#14223c}
        .a3d-card .nt{font-size:9px;color:#7c8aa0;margin-top:7px;line-height:1.4;border-top:1px solid #E8E8E8;padding-top:6px}
        .a3d-help{bottom:14px;left:16px;font-size:10.5px;color:#5a6b84;background:rgba(255,255,255,.82);border:1px solid #E8E8E8;border-radius:8px;padding:5px 10px}
        .a3d-notbm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
        .a3d-notbm div{background:rgba(255,255,255,.95);border:1px solid #E8E8E8;border-radius:12px;padding:18px 28px;text-align:center;box-shadow:0 8px 24px rgba(12,44,101,.12)}
        .a3d-notbm b{font-size:15px;color:#0C2C65}.a3d-notbm small{display:block;font-size:11px;color:#7c8aa0;margin-top:4px}
        /* CSS2D labels */
        .a3d-stn{background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border:1px solid #E8E8E8;border-radius:9px;padding:4px 11px;text-align:center;white-space:nowrap;pointer-events:auto;box-shadow:0 8px 22px rgba(12,44,101,.10)}
        .a3d-stn i{display:block;width:22px;height:3px;border-radius:2px;margin:0 auto 3px}
        .a3d-stn b{display:block;font:700 11.5px/1.3 'IBM Plex Sans Thai',sans-serif;color:#0C2C65}
        .a3d-stn .a3d-more{display:none;padding-top:1px}.a3d-stn:hover .a3d-more{display:block}
        .a3d-stn span{display:block;font:500 9.5px/1.3 'IBM Plex Sans Thai',sans-serif;color:#7c8aa0}
        .a3d-stn em{display:block;font:600 9px/1.3 'IBM Plex Mono',monospace;font-style:normal;color:#97a3b8;margin-top:2px}
        .a3d-callout{background:#003B84;color:#fff;font:700 11.5px 'IBM Plex Mono',monospace;padding:5px 11px;border-radius:8px;white-space:nowrap;border-left:3px solid #F2741B;box-shadow:0 6px 16px rgba(3,27,78,.35)}
        .a3d-note{background:rgba(255,255,255,.94);border:1px solid #E8E8E8;border-left:3px solid #C8500A;border-radius:8px;padding:5px 10px;text-align:left;white-space:nowrap;pointer-events:auto;box-shadow:0 6px 18px rgba(12,44,101,.10)}
        .a3d-note b{display:block;font:700 10.5px/1.3 'IBM Plex Sans Thai',sans-serif;color:#0C2C65}
        .a3d-note span{display:none;font:500 9px/1.3 'IBM Plex Sans Thai',sans-serif;color:#7c8aa0}.a3d-note:hover span{display:block}
        .l2d{transition:opacity .15s ease;transform-origin:center center;will-change:transform,opacity}
      `}</style>

      <div className="a3d-stage" ref={stageRef}>
        <div className="a3d-ov a3d-hdr">
          <div className="eb">ความคืบหน้าการขุดเจาะ · TBM ALIGNMENT 3D</div>
          <h2>แผนผังแนวอุโมงค์ 3D · {machine}</h2>
          <p>คลองเปรมประชากร · แนวจริงจาก KMZ · หัวเจาะตามระยะขุดจริงในระบบ</p>
          <span className="demo">📍 แนว Center Alignment (KMZ) · chainage 0 = รัชดา</span>
        </div>

        <div className="a3d-ov a3d-card">
          <div className="ch"><span className="dot" /><div><b>Route 1</b><small>{machine} · ITD</small></div>
            <strong className="big">{pct.toFixed(1)}%</strong></div>
          <div className="rows">
            <div><span>ขุดแล้ว · Drilled</span><b>{km.toFixed(2)} กม.</b></div>
            <div><span>แนว KMZ (chord)</span><b>{totalKm.toFixed(2)} กม.</b></div>
            <div><span>คงเหลือ · Remaining</span><b>{remainKm.toFixed(2)} กม.</b></div>
          </div>
          <div className="nt">ระยะขุดจาก records ปัจจุบัน ({machine}). ตามแผนทางการ total {(OFFICIAL_TOTAL_M / 1000).toFixed(1)} กม. ({officialPct.toFixed(1)}%) — แนว KMZ เป็น chord 24 จุด สั้นกว่าเพราะตัดมุมโค้ง</div>
        </div>

        <div className="a3d-ov a3d-help">🖱️ ลาก = หมุน · คลิกขวาลาก = เลื่อน · สกรอลล์ = ซูม · ดับเบิลคลิก = ย้ายจุดโฟกัส</div>

        {!isTBM1 && (
          <div className="a3d-notbm"><div><b>แนว 3D นี้สำหรับ TBM1</b><small>สลับเครื่องเป็น TBM1 เพื่อดูตำแหน่งหัวเจาะตามระยะจริง</small></div></div>
        )}
      </div>
    </div>
  );
}
