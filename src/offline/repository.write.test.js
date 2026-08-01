import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));
import { deleteOfflineDbForTests, openOfflineDb } from "./db";
import { buildMutationEnvelope } from "./mutationEnvelope";
import { applyOptimisticRow } from "./displayRecord";
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

test("what buildMutationEnvelope produces is what the repository accepts", async () => {
  // The seam nothing crossed. `coreWrites.integration.test.jsx` asserts envelope shapes against a
  // `jest.fn()`, and the one App test that mounts a real repository replaces `mutate` immediately
  // before the write — so an envelope could be shaped in a way the repository refuses outright and
  // every test would still pass. It was: keying an edit on the record's pre-edit identity made
  // `mutate` throw "Mutation domainKey must match canonical domain key" before anything was queued,
  // and a corrected ring number was lost rather than mis-keyed. The rule is that the key travels
  // with the payload, and the only way to know the builder still obeys it is to hand its output to
  // the thing that checks. These are hand-written shapes, not the views' own — the views are
  // covered in `coreWrites.integration.test.jsx`, which cannot see this because its `onMutate` is a
  // `jest.fn()`; between them the payload shapes and the repository's rules are both covered.
  const repository = makeRepository({ createRequestId: (() => { let n = 0; return () => `request-${++n}`; })() });
  const cases = [
    ["segment create", { entityType: "segment", operation: "create", machine: "TBM1", recordId: "seg_1", payload: { id: "seg_1", ringNo: "P41", installType: "Permanent" } }],
    ["segment update", { entityType: "segment", operation: "update", machine: "TBM1", recordId: "seg_1", payload: { id: "seg_1", ringNo: "P41", installType: "Permanent" }, syncMeta: { "segment:TBM1:P41:Permanent": { version: 2 } } }],
    ["segment update, unchanged identity supplied", { entityType: "segment", operation: "update", machine: "TBM1", recordId: "seg_1", payload: { id: "seg_1", ringNo: "P41", installType: "Permanent" }, identity: { ringNo: " p41 ", installType: "Permanent" }, syncMeta: { "segment:TBM1:P41:Permanent": { version: 2 } } }],
    ["segment delete", { entityType: "segment", operation: "delete", machine: "TBM1", recordId: "seg_1", payload: { id: "seg_1", ringNo: "P41", installType: "Permanent" }, syncMeta: { "segment:TBM1:P41:Permanent": { version: 2 } } }],
    ["grout create", { entityType: "grout", operation: "create", machine: "TBM1", recordId: "g_1", payload: { id: "g_1", ringNo: "P41", groutPass: "1st Pass" } }],
    ["grout update", { entityType: "grout", operation: "update", machine: "TBM1", recordId: "g_1", payload: { id: "g_1", ringNo: "P41", groutPass: "1st Pass" }, identity: { ringNo: "P41", groutPass: "1st Pass" }, syncMeta: { "grout:TBM1:P41:1st Pass": { version: 4 } } }],
    ["secondaryGrout create", { entityType: "secondaryGrout", operation: "create", machine: "TBM1", recordId: "sg_1", payload: { id: "sg_1", ringNo: "P41" } }],
    ["secondaryGrout update", { entityType: "secondaryGrout", operation: "update", machine: "TBM1", recordId: "sg_1", payload: { id: "sg_1", ringNo: "P41" }, identity: { ringNo: "P41" }, syncMeta: { "secondaryGrout:TBM1:P41:sg_1": { version: 1 } } }],
    ["shiftReport create", { entityType: "shiftReport", operation: "create", machine: "TBM1", recordId: "sr_1", payload: { id: "sr_1", date: "2026-07-30", shift: "Day" } }],
    ["shiftReport update", { entityType: "shiftReport", operation: "update", machine: "TBM1", recordId: "sr_1", payload: { id: "sr_1", date: "2026-07-29T17:00:00.000Z", shift: "Day" }, syncMeta: { "shiftReport:TBM1:2026-07-30:Day": { version: 7 } } }],
  ];

  for (const [name, input] of cases) {
    const envelope = buildMutationEnvelope(input);
    await expect(Promise.resolve(repository.mutate(envelope)).catch(error => `${name}: ${error.message}`))
      .resolves.toMatchObject({ status: "pending" });
  }
});

test("an edit that re-identifies a record never becomes an envelope at all", async () => {
  // there is no envelope for it to produce: writing under the new key leaves the old key's server
  // metadata alive and pointing at a ring no row carries, which turns the real ring — sequential, so
  // it always arrives eventually — into a terminal SYNC_META_ORPHAN nothing on screen reports
  expect(() => buildMutationEnvelope({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "seg_1",
    payload: { id: "seg_1", ringNo: "P42", installType: "Permanent" },
    identity: { ringNo: "P41", installType: "Permanent" },
    syncMeta: { "segment:TBM1:P41:Permanent": { version: 2 } },
  })).toThrow(expect.objectContaining({ code: "SYNC_REIDENTIFIED_RECORD" }));
});

