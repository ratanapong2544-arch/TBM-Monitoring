import {
  tallyTbmChainage,
  tallyUpcomingNodes,
  tallyActionRequired,
  tallyMeasurementProgress,
  tallyInstallation,
  computeComplianceTallies,
} from "./instrumentDashboard";

describe("tallyTbmChainage (metric 1 — port page.tsx:158-159)", () => {
  test("formats STA via stationLabel + ring number when provided", () => {
    const t = tallyTbmChainage(8375, 42);
    expect(t.value).toBe("STA 8+375");
    expect(t.sub).toBe("Current Ring: #42");
  });

  test("ringNo absent (undefined) → em-dash, no hallucinated ring number", () => {
    const t = tallyTbmChainage(8375, undefined);
    expect(t.sub).toBe("Current Ring: #—");
  });

  test("ringNo null → em-dash too", () => {
    const t = tallyTbmChainage(8375, null);
    expect(t.sub).toBe("Current Ring: #—");
  });

  test("tbmChainage null → stationLabel's own null fallback ('-'), not a crash", () => {
    const t = tallyTbmChainage(null, null);
    expect(t.value).toBe("STA -");
  });
});

describe("tallyUpcomingNodes (metric 2 — [-50,0) boundary, port page.tsx:104,117-119)", () => {
  test("dist exactly -50 → included (lower bound inclusive)", () => {
    // operationalChainage - tbmChainage = -50
    expect(tallyUpcomingNodes([{ chainage: 8250 }], 8300)).toBe(1);
  });

  test("dist exactly 0 → excluded (upper bound exclusive)", () => {
    expect(tallyUpcomingNodes([{ chainage: 8300 }], 8300)).toBe(0);
  });

  test("dist just inside at -0.001 → included", () => {
    expect(tallyUpcomingNodes([{ chainage: 8299.999 }], 8300)).toBe(1);
  });

  test("dist just outside at -50.001 → excluded", () => {
    expect(tallyUpcomingNodes([{ chainage: 8249.999 }], 8300)).toBe(0);
  });

  test("dist positive (location still ahead, TBM not near) → excluded", () => {
    expect(tallyUpcomingNodes([{ chainage: 8400 }], 8300)).toBe(0);
  });

  test("uses actualChainage over chainage when present (getOperationalChainage)", () => {
    // design chainage 8400 (would be dist=+100, excluded) but actual install position is 8260 (dist=-40, included)
    expect(tallyUpcomingNodes([{ chainage: 8400, actualChainage: 8260 }], 8300)).toBe(1);
  });

  test("counts multiple qualifying locations, ignores non-qualifying ones", () => {
    const locations = [
      { chainage: 8260 }, // dist -40 → in
      { chainage: 8400 }, // dist +100 → out
      { chainage: 8280 }, // dist -20 → in
      { chainage: 8300 }, // dist 0 → out (boundary)
    ];
    expect(tallyUpcomingNodes(locations, 8300)).toBe(2);
  });

  test("empty locations → 0", () => {
    expect(tallyUpcomingNodes([], 8300)).toBe(0);
  });

  test("tbmChainage null (machineProgress not loaded) → 0, no false positive", () => {
    expect(tallyUpcomingNodes([{ chainage: 8260 }], null)).toBe(0);
  });
});

describe("tallyActionRequired (metric 3 — DISTANCE-only + TBM-passed-not-measured, port page.tsx:111-116)", () => {
  test("TBM passed trigger (tbmChainage <= s.tbmChainage) and not measured → counted, pulse-worthy", () => {
    const schedules = [{ scheduleType: "DISTANCE", tbmChainage: 8320, isMeasured: false }];
    expect(tallyActionRequired(schedules, 8300)).toBe(1);
  });

  test("boundary: tbmChainage === s.tbmChainage → counted (<=, not <)", () => {
    const schedules = [{ scheduleType: "DISTANCE", tbmChainage: 8300, isMeasured: false }];
    expect(tallyActionRequired(schedules, 8300)).toBe(1);
  });

  test("TBM not yet at trigger → not counted", () => {
    const schedules = [{ scheduleType: "DISTANCE", tbmChainage: 8280, isMeasured: false }];
    expect(tallyActionRequired(schedules, 8300)).toBe(0);
  });

  test("already measured (even though TBM passed) → not counted", () => {
    const schedules = [{ scheduleType: "DISTANCE", tbmChainage: 8320, isMeasured: true }];
    expect(tallyActionRequired(schedules, 8300)).toBe(0);
  });

  test("LONG_TERM schedules are excluded even if they'd otherwise qualify", () => {
    const schedules = [{ scheduleType: "LONG_TERM", tbmChainage: 8320, isMeasured: false }];
    expect(tallyActionRequired(schedules, 8300)).toBe(0);
  });

  test("schedule with no tbmChainage (null trigger) → never counted", () => {
    const schedules = [{ scheduleType: "DISTANCE", tbmChainage: null, isMeasured: false }];
    expect(tallyActionRequired(schedules, 8300)).toBe(0);
  });

  test("dashboard tbmChainage null (not loaded) → 0, no false positive", () => {
    const schedules = [{ scheduleType: "DISTANCE", tbmChainage: 8320, isMeasured: false }];
    expect(tallyActionRequired(schedules, null)).toBe(0);
  });

  test("empty schedules → 0", () => {
    expect(tallyActionRequired([], 8300)).toBe(0);
  });
});

