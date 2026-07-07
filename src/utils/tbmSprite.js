// Render the 3D TBM cutterhead (same model as the 3D Alignment) to a transparent PNG dataURL.
// three.js is dynamic-imported (kept out of the main bundle + jest-safe). Returns null if no WebGL.

// makeTBM — copied from AlignmentMapView.jsx (the alignment's 3D cutterhead). +Z = drilling axis.
function makeTBM(THREE, rimColor = 0xE03524) {
  const R = 0.5;
  const DIA_M = 5;
  const METER = DIA_M / (R * 1.12 * 2 * 0.85);
  const core = new THREE.Group();
  const mShield = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.38, metalness: 0.1 });
  const mRim = new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.3, metalness: 0.2, emissive: rimColor, emissiveIntensity: 0.18 });
  const mBack = new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.5 });
  const mDark = new THREE.MeshStandardMaterial({ color: 0x232e44, roughness: 0.45, metalness: 0.3 });
  const mTooth = new THREE.MeshStandardMaterial({ color: 0x2b3850, roughness: 0.5, metalness: 0.2 });
  const mWhite = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.4 });
  const add = (mesh, parent) => { (parent || core).add(mesh); return mesh; };
  const body = add(new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.0, 1.05, 40), mShield));
  body.rotation.x = Math.PI / 2; body.position.z = -0.38;
  const mBody = new THREE.MeshStandardMaterial({ color: 0xC8500A, roughness: 0.5, metalness: 0.2 });
  const tail = add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.86, R * 0.8, 2.8, 32), mBody));
  tail.rotation.x = Math.PI / 2; tail.position.z = -1.95;
  const ring = add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.9, 0.03, 8, 36), new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.5 }))); ring.position.z = -0.95;
  const seam = add(new THREE.Mesh(new THREE.TorusGeometry(R * 1.045, 0.012, 8, 48), new THREE.MeshStandardMaterial({ color: 0xcfd5dc, roughness: 0.6 }))); seam.position.z = -0.38;
  const port = add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshStandardMaterial({ color: 0x1c2533, roughness: 0.4 }))); port.scale.set(1.3, 0.8, 0.55); port.position.set(R * 0.42, R * 0.78, -0.18);
  const box1 = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.12), mWhite)); box1.position.set(-0.12, R * 0.99, -0.62);
  const box2 = add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.1), mWhite)); box2.position.set(0.16, R * 1.0, -0.7);
  const rim = add(new THREE.Mesh(new THREE.TorusGeometry(R * 1.08, 0.115, 18, 56), mRim)); rim.position.z = 0.1;
  const blk = add(new THREE.Mesh(new THREE.TorusGeometry(R * 1.09, 0.02, 8, 56), new THREE.MeshStandardMaterial({ color: 0x10161f, roughness: 0.6 }))); blk.position.z = -0.04;
  const back = add(new THREE.Mesh(new THREE.CylinderGeometry(R * 1.0, R * 1.0, 0.08, 40), mBack)); back.rotation.x = Math.PI / 2; back.position.z = 0.14;
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
  const g = new THREE.Group(); g.add(core); g.scale.setScalar(METER); g.position.y = R * 1.08 * 0.85 * METER;
  return g;
}

// returns { url, w, h } or null. Side 3/4 view, transparent background.
export async function renderTBMSprite(w = 320) {
  if (typeof document === "undefined") return null;
  let THREE;
  try { THREE = await import("three"); } catch (e) { return null; }
  const h = Math.round((w * 2) / 3);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (e) { return null; }
  try {
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.1); d1.position.set(5, 8, 6); scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xcfe0ff, 0.5); d2.position.set(-6, 3, -4); scene.add(d2);
    const tbm = makeTBM(THREE); scene.add(tbm);
    const box = new THREE.Box3().setFromObject(tbm);
    const ctr = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    const maxd = Math.max(sz.x, sz.y, sz.z);
    const cam = new THREE.PerspectiveCamera(34, w / h, 0.1, 1000);
    // 3/4 FRONT view: in front of the cutterhead (+Z), off to the side and above
    const frontZ = box.max.z;
    cam.position.set(ctr.x + maxd * 0.85, ctr.y + maxd * 0.42, frontZ + maxd * 0.95);
    cam.lookAt(ctr.x, ctr.y, frontZ - sz.z * 0.30);
    renderer.render(scene, cam);
    const url = canvas.toDataURL("image/png");
    renderer.dispose();
    return { url, w, h };
  } catch (e) {
    try { renderer.dispose(); } catch (_) {}
    return null;
  }
}
