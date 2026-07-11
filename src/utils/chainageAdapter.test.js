import { currentChainage, stationLabel } from "./chainageAdapter";

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
