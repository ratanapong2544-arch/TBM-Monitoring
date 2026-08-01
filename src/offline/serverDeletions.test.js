import { applyServerRows, isServerDeleted } from "./serverDeletions";

const issue = (id, extra = {}) => ({ id, title: `issue ${id}`, status: "open", ...extra });

test("a response carrying rows is authoritative", () => {
  const incoming = [issue("a")];
  expect(applyServerRows("issue", incoming, [issue("b")], {}, "TBM1")).toBe(incoming);
});

test("an empty response removes exactly the rows the server tombstoned", () => {
  const previous = [issue("a"), issue("b")];
  const syncMeta = { "issue:GLOBAL:a": { version: 2, deleted: true } };

  expect(applyServerRows("issue", [], previous, syncMeta, "TBM1")).toEqual([issue("b")]);
});

test("an empty response with no tombstone changes nothing, and keeps the same array", () => {
  // the identity check matters: App stores this straight into state, and a fresh array every
  // refresh would re-render every list on every poll
  const previous = [issue("a")];

  expect(applyServerRows("issue", [], previous, { "issue:GLOBAL:a": { version: 2 } }, "TBM1")).toBe(previous);
  expect(applyServerRows("issue", [], previous, {}, "TBM1")).toBe(previous);
  expect(applyServerRows("issue", [], previous, undefined, "TBM1")).toBe(previous);
});

test("a machine-keyed record is named by its own machine, not the one on screen", () => {
  // `dailyReport` keys per machine. Reading the key off the active machine would look up the wrong
  // domain and miss the tombstone — or hit someone else's.
  const previous = [{ id: "dr_1", machine: "TBM2", area: "IS2" }];
  const syncMeta = { "dailyReport:TBM2:dr_1": { version: 4, deleted: true } };

  expect(applyServerRows("dailyReport", [], previous, syncMeta, "TBM1")).toEqual([]);
  expect(isServerDeleted("dailyReport", previous[0], syncMeta, "TBM1")).toBe(true);
});

test("a record with no machine of its own falls back to the machine on screen", () => {
  const row = { id: "pt_1", name: "ตั้งเครน" };
  const syncMeta = { "prepTask:TBM1:pt_1": { version: 1, deleted: true } };

  expect(isServerDeleted("prepTask", row, syncMeta, "TBM1")).toBe(true);
  expect(isServerDeleted("prepTask", row, syncMeta, "TBM2")).toBe(false);
});

test("a tombstone that is not set does not remove anything", () => {
  const previous = [issue("a")];
  expect(applyServerRows("issue", [], previous, { "issue:GLOBAL:a": { deleted: false } }, "TBM1")).toBe(previous);
  expect(applyServerRows("issue", [], previous, { "issue:GLOBAL:a": { deleted: "true" } }, "TBM1")).toEqual([]);
});
