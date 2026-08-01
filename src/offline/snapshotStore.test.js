import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));
import { deleteOfflineDbForTests, openOfflineDb } from "./db";
import { confirmMutation, putOptimisticMutation, updateMutation } from "./mutationStore";
import { readServerSnapshot, writeServerSnapshot } from "./snapshotStore";
import { normalizeServerData } from "./normalizeServerData";

beforeEach(async () => { await deleteOfflineDbForTests(); });
afterEach(async () => { await deleteOfflineDbForTests(); });

test("persists and reconstructs a normalized snapshot with metadata", async () => {
  const db = await openOfflineDb();
  const data = normalizeServerData({ segments: [{ ringNo: "P1" }], planConfig: { rings: 1 }, routeConfigs: { TBM1: { route: "A" } } }, "TBM1");
  await writeServerSnapshot(db, "TBM1", data, "2026-07-29T00:00:00.000Z");
  // `present` describes one response, not the cache: a snapshot read back from IndexedDB says
  // nothing about which collections the server most recently carried, so it is not persisted
  const { present, ...persisted } = data;
  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({ ...persisted, fetchedAt: "2026-07-29T00:00:00.000Z" }));
  await expect(readServerSnapshot(db, "TBM1")).resolves.not.toHaveProperty("present");
  const snapshot = await new Promise((resolve, reject) => { const request = db.transaction("snapshots").objectStore("snapshots").get("getData:TBM1"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  expect(snapshot.entityKeys.segments).toHaveLength(1);
  expect(snapshot.planConfig).toEqual({ rings: 1 });
});

test("returns every field of the snapshot it was given, except the ones it deliberately drops", async () => {
  // This function rebuilds its return value from `emptyServerData`, so anything added to
  // `normalizeServerData` and not copied across is silently lost — which is how `present` failed to
  // reach App and shut the create-a-report gate on every healthy device. The next field someone adds
  // should fail here rather than in the field.
  const db = await openOfflineDb();
  // EVERY field carries a distinguishing value. With only two populated, every other field
  // normalized to the same default `emptyServerData` supplies, so dropping it from the copy list
  // compared equal and passed — the invariant was blind to sixteen of eighteen fields, including
  // `shiftReports`, the one this whole task is about.
  const data = normalizeServerData({
    segments: [{ ringNo: "P1" }],
    grouts: [{ id: "g1", ringNo: "P1" }],
    secondaryGrouts: [{ id: "sg1", ringNo: "P1" }],
    shiftReports: [{ id: "sr1", date: "2026-07-29", shift: "Day" }],
    issues: [{ id: "iss1" }],
    dailyReports: [{ id: "dr1", machine: "TBM1", date: "2026-07-29" }],
    prepTasks: [{ id: "pt1", machine: "TBM1" }],
    instLocations: [{ id: "loc1" }],
    instInstruments: [{ id: "in1" }],
    instThresholds: [{ id: "th1" }],
    instReadings: [{ id: "rd1" }],
    instSchedules: [{ id: "sc1" }],
    planConfig: { rings: 1 },
    distPlanConfig: { metres: 2 },
    routeConfigs: { TBM1: { route: "A" } },
    routeProjectTotal: 3,
    machineProgress: { TBM1: 4 },
    syncMeta: { "segment:TBM1:P1:Permanent": { version: 5 } },
  }, "TBM1");
  const returned = await writeServerSnapshot(db, "TBM1", data, "2026-07-29T00:00:00.000Z");

  const dropped = Object.keys(data).filter(key => !(key in returned));
  // `present` describes one response, not a stored snapshot; `repository.refresh` re-attaches it
  expect(dropped).toEqual(["present"]);

  // Key presence alone is not enough: `committed` starts from `emptyServerData`, so a field added to
  // BOTH the normalizer and the empty shape — but not to the copy list — comes back present and
  // silently empty, carrying the default instead of the server's value. Compare the values.
  const carried = Object.keys(data).filter(key => key !== "present" && key !== "machine");
  carried.forEach(key => { expect({ [key]: returned[key] }).toEqual({ [key]: data[key] }); });
});

test("preserves a pending optimistic entity by domain key when server data arrives", async () => {
  const db = await openOfflineDb();
  const first = normalizeServerData({ segments: [{ ringNo: "P1", status: "local", syncStatus: "pending" }] }, "TBM1");
  await writeServerSnapshot(db, "TBM1", first, "first");
  await writeServerSnapshot(db, "TBM1", normalizeServerData({ segments: [{ ringNo: "P1", status: "server" }, { ringNo: "P2" }] }, "TBM1"), "second");
  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({ segments: expect.arrayContaining([expect.objectContaining({ ringNo: "P1", status: "local", syncStatus: "pending" }), expect.objectContaining({ ringNo: "P2" })]) }));
});

test("preserves an entity referenced by a pending mutation domain key", async () => {
  const db = await openOfflineDb();
  await writeServerSnapshot(db, "TBM1", normalizeServerData({ segments: [{ ringNo: "P1", status: "local" }] }, "TBM1"), "first");
  const entity = await new Promise((resolve, reject) => { const request = db.transaction("entities").objectStore("entities").getAll(); request.onsuccess = () => resolve(request.result[0]); request.onerror = () => reject(request.error); });
  await new Promise((resolve, reject) => { const transaction = db.transaction("mutations", "readwrite"); transaction.objectStore("mutations").put({ requestId: "m1", status: "pending", domainKey: entity.domainKey }); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
  await writeServerSnapshot(db, "TBM1", normalizeServerData({ segments: [{ ringNo: "P1", status: "server" }] }, "TBM1"), "second");
  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({ segments: [expect.objectContaining({ ringNo: "P1", status: "local", syncStatus: "pending" })] }));
});

test("keeps an offline-created project-wide record after a refresh", async () => {
  // an optimistic record is stamped with its mutation's machine (GLOBAL here), a server-derived one
  // with the active machine; comparing those labels dropped the local record from the list
  const db = await openOfflineDb();
  await putOptimisticMutation(db, {
    requestId: "m-issue", entityType: "issue", operation: "create", machine: null, recordId: "i-local",
    domainKey: "issue:GLOBAL:i-local", baseVersion: 0, deviceId: "device-1",
    createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { id: "i-local", title: "Offline issue" },
  });

  await writeServerSnapshot(db, "TBM1", normalizeServerData({ issues: [{ id: "i-server", title: "Server issue" }] }, "TBM1"), "after");

  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({
    issues: expect.arrayContaining([
      expect.objectContaining({ id: "i-local", syncStatus: "pending" }),
      expect.objectContaining({ id: "i-server" }),
    ]),
  }));
});

test("keeps an offline instrument edit instead of letting the server value win", async () => {
  // the snapshot collection label must match the sync entity name, or the optimistic record keys
  // differently from the incoming server record and is silently replaced on every refresh
  const db = await openOfflineDb();
  await writeServerSnapshot(db, "TBM1", normalizeServerData({ instInstruments: [{ id: "in1", installStatus: "pending" }] }, "TBM1"), "first");
  await putOptimisticMutation(db, {
    requestId: "m-inst", entityType: "instrument", operation: "update", machine: null, recordId: "in1",
    domainKey: "instrument:GLOBAL:in1", baseVersion: 1, deviceId: "device-1",
    createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { id: "in1", installStatus: "installed" },
  });

  await writeServerSnapshot(db, "TBM1", normalizeServerData({ instInstruments: [{ id: "in1", installStatus: "pending" }] }, "TBM1"), "second");

  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({
    instInstruments: [expect.objectContaining({ id: "in1", installStatus: "installed", syncStatus: "pending" })],
  }));
});

