import { currentChainage, stationLabel, locationMachine } from "./chainageAdapter";
import { CH_EXCAV_START } from "./constants";

test("stationLabel format STA", () => {
  expect(stationLabel(8375.35)).toBe("8+375");
  expect(stationLabel(1690)).toBe("1+690");
});

test("currentChainage คืน null เมื่อไม่มีข้อมูล", () => {
  expect(currentChainage(null, "TBM1")).toBeNull();
  expect(currentChainage({}, "TBM1")).toBeNull();
});

test("currentChainage แปลง dist → STA ตามสูตรจริง", () => {
  // สูตรยืนยันจาก AlignmentMapView.jsx:124 (headCh = CH_EXCAV_START - drilledM)
  // + alignmentGeo.js:58 (chainage = CH_EXCAV_START − ระยะ, เจาะทิศ chainage ลดลง)
  // CH_EXCAV_START = 8830.488 (constants.js) → sta = 8830.488 - 200 = 8630.488
  const mp = { TBM1: { rings: 100, dist: 200 }, TBM2: { rings: 0, dist: 0 } };
  const sta = currentChainage(mp, "TBM1");
  expect(typeof sta).toBe("number");
  expect(sta).toBeCloseTo(8630.488, 1);
});

test("currentChainage reads whichever machine key is passed (TBM2, not hardcoded to TBM1)", () => {
  const mp = { TBM1: { rings: 100, dist: 200 }, TBM2: { rings: 5, dist: 50 } };
  expect(currentChainage(mp, "TBM2")).toBeCloseTo(CH_EXCAV_START - 50, 1);
  // TBM2 not loaded yet → null, never falls back to TBM1's number
  expect(currentChainage({ TBM1: { dist: 200 } }, "TBM2")).toBeNull();
});

test("locationMachine: chainage at/below CH_EXCAV_START (8830.488) → TBM1", () => {
  expect(locationMachine({ chainage: 0 })).toBe("TBM1"); // Shaft IS01 end
  expect(locationMachine({ chainage: 8360 })).toBe("TBM1"); // typical seeded location
  expect(locationMachine({ chainage: CH_EXCAV_START })).toBe("TBM1"); // boundary itself — inclusive
});

test("locationMachine: chainage above CH_EXCAV_START → TBM2", () => {
  expect(locationMachine({ chainage: CH_EXCAV_START + 0.001 })).toBe("TBM2");
  expect(locationMachine({ chainage: 13000 })).toBe("TBM2"); // OS zone
});

test("locationMachine: missing/invalid chainage defaults to TBM1 (today's only populated zone)", () => {
  expect(locationMachine({})).toBe("TBM1");
  expect(locationMachine(null)).toBe("TBM1");
  expect(locationMachine({ chainage: null })).toBe("TBM1");
  expect(locationMachine({ chainage: "abc" })).toBe("TBM1");
});
