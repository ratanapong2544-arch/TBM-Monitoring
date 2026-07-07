// แนว profile อุโมงค์เต็มแนว (IS1 -> IS4) — จากแบบจริง 01.TBM1 Daily Progress.dxf
// backdrop = ภาค render จริงจาก DXF (hatch/สี/หลุมเจาะ ตามแบบเป๊ะ) ที่ public/tbm1-profile-full.png
// transform: CH(m)=x-80.875 ; RL(m)=y-112.679  (chainage system เดียวกับ alignmentGeo.js)
// pure data — ไม่ import react/svg (jest-safe)

// ขอบเขต backdrop (ต้องตรงกับ bounds ที่ render: tools/render_backdrop_full.py)
export const CH_RANGE = { min: 0.0, max: 8900.0 };
export const RL_RANGE = { min: -75.0, max: 10.0 };

export const BACKDROP = {
  src: "/tbm1-profile-full.png",
  chMin: 0.0, chMax: 8900.0,       // ขอบซ้าย→ขวา (chainage เพิ่มซ้าย→ขวา)
  rlMin: -75.0, rlMax: 10.0,        // ขอบล่าง→บน
  aspect: 10.835,                   // กว้าง:สูง (px) ตอน render — ใช้คำนวณความสูง overlay
};

export const BORE_DIA = 6.3;        // เส้นผ่านศูนย์กลางเจาะ (ม.)

// ปล่องตลอดแนว (chainage จาก alignmentGeo.js)
export const SHAFTS = [
  { name: "IS1", ch: 0.0 },
  { name: "IS2", ch: 1670.9 },
  { name: "IS3", ch: 5764.5 },
  { name: "IS4 · launch", ch: 8830.5 },
];

// แนวแกนอุโมงค์ออกแบบตลอดแนว (IS1->IS4) — สกัดจากเส้นออกแบบในแบบ (median RL ต่อช่วง chainage)
// ใช้วาดท่ออุโมงค์ + วางหัวเจาะ + เส้นเชิด/ตก (deviation)
export const DESIGN_LINE = [
  { ch: 0, rl: -29.9 },    { ch: 1500, rl: -29.8 }, { ch: 2500, rl: -30.1 },
  { ch: 3500, rl: -31.5 }, { ch: 4500, rl: -32.3 }, { ch: 5200, rl: -32.0 },
  { ch: 6000, rl: -31.5 }, { ch: 7000, rl: -31.7 }, { ch: 8000, rl: -31.8 },
  { ch: 8830, rl: -32.1 },
];
