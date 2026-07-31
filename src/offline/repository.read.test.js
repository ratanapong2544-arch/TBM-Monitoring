import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));
import { deleteOfflineDbForTests, openOfflineDb } from "./db";
import { buildMutationEnvelope } from "./mutationEnvelope";
import { createRepository } from "./repository";
import { writeServerSnapshot as defaultWrite } from "./snapshotStore";
import { ApiFailure } from "./apiTransport";

beforeEach(async () => { await deleteOfflineDbForTests(); });
afterEach(async () => { await deleteOfflineDbForTests(); });

// A clock that always moves. The rules about a request and a confirmation racing are ORDERINGS, and
// on the real clock both can land in the same millisecond — which makes the comparison pass or fail
// by timing rather than by the rule, and lets an inverted comparison survive most runs.
function advancingClock(startMs = Date.parse("2026-07-30T02:00:00.000Z")) {
  let tick = 0;
  return () => new Date(startMs + (tick += 1000)).toISOString();
}

test("load returns an explicit stale empty wrapper before any snapshot", async () => {
  const repository = createRepository({ openDb: openOfflineDb });
  await expect(repository.load("TBM1")).resolves.toEqual(expect.objectContaining({ source: "empty", fetchedAt: null, stale: true, data: expect.objectContaining({ machine: "TBM1", segments: [], grouts: [], syncMeta: {} }) }));
});

test("refresh writes normalized server data and notifies subscribers", async () => {
  const fetchServerSnapshot = jest.fn().mockResolvedValue({ segments: [{ ringNo: "P1" }] });
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot });
  const subscriber = jest.fn();
  const unsubscribe = repository.subscribe(subscriber);
  await expect(repository.refresh("TBM1")).resolves.toEqual(expect.objectContaining({ source: "server", stale: false, fetchedAt: expect.any(String), data: expect.objectContaining({ segments: expect.arrayContaining([expect.objectContaining({ ringNo: "P1" })]) }) }));
  await expect(repository.load("TBM1")).resolves.toEqual(expect.objectContaining({ source: "indexeddb", stale: true, fetchedAt: expect.any(String), data: expect.objectContaining({ segments: expect.arrayContaining([expect.objectContaining({ ringNo: "P1" })]) }) }));
  expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({ type: "data", machine: "TBM1", result: expect.objectContaining({ source: "server", stale: false, data: expect.objectContaining({ segments: expect.arrayContaining([expect.objectContaining({ ringNo: "P1" })]) }) }) }));
  unsubscribe();
});

test("refresh retains a cached snapshot and emits the typed failure separately", async () => {
  const fetchServerSnapshot = jest.fn().mockResolvedValueOnce({ segments: [{ ringNo: "P1" }] }).mockRejectedValueOnce(new ApiFailure("retryable", "NETWORK"));
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot });
  const errors = jest.fn();
  repository.subscribeErrors(errors);
  await repository.refresh("TBM1");
  await expect(repository.refresh("TBM1")).rejects.toMatchObject({ kind: "retryable", code: "NETWORK" });
  await expect(repository.load("TBM1")).resolves.toEqual(expect.objectContaining({ source: "indexeddb", stale: true, data: expect.objectContaining({ segments: expect.arrayContaining([expect.objectContaining({ ringNo: "P1" })]) }) }));
  expect(errors).toHaveBeenCalledWith(expect.objectContaining({ type: "error", machine: "TBM1", error: expect.objectContaining({ kind: "retryable", code: "NETWORK" }), result: expect.objectContaining({ source: "indexeddb", stale: true }) }));
});

// The relaunch path. `load` reads the stored snapshot's key list, and a queued mutation only ever
// wrote the entity — never that list. Everything below is what the crew sees after closing the app
// in the tunnel and opening it again with no link, which is the ordinary case, not an edge one:
// a shift is eight hours and the app is backgrounded on a phone the whole time.
test("a ring created offline is still there after a relaunch with no server", async () => {
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: [{ id: "s1", ringNo: "P643" }] }) });
  await repository.refresh("TBM1");
  await repository.mutate({
    entityType: "segment", operation: "create", machine: "TBM1", recordId: "seg_new",
    payload: { id: "seg_new", ringNo: "P644" }, baseVersion: 0,
    domainKey: "segment:TBM1:P644:Permanent",
  });

  // a relaunch: nothing in memory, no network, so `load` is the only source
  const reloaded = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => { throw new Error("offline"); } });
  const rings = (await reloaded.load("TBM1")).data.segments.map(row => row.ringNo);
  expect(rings).toContain("P644");
});

test("a ring edited offline still shows the edit after a relaunch with no server", async () => {
  // An update writes its optimistic copy under its own key, which is NOT the key the server row
  // occupies, so the stored key list still points at the pre-edit payload. The crew reopens the app
  // underground and the ring reads In Progress with no install times — work they recorded hours ago.
  // What they do then is re-enter it, which queues a second edit on the same record.
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: [{ id: "s1", ringNo: "P643", status: "In Progress", installEndTime: "" }] }) });
  await repository.refresh("TBM1");
  await repository.mutate({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "s1",
    payload: { id: "s1", ringNo: "P643", status: "Completed", installEndTime: "18:30" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });

  const reloaded = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => { throw new Error("offline"); } });
  const rows = (await reloaded.load("TBM1")).data.segments;
  expect(rows).toHaveLength(1); // the edit replaces the row, it does not add a second one
  expect(rows[0]).toMatchObject({ ringNo: "P643", status: "Completed", installEndTime: "18:30" });
});

test("a ring recorded on one machine does not appear on the other", async () => {
  // Cross-machine contamination is this project's most-repeated defect. The snapshot patch is
  // machine-scoped for that reason: without it TBM1's optimistic key lands in TBM2's key list, so
  // TBM2 shows TBM1's ring — and TBM2's next refresh then deletes that key from the shared entity
  // store, destroying an optimistic row whose mutation is still queued.
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async machine => ({ segments: [], machine }) });
  await repository.refresh("TBM1");
  await repository.refresh("TBM2");
  await repository.mutate({
    entityType: "segment", operation: "create", machine: "TBM1", recordId: "seg_new",
    payload: { id: "seg_new", ringNo: "P644" }, baseVersion: 0,
    domainKey: "segment:TBM1:P644:Permanent",
  });

  const reloaded = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => { throw new Error("offline"); } });
  expect((await reloaded.load("TBM1")).data.segments.map(row => row.ringNo)).toEqual(["P644"]);
  expect((await reloaded.load("TBM2")).data.segments).toEqual([]);
});