test("the row on screen after a confirmation is the newest edit, not an older one", async () => {
  // three offline saves on one ring: the first confirms, and what stays on screen must be the third.
  // Taking the oldest outstanding instead would put the crew's second save's values back in front of
  // them, looking like the server had answered with them.
  const repository = makeRepository({ createRequestId: (() => { let n = 0; return () => `request-${++n}`; })() });
  const first = await repository.mutate({ ...segmentInput, payload: { ...segmentInput.payload, status: "first" } });
  await repository.mutate({ ...segmentInput, payload: { ...segmentInput.payload, status: "second" } });
  await repository.mutate({ ...segmentInput, payload: { ...segmentInput.payload, status: "third" } });

  await repository.applySyncSuccess(first.requestId, {
    requestId: first.requestId, status: "success",
    record: { id: "segment-1", domainKey: first.optimisticRecord.domainKey, status: "confirmed" },
    version: 3, updatedAt: "2026-07-29T01:00:00.000Z",
  });

  await expect(repository.getEntity(first.optimisticRecord.domainKey)).resolves.toMatchObject({ payload: expect.objectContaining({ status: "third" }) });
});

test("a second record for one ring is not rebased into an overwrite of the first", async () => {
  // Rebasing keeps an offline chain of EDITS linear. A create is not part of that chain: it claims
  // a version only to lift a tombstone, and handing it the version of a record that now exists tells
  // GAS it is a post-conflict successor — GAS then applies it onto that row and discards its own id,
  // so two rings recorded become one row kept, reported as success. That is the collapse
  // `createBaseVersion` refuses on the way in; the rebase must not undo it on the way out.
  const repository = makeRepository({ createRequestId: (() => { let n = 0; return () => `request-${++n}`; })() });
  const create = input => ({ ...segmentInput, operation: "create", baseVersion: 0, payload: { ...segmentInput.payload, ...input } });
  const first = await repository.mutate(create({ status: "first" }));
  const second = await repository.mutate(create({ status: "second" }));

  await repository.applySyncSuccess(first.requestId, {
    requestId: first.requestId, status: "success",
    record: { id: "segment-1", domainKey: first.optimisticRecord.domainKey },
    version: 1, updatedAt: "2026-07-29T01:00:00.000Z",
  });

  await expect(repository.getMutation(second.requestId)).resolves.toMatchObject({ operation: "create", baseVersion: 0 });
});

test("a record queued behind a confirmed delete claims the version that delete wrote", async () => {
  // the opposite case, and the reason the rule is about the CONFIRMED operation rather than about
  // creates in general: the key really was vacated, and a create at 0 would be refused by the
  // tombstone the delete just left
  const repository = makeRepository({ createRequestId: (() => { let n = 0; return () => `request-${++n}`; })() });
  const remove = await repository.mutate({ ...segmentInput, operation: "delete" });
  const again = await repository.mutate({ ...segmentInput, operation: "create", baseVersion: 0, payload: { ...segmentInput.payload, status: "re-recorded" } });

  await repository.applySyncSuccess(remove.requestId, {
    requestId: remove.requestId, status: "success",
    record: { id: "segment-1", deleted: true },
    version: 3, updatedAt: "2026-07-29T01:00:00.000Z",
  });

  await expect(repository.getMutation(again.requestId)).resolves.toMatchObject({ operation: "create", baseVersion: 3 });
});

test("a mutation the server refused is not quietly rebased under the crew's feet", async () => {
  // rebasing only what is still on its way. A parked conflict is not queued behind anything — it is
  // waiting for someone to resolve it, and its payload was composed against the row state the
  // conflict describes. Moving its base to a version it never saw would apply the crew's eventual
  // choice on top of a different row than the one they were shown.
  const repository = makeRepository({ createRequestId: (() => { let n = 0; return () => `request-${++n}`; })() });
  const first = await repository.mutate(segmentInput);
  const parked = await repository.mutate({ ...segmentInput, payload: { ...segmentInput.payload, status: "parked" } });
  await repository.updateMutation(parked.requestId, { status: "conflict" });

  await repository.applySyncSuccess(first.requestId, {
    requestId: first.requestId, status: "success",
    record: { id: "segment-1", domainKey: first.optimisticRecord.domainKey },
    version: 9, updatedAt: "2026-07-29T01:00:00.000Z",
  });

  await expect(repository.getMutation(parked.requestId)).resolves.toMatchObject({ status: "conflict", baseVersion: 2 });
});

