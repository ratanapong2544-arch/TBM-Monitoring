import {
  dayDiff, loadForecastMode, saveForecastMode, computeForecast,
} from "./prepForecast";

beforeEach(() => localStorage.clear());

test("dayDiff: นับวันแบบมีเครื่องหมาย", () => {
  expect(dayDiff("2026-06-01", "2026-06-11")).toBe(10);
  expect(dayDiff("2026-06-11", "2026-06-01")).toBe(-10);
  expect(dayDiff("2026-06-30", "2026-07-01")).toBe(1);
});

test("forecast mode: default remaining, save/load rate, ค่าขยะ → remaining", () => {
  expect(loadForecastMode()).toBe("remaining");
  saveForecastMode("rate");
  expect(loadForecastMode()).toBe("rate");
  localStorage.setItem("tbmPrepForecastMode", "junk");
  expect(loadForecastMode()).toBe("remaining");
});

// helper สร้าง task สั้นๆ
const T = (o) => ({ milestone: false, percent: 0, deps: [], ...o });

test("done (100%) → fc = แผน, ไม่เลื่อน, ไม่ critical", () => {
  const r = computeForecast([T({ id: "a", start: "2026-06-01", end: "2026-06-10", percent: 100 })], "2026-06-12", "remaining");
  expect(r.byId.a).toMatchObject({ fcStart: "2026-06-01", fcEnd: "2026-06-10", slipDays: 0, isCritical: false });
});

test("in-progress โหมด remaining: เหลือ 40% ของ 10 วัน = 4 วันจากวันนี้", () => {
  // งาน 1–10 มิ.ย. วันนี้ 12 มิ.ย. ทำได้ 60% → เหลือ ceil(0.4×10)=4 → จบ 16 มิ.ย. (slip +6)
  const r = computeForecast([T({ id: "a", start: "2026-06-01", end: "2026-06-10", percent: 60 })], "2026-06-12", "remaining");
  expect(r.byId.a).toMatchObject({ fcStart: "2026-06-01", fcEnd: "2026-06-16", slipDays: 6 });
});

test("in-progress โหมด rate: rate จริง 60%/12วัน = 5%/วัน → เหลือ 8 วัน", () => {
  const r = computeForecast([T({ id: "a", start: "2026-06-01", end: "2026-06-10", percent: 60 })], "2026-06-12", "rate");
  expect(r.byId.a).toMatchObject({ fcEnd: "2026-06-20", slipDays: 10 });
});

test("in-progress เร็วกว่าแผน → fcEnd เร็วกว่าแผนได้ (slip ติดลบ)", () => {
  // 1–10 มิ.ย. วันนี้ 3 มิ.ย. ได้ 50% → เหลือ 5 วัน → จบ 8 มิ.ย. (slip −2)
  const r = computeForecast([T({ id: "a", start: "2026-06-01", end: "2026-06-10", percent: 50 })], "2026-06-03", "remaining");
  expect(r.byId.a).toMatchObject({ fcEnd: "2026-06-08", slipDays: -2 });
});

test("ยังไม่เริ่ม + เลยกำหนด → ดันเริ่มเป็นวันนี้ duration คงเดิม", () => {
  const r = computeForecast([T({ id: "a", start: "2026-06-08", end: "2026-06-12", percent: 0 })], "2026-06-14", "remaining");
  expect(r.byId.a).toMatchObject({ fcStart: "2026-06-14", fcEnd: "2026-06-18", slipDays: 6 });
});

test("ยังไม่เริ่ม + ยังไม่ถึงกำหนด → fc = แผน", () => {
  const r = computeForecast([T({ id: "a", start: "2026-06-20", end: "2026-06-22", percent: 0 })], "2026-06-12", "remaining");
  expect(r.byId.a).toMatchObject({ fcStart: "2026-06-20", fcEnd: "2026-06-22", slipDays: 0 });
});

test("milestone ยังไม่ done เลยกำหนด → ดันเป็นวันนี้ (dur 1)", () => {
  const r = computeForecast([T({ id: "m", start: "2026-06-10", end: "2026-06-10", milestone: true, percent: 0 })], "2026-06-12", "remaining");
  expect(r.byId.m).toMatchObject({ fcStart: "2026-06-12", fcEnd: "2026-06-12", slipDays: 2 });
});

test("guard: fcEnd ไม่ก่อน fcStart (เริ่มก่อนแผน + ใกล้เสร็จ)", () => {
  // วันนี้ 10 แต่ start แผน 15, ทำแล้ว 90% (เริ่มก่อนแผน) → remaining สั้นมาก
  const r = computeForecast([T({ id: "a", start: "2026-06-15", end: "2026-06-24", percent: 90 })], "2026-06-10", "remaining");
  expect(r.byId.a.fcEnd >= r.byId.a.fcStart).toBe(true);
});

test("slip เทียบ baseline เมื่อมี baseEnd", () => {
  // แผนปัจจุบันถูกแก้เป็น 5–14 แต่ baseline เดิม 1–10 → done ตามแผนปัจจุบัน slip = 14−10 = +4
  const r = computeForecast([T({ id: "a", start: "2026-06-05", end: "2026-06-14", percent: 100, baseStart: "2026-06-01", baseEnd: "2026-06-10" })], "2026-06-12", "remaining");
  expect(r.byId.a.slipDays).toBe(4);
});

test("project summary: fcEnd/baseEnd/slip ระดับโครงการ", () => {
  const r = computeForecast([
    T({ id: "a", start: "2026-06-01", end: "2026-06-10", percent: 60 }),   // fcEnd 16
    T({ id: "b", start: "2026-06-05", end: "2026-06-12", percent: 100 }),  // fcEnd 12
  ], "2026-06-12", "remaining");
  expect(r.project).toMatchObject({ fcEnd: "2026-06-16", baseEnd: "2026-06-12", slipDays: 4 });
});

