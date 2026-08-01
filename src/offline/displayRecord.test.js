import { applyOptimisticRow, stripQueuedPhotos } from "./displayRecord";

test("a queued row reaches the list without its photo bytes", () => {
  // the difference between carrying the base64 and not is invisible on screen — both hide the photo
  // link, since there is no URL to open until GAS answers — so this is the only place it can be seen
  const rows = applyOptimisticRow([], "create", { id: "g1", ringNo: "P643", imageBase64: "data:image/jpeg;base64,AAAA", imageName: "ring.jpg" });

  expect(rows).toHaveLength(1);
  expect(rows[0].imageBase64).toBeUndefined();
  expect(rows[0].imageUrl).toBe("Attached");
});

test("a second save of one record replaces its row instead of adding another", () => {
  const first = applyOptimisticRow([], "create", { id: "s1", ringNo: "P643", status: "In Progress" });
  const second = applyOptimisticRow(first, "update", { id: "s1", ringNo: "P643", status: "Completed" });

  expect(second).toHaveLength(1);
  expect(second[0].status).toBe("Completed");
});

test("a queued delete takes the row off the list", () => {
  // if it stays, the crew press Delete again and a second delete queues on a record the first one
  // already removed
  const rows = applyOptimisticRow([{ id: "s1", ringNo: "P643" }, { id: "s2", ringNo: "P644" }], "delete", { id: "s1" });

  expect(rows.map(row => row.id)).toEqual(["s2"]);
});

test("a queued photo leaves the row on screen carrying a marker, not the bytes", () => {
  const queued = { id: "g1", ringNo: "P643", imageBase64: "data:image/jpeg;base64,AAAA", imageName: "ring.jpg" };

  const display = stripQueuedPhotos(queued);

  expect(display.imageBase64).toBeUndefined();
  expect(display.imageName).toBeUndefined();
  expect(display.imageUrl).toBe("Attached"); // the data logs read this as "queued, no link yet"
  expect(display.ringNo).toBe("P643");
  expect(queued.imageBase64).toBe("data:image/jpeg;base64,AAAA"); // the payload keeps what it sends
});

test("the excavation photo is stripped on its own terms", () => {
  // a segment carries two photos with separate field names, and only one of them may be present
  const display = stripQueuedPhotos({ id: "s1", excavImageBase64: "data:image/jpeg;base64,BBBB", excavImageName: "soil.jpg" });

  expect(display.excavImageBase64).toBeUndefined();
  expect(display.excavImageUrl).toBe("Attached");
});

test("a URL the server has already answered with is not overwritten", () => {
  // a re-save of a row whose photo is already on Drive must keep the link the crew can open
  const display = stripQueuedPhotos({ id: "g1", imageBase64: "data:image/jpeg;base64,AAAA", imageUrl: "https://drive.example/1" });

  expect(display.imageUrl).toBe("https://drive.example/1");
});

test("a row with no photo is handed back untouched", () => {
  // identity matters: the callers put this straight into React state, and a fresh object on every
  // apply would re-render every list that holds it
  const row = { id: "s1", ringNo: "P643" };

  expect(stripQueuedPhotos(row)).toBe(row);
  expect(stripQueuedPhotos(null)).toBe(null);
});

