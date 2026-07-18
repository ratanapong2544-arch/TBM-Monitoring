import { focusWindow, niceDomain, breachSpans, ribbonStatus, latestStatus, RANGE_OPTIONS } from "./headTrend";

const mk = (ringN, headV, artV = headV, tailV = headV) => ({ ringN, headV, artV, tailV });
const seq = (from, to, v = 10) => Array.from({ length: to - from + 1 }, (_, i) => mk(from + i, v));

describe("RANGE_OPTIONS", () => {
  test("3 ตัวเลือก และ 0 = ทั้งหมด", () => {
    expect(RANGE_OPTIONS.map(o => o.value)).toEqual([50, 150, 0]);
  });
});

describe("focusWindow", () => {
  test("size 0 → คืนทั้งหมด เรียงตามเลขริง", () => {
    const s = [mk(5, 1), mk(1, 2), mk(3, 3)];
    expect(focusWindow(s, 0).map(x => x.ringN)).toEqual([1, 3, 5]);
  });
  test("size น้อยกว่าจำนวนข้อมูล → เอา N ตัวท้าย", () => {
    expect(focusWindow(seq(1, 10), 3).map(x => x.ringN)).toEqual([8, 9, 10]);
  });
  test("size มากกว่าจำนวนข้อมูล → คืนทั้งหมด ไม่ throw", () => {
    expect(focusWindow(seq(1, 3), 50)).toHaveLength(3);
  });
  test("endRing → หน้าต่างจบที่ริงนั้น (ใช้ตอนคลิกแถบภาพรวม)", () => {
    expect(focusWindow(seq(1, 100), 5, 50).map(x => x.ringN)).toEqual([46, 47, 48, 49, 50]);
  });
  test("endRing ที่ต้นเส้น → ไม่หลุดขอบ คืนหน้าต่างแรกเต็ม size", () => {
    expect(focusWindow(seq(1, 100), 10, 3).map(x => x.ringN)).toEqual([1,2,3,4,5,6,7,8,9,10]);
  });
  test("endRing ที่ไม่มีจริง → เลือกริงถัดไปที่มี", () => {
    const s = [mk(1,0), mk(5,0), mk(9,0)];
    expect(focusWindow(s, 2, 4).map(x => x.ringN)).toEqual([1, 5]);
  });
  test("series ว่าง → []", () => {
    expect(focusWindow([], 50)).toEqual([]);
  });
});

describe("niceDomain", () => {
  test("ข้อมูลอยู่ในเกณฑ์ → อย่างน้อย ±100 (แถบ ±75 ไม่ชิดขอบ)", () => {
    expect(niceDomain(seq(1, 5, 30), 75)).toEqual([-100, 100]);
  });
  test("ข้อมูลจริง 150 ริงล่าสุด (−40…+79) → [-100, 100]", () => {
    expect(niceDomain([mk(1, -40), mk(2, 79)], 75)).toEqual([-100, 100]);
  });
  test("excursion −587 → ขยายลงเป็นเลขกลมขั้น 25", () => {
    expect(niceDomain([mk(1, -587), mk(2, 79)], 75)).toEqual([-600, 100]);
  });
  test("ค่าบวกจัด → ขยายขึ้นเป็นเลขกลม", () => {
    expect(niceDomain([mk(1, 260)], 75)).toEqual([-100, 275]);
  });
  test("ดูทุก metric ไม่ใช่แค่ headV", () => {
    expect(niceDomain([{ ringN: 1, headV: 10, artV: 10, tailV: -300 }], 75)).toEqual([-300, 100]);
  });
  test("ข้าม null/NaN ไม่พัง", () => {
    expect(niceDomain([{ ringN: 1, headV: null, artV: NaN, tailV: 20 }], 75)).toEqual([-100, 100]);
  });
  test("series ว่าง → ±100", () => {
    expect(niceDomain([], 75)).toEqual([-100, 100]);
  });
});

describe("breachSpans", () => {
  test("ช่วงติดกันยุบเป็นช่วงเดียว", () => {
    const s = [mk(1, 10), mk(2, 90), mk(3, 95), mk(4, 10)];
    expect(breachSpans(s, 75)).toEqual([{ from: 2, to: 3 }]);
  });
  test("เกินด้านลบก็นับ", () => {
    expect(breachSpans([mk(1, -90)], 75)).toEqual([{ from: 1, to: 1 }]);
  });
  test("หลายช่วงแยกกัน", () => {
    const s = [mk(1, 90), mk(2, 10), mk(3, 90)];
    expect(breachSpans(s, 75)).toEqual([{ from: 1, to: 1 }, { from: 3, to: 3 }]);
  });
  test("ช่วงที่ยังเปิดอยู่ตอนจบ series ต้องถูกปิด", () => {
    expect(breachSpans([mk(1, 10), mk(2, 90)], 75)).toEqual([{ from: 2, to: 2 }]);
  });
  test("metric ใดเกินก็นับ (artV เกินตัวเดียว)", () => {
    expect(breachSpans([{ ringN: 1, headV: 0, artV: 90, tailV: 0 }], 75)).toEqual([{ from: 1, to: 1 }]);
  });
  test("ที่ tolerance พอดี = ยังไม่เกิน", () => {
    expect(breachSpans([mk(1, 75)], 75)).toEqual([]);
  });
  test("ไม่มีเกินเลย → []", () => {
    expect(breachSpans(seq(1, 5, 10), 75)).toEqual([]);
  });
});

describe("ribbonStatus", () => {
  test("จัดชั้น ok / near / over ตาม |ค่า| สูงสุดของริง", () => {
    const s = [mk(1, 10), mk(2, 60), mk(3, 90)];
    expect(ribbonStatus(s, 75).map(x => x.status)).toEqual(["ok", "near", "over"]);
  });
  test("near = เกิน 0.66×tol (49.5) แต่ไม่เกิน tol", () => {
    expect(ribbonStatus([mk(1, 50)], 75)[0].status).toBe("near");
    expect(ribbonStatus([mk(1, 49)], 75)[0].status).toBe("ok");
  });
  test("mag = |ค่า| สูงสุดของริงนั้น ใช้คุมความเข้มสี", () => {
    expect(ribbonStatus([{ ringN: 1, headV: -300, artV: 10, tailV: 5 }], 75)[0].mag).toBe(300);
  });
  test("ริงที่ไม่มีค่าเลย → ข้ามไป ไม่ใช่ ok", () => {
    expect(ribbonStatus([{ ringN: 1, headV: null, artV: null, tailV: null }], 75)).toEqual([]);
  });
  test("เรียงตามเลขริง", () => {
    expect(ribbonStatus([mk(3, 1), mk(1, 1)], 75).map(x => x.ringN)).toEqual([1, 3]);
  });
});

describe("latestStatus", () => {
  test("เอาริงเลขมากสุด ไม่ใช่ตัวท้าย array", () => {
    expect(latestStatus([mk(9, 10), mk(2, 90)], 75).ringN).toBe(9);
  });
  test("ริงล่าสุดอยู่ในเกณฑ์ → ok (แม้ประวัติเคยหลุด)", () => {
    expect(latestStatus([mk(1, 500), mk(2, 30)], 75).status).toBe("ok");
  });
  test("ริงล่าสุดเกิน → over พร้อม mag", () => {
    expect(latestStatus([mk(1, 90)], 75)).toEqual({ ringN: 1, status: "over", mag: 90 });
  });
  test("ไม่มีข้อมูล → null", () => {
    expect(latestStatus([], 75)).toBeNull();
  });
});
