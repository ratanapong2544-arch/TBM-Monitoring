/**
 * Instrument seed data — pure JS module (migration source, no DB/prisma deps)
 * ============================================================
 * Ported from: Instument Monitoring/tunnel-monitoring/prisma/seed.ts
 * ข้อมูลจาก: Tunnel_Instrumentation_segment R2.xlsx (Sheet: Data)
 * จำนวน: 29 ตำแหน่ง, 245 เครื่องมือ, ค่าเกณฑ์ 4 ประเภท
 *
 * ใช้โดย tools/migrate-instruments.mjs (Task 4.2) เพื่อ POST → GAS bulkImportInstrument
 * row-objects ตรงตาม INST_LOC_HEADERS / INST_INS_HEADERS / INST_TH_HEADERS / INST_SC_HEADERS
 * (../gas-live/Code.js)
 */

// ============================================================
// 1. LOCATION DATA (29 จุด จาก Excel Data Sheet)
// ============================================================
const LOCATIONS = [
  // === Shaft (5 จุด) ===
  { name: "Shaft IS01", chainage: 0, type: "SHAFT" },
  { name: "Shaft IS02", chainage: 1690, type: "SHAFT" },
  { name: "Shaft IS03", chainage: 5800, type: "SHAFT" },
  { name: "Shaft IS04-1", chainage: 8770, type: "SHAFT" },
  { name: "Shaft IS04", chainage: 8820, type: "SHAFT" },

  // === Bridge (15 จุด) ===
  { name: "Bridge 1+145", chainage: 1145, type: "BRIDGE" },
  { name: "Bridge 1+150", chainage: 1150, type: "BRIDGE" },
  { name: "Bridge 1+220", chainage: 1220, type: "BRIDGE" },
  { name: "Bridge 1+260", chainage: 1260, type: "BRIDGE" },
  { name: "Bridge 2+100", chainage: 2100, type: "BRIDGE" },
  { name: "Bridge 2+700", chainage: 2700, type: "BRIDGE" },
  { name: "Bridge 3+500", chainage: 3500, type: "BRIDGE" },
  { name: "Bridge 3+750", chainage: 3750, type: "BRIDGE" },
  { name: "Bridge 4+075", chainage: 4075, type: "BRIDGE" },
  { name: "Bridge 4+375", chainage: 4375, type: "BRIDGE" },
  { name: "Bridge 5+000", chainage: 5000, type: "BRIDGE" },
  { name: "Bridge 5+920", chainage: 5920, type: "BRIDGE" },
  { name: "Bridge 6+300", chainage: 6300, type: "BRIDGE" },
  { name: "Bridge 6+700", chainage: 6700, type: "BRIDGE" },
  { name: "Bridge 7+860", chainage: 7860, type: "BRIDGE" },

  // === Above Tunnel (6 จุด) ===
  { name: "Above Tunnel 0+300", chainage: 300, type: "ABOVE_TUNNEL" },
  { name: "Above Tunnel 0+800", chainage: 800, type: "ABOVE_TUNNEL" },
  { name: "Above Tunnel 3+200", chainage: 3200, type: "ABOVE_TUNNEL" },
  { name: "Above Tunnel 5+400", chainage: 5400, type: "ABOVE_TUNNEL" },
  { name: "Above Tunnel 7+400", chainage: 7400, type: "ABOVE_TUNNEL" },
  { name: "Above Tunnel 8+300", chainage: 8300, actualChainage: 8360, type: "ABOVE_TUNNEL" },

  // === Settlement Only (3 จุด) ===
  { name: "Settlement 1+800", chainage: 1800, type: "SETTLEMENT_ONLY" },
  { name: "Settlement 2+500", chainage: 2500, type: "SETTLEMENT_ONLY" },
  { name: "Settlement 4+700", chainage: 4700, type: "SETTLEMENT_ONLY" },
];