test("a ring created offline on a machine never fetched survives a relaunch", async () => {
  // TBM2 on a fresh install, or any machine whose first refresh has not happened: there is no stored
  // snapshot to patch, so the optimistic row had nothing to attach to and the ring was simply gone.
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => { throw new Error("offline"); } });
  await repository.mutate({
    entityType: "segment", operation: "create", machine: "TBM2", recordId: "seg_new",
    payload: { id: "seg_new", ringNo: "P1" }, baseVersion: 0,
    domainKey: "segment:TBM2:P1:Permanent",
  });

  const reloaded = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => { throw new Error("offline"); } });
  expect((await reloaded.load("TBM2")).data.segments.map(row => row.ringNo)).toEqual(["P1"]);
});

test("a ring recorded over one the server already has does not swallow the confirmed row", async () => {
  // The crew records a ring the sheet turns out to already hold — a second device got there first,
  // or the row predates sync. This used to collapse to one line, on the reasoning that one ring
  // should read as one ring until the server settled which record owned it. The server settles it by
  // REFUSING the second record, so the line that survived was the unsynced, already-refused one, and
  // the confirmed row was deleted from the cache with its key: gone from the data logs, the
  // dashboards and every figure derived from them, on a screen whose only message was a routine
  // "waiting to sync". Both rows stand now, which is what the sheet and the crew actually have.
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: [{ id: "s1", ringNo: "P643", status: "Completed" }] }) });
  await repository.refresh("TBM1");
  await repository.mutate({
    entityType: "segment", operation: "create", machine: "TBM1", recordId: "s2",
    payload: { id: "s2", ringNo: "P643", status: "In Progress" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });

  const reloaded = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => { throw new Error("offline"); } });
  const rows = (await reloaded.load("TBM1")).data.segments;
  expect(rows.map(row => row.id).sort()).toEqual(["s1", "s2"]);
  expect(rows.find(row => row.id === "s1").status).toBe("Completed"); // the confirmed record, intact
});

test("a report started before the launch fetch lands does not erase the one already filed", async () => {
  // The worst instance of the same rule, and the hole the deleted cold-launch gate used to cover.
  // On a cleared cache the crew opens the shift report and records a delay bar before the first
  // getData arrives, so the form has no existing report and files a CREATE at version 0. The
  // response then carries the shift's real report — nine engineers, the day's metres, the recorded
  // bars — and the local draft stood in its place: the filed report gone from the cache, the screen
  // showing a three-line draft, and the queue answering `conflict` where nobody would see it.
  const filed = { id: "sr_real", date: "2026-07-30", shift: "Day", tbmNo: "TBM1", manpower: { Engineer: "9" }, result: { totalDistance: "18.20" }, events: {} };
  const repository = createRepository({
    openDb: openOfflineDb,
    fetchServerSnapshot: async () => ({ shiftReports: [filed], syncMeta: { "shiftReport:TBM1:2026-07-30:Day": { version: 6 } } }),
  });
  await repository.mutate({
    entityType: "shiftReport", operation: "create", machine: "TBM1", recordId: "shift_draft",
    payload: { id: "shift_draft", date: "2026-07-30", shift: "Day", manpower: { Engineer: "3" }, result: {}, events: {} },
    baseVersion: 0, domainKey: "shiftReport:TBM1:2026-07-30:Day",
  });

  const ids = (await repository.refresh("TBM1")).data.shiftReports.map(row => row.id).sort();

  expect(ids).toEqual(["shift_draft", "sr_real"]);
  expect((await repository.load("TBM1")).data.shiftReports.map(row => row.id).sort()).toEqual(["shift_draft", "sr_real"]);
});

// Two sheet rows can share a ring identity. That is a supported state, not corruption — it is why
// the cache keys per row and why five views run `deduplicateRecords` — and a mutation is always
// about ONE of them. Matching by ring instead of by row took the crew's edit to the wrong record.
const twoRowsOnOneRing = [
  { id: "seg_a", ringNo: "P643", installType: "Permanent", length: "1.40" },
  { id: "seg_b", ringNo: "P643", installType: "Permanent", length: "1.41" },
];

test("an offline edit of one of two rows sharing a ring does not displace the other", async () => {
  // matching by ring replaced the FIRST row's key with the edited row's optimistic copy: seg_a
  // disappeared entirely, seg_b was listed twice, and the crew's own edit was the copy the view's
  // dedupe then threw away — so the edit was invisible AND another ring's row was gone.
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: twoRowsOnOneRing }) });
  await repository.refresh("TBM1");
  await repository.mutate({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "seg_b",
    payload: { id: "seg_b", ringNo: "P643", installType: "Permanent", length: "9.99" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });

  const reloaded = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => { throw new Error("offline"); } });
  const rows = (await reloaded.load("TBM1")).data.segments;
  expect(rows.map(row => row.id).sort()).toEqual(["seg_a", "seg_b"]);
  expect(rows.find(row => row.id === "seg_b").length).toBe("9.99");
  expect(rows.find(row => row.id === "seg_a").length).toBe("1.40");
});

test("both rows of one ring can hold a queued edit at once", async () => {
  // The optimistic copy used to be keyed by DOMAIN, so a ring carrying two rows had one slot for
  // both: the second queued write overwrote the first, and the snapshot list ended up naming that
  // single key twice — the same record rendered twice while the other one was gone. Two rows on one
  // ring is a state the sheet allows and this app supports, so the local copy has to represent it.
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: twoRowsOnOneRing }) });
  await repository.refresh("TBM1");
  for (const [recordId, length] of [["seg_a", "7.77"], ["seg_b", "9.99"]]) {
    await repository.mutate({
      entityType: "segment", operation: "update", machine: "TBM1", recordId,
      payload: { id: recordId, ringNo: "P643", installType: "Permanent", length }, baseVersion: 0,
      domainKey: "segment:TBM1:P643:Permanent",
    });
  }

  const reloaded = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => { throw new Error("offline"); } });
  const rows = (await reloaded.load("TBM1")).data.segments;

  expect(rows.map(row => row.id).sort()).toEqual(["seg_a", "seg_b"]);
  expect(rows.find(row => row.id === "seg_a").length).toBe("7.77");
  expect(rows.find(row => row.id === "seg_b").length).toBe("9.99");
});

