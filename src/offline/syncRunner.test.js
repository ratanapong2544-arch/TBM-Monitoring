import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));
import { ApiFailure } from "./apiTransport";
import { deleteOfflineDbForTests, openOfflineDb } from "./db";
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