describe("tallyMeasurementProgress (metric 4 — DISTANCE-only, ⚠ N/A counts as measured)", () => {
  test("plain measured/unmeasured mix", () => {
    const schedules = [
      { scheduleType: "DISTANCE", isMeasured: true },
      { scheduleType: "DISTANCE", isMeasured: false },
      { scheduleType: "DISTANCE", isMeasured: false },
    ];
    expect(tallyMeasurementProgress(schedules)).toEqual({ measured: 1, total: 3, percent: 33 });
  });

  test("N/A-marked schedule (isMeasured=true, notes='N/A') counts as measured — the locked decision", () => {
    const schedules = [
      { scheduleType: "DISTANCE", isMeasured: true, notes: "N/A" },
      { scheduleType: "DISTANCE", isMeasured: false, notes: null },
    ];
    const result = tallyMeasurementProgress(schedules);
    expect(result.measured).toBe(1); // the N/A row IS counted
    expect(result.total).toBe(2);
    expect(result.percent).toBe(50);
  });

  test("LONG_TERM schedules are excluded from both total and measured", () => {
    const schedules = [
      { scheduleType: "DISTANCE", isMeasured: true },
      { scheduleType: "LONG_TERM", isMeasured: false },
      { scheduleType: "LONG_TERM", isMeasured: true },
    ];
    expect(tallyMeasurementProgress(schedules)).toEqual({ measured: 1, total: 1, percent: 100 });
  });

  test("empty/undefined schedules → 0/0, percent 0 (no divide-by-zero NaN)", () => {
    expect(tallyMeasurementProgress([])).toEqual({ measured: 0, total: 0, percent: 0 });
    expect(tallyMeasurementProgress(undefined)).toEqual({ measured: 0, total: 0, percent: 0 });
  });
});

describe("tallyInstallation (metric 5 — ALL instruments, not schedule-gated, port page.tsx:108-109)", () => {
  test("counts INSTALLED vs total across all instruments regardless of location", () => {
    const instruments = [
      { installStatus: "INSTALLED" },
      { installStatus: "INSTALLED" },
      { installStatus: "PLANNED" },
      { installStatus: "REMOVED" },
    ];
    expect(tallyInstallation(instruments)).toEqual({ installed: 2, total: 4, percent: 50 });
  });

  test("empty/undefined instruments → 0/0, percent 0", () => {
    expect(tallyInstallation([])).toEqual({ installed: 0, total: 0, percent: 0 });
    expect(tallyInstallation(undefined)).toEqual({ installed: 0, total: 0, percent: 0 });
  });
});

describe("computeComplianceTallies (aggregate used by ComplianceCards.jsx)", () => {
  test("wires all 5 metrics from one raw-data object", () => {
    const raw = {
      locations: [{ chainage: 8260 }],
      instruments: [{ installStatus: "INSTALLED" }, { installStatus: "PLANNED" }],
      schedules: [
        { scheduleType: "DISTANCE", tbmChainage: 8320, isMeasured: false },
        { scheduleType: "DISTANCE", tbmChainage: 8280, isMeasured: true },
      ],
      tbmChainage: 8300,
      ringNo: 5,
    };
    const result = computeComplianceTallies(raw);
    expect(result.tbmChainage).toEqual({ value: "STA 8+300", sub: "Current Ring: #5" });
    expect(result.upcomingNodes).toBe(1);
    expect(result.actionRequired).toBe(1);
    expect(result.measurementProgress).toEqual({ measured: 1, total: 2, percent: 50 });
    expect(result.installation).toEqual({ installed: 1, total: 2, percent: 50 });
  });

  test("completely empty input → no crash, all-zero shape", () => {
    const result = computeComplianceTallies({});
    expect(result.upcomingNodes).toBe(0);
    expect(result.actionRequired).toBe(0);
    expect(result.measurementProgress).toEqual({ measured: 0, total: 0, percent: 0 });
    expect(result.installation).toEqual({ installed: 0, total: 0, percent: 0 });
  });

  test("no-arg call does not crash", () => {
    expect(() => computeComplianceTallies()).not.toThrow();
  });
});
