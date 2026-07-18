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
export const YAW_DEG_PER_MM = 0.10; // (headH - tailH) mm → deg (yaw, ซ้าย/ขวา)
export const YAW_MAX = 18;

const num = (v) => (v == null || isNaN(v) ? 0 : Number(v));
const numOrNull = (v) => (v == null || v === "" || isNaN(v) ? null : Number(v));
const clamp = (v, m) => Math.max(-m, Math.min(m, v));

// mm → deg: อิ่มตัวแบบ sqrt คงเครื่องหมายไว้
const pitchFromMM = (d) => Math.sign(d) * PITCH_MAX * Math.min(1, Math.sqrt(Math.abs(d) / PITCH_REF_MM));

export function headPostureAngles(posture) {
  if (!posture) return { pitchDeg: 0, yawDeg: 0 };
  return {
    pitchDeg: pitchFromMM(num(posture.headV) - num(posture.tailV)),
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
