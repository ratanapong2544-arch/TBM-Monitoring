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

// A server that enforces the version rule GAS enforces (`checkSyncVersion_`: base must equal
// current, or it is a conflict), because that rule is what an offline chain of edits runs into. The
// fakes above answer "success" no matter what `baseVersion` says, so they cannot see this at all.
function versionedServer() {
  const versions = new Map();
  const post = jest.fn(async mutation => {
    const current = versions.get(mutation.domainKey) || 0;
    if ((mutation.baseVersion || 0) !== current) {
      return {
        status: "conflict", requestId: mutation.requestId,
        serverRecord: { id: mutation.recordId }, localRecord: mutation.payload,
        conflictingFields: ["status"], currentVersion: current,
      };
    }
    versions.set(mutation.domainKey, current + 1);
    return {
      status: "success", requestId: mutation.requestId,
      record: { ...mutation.payload, id: mutation.recordId },
      version: current + 1, updatedAt: "2026-07-29T00:01:00.000Z",
    };
  });
  return { post, versions };
}

const ring = (operation, payload, baseVersion = 0) => ({
  entityType: "segment", operation, machine: "TBM1", recordId: "seg_644", baseVersion,
  payload: { ringNo: "P644", installType: "Permanent", ...payload },
});

test("every edit made offline on one ring reaches the sheet when the link returns", async () => {
  // The core TBM flow, done underground with no link: the ring is saved In Progress when it is
  // excavated and saved again Completed when it is erected. Both are queued before anything can
  // confirm, so both are stamped with the only version this device knows — 0. The first lands and
  // takes the record to version 1; the second still claims 0, and the server answers `conflict` for
  // a row nobody else has touched. That conflict then sits at the head of the domain and blocks
  // every later edit of the ring, with no conflict UI until Task 10 to show any of it: the app says
  // Completed, the sheet says In Progress with no install times, and nothing on screen disagrees.
  const server = versionedServer();
  const { repository, runner } = setup(server.post);
  const created = await repository.mutate(ring("create", { status: "In Progress" }));
  const completed = await repository.mutate(ring("update", { status: "Completed", installEndTime: "18:30" }));

  await runner.runNow();
  await runner.runNow(); // one trigger per drain here; the backlog rule is the next test's job

  await expect(repository.getMutation(created.requestId)).resolves.toMatchObject({ status: "synced" });
  await expect(repository.getMutation(completed.requestId)).resolves.toMatchObject({ status: "synced" });
  // and the second edit went out rebased on what the first one confirmed, not on the stale 0
  expect(server.post.mock.calls.map(([m]) => m.baseVersion)).toEqual([0, 1]);
});

test("one trigger drains a backlog queued on a single record", async () => {
  // `claimDueMutations` returns one mutation per domain — the head — so a shift report with three
  // time bars added offline needs three separate triggers to drain. The triggers are online/focus/
  // visibilitychange and each new write, so a PWA left open at the site office can sit for hours
  // with recorded work still in the queue and nothing on screen saying so.
  const server = versionedServer();
  const { repository, runner } = setup(server.post);
  await repository.mutate(ring("create", { status: "In Progress" }));
  await repository.mutate(ring("update", { status: "In Progress", excavEndTime: "12:00" }));
  const last = await repository.mutate(ring("update", { status: "Completed", installEndTime: "18:30" }));

  await expect(runner.runNow()).resolves.toMatchObject({ attempted: 3, synced: 3 });
  await expect(repository.getMutation(last.requestId)).resolves.toMatchObject({ status: "synced" });
});

test("a drain that syncs nothing ends the pass rather than claiming forever", async () => {
  // The loop's exit condition is "a pass synced something". If it were "a pass attempted something"
  // — or if an empty claim did not end it — `runNow` would never return: it holds `running` for the
  // life of the call, so every later trigger joins the same hung promise, the queue stops draining
  // for the rest of the session and the tab pegs a core. A phone in a tunnel is the worst place for
  // both. Nothing here is claimable, so a correct pass returns immediately.
  const post = jest.fn();
  const { runner } = setup(post);

  await expect(runner.runNow()).resolves.toEqual({ attempted: 0, synced: 0, conflicts: 0, errors: 0 });
  expect(post).not.toHaveBeenCalled();
});

