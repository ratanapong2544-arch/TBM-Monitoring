// ⚠ SAMPLE / FIXTURE — ค่าทั้งหมดเป็น schematic ไม่ใช่ค่าสำรวจจริง
// จะถูกแทนด้วยข้อมูลที่สกัดจาก 01.TBM1 Daily Progress.dwg (ดู DWG extraction plan)
// contract: ดู docs/superpowers/specs/2026-06-18-underground-profile-head-deviation-design.md §5.1
// chainage system เดียวกับ alignmentGeo.js (เจาะทิศ chainage "ลดลง")

export const CH_RANGE = { min: 8000, max: 8400 };

export const LAYERS = [
  { name: "Soft–Medium Clay", code: "CH", color: "#5f8f86",
    top:    [{ ch: 8400, rl: 0.5 }, { ch: 8000, rl: -0.5 }],
    bottom: [{ ch: 8400, rl: -12 }, { ch: 8000, rl: -14 }] },
  { name: "Stiff Clay", code: "CL", color: "#c7a98b",
    top:    [{ ch: 8400, rl: -12 }, { ch: 8000, rl: -14 }],
    bottom: [{ ch: 8400, rl: -18 }, { ch: 8000, rl: -20 }] },
  { name: "Dense Sand", code: "SM", color: "#c7bd7a",
    top:    [{ ch: 8400, rl: -18 }, { ch: 8000, rl: -20 }],
    bottom: [{ ch: 8400, rl: -31 }, { ch: 8000, rl: -33 }] },
];

export const DESIGN_LINE = [
  { ch: 8400, rl: -19.5 }, { ch: 8200, rl: -20.2 }, { ch: 8000, rl: -21.0 },
];

export const BORE_DIA = 6.0; // ⚠ SAMPLE — ต้องสกัด/ยืนยันค่าจริงจาก DWG

export const BOREHOLES = [
  { id: "BH-27", ch: 8186, groundRL: 1.0,
    strata: [
      { code: "CH", fromRL: 0.5, toRL: -13 },
      { code: "CL", fromRL: -13, toRL: -19 },
      { code: "SM", fromRL: -19, toRL: -32 },
    ],
    spt: [{ rl: -2, n: 4 }, { rl: -10, n: 8 }, { rl: -20, n: 35 }, { rl: -28, n: 50 }] },
];
