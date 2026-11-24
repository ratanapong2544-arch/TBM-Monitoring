import { dedupeRings, isDayRing, groutPerRing, avgGroutRatio } from "./helpers";

test("a ring recorded on two dates is one ring, on its later row's date", () => {
  const rows = [
    { ringNo: "P172", date: "2026-02-27", status: "Completed" },
    { ringNo: "P172", date: "2026-02-26", status: "Completed" },
    { ringNo: "P172", date: "2026-02-27", status: "Completed" },
    { ringNo: "P173", date: "2026-02-27", status: "Completed" },
    { ringNo: "P173", date: "2026-02-28", status: "In Progress" },
  ];
  const d = dedupeRings(rows);
  expect(d).toHaveLength(2);
  expect(d.find((r) => r.ringNo === "P172").date).toBe("2026-02-27");
  expect(d.find((r) => r.ringNo === "P173").status).toBe("Completed");
});

test("Day/Night follows the install shift first", () => {
  expect(isDayRing({ shift: "Day", installShift: "Night" })).toBe(false);
  expect(isDayRing({ shift: "Night", installShift: "Day" })).toBe(true);
  expect(isDayRing({ shift: "Day" })).toBe(true);
});

test("average grout ratio is per ring and skips blank ratios", () => {
  const rows = [
    { ringNo: "P1", ratio: 100 }, { ringNo: "P1", ratio: 120 },
    { ringNo: "P2", ratio: 110 }, { ringNo: "P3", ratio: "" },
  ];
  expect(groutPerRing(rows)).toHaveLength(3);
  expect(avgGroutRatio(rows)).toBe(115);
});
