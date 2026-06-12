// แนวอุโมงค์จริง TBM1 — สกัดจาก KMZ (Klongprem Project.kml · "Center Alignment" 24 จุด)
// chainage 0 = รัชดา · ใช้ chord จริง (ไม่ scale) · origin = รัชดา · scene scale ~0.0046 unit/m
// pts = พิกัด scene [x,z] (project lat/lng→เมตร→scene) · cum = ระยะสะสมจริง (เมตร) ต่อจุด
// pure data — ไม่ import three (jest-safe)
export const REAL_PTS = [
  [0,0],[1.447,-2.713],[1.794,-3.336],[2.316,-4.323],[3.135,-5.864],[3.329,-6.217],
  [5.145,-9.615],[5.423,-10.121],[6.502,-12.171],[6.768,-12.648],[7.193,-13.458],
  [7.927,-14.852],[8.189,-15.351],[8.443,-15.822],[9.754,-18.255],[10.158,-19.026],
  [11.416,-21.38],[11.718,-21.897],[12.821,-23.992],[13.462,-24.418],[13.801,-24.355],
  [14.005,-24.317],[14.517,-24.208],[17.282,-23.576],
];
export const REAL_CUM_M = [
  0,671.7,827.6,1071.5,1452.7,1540.7,2382.3,2508.4,3014.5,3133.9,3333.6,3677.9,
  3801.1,3918.0,4521.6,4711.9,5294.9,5425.6,5942.8,6110.5,6185.4,6230.4,6344.3,6960.4,
];
export const TOTAL_M = 6960.4;            // ระยะแนวจริง (chord) รัชดา → ปลายแนว
export const OFFICIAL_TOTAL_M = 8900;     // ระยะรวมตามตารางแผนงาน (โค้งจริงยาวกว่า chord)

export const SHAFTS = [
  { name: "รัชดา IS4",  en: "Main + Working Shaft",        km: 0.0,    note: "จุด launch (chainage 0)", tint: 0xF4B740, h: 3.4 },
  { name: "บางเขน IS3", en: "Maintenance (≈ตำแหน่ง)",       km: 1.5707, note: "≈ตำแหน่ง · ไม่มี benchmark ใน KMZ", tint: 0x9aa3b0, h: 3.1 },
  { name: "หลักสี่ IS2", en: "Lak Si (benchmark BMLK)",     km: 3.6779, note: "จาก benchmark BMLK", tint: 0x3B82F6, h: 3.1 },
  { name: "บางบัว IS1", en: "Bang Bua (ปลายแนวข้อมูล)",     km: 6.9604, note: "ปลายเส้น center alignment", tint: 0x7C3AED, h: 3.1 },
];

// ระยะขุดจริง (เมตร) จาก segment records — ผลรวม length ของ ring "ถาวร" (ไม่นับ Temporary), dedupe ตาม ringNo
// = ตัวเดียวกับฐานคิด totalActualDistance ใน RouteScheduleView
export function drilledMetersFromRecords(records = []) {
  const map = new Map();
  for (const r of records) {
    if (!r || r.ringNo == null) continue;
    const ex = map.get(r.ringNo);
    if (!ex) map.set(r.ringNo, r);
    else if (ex.status === "In Progress" && r.status !== "In Progress") map.set(r.ringNo, r);
    else if (ex.status === r.status) map.set(r.ringNo, r);
  }
  let sum = 0;
  for (const r of map.values()) {
    if (r.installType === "Temporary") continue;
    const L = parseFloat(r.length);
    if (!isNaN(L)) sum += L;
  }
  return sum; // เมตร
}
