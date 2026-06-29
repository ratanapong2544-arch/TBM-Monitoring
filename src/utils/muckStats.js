// ผลกระทบจากงานขนดิน (delay code "Muck Full" เท่านั้น) — pure function
export function computeMuckImpact({ catMin = {}, delayItems = [], avgCycleHours = 0 }) {
  const muckMin = catMin["Muck Full"] || 0;
  const muckHours = muckMin / 60;
  const delayTotal = delayItems.reduce((s, d) => s + (d.minutes || 0), 0);
  const muckShare = delayTotal > 0 ? muckMin / delayTotal : 0;
  const isTopCause = delayItems.length > 0 && delayItems[0].name === "Muck Full" && muckMin > 0;
  const equivRings = avgCycleHours > 0 ? Math.round(muckHours / avgCycleHours) : null;
  return { muckMin, muckHours, muckShare, isTopCause, equivRings, hasData: muckMin > 0 };
}
