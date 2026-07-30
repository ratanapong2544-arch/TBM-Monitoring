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

test("a stored conflict keeps the server time and device holding that version", async () => {
  const repository = makeRepository();
  const queued = await repository.mutate(segmentInput);

  await repository.applyConflict(queued.requestId, {
    status: "conflict", requestId: queued.requestId,
    serverRecord: { recordId: "segment-1", domainKey: queued.optimisticRecord.domainKey, status: "server" },
    localRecord: queued.optimisticRecord, conflictingFields: ["status"], currentVersion: 9,
    currentUpdatedAt: "2026-07-29T02:00:00.000Z", currentUpdatedByDevice: "device-office",
  });

  // design §9 shows server time and device label beside the local save time
  await expect(repository.getConflict(queued.requestId)).resolves.toMatchObject({
    currentUpdatedAt: "2026-07-29T02:00:00.000Z",
    currentUpdatedByDevice: "device-office",
    createdAt: "2026-07-29T00:00:00.000Z",
  });
});

test("a confirmed record keeps the device that wrote the server version", async () => {
  const repository = makeRepository();
  const queued = await repository.mutate(segmentInput);
  const confirmed = { recordId: "segment-1", domainKey: queued.optimisticRecord.domainKey, status: "confirmed" };

  await repository.applySyncSuccess(queued.requestId, {
    requestId: queued.requestId, status: "success", record: confirmed, version: 3,
    updatedAt: "2026-07-29T01:00:00.000Z", updatedByDevice: "device-1",
  });

  await expect(repository.getEntity(confirmed.domainKey)).resolves.toMatchObject({
    payload: expect.objectContaining({ updatedByDevice: "device-1", syncStatus: "synced" }),
  });
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

test.each([
  [{ ...segmentInput, domainKey: "segment:TBM1:wrong:Permanent" }, "canonical domain key"],
  [{ ...segmentInput, machine: "" }, "machine"],
  [{ ...segmentInput, payload: { ...segmentInput.payload, ringNo: "" } }, "ringNo"],
  [{ ...segmentInput, baseVersion: null }, "baseVersion"],
  [{ ...segmentInput, entityType: "shiftReport", payload: { date: "2026-07-29" } }, "shift"],
  [{ ...segmentInput, entityType: "issue", recordId: "" }, "recordId"],
  [{ entityType: "dailyReport", operation: "create", recordId: "d1", payload: { date: "2026-07-29" } }, "machine"],
  [{ entityType: "prepTask", operation: "create", recordId: "p1", payload: { title: "Prep" } }, "machine"],
])("rejects malformed mutation envelope field %s", async (input, field) => {
  await expect(makeRepository().mutate(input)).rejects.toThrow(field);
});

test.each([
  ["shiftReport", { date: "2026-07-29", shift: "Day" }],
  ["planConfig", { target: 4 }],
  ["instrument", {}],
  ["instSchedule", {}],
])("refuses a delete GAS has no action for: %s", async (entityType, payload) => {
  // a queued mutation GAS rejects parks a terminal validation_error at the domain head and blocks
  // every later mutation on that key, so it must never reach the queue
  const input = { entityType, operation: "delete", machine: "TBM1", recordId: "r1", baseVersion: 1, payload };
  await expect(makeRepository().mutate(input)).rejects.toThrow(/not supported/);
});

test("a terminal validation error is retried as a successor with a fresh request id", async () => {
  // re-sending the original requestId would replay the stored terminal response from the GAS
  // idempotency ledger forever, so the retry must be a new request
  const repository = makeRepository({ createRequestId: jest.fn().mockReturnValueOnce("request-1").mockReturnValueOnce("request-2") });
  const queued = await repository.mutate(segmentInput);
  await repository.updateMutation(queued.requestId, { status: "validation_error", nextAttemptAt: null, lastError: { code: "SYNC_META_ORPHAN" } });

  const retried = await repository.retryMutation(queued.requestId);

  expect(retried).toMatchObject({ requestId: "request-2", status: "pending", attemptCount: 0, lastError: null, domainKey: queued.optimisticRecord.domainKey });
  await expect(repository.getMutation("request-1")).resolves.toMatchObject({ status: "resolved", strategy: "retry", resolutionRequestId: "request-2" });
  await expect(repository.retryMutation("request-1")).rejects.toThrow(/not a retryable error/);
});

test("a retry with a corrected payload keeps the same record identity", async () => {
  const repository = makeRepository({ createRequestId: jest.fn().mockReturnValueOnce("request-1").mockReturnValueOnce("request-2") });
  const queued = await repository.mutate(segmentInput);
  await repository.updateMutation(queued.requestId, { status: "validation_error", nextAttemptAt: null, lastError: { code: "SYNC_FIELD_TOO_LARGE" } });

  await expect(repository.retryMutation(queued.requestId, { payload: { ...segmentInput.payload, ringNo: "P9" } }))
    .rejects.toThrow(/changes the record identity/);
  await expect(repository.retryMutation(queued.requestId, { payload: { ...segmentInput.payload, status: "shortened" } }))
    .resolves.toMatchObject({ payload: expect.objectContaining({ status: "shortened" }) });
});

test("a manual resolution cannot retarget a different record", async () => {
  const repository = makeRepository({ createRequestId: jest.fn().mockReturnValueOnce("request-1").mockReturnValueOnce("request-2") });
  const queued = await repository.mutate(segmentInput);
  await repository.applyConflict(queued.requestId, {
    status: "conflict", requestId: queued.requestId, serverRecord: { recordId: "segment-1", domainKey: queued.optimisticRecord.domainKey },
    localRecord: queued.optimisticRecord, conflictingFields: ["status"], currentVersion: 9,
  });

  await expect(repository.resolveConflict(queued.requestId, { strategy: "manual", payload: { ringNo: "P9", installType: "Permanent" } }))
    .rejects.toThrow(/changes the record identity/);
});

test("a legacy staged conflict reports why it cannot be resolved through the queue", async () => {
  const repository = makeRepository();
  const db = await openOfflineDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("conflicts", "readwrite");
    transaction.objectStore("conflicts").put({ conflictId: "legacy:tbmIssues:issue:GLOBAL:i1", status: "open", reason: "legacy_local_difference", domainKey: "issue:GLOBAL:i1" });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });

  await expect(repository.resolveConflict("legacy:tbmIssues:issue:GLOBAL:i1", { strategy: "server" }))
    .rejects.toThrow(/no mutation to resolve/);
});

