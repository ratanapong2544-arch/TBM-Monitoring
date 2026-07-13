// Task R2a — tests for the chartUtils helpers added for the report viewer foundation.
// Existing exports (formatShortDate, stationLabelKm, thresholdColors, etc.) are untouched and
// already exercised indirectly by the v1 report components, so they're not re-tested here.
// Task R2b appends tests for the INC/EXT dual-axis + station-overlay helpers below.
import {
  parseDateToMs, weeklyTickTimestamps, formatDateTick, formatStation, stationLabelKm, getDateColor,
  pickHighlightedDepths, ROUND5_DEPTH_HIGHLIGHTS, findPeakAcrossReadings,
  TIME_HISTORY_Y_DOMAIN, TIME_HISTORY_Y_TICKS, STATION_Y_DOMAIN, STATION_Y_TICKS,
} from "./chartUtils";

describe("parseDateToMs", () => {
  test("ISO date", () => {
    expect(parseDateToMs("2026-01-15")).toBe(new Date("2026-01-15").getTime());
  });
  test("ISO datetime", () => {
    expect(parseDateToMs("2026-01-15T09:00:00")).toBe(new Date("2026-01-15T09:00:00").getTime());
  });
  test("DD/MM/YYYY (source PDF convention still supported)", () => {
    expect(parseDateToMs("15/01/2026")).toBe(new Date(2026, 0, 15, 0, 0).getTime());
  });
  test("DD/MM/YYYY HH:MM", () => {
    expect(parseDateToMs("15/01/2026 09:30")).toBe(new Date(2026, 0, 15, 9, 30).getTime());
  });
  test("invalid/empty → NaN", () => {
    expect(Number.isNaN(parseDateToMs(""))).toBe(true);
    expect(Number.isNaN(parseDateToMs(null))).toBe(true);
    expect(Number.isNaN(parseDateToMs("not a date"))).toBe(true);
  });
});

describe("weeklyTickTimestamps", () => {
  test("exact multiple of stepDays includes start/end without duplication", () => {
    const ticks = weeklyTickTimestamps("2026-01-01", "2026-01-15", 7);
    expect(ticks).toEqual([
      new Date("2026-01-01").getTime(),
      new Date("2026-01-08").getTime(),
      new Date("2026-01-15").getTime(),
    ]);
  });
  test("non-multiple span still forces the end tick in (inclusive)", () => {
    const ticks = weeklyTickTimestamps("2026-01-01", "2026-01-10", 7);
    expect(ticks[ticks.length - 1]).toBe(new Date("2026-01-10").getTime());
    expect(ticks).toEqual([
      new Date("2026-01-01").getTime(),
      new Date("2026-01-08").getTime(),
      new Date("2026-01-10").getTime(),
    ]);
  });
  test("custom stepDays (R2b uses 10 for INC time history)", () => {
    const ticks = weeklyTickTimestamps("2026-01-01", "2026-01-21", 10);
    expect(ticks).toEqual([
      new Date("2026-01-01").getTime(),
      new Date("2026-01-11").getTime(),
      new Date("2026-01-21").getTime(),
    ]);
  });
  test("invalid dates → []", () => {
    expect(weeklyTickTimestamps("not a date", "2026-01-10")).toEqual([]);
    expect(weeklyTickTimestamps("2026-01-01", "")).toEqual([]);
  });
});

describe("formatDateTick", () => {
  test('formats as "DD/MM/YY"', () => {
    expect(formatDateTick(new Date(2026, 0, 5).getTime())).toBe("05/01/26");
    expect(formatDateTick(new Date(2026, 11, 31).getTime())).toBe("31/12/26");
  });
});

describe("formatStation", () => {
  test("is the stationLabelKm implementation (backward-compat alias)", () => {
    expect(formatStation).toBe(stationLabelKm);
  });
  test("formats a chainage like stationLabelKm", () => {
    expect(formatStation(8389.356)).toBe(stationLabelKm(8389.356));
    expect(formatStation(8389.356)).toBe("8+389.356");
  });
  test("null/undefined → em dash", () => {
    expect(formatStation(null)).toBe("—");
    expect(formatStation(undefined)).toBe("—");
  });
});

