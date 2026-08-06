import { applyOptimisticRow, revertOptimisticRow, stripQueuedPhotos } from "./displayRecord";

// Several tests here build a record by hand, which is the one shape that reaches `namesRow`'s
// id-only fallback — and the fallback warns, deliberately, because matching on the id alone is the
// rule the cross-ring duplicates disproved. Assert the warning instead of letting it scroll past in
// every CI run: a diagnostic nobody reads is one nobody notices going missing.
let warned;
beforeEach(() => { warned = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { warned.mockRestore(); });
const warnedAboutMissingDomainKey = () => warned.mock.calls.some(([message]) => /no domainKey/.test(String(message)));

test("a queued row reaches the list without its photo bytes", () => {
  // the difference between carrying the base64 and not is invisible on screen — both hide the photo
  // link, since there is no URL to open until GAS answers — so this is the only place it can be seen
  const rows = applyOptimisticRow([], "create", { id: "g1", ringNo: "P643", imageBase64: "data:image/jpeg;base64,AAAA", imageName: "ring.jpg" });

  expect(rows).toHaveLength(1);
  expect(rows[0].imageBase64).toBeUndefined();
  expect(rows[0].imageUrl).toBe("Attached");
});

test("a second save of one record replaces its row instead of adding another", () => {
  // the shape the queue really sends, so the plain update path is not tested through a fallback
  // production cannot produce
  const queued = status => ({ id: "s1", ringNo: "P643", installType: "Permanent", status, recordId: "s1", entityType: "segment", machine: "TBM1", domainKey: "segment:TBM1:P643:Permanent" });
  const first = applyOptimisticRow([], "create", queued("In Progress"));
  const second = applyOptimisticRow(first, "update", queued("Completed"));

  expect(second).toHaveLength(1);
  expect(second[0].status).toBe("Completed");
  expect(warnedAboutMissingDomainKey()).toBe(false);
});

test("a record with no domain key matches on the id alone, and says so", () => {
  // the fallback exists for a caller outside the queue, and it must not degrade quietly: matching on
  // the id alone is the rule the cross-ring duplicates disproved
  const rows = applyOptimisticRow([{ id: "s1", ringNo: "P643", status: "In Progress" }], "update", { id: "s1", ringNo: "P643", status: "Completed" });

  expect(rows.map(row => row.status)).toEqual(["Completed"]);
  expect(warnedAboutMissingDomainKey()).toBe(true);
});

test("a queued delete takes the row off the list", () => {
  // if it stays, the crew press Delete again and a second delete queues on a record the first one
  // already removed
  const onScreen = [{ id: "s1", ringNo: "P643", installType: "Permanent" }, { id: "s2", ringNo: "P644", installType: "Permanent" }];
  const queued = { id: "s1", ringNo: "P643", installType: "Permanent", recordId: "s1", entityType: "segment", machine: "TBM1", domainKey: "segment:TBM1:P643:Permanent" };
  const rows = applyOptimisticRow(onScreen, "delete", queued);

  expect(rows.map(row => row.id)).toEqual(["s2"]);
  expect(warnedAboutMissingDomainKey()).toBe(false);
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

test("a record always names a record, and never claims a row that names none", () => {
  // A blank Id cell is real on the sheet — one grout row has one — but a blank record id is not:
  // `requireMutationEnvelope` refuses it, and `optimisticEntity` injects `recordId` on every queued
  // row. So a record that names nothing can only come from outside the queue, and it is appended
  // rather than painted over the first row that also names nothing.
  const rows = [
    { id: "", ringNo: "P641", installType: "Permanent", length: "1.41" },
    { id: "s2", ringNo: "P642", installType: "Permanent", length: "1.42" },
  ];
  const queued = { id: "s2", recordId: "s2", ringNo: "P642", installType: "Permanent", length: "9.99", entityType: "segment", machine: "TBM1", domainKey: "segment:TBM1:P642:Permanent" };

  expect(applyOptimisticRow(rows, "update", queued).map(row => row.length)).toEqual(["1.41", "9.99"]);
  expect(applyOptimisticRow(rows, "delete", queued).map(row => row.ringNo)).toEqual(["P641"]);
  // a record naming nothing is added, and its delete removes nothing
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
  // The store names a queued row by its `recordId` and a sheet row by its `id`; this matched on
  // `id` alone. For the
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
    // `normalizeReport` writes `machine: ""` for any report whose stored machine is not a known one,
    // and `recordFor` reads that with `||`, so the merge files it under the ACTIVE machine. Reading
    // it with `??` would keep the blank, `makeDomainKey` would map it to GLOBAL, and the screen and
    // the merge would name different domains for one row — the failure this function prevents.
    { id: "d3", machine: "", note: "a report whose machine cell is blank" },
  ];
  const tbm1 = { id: "d1", machine: "TBM1", recordId: "d1", entityType: "dailyReport", domainKey: "dailyReport:TBM1:d1", note: "tbm1's report" };
  const blank = { id: "d3", machine: "TBM1", recordId: "d3", entityType: "dailyReport", domainKey: "dailyReport:TBM1:d3", note: "EDITED" };

  expect(applyOptimisticRow(rows, "update", tbm1)).toEqual([...rows, tbm1]);
  expect(applyOptimisticRow(rows, "delete", tbm1)).toEqual(rows);
  expect(applyOptimisticRow(rows, "update", blank).map(row => row.note)).toEqual([rows[0].note, rows[1].note, "EDITED"]);
  expect(applyOptimisticRow(rows, "delete", blank).map(row => row.id)).toEqual(["d1", "d2"]);
});

describe("revertOptimisticRow — putting back what the server refused", () => {
  const before = [{ id: "a", title: "หนึ่ง" }, { id: "b", title: "สอง", status: "open" }, { id: "c", title: "สาม" }];

  test("a refused create takes its row off the screen", () => {
    const shown = [...before, { id: "d", title: "ใหม่" }];
    expect(revertOptimisticRow(shown, "d", null, -1).map(row => row.id)).toEqual(["a", "b", "c"]);
  });

  test("a refused update puts the old values back, in the same place", () => {
    // the place matters: these lists are read in order, and a restored issue jumping to the end reads
    // as a different record from the one the crew was looking at
    const shown = before.map(row => (row.id === "b" ? { ...row, status: "closed" } : row));
    const reverted = revertOptimisticRow(shown, "b", before[1], 1);
    expect(reverted.map(row => row.id)).toEqual(["a", "b", "c"]);
    expect(reverted[1].status).toBe("open");
  });

  test("a refused delete brings the row back where it was", () => {
    const shown = before.filter(row => row.id !== "b");
    expect(revertOptimisticRow(shown, "b", before[1], 1).map(row => row.id)).toEqual(["a", "b", "c"]);
  });

  test("only the refused row moves — an edit made while the write was in flight survives", () => {
    // restoring the whole previous array instead would undo this silently
    const shown = [{ id: "a", title: "หนึ่ง แก้ระหว่างรอ" }, { ...before[1], status: "closed" }, before[2]];
    const reverted = revertOptimisticRow(shown, "b", before[1], 1);
    expect(reverted[0].title).toBe("หนึ่ง แก้ระหว่างรอ");
    expect(reverted[1].status).toBe("open");
  });

  test("a row that has since been deleted elsewhere is restored at the end rather than dropped", () => {
    expect(revertOptimisticRow([], "b", before[1], 7).map(row => row.id)).toEqual(["b"]);
  });

  test("no id names nothing, so nothing is touched", () => {
    expect(revertOptimisticRow(before, null, before[1], 1)).toBe(before);
  });
});
