import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));
import { deleteOfflineDbForTests, openOfflineDb } from "./db";
import { createRepository } from "./repository";

beforeEach(async () => { await deleteOfflineDbForTests(); });
afterEach(async () => { await deleteOfflineDbForTests(); });

const segmentInput = {
  entityType: "segment", operation: "update", machine: "TBM1", recordId: "segment-1", baseVersion: 2,
  payload: { ringNo: "P1", installType: "Permanent", status: "local" },
};

function makeRepository(overrides = {}) {
  return createRepository({
    openDb: openOfflineDb, now: () => "2026-07-29T00:00:00.000Z", getDeviceId: async () => "device-1",
    createRequestId: () => "request-1", ...overrides,
  });
}

test("mutate stores the optimistic entity before emitting and never posts to transport", async () => {
  const transport = { postSyncMutation: jest.fn() };
  const repository = makeRepository({ transport });
  const events = [];
  repository.subscribe(event => events.push(event));

  const queued = await repository.mutate(segmentInput);

  expect(queued).toEqual(expect.objectContaining({ requestId: "request-1", status: "pending", optimisticRecord: expect.objectContaining({ syncStatus: "pending" }) }));
  await expect(repository.getMutation(queued.requestId)).resolves.toMatchObject({ status: "pending", deviceId: "device-1" });
  expect(events).toEqual([expect.objectContaining({ type: "mutation", requestId: "request-1" })]);
  expect(transport.postSyncMutation).not.toHaveBeenCalled();
});

test("a synced mutation replaces its optimistic entity with the confirmed server record", async () => {
  const repository = makeRepository();
  const queued = await repository.mutate(segmentInput);
  const confirmed = { recordId: "segment-1", entityType: "segment", machine: "TBM1", domainKey: queued.optimisticRecord.domainKey, version: 3, status: "confirmed" };

  await repository.applySyncSuccess(queued.requestId, { requestId: queued.requestId, status: "success", record: confirmed, version: 3, updatedAt: "2026-07-29T01:00:00.000Z" });

  await expect(repository.getMutation(queued.requestId)).resolves.toMatchObject({ status: "synced" });
  await expect(repository.getEntity(confirmed.domainKey)).resolves.toMatchObject({ payload: expect.objectContaining({ status: "confirmed", version: 3, syncStatus: "synced" }) });
});

test("conflict resolution preserves the audit record and uses currentVersion for a local retry", async () => {
  const repository = makeRepository({ createRequestId: jest.fn().mockReturnValueOnce("request-1").mockReturnValueOnce("request-2") });
  const queued = await repository.mutate(segmentInput);
  await repository.applyConflict(queued.requestId, {
    status: "conflict", requestId: queued.requestId, serverRecord: { recordId: "segment-1", entityType: "segment", machine: "TBM1", domainKey: queued.optimisticRecord.domainKey, status: "server" },
    localRecord: queued.optimisticRecord, conflictingFields: ["status"], currentVersion: 9,
  });

  await expect(repository.resolveConflict(queued.requestId, { strategy: "local" })).resolves.toEqual(expect.objectContaining({ status: "pending", requestId: "request-2" }));
  await expect(repository.getConflict(queued.requestId)).resolves.toMatchObject({ status: "resolved", strategy: "local", before: expect.any(Object), after: expect.any(Object) });
  await expect(repository.getMutation("request-2")).resolves.toMatchObject({ baseVersion: 9, status: "pending" });
});
