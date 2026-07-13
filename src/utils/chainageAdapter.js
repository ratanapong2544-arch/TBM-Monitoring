import { CH_EXCAV_START } from "./constants";

// แปลงระยะที่เจาะแล้วของเครื่อง (machineProgress[machine].dist, ม.) → STA chainage ปัจจุบัน
// สูตรยืนยันจาก AlignmentMapView.jsx:124 (headCh = CH_EXCAV_START - drilledM)
// + alignmentGeo.js:58 (chainage = CH_EXCAV_START − ระยะ) — เจาะทิศ chainage ลดลง (CH เริ่มสูงแล้วลดลง)
export function currentChainage(machineProgress, machine) {
  if (!machineProgress || !machineProgress[machine]) return null;
  const dist = Number(machineProgress[machine].dist);
  if (isNaN(dist)) return null;
  return CH_EXCAV_START - dist;
}

export function stationLabel(sta) {
  if (sta == null || isNaN(Number(sta))) return "-";
  const n = Math.round(Number(sta));
  const km = Math.floor(n / 1000);
  const m = String(n % 1000).padStart(3, "0");
  return `${km}+${m}`;
}

// Task R7b — machine-aware instrument views. Instrument data stays project-wide (one sheet); the
// TBM1/TBM2 split is a VIEW-level filter by chainage zone, not a data-layer concept:
//   TBM1 route: Shaft IS04 (CH 8+820) → Shaft IS01 (0+000) — chainage decreasing.
//   TBM2 route: Shaft IS04 (8+820) → OS (13+...) — chainage increasing, a different zone > 8+820.
// All 29 seeded locations sit at chainage 0–8360 (TBM1 zone); TBM2 has no locations yet (its launch
// CH/alignment isn't defined — tools/instrument-seed-data.mjs only ever sets TBM1-zone chainages).
// A location missing a numeric chainage defaults to TBM1 (today's only populated zone) instead of
// silently landing in "TBM2" via a NaN comparison.
export function locationMachine(location) {
  const chainage = Number(location && location.chainage);
  if (isNaN(chainage)) return "TBM1";
  return chainage <= CH_EXCAV_START ? "TBM1" : "TBM2";
}
