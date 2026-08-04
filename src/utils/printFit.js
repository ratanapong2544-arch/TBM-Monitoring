// Centralized print scaling — one source of truth for every "Print / ปริ้น PDF" button.
//
// Problem it fixes: the app used to rely on a fixed `transform: scale(0.88)` in globals.css
// (tuned once for a portrait layout). As layouts changed (landscape charts, wider tables) that
// magic number drifted — content either spilled onto page 2 or printed tiny with wide margins.
//
// Approach (generalized from the one page that already printed correctly, RouteScheduleView):
// measure the element that will actually be printed, then shrink it with CSS `zoom` so it fills
// exactly the printable page box. `zoom` (not `transform`) is used on purpose — it shrinks the
// real layout box, so a scaled-down block does not leave empty space that pushes a blank page 2.
import { resolveOnePage } from "./printPages";

// A4 printable area @96dpi, minus @page margins and slack for the browser's print header/footer.
// Landscape values are the ones proven in production by RouteScheduleView (1020×680).
export const PAGE_PX = {
  portrait: { w: 715, h: 1000 },
  landscape: { w: 1020, h: 680 },
};

// Pure: the zoom factor that fits a W×H box onto the page.
//   onePage=true  → fit BOTH width and height on a single page (charts, forms).
//   onePage=false → fit WIDTH only; height flows to more pages (long reports / tables).
// Never upscales (capped at 1); ×0.99 guards against rounding spilling over the edge.
export function fitScale(W, H, orientation = "portrait", onePage = true) {
  const page = PAGE_PX[orientation] || PAGE_PX.portrait;
  if (!(W > 0)) return 1;
  const byWidth = page.w / W;
  const raw = onePage && H > 0 ? Math.min(byWidth, page.h / H, 1) : Math.min(byWidth, 1);
  return Math.max(0.1, raw * 0.99);
}

// ── ทางปริ้นทางเดียว ────────────────────────────────────────────────
// ทุกทางที่สั่งปริ้น (Ctrl+P, เมนู File→Print, ปุ่มในแอพ) วิ่งผ่าน handler ตัวเดียวข้างล่างนี้
// เมื่อก่อน fitAndPrint fit เองแล้วเรียก window.print() — ทำแบบนั้นตอนนี้ไม่ได้แล้ว
// เพราะ window.print() จะไปปลุก handler ให้ fit ทับอีกชั้น (zoom 0.7 × 0.7 = 0.49 เล็กจิ๋ว)

let override = null; // ปุ่มปริ้นเฉพาะส่วนตั้งไว้ชั่วคราว — ใช้ครั้งเดียวแล้วล้างที่ afterprint

// ให้ปุ่มปริ้นเฉพาะส่วน (pie / กราฟเดี่ยว) เจาะจงกล่องที่จะปริ้นแทนทั้งหน้า
export function setPrintTarget(el, { orientation = "portrait", onePage = true } = {}) {
  override = { el, orientation, onePage };
}

// วัด -> ย่อ -> ตั้ง @page. คืนฟังก์ชันสำหรับคืนสภาพ
function applyFit({ el, orientation, onePage }) {
  const pageStyle = document.createElement("style");
  pageStyle.setAttribute("data-print-fit", "");
  pageStyle.textContent = `@media print { @page { size: A4 ${orientation}; margin: 8mm; } }`;
  document.head.appendChild(pageStyle);

  let undoEl = () => {};
  if (el) {
    // วัดกล่องแบบที่มันจะ "ปริ้นจริง": ซ่อนของที่ไม่ได้ปริ้นก่อน ไม่งั้น scrollHeight รวม
    // แผนที่ 3D / แถบฟิลเตอร์ (print:hidden) เข้าไปด้วย -> ย่อผิด
    const measureStyle = document.createElement("style");
    measureStyle.textContent = `.print\\:hidden, .no-print { display: none !important; }`;
    document.head.appendChild(measureStyle);
    const W = el.scrollWidth, H = el.scrollHeight; // อ่านค่านี้บังคับ reflow ทันที
    measureStyle.remove();

    if (W > 0 && H > 0) {
      const one = resolveOnePage(onePage, W, H, orientation);
      el.style.setProperty("width", `${W}px`, "important"); // ตรึงความกว้าง กัน recharts reflow ตอนปริ้น
      el.style.zoom = String(fitScale(W, H, orientation, one));
      undoEl = () => {
        el.style.removeProperty("width");
        el.style.zoom = "";
      };
    }
  }

  return () => { undoEl(); pageStyle.remove(); };
}

// ติดตั้งครั้งเดียวที่ Shell — getDefaultTarget() บอกว่าหน้าที่เปิดอยู่ตอนนี้จะปริ้นกล่องไหน แนวไหน
export function installPrintFit(getDefaultTarget) {
  let undo = null;

  const onBeforePrint = () => {
    if (undo) undo(); // กันซ้อน เผื่อ browser ยิง beforeprint ซ้ำโดยไม่ยิง afterprint คั่น
    undo = applyFit(override || getDefaultTarget());
  };
  const onAfterPrint = () => {
    if (undo) undo();
    undo = null;
    override = null; // ปุ่มเฉพาะส่วนใช้ได้ครั้งเดียว — รอบหน้ากลับไปปริ้นทั้งหน้า
  };

  window.addEventListener("beforeprint", onBeforePrint);
  window.addEventListener("afterprint", onAfterPrint);
  return () => {
    window.removeEventListener("beforeprint", onBeforePrint);
    window.removeEventListener("afterprint", onAfterPrint);
    if (undo) undo();
    undo = null;
    override = null;
  };
}

// ปุ่มปริ้นเดิม 8 ปุ่มเรียกตัวนี้ — signature เดิม แต่ตอนนี้แค่ตั้งเป้าหมายแล้วปล่อยให้ handler fit
export function fitAndPrint(el, { orientation = "portrait", onePage = true } = {}) {
  setPrintTarget(el, { orientation, onePage });
  window.print();
}
