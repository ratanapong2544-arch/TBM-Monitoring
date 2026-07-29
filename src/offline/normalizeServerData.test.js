import { normalizeServerData } from "./normalizeServerData";

test("normalizes the complete getData response with App parity", () => {
  const data = normalizeServerData({
    segments: [{ ringNo: "P41", excavStartTime: "2026-07-29T01:30:00.000Z", excavEndTime: "", installStartTime: null, installEndTime: "2026-07-29T02:45:00.000Z", startTime: "2026-07-29T03:00:00.000Z", endTime: "2026-07-29T04:00:00.000Z" }],
    grouts: [{ ringNo: "P41", positions: '{"A":true}', primaryPositions: "B=true, C:false", secondaryPositions: "{D=false}", primaryPartA: "1.1", secondaryPartA: "2.2", primaryPartB: "", secondaryPartB: "3", total: "4.5", ratio: "0.9" }],
    secondaryGrouts: [{ id: "sg-1", ringNo: "P41", positions: "A=true", total: "5.25" }],
    shiftReports: [{ id: "r1", events: '[{"event":"x"}]', manpower: '{"Engineer":"2"}', result: '{"numberRing":"3"}' }],
    issues: [{ id: "i1" }], dailyReports: [{ id: "d1", machine: "TBM1", area: "  Shaft  ", weather: { morning: "clear" }, equipment: { excavator: "2" }, labor: { engineer: "3" }, workLog: [{ id: "w1", title: "  Install  ", done: "2", total: "4" }] }], prepTasks: [{ id: "p1", machine: "TBM1" }],
    planConfig: '{"totalRings":450}', distPlanConfig: '{"targetMeters":1200}', routeConfigs: { TBM1: { route: "A" } }, routeProjectTotal: 123, machineProgress: { TBM1: 42 },
    instLocations: [{ id: "l1" }], instInstruments: [{ id: "in1" }], instThresholds: [{ id: "t1" }], instReadings: [{ id: "rd1" }], instSchedules: [{ id: "sc1" }], syncMeta: { cursor: "x" }
  }, "TBM1");

  expect(data).toEqual(expect.objectContaining({
    machine: "TBM1", issues: [{ id: "i1" }], prepTasks: [{ id: "p1", machine: "TBM1" }],
    planConfig: { totalRings: 450 }, distPlanConfig: { targetMeters: 1200 }, routeConfigs: { TBM1: { route: "A" } }, routeProjectTotal: 123, machineProgress: { TBM1: 42 }, syncMeta: { cursor: "x" }
  }));
  expect(data.segments[0]).toEqual(expect.objectContaining({ excavStartTime: "08:30", installEndTime: "09:45", startTime: "10:00", endTime: "11:00" }));
  expect(data.grouts[0]).toEqual(expect.objectContaining({ positions: { A: true }, primaryPositions: { B: true, C: false }, secondaryPositions: { D: false }, partA: "3.30", partB: "3.00", total: 4.5, ratio: 0.9 }));
  expect(data.secondaryGrouts[0]).toEqual(expect.objectContaining({ positions: { A: true }, total: 5.25 }));
  expect(data.shiftReports[0]).toEqual(expect.objectContaining({ events: [{ event: "x" }], manpower: { Engineer: "2" }, result: { numberRing: "3" } }));
  expect(data.instSchedules).toEqual([{ id: "sc1" }]);
  expect(data.dailyReports[0]).toEqual(expect.objectContaining({ id: "d1", area: "Shaft", machine: "TBM1", workLog: [expect.objectContaining({ title: "Install", done: 2, total: 4 })] }));
});

test("returns an explicit empty shape and safe parse defaults for older deployments", () => {
  expect(normalizeServerData({ shiftReports: [{ events: "bad", manpower: "bad", result: "bad" }] }, "TBM2")).toEqual(expect.objectContaining({
    machine: "TBM2", segments: [], grouts: [], secondaryGrouts: [], issues: [], dailyReports: [], prepTasks: [], planConfig: null, distPlanConfig: null, routeConfigs: {}, routeProjectTotal: null, machineProgress: null,
    instLocations: [], instInstruments: [], instThresholds: [], instReadings: [], instSchedules: [], syncMeta: {},
    shiftReports: [expect.objectContaining({ events: {}, manpower: expect.objectContaining({ Engineer: "" }), result: expect.objectContaining({ numberRing: "" }) })]
  }));
});

test("does not apply malformed server config strings", () => {
  const data = normalizeServerData({ planConfig: "{bad", distPlanConfig: "also bad" }, "TBM1");
  expect(data.planConfig).toBeNull();
  expect(data.distPlanConfig).toBeNull();
});
