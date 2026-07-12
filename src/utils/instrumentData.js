export function parseProfile(json) {
  if (!json || typeof json !== "string") return [];
  try {
    const v = JSON.parse(json);
    if (Array.isArray(v)) return v;
    // object-shaped profileJson (e.g. { points:[...], _thresholds:{...} } — see Task 4.3 migration)
    if (v && Array.isArray(v.points)) return v.points;
    return [];
  } catch (e) { return []; }
}

// report-embedded threshold override (Task 4.3: profileJson._thresholds ± symmetric or per-tap upper/lower bands)
export function parseThresholds(json) {
  if (!json || typeof json !== "string") return null;
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" && !Array.isArray(v) && v._thresholds ? v._thresholds : null;
  } catch (e) { return null; }
}

export function serializeProfile(arr) {
  return JSON.stringify(Array.isArray(arr) ? arr : []);
}

export function resolveThreshold(thresholds, instrument) {
  if (!instrument || !Array.isArray(thresholds)) return null;
  const override = thresholds.find((t) => t.scope === "instrument" && String(t.key) === String(instrument.id));
  if (override) return { alert: Number(override.alert), alarm: Number(override.alarm), action: Number(override.action) };
  const byType = thresholds.find((t) => t.scope === "type" && t.key === instrument.type);
  if (byType) return { alert: Number(byType.alert), alarm: Number(byType.alarm), action: Number(byType.action) };
  return null;
}

export function latestReading(readings, instrumentId) {
  const rs = (readings || []).filter((r) => String(r.instrumentId) === String(instrumentId));
  if (!rs.length) return null;
  return rs.reduce((a, b) => (new Date(b.date) > new Date(a.date) ? b : a));
}
