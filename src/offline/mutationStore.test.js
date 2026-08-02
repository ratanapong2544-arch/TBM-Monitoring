import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));
import { closeOfflineDb, deleteOfflineDbForTests, openOfflineDb } from "./db";
import { hidesRecord } from "./schema";
import { claimDueMutations, getConflict, getEntity, getMutation, getSyncCounts, listDueMutations, putOptimisticMutation, splitByBlocked, updateMutation } from "./mutationStore";

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

  await expect(listDueMutations(db, Date.parse(mutation.createdAtLocal))).resolves.toEqual([expect.objectContaining({ requestId: "request-z" })]);
  await updateMutation(db, "request-z", { status: "synced" });
  await expect(listDueMutations(db, Date.parse(mutation.createdAtLocal))).resolves.toEqual([expect.objectContaining({ requestId: "request-a" })]);
});

test("claims pending work for one owner and only permits takeover after lease expiry", async () => {
  const db = await openOfflineDb();
  await putOptimisticMutation(db, mutation);

  await expect(claimDueMutations(db, { owner: "runner-a", now: 0, leaseMs: 100 })).resolves.toEqual([expect.objectContaining({ requestId: "request-1", syncOwner: "runner-a", leaseExpiresAt: new Date(100).toISOString() })]);
  await expect(claimDueMutations(db, { owner: "runner-b", now: 99, leaseMs: 100 })).resolves.toEqual([]);
  await expect(claimDueMutations(db, { owner: "runner-b", now: 101, leaseMs: 100 })).resolves.toEqual([expect.objectContaining({ requestId: "request-1", syncOwner: "runner-b" })]);
});

test("keeps a permanent error as the nonterminal head until a future explicit resolution exists", async () => {
  const db = await openOfflineDb();
  await putOptimisticMutation(db, mutation);
  await putOptimisticMutation(db, { ...mutation, requestId: "request-2", payload: { ...mutation.payload, status: "later" } });
  await updateMutation(db, mutation.requestId, { status: "permanent_error" });

  await expect(listDueMutations(db, Date.parse(mutation.createdAtLocal))).resolves.toEqual([]);
  await expect(claimDueMutations(db, { owner: "runner-a", now: Date.parse(mutation.createdAtLocal), leaseMs: 100 })).resolves.toEqual([]);
  await expect(getMutation(db, "request-2")).resolves.toMatchObject({ status: "pending" });
});

test("a queued write behind a stuck head is blocked whether or not it is already travelling", async () => {
  // The button's count and the panel's list were two filters over two different sets — the button
  // from PENDING alone, the panel from PENDING or SYNCING. Round-tripping through a repository
  // cannot show the difference, because a SYNCING row cannot share a domain with a stuck one today;
  // the helper can be asked directly, and that is what makes the rule pinnable at all.
  const rows = [
    { requestId: "a", status: "conflict", domainKey: "segment:TBM1:P1:Permanent" },
    { requestId: "b", status: "pending", domainKey: "segment:TBM1:P1:Permanent" },
    { requestId: "c", status: "syncing", domainKey: "segment:TBM1:P1:Permanent" },
    { requestId: "d", status: "pending", domainKey: "segment:TBM1:P2:Permanent" },
    { requestId: "e", status: "syncing", domainKey: "segment:TBM1:P2:Permanent" },
  ];

  const split = splitByBlocked(rows, new Set(["segment:TBM1:P1:Permanent"]));

  expect(split.blocked.map(row => row.requestId)).toEqual(["b", "c"]);
  expect(split.moving.map(row => row.requestId)).toEqual(["d", "e"]);
});

test("the status button's blocked count comes from the same split as the panel's list", async () => {
  // `getSyncCounts` had its own PENDING-only filter; re-inlining one leaves every repository-level
  // test green, because the runner cannot put a SYNCING row behind a stuck head. The store can, so
  // the counts can be asked directly — which is the only way this rule is pinnable at all.
  const db = await openOfflineDb();
  const head = { ...mutation, requestId: "req-head", recordId: "segment-1" };
  const behind = { ...mutation, requestId: "req-behind", recordId: "segment-1" };
  await putOptimisticMutation(db, head);
  await putOptimisticMutation(db, behind);
  await updateMutation(db, head.requestId, { status: "conflict", nextAttemptAt: null });
  await updateMutation(db, behind.requestId, { status: "syncing" });

  await expect(getSyncCounts(db)).resolves.toMatchObject({ blocked: 1, pending: 0 });
});

test("a queued delete hides its record on its way and shows it again once it is stuck", () => {
  // The merge and the key restore both ask this, and they asked it differently — one with the
  // status, one without. A delete the server refused is not on its way to anything, and keeping the
  // row hidden would take it off this device's every screen while it sits on the sheet.
  expect(hidesRecord({ operation: "delete", status: "pending" })).toBe(true);
  expect(hidesRecord({ operation: "delete", status: "syncing" })).toBe(true);
  expect(hidesRecord({ operation: "delete", status: "permanent_error" })).toBe(false);
  expect(hidesRecord({ operation: "delete", status: "conflict" })).toBe(false);
  expect(hidesRecord({ operation: "update", status: "pending" })).toBe(false);
  expect(hidesRecord(null)).toBe(false);
});

test("a row that cannot move is counted once, not as travelling as well", async () => {
  // The button adds `travellingCount` and `stuckCount` together. Counting SYNCING outside the split
  // left the one row that could appear in both.
  const db = await openOfflineDb();
  const head = { ...mutation, requestId: "req-head-2", recordId: "segment-1" };
  const behind = { ...mutation, requestId: "req-behind-2", recordId: "segment-1" };
  await putOptimisticMutation(db, head);
  await putOptimisticMutation(db, behind);
  await updateMutation(db, head.requestId, { status: "conflict", nextAttemptAt: null });
  await updateMutation(db, behind.requestId, { status: "syncing" });

  await expect(getSyncCounts(db)).resolves.toMatchObject({ syncing: 0, blocked: 1 });
});

test("a delete whose claim has expired is not in flight, so it stops hiding its record", () => {
  // The merge already refused to treat an abandoned claim as in flight, and its comment records that
  // the lease test had been written twice before. A third caller asking without it would let a
  // worker that died mid-post keep a record off every screen on this device.
  const now = Date.parse("2026-08-02T10:00:00.000Z");
  const claimed = { operation: "delete", status: "syncing", leaseExpiresAt: "2026-08-02T10:05:00.000Z" };
  const abandoned = { operation: "delete", status: "syncing", leaseExpiresAt: "2026-08-02T09:55:00.000Z" };

  expect(hidesRecord(claimed, now)).toBe(true);
  expect(hidesRecord(abandoned, now)).toBe(false);
});