// ============================================================
// 2. INSTRUMENT DATA (จาก Excel Data Sheet)
// key = location name → instruments[]
// ============================================================
const INSTRUMENTS = {
  // === Shaft IS01 (0+000) - ไม่มีเครื่องมือ ===
  "Shaft IS01": [],

  // === Above Tunnel 0+300 — Page 2 ===
  // ตำแหน่งจริงบน CAD: เครื่องมือกระจายรอบ STA 0+300 บริเวณ Center Alignment
  "Above Tunnel 0+300": [
    { code: "P6379", type: "INCLINOMETER", blueprintPage: 2, blueprintX: 19, blueprintY: 43 },
    { code: "P6377", type: "EXTENSOMETER", blueprintPage: 2, blueprintX: 67, blueprintY: 57 },
    { code: "P6374", type: "PIEZOMETER", blueprintPage: 2, blueprintX: 69, blueprintY: 57 },
    { code: "P6352-L3", type: "SETTLEMENT_POINT", blueprintPage: 2, blueprintX: 40, blueprintY: 30 },
    { code: "P6352-L2", type: "SETTLEMENT_POINT", blueprintPage: 2, blueprintX: 45, blueprintY: 30 },
    { code: "P6352-L1", type: "SETTLEMENT_POINT", blueprintPage: 2, blueprintX: 50, blueprintY: 30 },
    { code: "P6352", type: "SETTLEMENT_POINT", blueprintPage: 2, blueprintX: 55, blueprintY: 30 },
    { code: "P6352-R1", type: "SETTLEMENT_POINT", blueprintPage: 2, blueprintX: 60, blueprintY: 30 },
    { code: "P6352-R2", type: "SETTLEMENT_POINT", blueprintPage: 2, blueprintX: 65, blueprintY: 30 },
    { code: "P6352-R3", type: "SETTLEMENT_POINT", blueprintPage: 2, blueprintX: 70, blueprintY: 30 },
    { code: "P6352-R4", type: "SETTLEMENT_POINT", blueprintPage: 2, blueprintX: 75, blueprintY: 30 },
  ],

  // === Above Tunnel 0+800 — Page 3 ===
  "Above Tunnel 0+800": [
    { code: "P5930", type: "INCLINOMETER", blueprintPage: 3, blueprintX: 15, blueprintY: 45 },
    { code: "P5925", type: "EXTENSOMETER", blueprintPage: 3, blueprintX: 67, blueprintY: 58 },
    { code: "P5923", type: "PIEZOMETER", blueprintPage: 3, blueprintX: 69, blueprintY: 58 },
    { code: "P5901-L3", type: "SETTLEMENT_POINT", blueprintPage: 3, blueprintX: 40, blueprintY: 30 },
    { code: "P5901-L2", type: "SETTLEMENT_POINT", blueprintPage: 3, blueprintX: 45, blueprintY: 30 },
    { code: "P5901-L1", type: "SETTLEMENT_POINT", blueprintPage: 3, blueprintX: 50, blueprintY: 30 },
    { code: "P5901", type: "SETTLEMENT_POINT", blueprintPage: 3, blueprintX: 55, blueprintY: 30 },
    { code: "P5901-R1", type: "SETTLEMENT_POINT", blueprintPage: 3, blueprintX: 60, blueprintY: 30 },
    { code: "P5901-R2", type: "SETTLEMENT_POINT", blueprintPage: 3, blueprintX: 65, blueprintY: 30 },
    { code: "P5901-R3", type: "SETTLEMENT_POINT", blueprintPage: 3, blueprintX: 70, blueprintY: 30 },
    { code: "P5901-R4", type: "SETTLEMENT_POINT", blueprintPage: 3, blueprintX: 75, blueprintY: 30 },
  ],

  // === Bridge 1+145 — Page 4 ===
  "Bridge 1+145": [
    { code: "P5259-L3", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 40, blueprintY: 28 },
    { code: "P5259-L2", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 45, blueprintY: 28 },
    { code: "P5259-L1", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 50, blueprintY: 28 },
    { code: "P5259", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 55, blueprintY: 28 },
    { code: "P5259-R1", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 60, blueprintY: 28 },
    { code: "P5259-R2", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 65, blueprintY: 28 },
    { code: "P5259-R3", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 70, blueprintY: 28 },
    { code: "P5259-R4", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 75, blueprintY: 28 },
  ],

  // === Bridge 1+150 — Page 4 ===
  "Bridge 1+150": [
    { code: "P5630", type: "INCLINOMETER", blueprintPage: 4, blueprintX: 88, blueprintY: 33 },
    { code: "P5631", type: "EXTENSOMETER", blueprintPage: 4, blueprintX: 82, blueprintY: 50 },
    { code: "P5570-L3", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 50, blueprintY: 28 },
    { code: "P5570-L2", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 55, blueprintY: 28 },
    { code: "P5570-L1", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 60, blueprintY: 28 },
    { code: "P5570", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 65, blueprintY: 28 },
    { code: "P5570-R1", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 70, blueprintY: 28 },
    { code: "P5570-R2", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 75, blueprintY: 28 },
    { code: "P5570-R3", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 80, blueprintY: 28 },
    { code: "P5570-R4", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 85, blueprintY: 28 },
  ],

  // === Bridge 1+220 — Page 4 ===
  "Bridge 1+220": [
    { code: "P5538", type: "INCLINOMETER", blueprintPage: 4, blueprintX: 60, blueprintY: 30 },
    { code: "P5525", type: "INCLINOMETER", blueprintPage: 4, blueprintX: 55, blueprintY: 44 },
    { code: "P5528", type: "EXTENSOMETER", blueprintPage: 4, blueprintX: 57, blueprintY: 37 },
    { code: "P5519-L3", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 37, blueprintY: 28 },
    { code: "P5519-L2", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 42, blueprintY: 28 },
    { code: "P5519-L1", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 47, blueprintY: 28 },
    { code: "P5519", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 52, blueprintY: 28 },
    { code: "P5519-R1", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 57, blueprintY: 28 },
    { code: "P5519-R2", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 62, blueprintY: 28 },
    { code: "P5519-R3", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 67, blueprintY: 28 },
    { code: "P5519-R4", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 72, blueprintY: 28 },
  ],

  // === Bridge 1+260 — Page 4 ===
  "Bridge 1+260": [
    { code: "P5484", type: "INCLINOMETER", blueprintPage: 4, blueprintX: 42, blueprintY: 32 },
    { code: "P5482", type: "EXTENSOMETER", blueprintPage: 4, blueprintX: 38, blueprintY: 38 },
    { code: "P5473-L3", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 20, blueprintY: 28 },
    { code: "P5473-L2", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 25, blueprintY: 28 },
    { code: "P5473-L1", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 30, blueprintY: 28 },
    { code: "P5473", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 35, blueprintY: 28 },
    { code: "P5473-R1", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 40, blueprintY: 28 },
    { code: "P5473-R2", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 45, blueprintY: 28 },
    { code: "P5473-R3", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 50, blueprintY: 28 },
    { code: "P5473-R4", type: "SETTLEMENT_POINT", blueprintPage: 4, blueprintX: 55, blueprintY: 28 },
  ],

  // === Shaft IS02 (1+690) ===
  "Shaft IS02": [],

  // === Settlement 1+800 — Page 7 ===
  "Settlement 1+800": [
    { code: "P5026-L3", type: "SETTLEMENT_POINT", blueprintPage: 7, blueprintX: 35, blueprintY: 30 },
    { code: "P5026-L2", type: "SETTLEMENT_POINT", blueprintPage: 7, blueprintX: 40, blueprintY: 30 },
    { code: "P5026-L1", type: "SETTLEMENT_POINT", blueprintPage: 7, blueprintX: 45, blueprintY: 30 },
    { code: "P5026", type: "SETTLEMENT_POINT", blueprintPage: 7, blueprintX: 50, blueprintY: 30 },
    { code: "P5026-R1", type: "SETTLEMENT_POINT", blueprintPage: 7, blueprintX: 55, blueprintY: 30 },
    { code: "P5026-R2", type: "SETTLEMENT_POINT", blueprintPage: 7, blueprintX: 60, blueprintY: 30 },
    { code: "P5026-R3", type: "SETTLEMENT_POINT", blueprintPage: 7, blueprintX: 65, blueprintY: 30 },
    { code: "P5026-R4", type: "SETTLEMENT_POINT", blueprintPage: 7, blueprintX: 70, blueprintY: 30 },
  ],

  // === Bridge 2+100 — Page 8 ===
  "Bridge 2+100": [
    { code: "P4810", type: "INCLINOMETER", blueprintPage: 8, blueprintX: 45, blueprintY: 35 },
    { code: "P4812", type: "EXTENSOMETER", blueprintPage: 8, blueprintX: 50, blueprintY: 42 },
    { code: "P4802-L3", type: "SETTLEMENT_POINT", blueprintPage: 8, blueprintX: 33, blueprintY: 28 },
    { code: "P4802-L2", type: "SETTLEMENT_POINT", blueprintPage: 8, blueprintX: 38, blueprintY: 28 },
    { code: "P4802-L1", type: "SETTLEMENT_POINT", blueprintPage: 8, blueprintX: 43, blueprintY: 28 },
    { code: "P4802", type: "SETTLEMENT_POINT", blueprintPage: 8, blueprintX: 48, blueprintY: 28 },
    { code: "P4802-R1", type: "SETTLEMENT_POINT", blueprintPage: 8, blueprintX: 53, blueprintY: 28 },
    { code: "P4802-R2", type: "SETTLEMENT_POINT", blueprintPage: 8, blueprintX: 58, blueprintY: 28 },
    { code: "P4802-R3", type: "SETTLEMENT_POINT", blueprintPage: 8, blueprintX: 63, blueprintY: 28 },
    { code: "P4802-R4", type: "SETTLEMENT_POINT", blueprintPage: 8, blueprintX: 68, blueprintY: 28 },
  ],

  // === Settlement 2+500 — Page 9 ===
  "Settlement 2+500": [
    { code: "P4526-L3", type: "SETTLEMENT_POINT", blueprintPage: 9, blueprintX: 35, blueprintY: 30 },
    { code: "P4526-L2", type: "SETTLEMENT_POINT", blueprintPage: 9, blueprintX: 40, blueprintY: 30 },
    { code: "P4526-L1", type: "SETTLEMENT_POINT", blueprintPage: 9, blueprintX: 45, blueprintY: 30 },
    { code: "P4526", type: "SETTLEMENT_POINT", blueprintPage: 9, blueprintX: 50, blueprintY: 30 },
    { code: "P4526-R1", type: "SETTLEMENT_POINT", blueprintPage: 9, blueprintX: 55, blueprintY: 30 },
    { code: "P4526-R2", type: "SETTLEMENT_POINT", blueprintPage: 9, blueprintX: 60, blueprintY: 30 },
    { code: "P4526-R3", type: "SETTLEMENT_POINT", blueprintPage: 9, blueprintX: 65, blueprintY: 30 },
    { code: "P4526-R4", type: "SETTLEMENT_POINT", blueprintPage: 9, blueprintX: 70, blueprintY: 30 },
  ],

  // === Bridge 2+700 — Page 10 ===
  "Bridge 2+700": [
    { code: "P4349", type: "INCLINOMETER", blueprintPage: 10, blueprintX: 40, blueprintY: 32 },
    { code: "P4348", type: "INCLINOMETER", blueprintPage: 10, blueprintX: 55, blueprintY: 38 },
    { code: "P4350", type: "EXTENSOMETER", blueprintPage: 10, blueprintX: 48, blueprintY: 42 },
    { code: "P4387-L3", type: "SETTLEMENT_POINT", blueprintPage: 10, blueprintX: 30, blueprintY: 28 },
    { code: "P4387-L2", type: "SETTLEMENT_POINT", blueprintPage: 10, blueprintX: 35, blueprintY: 28 },
    { code: "P4387-L1", type: "SETTLEMENT_POINT", blueprintPage: 10, blueprintX: 40, blueprintY: 28 },
    { code: "P4387", type: "SETTLEMENT_POINT", blueprintPage: 10, blueprintX: 45, blueprintY: 28 },
    { code: "P4387-R1", type: "SETTLEMENT_POINT", blueprintPage: 10, blueprintX: 50, blueprintY: 28 },
    { code: "P4387-R2", type: "SETTLEMENT_POINT", blueprintPage: 10, blueprintX: 55, blueprintY: 28 },
    { code: "P4387-R3", type: "SETTLEMENT_POINT", blueprintPage: 10, blueprintX: 60, blueprintY: 28 },
    { code: "P4387-R4", type: "SETTLEMENT_POINT", blueprintPage: 10, blueprintX: 65, blueprintY: 28 },
  ],

  // === Above Tunnel 3+200 — Page 11 ===
  "Above Tunnel 3+200": [
    { code: "P4053", type: "INCLINOMETER", blueprintPage: 11, blueprintX: 18, blueprintY: 44 },
    { code: "P4051", type: "EXTENSOMETER", blueprintPage: 11, blueprintX: 67, blueprintY: 57 },
    { code: "P4048", type: "PIEZOMETER", blueprintPage: 11, blueprintX: 69, blueprintY: 57 },
    { code: "P4026-L3", type: "SETTLEMENT_POINT", blueprintPage: 11, blueprintX: 40, blueprintY: 30 },
    { code: "P4026-L2", type: "SETTLEMENT_POINT", blueprintPage: 11, blueprintX: 45, blueprintY: 30 },
    { code: "P4026-L1", type: "SETTLEMENT_POINT", blueprintPage: 11, blueprintX: 50, blueprintY: 30 },
    { code: "P4026", type: "SETTLEMENT_POINT", blueprintPage: 11, blueprintX: 55, blueprintY: 30 },
    { code: "P4026-R1", type: "SETTLEMENT_POINT", blueprintPage: 11, blueprintX: 60, blueprintY: 30 },
    { code: "P4026-R2", type: "SETTLEMENT_POINT", blueprintPage: 11, blueprintX: 65, blueprintY: 30 },
    { code: "P4026-R3", type: "SETTLEMENT_POINT", blueprintPage: 11, blueprintX: 70, blueprintY: 30 },
    { code: "P4026-R4", type: "SETTLEMENT_POINT", blueprintPage: 11, blueprintX: 75, blueprintY: 30 },
  ],

  // === Bridge 3+500 — Page 12 ===
  "Bridge 3+500": [
    { code: "P3782", type: "INCLINOMETER", blueprintPage: 12, blueprintX: 45, blueprintY: 35 },
    { code: "P3784", type: "EXTENSOMETER", blueprintPage: 12, blueprintX: 50, blueprintY: 42 },
    { code: "P3823-L3", type: "SETTLEMENT_POINT", blueprintPage: 12, blueprintX: 33, blueprintY: 28 },
    { code: "P3823-L2", type: "SETTLEMENT_POINT", blueprintPage: 12, blueprintX: 38, blueprintY: 28 },
    { code: "P3823-L1", type: "SETTLEMENT_POINT", blueprintPage: 12, blueprintX: 43, blueprintY: 28 },
    { code: "P3823", type: "SETTLEMENT_POINT", blueprintPage: 12, blueprintX: 48, blueprintY: 28 },
    { code: "P3823-R1", type: "SETTLEMENT_POINT", blueprintPage: 12, blueprintX: 53, blueprintY: 28 },
    { code: "P3823-R2", type: "SETTLEMENT_POINT", blueprintPage: 12, blueprintX: 58, blueprintY: 28 },
    { code: "P3823-R3", type: "SETTLEMENT_POINT", blueprintPage: 12, blueprintX: 63, blueprintY: 28 },
    { code: "P3823-R4", type: "SETTLEMENT_POINT", blueprintPage: 12, blueprintX: 68, blueprintY: 28 },
  ],

  // === Bridge 3+750 — Page 13 ===
  "Bridge 3+750": [
    { code: "P3612", type: "INCLINOMETER", blueprintPage: 13, blueprintX: 45, blueprintY: 35 },
    { code: "P3614", type: "EXTENSOMETER", blueprintPage: 13, blueprintX: 50, blueprintY: 42 },
    { code: "P3652-L3", type: "SETTLEMENT_POINT", blueprintPage: 13, blueprintX: 33, blueprintY: 28 },
    { code: "P3652-L2", type: "SETTLEMENT_POINT", blueprintPage: 13, blueprintX: 38, blueprintY: 28 },
    { code: "P3652-L1", type: "SETTLEMENT_POINT", blueprintPage: 13, blueprintX: 43, blueprintY: 28 },
    { code: "P3652", type: "SETTLEMENT_POINT", blueprintPage: 13, blueprintX: 48, blueprintY: 28 },
    { code: "P3652-R1", type: "SETTLEMENT_POINT", blueprintPage: 13, blueprintX: 53, blueprintY: 28 },
    { code: "P3652-R2", type: "SETTLEMENT_POINT", blueprintPage: 13, blueprintX: 58, blueprintY: 28 },
    { code: "P3652-R3", type: "SETTLEMENT_POINT", blueprintPage: 13, blueprintX: 63, blueprintY: 28 },
    { code: "P3652-R4", type: "SETTLEMENT_POINT", blueprintPage: 13, blueprintX: 68, blueprintY: 28 },
  ],

  // === Bridge 4+075 — Page 14 ===
  "Bridge 4+075": [
    { code: "P3407-L3", type: "SETTLEMENT_POINT", blueprintPage: 14, blueprintX: 35, blueprintY: 30 },
    { code: "P3407-L2", type: "SETTLEMENT_POINT", blueprintPage: 14, blueprintX: 40, blueprintY: 30 },
    { code: "P3407-L1", type: "SETTLEMENT_POINT", blueprintPage: 14, blueprintX: 45, blueprintY: 30 },
    { code: "P3407", type: "SETTLEMENT_POINT", blueprintPage: 14, blueprintX: 50, blueprintY: 30 },
    { code: "P3407-R1", type: "SETTLEMENT_POINT", blueprintPage: 14, blueprintX: 55, blueprintY: 30 },
    { code: "P3407-R2", type: "SETTLEMENT_POINT", blueprintPage: 14, blueprintX: 60, blueprintY: 30 },
    { code: "P3407-R3", type: "SETTLEMENT_POINT", blueprintPage: 14, blueprintX: 65, blueprintY: 30 },
    { code: "P3407-R4", type: "SETTLEMENT_POINT", blueprintPage: 14, blueprintX: 70, blueprintY: 30 },
  ],

  // === Bridge 4+375 — Page 15 ===
  "Bridge 4+375": [
    { code: "P3137", type: "INCLINOMETER", blueprintPage: 15, blueprintX: 45, blueprintY: 35 },
    { code: "P3139", type: "EXTENSOMETER", blueprintPage: 15, blueprintX: 50, blueprintY: 42 },
    { code: "P3178-L3", type: "SETTLEMENT_POINT", blueprintPage: 15, blueprintX: 33, blueprintY: 28 },
    { code: "P3178-L2", type: "SETTLEMENT_POINT", blueprintPage: 15, blueprintX: 38, blueprintY: 28 },
    { code: "P3178-L1", type: "SETTLEMENT_POINT", blueprintPage: 15, blueprintX: 43, blueprintY: 28 },
    { code: "P3178", type: "SETTLEMENT_POINT", blueprintPage: 15, blueprintX: 48, blueprintY: 28 },
    { code: "P3178-R1", type: "SETTLEMENT_POINT", blueprintPage: 15, blueprintX: 53, blueprintY: 28 },
    { code: "P3178-R2", type: "SETTLEMENT_POINT", blueprintPage: 15, blueprintX: 58, blueprintY: 28 },
    { code: "P3178-R3", type: "SETTLEMENT_POINT", blueprintPage: 15, blueprintX: 63, blueprintY: 28 },
    { code: "P3178-R4", type: "SETTLEMENT_POINT", blueprintPage: 15, blueprintX: 68, blueprintY: 28 },
  ],

  // === Settlement 4+700 — Page 16 ===
  "Settlement 4+700": [
    { code: "P2955-L3", type: "SETTLEMENT_POINT", blueprintPage: 16, blueprintX: 35, blueprintY: 30 },
    { code: "P2955-L2", type: "SETTLEMENT_POINT", blueprintPage: 16, blueprintX: 40, blueprintY: 30 },
    { code: "P2955-L1", type: "SETTLEMENT_POINT", blueprintPage: 16, blueprintX: 45, blueprintY: 30 },
    { code: "P2955", type: "SETTLEMENT_POINT", blueprintPage: 16, blueprintX: 50, blueprintY: 30 },
    { code: "P2955-R1", type: "SETTLEMENT_POINT", blueprintPage: 16, blueprintX: 55, blueprintY: 30 },
    { code: "P2955-R2", type: "SETTLEMENT_POINT", blueprintPage: 16, blueprintX: 60, blueprintY: 30 },
    { code: "P2955-R3", type: "SETTLEMENT_POINT", blueprintPage: 16, blueprintX: 65, blueprintY: 30 },
    { code: "P2955-R4", type: "SETTLEMENT_POINT", blueprintPage: 16, blueprintX: 70, blueprintY: 30 },
  ],

  // === Bridge 5+000 — Page 17 ===
  "Bridge 5+000": [
    { code: "P2699", type: "INCLINOMETER", blueprintPage: 17, blueprintX: 45, blueprintY: 35 },
    { code: "P2697", type: "EXTENSOMETER", blueprintPage: 17, blueprintX: 50, blueprintY: 42 },
    { code: "P2730-L3", type: "SETTLEMENT_POINT", blueprintPage: 17, blueprintX: 33, blueprintY: 28 },
    { code: "P2730-L2", type: "SETTLEMENT_POINT", blueprintPage: 17, blueprintX: 38, blueprintY: 28 },
    { code: "P2730-L1", type: "SETTLEMENT_POINT", blueprintPage: 17, blueprintX: 43, blueprintY: 28 },
    { code: "P2730", type: "SETTLEMENT_POINT", blueprintPage: 17, blueprintX: 48, blueprintY: 28 },
    { code: "P2730-R1", type: "SETTLEMENT_POINT", blueprintPage: 17, blueprintX: 53, blueprintY: 28 },
    { code: "P2730-R2", type: "SETTLEMENT_POINT", blueprintPage: 17, blueprintX: 58, blueprintY: 28 },
    { code: "P2730-R3", type: "SETTLEMENT_POINT", blueprintPage: 17, blueprintX: 63, blueprintY: 28 },
    { code: "P2730-R4", type: "SETTLEMENT_POINT", blueprintPage: 17, blueprintX: 68, blueprintY: 28 },
  ],

  // === Above Tunnel 5+400 — Page 18 ===
  "Above Tunnel 5+400": [
    { code: "P2482", type: "INCLINOMETER", blueprintPage: 18, blueprintX: 18, blueprintY: 44 },
    { code: "P2480", type: "EXTENSOMETER", blueprintPage: 18, blueprintX: 67, blueprintY: 57 },
    { code: "P2477", type: "PIEZOMETER", blueprintPage: 18, blueprintX: 69, blueprintY: 57 },
    { code: "P2456-L3", type: "SETTLEMENT_POINT", blueprintPage: 18, blueprintX: 40, blueprintY: 30 },
    { code: "P2456-L2", type: "SETTLEMENT_POINT", blueprintPage: 18, blueprintX: 45, blueprintY: 30 },
    { code: "P2456-L1", type: "SETTLEMENT_POINT", blueprintPage: 18, blueprintX: 50, blueprintY: 30 },
    { code: "P2456", type: "SETTLEMENT_POINT", blueprintPage: 18, blueprintX: 55, blueprintY: 30 },
    { code: "P2456-R1", type: "SETTLEMENT_POINT", blueprintPage: 18, blueprintX: 60, blueprintY: 30 },
    { code: "P2456-R2", type: "SETTLEMENT_POINT", blueprintPage: 18, blueprintX: 65, blueprintY: 30 },
    { code: "P2456-R3", type: "SETTLEMENT_POINT", blueprintPage: 18, blueprintX: 70, blueprintY: 30 },
    { code: "P2456-R4", type: "SETTLEMENT_POINT", blueprintPage: 18, blueprintX: 75, blueprintY: 30 },
  ],

  // === Shaft IS03 (5+800) ===
  "Shaft IS03": [],

  // === Bridge 5+920 — Page 20 ===
  "Bridge 5+920": [
    { code: "P1999", type: "INCLINOMETER", blueprintPage: 20, blueprintX: 45, blueprintY: 35 },
    { code: "P1997", type: "EXTENSOMETER", blueprintPage: 20, blueprintX: 50, blueprintY: 42 },
    { code: "P2038-L3", type: "SETTLEMENT_POINT", blueprintPage: 20, blueprintX: 33, blueprintY: 28 },
    { code: "P2038-L2", type: "SETTLEMENT_POINT", blueprintPage: 20, blueprintX: 38, blueprintY: 28 },
    { code: "P2038-L1", type: "SETTLEMENT_POINT", blueprintPage: 20, blueprintX: 43, blueprintY: 28 },
    { code: "P2038", type: "SETTLEMENT_POINT", blueprintPage: 20, blueprintX: 48, blueprintY: 28 },
    { code: "P2038-R1", type: "SETTLEMENT_POINT", blueprintPage: 20, blueprintX: 53, blueprintY: 28 },
    { code: "P2038-R2", type: "SETTLEMENT_POINT", blueprintPage: 20, blueprintX: 58, blueprintY: 28 },
    { code: "P2038-R3", type: "SETTLEMENT_POINT", blueprintPage: 20, blueprintX: 63, blueprintY: 28 },
    { code: "P2038-R4", type: "SETTLEMENT_POINT", blueprintPage: 20, blueprintX: 68, blueprintY: 28 },
  ],

  // === Bridge 6+300 — Page 21 ===
  "Bridge 6+300": [
    { code: "P1725", type: "INCLINOMETER", blueprintPage: 21, blueprintX: 45, blueprintY: 35 },
    { code: "P1727", type: "EXTENSOMETER", blueprintPage: 21, blueprintX: 50, blueprintY: 42 },
    { code: "P1766-L3", type: "SETTLEMENT_POINT", blueprintPage: 21, blueprintX: 33, blueprintY: 28 },
    { code: "P1766-L2", type: "SETTLEMENT_POINT", blueprintPage: 21, blueprintX: 38, blueprintY: 28 },
    { code: "P1766-L1", type: "SETTLEMENT_POINT", blueprintPage: 21, blueprintX: 43, blueprintY: 28 },
    { code: "P1766", type: "SETTLEMENT_POINT", blueprintPage: 21, blueprintX: 48, blueprintY: 28 },
    { code: "P1766-R1", type: "SETTLEMENT_POINT", blueprintPage: 21, blueprintX: 53, blueprintY: 28 },
    { code: "P1766-R2", type: "SETTLEMENT_POINT", blueprintPage: 21, blueprintX: 58, blueprintY: 28 },
    { code: "P1766-R3", type: "SETTLEMENT_POINT", blueprintPage: 21, blueprintX: 63, blueprintY: 28 },
    { code: "P1766-R4", type: "SETTLEMENT_POINT", blueprintPage: 21, blueprintX: 68, blueprintY: 28 },
  ],

  // === Bridge 6+700 — Page 22 ===
  "Bridge 6+700": [
    { code: "P1444", type: "INCLINOMETER", blueprintPage: 22, blueprintX: 40, blueprintY: 32 },
    { code: "P1439", type: "INCLINOMETER", blueprintPage: 22, blueprintX: 55, blueprintY: 38 },
    { code: "P1442", type: "EXTENSOMETER", blueprintPage: 22, blueprintX: 48, blueprintY: 42 },
    { code: "P1483-L3", type: "SETTLEMENT_POINT", blueprintPage: 22, blueprintX: 30, blueprintY: 28 },
    { code: "P1483-L2", type: "SETTLEMENT_POINT", blueprintPage: 22, blueprintX: 35, blueprintY: 28 },
    { code: "P1483-L1", type: "SETTLEMENT_POINT", blueprintPage: 22, blueprintX: 40, blueprintY: 28 },
    { code: "P1483", type: "SETTLEMENT_POINT", blueprintPage: 22, blueprintX: 45, blueprintY: 28 },
    { code: "P1483-R1", type: "SETTLEMENT_POINT", blueprintPage: 22, blueprintX: 50, blueprintY: 28 },
    { code: "P1483-R2", type: "SETTLEMENT_POINT", blueprintPage: 22, blueprintX: 55, blueprintY: 28 },
    { code: "P1483-R3", type: "SETTLEMENT_POINT", blueprintPage: 22, blueprintX: 60, blueprintY: 28 },
    { code: "P1483-R4", type: "SETTLEMENT_POINT", blueprintPage: 22, blueprintX: 65, blueprintY: 28 },
  ],

  // === Above Tunnel 7+400 — Page 23 ===
  "Above Tunnel 7+400": [
    { code: "P1024", type: "INCLINOMETER", blueprintPage: 23, blueprintX: 18, blueprintY: 44 },
    { code: "P1022", type: "EXTENSOMETER", blueprintPage: 23, blueprintX: 67, blueprintY: 57 },
    { code: "P1019", type: "PIEZOMETER", blueprintPage: 23, blueprintX: 69, blueprintY: 57 },
    { code: "P997-L3", type: "SETTLEMENT_POINT", blueprintPage: 23, blueprintX: 40, blueprintY: 30 },
    { code: "P997-L2", type: "SETTLEMENT_POINT", blueprintPage: 23, blueprintX: 45, blueprintY: 30 },
    { code: "P997-L1", type: "SETTLEMENT_POINT", blueprintPage: 23, blueprintX: 50, blueprintY: 30 },
    { code: "P997", type: "SETTLEMENT_POINT", blueprintPage: 23, blueprintX: 55, blueprintY: 30 },
    { code: "P997-R1", type: "SETTLEMENT_POINT", blueprintPage: 23, blueprintX: 60, blueprintY: 30 },
    { code: "P997-R2", type: "SETTLEMENT_POINT", blueprintPage: 23, blueprintX: 65, blueprintY: 30 },
    { code: "P997-R3", type: "SETTLEMENT_POINT", blueprintPage: 23, blueprintX: 70, blueprintY: 30 },
    { code: "P997-R4", type: "SETTLEMENT_POINT", blueprintPage: 23, blueprintX: 75, blueprintY: 30 },
  ],

  // === Bridge 7+860 — Page 24 ===
  "Bridge 7+860": [
    { code: "P604-INC", type: "INCLINOMETER", blueprintPage: 24, blueprintX: 45, blueprintY: 35 },
    { code: "P604-EXT", type: "EXTENSOMETER", blueprintPage: 24, blueprintX: 50, blueprintY: 42 },
    { code: "P604-PIE", type: "PIEZOMETER", blueprintPage: 24, blueprintX: 52, blueprintY: 42 },
    { code: "P639-L3", type: "SETTLEMENT_POINT", blueprintPage: 24, blueprintX: 33, blueprintY: 28 },
    { code: "P639-L2", type: "SETTLEMENT_POINT", blueprintPage: 24, blueprintX: 38, blueprintY: 28 },
    { code: "P639-L1", type: "SETTLEMENT_POINT", blueprintPage: 24, blueprintX: 43, blueprintY: 28 },
    { code: "P639", type: "SETTLEMENT_POINT", blueprintPage: 24, blueprintX: 48, blueprintY: 28 },
    { code: "P639-R1", type: "SETTLEMENT_POINT", blueprintPage: 24, blueprintX: 53, blueprintY: 28 },
    { code: "P639-R2", type: "SETTLEMENT_POINT", blueprintPage: 24, blueprintX: 58, blueprintY: 28 },
    { code: "P639-R3", type: "SETTLEMENT_POINT", blueprintPage: 24, blueprintX: 63, blueprintY: 28 },
    { code: "P639-R4", type: "SETTLEMENT_POINT", blueprintPage: 24, blueprintX: 68, blueprintY: 28 },
  ],

  // === Above Tunnel 8+300 — Page 25 ===
  "Above Tunnel 8+300": [
    { code: "P390", type: "INCLINOMETER", blueprintPage: 25, blueprintX: 18, blueprintY: 44 },
    { code: "P388", type: "EXTENSOMETER", blueprintPage: 25, blueprintX: 67, blueprintY: 57 },
    { code: "P385", type: "PIEZOMETER", blueprintPage: 25, blueprintX: 69, blueprintY: 57 },
    { code: "P363-L3", type: "SETTLEMENT_POINT", blueprintPage: 25, blueprintX: 40, blueprintY: 30 },
    { code: "P363-L2", type: "SETTLEMENT_POINT", blueprintPage: 25, blueprintX: 45, blueprintY: 30 },
    { code: "P363-L1", type: "SETTLEMENT_POINT", blueprintPage: 25, blueprintX: 50, blueprintY: 30 },
    { code: "P363", type: "SETTLEMENT_POINT", blueprintPage: 25, blueprintX: 55, blueprintY: 30 },
    { code: "P363-R1", type: "SETTLEMENT_POINT", blueprintPage: 25, blueprintX: 60, blueprintY: 30 },
    { code: "P363-R2", type: "SETTLEMENT_POINT", blueprintPage: 25, blueprintX: 65, blueprintY: 30 },
    { code: "P363-R3", type: "SETTLEMENT_POINT", blueprintPage: 25, blueprintX: 70, blueprintY: 30 },
    { code: "P363-R4", type: "SETTLEMENT_POINT", blueprintPage: 25, blueprintX: 75, blueprintY: 30 },
  ],

  // === Shaft IS04-1 (8+770) ===
  "Shaft IS04-1": [],

  // === Shaft IS04 (8+820) — Page 26 — 5 Piezometers around the shaft ===
  "Shaft IS04": [
    { code: "PPFT-IS4-PI501-01", type: "PIEZOMETER", blueprintPage: 26, blueprintX: 32, blueprintY: 32 },
    { code: "PPFT-IS4-PI501-02", type: "PIEZOMETER", blueprintPage: 26, blueprintX: 38, blueprintY: 38 },
    { code: "PPFT-IS4-PI501-03", type: "PIEZOMETER", blueprintPage: 26, blueprintX: 44, blueprintY: 35 },
    { code: "PPFT-IS4-PI501-04", type: "PIEZOMETER", blueprintPage: 26, blueprintX: 50, blueprintY: 32 },
    { code: "PPFT-IS4-PI501-05", type: "PIEZOMETER", blueprintPage: 26, blueprintX: 56, blueprintY: 38 },
  ],
};

