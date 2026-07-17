import { headPostureAngles, pitchLabel, PITCH_MAX, PITCH_REF_MM } from "./headPosture";

describe("headPostureAngles — pitch (sqrt saturation)", () => {
  test("null posture → all zero", () => {
    expect(headPostureAngles(null)).toEqual({ pitchDeg: 0, yawDeg: 0 });
  });

  // sqrt mapping: sign(d) * PITCH_MAX * min(1, sqrt(|d| / PITCH_REF_MM))
  test("ริงล่าสุดจริง P497: +6mm → ~4.2° (เดิม linear ได้แค่ 0.6° = มองไม่เห็น)", () => {
    expect(headPostureAngles({ headV: 41, tailV: 35 }).pitchDeg).toBeCloseTo(4.2426, 3);
  });
  test("มัธยฐานของจริง 23mm → ~8.3°", () => {
    expect(headPostureAngles({ headV: 23, tailV: 0 }).pitchDeg).toBeCloseTo(8.3066, 3);
  });
  test("head สูงกว่า tail → เงย (pitch เป็นบวก)", () => {
    expect(headPostureAngles({ headV: 60, tailV: 0 }).pitchDeg).toBeCloseTo(13.4164, 3);
  });
  test("head ต่ำกว่า tail → ก้ม (pitch เป็นลบ) และสมมาตรกับค่าบวก", () => {
    const down = headPostureAngles({ headV: -50, tailV: 50 }).pitchDeg; // d = -100 → ชนเพดาน
    expect(down).toBe(-PITCH_MAX);
    expect(down).toBe(-headPostureAngles({ headV: 50, tailV: -50 }).pitchDeg);
  });
  test("ที่ PITCH_REF_MM พอดี → ชนเพดาน PITCH_MAX", () => {
    expect(headPostureAngles({ headV: PITCH_REF_MM, tailV: 0 }).pitchDeg).toBe(PITCH_MAX);
  });
  test("outlier P487 (-427mm) → ชนเพดาน ไม่ทำให้ภาพพัง", () => {
    expect(headPostureAngles({ headV: -465, tailV: -38 }).pitchDeg).toBe(-PITCH_MAX);
  });
  test("ค่าน้อยได้มุมมากกว่า linear เดิมเสมอ แต่ยังแยกลำดับได้", () => {
    const a = headPostureAngles({ headV: 6, tailV: 0 }).pitchDeg;
    const b = headPostureAngles({ headV: 23, tailV: 0 }).pitchDeg;
    const c = headPostureAngles({ headV: 53, tailV: 0 }).pitchDeg;
    expect(a).toBeGreaterThan(6 * 0.10);   // ดีกว่าสูตรเดิม
    expect(a).toBeLessThan(b);             // ยังเรียงลำดับถูก
    expect(b).toBeLessThan(c);
  });
  test("head=tail → 0", () => {
    expect(headPostureAngles({ headV: 20, tailV: 20 }).pitchDeg).toBe(0);
  });
});

describe("headPostureAngles — yaw + ไม่มี roll แล้ว", () => {
  test("yaw จาก headH-tailH", () => {
    expect(headPostureAngles({ headH: 40, tailH: 0 }).yawDeg).toBeCloseTo(4, 5);
  });
  test("metric ขาด → แกนนั้นเป็น 0", () => {
    expect(headPostureAngles({ headV: 30 })).toMatchObject({ yawDeg: 0 });
  });
  // VRT = มุมงอข้อต่อ articulation แนวดิ่ง (คอลัมน์ [36]) ไม่ใช่ roll — เราไม่มีข้อมูล roll จริง
  // หลักฐาน: corr(VRT, ค่าเบี่ยง Head) = -0.862 · ช่วงดึงกลับสูงกว่าช่วงวิ่งนิ่ง 25 เท่า
  test("ไม่คืน rollDeg อีกแล้ว แม้ส่ง vrt มา", () => {
    expect(headPostureAngles({ vrt: 0.5 })).not.toHaveProperty("rollDeg");
  });
  test("vrt ไม่มีผลต่อ pitch/yaw", () => {
    expect(headPostureAngles({ vrt: 10 })).toEqual({ pitchDeg: 0, yawDeg: 0 });
  });
});

describe("pitchLabel", () => {
  test("null posture → null", () => {
    expect(pitchLabel(null)).toBeNull();
  });
  test("headV หรือ tailV ขาด → null (ไม่เดาว่าเป็น 0)", () => {
    expect(pitchLabel({ headV: 41 })).toBeNull();
    expect(pitchLabel({ tailV: 35 })).toBeNull();
  });
  test("P497 (+6mm) → เงย", () => {
    expect(pitchLabel({ headV: 41, tailV: 35 })).toEqual({
      dir: "up", mm: 6, word: "เงย", hint: "หัวสูงกว่าหาง",
    });
  });
  test("head ต่ำกว่า tail → ก้ม พร้อม mm ติดลบ", () => {
    expect(pitchLabel({ headV: -56, tailV: -3 })).toEqual({
      dir: "down", mm: -53, word: "ก้ม", hint: "หัวต่ำกว่าหาง",
    });
  });
  test("เท่ากัน → ระดับ", () => {
    expect(pitchLabel({ headV: 20, tailV: 20 })).toEqual({
      dir: "level", mm: 0, word: "ระดับ", hint: "หัวเท่าหาง",
    });
  });
  test("headV = 0 ถือว่ามีค่า ไม่ใช่ค่าขาด", () => {
    expect(pitchLabel({ headV: 0, tailV: 10 }).dir).toBe("down");
  });
  test("ปัดเศษ mm เป็นจำนวนเต็ม", () => {
    expect(pitchLabel({ headV: 41.4, tailV: 35.1 }).mm).toBe(6);
  });
});
