// แนวอุโมงค์จริง TBM1 (geo) — สกัดจาก KMZ "Klongprem Project" · station ทุก 100 ม. บน centerline
// chainage จริงทั้งเส้น BP 0+000 → EP 8+882.226 · launch (รัชดา IS4) ที่ CH 8830.488 · เจาะทิศ chainage "ลดลง"
// geom length ของ polyline = 8,881 ม. ≈ chainage span 8,882 ม. (ตรวจแล้วตรง · 0 จุดเพี้ยน)
// pure data + math — ไม่ import maplibre/three (jest-safe)

export const CH_EXCAV_START = 8830.488;        // CH เริ่มขุด (รัชดา IS4) — ตรงกับ constants.js
export const TOTAL_ROUTE_DISTANCE = 8874.683;  // ระยะทางรวม (เมตร) — ตรงกับ constants.js
export const CH_MIN = 0.0;
export const CH_MAX = 8882.226;

// polyline พิกัด [lng, lat] เรียงตาม chainage (CH[] ขนานกัน)
export const LINE = [
  [100.5949822,13.8882031],[100.5942249,13.8878245],[100.5933636,13.8881575],[100.5925034,13.8884895],
  [100.5916346,13.8887982],[100.5907576,13.8890856],[100.589871,13.8893366],[100.5889681,13.8895087],
  [100.5880766,13.8893246],[100.5872009,13.8896302],[100.5864002,13.8900278],[100.5854872,13.8901741],
  [100.5845991,13.8903926],[100.5836829,13.8905282],[100.5828097,13.8904515],[100.5823343,13.889698],
  [100.581846,13.8889306],[100.5812838,13.8882573],[100.5810877,13.8873892],[100.5806874,13.8865715],
  [100.5802272,13.8857857],[100.5797406,13.8850202],[100.5793414,13.8842053],[100.5789181,13.8834016],
  [100.5784947,13.8825979],[100.5780631,13.8817977],[100.5776038,13.8810128],[100.5771708,13.8802151],
  [100.5767456,13.8794123],[100.5763157,13.8786115],[100.5758737,13.8778174],[100.5754315,13.8770234],
  [100.5749894,13.8762294],[100.5745473,13.8754354],[100.5741051,13.8746414],[100.573663,13.8738474],
  [100.5732209,13.8730534],[100.5727788,13.8722594],[100.5723601,13.8714549],[100.5719571,13.8706405],
  [100.5715037,13.8698522],[100.5710714,13.8690536],[100.5706367,13.8682551],[100.5701872,13.867465],
  [100.5697452,13.8666722],[100.5693402,13.8658587],[100.5688881,13.86507],[100.5684361,13.8642814],
  [100.5679882,13.8634909],[100.5675626,13.8626889],[100.5671424,13.8618838],[100.5667478,13.8610669],
  [100.5663358,13.8602564],[100.5658929,13.8594629],[100.5654499,13.8586693],[100.564995,13.8578812],
  [100.5645133,13.8571105],[100.5640603,13.8563225],[100.5635502,13.8555704],[100.5632137,13.8547369],
  [100.5628186,13.8539193],[100.5623984,13.8531133],[100.5619622,13.8523155],[100.5614933,13.8515371],
  [100.5610559,13.8507407],[100.5606184,13.8499442],[100.560181,13.8491478],[100.5597436,13.8483513],
  [100.5593062,13.8475548],[100.5588688,13.8467584],[100.5584313,13.8459619],[100.5579939,13.8451654],
  [100.5575565,13.844369],[100.5571191,13.8435725],[100.5566817,13.842776],[100.5562443,13.8419796],
  [100.5558069,13.8411831],[100.5553695,13.8403866],[100.5549322,13.8395902],[100.5544948,13.8387937],
  [100.5540574,13.8379972],[100.55362,13.8372007],[100.5531826,13.8364043],[100.5527453,13.8356078],
  [100.5523079,13.8348113],[100.5518614,13.8340193],[100.5514097,13.8332305],[100.5508924,13.8324788],
  [100.5503639,13.8317449],[100.5498376,13.8311982],
];
export const CH = [
  0,100,200,300,400,500,600,700,800,900,1000,1100,1200,1300,1400,1500,1600,1700,1800,1900,
  2000,2100,2200,2300,2400,2500,2600,2700,2800,2900,3000,3100,3200,3300,3400,3500,3600,3700,3800,3900,
  4000,4100,4200,4300,4400,4500,4600,4700,4800,4900,5000,5100,5200,5300,5400,5500,5600,5700,5800,5900,
  6000,6100,6200,6300,6400,6500,6600,6700,6800,6900,7000,7100,7200,7300,7400,7500,7600,7700,7800,7900,
  8000,8100,8200,8300,8400,8500,8600,8700,8800,8882.226,
];

// ป้ายกิโลเมตร (X+000) สำหรับโชว์บนแผนที่
export const KM_LABELS = [
  { ch: 0,    name: "0+000", lng: 100.5949822, lat: 13.8882031 },
  { ch: 1000, name: "1+000", lng: 100.5864002, lat: 13.8900278 },
  { ch: 2000, name: "2+000", lng: 100.5802272, lat: 13.8857857 },
  { ch: 3000, name: "3+000", lng: 100.5758737, lat: 13.8778174 },
  { ch: 4000, name: "4+000", lng: 100.5715037, lat: 13.8698522 },
  { ch: 5000, name: "5+000", lng: 100.5671424, lat: 13.8618838 },
  { ch: 6000, name: "6+000", lng: 100.5628186, lat: 13.8539193 },
  { ch: 7000, name: "7+000", lng: 100.5584313, lat: 13.8459619 },
  { ch: 8000, name: "8+000", lng: 100.5540574, lat: 13.8379972 },
];

