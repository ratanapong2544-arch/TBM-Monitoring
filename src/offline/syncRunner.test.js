import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));
import { ApiFailure } from "./apiTransport";
import { closeOfflineDb, deleteOfflineDbForTests, openOfflineDb } from "./db";
import { createRepository } from "./repository";
import { createSyncRunner } from "./syncRunner";

beforeEach(async () => { await deleteOfflineDbForTests(); });
afterEach(async () => { await deleteOfflineDbForTests(); });

function retryable() { return new ApiFailure("retryable", "NETWORK", "offline"); }
function input(ringNo, recordId = `segment-${ringNo}`) {
  return { entityType: "segment", operation: "update", machine: "TBM1", recordId, baseVersion: 1, payload: { ringNo, installType: "Permanent", status: "local" } };
}
function setup(postSyncMutation) {
  let id = 0;
  const repository = createRepository({ openDb: openOfflineDb, now: () => "2026-07-29T00:00:00.000Z", getDeviceId: async () => "device-1", createRequestId: () => `request-${++id}` });
  const clock = { now: () => Date.parse("2026-07-29T00:00:00.000Z") };
  const runner = createSyncRunner({ repository, transport: { postSyncMutation }, clock, jitter: () => 0, online: () => true, events: new EventTarget() });
  return { repository, runner };
}

test("queues before any network call and keeps the same requestId on retry", async () => {
  const postSyncMutation = jest.fn().mockRejectedValue(retryable());
  const { repository, runner } = setup(postSyncMutation);
  const queued = await repository.mutate(input("P1"));
  expect((await repository.getMutation(queued.requestId)).status).toBe("pending");

  await runner.runNow();
  await runner.runNow();

  const ids = postSyncMutation.mock.calls.map(([mutation]) => mutation.requestId);
  expect(new Set(ids)).toEqual(new Set([queued.requestId]));
});

test("schedules retryable failures with deterministic exponential backoff", async () => {
  const { repository, runner } = setup(jest.fn().mockRejectedValue(retryable()));
  const queued = await repository.mutate(input("P1"));

  await runner.runNow();

  await expect(repository.getMutation(queued.requestId)).resolves.toMatchObject({ status: "pending", attemptCount: 1, nextAttemptAt: "2026-07-29T00:00:04.000Z" });
});

test.each([
  [new ApiFailure("validation", "VALIDATION"), "validation_error"],
  [new ApiFailure("permanent", "GAS_MALFORMED_SYNC_RESPONSE"), "permanent_error"],
])("retains %s failures without automatic retry", async (failure, status) => {
  const { repository, runner } = setup(jest.fn().mockRejectedValue(failure));
  const queued = await repository.mutate(input("P1"));
  await runner.runNow();
  await expect(repository.getMutation(queued.requestId)).resolves.toMatchObject({ status, attemptCount: 1 });
});

test("records server conflicts and continues with an unrelated domain", async () => {
  const postSyncMutation = jest.fn()
    .mockResolvedValueOnce({ status: "conflict", requestId: "request-1", serverRecord: { status: "server" }, localRecord: { status: "local" }, conflictingFields: ["status"], currentVersion: 4 })
    .mockResolvedValueOnce({ status: "success", requestId: "request-2", record: { status: "confirmed" }, version: 2, updatedAt: "2026-07-29T00:01:00.000Z" });
  const { repository, runner } = setup(postSyncMutation);
  const first = await repository.mutate(input("P1"));
  const second = await repository.mutate(input("P2"));

  await expect(runner.runNow()).resolves.toEqual(expect.objectContaining({ attempted: 2, conflicts: 1, synced: 1 }));
  await expect(repository.getMutation(first.requestId)).resolves.toMatchObject({ status: "conflict" });
  await expect(repository.getConflict(first.requestId)).resolves.toMatchObject({ currentVersion: 4, status: "open" });
  await expect(repository.getMutation(second.requestId)).resolves.toMatchObject({ status: "synced" });
});

test("runNow is single-flight and start only triggers while visible and online", async () => {
  let resolvePost;
  let markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const postSyncMutation = jest.fn(() => new Promise(resolve => { resolvePost = resolve; markStarted(); }));
  const { repository, runner } = setup(postSyncMutation);
  await repository.mutate(input("P1"));
  const first = runner.runNow();
  const second = runner.runNow();
  expect(first).toBe(second);
  await started;
  resolvePost({ status: "success", requestId: "request-1", record: { status: "confirmed" }, version: 2, updatedAt: "2026-07-29T00:01:00.000Z" });
  await first;
  expect(postSyncMutation).toHaveBeenCalledTimes(1);
});

