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
