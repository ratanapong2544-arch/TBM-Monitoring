// Task R2a — tests for the chartUtils helpers added for the report viewer foundation.
// Existing exports (formatShortDate, stationLabelKm, thresholdColors, etc.) are untouched and
// already exercised indirectly by the v1 report components, so they're not re-tested here.
import {
  parseDateToMs, weeklyTickTimestamps, formatDateTick, formatStation, stationLabelKm, getDateColor,
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
