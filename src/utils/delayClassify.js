// แตกหมวด "Other 3" (delay catch-all) ออกเป็นธีมตามข้อความ label ที่ทีมกรอกไว้
// label = "ข้อความในกราฟ" ของแต่ละ event (ShiftReportView) — เป็น free text เหตุผลจริง
// กติกา: ไล่ตามลำดับ THEMES, keyword ตัวแรกที่เจอชนะ (substring, ไม่สนตัวพิมพ์)
// ยืนยันกับข้อมูลจริง TBM1 (96 events / 349.6 ชม.) ครอบคลุม ~96% เหลือ "อื่นๆ" ~4%

const THEMES = [
  { key: "รางสับหลีก", kw: ["สับหลีก", "รางหลีก", "สับราง", "y-switch", "y switch", "switching", "switch"] },
  { key: "แรงงาน/หยุดงาน", kw: ["คนงาน", "ผู้รับจ้าง", "ย้ายแคมป์", "ย้ายที่", "ตรวจสุขภาพ", "ตรวจสุภาพ", "อบรม", "เลิกงาน", "วันหยุด", "ป่วย", "operator", "ฝนตก", "ไม่มีการทำงาน", "ไม่ม่การทำงาน", "ไม่การทำงาน"] },
  { key: "ทางเดิน/Walk way", kw: ["walk way", "walkway", "ทางเดิน", "plate form", "platform", "ราวกันตก", "แผ่นพื้น", "ก้นบ่อ"] },
  { key: "ระบบน้ำ/ท่อ", kw: ["drain", "ระบายน้ำ", "สูบน้ำ", "สูบภายน้ำ", "สุบน้ำ", "น้ำเสีย", "ท่อน้ำ", "ระบบน้ำ", "cooling", "ท่อลม"] },
  { key: "รอวัสดุ/ถังดิน", kw: ["รอ", "waiting", "muck skip", "muck pit", "ถังดิน", "เทถัง", "ยกถัง"] },
  { key: "Grout/Segment", kw: ["grout", "เกร้า", "segment", "ลำเลียง", "ลำเรียง", "swelling", "จัดเรียง", "จัด segment", "ปูน", "key", "gap", "clay shock"] },
  { key: "ซ่อม/ขัดข้อง", kw: ["ซ่อม", "แก้ไข", "แก้ใข", "เสีย", "ขัดข้อง", "overload", "error", "hose", "adapter", "erector", "hoist", "มอเตอร์", "ความร้อน"] },
];

export const OTHER3_FALLBACK = "อื่นๆ";

// คืนชื่อธีมของ label หนึ่งรายการ (ใช้เฉพาะ event ในหมวด "Other 3")
export function classifyOther3(label) {
  const t = String(label || "").toLowerCase();
  for (const theme of THEMES) {
    if (theme.kw.some((k) => t.includes(k.toLowerCase()))) return theme.key;
  }
  return OTHER3_FALLBACK;
}

export const OTHER3_THEMES = THEMES.map((t) => t.key);