test("recording a ring and then editing the row already there keeps both", async () => {
  // the sequence that reached the duplicate: a create appends its own key, and the edit that follows
  // must take the row it names rather than the create's slot
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: [{ id: "s1", ringNo: "P643", status: "Completed" }] }) });
  await repository.refresh("TBM1");
  await repository.mutate({
    entityType: "segment", operation: "create", machine: "TBM1", recordId: "s2",
    payload: { id: "s2", ringNo: "P643", status: "In Progress" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });
  await repository.mutate({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "s1",
    payload: { id: "s1", ringNo: "P643", status: "Edited" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });

  const reloaded = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => { throw new Error("offline"); } });
  const rows = (await reloaded.load("TBM1")).data.segments;

  expect(rows.map(row => row.id).sort()).toEqual(["s1", "s2"]);
  expect(rows.find(row => row.id === "s1").status).toBe("Edited");
});

test("a refresh keeps every queued edit of a ring, not just one of them", async () => {
  // The store learned to key per record; the MERGE still answered per ring, so it kept one local
  // copy for the whole ring and dropped the rest — their keys left the snapshot and
  // `previousKeys.forEach(delete)` removed their queued rows while the mutations were still pending.
  // A durably-queued write, destroyed by an ordinary refresh.
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: twoRowsOnOneRing }) });
  await repository.refresh("TBM1");
  for (const [recordId, length] of [["seg_a", "7.77"], ["seg_b", "9.99"]]) {
    await repository.mutate({
      entityType: "segment", operation: "update", machine: "TBM1", recordId,
      payload: { id: recordId, ringNo: "P643", installType: "Permanent", length }, baseVersion: 0,
      domainKey: "segment:TBM1:P643:Permanent",
    });
  }

  const rows = (await repository.refresh("TBM1")).data.segments;

  expect(rows.find(row => row.id === "seg_a").length).toBe("7.77");
  expect(rows.find(row => row.id === "seg_b").length).toBe("9.99");
  expect(rows.every(row => row.syncStatus === "pending")).toBe(true);
});

test("an edit of one row does not cancel the pending delete of another", async () => {
  // The tombstone was looked up per ring in a map that keeps the NEWEST mutation, so any later write
  // anywhere on that ring evicted the delete and the row came back — into the data log, the
  // dashboards and the shift report's ring count, badged as ordinary data, until the queue drained
  // and removed it again. The ordinary correction sequence reaches it: delete the duplicate row,
  // then fix the one you kept.
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: twoRowsOnOneRing }) });
  await repository.refresh("TBM1");
  await repository.mutate({
    entityType: "segment", operation: "delete", machine: "TBM1", recordId: "seg_a",
    payload: { id: "seg_a", ringNo: "P643", installType: "Permanent" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });
  expect((await repository.refresh("TBM1")).data.segments.map(row => row.id)).toEqual(["seg_b"]);

  await repository.mutate({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "seg_b",
    payload: { id: "seg_b", ringNo: "P643", installType: "Permanent", length: "9.99" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });

  expect((await repository.refresh("TBM1")).data.segments.map(row => row.id)).toEqual(["seg_b"]);
  expect((await repository.load("TBM1")).data.segments.map(row => row.id)).toEqual(["seg_b"]);
});

test("an edit whose row another device removed does not displace a row that is still there", async () => {
  // Two rows share ring P643. The crew edits seg_b offline; meanwhile another device removes seg_b
  // from the sheet. The next answer carries only seg_a — and painting the crew's edit onto it would
  // show their change on a record they never touched AND take a real row off screen. The edit keeps
  // its own place instead: it is unsynced work, and dropping it would lose it.
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: twoRowsOnOneRing }) });
  await repository.refresh("TBM1");
  await repository.mutate({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "seg_b",
    payload: { id: "seg_b", ringNo: "P643", installType: "Permanent", length: "9.99" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });

  const sheetWithoutB = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: [twoRowsOnOneRing[0]] }) });
  const rows = (await sheetWithoutB.refresh("TBM1")).data.segments;

  expect(rows.map(row => row.id).sort()).toEqual(["seg_a", "seg_b"]);
  expect(rows.find(row => row.id === "seg_a").length).toBe("1.40"); // untouched by someone else's edit
  expect(rows.find(row => row.id === "seg_b").length).toBe("9.99"); // the crew's own work, still theirs
});

test("an edit of a row the sheet returned without an id reads the same before and after a refresh", async () => {
  // The snapshot key patch and the refresh overlay both decide which row a queued edit is about, and
  // they have to decide the same way. The patch used to hand an update a row that carried no id —
  // the only row it could not possibly have named — while the overlay refused to. One record then
  // showed as one row on a relaunch and two after a refresh: the flicker both rules exist to stop.
  const sheet = [{ ringNo: "P643", length: "1.40" }]; // a legacy row, no id
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: sheet }) });
  await repository.refresh("TBM1");
  await repository.mutate({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "seg_x",
    payload: { id: "seg_x", ringNo: "P643", installType: "Permanent", length: "9.99" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });

  const onRelaunch = (await createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => { throw new Error("offline"); } }).load("TBM1")).data.segments;
  const onRefresh = (await repository.refresh("TBM1")).data.segments;

  expect(onRelaunch.map(row => row.length).sort()).toEqual(["1.40", "9.99"]);
  expect(onRefresh.map(row => row.length).sort()).toEqual(["1.40", "9.99"]);
});