// ปล่อง (chainage จาก constants.js ROUTE_SEGMENTS: ระยะขุดจาก launch → chainage = CH_EXCAV_START − ระยะ)
// fullName + capacity (ลบ.ม./วินาที) จากแผนผังโครงการทางการ · labelDir = ทิศกางป้ายบนแผนที่ (กันทับท่อ+กันทับกันเอง)
export const SHAFTS = [
  { id: "IS4", name: "รัชดา IS4",  fullName: "อาคารรับน้ำคลองเปรมประชากร ตอนถนนรัชดาภิเษก", capacity: 20, role: "Launch · Main+Working Shaft", ch: 8830.5, lng: 100.5501688, lat: 13.8315422, labelDir: "W" },
  { id: "IS3", name: "บางเขน IS3", fullName: "อาคารรับน้ำคลองเปรมประชากร ตอนคลองบางเขน",   capacity: 40, role: "Intermediate",                ch: 5764.5, lng: 100.5637312, lat: 13.8558372, labelDir: "NW" },
  { id: "IS2", name: "หลักสี่ IS2", fullName: "อาคารรับน้ำคลองเปรมประชากร ตอนวัดหลักสี่",   capacity: 40, role: "Intermediate",                ch: 1670.9, lng: 100.5814474, lat: 13.8884532, labelDir: "N" },
  { id: "IS1", name: "บางบัว IS1", fullName: "อาคารรับน้ำคลองบางบัว",                       capacity: 60, role: "Reception",                   ch: 0.0,    lng: 100.5949822, lat: 13.8882031, labelDir: "SE" },
];

// ───────── helpers ─────────
export function parseCH(v) {
  const m = /(-?\d+)\+(\d+(?:\.\d+)?)/.exec(String(v == null ? "" : v));
  if (m) return parseInt(m[1], 10) * 1000 + parseFloat(m[2]);
  const f = parseFloat(v);
  return isNaN(f) ? NaN : f;
}

// ระยะขุดจริง (เมตร) — ผลรวม length ของ ring ถาวร (ตัด Temporary), dedupe ตาม ringNo (เลือก Completed)
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
  return sum;
}

// chainage ของ "หน้าหัวเจาะ" = finishCH ที่น้อยสุด (เจาะทิศ chainage ลดลง) ของ ring ถาวร
// คืน null ถ้าไม่มีข้อมูล CH
export function headChainageFromRecords(records = []) {
  let min = Infinity;
  for (const r of records) {
    if (!r || r.installType === "Temporary") continue;
    const c = parseCH(r.finishCH);
    if (!isNaN(c) && c < min) min = c;
  }
  return min === Infinity ? null : min;
}

function clampCH(ch) { return Math.max(CH[0], Math.min(CH[CH.length - 1], ch)); }

// interpolate [lng,lat] ที่ chainage หนึ่งบน polyline
export function lngLatAtCh(ch) {
  ch = clampCH(ch);
  if (ch <= CH[0]) return LINE[0].slice();
  if (ch >= CH[CH.length - 1]) return LINE[LINE.length - 1].slice();
  for (let i = 1; i < CH.length; i++) {
    if (CH[i] >= ch) {
      const t = (ch - CH[i - 1]) / (CH[i] - CH[i - 1]);
      return [
        LINE[i - 1][0] + t * (LINE[i][0] - LINE[i - 1][0]),
        LINE[i - 1][1] + t * (LINE[i][1] - LINE[i - 1][1]),
      ];
    }
  }
  return LINE[LINE.length - 1].slice();
}

// เส้นย่อยของ polyline ระหว่าง chainage สองค่า (คืน [[lng,lat],...] รวมปลายที่ interpolate)
export function lineBetween(chA, chB) {
  let lo = clampCH(Math.min(chA, chB)), hi = clampCH(Math.max(chA, chB));
  const out = [lngLatAtCh(hi)];
  for (let i = CH.length - 1; i >= 0; i--) {
    if (CH[i] < hi && CH[i] > lo) out.push(LINE[i].slice());
  }
  out.push(lngLatAtCh(lo));
  return out; // เรียงจาก chainage มาก → น้อย (ทิศเจาะ)
}

// bearing (องศา, 0=เหนือ, ตามเข็ม) ของทิศ "เจาะ" (chainage ลดลง) ที่ chainage หนึ่ง
export function bearingAtCh(ch) {
  ch = clampCH(ch);
  // หาจุดคร่อม แล้วคิดทิศจาก chainage มาก → น้อย
  let i = 1;
  for (; i < CH.length; i++) { if (CH[i] >= ch) break; }
  i = Math.min(i, CH.length - 1);
  const hi = LINE[i - 1], lo = LINE[i]; // hi = chainage มากกว่า, lo = น้อยกว่า → ทิศเจาะ = hi→lo
  const φ1 = (hi[1] * Math.PI) / 180, φ2 = (lo[1] * Math.PI) / 180;
  const λ1 = (hi[0] * Math.PI) / 180, λ2 = (lo[0] * Math.PI) / 180;
  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
