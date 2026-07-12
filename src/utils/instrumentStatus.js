// จัดระดับสถานะจากค่าที่วัด เทียบ threshold (alert < alarm < action, ใช้ absolute รองรับ ±)
// nodata = ยังไม่มี reading เลย (แยกจาก normal เพื่อไม่ให้ QC เข้าใจผิดว่าวัดแล้วปกติ)
export const STATUS_BADGE = { normal: "a", alert: "b", alarm: "c", action: "d", nodata: "neutral" };
export const STATUS_ORDER = { nodata: -1, normal: 0, alert: 1, alarm: 2, action: 3 };

export function classifyStatus(value, th) {
  if (value == null || value === "" || !th) return "normal";
  const v = Math.abs(Number(value));
  if (isNaN(v)) return "normal";
  const action = Number(th.action), alarm = Number(th.alarm), alert = Number(th.alert);
  if (!isNaN(action) && v >= action) return "action";
  if (!isNaN(alarm) && v >= alarm) return "alarm";
  if (!isNaN(alert) && v >= alert) return "alert";
  return "normal";
}

export function worstStatus(list) {
  const arr = list || [];
  // init จาก list จริง (arr[0]) แทนที่จะ hardcode "normal" — ไม่งั้น list ว่าง/ทั้ง nodata จะโดนกลบเป็น normal ผิด
  if (!arr.length) return "nodata";
  return arr.reduce(
    (worst, s) => (STATUS_ORDER[s] > STATUS_ORDER[worst] ? s : worst),
    arr[0]
  );
}