test("a drain whose only mutation errors ends the pass rather than retrying in a loop", async () => {
  // an attempt is not progress: the mutation goes back to pending with a backoff and is claimable
  // again the moment the clock allows, so looping on "attempted" would spin on a failing server
  const post = jest.fn().mockRejectedValue(retryable());
  const { repository, runner } = setup(post);
  await repository.mutate(input("P1"));

  await expect(runner.runNow()).resolves.toMatchObject({ attempted: 1, synced: 0 });
  expect(post).toHaveBeenCalledTimes(1);
});

test("a domain that conflicts stops draining instead of spinning", async () => {
  // the drain loop must not turn a blocked domain into an endless retry: the conflict is the head
  // of its domain and stays claimable-looking until Task 10 resolves it
  const post = jest.fn(async mutation => ({
    status: "conflict", requestId: mutation.requestId,
    serverRecord: { id: mutation.recordId }, localRecord: mutation.payload,
    conflictingFields: ["status"], currentVersion: 9,
  }));
  const { repository, runner } = setup(post);
  await repository.mutate(ring("create", { status: "In Progress" }));
  await repository.mutate(ring("update", { status: "Completed" }));

  await expect(runner.runNow()).resolves.toMatchObject({ attempted: 1, conflicts: 1 });
  expect(post).toHaveBeenCalledTimes(1);
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
  let resolveInFlight;
  let markInFlight;
  const inFlight = new Promise(resolve => { markInFlight = resolve; });
  const postSyncMutation = jest.fn()
    .mockImplementationOnce(() => new Promise(resolve => { resolveInFlight = resolve; markInFlight(); }))
    .mockResolvedValueOnce({ status: "success", requestId: "request-1", record: { status: "confirmed" }, version: 2, updatedAt: "2026-07-29T00:01:00.000Z" });
  const { repository, runner: originalRunner } = setup(postSyncMutation);
  const queued = await repository.mutate(input("P1"));
  originalRunner.runNow();
  await inFlight;
  await expect(repository.getMutation(queued.requestId)).resolves.toMatchObject({ status: "syncing" });
  closeOfflineDb();
  const reopened = createRepository({ openDb: openOfflineDb, now: () => "2026-07-29T00:00:00.000Z", getDeviceId: async () => "device-1" });
  const runner = createSyncRunner({ repository: reopened, transport: { postSyncMutation }, clock: { now: () => Date.parse("2026-07-29T00:00:31.000Z") }, jitter: () => 0, online: () => true });

  await runner.runNow();

  expect(postSyncMutation).toHaveBeenCalledWith(expect.objectContaining({ requestId: queued.requestId }));
  await expect(reopened.getMutation(queued.requestId)).resolves.toMatchObject({ status: "synced" });
  resolveInFlight({ status: "success", requestId: queued.requestId, record: { status: "stale" }, version: 2, updatedAt: "2026-07-29T00:02:00.000Z" });
  await originalRunner.runNow();
});

test("an event trigger whose run rejects does not raise an unhandled rejection", async () => {
  // the runner reaches IndexedDB to claim due mutations, so it rejects outright in a session whose
  // database could not be opened — and that is exactly the session the provider starts it in anyway.
  // Every online/focus/visibility event would otherwise surface a page error on a working screen.
  const windowEvents = new EventTarget();
  const rejections = [];
  const onRejection = reason => { rejections.push(reason); };
  process.on("unhandledRejection", onRejection);
  try {
    const repository = {
      claimDueMutations: jest.fn(async () => { throw new Error("IndexedDB open timed out"); }),
      subscribe: jest.fn(() => () => {}),
    };
    const runner = createSyncRunner({ repository, transport: { postSyncMutation: jest.fn() }, clock: { now: () => 0 }, online: () => true, windowEvents });
    await runner.start().catch(() => {});

    windowEvents.dispatchEvent(new Event("online"));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(repository.claimDueMutations).toHaveBeenCalled();
    expect(rejections).toHaveLength(0);
    runner.stop();
  } finally {
    process.off("unhandledRejection", onRejection);
  }
});

