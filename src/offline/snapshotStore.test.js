import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));
import { deleteOfflineDbForTests, openOfflineDb } from "./db";
import { readServerSnapshot, writeServerSnapshot } from "./snapshotStore";
import { normalizeServerData } from "./normalizeServerData";

beforeEach(async () => { await deleteOfflineDbForTests(); });
afterEach(async () => { await deleteOfflineDbForTests(); });

test("persists and reconstructs a normalized snapshot with metadata", async () => {
  const db = await openOfflineDb();
  const data = normalizeServerData({ segments: [{ ringNo: "P1" }], planConfig: { rings: 1 }, routeConfigs: { TBM1: { route: "A" } } }, "TBM1");
  await writeServerSnapshot(db, "TBM1", data, "2026-07-29T00:00:00.000Z");
  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({ ...data, fetchedAt: "2026-07-29T00:00:00.000Z" }));
  const snapshot = await new Promise((resolve, reject) => { const request = db.transaction("snapshots").objectStore("snapshots").get("getData:TBM1"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  expect(snapshot.entityKeys.segments).toHaveLength(1);
  expect(snapshot.planConfig).toEqual({ rings: 1 });
});

test("preserves a pending optimistic entity by domain key when server data arrives", async () => {
  const db = await openOfflineDb();
  const first = normalizeServerData({ segments: [{ ringNo: "P1", status: "local", syncStatus: "pending" }] }, "TBM1");
  await writeServerSnapshot(db, "TBM1", first, "first");
  await writeServerSnapshot(db, "TBM1", normalizeServerData({ segments: [{ ringNo: "P1", status: "server" }, { ringNo: "P2" }] }, "TBM1"), "second");
  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({ segments: expect.arrayContaining([expect.objectContaining({ ringNo: "P1", status: "local", syncStatus: "pending" }), expect.objectContaining({ ringNo: "P2" })]) }));
});

test("returns no snapshot before one has been written", async () => {
  await expect(readServerSnapshot(await openOfflineDb(), "TBM1")).resolves.toBeNull();
});
