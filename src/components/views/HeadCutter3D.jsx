import React, { useRef, useEffect, useState } from "react";
import { headPostureAngles } from "../../utils/headPosture";

const MODEL_URL = (process.env.PUBLIC_URL || "") + "/models/prem-tbm-head.glb";
const DEG = Math.PI / 180;

export default function HeadCutter3D({ posture = null, machine = "TBM1", readOnly = false, printing = false, className = "" }) {
  const mountRef = useRef(null);
  const applyRef = useRef(null); // (posture) => void, set once scene is built
  const canvasRef = useRef(null); // renderer.domElement, for print snapshot
  const [err, setErr] = useState(false);
  const [snap, setSnap] = useState(null); // frozen PNG while printing

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
      canvasRef.current = renderer.domElement;

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
        // NOTE: signs verified against real data in browser (Task 3 / Step 5).
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
        canvasRef.current = null;
      };
    })();
    return () => { alive = false; cleanup(); };
  }, []); // build once

  // Push posture updates without rebuilding the scene.
  useEffect(() => { applyRef.current && applyRef.current(posture); }, [posture]);

  // While printing, freeze the WebGL canvas to a PNG (canvas can't print reliably).
  useEffect(() => {
    if (printing && canvasRef.current) {
      try { setSnap(canvasRef.current.toDataURL("image/png")); } catch (e) { setSnap(null); }
    } else { setSnap(null); }
  }, [printing]);

  return (
    <div className={`relative ${className}`} data-testid="head-cutter-3d">
      <div ref={mountRef} style={{ width: "100%", height: 300 }} />
      {printing && snap && (
        <img src={snap} alt="หัวเจาะ 3D" className="absolute inset-0 w-full h-full object-contain bg-white" />
      )}
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
