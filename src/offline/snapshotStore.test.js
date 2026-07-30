import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));
import { deleteOfflineDbForTests, openOfflineDb } from "./db";
import { confirmMutation, putOptimisticMutation, updateMutation } from "./mutationStore";
import { readServerSnapshot, writeServerSnapshot } from "./snapshotStore";
import { normalizeServerData } from "./normalizeServerData";

beforeEach(async () => { await deleteOfflineDbForTests(); });
afterEach(async () => { await deleteOfflineDbForTests(); });

test("persists and reconstructs a normalized snapshot with metadata", async () => {
  const db = await openOfflineDb();
  const data = normalizeServerData({ segments: [{ ringNo: "P1" }], planConfig: { rings: 1 }, routeConfigs: { TBM1: { route: "A" } } }, "TBM1");
  await writeServerSnapshot(db, "TBM1", data, "2026-07-29T00:00:00.000Z");
  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({ ...data, fetchedAt: "2026-07-29T00:00:00.000Z" }));
  const snapshot = await new Promise((resolve, reject) => { const request = db.transaction("snapshots").objectStore("snapshots").get("getData:TBM1"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  expect(snapshot.entityKeys.segments).toHaveLength(1);
  expect(snapshot.planConfig).toEqual({ rings: 1 });
});

test("preserves a pending optimistic entity by domain key when server data arrives", async () => {
  const db = await openOfflineDb();
  const first = normalizeServerData({ segments: [{ ringNo: "P1", status: "local", syncStatus: "pending" }] }, "TBM1");
  await writeServerSnapshot(db, "TBM1", first, "first");
  await writeServerSnapshot(db, "TBM1", normalizeServerData({ segments: [{ ringNo: "P1", status: "server" }, { ringNo: "P2" }] }, "TBM1"), "second");
  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({ segments: expect.arrayContaining([expect.objectContaining({ ringNo: "P1", status: "local", syncStatus: "pending" }), expect.objectContaining({ ringNo: "P2" })]) }));
});

test("preserves an entity referenced by a pending mutation domain key", async () => {
  const db = await openOfflineDb();
  await writeServerSnapshot(db, "TBM1", normalizeServerData({ segments: [{ ringNo: "P1", status: "local" }] }, "TBM1"), "first");
  const entity = await new Promise((resolve, reject) => { const request = db.transaction("entities").objectStore("entities").getAll(); request.onsuccess = () => resolve(request.result[0]); request.onerror = () => reject(request.error); });
  await new Promise((resolve, reject) => { const transaction = db.transaction("mutations", "readwrite"); transaction.objectStore("mutations").put({ requestId: "m1", status: "pending", domainKey: entity.domainKey }); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
  await writeServerSnapshot(db, "TBM1", normalizeServerData({ segments: [{ ringNo: "P1", status: "server" }] }, "TBM1"), "second");
  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({ segments: [expect.objectContaining({ ringNo: "P1", status: "local", syncStatus: "pending" })] }));
});

test("keeps an offline-created project-wide record after a refresh", async () => {
  // an optimistic record is stamped with its mutation's machine (GLOBAL here), a server-derived one
  // with the active machine; comparing those labels dropped the local record from the list
  const db = await openOfflineDb();
  await putOptimisticMutation(db, {
    requestId: "m-issue", entityType: "issue", operation: "create", machine: null, recordId: "i-local",
    domainKey: "issue:GLOBAL:i-local", baseVersion: 0, deviceId: "device-1",
    createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { id: "i-local", title: "Offline issue" },
  });

  await writeServerSnapshot(db, "TBM1", normalizeServerData({ issues: [{ id: "i-server", title: "Server issue" }] }, "TBM1"), "after");

  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({
    issues: expect.arrayContaining([
      expect.objectContaining({ id: "i-local", syncStatus: "pending" }),
      expect.objectContaining({ id: "i-server" }),
    ]),
  }));
});

test("keeps an offline instrument edit instead of letting the server value win", async () => {
  // the snapshot collection label must match the sync entity name, or the optimistic record keys
  // differently from the incoming server record and is silently replaced on every refresh
  const db = await openOfflineDb();
  await writeServerSnapshot(db, "TBM1", normalizeServerData({ instInstruments: [{ id: "in1", installStatus: "pending" }] }, "TBM1"), "first");
  await putOptimisticMutation(db, {
    requestId: "m-inst", entityType: "instrument", operation: "update", machine: null, recordId: "in1",
    domainKey: "instrument:GLOBAL:in1", baseVersion: 1, deviceId: "device-1",
    createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { id: "in1", installStatus: "installed" },
  });

  await writeServerSnapshot(db, "TBM1", normalizeServerData({ instInstruments: [{ id: "in1", installStatus: "pending" }] }, "TBM1"), "second");

  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({
    instInstruments: [expect.objectContaining({ id: "in1", installStatus: "installed", syncStatus: "pending" })],
  }));
});