test("ไม่มี task ที่ valid → project = null, byId ว่าง", () => {
  const r = computeForecast([], "2026-06-12", "remaining");
  expect(r.project).toBeNull();
  expect(Object.keys(r.byId)).toHaveLength(0);
});

// ---- dependency forward pass tests ----
// pred มาตรฐานของกลุ่มนี้: A 1–10 มิ.ย. ยังไม่เริ่ม วันนี้ 12 → A fc = 12–21
const A = () => T({ id: "A", start: "2026-06-01", end: "2026-06-10", percent: 0 });

test("FS: successor เริ่มหลัง pred forecast จบ +1", () => {
  const r = computeForecast([A(), T({ id: "B", start: "2026-06-11", end: "2026-06-13", deps: [{ id: "A", type: "FS", lag: 0 }] })], "2026-06-12", "remaining");
  expect(r.byId.A).toMatchObject({ fcStart: "2026-06-12", fcEnd: "2026-06-21" });
  expect(r.byId.B).toMatchObject({ fcStart: "2026-06-22", fcEnd: "2026-06-24" });
});

test("FS lag บวก/ลบ", () => {
  const r1 = computeForecast([A(), T({ id: "B", start: "2026-06-11", end: "2026-06-13", deps: [{ id: "A", type: "FS", lag: 2 }] })], "2026-06-12", "remaining");
  expect(r1.byId.B.fcStart).toBe("2026-06-24");
  const r2 = computeForecast([A(), T({ id: "B", start: "2026-06-11", end: "2026-06-13", deps: [{ id: "A", type: "FS", lag: -3 }] })], "2026-06-12", "remaining");
  expect(r2.byId.B.fcStart).toBe("2026-06-19"); // 21+1−3
});

test("SS: เริ่มตาม pred เริ่ม + lag", () => {
  const r = computeForecast([A(), T({ id: "B", start: "2026-06-11", end: "2026-06-13", deps: [{ id: "A", type: "SS", lag: 1 }] })], "2026-06-12", "remaining");
  expect(r.byId.B.fcStart).toBe("2026-06-13"); // max(แผน11→วันนี้12, A.fcStart 12 + 1)
});

test("FF: วันจบผูกกับ pred จบ", () => {
  const r = computeForecast([A(), T({ id: "B", start: "2026-06-11", end: "2026-06-13", deps: [{ id: "A", type: "FF", lag: 0 }] })], "2026-06-12", "remaining");
  expect(r.byId.B).toMatchObject({ fcStart: "2026-06-19", fcEnd: "2026-06-21" }); // end ≥ 21, dur 3
});

test("SF: วันจบผูกกับ pred เริ่ม (ข้อจำกัดอ่อนกว่าวันนี้ → ใช้วันนี้)", () => {
  const r = computeForecast([A(), T({ id: "B", start: "2026-06-11", end: "2026-06-13", deps: [{ id: "A", type: "SF", lag: 0 }] })], "2026-06-12", "remaining");
  expect(r.byId.B).toMatchObject({ fcStart: "2026-06-12", fcEnd: "2026-06-14" });
});

test("หลาย predecessor → ใช้ข้อจำกัดที่ช้าสุด", () => {
  const r = computeForecast([
    A(),
    T({ id: "C", start: "2026-06-01", end: "2026-06-25", percent: 100 }),
    T({ id: "B", start: "2026-06-11", end: "2026-06-13", deps: [{ id: "A", type: "FS", lag: 0 }, { id: "C", type: "FS", lag: 0 }] }),
  ], "2026-06-12", "remaining");
  expect(r.byId.B.fcStart).toBe("2026-06-26"); // C จบ 25 ช้ากว่า A จบ 21
});

test("dep ไม่ดันงานที่เริ่มแล้ว (% > 0)", () => {
  const r = computeForecast([A(), T({ id: "B", start: "2026-06-05", end: "2026-06-13", percent: 30, deps: [{ id: "A", type: "FS", lag: 0 }] })], "2026-06-12", "remaining");
  expect(r.byId.B.fcStart).toBe("2026-06-05"); // เริ่มจริงแล้ว
});

test("dep ชี้ id ที่ไม่มี → ข้ามเฉยๆ", () => {
  const r = computeForecast([T({ id: "B", start: "2026-06-20", end: "2026-06-22", deps: [{ id: "ghost", type: "FS", lag: 0 }] })], "2026-06-12", "remaining");
  expect(r.byId.B).toMatchObject({ fcStart: "2026-06-20", fcEnd: "2026-06-22" });
});

test("วงจร A↔B → cycleIds ครบ และคำนวณแบบไม่มี dep ไม่ crash", () => {
  const r = computeForecast([
    T({ id: "A", start: "2026-06-01", end: "2026-06-05", deps: [{ id: "B", type: "FS", lag: 0 }] }),
    T({ id: "B", start: "2026-06-06", end: "2026-06-10", deps: [{ id: "A", type: "FS", lag: 0 }] }),
  ], "2026-06-12", "remaining");
  expect(r.cycleIds.sort()).toEqual(["A", "B"]);
  expect(r.byId.A.fcStart).toBe("2026-06-12");
  expect(r.byId.B.fcStart).toBe("2026-06-12");
});

test("milestone โดนโซ่ดัน", () => {
  const r = computeForecast([A(), T({ id: "M", start: "2026-06-19", end: "2026-06-19", milestone: true, deps: [{ id: "A", type: "FS", lag: 0 }] })], "2026-06-12", "remaining");
  expect(r.byId.M).toMatchObject({ fcStart: "2026-06-22", fcEnd: "2026-06-22" });
});
