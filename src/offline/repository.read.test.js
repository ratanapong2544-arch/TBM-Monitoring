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
