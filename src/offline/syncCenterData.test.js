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