describe("getDateColor", () => {
  test("single/unknown date falls back to the first (navy) stop", () => {
    expect(getDateColor("2026-01-01", ["2026-01-01"])).toBe(getDateColor("x", []));
  });
  test("first and last dates land on the navy/red end stops", () => {
    const dates = ["2026-01-01", "2026-01-02", "2026-01-03"];
    expect(getDateColor(dates[0], dates)).toBe("#003b84"); // navy — chartColors.planned
    expect(getDateColor(dates[2], dates)).toBe("#b91c1c"); // red — chartColors.actualAlert
  });
  test("17 overlaid dates (depth/settlement profile scale) stay visually distinguishable", () => {
    const dates = Array.from({ length: 17 }, (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`);
    const colors = dates.map((d) => getDateColor(d, dates));
    expect(new Set(colors).size).toBe(17);
  });
  test("unknown date (not in allDates) does not throw and returns a hex color", () => {
    expect(getDateColor("2099-01-01", ["2026-01-01", "2026-01-02"])).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("fixed dual-axis domains (R2b — shared by INC/EXT Time History charts)", () => {
  test("TIME_HISTORY_Y ± 30 mm, step 5", () => {
    expect(TIME_HISTORY_Y_DOMAIN).toEqual([-30, 30]);
    expect(TIME_HISTORY_Y_TICKS).toEqual([-30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30]);
  });
  test("STATION_Y 8100..8400, step 20 (this project's chainage range)", () => {
    expect(STATION_Y_DOMAIN).toEqual([8100, 8400]);
    expect(STATION_Y_TICKS).toHaveLength(16);
    expect(STATION_Y_TICKS[0]).toBe(8100);
    expect(STATION_Y_TICKS[STATION_Y_TICKS.length - 1]).toBe(8400);
  });
});

describe("pickHighlightedDepths (source round-5 convention)", () => {
  test("round-5 targets are the source's hand-authored marks [5,10,15,20,25,30,35]", () => {
    expect(ROUND5_DEPTH_HIGHLIGHTS).toEqual([5, 10, 15, 20, 25, 30, 35]);
  });
  test("real 0..35 / step-0.5 data → exact round-5 marks (not even-sampled)", () => {
    const depths = Array.from({ length: 71 }, (_, i) => i * 0.5); // 0, 0.5, ..., 35
    expect(pickHighlightedDepths(depths)).toEqual([5, 10, 15, 20, 25, 30, 35]);
  });
  test("integer 0..35 data → same round-5 marks (exact matches)", () => {
    const depths = Array.from({ length: 36 }, (_, i) => i);
    expect(pickHighlightedDepths(depths)).toEqual([5, 10, 15, 20, 25, 30, 35]);
  });
  test("does NOT even-sample by index — never yields the old [0,7,14,21,28,35] set", () => {
    const picked = pickHighlightedDepths(Array.from({ length: 36 }, (_, i) => i));
    expect(picked[0]).toBe(5); // starts at 5, not 0
    expect(picked).not.toContain(0);
    expect(picked).not.toContain(7);
    expect(picked).not.toContain(14);
  });
  test("missing exact marks → nearest available measured depth, deduped", () => {
    // coarse data: several round-5 targets collapse onto the same nearest measured point
    expect(pickHighlightedDepths([0, 5, 10, 35])).toEqual([5, 10, 35]);
  });
  test("dedupes and sorts unsorted/duplicate input before matching", () => {
    expect(pickHighlightedDepths([10, 5, 5, 10])).toEqual([5, 10]);
  });
  test("fallback: shallow borehole with no round-5 mark in range → even index-sample of real depths", () => {
    const depths = [0, 0.5, 1, 1.5, 2, 2.5, 3]; // max 3 m — every round-5 target (≥5) is out of range
    const picked = pickHighlightedDepths(depths);
    expect(picked[0]).toBe(0); // even-sample keeps shallowest
    expect(picked[picked.length - 1]).toBe(3); // ...and deepest
    picked.forEach((d) => expect(depths).toContain(d)); // only real measured depths, never interpolated
  });
  test("empty input → []", () => {
    expect(pickHighlightedDepths([])).toEqual([]);
  });
});

describe("findPeakAcrossReadings", () => {
  const parsedRows = [
    { date: "2026-01-01", points: [{ depth: 0, a: 1 }, { depth: 5, a: -2 }] },
    { date: "2026-02-01", points: [{ depth: 0, a: 0.5 }, { depth: 5, a: -6 }] }, // largest |value|
    { date: "2026-03-01", points: [{ depth: 0, a: 3 }, { depth: 5, a: -1 }] },
  ];
  test("finds the largest-magnitude value across ALL readings, not just the last one", () => {
    const peak = findPeakAcrossReadings(parsedRows, (p) => p.a, (p) => p.depth);
    expect(peak).toEqual({ value: -6, date: "2026-02-01", meta: 5 });
  });
  test("ties keep the first occurrence (stable)", () => {
    const rows = [
      { date: "d1", points: [{ depth: 1, a: 5 }] },
      { date: "d2", points: [{ depth: 2, a: -5 }] },
    ];
    expect(findPeakAcrossReadings(rows, (p) => p.a, (p) => p.depth)).toEqual({ value: 5, date: "d1", meta: 1 });
  });
  test("ignores null/non-finite values", () => {
    const rows = [{ date: "d1", points: [{ depth: 1, a: null }, { depth: 2, a: NaN }, { depth: 3, a: 2 }] }];
    expect(findPeakAcrossReadings(rows, (p) => p.a, (p) => p.depth)).toEqual({ value: 2, date: "d1", meta: 3 });
  });
  test("no finite values anywhere → null", () => {
    expect(findPeakAcrossReadings([{ date: "d1", points: [] }], (p) => p.a, (p) => p.depth)).toBeNull();
    expect(findPeakAcrossReadings([], (p) => p.a, (p) => p.depth)).toBeNull();
  });
});