test("does not pull another machine's unsynced ring record into this machine's list", async () => {
  const db = await openOfflineDb();
  await putOptimisticMutation(db, {
    requestId: "m-seg-tbm2", entityType: "segment", operation: "create", machine: "TBM2", recordId: "s-tbm2",
    domainKey: "segment:TBM2:P9:Permanent", baseVersion: 0, deviceId: "device-1",
    createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { id: "s-tbm2", ringNo: "P9", installType: "Permanent" },
  });

  await writeServerSnapshot(db, "TBM1", normalizeServerData({ segments: [{ ringNo: "P1" }] }, "TBM1"), "after");

  const snapshot = await readServerSnapshot(db, "TBM1");
  expect(snapshot.segments.map(record => record.ringNo)).toEqual(["P1"]);
});

test("each overlapping write returns its own committed snapshot even when a later write wins the database", async () => {
  const db = await openOfflineDb();
  const originalTransaction = db.transaction.bind(db);
  const first = normalizeServerData({ segments: [{ ringNo: "P1", status: "first" }] }, "TBM1");
  const second = normalizeServerData({ segments: [{ ringNo: "P2", status: "second" }] }, "TBM1");
  let secondWrite;
  let intercepted = false;
  db.transaction = (stores, mode) => {
    if (!intercepted && mode === "readonly" && Array.from(stores).includes("snapshots")) {
      intercepted = true;
      secondWrite = writeServerSnapshot(db, "TBM1", second, "second");
    }
    return originalTransaction(stores, mode);
  };

  const firstResult = await writeServerSnapshot(db, "TBM1", first, "first");
  await secondWrite;

  expect(firstResult).toEqual(expect.objectContaining({ fetchedAt: "first", segments: [expect.objectContaining({ ringNo: "P1", status: "first" })] }));
  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({ fetchedAt: "second", segments: [expect.objectContaining({ ringNo: "P2", status: "second" })] }));
});

test("returns no snapshot before one has been written", async () => {
  await expect(readServerSnapshot(await openOfflineDb(), "TBM1")).resolves.toBeNull();
});

test.each(["syncing", "validation_error", "conflict"])("preserves a %s optimistic entity when server data refreshes", async status => {
  const db = await openOfflineDb();
  const mutation = { requestId: `m-${status}`, entityType: "segment", operation: "update", machine: "TBM1", recordId: "segment-1", domainKey: "segment:TBM1:P1:Permanent", baseVersion: 1, deviceId: "device", createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { ringNo: "P1", installType: "Permanent", status: "local" } };
  await putOptimisticMutation(db, mutation);
  await updateMutation(db, mutation.requestId, status === "syncing" ? { status, syncOwner: "runner", leaseExpiresAt: "2099-07-29T01:00:00.000Z" } : { status });

  await writeServerSnapshot(db, "TBM1", normalizeServerData({ segments: [{ ringNo: "P1", status: "server" }] }, "TBM1"), "refresh");

  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({ segments: [expect.objectContaining({ status: "local", syncStatus: status })] }));
});

test.each(["validation_error", "conflict"])("keeps newer %s local state after confirming an older mutation then refreshing", async status => {
  const db = await openOfflineDb();
  const first = { requestId: "m-first", entityType: "segment", operation: "update", machine: "TBM1", recordId: "segment-1", domainKey: "segment:TBM1:P1:Permanent", baseVersion: 1, deviceId: "device", createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { ringNo: "P1", installType: "Permanent", status: "first" } };
  const second = { ...first, requestId: "m-second", payload: { ...first.payload, status: `newer-${status}` } };
  await putOptimisticMutation(db, first);
  await putOptimisticMutation(db, second);
  await updateMutation(db, second.requestId, { status });
  await confirmMutation(db, first.requestId, { record: { status: "server" }, version: 2, updatedAt: "2026-07-29T00:01:00.000Z" });

  await writeServerSnapshot(db, "TBM1", normalizeServerData({ segments: [{ ringNo: "P1", status: "server" }] }, "TBM1"), "refresh");

  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({ segments: [expect.objectContaining({ status: `newer-${status}`, syncStatus: status })] }));
});

test("does not preserve a resolved mutation's optimistic payload during refresh", async () => {
  const db = await openOfflineDb();
  const mutation = { requestId: "m-resolved", entityType: "segment", operation: "update", machine: "TBM1", recordId: "segment-1", domainKey: "segment:TBM1:P1:Permanent", baseVersion: 1, deviceId: "device", createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { ringNo: "P1", installType: "Permanent", status: "local" } };
  await putOptimisticMutation(db, mutation);
  await updateMutation(db, mutation.requestId, { status: "resolved" });

  await writeServerSnapshot(db, "TBM1", normalizeServerData({ segments: [{ ringNo: "P1", status: "server" }] }, "TBM1"), "refresh");

  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({ segments: [expect.objectContaining({ status: "server" })] }));
});