test("does not pull another machine's unsynced ring record into this machine's list", async () => {
  const db = await openOfflineDb();
  await putOptimisticMutation(db, {
    requestId: "m-seg-tbm2", entityType: "segment", operation: "create", machine: "TBM2", recordId: "s-tbm2",
    domainKey: "segment:TBM2:P9:Permanent", baseVersion: 0, deviceId: "device-1",
    createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { id: "s-tbm2", ringNo: "P9", installType: "Permanent" },
  });

  await writeServerSnapshot(db, "TBM1", normalizeServerData({ segments: [{ ringNo: "P1" }] }, "TBM1"), "after");

  const snapshot = await readServerSnapshot(db, "TBM1");
  expect(snapshot.segments.map(record => record.ringNo)).toEqual(["P1"]);
});

test("keeps a pending offline config edit through a refresh", async () => {
  // configs arrive as singletons rather than collection rows, so they need the same optimistic
  // overlay: without it the offline plan edit disappeared and was re-entered against itself
  const db = await openOfflineDb();
  await writeServerSnapshot(db, "TBM1", normalizeServerData({ planConfig: { target: 4 } }, "TBM1"), "first");
  await putOptimisticMutation(db, {
    requestId: "m-plan", entityType: "planConfig", operation: "update", machine: "TBM1", recordId: "planConfig",
    domainKey: "planConfig:TBM1", baseVersion: 1, deviceId: "device-1",
    createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { planConfig: { target: 9 } },
  });

  await writeServerSnapshot(db, "TBM1", normalizeServerData({ planConfig: { target: 4 } }, "TBM1"), "second");

  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({ planConfig: { target: 9 } }));
});