test("a pending edit of one row does not bring back its long-deleted neighbour", async () => {
  // A row's entity survives its key leaving the snapshot, and the merge re-injects local rows whose
  // sheet row is missing — so an ordinary pending edit of the SURVIVOR dragged the deleted row back
  // with it. Back in the data log badged as the crew's own queued work, counted by the dashboards
  // and the shift report's ring total, and last in the list, where the record form can adopt it as
  // the open ring and stamp the next save with a row id the sheet no longer has.
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: twoRowsOnOneRing }) });
  await repository.refresh("TBM1");
  const removal = await repository.mutate({
    entityType: "segment", operation: "delete", machine: "TBM1", recordId: "seg_a",
    payload: { id: "seg_a", ringNo: "P643", installType: "Permanent" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });
  await repository.applySyncSuccess(removal.requestId, {
    requestId: removal.requestId, status: "success",
    record: { id: "seg_a", deleted: true }, version: 2, updatedAt: "2026-07-30T02:00:00.000Z",
  });
  // and now an ordinary offline edit of the row that is still there
  await repository.mutate({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "seg_b",
    payload: { id: "seg_b", ringNo: "P643", installType: "Permanent", length: "9.99" }, baseVersion: 2,
    domainKey: "segment:TBM1:P643:Permanent",
  });

  const sheetWithoutA = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: [twoRowsOnOneRing[1]] }) });
  expect((await sheetWithoutA.refresh("TBM1")).data.segments.map(row => row.id)).toEqual(["seg_b"]);
  expect((await sheetWithoutA.load("TBM1")).data.segments.map(row => row.id)).toEqual(["seg_b"]);
  // and its row is gone from the store, not merely unlisted: a key removed from a snapshot list was
  // never deleted afterwards, because a refresh only deletes what the PREVIOUS snapshot named
  const db = await openOfflineDb();
  const keys = await new Promise((resolve, reject) => {
    const request = db.transaction("entities").objectStore("entities").getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  expect(keys.filter(key => String(key).includes("seg_a"))).toEqual([]);
});

test("another device's deletion does not come back through this device's pending edit", async () => {
  // The same re-injection without any local delete at all, so no orphan cleanup is involved: the
  // other row's entity is a perfectly ordinary cached server row. A pending edit of the survivor
  // must speak only for the row it names — the merge is not entitled to bring its neighbour along.
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: twoRowsOnOneRing }) });
  await repository.refresh("TBM1");
  await repository.mutate({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "seg_b",
    payload: { id: "seg_b", ringNo: "P643", installType: "Permanent", length: "9.99" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });

  // another device removes seg_a; this device never queued anything about it
  const sheetWithoutA = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: [twoRowsOnOneRing[1]] }) });

  expect((await sheetWithoutA.refresh("TBM1")).data.segments.map(row => row.id)).toEqual(["seg_b"]);
});

test("a confirmed delete of one row does not hide its neighbour", async () => {
  // the confirmed half of the tombstone names a row exactly as the pending half does; ignoring which
  // row it named took both off screen, on a device whose crew asked for neither
  let releaseFetch;
  const repository = createRepository({
    openDb: openOfflineDb,
    fetchServerSnapshot: async () => new Promise(resolve => { releaseFetch = () => resolve({ segments: twoRowsOnOneRing }); }),
  });
  await repository.mutate({
    entityType: "segment", operation: "delete", machine: "TBM1", recordId: "seg_a",
    payload: { id: "seg_a", ringNo: "P643", installType: "Permanent" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });
  const queued = (await repository.getDueMutations(Date.now()))[0];

  const refreshing = repository.refresh("TBM1");
  await repository.applySyncSuccess(queued.requestId, {
    requestId: queued.requestId, status: "success",
    record: { id: "seg_a", deleted: true }, version: 2, updatedAt: "2026-07-30T02:00:00.000Z",
  });
  releaseFetch();

  expect((await refreshing).data.segments.map(row => row.id)).toEqual(["seg_b"]);
});

test("deleting one of two rows sharing a ring keeps the other", async () => {
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: twoRowsOnOneRing }) });
  await repository.refresh("TBM1");
  await repository.mutate({
    entityType: "segment", operation: "delete", machine: "TBM1", recordId: "seg_a",
    payload: { id: "seg_a", ringNo: "P643", installType: "Permanent" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });

  // on the relaunch...
  const reloaded = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: twoRowsOnOneRing }) });
  expect((await reloaded.load("TBM1")).data.segments.map(row => row.id)).toEqual(["seg_b"]);
  // ...and on the refresh that still returns both rows from the sheet
  expect((await reloaded.refresh("TBM1")).data.segments.map(row => row.id)).toEqual(["seg_b"]);
});

test("a delete does not take away a row the sheet returned without an id", async () => {
  // The sheet can hand back a row with no id — the cache keys those by position for exactly that
  // reason — and a delete that names a record cannot be matched to one. Removing it anyway takes a
  // record off screen nobody asked to delete, and the two halves of the rule disagreed about it:
  // the relaunch kept the row and the refresh dropped it, so it flickered away and came back.
  const sheet = [{ id: "seg_a", ringNo: "P643" }, { ringNo: "P643", length: "9.9" }];
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: sheet }) });
  await repository.refresh("TBM1");
  await repository.mutate({
    entityType: "segment", operation: "delete", machine: "TBM1", recordId: "seg_a",
    payload: { id: "seg_a", ringNo: "P643" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });

  const onRefresh = (await repository.refresh("TBM1")).data.segments;
  const onRelaunch = (await createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => { throw new Error("offline"); } }).load("TBM1")).data.segments;
  expect(onRefresh.map(row => row.length || null)).toEqual(["9.9"]);
  expect(onRelaunch.map(row => row.length || null)).toEqual(["9.9"]);
});

