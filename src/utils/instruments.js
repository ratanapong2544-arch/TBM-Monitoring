// src/utils/instruments.js
export const STORE = {
  locations: "instLocations", instruments: "instInstruments",
  thresholds: "instThresholds", readings: "instReadings", schedules: "instSchedules",
};

export function makeInstId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

export function loadCache(key) {
  try { const raw = localStorage.getItem(key); if (!raw) return []; const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
  catch (e) { return []; }
}

export function persistCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { /* ignore quota */ }
}
