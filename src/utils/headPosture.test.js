import { headPostureAngles, PITCH_MAX, ROLL_MAX } from "./headPosture";

describe("headPostureAngles", () => {
  test("null posture → all zero", () => {
    expect(headPostureAngles(null)).toEqual({ pitchDeg: 0, rollDeg: 0, yawDeg: 0 });
  });
  test("head higher than tail → nose-up (positive pitch)", () => {
    expect(headPostureAngles({ headV: 60, tailV: 0 }).pitchDeg).toBeCloseTo(6, 5); // 60 * 0.10
  });
  test("head lower than tail → nose-down (negative pitch)", () => {
    expect(headPostureAngles({ headV: -50, tailV: 50 }).pitchDeg).toBeLessThan(0);
  });
  test("pitch clamps to ±PITCH_MAX", () => {
    expect(headPostureAngles({ headV: 1000, tailV: 0 }).pitchDeg).toBe(PITCH_MAX);
    expect(headPostureAngles({ headV: -1000, tailV: 0 }).pitchDeg).toBe(-PITCH_MAX);
  });
  test("roll from vrt with gain", () => {
    expect(headPostureAngles({ vrt: 0.5 }).rollDeg).toBeCloseTo(10, 5); // 0.5 * 20
  });
  test("roll clamps to ±ROLL_MAX", () => {
    expect(headPostureAngles({ vrt: 10 }).rollDeg).toBe(ROLL_MAX);
  });
  test("yaw from headH-tailH", () => {
    expect(headPostureAngles({ headH: 40, tailH: 0 }).yawDeg).toBeCloseTo(4, 5);
  });
  test("missing metrics → that axis 0", () => {
    expect(headPostureAngles({ headV: 30 })).toMatchObject({ rollDeg: 0, yawDeg: 0 });
  });
});
