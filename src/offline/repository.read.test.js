import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));
import { deleteOfflineDbForTests, openOfflineDb } from "./db";
import { createRepository } from "./repository";
import { ApiFailure } from "./apiTransport";

beforeEach(async () => { await deleteOfflineDbForTests(); });
afterEach(async () => { await deleteOfflineDbForTests(); });

test("load returns an explicit empty shape before any snapshot", async () => {
  const repository = createRepository({ openDb: openOfflineDb });
  await expect(repository.load("TBM1")).resolves.toEqual(expect.objectContaining({ machine: "TBM1", segments: [], grouts: [], syncMeta: {} }));
});

test("refresh writes normalized server data and notifies subscribers", async () => {
  const fetchServerSnapshot = jest.fn().mockResolvedValue({ segments: [{ ringNo: "P1" }] });
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot });
  const subscriber = jest.fn();
  const unsubscribe = repository.subscribe(subscriber);
  await expect(repository.refresh("TBM1")).resolves.toEqual(expect.objectContaining({ segments: expect.arrayContaining([expect.objectContaining({ ringNo: "P1" })]) }));
  await expect(repository.load("TBM1")).resolves.toEqual(expect.objectContaining({ segments: expect.arrayContaining([expect.objectContaining({ ringNo: "P1" })]) }));
  expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({ type: "data", machine: "TBM1", data: expect.objectContaining({ segments: expect.arrayContaining([expect.objectContaining({ ringNo: "P1" })]) }) }));
  unsubscribe();
});

test("refresh retains a cached snapshot and emits the typed failure separately", async () => {
  const fetchServerSnapshot = jest.fn().mockResolvedValueOnce({ segments: [{ ringNo: "P1" }] }).mockRejectedValueOnce(new ApiFailure("retryable", "NETWORK"));
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot });
  const errors = jest.fn();
  repository.subscribeErrors(errors);
  await repository.refresh("TBM1");
  await expect(repository.refresh("TBM1")).rejects.toMatchObject({ kind: "retryable", code: "NETWORK" });
  await expect(repository.load("TBM1")).resolves.toEqual(expect.objectContaining({ segments: expect.arrayContaining([expect.objectContaining({ ringNo: "P1" })]) }));
  expect(errors).toHaveBeenCalledWith(expect.objectContaining({ machine: "TBM1", error: expect.objectContaining({ kind: "retryable", code: "NETWORK" }) }));
});
