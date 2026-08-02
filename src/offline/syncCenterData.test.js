import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));
import { deleteOfflineDbForTests, openOfflineDb } from "./db";
import { buildMutationEnvelope } from "./mutationEnvelope";
import { createRepository } from "./repository";

beforeEach(async () => { await deleteOfflineDbForTests(); });
afterEach(async () => { await deleteOfflineDbForTests(); });

let nextId = 0;
function makeRepository(overrides = {}) {
  return createRepository({
    openDb: openOfflineDb, now: () => "2026-08-02T00:00:00.000Z", getDeviceId: async () => "device-1",
    createRequestId: () => `request-${++nextId}`, ...overrides,
  });
}

const segment = (ringNo, extra = {}) => buildMutationEnvelope({
  entityType: "segment", operation: "update", machine: "TBM1", recordId: `seg-${ringNo}`,
  payload: { ringNo, installType: "Permanent" }, syncMeta: { [`segment:TBM1:${ringNo}:Permanent`]: { version: 1 } }, ...extra,
});

test("the Sync Center is given every queued write, grouped by what the crew can do about it", async () => {
  // Four tabs, four questions: what is on its way, what was refused, what disagrees with the server,
  // what has landed. Each row has to name the record — Step 4: "Never hide the record identifier,
  // machine, entity type, or request ID in diagnostic detail."
  const repository = makeRepository();
  const onItsWay = await repository.mutate(segment("P1"));
  const refused = await repository.mutate(segment("P2"));
  const landed = await repository.mutate(segment("P3"));
  await repository.updateMutation(refused.requestId, { status: "validation_error", nextAttemptAt: null, lastError: { code: "VALIDATION", message: "ring ไม่ถูกต้อง" } });
  await repository.applySyncSuccess(landed.requestId, { status: "success", version: 2, record: { id: "seg-P3", ringNo: "P3" } });

  const view = await repository.getSyncCenter();

  expect(view.pending.map(row => row.recordId)).toEqual(["seg-P1"]);
  expect(view.errors.map(row => row.recordId)).toEqual(["seg-P2"]);
  expect(view.recent.map(row => row.recordId)).toEqual(["seg-P3"]);
  expect(view.conflicts).toEqual([]);
  const [row] = view.pending;
  expect(row).toEqual(expect.objectContaining({
    requestId: onItsWay.requestId, entityType: "segment", machine: "TBM1", domainKey: "segment:TBM1:P1:Permanent",
  }));
  expect(view.errors[0].lastError.message).toBe("ring ไม่ถูกต้อง");
});

test("a conflict is listed with both sides so the crew can compare them field by field", async () => {
  const repository = makeRepository();
  const queued = await repository.mutate(segment("P4"));
  await repository.applyConflict(queued.requestId, {
    status: "conflict", currentVersion: 7,
    serverRecord: { id: "seg-P4", ringNo: "P4", grade: "B" },
  });

  const view = await repository.getSyncCenter();

  expect(view.conflicts).toHaveLength(1);
  expect(view.conflicts[0]).toEqual(expect.objectContaining({
    requestId: queued.requestId, entityType: "segment", recordId: "seg-P4", currentVersion: 7,
  }));
  expect(view.conflicts[0].serverRecord).toEqual(expect.objectContaining({ grade: "B" }));
  expect(view.conflicts[0].localRecord).toEqual(expect.objectContaining({ ringNo: "P4" }));
});

test("a record stranded behind a stuck one is listed as stuck, not as on its way", async () => {
  // The same rule `getSyncCounts` already applies to the numbers: the queue orders per record, so
  // everything behind a refused head is never posted. Showing it under "กำลังส่ง" would be a lie the
  // crew acts on.
  const repository = makeRepository();
  const head = await repository.mutate(segment("P5"));
  await repository.mutate(segment("P5"));
  await repository.updateMutation(head.requestId, { status: "permanent_error", nextAttemptAt: null, lastError: { code: "PERMANENT", message: "ถูกปฏิเสธ" } });

  const view = await repository.getSyncCenter();

  expect(view.pending).toEqual([]);
  expect(view.blocked.map(row => row.recordId)).toEqual(["seg-P5"]);
});

test("the recent list is newest first and bounded", async () => {
  const repository = makeRepository();
  for (let index = 0; index < 3; index += 1) {
    const queued = await repository.mutate(segment(`R${index}`));
    await repository.applySyncSuccess(queued.requestId, { status: "success", version: index + 1, record: { id: `seg-R${index}` } });
  }

  const view = await repository.getSyncCenter({ recentLimit: 2 });

  expect(view.recent.map(row => row.recordId)).toEqual(["seg-R2", "seg-R1"]);
});

test("discarding a stuck write drops it from the queue and says so on the record", async () => {
  // The only destructive action the Sync Center has, and it is per record. The write is gone from
  // the queue — it will never be posted — so what is left has to say that happened rather than look
  // like it synced: a crew reading "ส่งแล้ว" for a ring they threw away would stop looking for it.
  const repository = makeRepository();
  const queued = await repository.mutate(segment("P9"));
  await repository.updateMutation(queued.requestId, { status: "permanent_error", nextAttemptAt: null, lastError: { code: "PERMANENT", message: "ถูกปฏิเสธ" } });

  await repository.discardMutation(queued.requestId);

  const view = await repository.getSyncCenter();
  expect(view.errors).toEqual([]);
  expect(view.pending).toEqual([]);
  expect(view.recent.map(r => r.recordId)).toEqual([]); // discarded is not "sent"
  expect(view.discarded.map(r => r.recordId)).toEqual(["seg-P9"]);
});

test("a write still on its way cannot be discarded by accident", async () => {
  // Discard exists for a write nothing can move. A pending one is still going to be sent, and
  // dropping it would take a record off the sheet's future with no trace on this device.
  const repository = makeRepository();
  const queued = await repository.mutate(segment("P10"));

  await expect(repository.discardMutation(queued.requestId)).rejects.toThrow(/ยังไม่ติดค้าง|not stuck/);
});

test("discarded writes are pruned with the confirmed ones rather than kept for ever", async () => {
  // A discarded mutation is finished with — never claimable, never counted, on no screen but the
  // discarded list. Left out of the prune it would be the one row class that grows without bound on
  // a phone that is never reinstalled. The window is 200, so 260 rows proves the sweep reaches them.
  const repository = makeRepository({ fetchServerSnapshot: async machine => ({ status: "success", segments: [], machine }) });
  const db = await openOfflineDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("mutations", "readwrite");
    const store = transaction.objectStore("mutations");
    for (let index = 0; index < 260; index += 1) {
      store.put({
        requestId: `discarded-${index}`, status: "discarded", queueSequence: index,
        entityType: "segment", operation: "update", machine: "TBM1", recordId: `seg-D${index}`,
        domainKey: `segment:TBM1:D${index}:Permanent`, payload: {}, createdAtLocal: "2026-08-02T00:00:00.000Z",
      });
    }
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  // no db.close(): the repository shares this connection, and closing it here would make its own
  // reads fail rather than test anything

  await repository.refresh("TBM1"); // the sweep runs with the snapshot write

  const view = await repository.getSyncCenter();
  expect(view.discarded.length).toBe(200);
});
