// วาระตรวจวัด: DISTANCE trigger ตามตำแหน่ง TBM (STA ลดลงเมื่อเจาะหน้า), LONG_TERM ตามวันที่
export function distanceDue(sched, curChainage) {
  if (!sched || sched.scheduleType !== "DISTANCE") return false;
  if (curChainage == null || sched.tbmChainage == null) return false;
  return Number(curChainage) <= Number(sched.tbmChainage); // TBM ผ่านจุด trigger แล้ว
}

export function longTermTargetDate(sched) {
  if (!sched || sched.scheduleType !== "LONG_TERM") return null;
  if (!sched.triggerMeasuredAt || sched.longTermDays == null) return null;
  const base = new Date(sched.triggerMeasuredAt).getTime();
  if (isNaN(base)) return null;
  return new Date(base + Number(sched.longTermDays) * 86400000).toISOString();
}

export function scheduleStatus(sched, curChainage, today) {
  if (!sched) return "pending";
  if (sched.isMeasured) return "done";
  if (sched.status === "na") return "na";
  if (sched.scheduleType === "LONG_TERM") {
    const target = longTermTargetDate(sched);
    if (!target) return "pending";
    return new Date(today) > new Date(target) ? "overdue" : "due";
  }
  // DISTANCE
  return distanceDue(sched, curChainage) ? "due" : "pending";
}

export function summarizeSchedules(list, curChainage, today) {
  const acc = { due: 0, overdue: 0, done: 0, pending: 0 };
  (list || []).forEach((s) => {
    const st = scheduleStatus(s, curChainage, today);
    if (st === "na") return;
    if (acc[st] != null) acc[st] += 1;
  });
  return acc;
}