test("a version the server confirmed outlives the tab that heard it", async () => {
  // `confirmedVersions` in App is React state. A backgrounded PWA that gets killed — an eight hour
  // shift on a phone — comes back knowing only what the last full getData carried, so the next edit
  // of a record this device already wrote would claim the version from before its own write. The
  // server answers `conflict` for a row nobody else touched and that conflict blocks the record's
  // domain, with nothing on screen to show it.
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: [{ id: "s1", ringNo: "P643" }], syncMeta: {} }) });
  await repository.refresh("TBM1");
  const queued = await repository.mutate({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "s1",
    payload: { id: "s1", ringNo: "P643", status: "Completed" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });
  await repository.applySyncSuccess(queued.requestId, {
    requestId: queued.requestId, status: "success",
    record: { id: "s1", ringNo: "P643" }, version: 1, updatedAt: "2026-07-30T02:00:00.000Z",
  });

  const reloaded = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => { throw new Error("offline"); } });
  const { syncMeta } = (await reloaded.load("TBM1")).data;
  expect(syncMeta["segment:TBM1:P643:Permanent"]).toMatchObject({ version: 1 });
});

test("a ring confirmed while the launch fetch was in flight is not wiped by it", async () => {
  // The cold launch starts both at once: the provider starts the runner and `useOfflineData` starts
  // the refresh. The getData answer is composed on the server BEFORE the drain lands and written
  // AFTER it, so writing it wholesale threw away the rings the crew recorded through an offline
  // shift — they reached the sheet and then vanished from the data log, the dashboards, the reports
  // and the "Last:" indicator, until some later refresh that underground may be the next shift.
  // Worse than the disappearance: with the ring off the list the record form re-offers it, and
  // re-recording it is a create against live metadata, which the server refuses as a conflict.
  let releaseFetch;
  const repository = createRepository({
    openDb: openOfflineDb,
    // an injected clock, because the rule under test is an ORDERING: on the real clock the request
    // and the confirmation can land in the same millisecond, and then the comparison passes or fails
    // by luck rather than by the rule — a full inversion of it survived two runs in three
    now: advancingClock(),
    // the answer describes the sheet as it was BEFORE the queued ring reached it
    fetchServerSnapshot: async () => new Promise(resolve => { releaseFetch = () => resolve({ segments: [{ id: "s0", ringNo: "P499" }], syncMeta: {} }); }),
  });
  const queued = await repository.mutate({
    entityType: "segment", operation: "create", machine: "TBM1", recordId: "s1",
    payload: { id: "s1", ringNo: "P500" }, baseVersion: 0,
    domainKey: "segment:TBM1:P500:Permanent",
  });

  const refreshing = repository.refresh("TBM1");
  // the drain lands while the fetch is still out
  await repository.applySyncSuccess(queued.requestId, {
    requestId: queued.requestId, status: "success",
    record: { id: "s1", ringNo: "P500" }, version: 1, updatedAt: "2026-07-30T02:00:00.000Z",
  });
  releaseFetch();
  const refreshed = await refreshing;

  expect(refreshed.data.segments.map(row => row.ringNo).sort()).toEqual(["P499", "P500"]);
  // and the version it confirmed is not replaced by the older map that answer carried
  expect(refreshed.data.syncMeta["segment:TBM1:P500:Permanent"]).toMatchObject({ version: 1 });
  expect((await repository.load("TBM1")).data.segments.map(row => row.ringNo).sort()).toEqual(["P499", "P500"]);
});

test("a ring deleted while the launch fetch was in flight does not come back", async () => {
  // The mirror of the create case above, and the one that was missed. A confirmed delete has no
  // optimistic row left to describe, so nothing in the merge objected to the answer — composed
  // before the delete — putting the ring back, into the stored snapshot, surviving the relaunch.
  // On screen it is then counted by the data logs, the dashboards and the shift report's derived
  // ring count and distance, and the record form offers the ring after it: a skipped ring number.
  let releaseFetch;
  const repository = createRepository({
    openDb: openOfflineDb,
    now: advancingClock(), // an ordering rule needs a clock that orders — see the create case above
    fetchServerSnapshot: async () => new Promise(resolve => { releaseFetch = () => resolve({ segments: [{ id: "s0", ringNo: "P499" }, { id: "s1", ringNo: "P500" }], syncMeta: {} }); }),
  });
  await repository.mutate({
    entityType: "segment", operation: "delete", machine: "TBM1", recordId: "s1",
    payload: { id: "s1", ringNo: "P500" }, baseVersion: 0,
    domainKey: "segment:TBM1:P500:Permanent",
  });
  const queued = (await repository.getDueMutations(Date.now()))[0];

  const refreshing = repository.refresh("TBM1");
  await repository.applySyncSuccess(queued.requestId, {
    requestId: queued.requestId, status: "success",
    record: { id: "s1", deleted: true }, version: 2, updatedAt: "2026-07-30T02:00:00.000Z",
  });
  releaseFetch();
  const refreshed = await refreshing;

  expect(refreshed.data.segments.map(row => row.ringNo)).toEqual(["P499"]);
  expect((await repository.load("TBM1")).data.segments.map(row => row.ringNo)).toEqual(["P499"]);
});

test("recording a ring again after deleting it is accepted, not refused", async () => {
  // A tombstone is not inert: GAS compares a create's base against it like any other version, so a
  // create at 0 is refused for a ring whose only record was deleted. That is the ordinary "delete
  // the bad row and record it again" correction — and it is the remedy the app prescribes when it
  // refuses to re-identify a record in place, so it has to work. Claiming the tombstone's own
  // version is what lifts it.
  const repository = createRepository({
    openDb: openOfflineDb,
    fetchServerSnapshot: async () => ({ segments: [], syncMeta: { "segment:TBM1:P500:Permanent": { version: 2, deleted: true } } }),
  });
  const { data } = await repository.refresh("TBM1");

  const envelope = buildMutationEnvelope({
    entityType: "segment", operation: "create", machine: "TBM1", recordId: "seg_new",
    payload: { id: "seg_new", ringNo: "P500", installType: "Permanent" }, syncMeta: data.syncMeta,
  });

  expect(envelope.baseVersion).toBe(2); // matches the tombstone, so the server revives the key
  await expect(repository.mutate(envelope)).resolves.toMatchObject({ status: "pending" });
});

