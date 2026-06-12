// Forecast engine (CPM) สำหรับ Prep Gantt — pure functions ทั้งไฟล์ (jest ตรงๆ ไม่ต้อง mock)
import { addDays } from "./prepGantt"; // eslint-disable-line no-unused-vars

const _d = (s) => new Date(s + "T00:00:00");
export const dayDiff = (a, b) => Math.round((_d(b) - _d(a)) / 86400000);

const MODE_KEY = "tbmPrepForecastMode";

export function loadForecastMode() {
  try {
    return localStorage.getItem(MODE_KEY) === "rate" ? "rate" : "remaining";
  } catch (e) { return "remaining"; }
}

export function saveForecastMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode === "rate" ? "rate" : "remaining"); } catch (e) { /* ignore quota */ }
}
