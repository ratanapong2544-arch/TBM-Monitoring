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