test("uses window for online/focus and document for visibility, then removes both listener sets", async () => {
  const windowEvents = new EventTarget();
  const documentEvents = new EventTarget();
  const windowAdd = jest.spyOn(windowEvents, "addEventListener");
  const documentAdd = jest.spyOn(documentEvents, "addEventListener");
  const windowRemove = jest.spyOn(windowEvents, "removeEventListener");
  const documentRemove = jest.spyOn(documentEvents, "removeEventListener");
  Object.defineProperty(documentEvents, "visibilityState", { configurable: true, value: "hidden", writable: true });
  let resolvePost;
  let markPosted;
  const posted = new Promise(resolve => { markPosted = resolve; });
  const postSyncMutation = jest.fn(() => new Promise(resolve => { resolvePost = resolve; markPosted(); }));
  const repository = createRepository({ openDb: openOfflineDb, now: () => "2026-07-29T00:00:00.000Z", getDeviceId: async () => "device-1", createRequestId: () => "request-1" });
  await repository.mutate(input("P1"));
  const runner = createSyncRunner({ repository, transport: { postSyncMutation }, clock: { now: () => Date.parse("2026-07-29T00:00:00.000Z") }, online: () => true, windowEvents, document: documentEvents });

  const started = runner.start();
  expect(windowAdd).toHaveBeenCalledWith("online", expect.any(Function));
  expect(windowAdd).toHaveBeenCalledWith("focus", expect.any(Function));
  expect(documentAdd).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  expect(postSyncMutation).not.toHaveBeenCalled();
  await started;
  documentEvents.visibilityState = "visible";
  documentEvents.dispatchEvent(new Event("visibilitychange"));
  await posted;
  expect(postSyncMutation).toHaveBeenCalledTimes(1);
  resolvePost({ status: "success", requestId: "request-1", record: { status: "confirmed" }, version: 2, updatedAt: "2026-07-29T00:01:00.000Z" });
  await runner.runNow();
  runner.stop();
  expect(windowRemove).toHaveBeenCalledWith("online", expect.any(Function));
  expect(windowRemove).toHaveBeenCalledWith("focus", expect.any(Function));
  expect(documentRemove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  await repository.mutate({ ...input("P2"), recordId: "segment-P2" });
  windowEvents.dispatchEvent(new Event("online"));
  documentEvents.dispatchEvent(new Event("visibilitychange"));
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

test("allows a second runner to take an expired lease but rejects a stale first-runner response", async () => {
  let now = 0;
  let resolveFirst;
  let firstPosted;
  const firstPost = new Promise(resolve => { resolveFirst = resolve; });
  const firstStarted = new Promise(resolve => { firstPosted = resolve; });
  const postA = jest.fn(() => { firstPosted(); return firstPost; });
  const postB = jest.fn().mockResolvedValue({ status: "success", requestId: "request-1", record: { status: "from-b" }, version: 2, updatedAt: "2026-07-29T00:01:00.000Z" });
  const repository = createRepository({ openDb: openOfflineDb, now: () => "2026-07-29T00:00:00.000Z", getDeviceId: async () => "device-1", createRequestId: () => "request-1" });
  const queued = await repository.mutate(input("P1"));
  const clock = { now: () => now };
  const runnerA = createSyncRunner({ repository, transport: { postSyncMutation: postA }, clock, online: () => true, owner: "runner-a", leaseMs: 100 });
  const runnerB = createSyncRunner({ repository, transport: { postSyncMutation: postB }, clock, online: () => true, owner: "runner-b", leaseMs: 100 });

  const firstRun = runnerA.runNow();
  await firstStarted;
  await expect(runnerB.runNow()).resolves.toEqual(expect.objectContaining({ attempted: 0 }));
  expect(postB).not.toHaveBeenCalled();
  now = 101;
  await runnerB.runNow();
  expect(postB).toHaveBeenCalledWith(expect.objectContaining({ requestId: queued.requestId }));
  resolveFirst({ status: "success", requestId: "request-1", record: { status: "from-a" }, version: 2, updatedAt: "2026-07-29T00:02:00.000Z" });
  await firstRun;
  await expect(repository.getEntity(queued.optimisticRecord.domainKey)).resolves.toMatchObject({ payload: expect.objectContaining({ status: "from-b" }) });
});

test("stop invalidates a queued start before it can claim or post", async () => {
  const repository = { claimDueMutations: jest.fn().mockResolvedValue([]), reclaimSyncingMutations: jest.fn().mockResolvedValue(0), getDueMutations: jest.fn().mockResolvedValue([]) };
  const runner = createSyncRunner({ repository, transport: { postSyncMutation: jest.fn() }, online: () => true, owner: "runner-a" });

  const started = runner.start();
  runner.stop();

  await expect(started).resolves.toBeUndefined();
  expect(repository.claimDueMutations).not.toHaveBeenCalled();
});

test("does not claim a later same-domain mutation before an earlier retry is due while an unrelated domain proceeds", async () => {
  let now = 0;
  let id = 0;
  const calls = [];
  const responses = {
    "request-1": [retryable(), { status: "success", requestId: "request-1", record: { status: "a-confirmed" }, version: 2, updatedAt: "2026-07-29T00:02:00.000Z" }],
    "request-2": [{ status: "success", requestId: "request-2", record: { status: "b-confirmed" }, version: 3, updatedAt: "2026-07-29T00:03:00.000Z" }],
    "request-3": [{ status: "success", requestId: "request-3", record: { status: "other-confirmed" }, version: 2, updatedAt: "2026-07-29T00:01:00.000Z" }],
  };
  const postSyncMutation = jest.fn(mutation => {
    calls.push(mutation.requestId);
    const response = responses[mutation.requestId].shift();
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
  });
  const repository = createRepository({ openDb: openOfflineDb, now: () => "2026-07-29T00:00:00.000Z", getDeviceId: async () => "device-1", createRequestId: () => `request-${++id}` });
  const runner = createSyncRunner({ repository, transport: { postSyncMutation }, clock: { now: () => now }, jitter: () => 0, online: () => true, owner: "runner-a", leaseMs: 30000 });
  const first = await repository.mutate(input("P1"));
  await repository.updateMutation(first.requestId, { attemptCount: 4 });
  const second = await repository.mutate({ ...input("P1"), recordId: "segment-P1-later", payload: { ringNo: "P1", installType: "Permanent", status: "later" } });
  await repository.mutate(input("P2"));

  await runner.runNow();
  expect(calls).toEqual(["request-1", "request-3"]);
  await expect(repository.getMutation(second.requestId)).resolves.toMatchObject({ status: "pending" });

  now = 30001;
  await runner.runNow();
  expect(calls).toEqual(["request-1", "request-3"]);

  now = 64000;
  await runner.runNow();
  await runner.runNow();
  expect(calls).toEqual(["request-1", "request-3", "request-1", "request-2"]);
});

test.each([
  ["local", undefined, "local"],
  ["manual", { ringNo: "P1", installType: "Permanent", status: "manual" }, "manual"],
])("syncs the %s conflict-resolution successor against currentVersion", async (strategy, payload, expectedStatus) => {
  const ids = jest.fn().mockReturnValueOnce("request-1").mockReturnValueOnce("request-2");
  const repository = createRepository({ openDb: openOfflineDb, now: () => "2026-07-29T00:00:00.000Z", getDeviceId: async () => "device-1", createRequestId: ids });
  const original = await repository.mutate(input("P1"));
  await repository.applyConflict(original.requestId, { status: "conflict", requestId: original.requestId, serverRecord: { recordId: "segment-P1", entityType: "segment", machine: "TBM1", domainKey: original.optimisticRecord.domainKey, status: "server" }, localRecord: original.optimisticRecord, conflictingFields: ["status"], currentVersion: 9 });
  const successor = await repository.resolveConflict(original.requestId, { strategy, payload });
  const postSyncMutation = jest.fn().mockResolvedValue({ status: "success", requestId: successor.requestId, record: { status: "confirmed" }, version: 10, updatedAt: "2026-07-29T00:01:00.000Z" });
  const runner = createSyncRunner({ repository, transport: { postSyncMutation }, clock: { now: () => Date.parse("2026-07-29T00:00:00.000Z") }, online: () => true, owner: "runner-a" });

  await runner.runNow();

  expect(postSyncMutation).toHaveBeenCalledWith(expect.objectContaining({ requestId: successor.requestId, baseVersion: 9, payload: expect.objectContaining({ status: expectedStatus }) }));
  await expect(repository.getMutation(original.requestId)).resolves.toMatchObject({ status: "resolved" });
  await expect(repository.getMutation(successor.requestId)).resolves.toMatchObject({ status: "synced" });
});
