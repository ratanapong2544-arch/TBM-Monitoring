import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));

import { deleteOfflineDbForTests, openOfflineDb } from "./db";
import { createRepository } from "./repository";

beforeEach(async () => { await deleteOfflineDbForTests(); });
afterEach(async () => { await deleteOfflineDbForTests(); });

function makeRepository(overrides = {}) {
  return createRepository({
    openDb: openOfflineDb,
    now: () => "2026-07-30T00:00:00.000Z",
    fetchServerSnapshot: async machine => ({ status: "success", segments: [{ id: "s1", ringNo: "P1", machine }] }),
    ...overrides,
  });
}

test("a server payload still reaches the caller when the cache write fails", async () => {
  // the fetch succeeded; throwing here showed an empty app to a crew whose data had already arrived
  const repository = makeRepository({
    writeServerSnapshot: async () => { throw new Error("QuotaExceededError"); },
  });

  const result = await repository.refresh("TBM1");

  expect(result.source).toBe("server");
  // the payload is server-fresh, so it is not stale; cacheError reports it could not be persisted
  expect(result.stale).toBe(false);
  expect(result.data.segments).toHaveLength(1);
  expect(result.cacheError).toBeInstanceOf(Error);
});

// A test stood here for `serverPayload`, the raw GAS response `refresh` used to carry. It existed
// for one caller — the shift report's "did my write reach the sheet?" check — and Task 8 replaced
// that check with the queue, whose `requestId` and version answer the same question without asking
// the server twice. The plan's Step 4 says to drop the field once nothing reads it. `present`, added
// alongside it, is kept deliberately: the test below is why, and Task 9 is who needs it.

test("both refresh paths report which collections the response carried", async () => {
  // `present` is what stops an absent collection reading as an empty one. It was dropped on the
  // cache-write-ok path once already — `writeServerSnapshot` rebuilds its return value — which shut
  // the create-a-report gate on every healthy device. The cacheError path had it and was untested,
  // so a tidy-up there would reproduce that blocker for private-browsing and over-quota devices.
  const raw = { status: "success", segments: [{ id: "s1", ringNo: "P1", machine: "TBM1" }] };

  const cached = await makeRepository({ fetchServerSnapshot: async () => raw }).refresh("TBM1");
  expect(cached.data.present).toMatchObject({ segments: true, shiftReports: false });

  const uncached = await makeRepository({
    fetchServerSnapshot: async () => raw,
    writeServerSnapshot: async () => { throw new Error("QuotaExceededError"); },
  }).refresh("TBM1");
  expect(uncached.data.present).toMatchObject({ segments: true, shiftReports: false });
});

test("a successful refresh is not flagged stale", async () => {
  const repository = makeRepository();

  const result = await repository.refresh("TBM1");

  expect(result).toMatchObject({ source: "server", stale: false });
  expect(result.cacheError).toBeUndefined();
});

test("a fetch failure still throws so the caller can keep its cached snapshot", async () => {
  const repository = makeRepository({
    fetchServerSnapshot: async () => { throw new Error("NETWORK"); },
  });

  await expect(repository.refresh("TBM1")).rejects.toThrow("NETWORK");
});

test("a fetch failure reports the fetch failure even when the database is unusable too", async () => {
  // reading the cache on the way out is a courtesy for subscribers. Since openDb can now reject
  // rather than hang, an unguarded read there replaced the real fault: the crew was shown
  // "IndexedDB open timed out" for what was actually a server or permission failure, and the error
  // events never fired.
  const errors = [];
  const repository = makeRepository({
    fetchServerSnapshot: async () => { throw new Error("GAS_PERMISSION_HTML"); },
    openDb: async () => { throw new Error("IndexedDB open timed out"); },
  });
  repository.subscribe(event => { if (event.type === "error") errors.push(event); });

  await expect(repository.refresh("TBM1")).rejects.toThrow("GAS_PERMISSION_HTML");
  expect(errors).toHaveLength(1);
  expect(errors[0].error.message).toBe("GAS_PERMISSION_HTML");
  expect(errors[0].result).toBeNull();
});
