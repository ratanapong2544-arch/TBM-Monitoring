// คำนวณเรท/คาดเสร็จของงานขุดเจาะ — pure function
// แสดงเรทเป็น "ริง/วันทำงาน" (สูตรเดียวกับ Daily Average หน้า Overview) แต่ทายวันเสร็จด้วยฐาน
// "วันปฏิทิน" ของช่วงนั้น เพื่อให้ได้วันจริง (รวมวันหยุด/วันที่เครื่องจอด). เรทคิดตามช่วง filter ที่เลือก.
import { formatDisplayDate } from "./formatters";
import { PROJECT_DEADLINE, TOTAL_ROUTE_DISTANCE } from "./constants";

const toUTC = (ymd) => {
  const [y, m, d] = String(ymd).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const dayDiff = (fromYmd, toYmd) => Math.round((toUTC(toYmd) - toUTC(fromYmd)) / 86400000);
const addDays = (ymd, n) => new Date(toUTC(ymd) + n * 86400000).toISOString().slice(0, 10);

export function computePaceStats({
  segmentRecords = [],
  today,
  deadline = PROJECT_DEADLINE,
  totalRouteDistance = TOTAL_ROUTE_DISTANCE,
  filterStart = null,
  filterEnd = null,
}) {
  // 1 record ต่อ ring เฉพาะ permanent
  const map = new Map();
  segmentRecords.forEach((r) => { if (r.installType !== "Temporary") map.set(r.ringNo, r); });
  const perm = Array.from(map.values());
  const doneRings = perm.length;

  // ── ระดับโครงการ (คงที่ ไม่ขึ้นกับ filter) ──
  const totalDist = perm.reduce((s, r) => s + (parseFloat(r.length) || 0), 0);
  const avgLen = doneRings > 0 ? totalDist / doneRings : 1.4;
  const targetRings = Math.round(totalRouteDistance / avgLen);
  const remainingRings = Math.max(0, targetRings - doneRings);

  const allDates = perm.map((r) => formatDisplayDate(r.date)).filter(Boolean).sort();
  const firstRingDate = allDates.length > 0 ? allDates[0] : today;

  const daysLeft = Math.max(0, dayDiff(today, deadline));
  const requiredRate = daysLeft > 0 ? remainingRings / daysLeft : null; // ริง/วันปฏิทิน ให้ทันกำหนด

  // ── ช่วงที่เลือก (ตาม filter) ── clamp ให้อยู่ใน [firstRing, today]
  let winStart = filterStart || firstRingDate;
  if (winStart < firstRingDate) winStart = firstRingDate;
  let winEnd = filterEnd || today;
  if (winEnd > today) winEnd = today;

  const winDates = allDates.filter((d) => d >= winStart && d <= winEnd);
  const windowRings = winDates.length;
  const windowWorkingDays = new Set(winDates).size;
  const windowCalendarDays = Math.max(1, dayDiff(winStart, winEnd) + 1);

  const workingRate = windowWorkingDays > 0 ? windowRings / windowWorkingDays : 0;  // ริง/วันทำงาน (แสดง)
  const windowCalendarRate = windowRings / windowCalendarDays;                      // ริง/วันปฏิทิน (ใช้ทายวันเสร็จ)

  const finishWindow = windowCalendarRate > 0 ? addDays(today, Math.ceil(remainingRings / windowCalendarRate)) : null;
  const deltaWindowDays = finishWindow ? dayDiff(deadline, finishWindow) : null;    // บวก = ช้ากว่ากำหนด

  const behind = finishWindow ? deltaWindowDays > 0 : remainingRings > 0;

  return {
    doneRings, targetRings, remainingRings,
    requiredRate, daysLeft,
    workingRate, windowCalendarRate,
    windowRings, windowWorkingDays, windowCalendarDays,
    finishWindow, deltaWindowDays, behind,
  };
}
