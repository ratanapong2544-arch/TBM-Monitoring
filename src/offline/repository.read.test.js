import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));
import { deleteOfflineDbForTests, openOfflineDb } from "./db";
import { createRepository } from "./repository";
import { ApiFailure } from "./apiTransport";

beforeEach(async () => { await deleteOfflineDbForTests(); });
afterEach(async () => { await deleteOfflineDbForTests(); });

test("load returns an explicit stale empty wrapper before any snapshot", async () => {
  const repository = createRepository({ openDb: openOfflineDb });
  await expect(repository.load("TBM1")).resolves.toEqual(expect.objectContaining({ source: "empty", fetchedAt: null, stale: true, data: expect.objectContaining({ machine: "TBM1", segments: [], grouts: [], syncMeta: {} }) }));
});

test("refresh writes normalized server data and notifies subscribers", async () => {
  const fetchServerSnapshot = jest.fn().mockResolvedValue({ segments: [{ ringNo: "P1" }] });
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot });
  const subscriber = jest.fn();
  const unsubscribe = repository.subscribe(subscriber);
  await expect(repository.refresh("TBM1")).resolves.toEqual(expect.objectContaining({ source: "server", stale: false, fetchedAt: expect.any(String), data: expect.objectContaining({ segments: expect.arrayContaining([expect.objectContaining({ ringNo: "P1" })]) }) }));
  await expect(repository.load("TBM1")).resolves.toEqual(expect.objectContaining({ source: "indexeddb", stale: true, fetchedAt: expect.any(String), data: expect.objectContaining({ segments: expect.arrayContaining([expect.objectContaining({ ringNo: "P1" })]) }) }));
  expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({ type: "data", machine: "TBM1", result: expect.objectContaining({ source: "server", stale: false, data: expect.objectContaining({ segments: expect.arrayContaining([expect.objectContaining({ ringNo: "P1" })]) }) }) }));
  unsubscribe();
});

test("refresh retains a cached snapshot and emits the typed failure separately", async () => {
  const fetchServerSnapshot = jest.fn().mockResolvedValueOnce({ segments: [{ ringNo: "P1" }] }).mockRejectedValueOnce(new ApiFailure("retryable", "NETWORK"));
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot });
  const errors = jest.fn();
  repository.subscribeErrors(errors);
  await repository.refresh("TBM1");
  await expect(repository.refresh("TBM1")).rejects.toMatchObject({ kind: "retryable", code: "NETWORK" });
  await expect(repository.load("TBM1")).resolves.toEqual(expect.objectContaining({ source: "indexeddb", stale: true, data: expect.objectContaining({ segments: expect.arrayContaining([expect.objectContaining({ ringNo: "P1" })]) }) }));
  expect(errors).toHaveBeenCalledWith(expect.objectContaining({ type: "error", machine: "TBM1", error: expect.objectContaining({ kind: "retryable", code: "NETWORK" }), result: expect.objectContaining({ source: "indexeddb", stale: true }) }));
});

test("refresh returns and emits the pending entity preserved by snapshot storage", async () => {
  const db = await openOfflineDb();
  const repository = createRepository({ openDb: async () => db, fetchServerSnapshot: jest.fn().mockResolvedValue({ segments: [{ ringNo: "P1", status: "server" }] }) });
  await repository.refresh("TBM1");
  const entity = await new Promise((resolve, reject) => { const request = db.transaction("entities").objectStore("entities").getAll(); request.onsuccess = () => resolve(request.result[0]); request.onerror = () => reject(request.error); });
  await new Promise((resolve, reject) => { const transaction = db.transaction("mutations", "readwrite"); transaction.objectStore("mutations").put({ requestId: "m1", status: "pending", domainKey: entity.domainKey }); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
  const result = await repository.refresh("TBM1");
  expect(result.data.segments).toEqual([expect.objectContaining({ ringNo: "P1", status: "server", syncStatus: "pending" })]);
});
