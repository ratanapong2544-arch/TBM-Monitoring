// คำนวณเรท/คาดเสร็จของงานขุดเจาะ — pure function (ทุกเรท = ริงต่อวันปฏิทิน)
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
  recentWindowDays = 30,
}) {
  // 1 record ต่อ ring เฉพาะ permanent
  const map = new Map();
  segmentRecords.forEach((r) => { if (r.installType !== "Temporary") map.set(r.ringNo, r); });
  const perm = Array.from(map.values());
  const doneRings = perm.length;

  const totalDist = perm.reduce((s, r) => s + (parseFloat(r.length) || 0), 0);
  const avgLen = doneRings > 0 ? totalDist / doneRings : 1.4;
  const targetRings = Math.round(totalRouteDistance / avgLen);
  const remainingRings = Math.max(0, targetRings - doneRings);

  const dates = perm.map((r) => formatDisplayDate(r.date)).filter(Boolean).sort();
  const firstRingDate = dates.length > 0 ? dates[0] : today;
  const daysSinceStart = Math.max(1, dayDiff(firstRingDate, today));

  const lifetimeRate = doneRings / daysSinceStart;

  const recentStart = addDays(today, -recentWindowDays);
  const recentRings = perm.filter((r) => formatDisplayDate(r.date) > recentStart).length;
  const recentDenom = Math.min(recentWindowDays, daysSinceStart);
  const recentRate = recentDenom > 0 ? recentRings / recentDenom : 0;

  const daysLeft = Math.max(0, dayDiff(today, deadline));
  const requiredRate = daysLeft > 0 ? remainingRings / daysLeft : null;

  const projectedFinish = (rate) =>
    rate > 0 ? addDays(today, Math.ceil(remainingRings / rate)) : null;
  const finishRecent = projectedFinish(recentRate);
  const finishLifetime = projectedFinish(lifetimeRate);

  const deltaRecentDays = finishRecent ? dayDiff(deadline, finishRecent) : null;
  const deltaLifetimeDays = finishLifetime ? dayDiff(deadline, finishLifetime) : null;

  const behind = finishRecent
    ? deltaRecentDays > 0
    : (requiredRate !== null && recentRate < requiredRate);

  return {
    doneRings, targetRings, remainingRings,
    recentRate, lifetimeRate, requiredRate,
    finishRecent, finishLifetime,
    deltaRecentDays, deltaLifetimeDays,
    daysLeft, behind,
  };
}
