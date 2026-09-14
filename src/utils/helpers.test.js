import { shiftEventMinutes, inRingOrder } from "./helpers";

describe("inRingOrder", () => {
  const rings = rows => rows.map(r => r.ringNo);

  test("a permanent ring recorded after higher rings goes back to its place", () => {
    // TBM2 2026-09-14: P1 was forgotten and recorded after P5 — the sheet appends, so it came last
    expect(rings(inRingOrder([{ ringNo: "P2" }, { ringNo: "P3" }, { ringNo: "P5" }, { ringNo: "P1" }]))).toEqual(["P1", "P2", "P3", "P5"]);
  });

  test("temporary rings keep their sheet order, ahead of every permanent ring", () => {
    // TBM1 counted T7 down to T1 before P1, so the sheet is the only order they have
    expect(rings(inRingOrder([{ ringNo: "T7" }, { ringNo: "T6" }, { ringNo: "P1" }, { ringNo: "P2" }, { ringNo: "T1" }]))).toEqual(["T7", "T6", "T1", "P1", "P2"]);
  });

  test("rows of one ring keep the order the sheet has them in", () => {
    const partial = { ringNo: "P5", status: "In Progress" };
    const completed = { ringNo: "P5", status: "Completed" };
    const next = { ringNo: "P6" };
    expect(inRingOrder([partial, next, completed])).toEqual([partial, completed, next]);
  });

  test("reads the ring the way the forms write it", () => {
    expect(rings(inRingOrder([{ ringNo: "p10 " }, { ringNo: "P009" }]))).toEqual(["P009", "p10 "]);
  });

  test("does not reorder the array it was given", () => {
    const rows = [{ ringNo: "P2" }, { ringNo: "P1" }];
    inRingOrder(rows);
    expect(rings(rows)).toEqual(["P2", "P1"]);
  });
});

describe("shiftEventMinutes", () => {
  test("day shift normal", () => {
    expect(shiftEventMinutes("08:00", "10:00", "Day")).toBe(120);
  });
  test("night shift normal", () => {
    expect(shiftEventMinutes("20:00", "22:00", "Night")).toBe(120);
  });
  test("night shift crossing midnight", () => {
    expect(shiftEventMinutes("23:00", "01:00", "Night")).toBe(120);
  });
  test("clamps to 720 cap", () => {
    expect(shiftEventMinutes("18:00", "20:00", "Day")).toBe(60);
  });
  test("missing time returns 0", () => {
    expect(shiftEventMinutes("", "10:00", "Day")).toBe(0);
    expect(shiftEventMinutes("08:00", null, "Day")).toBe(0);
  });
  test("end before start returns 0 (not negative)", () => {
    expect(shiftEventMinutes("10:00", "08:00", "Day")).toBe(0);
  });
});
