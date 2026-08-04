// ตารางค่าปริ้นต่อหน้า — หนึ่งที่เดียวที่บอกว่า "หน้านี้ปริ้นแนวไหน ย่อลงหน้าเดียวไหม"
//
// ทำไมไม่ให้โปรแกรมวัดแนวกระดาษเอง: กล่องเนื้อหาบนเว็บยืดเต็มจอเสมอ วัดที่จอ 1440 ได้กว้าง 1440
// วัดที่จอ 1920 ได้ 1920 — ความกว้างที่วัดได้คือขนาดจอ ไม่ใช่รูปทรงเนื้อหา กฎ "กว้างกว่าสูง = แนวนอน"
// จึงแกว่งตามขนาดจอคนใช้ อีกอย่าง Route/หัวเจาะ ตั้งเป็นแนวนอนทั้งที่เนื้อหาสูงกว่ากว้าง = การตัดสินใจของคน
//
// ตัวเลข "หมึกจริง" ในคอมเมนต์ = ขอบเขตเนื้อหาที่มองเห็น วัดที่จอ 1440 หลังซ่อน print:hidden (2026-07-17)
import { fitScale } from "./printFit";

// ต่ำกว่านี้ = ตัวหนังสือเล็กสุดของแอพ (text-xs = 10.5px เพราะ root font 14px ไม่ใช่ 16)
// จะเหลือ ~5.3px ≈ 4pt บนกระดาษ = อ่านไม่ออก -> ปล่อยยาวหลายหน้าแทนการบีบลงหน้าเดียว
export const ZOOM_FLOOR = 0.5;

const FALLBACK = { orientation: "portrait", onePage: "auto" };

// key = tab หรือ "tab:module" (ตาม navModel.js)
// onePage: true = บีบลง 1 หน้า | false = ย่อพอดีกว้าง ปล่อยยาว | "auto" = ให้ ZOOM_FLOOR ตัดสิน
const PAGE_SPECS = {
  // ── หน้าที่ปริ้นถูกอยู่แล้ว: คัดลอกค่าจากปุ่มเดิม ห้ามเปลี่ยน ──
  dashboard: { orientation: "landscape", onePage: true }, // 1440×683
  "analysis:segment": { orientation: "landscape", onePage: true }, // 1398×967
  "analysis:grout": { orientation: "landscape", onePage: true }, // 1398×1217
  "analysis:route": { orientation: "landscape", onePage: "auto" }, // 1398×1714 — ทั้งหน้าสูงกว่าที่ปุ่มปริ้น
  head_level: { orientation: "landscape", onePage: "auto" }, // 1398×1506
  shift_report: { orientation: "portrait", onePage: true }, // 1123×1514
  report: { orientation: "portrait", onePage: false }, // 896×1059

  // ── หน้าที่เพิ่งปริ้นได้: เลือกจากรูปทรงเนื้อหาที่วัดจริง ──
  overview: { orientation: "landscape", onePage: true }, // 1440×630  กว้าง เตี้ย
  "record:segment": { orientation: "portrait", onePage: true }, // 601×1497  ฟอร์มแคบสูง
  "record:grout": { orientation: "portrait", onePage: true }, // 504×1281  ฟอร์มแคบสูง
  record_daily: { orientation: "portrait", onePage: true }, // 1100×1281
  prep_gantt: { orientation: "landscape", onePage: true }, // 1398×146  Gantt กว้างมาก
  performance: { orientation: "landscape", onePage: "auto" }, // 1398×1401
  "datalog:segment": { orientation: "landscape", onePage: true }, // 1230×990  ตารางในกล่องเลื่อน 500px
  "datalog:grout": { orientation: "portrait", onePage: false }, // 1412×4797 ยาว 3-5 แผ่น
  daily_report: { orientation: "landscape", onePage: true }, // 1398×262  กว้าง เตี้ย
  inst_dashboard: { orientation: "portrait", onePage: false }, // 1398×17728 ยาว 9-17 แผ่น
  inst_schedule: { orientation: "portrait", onePage: false }, // 1398×33081 ยาว 17-33 แผ่น
};

// หน้าไหนใช้ค่าอะไร — หน้าที่ไม่รู้จักยังปริ้นได้ (fallback) ไม่ throw
export function printSpecFor(tab, module) {
  if (!tab) return FALLBACK;
  return PAGE_SPECS[module ? `${tab}:${module}` : tab] || PAGE_SPECS[tab] || FALLBACK;
}

// "auto" = บีบลงหน้าเดียวถ้ายังอ่านออก ไม่งั้นปล่อยยาว
export function resolveOnePage(onePage, W, H, orientation) {
  if (onePage !== "auto") return onePage;
  return fitScale(W, H, orientation, true) >= ZOOM_FLOOR;
}
