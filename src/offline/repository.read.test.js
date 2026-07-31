import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));
import { deleteOfflineDbForTests, openOfflineDb } from "./db";
import { createRepository } from "./repository";
import { ApiFailure } from "./apiTransport";

beforeEach(async () => { await deleteOfflineDbForTests(); });
afterEach(async () => { await deleteOfflineDbForTests(); });

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

test("a ring created offline over a row the server already has does not appear twice", async () => {
  // the crew records a ring the sheet turns out to already hold — a second device got there first,
  // or the row predates sync. One ring, one line: a duplicate here reads as two rings erected.
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: [{ id: "s1", ringNo: "P643" }] }) });
  await repository.refresh("TBM1");
  await repository.mutate({
    entityType: "segment", operation: "create", machine: "TBM1", recordId: "s2",
    payload: { id: "s2", ringNo: "P643", status: "In Progress" }, baseVersion: 0,
    domainKey: "segment:TBM1:P643:Permanent",
  });

  const reloaded = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => { throw new Error("offline"); } });
  expect((await reloaded.load("TBM1")).data.segments.filter(row => row.ringNo === "P643")).toHaveLength(1);
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