test("reclaims a durable in-flight mutation after reopening and retries its original requestId", async () => {
  let markInFlight;
  const inFlight = new Promise(resolve => { markInFlight = resolve; });
  const postSyncMutation = jest.fn()
    .mockImplementationOnce(() => new Promise(resolve => { markInFlight(); }))
    .mockResolvedValueOnce({ status: "success", requestId: "request-1", record: { status: "confirmed" }, version: 2, updatedAt: "2026-07-29T00:01:00.000Z" });
  const { repository, runner: originalRunner } = setup(postSyncMutation);
  const queued = await repository.mutate(input("P1"));
  originalRunner.runNow();
  await inFlight;
  await expect(repository.getMutation(queued.requestId)).resolves.toMatchObject({ status: "syncing" });
  closeOfflineDb();
  const reopened = createRepository({ openDb: openOfflineDb, now: () => "2026-07-29T00:00:00.000Z", getDeviceId: async () => "device-1" });
  const runner = createSyncRunner({ repository: reopened, transport: { postSyncMutation }, clock: { now: () => Date.parse("2026-07-29T00:00:00.000Z") }, jitter: () => 0, online: () => true });

  await runner.runNow();

  expect(postSyncMutation).toHaveBeenCalledWith(expect.objectContaining({ requestId: queued.requestId }));
  await expect(reopened.getMutation(queued.requestId)).resolves.toMatchObject({ status: "synced" });
});

test("uses window for online/focus and document for visibility, then removes both listener sets", async () => {
  const windowEvents = new EventTarget();
  const documentEvents = new EventTarget();
  const windowAdd = jest.spyOn(windowEvents, "addEventListener");
  const documentAdd = jest.spyOn(documentEvents, "addEventListener");
  const windowRemove = jest.spyOn(windowEvents, "removeEventListener");
  const documentRemove = jest.spyOn(documentEvents, "removeEventListener");
  Object.defineProperty(documentEvents, "visibilityState", { configurable: true, value: "hidden", writable: true });
  const postSyncMutation = jest.fn().mockResolvedValue({ status: "success", requestId: "request-1", record: { status: "confirmed" }, version: 2, updatedAt: "2026-07-29T00:01:00.000Z" });
  const repository = createRepository({ openDb: openOfflineDb, now: () => "2026-07-29T00:00:00.000Z", getDeviceId: async () => "device-1", createRequestId: () => "request-1" });
  await repository.mutate(input("P1"));
  const runner = createSyncRunner({ repository, transport: { postSyncMutation }, clock: { now: () => Date.parse("2026-07-29T00:00:00.000Z") }, online: () => true, windowEvents, document: documentEvents });

  runner.start();
  expect(windowAdd).toHaveBeenCalledWith("online", expect.any(Function));
  expect(windowAdd).toHaveBeenCalledWith("focus", expect.any(Function));
  expect(documentAdd).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  expect(postSyncMutation).not.toHaveBeenCalled();
  documentEvents.visibilityState = "visible";
  documentEvents.dispatchEvent(new Event("visibilitychange"));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(postSyncMutation).toHaveBeenCalledTimes(1);
  runner.stop();
  expect(windowRemove).toHaveBeenCalledWith("online", expect.any(Function));
  expect(windowRemove).toHaveBeenCalledWith("focus", expect.any(Function));
  expect(documentRemove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  await repository.mutate({ ...input("P2"), recordId: "segment-P2" });
  windowEvents.dispatchEvent(new Event("online"));
  documentEvents.dispatchEvent(new Event("visibilitychange"));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(postSyncMutation).toHaveBeenCalledTimes(1);
});

test.each([
  [{ status: "success", requestId: "request-1", record: { status: "confirmed" }, updatedAt: "2026-07-29T00:01:00.000Z" }],
  [{ status: "validation_error", requestId: "request-1", message: "bad" }],
  [{ status: "conflict", requestId: "request-1", serverRecord: { status: "server" }, conflictingFields: ["status"], currentVersion: 2 }],
])("treats incomplete typed response %j as permanent", async response => {
  const { repository, runner } = setup(jest.fn().mockResolvedValue(response));
  const queued = await repository.mutate(input("P1"));
  await runner.runNow();
  await expect(repository.getMutation(queued.requestId)).resolves.toMatchObject({ status: "permanent_error", lastError: { code: "GAS_MALFORMED_SYNC_RESPONSE" } });
});
