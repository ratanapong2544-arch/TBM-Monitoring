import { composeExcavationWorkLog } from "./worklogCompose";

const projectInfo = { tbmNo: "TBM1", location: "อุโมงค์จากบ่อ IS4 ถึง บ่อ IS2" };

const baseArgs = {
  filteredSegments: [
    { ringNo: "P508", keyPos: "16", status: "Completed", installType: "Permanent",
      installShift: "Day", shift: "Day", excavShift: "Day",
      startCH: "8+830.488", finishCH: "8+829.088", soilType: "Sand / Gravel", length: "1.40" },
  ],
  filteredGrouts: [
    { ringNo: "P507", total: "3.10", ratio: "100.00", shift: "Day" },
  ],
  filteredShiftReports: [
    { events: { Excavation: [{ start: "06:00", end: "07:00", label: "P508" }],
                "ติดตั้ง Walkway": [{ start: "08:00", end: "10:00", label: "ถึง P440" }] } },
  ],
  summary: { permCount: 1, totalLength: "1.40", uniqueGroutedRings: 1, allRemarks: [] },
  accumulation: { permRings: 508, tempRings: 15, totalAccumDist: "709.700" },
  projectInfo,
  reportShift: "All",
};

test("composes section 1 with finishCH + excavate distance (deterministic)", () => {
  const txt = composeExcavationWorkLog(baseArgs);
  expect(txt.startsWith("1. TBM1")).toBe(true);
  expect(txt).toContain("ขุดเจาะถึง CH 8+829.088 = 1.400 m");
  expect(txt).toContain("-ขุดเจาะ P508 แล้วเสร็จ");
});

test("composes section 2 segment + accumulation", () => {
  const txt = composeExcavationWorkLog(baseArgs);
  expect(txt).toContain("ประกอบ P508 (K16) = 1 Ring/Shift");
  expect(txt).toContain("Permanent 508 Ring, Tempo 15 Ring");
  expect(txt).toContain("ระยะติดตั้งสะสม 709.700 m");
});

test("composes section 3 grout + section 4 soil", () => {
  const txt = composeExcavationWorkLog(baseArgs);
  expect(txt).toContain("Ring P507 = 1 Ring/Shift");
  expect(txt).toContain("P507 = 3.100 m3 (100.00%)");
  expect(txt).toContain("Sand / Gravel");
});

test("section 8 = deterministic deduped delays (no AI)", () => {
  const txt = composeExcavationWorkLog(baseArgs);
  expect(txt).toContain("8. Delay Activities");
  expect(txt).toContain("ถึง P440");
});

test("empty data → placeholders and -ไม่มี", () => {
  const txt = composeExcavationWorkLog({
    filteredSegments: [], filteredGrouts: [], filteredShiftReports: [],
    summary: { permCount: 0, totalLength: "0.00", uniqueGroutedRings: 0, allRemarks: [] },
    accumulation: { permRings: 0, tempRings: 0, totalAccumDist: "0.000" },
    projectInfo, reportShift: "All",
  });
  expect(txt).toContain("ขุดเจาะถึง CH - = 0.000 m");
  expect(txt).toContain("-ขุดเจาะ - แล้วเสร็จ");
  expect(txt).toMatch(/8\. Delay Activities\n-ไม่มี/);
});

// TBM2 ตามชีต 2026-09-25: P3 = ริงเหล็ก 0.90 ม. · CH ไม่ใช่ CH สำรวจ (P1/P2 ว่าง, P3 prefill จาก 0+000.00
// แล้วลด 1.40 ทุกริง, P9 พิมพ์ผิด) — TBM2 จริงเริ่ม 8+830.488 และ CH เพิ่มขึ้น (ผู้ใช้ยืนยัน)
// บรรทัดของ TBM1 จึงได้ "ถึง CH -0+023.80 = 8854.288 m" · 17/09 ได้ 17686.658 m
const TBM2_RINGS = Array.from({ length: 19 }, (_, i) => ({
  ringNo: `P${i + 1}`, keyPos: "7", length: i === 2 ? "0.9" : "1.4",
  status: "Completed", installType: "Permanent", shift: "Day", finishCH: "",
}));
TBM2_RINGS[8].finishCH = "-8+856.17";   // P9 ตามชีต
TBM2_RINGS[18].finishCH = "-0+023.80";  // P19

const tbm2 = (filteredSegments, allSegments = TBM2_RINGS) => composeExcavationWorkLog({
  filteredSegments, allSegments, machine: "TBM2", projectInfo: { tbmNo: "TBM2", location: "L" },
});

test("TBM2: section 1 = distance from ring lengths, not TBM1's chainage", () => {
  const txt = tbm2([TBM2_RINGS[18]]);                                      // 21/09 ขุด P19
  expect(txt).toContain("-เริ่มต้น รัชดา ขุดเจาะถึง Ring P19 = 26.100 m");  // 18 × 1.40 + 0.90
  expect(txt).not.toContain("8+830.488");
});

test("TBM2: a past day counts up to its own last ring, whatever its CH says", () => {
  const txt = tbm2([TBM2_RINGS[7], TBM2_RINGS[8]]);                        // 17/09 ขุด P8, P9
  expect(txt).toContain("ขุดเจาะถึง Ring P9 = 12.100 m");                  // 8 × 1.40 + 0.90
});

test("TBM2: counts Permanent rings — one still In Progress yes, a Temporary one no", () => {
  const t8 = { ringNo: "T8", length: "1.4", status: "Completed", installType: "Temporary", shift: "Day" };
  const p20 = { ringNo: "P20", length: "1.4", status: "In Progress", installType: "Permanent", shift: "Day" };
  expect(tbm2([p20], [t8, ...TBM2_RINGS, p20])).toContain("ขุดเจาะถึง Ring P20 = 27.500 m");
});

test("TBM2: nothing excavated → Ring - = 0.000 m", () => {
  expect(tbm2([])).toContain("-เริ่มต้น รัชดา ขุดเจาะถึง Ring - = 0.000 m");
});

import { mapManpowerToLabor } from "./worklogCompose";

test("maps manpower keys to labor keys (max per key across reports)", () => {
  const reports = [
    { manpower: { Engineer: "2", Operator: "3", Surveyor: "1", Foreman: "1", CraneOp: "2" } },
    { manpower: { Engineer: "4", Worker: "10", Machanic: "1", Electrician: "2" } },
  ];
  const labor = mapManpowerToLabor(reports);
  expect(labor.lb_engineer).toBe("4");
  expect(labor.lb_operator).toBe("3");
  expect(labor.lb_surveyor).toBe("1");
  expect(labor.lb_worker).toBe("10");
  expect(labor.lb_mechanic).toBe("1");
  expect(labor.lb_electrician).toBe("2");
  expect(labor.lb_foreman).toBe("1");
  expect(labor.lb_crane_op).toBeUndefined();
});

test("mapManpowerToLabor handles JSON-string manpower + empty", () => {
  expect(mapManpowerToLabor([{ manpower: '{"Engineer":"5"}' }]).lb_engineer).toBe("5");
  expect(mapManpowerToLabor([])).toEqual({});
  expect(mapManpowerToLabor([{ manpower: { Engineer: "0" } }]).lb_engineer).toBeUndefined();
});