test("re-recording a ring this device just deleted works without waiting for a refresh", async () => {
  // The same correction, done the way a crew underground actually does it: delete, then record it
  // again, with no link in between. The tombstone this device produced has to be remembered as a
  // tombstone — remembering only its version would make the create claim it as if the key were
  // live, and remembering nothing would send 0 and be refused.
  const repository = createRepository({
    openDb: openOfflineDb,
    fetchServerSnapshot: async () => ({ segments: [{ id: "s1", ringNo: "P500" }], syncMeta: { "segment:TBM1:P500:Permanent": { version: 1 } } }),
  });
  await repository.refresh("TBM1");
  const queued = await repository.mutate({
    entityType: "segment", operation: "delete", machine: "TBM1", recordId: "s1",
    payload: { id: "s1", ringNo: "P500" }, baseVersion: 1,
    domainKey: "segment:TBM1:P500:Permanent",
  });
  await repository.applySyncSuccess(queued.requestId, {
    requestId: queued.requestId, status: "success",
    record: { id: "s1", deleted: true }, version: 2, updatedAt: "2026-07-30T02:00:00.000Z",
  });

  const { data } = await repository.load("TBM1"); // no refresh: still underground
  expect(buildMutationEnvelope({
    entityType: "segment", operation: "create", machine: "TBM1", recordId: "seg_new",
    payload: { id: "seg_new", ringNo: "P500", installType: "Permanent" }, syncMeta: data.syncMeta,
  }).baseVersion).toBe(2);
});

test("a refresh does not walk a stored version backwards", async () => {
  // The persistent half of the version merge, and the one that matters more: it survives the
  // relaunch. This device confirms version 5; a getData composed earlier carries 2; keeping 2 means
  // the next edit claims 2, the server answers `conflict` for a row nobody else touched, and that
  // conflict parks at the head of the ring's domain with no UI until Task 10.
  const repository = createRepository({
    openDb: openOfflineDb,
    now: () => "2026-07-30T02:00:00.000Z",
    fetchServerSnapshot: async () => ({ segments: [{ id: "s1", ringNo: "P643" }], syncMeta: { "segment:TBM1:P643:Permanent": { version: 2 } } }),
  });
  await repository.refresh("TBM1");
  const queued = await repository.mutate({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "s1",
    payload: { id: "s1", ringNo: "P643", status: "Completed" }, baseVersion: 2,
    domainKey: "segment:TBM1:P643:Permanent",
  });
  await repository.applySyncSuccess(queued.requestId, {
    requestId: queued.requestId, status: "success",
    record: { id: "s1", ringNo: "P643" }, version: 5, updatedAt: "2026-07-30T02:00:00.000Z",
  });

  // the same older answer arrives again
  const refreshed = await repository.refresh("TBM1");

  expect(refreshed.data.syncMeta["segment:TBM1:P643:Permanent"]).toMatchObject({ version: 5 });
  expect((await repository.load("TBM1")).data.syncMeta["segment:TBM1:P643:Permanent"]).toMatchObject({ version: 5 });
});

test("a confirmed edit leaves the key live, so the next record for that ring still conflicts", async () => {
  // the tombstone flag has two sides. Marking a key deleted when it is not would hand the NEXT
  // create the live version — and GAS reads a create whose base matches as a post-conflict
  // successor, applying it onto the row already there.
  const repository = createRepository({
    openDb: openOfflineDb,
    fetchServerSnapshot: async () => ({ segments: [{ id: "s1", ringNo: "P643" }], syncMeta: { "segment:TBM1:P643:Permanent": { version: 2 } } }),
  });
  await repository.refresh("TBM1");
  const queued = await repository.mutate({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "s1",
    payload: { id: "s1", ringNo: "P643", status: "Completed" }, baseVersion: 2,
    domainKey: "segment:TBM1:P643:Permanent",
  });
  await repository.applySyncSuccess(queued.requestId, {
    requestId: queued.requestId, status: "success",
    record: { id: "s1", ringNo: "P643" }, version: 3, updatedAt: "2026-07-30T02:00:00.000Z",
  });

  const { data } = await repository.load("TBM1");
  expect(data.syncMeta["segment:TBM1:P643:Permanent"]).toMatchObject({ version: 3, deleted: false });
  expect(buildMutationEnvelope({
    entityType: "segment", operation: "create", machine: "TBM1", recordId: "seg_other",
    payload: { id: "seg_other", ringNo: "P643", installType: "Permanent" }, syncMeta: data.syncMeta,
  }).baseVersion).toBe(0);
});

test("a confirmed version does not walk backwards, and does not leak to the other machine", async () => {
  // Two rules on the write that makes a confirmation outlive the tab. A confirmation can land after
  // a getData that already knew a later version — writing the older one back would make the next
  // edit claim it and be refused. And it belongs to ONE machine's snapshot: cross-machine
  // contamination is this project's most-repeated defect, and a foreign key here grows the other
  // machine's snapshot forever.
  const repository = createRepository({
    openDb: openOfflineDb,
    fetchServerSnapshot: async machine => ({ segments: [], syncMeta: machine === "TBM1" ? { "segment:TBM1:P643:Permanent": { version: 9 } } : {} }),
  });
  await repository.refresh("TBM1");
  await repository.refresh("TBM2");
  const queued = await repository.mutate({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "s1",
    payload: { id: "s1", ringNo: "P643", status: "Completed" }, baseVersion: 9,
    domainKey: "segment:TBM1:P643:Permanent",
  });

  // the server answers with an OLDER version than the snapshot already holds
  await repository.applySyncSuccess(queued.requestId, {
    requestId: queued.requestId, status: "success",
    record: { id: "s1", ringNo: "P643" }, version: 4, updatedAt: "2026-07-30T02:00:00.000Z",
  });

  expect((await repository.load("TBM1")).data.syncMeta["segment:TBM1:P643:Permanent"]).toMatchObject({ version: 9 });
  expect((await repository.load("TBM2")).data.syncMeta["segment:TBM1:P643:Permanent"]).toBeUndefined();
});