test("a confirmation names the record that moved and the version it moved to", async () => {
  // The PRODUCER side of the seam App reads to keep `baseVersion` fresh. App's half is tested with a
  // hand-built event, and a hand-built event agrees with itself no matter what the repository emits:
  // drop `domainKey` and `version` here and every App test still passes, because nothing else in the
  // suite builds a sync event from the real thing. What breaks in production is silent — the second
  // edit of a record in a session claims the stale version, the server calls it a conflict, and the
  // conflict blocks that record's domain with no UI until Task 10 to show it.
  const repository = makeRepository();
  const queued = await repository.mutate(segmentInput);
  const events = [];
  repository.subscribe(event => events.push(event));

  await repository.applySyncSuccess(queued.requestId, {
    requestId: queued.requestId, status: "success",
    record: { recordId: "segment-1", domainKey: queued.optimisticRecord.domainKey, status: "confirmed" },
    version: 3, updatedAt: "2026-07-29T01:00:00.000Z",
  });

  expect(events).toContainEqual(expect.objectContaining({
    type: "sync",
    requestId: queued.requestId,
    domainKey: "segment:TBM1:P1:Permanent",
    version: 3,
    deleted: false,
  }));
});

test("keeping the server's copy of a refused delete leaves the record, and the key, alive", async () => {
  // `resolveConflict("server")` replays the confirm path with the SERVER's record, so the crew's
  // original operation no longer describes the outcome. Reading "was this a delete?" off the
  // operation there did two things: it removed from the screen the very row the crew chose to keep,
  // and it marked the key as a tombstone at that version — so the NEXT record for that ring claimed
  // the version, and GAS reads a create whose base matches as a post-conflict successor and applies
  // it onto the live row. The collapse the create rule exists to prevent, through the back door.
  const repository = makeRepository({ createRequestId: (() => { let n = 0; return () => `request-${++n}`; })() });
  const queued = await repository.mutate({ ...segmentInput, operation: "delete" });
  await repository.applyConflict(queued.requestId, {
    requestId: queued.requestId, status: "conflict",
    serverRecord: { id: "segment-1", ringNo: "P1", installType: "Permanent", status: "server" },
    localRecord: segmentInput.payload, conflictingFields: ["status"], currentVersion: 7,
  });
  const conflictId = (await repository.getMutation(queued.requestId)).requestId;
  const events = [];
  repository.subscribe(event => events.push(event));

  await repository.resolveConflict(conflictId, { strategy: "server" });

  expect(events).toContainEqual(expect.objectContaining({ type: "sync", version: 7, deleted: false }));
  await expect(repository.getEntity(queued.optimisticRecord.domainKey)).resolves.toMatchObject({
    payload: expect.objectContaining({ status: "server" }),
  });
});

test("a confirmation says whether it left the record deleted", async () => {
  // The next create on that key reads this to tell a tombstone from a live record — one claims the
  // version to lift it, the other claims 0 so the server can object. App's half is tested with a
  // hand-built event, and a hand-built event agrees with itself: drop the flag HERE and the whole
  // App suite still passes, while a ring deleted and re-recorded in one session is refused for the
  // rest of the session and takes its domain down with it.
  const repository = makeRepository();
  const queued = await repository.mutate({ ...segmentInput, operation: "delete" });
  const events = [];
  repository.subscribe(event => events.push(event));

  await repository.applySyncSuccess(queued.requestId, {
    requestId: queued.requestId, status: "success",
    record: { id: "segment-1", deleted: true }, version: 4, updatedAt: "2026-07-29T01:00:00.000Z",
  });

  expect(events).toContainEqual(expect.objectContaining({ type: "sync", version: 4, deleted: true }));
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

test("the record `mutate` hands back is the one the on-screen list can match", async () => {
  // A real seam, faked on both sides until now. `applyOptimisticRow` decides which row a queued
  // write is about by rebuilding the row's domain key, and it needs `entityType` and `domainKey`
  // from the payload `optimisticEntity` injects. Delete either injection and the whole suite stays
  // green while every update appends a duplicate row on screen and every delete removes nothing —
  // the same class this identity rule exists to close, arriving from the other side. The App-level
  // tests could not see it: their fake repository returns `{ ...payload, id: recordId }`, which has
  // neither field, so they exercise the id-only fallback instead of the shape the real one sends.
  // Task 9 edits `optimisticEntity` to add entity types.
  const repository = makeRepository();
  const rows = [
    { id: "s1", ringNo: "P37", installType: "Temporary", length: "1.37" },
    { id: "s1", ringNo: "P71", installType: "Permanent", length: "1.71" },
  ];

  const { optimisticRecord } = await repository.mutate({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "s1", baseVersion: 1,
    payload: { id: "s1", ringNo: "P71", installType: "Permanent", length: "9.99" },
  });

  expect(applyOptimisticRow(rows, "update", optimisticRecord).map(row => `${row.ringNo}/${row.length}`))
    .toEqual(["P37/1.37", "P71/9.99"]);
  expect(applyOptimisticRow(rows, "delete", optimisticRecord).map(row => row.ringNo)).toEqual(["P37"]);
});