test("keeps a pending route config edit for the machine it belongs to", async () => {
  const db = await openOfflineDb();
  await putOptimisticMutation(db, {
    requestId: "m-route", entityType: "routeConfig", operation: "update", machine: "TBM2", recordId: "routeConfig",
    domainKey: "routeConfig:TBM2", baseVersion: 1, deviceId: "device-1",
    createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { routeConfig: { legs: [9] } },
  });

  await writeServerSnapshot(db, "TBM1", normalizeServerData({ routeConfigs: { TBM1: { legs: [1] }, TBM2: { legs: [2] } } }, "TBM1"), "after");

  const snapshot = await readServerSnapshot(db, "TBM1");
  expect(snapshot.routeConfigs).toEqual({ TBM1: { legs: [1] }, TBM2: { legs: [9] } });
});

test("does not re-collapse two same-domain server rows while a mutation is pending", async () => {
  // the optimistic overlay must replace at most one incoming row per domain, or the distinct
  // second row is lost and the optimistic record is listed twice
  const db = await openOfflineDb();
  await writeServerSnapshot(db, "TBM1", normalizeServerData({
    segments: [
      { id: "s-a", ringNo: "P1", installType: "Permanent", status: "In Progress" },
      { id: "s-b", ringNo: "P1", installType: "Permanent", status: "Completed" },
    ],
  }, "TBM1"), "first");
  await putOptimisticMutation(db, {
    requestId: "m-seg", entityType: "segment", operation: "update", machine: "TBM1", recordId: "s-a",
    domainKey: "segment:TBM1:P1:Permanent", baseVersion: 1, deviceId: "device-1",
    createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { id: "s-a", ringNo: "P1", installType: "Permanent", status: "edited" },
  });

  await writeServerSnapshot(db, "TBM1", normalizeServerData({
    segments: [
      { id: "s-a", ringNo: "P1", installType: "Permanent", status: "In Progress" },
      { id: "s-b", ringNo: "P1", installType: "Permanent", status: "Completed" },
    ],
  }, "TBM1"), "second");

  const snapshot = await readServerSnapshot(db, "TBM1");
  const statuses = snapshot.segments.map(record => record.status).sort();
  expect(snapshot.segments).toHaveLength(2);
  expect(statuses).toEqual(["Completed", "edited"]);
});