test("an edit stays an edit, whatever this device believes about the key", async () => {
  // An update onto a tombstoned key is refused by the server (SYNC_RECORD_DELETED, terminal). This
  // file briefly rewrote such an update into a CREATE to get around that, and the create was worse:
  // GAS merges a create onto an existing row only when the metadata is ALIVE, so against a tombstone
  // it appended a second row with the same record id and none of the fields the payload did not
  // carry. `operation` is also a row-identity input to the local merge, so the rewrite made an
  // ordinary edit look like a create there and let it overwrite a neighbouring row.
  //
  // The refusal stays visible in the status strip; silent duplication would not be. The real fix is
  // a server change, recorded in `mutationEnvelope.js`.
  const repository = createRepository({
    openDb: openOfflineDb,
    fetchServerSnapshot: async () => ({
      segments: twoRowsOnOneRing,
      syncMeta: { "segment:TBM1:P643:Permanent": { version: 1, deleted: true } },
    }),
  });
  const { data } = await repository.refresh("TBM1");

  expect(buildMutationEnvelope({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "seg_b",
    payload: { id: "seg_b", ringNo: "P643", installType: "Permanent", length: "9.99" }, syncMeta: data.syncMeta,
  })).toMatchObject({ operation: "update", baseVersion: 1, recordId: "seg_b", domainKey: "segment:TBM1:P643:Permanent" });
});

test("a version confirmed for a machine never fetched still outlives the tab", async () => {
  // TBM2 on a fresh install has no snapshot at all, and both the key patch and the confirmed-version
  // write need a scope to write into. The key patch creates one when the record is queued, so by the
  // time this confirmation lands there IS a scope — which means `patchSnapshotSyncMeta`'s own
  // bootstrap is belt and braces here and cannot be pinned separately. It earns its place with Task
  // 9's project-wide entities, which the key patch does not scope.
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => { throw new Error("offline"); } });
  const queued = await repository.mutate({
    entityType: "segment", operation: "create", machine: "TBM2", recordId: "s1",
    payload: { id: "s1", ringNo: "P1" }, baseVersion: 0, domainKey: "segment:TBM2:P1:Permanent",
  });
  await repository.applySyncSuccess(queued.requestId, {
    requestId: queued.requestId, status: "success",
    record: { id: "s1", ringNo: "P1" }, version: 1, updatedAt: "2026-07-30T02:00:00.000Z",
  });

  const reloaded = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => { throw new Error("offline"); } });
  expect((await reloaded.load("TBM2")).data.syncMeta["segment:TBM2:P1:Permanent"]).toMatchObject({ version: 1 });
});

test("a row this crew deleted is not put back by an edit of its neighbour", async () => {
  // The crew deletes row A while another device has already taken it off the sheet, and edits row B.
  // The response carries only B — so A has no incoming row, its local copy is preserved, and without
  // the pending-delete check it would be re-injected onto the screen badged as queued work, after
  // the crew asked for it to be gone.
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: twoRowsOnOneRing }) });
  await repository.refresh("TBM1");
  await repository.mutate({
    entityType: "segment", operation: "delete", machine: "TBM1", recordId: "seg_a",
    payload: { id: "seg_a", ringNo: "P643", installType: "Permanent" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });

  const sheetWithoutA = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: [twoRowsOnOneRing[1]] }) });
  expect((await sheetWithoutA.refresh("TBM1")).data.segments.map(row => row.id)).toEqual(["seg_b"]);
});

test("a ring another crew still holds is not quietly taken over by a second record", async () => {
  // the same lookup, the other answer: a LIVE key means someone else's row is there, and claiming
  // its version would tell GAS to merge this record onto theirs
  const repository = createRepository({
    openDb: openOfflineDb,
    fetchServerSnapshot: async () => ({ segments: [], syncMeta: { "segment:TBM1:P500:Permanent": { version: 2, deleted: false } } }),
  });
  const { data } = await repository.refresh("TBM1");

  expect(buildMutationEnvelope({
    entityType: "segment", operation: "create", machine: "TBM1", recordId: "seg_new",
    payload: { id: "seg_new", ringNo: "P500", installType: "Permanent" }, syncMeta: data.syncMeta,
  }).baseVersion).toBe(0);
});

test("a slower earlier refresh does not overwrite the cache a later one already wrote", async () => {
  // A quick machine switch back and forth is enough to have two out at once. `useOfflineData` drops
  // the stale answer from React state, but the snapshot write happens underneath it — so a relaunch
  // in between found the older sheet, with the rows another device added since missing.
  const answers = { first: null, second: null };
  const repository = createRepository({
    openDb: openOfflineDb,
    fetchServerSnapshot: async () => new Promise(resolve => {
      if (!answers.first) { answers.first = () => resolve({ segments: [{ id: "s1", ringNo: "P100" }] }); return; }
      answers.second = () => resolve({ segments: [{ id: "s1", ringNo: "P100" }, { id: "s2", ringNo: "P101" }] });
    }),
  });

  const earlier = repository.refresh("TBM1");
  const later = repository.refresh("TBM1");
  answers.second();          // the newer request finishes first
  await later;
  answers.first();           // and the older one lands afterwards
  await earlier;

  expect((await repository.load("TBM1")).data.segments.map(row => row.ringNo)).toEqual(["P100", "P101"]);
});

test("a phone whose clock has never been set still builds its offline snapshot", async () => {
  // The overtaken guard compares two stamps, and its sentinel for "no previous request" was `0` —
  // which `Date.parse` reads as the string "0", i.e. the year 2000. A site phone that boots to
  // epoch after a flat battery therefore looked overtaken on the FIRST refresh of every machine,
  // read a snapshot that did not exist yet, and threw on it: the crew is told the server is
  // unreachable when it answered fine, and the offline cache this whole task exists for is never
  // written at all.
  let tick = 0;
  const repository = createRepository({
    openDb: openOfflineDb,
    now: () => new Date(Date.parse("1998-01-01T00:00:00.000Z") + (tick++ * 1000)).toISOString(),
    fetchServerSnapshot: async () => ({ segments: [{ id: "s1", ringNo: "P644" }] }),
  });

  const refreshed = await repository.refresh("TBM1");

  expect(refreshed.data.segments.map(row => row.ringNo)).toEqual(["P644"]);
  expect((await repository.load("TBM1")).data.segments.map(row => row.ringNo)).toEqual(["P644"]);
});

