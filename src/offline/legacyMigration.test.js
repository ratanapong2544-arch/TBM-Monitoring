import "fake-indexeddb/auto";

if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));

import { deleteOfflineDbForTests, openOfflineDb } from "./db";
import { reconcileLegacyStage, stageLegacyLocalStorage } from "./legacyMigration";

function readRecord(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

beforeEach(async () => {
  window.localStorage.clear();
  await deleteOfflineDbForTests();
});

afterEach(async () => {
  await deleteOfflineDbForTests();
});

test("stages parseable legacy values without changing localStorage", async () => {
  const db = await openOfflineDb();
  const storage = window.localStorage;
  storage.setItem("tbmIssues", JSON.stringify([{ id: "issue-1", title: "Local issue" }]));

  await stageLegacyLocalStorage(db, storage);

  expect(storage.getItem("tbmIssues")).toBe('[{"id":"issue-1","title":"Local issue"}]');
  expect(await readRecord(db, "syncMeta", "legacy:tbmIssues")).toMatchObject({
    key: "legacy:tbmIssues",
    value: [{ id: "issue-1", title: "Local issue" }],
    legacyStagedAt: expect.any(String)
  });
});

test("preserves malformed legacy values as parse errors", async () => {
  const db = await openOfflineDb();
  const storage = window.localStorage;
  storage.setItem("tbmIssues", "{not-json");

  await stageLegacyLocalStorage(db, storage);

  expect(await readRecord(db, "syncMeta", "legacy:tbmIssues")).toMatchObject({ parseError: true, raw: "{not-json" });
  expect(storage.getItem("tbmIssues")).toBe("{not-json");
});

test("confirms identical staged records and creates no mutation", async () => {
  const db = await openOfflineDb();
  const storage = window.localStorage;
  storage.setItem("tbmIssues", JSON.stringify([{ id: "issue-1", title: "Same" }]));
  await stageLegacyLocalStorage(db, storage);

  await reconcileLegacyStage(db, { issues: [{ id: "issue-1", title: "Same" }] });

  expect(await readRecord(db, "syncMeta", "legacy:tbmIssues")).toMatchObject({ confirmed: true });
  expect(await readAll(db, "mutations")).toEqual([]);
  expect(await readAll(db, "conflicts")).toEqual([]);
});

test("staged local differences become conflicts without auto-enqueuing", async () => {
  const db = await openOfflineDb();
  const storage = window.localStorage;
  storage.setItem("tbmIssues", JSON.stringify([{ id: "issue-1", title: "Local" }]));
  await stageLegacyLocalStorage(db, storage);

  await reconcileLegacyStage(db, { issues: [{ id: "issue-1", title: "Server" }] });

  expect(await readAll(db, "conflicts")).toEqual([expect.objectContaining({
    reason: "legacy_local_difference",
    domainKey: "issue:GLOBAL:issue-1"
  })]);
  expect(await readAll(db, "mutations")).toEqual([]);
});

test("keys a machineless legacy daily report to TBM1 like the server does", async () => {
  const db = await openOfflineDb();
  const storage = window.localStorage;
  storage.setItem("tbmDailyReports", JSON.stringify([{ id: "daily-1", machine: "", area: "Local" }]));
  await stageLegacyLocalStorage(db, storage);

  await reconcileLegacyStage(db, { dailyReports: [{ id: "daily-1", machine: "TBM1", area: "Server" }] });

  expect(await readAll(db, "conflicts")).toEqual([expect.objectContaining({
    reason: "legacy_local_difference",
    domainKey: "dailyReport:TBM1:daily-1"
  })]);
  expect(await readAll(db, "mutations")).toEqual([]);
});

test("staged instrument families keep their own key namespaces", async () => {
  // borrowing the "instrument" key would let a location or threshold resolution write its payload
  // into the instrument sheet
  const db = await openOfflineDb();
  const storage = window.localStorage;
  storage.setItem("instLocations", JSON.stringify([{ id: "loc1", name: "Local" }]));
  storage.setItem("instThresholds", JSON.stringify([{ id: "th1", alert: 5 }]));
  await stageLegacyLocalStorage(db, storage);

  await reconcileLegacyStage(db, { instLocations: [{ id: "loc1", name: "Server" }], instThresholds: [{ id: "th1", alert: 9 }] });

  const domainKeys = (await readAll(db, "conflicts")).map(conflict => conflict.domainKey).sort();
  expect(domainKeys).toEqual(["instLocation:GLOBAL:loc1", "instThreshold:GLOBAL:th1"]);
});

test("confirms plan config by domain when equivalent records have different ids", async () => {
  const db = await openOfflineDb();
  const storage = window.localStorage;
  storage.setItem("tbmPlanConfig", JSON.stringify({ id: "legacy-plan", totalRings: 450, startRing: 1 }));
  await stageLegacyLocalStorage(db, storage);

  await reconcileLegacyStage(db, {
    planConfig: { id: "server-plan", totalRings: 450, startRing: 1 }
  });

  expect(await readRecord(db, "syncMeta", "legacy:tbmPlanConfig")).toMatchObject({ confirmed: true });
  expect(await readAll(db, "conflicts")).toEqual([]);
  expect(await readAll(db, "mutations")).toEqual([]);
});

test("confirms a JSON-string encoded plan config without enqueuing", async () => {
  const db = await openOfflineDb();
  const storage = window.localStorage;
  storage.setItem("tbmPlanConfig", JSON.stringify({ totalRings: 450, startRing: 1 }));
  await stageLegacyLocalStorage(db, storage);

  await reconcileLegacyStage(db, {
    planConfig: JSON.stringify({ totalRings: 450, startRing: 1 })
  });

  expect(await readRecord(db, "syncMeta", "legacy:tbmPlanConfig")).toMatchObject({ confirmed: true });
  expect(await readAll(db, "conflicts")).toEqual([]);
  expect(await readAll(db, "mutations")).toEqual([]);
});

test("confirms a JSON-string encoded distance config without enqueuing", async () => {
  const db = await openOfflineDb();
  const storage = window.localStorage;
  storage.setItem("tbmDistancePlanConfig", JSON.stringify({ targetMeters: 1200, startChainage: 100 }));
  await stageLegacyLocalStorage(db, storage);

  await reconcileLegacyStage(db, {
    distPlanConfig: JSON.stringify({ targetMeters: 1200, startChainage: 100 })
  });

  expect(await readRecord(db, "syncMeta", "legacy:tbmDistancePlanConfig")).toMatchObject({ confirmed: true });
  expect(await readAll(db, "conflicts")).toEqual([]);
  expect(await readAll(db, "mutations")).toEqual([]);
});

test("treats an invalid JSON-string config as a nonmatching legacy difference", async () => {
  const db = await openOfflineDb();
  const storage = window.localStorage;
  storage.setItem("tbmPlanConfig", JSON.stringify({ totalRings: 450 }));
  await stageLegacyLocalStorage(db, storage);

  await reconcileLegacyStage(db, { planConfig: "{invalid" });

  expect(await readRecord(db, "syncMeta", "legacy:tbmPlanConfig")).toMatchObject({ confirmed: false });
  expect(await readAll(db, "conflicts")).toEqual([expect.objectContaining({
    reason: "legacy_local_difference",
    domainKey: "planConfig:TBM1"
  })]);
  expect(await readAll(db, "mutations")).toEqual([]);
});

// --- Task 9 Step 2: the migration comparison scenarios the plan names -----------------------------

test("a legacy record the server has never seen becomes a conflict carrying no server side", async () => {
  // The record whose `apiCall` never landed. It is the whole reason the promotion gate binds Tasks
  // 7-9: reconciliation is what keeps it from being erased the first time the server answers.
  const db = await openOfflineDb();
  const storage = window.localStorage;
  storage.setItem("tbmIssues", JSON.stringify([{ id: "issue-1", title: "Same" }, { id: "issue-2", title: "Recorded underground" }]));
  await stageLegacyLocalStorage(db, storage);

  await reconcileLegacyStage(db, { issues: [{ id: "issue-1", title: "Same" }] });

  expect(await readAll(db, "conflicts")).toEqual([expect.objectContaining({
    reason: "legacy_local_difference",
    domainKey: "issue:GLOBAL:issue-2",
    local: { id: "issue-2", title: "Recorded underground" },
    server: null,
  })]);
  expect(await readRecord(db, "syncMeta", "legacy:tbmIssues")).toMatchObject({ confirmed: false });
  expect(await readAll(db, "mutations")).toEqual([]);
});

test("an engineering value that differs conflicts even when every other field matches", async () => {
  const db = await openOfflineDb();
  const storage = window.localStorage;
  storage.setItem("instReadings", JSON.stringify([{ id: "rd_1", instrumentId: "ins_1", date: "2026-07-30", value: 12.4 }]));
  await stageLegacyLocalStorage(db, storage);

  await reconcileLegacyStage(db, { instReadings: [{ id: "rd_1", instrumentId: "ins_1", date: "2026-07-30", value: 12.5 }] });

  expect(await readAll(db, "conflicts")).toEqual([expect.objectContaining({
    reason: "legacy_local_difference",
    domainKey: "instReading:GLOBAL:rd_1",
    local: expect.objectContaining({ value: 12.4 }),
    server: expect.objectContaining({ value: 12.5 }),
  })]);
});

test("a malformed legacy value survives reconciliation as a diagnostic, unconfirmed and undiscarded", async () => {
  const db = await openOfflineDb();
  const storage = window.localStorage;
  storage.setItem("tbmIssues", "{not-json");
  await stageLegacyLocalStorage(db, storage);

  await reconcileLegacyStage(db, { issues: [{ id: "issue-1", title: "Server" }] });

  const staged = await readRecord(db, "syncMeta", "legacy:tbmIssues");
  expect(staged).toMatchObject({ parseError: true, raw: "{not-json" });
  expect(staged.confirmed).toBeUndefined(); // never claimed as reconciled — nothing could be compared
  expect(storage.getItem("tbmIssues")).toBe("{not-json");
  expect(await readAll(db, "conflicts")).toEqual([]);
});

test("reconciling twice leaves one conflict, and does not reopen one already resolved", async () => {
  // Reconciliation runs on every launch. A second pass that re-put `status: "open"` would resurrect
  // a conflict the crew had already dealt with, which is the failure mode "idempotent" is guarding.
  const db = await openOfflineDb();
  const storage = window.localStorage;
  storage.setItem("tbmIssues", JSON.stringify([{ id: "issue-1", title: "Local" }]));
  await stageLegacyLocalStorage(db, storage);

  await reconcileLegacyStage(db, { issues: [{ id: "issue-1", title: "Server" }] });
  const [first] = await readAll(db, "conflicts");
  await new Promise(resolve => {
    const store = db.transaction("conflicts", "readwrite").objectStore("conflicts");
    store.put({ ...first, status: "resolved" }).onsuccess = () => resolve();
  });

  await stageLegacyLocalStorage(db, storage);
  await reconcileLegacyStage(db, { issues: [{ id: "issue-1", title: "Server" }] });

  const conflicts = await readAll(db, "conflicts");
  expect(conflicts).toHaveLength(1);
  expect(conflicts[0].status).toBe("resolved");
});
