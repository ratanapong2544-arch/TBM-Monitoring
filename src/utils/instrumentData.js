export function parseProfile(json) {
  if (!json || typeof json !== "string") return [];
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
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
