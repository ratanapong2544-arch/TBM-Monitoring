import { discardOutcomeText, stuckCount, travellingCount } from "./syncSummary";

test("what discarding does is said per operation, because it differs per operation", () => {
  // Written twice and wrong twice before it was written once: a CREATE's row goes, a DELETE's row
  // comes back, an UPDATE's stays until the next getData.
  expect(discardOutcomeText("create")).toContain("จะหายไปจากหน้าจอ");
  expect(discardOutcomeText("delete")).toContain("จะกลับมาแสดงบนหน้าจอ");
  expect(discardOutcomeText("update")).toContain("จะยังอยู่บนหน้าจอ");
  expect(discardOutcomeText(null)).toContain("จะยังอยู่บนหน้าจอ"); // the safe default
});

test("stuck and travelling are different questions and neither borrows the other's rows", () => {
  const summary = { pending: 3, syncing: 1, conflicts: 2, errors: 1, blocked: 4 };

  expect(travellingCount(summary)).toBe(4);
  expect(stuckCount(summary)).toBe(7);
  expect(stuckCount(undefined)).toBe(0);
});

test("what a discard does is said without naming a ring, because most of these are not rings", () => {
  // `blocked` and the discard dialogs cover issue, dailyReport, prepTask, shiftReport, the three
  // instrument families and four config families. None of them is a ring, and this same sentence is
  // rendered by both the Sync Center and the conflict resolver.
  ["create", "update", "delete"].forEach(operation => {
    expect(discardOutcomeText(operation)).not.toMatch(/ริง|ปล่อง|segment/i);
  });
  expect(discardOutcomeText("delete")).toContain("จะกลับมาแสดงบนหน้าจอ");
});