test("keeps a pending route project total, not only the config body", async () => {
  const db = await openOfflineDb();
  await putOptimisticMutation(db, {
    requestId: "m-route-total", entityType: "routeConfig", operation: "update", machine: "TBM1", recordId: "routeConfig",
    domainKey: "routeConfig:TBM1", baseVersion: 1, deviceId: "device-1",
    createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { routeConfig: { legs: [1, 2] }, routeProjectTotal: 6193 },
  });

  await writeServerSnapshot(db, "TBM1", normalizeServerData({ routeConfigs: { TBM1: { legs: [1] } }, routeProjectTotal: 5000 }, "TBM1"), "after");

  const snapshot = await readServerSnapshot(db, "TBM1");
  expect(snapshot.routeConfigs.TBM1).toEqual({ legs: [1, 2] });
  expect(snapshot.routeProjectTotal).toBe(6193);
});

test("a raw plan config keeps a field named routeProjectTotal (strip is routeConfig-only)", async () => {
  // routeProjectTotal is a routeConfig sibling stored in its own singleton; for plan/dist configs
  // the server keeps it in the body, so the client must not strip it there
  const db = await openOfflineDb();
  await putOptimisticMutation(db, {
    requestId: "m-plan-total", entityType: "planConfig", operation: "update", machine: "TBM1", recordId: "planConfig",
    domainKey: "planConfig:TBM1", baseVersion: 1, deviceId: "device-1",
    createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { totalRings: 450, routeProjectTotal: 99 },
  });

  await writeServerSnapshot(db, "TBM1", normalizeServerData({ planConfig: { totalRings: 400 } }, "TBM1"), "after");

  const snapshot = await readServerSnapshot(db, "TBM1");
  expect(snapshot.planConfig).toEqual({ totalRings: 450, routeProjectTotal: 99 });
});

test("a raw config payload overlays a clean body, without injected metadata keys", async () => {
  const db = await openOfflineDb();
  await putOptimisticMutation(db, {
    requestId: "m-plan-raw", entityType: "planConfig", operation: "update", machine: "TBM1", recordId: "planConfig",
    domainKey: "planConfig:TBM1", baseVersion: 1, deviceId: "device-1",
    createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { totalRings: 450, startRing: 1 },
  });

  await writeServerSnapshot(db, "TBM1", normalizeServerData({ planConfig: { totalRings: 400 } }, "TBM1"), "after");

  const snapshot = await readServerSnapshot(db, "TBM1");
  // the optimisticEntity payload injects recordId/entityType/machine/domainKey/version/syncStatus;
  // none of those belong in the stored config body
  expect(snapshot.planConfig).toEqual({ totalRings: 450, startRing: 1 });
});

test("keeps two server rows that share a ring identity distinct in the cache", async () => {
  // live sheets hold duplicate ring rows (the views dedupe them); keying the cache by domain alone
  // made one row overwrite the other and the survivor appear twice
  const db = await openOfflineDb();
  const data = normalizeServerData({
    segments: [
      { id: "s-old", ringNo: "P1", installType: "Permanent", status: "In Progress" },
      { id: "s-new", ringNo: "P1", installType: "Permanent", status: "Completed" },
    ],
  }, "TBM1");
  await writeServerSnapshot(db, "TBM1", data, "first");

  const cached = await readServerSnapshot(db, "TBM1");
  expect(cached.segments.map(record => record.id).sort()).toEqual(["s-new", "s-old"]);
});

