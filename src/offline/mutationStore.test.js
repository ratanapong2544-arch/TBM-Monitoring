import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));
import { closeOfflineDb, deleteOfflineDbForTests, openOfflineDb } from "./db";
import { claimDueMutations, getConflict, getEntity, getMutation, listDueMutations, putOptimisticMutation } from "./mutationStore";

beforeEach(async () => { await deleteOfflineDbForTests(); });
afterEach(async () => { await deleteOfflineDbForTests(); });

const mutation = {
  requestId: "request-1", entityType: "segment", operation: "update", machine: "TBM1",
  recordId: "segment-1", domainKey: "segment:TBM1:P1:Permanent", baseVersion: 3,
  deviceId: "device-1", actorId: null, createdAtLocal: "2026-07-29T00:00:00.000Z",
  payload: { ringNo: "P1", installType: "Permanent", status: "local" },
};

test("stores the optimistic entity and pending mutation atomically", async () => {
  const db = await openOfflineDb();
  await putOptimisticMutation(db, mutation);

  await expect(getMutation(db, mutation.requestId)).resolves.toMatchObject({ status: "pending", attemptCount: 0 });
  await expect(getEntity(db, mutation.domainKey)).resolves.toMatchObject({ payload: expect.objectContaining({ status: "local", syncStatus: "pending" }) });
});

test("persists queued mutations after the database is reopened", async () => {
  const db = await openOfflineDb();
  await putOptimisticMutation(db, mutation);
  closeOfflineDb();

  await expect(getMutation(await openOfflineDb(), mutation.requestId)).resolves.toMatchObject({ requestId: mutation.requestId, status: "pending" });
});

test("reads a stored conflict by its mutation request id", async () => {
  const db = await openOfflineDb();
  await putOptimisticMutation(db, mutation);
  const conflict = { conflictId: mutation.requestId, requestId: mutation.requestId, status: "open", domainKey: mutation.domainKey };
  await new Promise((resolve, reject) => {
    const tx = db.transaction("conflicts", "readwrite");
    tx.objectStore("conflicts").put(conflict);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });

  await expect(getConflict(db, mutation.requestId)).resolves.toEqual(conflict);
});

test("preserves insertion order for same-domain mutations created in the same millisecond", async () => {
  const db = await openOfflineDb();
  await putOptimisticMutation(db, { ...mutation, requestId: "request-z" });
  await putOptimisticMutation(db, { ...mutation, requestId: "request-a", payload: { ...mutation.payload, status: "later" } });

  await expect(listDueMutations(db, Date.parse(mutation.createdAtLocal))).resolves.toEqual([
    expect.objectContaining({ requestId: "request-z" }),
    expect.objectContaining({ requestId: "request-a" }),
  ]);
});

test("claims pending work for one owner and only permits takeover after lease expiry", async () => {
  const db = await openOfflineDb();
  await putOptimisticMutation(db, mutation);

  await expect(claimDueMutations(db, { owner: "runner-a", now: 0, leaseMs: 100 })).resolves.toEqual([expect.objectContaining({ requestId: "request-1", syncOwner: "runner-a", leaseExpiresAt: new Date(100).toISOString() })]);
  await expect(claimDueMutations(db, { owner: "runner-b", now: 99, leaseMs: 100 })).resolves.toEqual([]);
  await expect(claimDueMutations(db, { owner: "runner-b", now: 101, leaseMs: 100 })).resolves.toEqual([expect.objectContaining({ requestId: "request-1", syncOwner: "runner-b" })]);
});