test("an id names a row when it is blank on both sides, and nothing when it is absent", () => {
  // The sheet sends `id: ""` for a blank Id cell, and the merge matches a blank-id record to a
  // blank-id ROW WITHIN ONE DOMAIN (`claimWithinDomain`). Treating `""` as "names no row" here made
  // the screen append where the following refresh overlaid — the two halves of one rule disagreeing,
  // which is the state this whole seam exists to prevent. An ABSENT id is the different case: it
  // names nothing, and matching on it would overwrite the first row that also has none.
  const rows = [
    { id: "", ringNo: "P641", installType: "Permanent", length: "1.41" },
    { id: "", ringNo: "P642", installType: "Permanent", length: "1.42" },
  ];
  const named = ring => ({ id: "", ringNo: ring, installType: "Permanent", length: "9.99", entityType: "segment", machine: "TBM1", domainKey: `segment:TBM1:${ring}:Permanent` });

  expect(applyOptimisticRow(rows, "update", named("P642")).map(row => `${row.ringNo}/${row.length}`))
    .toEqual(["P641/1.41", "P642/9.99"]);
  expect(applyOptimisticRow(rows, "delete", named("P642")).map(row => row.ringNo)).toEqual(["P641"]);
  expect(applyOptimisticRow(rows, "update", named("P900")).map(row => row.ringNo)).toEqual(["P641", "P642", "P900"]);

  // no id at all: appended, and a delete removes nothing
  expect(applyOptimisticRow(rows, "update", { ringNo: "P900" })).toEqual([...rows, { ringNo: "P900" }]);
  expect(applyOptimisticRow(rows, "delete", { ringNo: "P641" })).toEqual(rows);
});

test("a queued write lands on the ring it names, not on every ring sharing its id", () => {
  // The list the crew is looking at matched on `row.id` alone, and the production sheet carries one
  // id across four rings. Pressing save on P71 turned P37, P41 and P81 into copies of P71 on the
  // spot; deleting P71 removed all four. The record carries its own domain key — the ring IS the
  // identity for a segment — so match on that.
  const rows = [
    { id: "s1", ringNo: "P37", installType: "Temporary", length: "1.37" },
    { id: "s1", ringNo: "P41", installType: "Permanent", length: "1.41" },
    { id: "s1", ringNo: "P71", installType: "Permanent", length: "1.71" },
  ];
  const edit = { id: "s1", ringNo: "P71", installType: "Permanent", length: "9.99", entityType: "segment", machine: "TBM1", domainKey: "segment:TBM1:P71:Permanent" };

  expect(applyOptimisticRow(rows, "update", edit).map(row => `${row.ringNo}/${row.length}`))
    .toEqual(["P37/1.37", "P41/1.41", "P71/9.99"]);
  expect(applyOptimisticRow(rows, "delete", edit).map(row => `${row.ringNo}/${row.length}`))
    .toEqual(["P37/1.37", "P41/1.41"]);
});

test("a record named only by recordId still finds the row it already put on screen", () => {
  // The store names a row by `payload.id ?? payload.recordId`; this matched on `id` alone. For the
  // four types Task 8 queues they are the same value, so nothing showed. Task 9 adds types whose
  // payload carries no `id` — `optimisticEntity` injects `recordId` regardless, so the row this
  // reducer put on screen last time is named by that and only that. Matching on `id` would leave
  // every later save appending another copy of the same record, and every delete removing none.
  const onScreen = { recordId: "i1", title: "first", entityType: "issue", machine: null, domainKey: "issue:GLOBAL:i1" };
  const edited = { ...onScreen, title: "second" };

  expect(applyOptimisticRow([onScreen], "update", edited)).toEqual([edited]);
  expect(applyOptimisticRow([onScreen], "delete", edited)).toEqual([]);
});

test("a row that carries its own machine is not claimed by the other machine's record", () => {
  // `dailyReport` and `prepTask` are the two entity types that are machine-keyed AND returned
  // project-wide AND carry a `machine` column, so one list holds both machines' rows and the same
  // record id can appear once per machine. Building the row's key from the RECORD's machine — as
  // this did — makes TBM1's save claim TBM2's row: the other machine's report is overwritten on
  // screen and comes back at the next refresh. `recordFor` reads the row's own machine; so does this
  // now. Task 9 is where these two types reach the queue.
  const rows = [
    { id: "d1", machine: "TBM2", note: "tbm2's report" },
    { id: "d2", machine: "TBM1", note: "tbm1's other report" },
  ];
  const tbm1 = { id: "d1", machine: "TBM1", recordId: "d1", entityType: "dailyReport", domainKey: "dailyReport:TBM1:d1", note: "tbm1's report" };

  expect(applyOptimisticRow(rows, "update", tbm1)).toEqual([...rows, tbm1]);
  expect(applyOptimisticRow(rows, "delete", tbm1)).toEqual(rows);
});