test("an overtaking refresh that could not write its cache does not leave the earlier one with nothing", async () => {
  // `lastCompletedRequest` is per repository INSTANCE, so this has to happen inside one: the newer
  // request has to record itself and then fail, and the older one has to arrive after it. Building a
  // second repository — which is what this test did — makes the map empty and the whole rule moot.
  const pending = [];
  const repository = createRepository({
    openDb: openOfflineDb,
    // only the newer request's write fails, the way quota or private browsing would
    writeServerSnapshot: async (db, machine, data, fetchedAt, requestedAt) => {
      if (data.segments.length === 2) throw new Error("QuotaExceededError");
      return defaultWrite(db, machine, data, fetchedAt, requestedAt);
    },
    fetchServerSnapshot: async () => new Promise(resolve => pending.push(resolve)),
  });

  const earlier = repository.refresh("TBM1");
  const later = repository.refresh("TBM1");
  pending[1]({ segments: [{ id: "s1", ringNo: "P644" }, { id: "s2", ringNo: "P645" }] }); // newer, fails to write
  await later;
  pending[0]({ segments: [{ id: "s1", ringNo: "P644" }] });                               // older, arrives after
  const result = await earlier;

  // The rule this pins: a request only counts as "the newest" once its answer is actually in the
  // cache. Recorded before the write instead, the failed newer request would have made this one
  // stand aside for a snapshot nobody ever produced — and the crew would be told the server is
  // unreachable while it was answering fine.
  expect(result.source).toBe("server");
  expect((await repository.load("TBM1")).data.segments.map(row => row.ringNo)).toEqual(["P644"]);
});

test("a clock that steps backwards does not resurrect a deleted ring", async () => {
  // A phone waking after an eight-hour shift can have its clock corrected backwards, and two of this
  // module's rules are orderings between a request going out and a write being confirmed. A
  // confirmation stamped before the request that preceded it made the refresh keep a ring the crew
  // had deleted — it comes back to the data log, the dashboards and the shift report's ring count.
  const steps = ["2026-07-30T02:00:10.000Z", "2026-07-30T02:00:05.000Z", "2026-07-30T02:00:04.000Z"];
  let tick = 0;
  let releaseFetch;
  const repository = createRepository({
    openDb: openOfflineDb,
    now: () => steps[Math.min(tick++, steps.length - 1)],
    fetchServerSnapshot: async () => new Promise(resolve => { releaseFetch = () => resolve({ segments: [{ id: "s1", ringNo: "P200" }] }); }),
  });
  await repository.mutate({
    entityType: "segment", operation: "delete", machine: "TBM1", recordId: "s1",
    payload: { id: "s1", ringNo: "P200" }, baseVersion: 0, domainKey: "segment:TBM1:P200:Permanent",
  });
  const queued = (await repository.getDueMutations(Date.now()))[0];

  const refreshing = repository.refresh("TBM1");
  await repository.applySyncSuccess(queued.requestId, {
    requestId: queued.requestId, status: "success",
    record: { id: "s1", deleted: true }, version: 2, updatedAt: "2026-07-30T02:00:00.000Z",
  });
  releaseFetch();

  expect((await refreshing).data.segments).toEqual([]);
});

test("a delete the server refused stops hiding the row", async () => {
  // the tombstone must last exactly as long as the delete is still on its way. A delete GAS refused
  // is not on its way to anything: leaving the row hidden takes it off this device's every screen
  // while it sits on the sheet, permanently, with nothing to see and nothing to press.
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: [{ id: "s1", ringNo: "P643" }] }) });
  await repository.refresh("TBM1");
  const queued = await repository.mutate({
    entityType: "segment", operation: "delete", machine: "TBM1", recordId: "s1",
    payload: { id: "s1", ringNo: "P643" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });
  await repository.updateMutation(queued.requestId, {
    status: "validation_error",
    lastError: { code: "VALIDATION", fields: ["recordId"], message: "refused" },
  });

  const refreshed = await repository.refresh("TBM1");
  expect(refreshed.data.segments.map(row => row.ringNo)).toContain("P643");
});

test("a ring deleted offline stays deleted after a relaunch with no server", async () => {
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: [{ id: "s1", ringNo: "P643" }] }) });
  await repository.refresh("TBM1");
  await repository.mutate({
    entityType: "segment", operation: "delete", machine: "TBM1", recordId: "s1",
    payload: { id: "s1", ringNo: "P643" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });

  const reloaded = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => { throw new Error("offline"); } });
  const rings = (await reloaded.load("TBM1")).data.segments.map(row => row.ringNo);
  expect(rings).not.toContain("P643");
});

test("a ring deleted offline does not come back on the refresh that still returns it", async () => {
  // the other half of the same defect, and the one that bites first: the queue drains behind the
  // read, so the very next refresh — the one that reconnects — still gets the row from the sheet.
  // Overlaying the optimistic copy onto it put the deleted ring straight back on screen.
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: [{ id: "s1", ringNo: "P643" }] }) });
  await repository.refresh("TBM1");
  await repository.mutate({
    entityType: "segment", operation: "delete", machine: "TBM1", recordId: "s1",
    payload: { id: "s1", ringNo: "P643" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });

  const refreshed = await repository.refresh("TBM1");
  expect(refreshed.data.segments.map(row => row.ringNo)).not.toContain("P643");
  // and it is still gone after the relaunch that follows
  expect((await repository.load("TBM1")).data.segments.map(row => row.ringNo)).not.toContain("P643");
});

test("refresh returns and emits the pending entity preserved by snapshot storage", async () => {
  const db = await openOfflineDb();
  const repository = createRepository({ openDb: async () => db, fetchServerSnapshot: jest.fn().mockResolvedValue({ segments: [{ ringNo: "P1", status: "server" }] }) });
  await repository.refresh("TBM1");
  const entity = await new Promise((resolve, reject) => { const request = db.transaction("entities").objectStore("entities").getAll(); request.onsuccess = () => resolve(request.result[0]); request.onerror = () => reject(request.error); });
  await new Promise((resolve, reject) => { const transaction = db.transaction("mutations", "readwrite"); transaction.objectStore("mutations").put({ requestId: "m1", status: "pending", domainKey: entity.domainKey }); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
  const result = await repository.refresh("TBM1");
  expect(result.data.segments).toEqual([expect.objectContaining({ ringNo: "P1", status: "server", syncStatus: "pending" })]);
});
