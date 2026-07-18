import React, { useRef, useEffect, useState } from "react";
import { headPostureAngles, pitchLabel } from "../../utils/headPosture";

const MODEL_URL = (process.env.PUBLIC_URL || "") + "/models/prem-tbm-head.glb";
const DEG = Math.PI / 180;

export default function HeadCutter3D({ posture = null, machine = "TBM1", readOnly = false, printing = false, className = "" }) {
  const mountRef = useRef(null);
  const applyRef = useRef(null); // (posture) => void, set once scene is built
  const resetRef = useRef(null); // () => void, กลับมุมมองมาตรฐาน (ตั้งเมื่อ scene พร้อม)
  // GLB (798KB) มักโหลดเสร็จหลัง posture มาจาก GAS — callback ของ loader อยู่ใน effect ที่ผูก []
  // ถ้าอ่าน prop ตรงๆ จะได้ค่าตอน mount (null) แล้วลบมุมที่ใส่ไปแล้วทิ้ง → ต้องอ่านผ่าน ref ที่สดเสมอ
  const postureRef = useRef(posture);
  postureRef.current = posture;
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

      // Posture tilt is applied to this group; the model lives inside it.
      const tiltGroup = new THREE.Group();
      scene.add(tiltGroup);

      let cutterFace = null, raf = 0, ro = null, disposed = false;

      const applyPosture = (p) => {
        const { pitchDeg, yawDeg } = headPostureAngles(p);
        // +Z = แกนเจาะ (ชี้ไปทางซ้ายจอเมื่อกล้องอยู่แกน X) · pitch รอบ X, yaw รอบ Y, roll รอบ Z
        // sign ยืนยันด้วยการวัดพิกเซลจริงในเบราว์เซอร์ 2026-07-16:
        //   +15° → หัวสูงกว่าหาง 34.5px (เงย) · 0° → เท่ากันเป๊ะ · -15° → หัวต่ำกว่าหาง 28.5px (ก้ม)
        // roll (Z) = 0 ตั้งใจ ไม่ใช่ลืมต่อ — เราไม่มีข้อมูล roll จริง (VRT = มุมงอข้อต่อ articulation ไม่ใช่การหมุน ดู headPosture.js)
        tiltGroup.rotation.set(-pitchDeg * DEG, yawDeg * DEG, 0);
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
          // มองจากแกน X: แนวนอนบนจอ = ความยาว (Z), แนวตั้ง = เส้นผ่านศูนย์กลาง (Y)
          // เผื่อ Y เยอะกว่าเพราะพอเอียง 15° ตัวโมเดลกินที่แนวตั้งเพิ่ม
          fitW = (sz.z || 6) * 1.30;
          fitH = (sz.y || 6) * 1.80; // เผื่อแนวตั้ง: เอียง 15° ตัวเครื่องกินที่สูงขึ้นจนเบียดป้ายล่าง
          camDist = (Math.max(sz.x, sz.y, sz.z) || 6) * 3;
          resetView();

          // เส้นอ้างอิง 2 เส้น — มุมระหว่างสองเส้นคือ ก้ม/เงย
          // depthTest:false + renderOrder สูง → วาดทับโมเดล (ของเดิมลากผ่านใจกลางโมเดลเลยถูกบังจนเห็นแค่ปลาย)
          const L = (sz.z || 6) * 0.62; // ครึ่งความยาว ยาวกว่าตัวโมเดลเล็กน้อย

          // ทิศแนวออกแบบ: อยู่นอก tiltGroup → นอนราบเสมอ · เส้นประบาง = อ่านว่าเป็น "เส้นอ้างอิง"
          // ⚠ เส้นนี้บอก "ทิศ" ไม่ใช่ "ตำแหน่ง" ของแนวออกแบบ — โมเดลถูกบังคับให้อยู่กลางฉาก
          // (model.position.sub(ctr)) และ tiltGroup ใส่แค่การหมุน ไม่เคยใส่ offset
          // → เส้นนี้ผ่าใจกลางเครื่องเสมอโดยการก่อสร้าง ทั้งที่จริง P497 ลอยเหนือแนว ~36mm ทั้งตัว
          // จงใจไม่โชว์ offset: การ์ด "เป้า 2 แกน" ข้างๆ บอกไว้แล้วแบบมีสเกล ±75mm จริง
          // ถ้าขยาย offset มาโชว์ที่นี่ (36mm บน ø~6m = 0.6% ต้องขยาย ~40 เท่า) ริงที่ยังอยู่ใน
          // tolerance จะดูเหมือนหลุดแนวไปไกล = หลอกตากว่าเดิม
          const ref = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -L), new THREE.Vector3(0, 0, L)]),
            new THREE.LineDashedMaterial({
              color: 0xB23A34, depthTest: false, transparent: true, opacity: 0.95,
              dashSize: (sz.z || 6) * 0.035, gapSize: (sz.z || 6) * 0.025,
            })
          );
          ref.computeLineDistances(); // ไม่เรียก = เส้นประกลายเป็นเส้นทึบ
          ref.renderOrder = 999;
          scene.add(ref);

          // แกนเครื่องจริง: อยู่ใน tiltGroup → เอียงตามหัวเจาะ
          // ใช้ Mesh ไม่ใช่ Line เพราะ WebGL คุม linewidth ไม่ได้ (บังคับ 1px เสมอ)
          // สีอำพัน: อ่านออกทั้งบนตัวถังสีอ่อนและท้ายเครื่องสีเกือบดำ (navy จมหายบนพื้นดำ)
          const t = (sz.y || 6) * 0.02;
          const axis = new THREE.Mesh(
            new THREE.BoxGeometry(t, t, L * 2),
            new THREE.MeshBasicMaterial({ color: 0xE0A33E, depthTest: false, transparent: true, opacity: 0.98 })
          );
          axis.renderOrder = 1000;
          tiltGroup.add(axis);

          applyPosture(postureRef.current); // ค่าล่าสุด ไม่ใช่ค่าตอน mount
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
        renderer.setSize(W, H);
        setFrustum(); // ortho ใช้ left/right/top/bottom ไม่ใช่ aspect
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
        resetRef.current = null;
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
      {printing && snap && (
        <img src={snap} alt="หัวเจาะ 3D" className="absolute inset-0 w-full h-full object-contain bg-white" />
      )}
      {!err && (() => {
        const pl = pitchLabel(posture);
        if (!pl) return null;
        // navy โทนเดียวทั้ง เงย/ก้ม — เป็นทิศทาง ไม่ใช่ดี/แย่ ใส่เขียว-แดงจะสื่อการตัดสินที่ไม่มีจริง
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
      {err ? (
        <div className="absolute inset-0 grid place-items-center text-sm text-ink-3 text-center px-4">
          แสดงหัวเจาะ 3D ไม่ได้ (เบราว์เซอร์ไม่รองรับ WebGL)
        </div>
      ) : (
        <div className="absolute left-3 bottom-2 right-3 text-[11px] text-ink-3 font-semibold pointer-events-none leading-relaxed">
          {posture ? (
            <>
              H {fmt(posture.headV)}·A {fmt(posture.artV)}·T {fmt(posture.tailV)} mm · VRT {fmtDeg(posture.vrt)}°
              <br />
              <span className="opacity-80">
                <i className="inline-block w-3 h-[2px] align-middle mr-1" style={{ background: "#B23A34" }} />ทิศแนวออกแบบ
                <i className="inline-block w-3 h-[3px] align-middle mr-1 ml-2.5" style={{ background: "#E0A33E" }} />แกนเครื่อง
                <span className="ml-2.5">มุมในภาพขยายให้เห็นชัด ไม่ใช่สเกลจริง</span>
              </span>
            </>
          ) : "—"}
        </div>
      )}
    </div>
  );
}

const fmt = (v) => (v == null || isNaN(v) ? "—" : `${v > 0 ? "+" : ""}${Math.round(v)}`);
// VRT เป็นทศนิยม (ของจริง p50 = 0.15°, p90 = 0.48°) — Math.round ทำให้เกือบทุกริงกลายเป็น 0
const fmtDeg = (v) => (v == null || isNaN(v) ? "—" : `${v > 0 ? "+" : ""}${Number(v).toFixed(1)}`);
