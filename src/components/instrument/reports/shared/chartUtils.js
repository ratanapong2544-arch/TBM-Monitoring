// ported from Instument Monitoring/tunnel-monitoring/src/components/location/reports/shared/chartUtils.ts
// (Task 6.1) — TS types stripped, date helpers made robust to this app's real Inst_Readings.date
// format (ISO "YYYY-MM-DD"/"YYYY-MM-DDTHH:MM:00", written by tools/preset-to-readings.mjs) instead
// of the source's PDF-era "DD/MM/YYYY[ HH:MM]" strings. getDateColor(date, allDates) is a dynamic
// gradient (position-in-series) replacing the source's hardcoded per-calendar-date palette, so it
// keeps working for any future report period instead of only the one PDF's date range.
import { chartColors } from "../../../../ui-ux-pro-max/chartTheme";

export const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function toDate(date) {
  if (date == null) return null;
  const s = String(date).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // fallback: "DD/MM/YYYY[ HH:MM]" (source PDF convention)
  const [datePart, timePart] = s.split(" ");
  const [day, month, year] = datePart.split("/").map(Number);
  if (!day || !month || !year) return null;
  const [hour, minute] = timePart ? timePart.split(":").map(Number) : [0, 0];
  const d = new Date(year, month - 1, day, hour || 0, minute || 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format a reading date (ISO or "DD/MM/YYYY") as "17 Dec" / "23 Apr 09:00". */
export function formatShortDate(date) {
  const d = toDate(date);
  if (!d) return date == null ? "" : String(date);
  const base = `${d.getDate()} ${monthNames[d.getMonth()]}`;
  const hh = d.getHours(), mm = d.getMinutes();
  if (hh === 0 && mm === 0) return base;
  return `${base} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Format a TBM chainage number as "8+389.356". */
export function stationLabelKm(station) {
  if (station == null || !Number.isFinite(Number(station))) return "—";
  const n = Number(station);
  const km = Math.floor(n / 1000);
  const meters = (n - km * 1000).toFixed(3).padStart(7, "0");
  return `${km}+${meters}`;
}

export function formatSignedNumber(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

/** Value with the largest absolute magnitude in a list, preserving its sign (peak reading). */
export function maxAbsOf(nums) {
  let best = null;
  nums.forEach((v) => {
    if (v != null && Number.isFinite(v) && (best == null || Math.abs(v) > Math.abs(best))) best = v;
  });
  return best;
}

// Match PDF source convention: Alert = green (mild), Alarm = yellow (medium), Action = red (critical).
// Kept as literal hex (not chartColors) — a universal traffic-light convention for threshold lines,
// distinct on purpose from the app's own code-a/b/c/d status badge palette.
export const thresholdColors = {
  alert: "#22c55e",
  alarm: "#eab308",
  action: "#dc2626",
};

// Up to 8 distinguishable series colors (depths / rings / sensors / SS points).
export const depthSeriesPalette = [
  "#0f766e", "#0284c7", "#2563eb", "#7c3aed",
  "#ca8a04", "#ea580c", "#dc2626", "#7f1d1d",
];

function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(rgb) {
  return `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;
}
const DATE_COLOR_COOL = chartColors.planned; // navy — earliest reading
const DATE_COLOR_WARM = chartColors.dayShift; // gold — latest reading

/** Color a line by its position within the full sorted date list (cool=earliest, warm=latest). */
export function getDateColor(date, allDates = []) {
  const idx = allDates.indexOf(date);
  if (idx < 0 || allDates.length <= 1) return DATE_COLOR_COOL;
  const t = idx / (allDates.length - 1);
  const cool = hexToRgb(DATE_COLOR_COOL);
  const warm = hexToRgb(DATE_COLOR_WARM);
  return rgbToHex(cool.map((c, i) => c + (warm[i] - c) * t));
}

/** Padded [min,max] domain around a set of values. */
export function autoDomain(values, padRatio = 0.1) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (!finite.length) return [-1, 1];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = Math.max(max - min, 1);
  const pad = span * padRatio;
  return [min - pad, max + pad];
}

/** Symmetric [-x,x] domain covering both the data spread and a required floor (e.g. threshold). */
export function symmetricDomain(values, floor = 1, padRatio = 0.1) {
  const finite = values.filter((v) => Number.isFinite(v));
  const spread = Math.max(...finite.map((v) => Math.abs(v)), floor);
  const pad = Math.max(1, Math.ceil(spread * padRatio));
  return [-(spread + pad), spread + pad];
}