// ============================================================
// 3. THRESHOLD DATA (ค่าเดียวกันทั้งประเภท) — อ้างอิงจากรายงาน Contract Specs
// field names: alert/alarm/action (แทน alertLimit/alarmLimit/actionLimit ใน seed.ts เดิม)
// เพื่อให้ตรง INST_TH_HEADERS ปลายทาง — ค่าตัวเลขเหมือนต้นฉบับทุกประการ
// ============================================================
const THRESHOLDS = [
  { instrumentType: "INCLINOMETER", alert: 18, alarm: 20, action: 22, unit: "mm" },
  { instrumentType: "EXTENSOMETER", alert: 20, alarm: 25, action: 30, unit: "mm" },
  { instrumentType: "PIEZOMETER", alert: 50, alarm: 75, action: 100, unit: "kPa" },
  { instrumentType: "SETTLEMENT_POINT", alert: 15, alarm: 20, action: 25, unit: "mm" },
];

// ============================================================
// 4. MEASUREMENT SCHEDULE OFFSETS (TABLE 5.1 — จาก main() ใน seed.ts)
// ============================================================
const BRIDGE_ABOVE_OFFSETS = [-20, -10, -5, -2, -1, 0, 2, 5, 10, 20, 30, 40];
const SHAFT_INITIAL_OFFSETS = [0, 5, 10, 20, 40, 60];
const SHAFT_FINAL_OFFSETS = [-100, -95, -65, -35, -5, 0];
const LONG_TERM_DEFS = [
  { label: "1W", days: 7 },
  { label: "2W", days: 14 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
];

let _n = 0;
const rid = (p) => `${p}_${++_n}`; // id เสถียร (counter, ไม่ใช่ random) เพื่อ migrate ซ้ำได้ idempotent (upsertById_ ฝั่ง GAS)

// ============================================================
// BUILD SEED — สร้าง row-object arrays ตรงตาม INST_*_HEADERS (../gas-live/Code.js)
// ============================================================
export function buildSeed() {
  const locations = [], instruments = [], schedules = [];

  const thresholds = THRESHOLDS.map((t) => ({
    id: `th_${t.instrumentType}`,
    scope: "type",
    key: t.instrumentType,
    alert: t.alert,
    alarm: t.alarm,
    action: t.action,
    unit: t.unit,
    source: "seed",
    note: "",
  }));

  LOCATIONS.forEach((loc) => {
    const locId = `loc_${loc.name.replace(/[^a-zA-Z0-9]/g, "_")}`;
    locations.push({
      id: locId,
      name: loc.name,
      type: loc.type,
      chainage: loc.chainage,
      actualChainage: loc.actualChainage ?? "",
      note: "",
    });

    (INSTRUMENTS[loc.name] || []).forEach((ins) => {
      instruments.push({
        id: rid("ins"),
        locationId: locId,
        code: ins.code,
        type: ins.type,
        blueprintPage: ins.blueprintPage ?? "",
        blueprintX: ins.blueprintX ?? "",
        blueprintY: ins.blueprintY ?? "",
        installStatus: ins.status || "PENDING",
        installedAt: "",
        installPhotoUrl: "",
        note: "",
      });
    });

    // schedule-gen: port จาก main() ใน seed.ts — DISTANCE ต่อ offset (+DEEP ถ้า bridge/above) + LONG_TERM ต่อ trigger
    const base = loc.actualChainage ?? loc.chainage;
    const isShaft = loc.type === "SHAFT";
    // SHAFT ใช้ union ของ Initial+Final offsets (ไม่ซ้ำ); ที่เหลือ (BRIDGE/ABOVE_TUNNEL/SETTLEMENT_ONLY) ใช้ BRIDGE_ABOVE_OFFSETS — ตรงกับ switch-case ใน main()
    const distOffsets = isShaft
      ? Array.from(new Set([...SHAFT_INITIAL_OFFSETS, ...SHAFT_FINAL_OFFSETS]))
      : BRIDGE_ABOVE_OFFSETS;
    const hasDeep = loc.type === "BRIDGE" || loc.type === "ABOVE_TUNNEL";

    distOffsets.forEach((off) => {
      ["SURFACE", ...(hasDeep ? ["DEEP"] : [])].forEach((grp) => {
        schedules.push({
          id: rid("sc"),
          locationId: locId,
          scheduleType: "DISTANCE",
          instrumentGroup: grp,
          distanceOffset: off,
          tbmChainage: base - off,
          longTermLabel: "",
          longTermDays: "",
          triggerOffset: "",
          targetDate: "",
          isMeasured: false,
          measuredAt: "",
          measuredBy: "",
          photoUrl: "",
          notes: "",
        });
      });
    });

    const triggers = isShaft
      ? [{ title: "Init", offset: 60 }, { title: "Final", offset: 0 }]
      : [{ title: "LT", offset: 40 }];
    triggers.forEach((trig) => {
      LONG_TERM_DEFS.forEach((lt) => {
        schedules.push({
          id: rid("sc"),
          locationId: locId,
          scheduleType: "LONG_TERM",
          instrumentGroup: "ALL",
          distanceOffset: "",
          tbmChainage: "",
          longTermLabel: `${trig.title} ${lt.label}`,
          longTermDays: lt.days,
          triggerOffset: trig.offset,
          targetDate: "",
          isMeasured: false,
          measuredAt: "",
          measuredBy: "",
          photoUrl: "",
          notes: "",
        });
      });
    });
  });

  return { locations, instruments, thresholds, schedules };
}
