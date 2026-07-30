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
  expect(result.stale).toBe(true);
  expect(result.data.segments).toHaveLength(1);
  expect(result.cacheError).toBeInstanceOf(Error);
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
