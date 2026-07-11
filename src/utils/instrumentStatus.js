// จัดระดับสถานะจากค่าที่วัด เทียบ threshold (alert < alarm < action, ใช้ absolute รองรับ ±)
export const STATUS_BADGE = { normal: "a", alert: "b", alarm: "c", action: "d" };
export const STATUS_ORDER = { normal: 0, alert: 1, alarm: 2, action: 3 };

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
  return (list || []).reduce(
    (worst, s) => (STATUS_ORDER[s] > STATUS_ORDER[worst] ? s : worst),
    "normal"
  );
}
