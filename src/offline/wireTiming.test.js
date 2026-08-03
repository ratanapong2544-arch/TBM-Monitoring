import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));
import { deleteOfflineDbForTests, openOfflineDb } from "./db";
import { buildMutationEnvelope } from "./mutationEnvelope";
import { createRepository } from "./repository";
import { createSyncRunner } from "./syncRunner";
import { formatWireTiming } from "./wireTiming";

beforeEach(async () => { await deleteOfflineDbForTests(); });
afterEach(async () => { await deleteOfflineDbForTests(); });

let nextId = 0;
const makeRepository = (overrides = {}) => createRepository({
  openDb: openOfflineDb, getDeviceId: async () => "device-1",
  createRequestId: () => `request-${++nextId}`, ...overrides,
});

const segment = ringNo => buildMutationEnvelope({
  entityType: "segment", operation: "update", machine: "TBM1", recordId: `seg-${ringNo}`,
  payload: { ringNo, installType: "Permanent" }, syncMeta: { [`segment:TBM1:${ringNo}:Permanent`]: { version: 1 } },
});

test("a successful getData records how long the wire took", async () => {
  // The whole reason this exists: the two deadlines that guard the wire are 90 s and neither has ever
  // been measured. Safari's Web Inspector needs a Mac, so on an iPhone the only instrument that can
  // reach the tunnel is the app itself.
  const stamps = ["2026-08-03T04:00:00.000Z", "2026-08-03T04:00:12.400Z"];
  let call = 0;
  const repository = makeRepository({
    now: () => stamps[Math.min(call++, stamps.length - 1)],
    fetchServerSnapshot: async () => ({ segments: [] }),
  });

  await repository.refresh("TBM1");

  expect((await repository.getSyncSummary()).lastFetchMs).toBe(12400);
});

test("a getData that fails records nothing, so the last number stays the last real one", async () => {
  const repository = makeRepository({ fetchServerSnapshot: async () => { throw new Error("NETWORK"); } });

  await expect(repository.refresh("TBM1")).rejects.toThrow();

  expect((await repository.getSyncSummary()).lastFetchMs).toBeNull();
});

test("a write that reaches the sheet records how long its POST took", async () => {
  const repository = makeRepository();
  await repository.mutate(segment("P1"));
  let clockValue = 1000;
  const runner = createSyncRunner({
    repository,
    clock: { now: () => clockValue },
    // the response GAS actually returns — `assertSyncResponse` refuses anything less, and a fake that
    // is refused measures the error path instead of the wire
    transport: { postSyncMutation: async mutation => { clockValue += 3100; return { status: "success", requestId: mutation.requestId, version: 2, updatedAt: "2026-08-03T04:00:00.000Z", record: { id: "seg-P1" } }; } },
    windowEvents: null,
    document: null,
  });

  await runner.runNow();

  expect((await repository.getSyncSummary()).lastPostMs).toBe(3100);
});

test("a write that is refused records nothing — the number is about the wire, not the answer", async () => {
  const repository = makeRepository();
  await repository.mutate(segment("P2"));
  const runner = createSyncRunner({
    repository,
    transport: { postSyncMutation: async () => { throw new Error("NETWORK"); } },
    windowEvents: null,
    document: null,
  });

  await runner.runNow();

  expect((await repository.getSyncSummary()).lastPostMs).toBeNull();
});

test("the numbers survive a relaunch, because the crew reads them after coming up", async () => {
  // Underground they are recorded; the phone is read later, often after the app has been closed.
  const stamps = ["2026-08-03T04:00:00.000Z", "2026-08-03T04:00:08.000Z"];
  let call = 0;
  const repository = makeRepository({
    now: () => stamps[Math.min(call++, stamps.length - 1)],
    fetchServerSnapshot: async () => ({ segments: [] }),
  });
  await repository.refresh("TBM1");

  const reopened = makeRepository({ fetchServerSnapshot: async () => ({ segments: [] }) });

  expect((await reopened.getSyncSummary()).lastFetchMs).toBe(8000);
});

test("the reading is shown in seconds, and says when there is nothing to show", () => {
  // A crew comparing against a 90 s deadline should not be dividing milliseconds underground.
  expect(formatWireTiming(12400)).toBe("12.4 วิ");
  expect(formatWireTiming(900)).toBe("0.9 วิ");
  expect(formatWireTiming(0)).toBe("0.0 วิ");
  expect(formatWireTiming(null)).toBe("—");
  expect(formatWireTiming(undefined)).toBe("—");
});