test("refuses an unknown entity type outright", async () => {
  await expect(makeRepository().mutate({ ...segmentInput, entityType: "mystery" })).rejects.toThrow(/unsupported entityType/);
});

test("allows a create with canonical ring identity and no baseVersion", async () => {
  const repository = makeRepository();
  await expect(repository.mutate({ entityType: "segment", operation: "create", machine: "TBM1", recordId: "segment-new", payload: { ringNo: "P2", installType: "Permanent" } }))
    .resolves.toEqual(expect.objectContaining({ status: "pending", optimisticRecord: expect.objectContaining({ domainKey: "segment:TBM1:P2:Permanent" }) }));
});

test.each(["pending", "validation_error", "conflict"])("keeps a newer %s optimistic record when an older same-domain mutation succeeds", async status => {
  const ids = jest.fn().mockReturnValueOnce("request-1").mockReturnValueOnce("request-2");
  const repository = makeRepository({ createRequestId: ids });
  const first = await repository.mutate(segmentInput);
  const second = await repository.mutate({ ...segmentInput, payload: { ...segmentInput.payload, status: `newer-${status}` } });
  if (status !== "pending") await repository.updateMutation(second.requestId, { status });

  await repository.applySyncSuccess(first.requestId, { requestId: first.requestId, status: "success", record: { recordId: "segment-1", entityType: "segment", machine: "TBM1", domainKey: first.optimisticRecord.domainKey, status: "confirmed" }, version: 3, updatedAt: "2026-07-29T01:00:00.000Z" });

  await expect(repository.getEntity(first.optimisticRecord.domainKey)).resolves.toMatchObject({ payload: expect.objectContaining({ status: `newer-${status}`, syncStatus: status }) });
});

test.each([
  ["local", undefined, "local"],
  ["manual", { ringNo: "P1", installType: "Permanent", status: "manual" }, "manual"],
])("resolves a %s conflict atomically into a terminal original and current-version successor", async (strategy, payload, expectedStatus) => {
  const ids = jest.fn().mockReturnValueOnce("request-1").mockReturnValueOnce("request-2");
  const repository = makeRepository({ createRequestId: ids });
  const original = await repository.mutate(segmentInput);
  await repository.applyConflict(original.requestId, {
    status: "conflict", requestId: original.requestId, serverRecord: { recordId: "segment-1", entityType: "segment", machine: "TBM1", domainKey: original.optimisticRecord.domainKey, status: "server" },
    localRecord: original.optimisticRecord, conflictingFields: ["status"], currentVersion: 9,
  });

  const result = await repository.resolveConflict(original.requestId, { strategy, payload });

  expect(result).toEqual({ status: "pending", requestId: "request-2" });
  await expect(repository.getMutation(original.requestId)).resolves.toMatchObject({ status: "resolved", resolvedAt: expect.any(String), strategy, resolutionRequestId: "request-2" });
  await expect(repository.getConflict(original.requestId)).resolves.toMatchObject({ status: "resolved", strategy, resolvedAt: expect.any(String), resolutionRequestId: "request-2", before: expect.any(Object), after: expect.any(Object) });
  await expect(repository.getMutation("request-2")).resolves.toMatchObject({ status: "pending", baseVersion: 9, payload: expect.objectContaining({ status: expectedStatus }) });
});