test("lists a retained record once even when a stale server copy is also cached", async () => {
  const db = await openOfflineDb();
  await writeServerSnapshot(db, "TBM1", normalizeServerData({ segments: [{ id: "s1", ringNo: "P1", installType: "Permanent", length: "1.4" }] }, "TBM1"), "first");
  await putOptimisticMutation(db, {
    requestId: "m-seg", entityType: "segment", operation: "update", machine: "TBM1", recordId: "s1",
    domainKey: "segment:TBM1:P1:Permanent", baseVersion: 1, deviceId: "device-1",
    createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { id: "s1", ringNo: "P1", installType: "Permanent", length: "9.9" },
  });

  // the record is missing from this response (deleted elsewhere), so it must be retained — once
  await writeServerSnapshot(db, "TBM1", normalizeServerData({ segments: [] }, "TBM1"), "second");

  const snapshot = await readServerSnapshot(db, "TBM1");
  expect(snapshot.segments).toEqual([expect.objectContaining({ id: "s1", length: "9.9", syncStatus: "pending" })]);
});

test("prunes confirmed mutations past the retention window but keeps unsynced work", async () => {
  const db = await openOfflineDb();
  const write = (requestId, status, sequence) => new Promise((resolve, reject) => {
    const transaction = db.transaction("mutations", "readwrite");
    transaction.objectStore("mutations").put({ requestId, status, domainKey: `segment:TBM1:${requestId}:Permanent`, queueSequence: sequence });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  for (let index = 0; index < 210; index += 1) await write(`synced-${index}`, "synced", index);
  await write("still-pending", "pending", 500);
  await write("in-conflict", "conflict", 501);

  await writeServerSnapshot(db, "TBM1", normalizeServerData({ segments: [] }, "TBM1"), "after");

  const remaining = await new Promise((resolve, reject) => {
    const request = db.transaction("mutations").objectStore("mutations").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const statuses = remaining.map(mutation => mutation.status);
  expect(statuses.filter(status => status === "synced")).toHaveLength(200);
  expect(remaining.map(mutation => mutation.requestId)).toEqual(expect.arrayContaining(["still-pending", "in-conflict"]));
});

test("each overlapping write returns its own committed snapshot even when a later write wins the database", async () => {
  const db = await openOfflineDb();
  const originalTransaction = db.transaction.bind(db);
  const first = normalizeServerData({ segments: [{ ringNo: "P1", status: "first" }] }, "TBM1");
  const second = normalizeServerData({ segments: [{ ringNo: "P2", status: "second" }] }, "TBM1");
  let secondWrite;
  let intercepted = false;
  db.transaction = (stores, mode) => {
    if (!intercepted && mode === "readonly" && Array.from(stores).includes("snapshots")) {
      intercepted = true;
      secondWrite = writeServerSnapshot(db, "TBM1", second, "second");
    }
    return originalTransaction(stores, mode);
  };

  const firstResult = await writeServerSnapshot(db, "TBM1", first, "first");
  await secondWrite;

  expect(firstResult).toEqual(expect.objectContaining({ fetchedAt: "first", segments: [expect.objectContaining({ ringNo: "P1", status: "first" })] }));
  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({ fetchedAt: "second", segments: [expect.objectContaining({ ringNo: "P2", status: "second" })] }));
});

test("returns no snapshot before one has been written", async () => {
  await expect(readServerSnapshot(await openOfflineDb(), "TBM1")).resolves.toBeNull();
});

test.each(["syncing", "validation_error", "conflict"])("preserves a %s optimistic entity when server data refreshes", async status => {
  const db = await openOfflineDb();
  // the payload carries the row's id, as every real one does — GAS returns an Id column, and both
  // record forms set it. A fixture without it exercises the pre-sync legacy shape instead, where a
  // row cannot be matched to a record at all.
  const mutation = { requestId: `m-${status}`, entityType: "segment", operation: "update", machine: "TBM1", recordId: "segment-1", domainKey: "segment:TBM1:P1:Permanent", baseVersion: 1, deviceId: "device", createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { id: "segment-1", ringNo: "P1", installType: "Permanent", status: "local" } };
  await putOptimisticMutation(db, mutation);
  await updateMutation(db, mutation.requestId, status === "syncing" ? { status, syncOwner: "runner", leaseExpiresAt: "2099-07-29T01:00:00.000Z" } : { status });

  await writeServerSnapshot(db, "TBM1", normalizeServerData({ segments: [{ id: "segment-1", ringNo: "P1", status: "server" }] }, "TBM1"), "refresh");

  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({ segments: [expect.objectContaining({ status: "local", syncStatus: status })] }));
});

test.each([
  ["2099-07-29T01:00:00.000Z", []],
  ["2020-01-01T00:00:00.000Z", ["segment-1"]],
])("a delete claimed with a lease expiring %s hides its row: %s", async (leaseExpiresAt, visible) => {
  // A SYNCING claim is a post in flight, and its row stays hidden while it travels. A claim whose
  // lease has EXPIRED is not in flight — the device was killed mid-post — and hiding the row would
  // take a record off every screen here while it sits on the sheet. The migration in `db.js` reads
  // the same rule through the same function; before they shared one, either copy could be changed
  // with the other half's tests green, and then an upgrade hid a row the next refresh showed.
  const db = await openOfflineDb();
  const mutation = { requestId: "m-del", entityType: "segment", operation: "delete", machine: "TBM1", recordId: "segment-1", domainKey: "segment:TBM1:P1:Permanent", baseVersion: 1, deviceId: "device", createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { id: "segment-1", ringNo: "P1", installType: "Permanent" } };
  await putOptimisticMutation(db, mutation);
  await updateMutation(db, mutation.requestId, { status: "syncing", syncOwner: "runner", leaseExpiresAt });

  await writeServerSnapshot(db, "TBM1", normalizeServerData({ segments: [{ id: "segment-1", ringNo: "P1" }] }, "TBM1"), "refresh");

  const stored = await readServerSnapshot(db, "TBM1");
  expect(stored.segments.map(row => row.id)).toEqual(visible);
});

test.each(["validation_error", "conflict"])("keeps newer %s local state after confirming an older mutation then refreshing", async status => {
  const db = await openOfflineDb();
  const first = { requestId: "m-first", entityType: "segment", operation: "update", machine: "TBM1", recordId: "segment-1", domainKey: "segment:TBM1:P1:Permanent", baseVersion: 1, deviceId: "device", createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { id: "segment-1", ringNo: "P1", installType: "Permanent", status: "first" } };
  const second = { ...first, requestId: "m-second", payload: { ...first.payload, status: `newer-${status}` } };
  await putOptimisticMutation(db, first);
  await putOptimisticMutation(db, second);
  await updateMutation(db, second.requestId, { status });
  await confirmMutation(db, first.requestId, { record: { id: "segment-1", status: "server" }, version: 2, updatedAt: "2026-07-29T00:01:00.000Z" });

  await writeServerSnapshot(db, "TBM1", normalizeServerData({ segments: [{ id: "segment-1", ringNo: "P1", status: "server" }] }, "TBM1"), "refresh");

  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({ segments: [expect.objectContaining({ status: `newer-${status}`, syncStatus: status })] }));
});

test("does not preserve a resolved mutation's optimistic payload during refresh", async () => {
  const db = await openOfflineDb();
  const mutation = { requestId: "m-resolved", entityType: "segment", operation: "update", machine: "TBM1", recordId: "segment-1", domainKey: "segment:TBM1:P1:Permanent", baseVersion: 1, deviceId: "device", createdAtLocal: "2026-07-29T00:00:00.000Z", payload: { ringNo: "P1", installType: "Permanent", status: "local" } };
  await putOptimisticMutation(db, mutation);
  await updateMutation(db, mutation.requestId, { status: "resolved" });

  await writeServerSnapshot(db, "TBM1", normalizeServerData({ segments: [{ ringNo: "P1", status: "server" }] }, "TBM1"), "refresh");

  await expect(readServerSnapshot(db, "TBM1")).resolves.toEqual(expect.objectContaining({ segments: [expect.objectContaining({ status: "server" })] }));
});
