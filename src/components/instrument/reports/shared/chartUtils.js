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

// Task R2a — ported from tunnel-monitoring's chartUtils.ts, adapted to reuse this file's
// robust toDate() (ISO + "DD/MM/YYYY[ HH:MM]") instead of the source's split("/") which
// assumed every date was already "DD/MM/YYYY" and breaks on this app's ISO reading dates.

/** Parse a reading date (ISO or "DD/MM/YYYY") into a millisecond timestamp, or NaN. */
export function parseDateToMs(date) {
  const d = toDate(date);
  return d ? d.getTime() : NaN;
}

/** Generate tick timestamps between two reading dates, every stepDays (end always included). */
export function weeklyTickTimestamps(startDate, endDate, stepDays = 7) {
  const start = parseDateToMs(startDate);
  const end = parseDateToMs(endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const step = stepDays * 24 * 60 * 60 * 1000;
  const out = [];
  for (let t = start; t <= end; t += step) out.push(t);
  if (out[out.length - 1] !== end) out.push(end);
  return out;
}

/** Format a millisecond timestamp as "DD/MM/YY" (for axis ticks). */
export function formatDateTick(ms) {
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
}

/** Format a TBM chainage number as "8+389.356". */
export function stationLabelKm(station) {
  if (station == null || !Number.isFinite(Number(station))) return "—";
  const n = Number(station);
  const km = Math.floor(n / 1000);
  const meters = (n - km * 1000).toFixed(3).padStart(7, "0");
  return `${km}+${meters}`;
}

// Task R2a — alias so new report code (ReportShell) can import the source's naming;
// stationLabelKm stays exported as-is since v1 reports (ContextStrip etc.) still import it.
export const formatStation = stationLabelKm;

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
// Task R2a — multi-stop gradient (was a single navy→gold lerp). Depth/settlement profile
// overlays can stack ~17 date lines; two tones compress most of them into near-identical
// shades. Five stops spread across four segments give far more hue separation while staying
// dynamic (position-in-allDates, not a hardcoded per-date lookup) — reuses this app's own
// existing hex constants so it still reads as one navy-themed palette.
const DATE_COLOR_STOPS = [
  chartColors.planned,    // navy   — earliest
  chartColors.paid,       // cyan
  "#7c3aed",              // violet (matches depthSeriesPalette's own violet stop above)
  chartColors.dayShift,   // gold
  chartColors.actualAlert, // red   — latest
].map(hexToRgb);

/** Color a line by its position within the full sorted date list, via a navy→cyan→violet→
 * gold→red gradient (earliest→latest). Signature unchanged so existing report callers
 * (e.g. SurfaceSettlementReport) keep working as-is. */
export function getDateColor(date, allDates = []) {
  const idx = allDates.indexOf(date);
  if (idx < 0 || allDates.length <= 1) return rgbToHex(DATE_COLOR_STOPS[0]);
  const t = idx / (allDates.length - 1);
  const segments = DATE_COLOR_STOPS.length - 1;
  const pos = t * segments;
  const seg = Math.min(Math.floor(pos), segments - 1);
  const localT = pos - seg;
  const from = DATE_COLOR_STOPS[seg];
  const to = DATE_COLOR_STOPS[seg + 1];
  return rgbToHex(from.map((c, i) => c + (to[i] - c) * localT));
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

// Task R2b — ported from tunnel-monitoring's InclinometerReport.tsx / ExtensometerReport.tsx
// (dual-axis time-history + TBM station overlay). These two fixed domains are shared by both
// reports' Time History charts. Left axis (±30 mm) matches the source PDF's deflection/settlement
// scale; right axis (8+100..8+400) is this project's physical TBM station range at the monitored
// instrument cluster. Both are fixed per the report brief, not derived from data — unlike the time
// (X) axis, which must track whatever date range the real readings span, see weeklyTickTimestamps.
export const TIME_HISTORY_Y_DOMAIN = [-30, 30];
export const TIME_HISTORY_Y_TICKS = [-30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30];
export const STATION_Y_DOMAIN = [8100, 8400];
export const STATION_Y_TICKS = Array.from({ length: 16 }, (_, i) => 8100 + i * 20);

// Task R2b — the source report preset hand-authored a fixed depth-highlight list for the INC Time
// History chart (reportMeasurementPresets.ts:311, `inclinometerDepthHighlights` =
// [5,10,15,20,25,30,35]): the standard round-number depth-reporting marks (step 5, starting at 5,
// NOT 0). This is deliberate curation, not a data limit — the source's own data (and this app's
// real 8+300 data) include depth 0.0 and every 0.5 m step, so every round mark is available.
export const ROUND5_DEPTH_HIGHLIGHTS = [5, 10, 15, 20, 25, 30, 35];

/** Evenly index-sample up to `count` real depths from a sorted list (shallowest + deepest always
 * included). Fallback path only — never interpolates a depth that wasn't measured. */
function evenSampleDepths(sorted, count) {
  if (count <= 0 || !sorted.length) return [];
  if (sorted.length <= count) return sorted;
  if (count === 1) return [sorted[0]];
  const last = sorted.length - 1;
  const picked = [];
  for (let i = 0; i < count; i += 1) {
    const depth = sorted[Math.round((i * last) / (count - 1))];
    if (!picked.includes(depth)) picked.push(depth);
  }
  return picked;
}

/** Depths to highlight in the INC Time History chart: the source's round-5 marks
 * ([5,10,15,20,25,30,35]), each resolved to its exact measured depth or the nearest available
 * measured point, deduped (preserves ascending order). Falls back to an even index-sample only
 * when NONE of the round-5 marks fall within the borehole's measured depth range (e.g. a very
 * shallow borehole) — never invents or interpolates a depth that wasn't measured. */
export function pickHighlightedDepths(depths, targets = ROUND5_DEPTH_HIGHLIGHTS) {
  const sorted = [...new Set(depths)].filter((d) => Number.isFinite(d)).sort((a, b) => a - b);
  if (!sorted.length) return [];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const inRange = targets.filter((t) => t >= min && t <= max);
  if (!inRange.length) return evenSampleDepths(sorted, targets.length);
  const picked = [];
  inRange.forEach((t) => {
    const nearest = sorted.reduce((best, d) => (Math.abs(d - t) < Math.abs(best - t) ? d : best), sorted[0]);
    if (!picked.includes(nearest)) picked.push(nearest);
  });
  return picked;
}

/** Scan every reading's parsed profile points for the single largest-magnitude value across the
 * *entire* history (not just the latest reading) — matches the source report preset's
 * "maxMovement"/"maxSettlement" fields (verified against tunnel-monitoring's
 * reportMeasurementPresets.ts: the recorded peak's date is not always the last date — e.g. the
 * B-axis max there lands mid-period, not on the final measurement date). `parsedRows` is
 * `[{date, points}]`; `valueOf(point)`/`metaOf(point)` extract the number and its label (depth or
 * ring name) from one profile point. Returns `{ value, date, meta }` for the winning point, or
 * null if no finite values exist anywhere. */
export function findPeakAcrossReadings(parsedRows, valueOf, metaOf) {
  let best = null;
  parsedRows.forEach(({ date, points }) => {
    (points || []).forEach((p) => {
      const v = valueOf(p);
      if (v != null && Number.isFinite(v) && (!best || Math.abs(v) > Math.abs(best.value))) {
        best = { value: v, date, meta: metaOf(p) };
      }
    });
  });
  return best;
}
