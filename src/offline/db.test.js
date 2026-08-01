import "fake-indexeddb/auto";

if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));

import { closeOfflineDb, deleteOfflineDbForTests, openOfflineDb, OPEN_DB_TIMEOUT_MS, recanonicalizeDomainKeys } from "./db";
import { getOrCreateDeviceId } from "./device";
import { makeDomainKey, syncDateKey } from "./domainKey";
import { readServerSnapshot } from "./snapshotStore";

beforeEach(async () => {
  await deleteOfflineDbForTests();
});

afterEach(async () => {
  await deleteOfflineDbForTests();
});

test("creates all durable stores", async () => {
  const db = await openOfflineDb();

  expect([...db.objectStoreNames]).toEqual(expect.arrayContaining([
    "entities", "snapshots", "mutations", "conflicts", "syncMeta", "deviceMeta"
  ]));
});

test("an open that never settles rejects instead of hanging", async () => {
  // Two real causes: another tab still on an older DB_VERSION after a service-worker update (the
  // upgrade waits for it and fires `blocked`), and the WebKit stall on iOS, which fires nothing at
  // all. Every caller awaits this promise, and the only place `loading` is cleared is inside those
  // callers — so an open that never settles leaves the crew on the splash screen with no message
  // and no way out but a reload, while the server payload sits in memory unused.
  jest.useFakeTimers();
  const realOpen = indexedDB.open;
  indexedDB.open = () => ({ result: null, error: null }); // fires nothing, ever
  try {
    const pending = openOfflineDb();
    const settled = jest.fn();
    pending.then(settled, settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    jest.advanceTimersByTime(OPEN_DB_TIMEOUT_MS);
    await expect(pending).rejects.toThrow(/timed out/i);
  } finally {
    indexedDB.open = realOpen;
    jest.useRealTimers();
  }
});

test("an upgrade blocked by another tab rejects instead of hanging", async () => {
  const realOpen = indexedDB.open;
  indexedDB.open = () => {
    const request = { result: null, error: null, onblocked: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    setTimeout(() => { if (request.onblocked) request.onblocked(); }, 0);
    return request;
  };
  try {
    await expect(openOfflineDb()).rejects.toThrow(/blocked/i);
  } finally {
    indexedDB.open = realOpen;
  }
});

test("a rejected open does not poison the next attempt", async () => {
  // the blocking tab closes, or the stall clears — the next open must be allowed to succeed
  const realOpen = indexedDB.open;
  indexedDB.open = () => {
    const request = { result: null, error: null, onblocked: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    setTimeout(() => { if (request.onblocked) request.onblocked(); }, 0);
    return request;
  };
  try { await openOfflineDb(); } catch (error) { /* expected */ }
  indexedDB.open = realOpen;

  const db = await openOfflineDb();
  expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(["entities"]));
});

test("an abandoned open giving up later does not discard a newer attempt", async () => {
  // closeOfflineDb during a pending open leaves that request orphaned. Whenever it finally gives up
  // — its timeout, or a late `blocked` — it must not clear the module's promise, which by then
  // belongs to a newer, valid open: that would leak the live connection and make the next caller
  // open a third one against the same database.
  const realOpen = indexedDB.open;
  let orphan;
  try {
    indexedDB.open = () => { orphan = { result: null, error: null, onblocked: null, onsuccess: null, onerror: null, onupgradeneeded: null }; return orphan; };
    const abandoned = openOfflineDb();
    abandoned.catch(() => {});
    closeOfflineDb();

    indexedDB.open = realOpen;
    const db = await openOfflineDb();
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(["entities"]));

    orphan.onblocked(); // the abandoned open gives up, after the live one succeeded
    await expect(abandoned).rejects.toThrow(/blocked/i);

    expect(await openOfflineDb()).toBe(db); // the live connection is still the module's
  } finally {
    indexedDB.open = realOpen;
  }
});

test("device id is stable for one installation", async () => {
  const db = await openOfflineDb();

  expect(await getOrCreateDeviceId(db)).toBe(await getOrCreateDeviceId(db));

  closeOfflineDb();
  expect(await getOrCreateDeviceId(await openOfflineDb())).toBe(await getOrCreateDeviceId(await openOfflineDb()));
});

test("concurrent first reads retain one device identity", async () => {
  const db = await openOfflineDb();

  const ids = await Promise.all([getOrCreateDeviceId(db), getOrCreateDeviceId(db)]);

  expect(ids[0]).toBe(ids[1]);
});

test("ring domain keys include entity and machine", () => {
  expect(makeDomainKey({
    entityType: "segment", machine: "TBM1", recordId: "s1",
    payload: { ringNo: "P41", installType: "Permanent" }
  })).toBe("segment:TBM1:P41:Permanent");
});

test("domain keys use documented defaults for all entity families", () => {
  expect(makeDomainKey({ entityType: "grout", machine: "TBM2", recordId: "g1", payload: { ringNo: "42" } })).toBe("grout:TBM2:42:Primary");
  expect(makeDomainKey({ entityType: "shiftReport", machine: "TBM1", recordId: "r1", payload: { date: "2026-07-29", shift: "Night" } })).toBe("shiftReport:TBM1:2026-07-29:Night");
  expect(makeDomainKey({ entityType: "issue", recordId: "i1", payload: {} })).toBe("issue:GLOBAL:i1");
  expect(makeDomainKey({ entityType: "planConfig", machine: "TBM2", recordId: "ignored", payload: {} })).toBe("planConfig:TBM2");
});

test("every shared identity vector agrees with the client builder", () => {
  // the vectors file is the client/GAS contract, so the client must be pinned against it too —
  // otherwise a client-only edit could diverge without failing a test
  // eslint-disable-next-line global-require
  const vectors = require("../../tools/sync-domain-vectors.json");
  expect(vectors).toHaveLength(13);
  vectors.forEach(vector => {
    expect(makeDomainKey(vector.input)).toBe(vector.domainKey);
  });
});

test("upgrading re-keys records written under the earlier domain-key format", async () => {
  // GAS refuses a non-canonical key, so a mutation queued by an older build would be stranded
  const { DB_NAME } = require("./schema");
  const stale = "shiftReport:TBM1:2026-07-28T17:00:00.000Z:Day";
  const canonical = "shiftReport:TBM1:2026-07-29:Day";
  await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("entities", { keyPath: "key" });
      db.createObjectStore("snapshots", { keyPath: "scopeKey" });
      db.createObjectStore("mutations", { keyPath: "requestId" });
      db.createObjectStore("conflicts", { keyPath: "conflictId" });
      db.createObjectStore("syncMeta", { keyPath: "key" });
      db.createObjectStore("deviceMeta", { keyPath: "key" });
    };
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(["mutations", "entities", "conflicts"], "readwrite");
      transaction.objectStore("mutations").put({
        requestId: "old-1", status: "pending", entityType: "shiftReport", machine: "TBM1", recordId: "sr1",
        domainKey: stale, payload: { date: "2026-07-28T17:00:00.000Z", shift: "Day" },
      });
      transaction.objectStore("entities").put({ key: `entity:optimistic:${stale}`, entityType: "shiftReport", machine: "TBM1", domainKey: stale, payload: { id: "sr1" } });
      transaction.objectStore("conflicts").put({ conflictId: "c1", status: "open", requestId: "old-1", domainKey: stale });
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });

  const db = await openOfflineDb();
  const read = (store, key) => new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  expect(await read("mutations", "old-1")).toMatchObject({ status: "pending", domainKey: canonical });
  // re-keyed straight into the v3 shape (domain AND record), because this pass rewrites every
  // optimistic row anyway and two passes over one store inside one upgrade would interleave
  expect(await read("entities", `entity:optimistic:${canonical}:id:sr1`)).toMatchObject({ domainKey: canonical });
  expect(await read("entities", `entity:optimistic:${stale}`)).toBeUndefined();
  expect(await read("conflicts", "c1")).toMatchObject({ domainKey: canonical });
});

// The v2→v3 step, which every already-installed device runs exactly once — and the one the whole
// per-record key change depends on. Every other migration test opens at version 1, so this path had
// no coverage at all: the migration could be deleted outright and the suite stayed green.
test("upgrading from v2 gives each record its own optimistic row", async () => {
  const domainKey = "segment:TBM1:P643:Permanent";
  await seedAtVersion(2, {
    mutations: [
      { requestId: "m-a", status: "pending", entityType: "segment", machine: "TBM1", recordId: "seg_a", domainKey, payload: { id: "seg_a" } },
      { requestId: "m-b", status: "pending", entityType: "segment", machine: "TBM1", recordId: "seg_b", domainKey, payload: { id: "seg_b" } },
    ],
    // v2 held ONE optimistic row for the ring — which is the defect: the second queued write had
    // overwritten the first, so only the last one's payload survives to be re-keyed
    entities: [
      { key: `entity:optimistic:${domainKey}`, entityType: "segment", machine: "TBM1", domainKey, payload: { id: "seg_b", recordId: "seg_b", length: "9.99" } },
      { key: `entity:TBM1:segments:${domainKey}:id:seg_a`, entityType: "segment", machine: "TBM1", domainKey, payload: { id: "seg_a", length: "1.40" } },
    ],
    snapshots: [{ scopeKey: "getData:TBM1", machine: "TBM1", entityKeys: { segments: [`entity:optimistic:${domainKey}`] } }],
  });

  const db = await openOfflineDb();
  const keys = (await readAllStore(db, "entities")).map(row => row.key);

  expect(keys).toEqual([`entity:optimistic:${domainKey}:id:seg_b`]); // re-keyed by the record it names
  // the cached server row goes — its key named the old shape — and the snapshot's list is rebuilt
  // from what survived rather than cleared, so the queued row is still on screen after the upgrade
  expect((await readAllStore(db, "snapshots"))[0].entityKeys).toEqual({ segments: [`entity:optimistic:${domainKey}:id:seg_b`] });
  // and both mutations are untouched — neither crew edit is lost, they simply drain and rewrite
  expect((await readAllStore(db, "mutations")).map(row => row.requestId).sort()).toEqual(["m-a", "m-b"]);
});

test("upgrading from v2 keeps a row whose payload names its record only by recordId", async () => {
  // `optimisticEntity` injects `recordId` into the payload; older rows may carry that and no `id`
  const domainKey = "issue:GLOBAL:i1";
  await seedAtVersion(2, {
    mutations: [{ requestId: "m1", status: "pending", entityType: "issue", machine: null, recordId: "i1", domainKey, payload: { id: "i1" } }],
    entities: [{ key: `entity:optimistic:${domainKey}`, entityType: "issue", machine: "GLOBAL", domainKey, payload: { recordId: "i1", title: "offline" } }],
    snapshots: [],
  });

  const db = await openOfflineDb();
  expect((await readAllStore(db, "entities")).map(row => row.key)).toEqual([`entity:optimistic:${domainKey}:id:i1`]);
});

// What the crew SEES after an upgrade, which is a different question from what survives in the
// store. `readServerSnapshot` rebuilds every list from `snapshot.entityKeys` alone, so a migration
// that cleared the snapshots left the queued rows in IndexedDB and on no screen: a shift's work
// gone from the data log with only "N รายการรอซิงก์" to hint at it — a message about the queue,
// not about the app having forgotten the shift. Re-entering it then files a SECOND create for the
// one shift, and the first one wins the drain, so the sheet keeps the stub and never the full
// report. No shipped device is on v2 yet; the first task to bump DB_VERSION again makes it real.
test("upgrading from v2 leaves the crew's queued work on screen", async () => {
  const ringKey = "segment:TBM1:P644:Permanent";
  const shiftKey = "shiftReport:TBM1:2026-07-30:Night";
  await seedAtVersion(2, {
    mutations: [
      { requestId: "m-seg", status: "pending", entityType: "segment", machine: "TBM1", recordId: "seg_new", domainKey: ringKey, payload: { id: "seg_new" } },
      { requestId: "m-shift", status: "pending", entityType: "shiftReport", machine: "TBM1", recordId: "shift_1", domainKey: shiftKey, payload: { id: "shift_1" } },
    ],
    entities: [
      { key: `entity:optimistic:${ringKey}`, entityType: "segment", machine: "TBM1", domainKey: ringKey, payload: { id: "seg_new", ringNo: "P644" } },
      { key: `entity:optimistic:${shiftKey}`, entityType: "shiftReport", machine: "TBM1", domainKey: shiftKey, payload: { id: "shift_1", shift: "Night" } },
      { key: "entity:TBM1:segments:segment:TBM1:P600:Permanent:id:seg_old", entityType: "segment", machine: "TBM1", domainKey: "segment:TBM1:P600:Permanent", payload: { id: "seg_old" } },
    ],
    snapshots: [{
      scopeKey: "getData:TBM1", machine: "TBM1", fetchedAt: "2026-07-30T01:00:00.000Z",
      syncMeta: { [ringKey]: { version: 4, deleted: false } },
      entityKeys: { segments: ["entity:TBM1:segments:segment:TBM1:P600:Permanent:id:seg_old", `entity:optimistic:${ringKey}`], shiftReports: [`entity:optimistic:${shiftKey}`] },
    }],
  });

  const loaded = await readServerSnapshot(await openOfflineDb(), "TBM1");

  expect(loaded.segments.map(row => row.id)).toEqual(["seg_new"]);
  expect(loaded.shiftReports.map(row => row.id)).toEqual(["shift_1"]);
  // server-confirmed state, not cache: without it the next edit of that ring stamps a version from
  // before this device's own write and the server refuses it as a conflict nobody caused
  expect(loaded.syncMeta).toEqual({ [ringKey]: { version: 4, deleted: false } });
  // nothing has come from the server since, and saying otherwise puts a stale timestamp under a
  // list that holds only what the queue is carrying
  expect(loaded.fetchedAt).toBeNull();
});

test("a rebuilt snapshot names only the rows that belong to its machine", async () => {
  // getData answers per machine for the ring-scoped collections and project-wide for the rest, so
  // the same rule the queue patches by has to hold here: TBM2's ring belongs in TBM2's list only,
  // and an issue belongs in both.
  const tbm2Ring = "segment:TBM2:P12:Permanent";
  const issueKey = "issue:GLOBAL:i1";
  await seedAtVersion(2, {
    mutations: [],
    entities: [
      { key: `entity:optimistic:${tbm2Ring}`, entityType: "segment", machine: "TBM2", domainKey: tbm2Ring, payload: { id: "seg_2" } },
      { key: `entity:optimistic:${issueKey}`, entityType: "issue", machine: "GLOBAL", domainKey: issueKey, payload: { id: "i1" } },
    ],
    snapshots: [
      { scopeKey: "getData:TBM1", machine: "TBM1", entityKeys: {} },
      { scopeKey: "getData:TBM2", machine: "TBM2", entityKeys: {} },
    ],
  });

  const db = await openOfflineDb();
  const tbm1 = await readServerSnapshot(db, "TBM1");
  const tbm2 = await readServerSnapshot(db, "TBM2");

  expect(tbm1.segments).toEqual([]);
  expect(tbm2.segments.map(row => row.id)).toEqual(["seg_2"]);
  expect(tbm1.issues.map(row => row.id)).toEqual(["i1"]);
  expect(tbm2.issues.map(row => row.id)).toEqual(["i1"]);
});

test("a ring deleted offline does not come back when the database upgrades", async () => {
  // A queued delete's correct representation on screen is an ABSENCE, and the entities store cannot
  // hold one: `putOptimisticMutation` writes an optimistic row for a delete like any other write,
  // and it is `patchSnapshotKeys` that takes the key out of the list. So a rebuild that reads the
  // STORE puts the deleted ring back into the data log, the dashboards and the shift report's ring
  // count, badged as ordinary pending work — until the next successful getData, which underground
  // can be the next shift. Same rule as `deletePending` in the merge: in flight it hides.
  const ringKey = "segment:TBM1:P644:Permanent";
  await seedAtVersion(2, {
    mutations: [{ requestId: "m-del", status: "pending", operation: "delete", entityType: "segment", machine: "TBM1", recordId: "seg_x", domainKey: ringKey, payload: { id: "seg_x" } }],
    entities: [{ key: `entity:optimistic:${ringKey}`, entityType: "segment", machine: "TBM1", domainKey: ringKey, payload: { id: "seg_x", ringNo: "P644" } }],
    snapshots: [{ scopeKey: "getData:TBM1", machine: "TBM1", entityKeys: { segments: [] } }],
  });

  const db = await openOfflineDb();

  expect((await readServerSnapshot(db, "TBM1")).segments).toEqual([]);
  // the delete itself is untouched — it still has to reach the sheet
  expect((await readAllStore(db, "mutations")).map(row => row.requestId)).toEqual(["m-del"]);
});

test("a ring whose delete the server refused stays visible after an upgrade", async () => {
  // The other half of the same rule. A refused delete is not on its way to anything, and hiding its
  // row would take a record off every screen on this device while it sits on the sheet — permanently,
  // with nothing to see and nothing to press before Task 10. `deletePending` shows it; so does this.
  const ringKey = "segment:TBM1:P645:Permanent";
  await seedAtVersion(2, {
    mutations: [{ requestId: "m-del", status: "conflict", operation: "delete", entityType: "segment", machine: "TBM1", recordId: "seg_y", domainKey: ringKey, payload: { id: "seg_y" } }],
    entities: [{ key: `entity:optimistic:${ringKey}`, entityType: "segment", machine: "TBM1", domainKey: ringKey, payload: { id: "seg_y", ringNo: "P645" } }],
    snapshots: [{ scopeKey: "getData:TBM1", machine: "TBM1", entityKeys: { segments: [] } }],
  });

  const loaded = await readServerSnapshot(await openOfflineDb(), "TBM1");

  expect(loaded.segments.map(row => row.id)).toEqual(["seg_y"]);
});

test("deleting one row of a ring and correcting the other hides only the deleted one", async () => {
  // The tombstone is per RECORD, not per ring. Asked per ring, the newest mutation on this ring is
  // the CORRECTION, which is not a delete — so nothing is hidden and the deleted row is rebuilt onto
  // every screen, while the first refresh still hides it. That is the migration and the merge
  // disagreeing about one row, which is the whole class this rule exists to close, and it is the
  // per-row/per-ring confusion that produced the defects in the two rounds before it.
  // Two rows of one ring can both hold a queued copy in a v2 store only when the store carries both
  // key shapes — a device that rolled back and forward. Any later migration starts from v3, where
  // two queued rows on one ring is the ordinary case.
  const ringKey = "segment:TBM1:P648:Permanent";
  await seedAtVersion(2, {
    mutations: [
      { requestId: "m-del", status: "pending", operation: "delete", entityType: "segment", machine: "TBM1", recordId: "seg_a", domainKey: ringKey, payload: { id: "seg_a" }, queueSequence: 1 },
      { requestId: "m-fix", status: "pending", operation: "update", entityType: "segment", machine: "TBM1", recordId: "seg_b", domainKey: ringKey, payload: { id: "seg_b" }, queueSequence: 2 },
    ],
    entities: [
      { key: `entity:optimistic:${ringKey}`, entityType: "segment", machine: "TBM1", domainKey: ringKey, payload: { id: "seg_a" } },
      { key: `entity:optimistic:${ringKey}:id:seg_b`, entityType: "segment", machine: "TBM1", domainKey: ringKey, payload: { id: "seg_b" } },
    ],
    snapshots: [{ scopeKey: "getData:TBM1", machine: "TBM1", entityKeys: { segments: [] } }],
  });

  expect((await readServerSnapshot(await openOfflineDb(), "TBM1")).segments.map(row => row.id)).toEqual(["seg_b"]);
});

test("a delete whose claim was abandoned mid-post leaves its row visible", async () => {
  // A SYNCING lease that has expired is not a write in flight, it is one whose device was killed
  // mid-post; `unresolvedByRecord` drops it and `deletePending` shows the row. The migration must
  // agree — a row the upgrade hides and the first refresh shows is the same rule answering twice.
  const ringKey = "segment:TBM1:P646:Permanent";
  await seedAtVersion(2, {
    mutations: [{
      requestId: "m-del", status: "syncing", operation: "delete", entityType: "segment", machine: "TBM1",
      recordId: "seg_z", domainKey: ringKey, payload: { id: "seg_z" }, leaseExpiresAt: "2020-01-01T00:00:00.000Z",
    }],
    entities: [{ key: `entity:optimistic:${ringKey}`, entityType: "segment", machine: "TBM1", domainKey: ringKey, payload: { id: "seg_z" } }],
    snapshots: [{ scopeKey: "getData:TBM1", machine: "TBM1", entityKeys: { segments: [] } }],
  });

  expect((await readServerSnapshot(await openOfflineDb(), "TBM1")).segments.map(row => row.id)).toEqual(["seg_z"]);
});

test("a delete superseded by a later edit of the same record leaves its row visible", async () => {
  // `deletePending` reads the NEWEST unresolved mutation for the record, so an edit queued after a
  // delete takes its place and the row stands. Not reachable through the shipped forms today — a
  // deleted row leaves React state — but it is the rule, and Task 9 queues writes from more places.
  const ringKey = "segment:TBM1:P647:Permanent";
  await seedAtVersion(2, {
    mutations: [
      { requestId: "m-del", status: "pending", operation: "delete", entityType: "segment", machine: "TBM1", recordId: "seg_w", domainKey: ringKey, payload: { id: "seg_w" }, queueSequence: 1 },
      { requestId: "m-edit", status: "pending", operation: "update", entityType: "segment", machine: "TBM1", recordId: "seg_w", domainKey: ringKey, payload: { id: "seg_w" }, queueSequence: 2 },
    ],
    entities: [{ key: `entity:optimistic:${ringKey}`, entityType: "segment", machine: "TBM1", domainKey: ringKey, payload: { id: "seg_w" } }],
    snapshots: [{ scopeKey: "getData:TBM1", machine: "TBM1", entityKeys: { segments: [] } }],
  });

  expect((await readServerSnapshot(await openOfflineDb(), "TBM1")).segments.map(row => row.id)).toEqual(["seg_w"]);
});

test("a ring deleted offline does not come back on the v1 path either", async () => {
  // the same rule on the other migration path, where the tombstone has to be read from the
  // CANONICAL key — the one the row is being re-keyed into, not the one the mutation was stored with
  const stale = "issue:TBM1:i1";
  await seedV1({
    mutations: [{ requestId: "m-del", status: "pending", operation: "delete", entityType: "issue", machine: "TBM1", recordId: "i1", domainKey: stale, payload: { id: "i1" } }],
    entities: [{ key: `entity:optimistic:${stale}`, entityType: "issue", machine: "TBM1", domainKey: stale, payload: { id: "i1" } }],
  });
  await seedSnapshots([{ scopeKey: "getData:TBM1", machine: "TBM1", entityKeys: { issues: [] } }]);

  expect((await readServerSnapshot(await openOfflineDb(), "TBM1")).issues).toEqual([]);
});

test("two rows re-keying onto one key are named once, not twice", async () => {
  // `entities.put` is last-wins, so two source rows collapse to ONE stored row — the documented
  // collision this migration is built to survive (the same project-wide record edited under two
  // machines). Naming it once per SOURCE row makes `readServerSnapshot` resolve the same key twice
  // and render the record twice, which is exactly the defect open item 3 records as closed. Nothing
  // dedupes issues, daily reports, prep tasks or grouts, and `GroutDashboardView` averages by
  // `sum / length`.
  await seedV1({
    mutations: [
      { requestId: "m-tbm1", status: "pending", entityType: "issue", machine: "TBM1", recordId: "i1", domainKey: "issue:TBM1:i1", payload: { id: "i1" } },
      { requestId: "m-tbm2", status: "pending", entityType: "issue", machine: "TBM2", recordId: "i1", domainKey: "issue:TBM2:i1", payload: { id: "i1" } },
    ],
    entities: [
      { key: "entity:optimistic:issue:TBM1:i1", entityType: "issue", machine: "TBM1", domainKey: "issue:TBM1:i1", payload: { id: "i1", note: "from-tbm1" } },
      { key: "entity:optimistic:issue:TBM2:i1", entityType: "issue", machine: "TBM2", domainKey: "issue:TBM2:i1", payload: { id: "i1", note: "from-tbm2" } },
    ],
  });
  // WITH a snapshot: the existing collision test seeds none, so the rebuild never runs in it
  await seedSnapshots([{ scopeKey: "getData:TBM1", machine: "TBM1", entityKeys: { issues: [] } }]);

  const loaded = await readServerSnapshot(await openOfflineDb(), "TBM1");

  expect(loaded.issues).toHaveLength(1);
});

test("both key shapes for one record are named once", async () => {
  // the v2 path's version of the same collision: an install that rolled back and forward again can
  // hold the v2 and v3 keys for one record, and both re-key onto the v3 one
  const domainKey = "issue:GLOBAL:i1";
  await seedAtVersion(2, {
    mutations: [],
    entities: [
      { key: `entity:optimistic:${domainKey}`, entityType: "issue", machine: "GLOBAL", domainKey, payload: { id: "i1", note: "old-shape" } },
      { key: `entity:optimistic:${domainKey}:id:i1`, entityType: "issue", machine: "GLOBAL", domainKey, payload: { id: "i1", note: "new-shape" } },
    ],
    snapshots: [{ scopeKey: "getData:TBM1", machine: "TBM1", entityKeys: { issues: [] } }],
  });

  const loaded = await readServerSnapshot(await openOfflineDb(), "TBM1");

  expect(loaded.issues).toHaveLength(1);
});

test("a v2 row is re-keyed by the record id its key was built from, not the payload's id", async () => {
  // `optimisticEntity` injects `recordId`, and the runtime built the key from it — so that is what a
  // migration has to recover. Reading the payload's `id` first recovers the view's field instead,
  // which is right only while the two coincide: they do for every write Task 8 queues, and Task 9
  // adds the first types where they need not. Recovering the wrong one strands the row under a key
  // the queue never looks up, and the record then shows twice once its write confirms.
  const domainKey = "instReading:GLOBAL:R1";
  await seedAtVersion(2, {
    mutations: [{ requestId: "m1", status: "pending", entityType: "instReading", machine: null, recordId: "R1", domainKey, payload: { id: "sheet-row-7" } }],
    entities: [{ key: `entity:optimistic:${domainKey}`, entityType: "instReading", machine: "GLOBAL", domainKey, payload: { id: "sheet-row-7", recordId: "R1" } }],
    snapshots: [],
  });

  expect((await readAllStore(await openOfflineDb(), "entities")).map(row => row.key)).toEqual([`entity:optimistic:${domainKey}:id:R1`]);
});

test("a queued config edit is not rebuilt into any collection list", async () => {
  // The config entities are singletons overlaid from the entities store, not rows in a collection.
  // Naming one in a list makes `load` hand a plan-config body back as a ring, and the data log and
  // every dashboard downstream of it then read engineering fields off an object that has none.
  const configKey = "planConfig:TBM1";
  await seedAtVersion(2, {
    mutations: [],
    entities: [{ key: `entity:optimistic:${configKey}`, entityType: "planConfig", machine: "TBM1", domainKey: configKey, payload: { recordId: "planConfig", target: "12" } }],
    snapshots: [{ scopeKey: "getData:TBM1", machine: "TBM1", planConfig: { target: "9" }, entityKeys: {} }],
  });

  const db = await openOfflineDb();
  const loaded = await readServerSnapshot(db, "TBM1");

  expect(loaded.segments).toEqual([]);
  expect(loaded.planConfig).toEqual({ target: "9" });
  // it is still re-keyed and still in the store — the next refresh overlays it as the singleton
  expect((await readAllStore(db, "entities")).map(row => row.key)).toEqual([`entity:optimistic:${configKey}:id:planConfig`]);
});

test("upgrading from v1 leaves the crew's queued work on screen", async () => {
  // the same rule on the other migration path, which re-keys the domain as well as the record
  const stale = "issue:TBM1:i1";
  const canonical = "issue:GLOBAL:i1";
  await seedV1({
    mutations: [{ requestId: "m1", status: "pending", entityType: "issue", machine: "TBM1", recordId: "i1", domainKey: stale, payload: { id: "i1" } }],
    entities: [
      { key: `entity:optimistic:${stale}`, entityType: "issue", machine: "TBM1", domainKey: stale, payload: { id: "i1", title: "offline" } },
      { key: `entity:TBM1:issues:${stale}:id:i0`, entityType: "issue", machine: "TBM1", domainKey: "issue:TBM1:i0", payload: { id: "i0" } },
    ],
  });
  await seedSnapshots([{
    scopeKey: "getData:TBM1", machine: "TBM1", fetchedAt: "2026-07-30T01:00:00.000Z",
    syncMeta: { [canonical]: { version: 2, deleted: false } },
    entityKeys: { issues: [`entity:TBM1:issues:${stale}:id:i0`, `entity:optimistic:${stale}`] },
  }]);

  const loaded = await readServerSnapshot(await openOfflineDb(), "TBM1");

  expect(loaded.issues.map(row => row.title)).toEqual(["offline"]);
  expect(loaded.syncMeta).toEqual({ [canonical]: { version: 2, deleted: false } });
  expect(loaded.fetchedAt).toBeNull();
});

function seedSnapshots(rows) {
  const { DB_NAME } = require("./schema");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("snapshots", "readwrite");
      rows.forEach(row => transaction.objectStore("snapshots").put(row));
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
}

function seedAtVersion(version, records) {
  const { DB_NAME, STORES } = require("./schema");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      Object.values(STORES).forEach(name => {
        if (db.objectStoreNames.contains(name)) return;
        const keyPath = { entities: "key", snapshots: "scopeKey", mutations: "requestId", conflicts: "conflictId", syncMeta: "key", deviceMeta: "key" }[name];
        db.createObjectStore(name, { keyPath });
      });
    };
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(["mutations", "entities", "snapshots"], "readwrite");
      (records.mutations || []).forEach(row => transaction.objectStore("mutations").put(row));
      (records.entities || []).forEach(row => transaction.objectStore("entities").put(row));
      (records.snapshots || []).forEach(row => transaction.objectStore("snapshots").put(row));
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
}

function seedV1(records) {
  const { DB_NAME } = require("./schema");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("entities", { keyPath: "key" });
      db.createObjectStore("snapshots", { keyPath: "scopeKey" });
      db.createObjectStore("mutations", { keyPath: "requestId" });
      db.createObjectStore("conflicts", { keyPath: "conflictId" });
      db.createObjectStore("syncMeta", { keyPath: "key" });
      db.createObjectStore("deviceMeta", { keyPath: "key" });
    };
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(["mutations", "entities", "conflicts"], "readwrite");
      records.mutations.forEach(row => transaction.objectStore("mutations").put(row));
      records.entities.forEach(row => transaction.objectStore("entities").put(row));
      (records.conflicts || []).forEach(row => transaction.objectStore("conflicts").put(row));
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
}

function readAllStore(db, store) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

test("upgrading re-keys every domain, not just the first (no half-built remap race)", async () => {
  // the mutations/entities/conflicts passes must be strictly sequenced; a concurrent-cursor
  // version stranded ~half the optimistic entities because their remap was not yet built
  const mutations = [];
  const entities = [];
  for (let index = 0; index < 12; index += 1) {
    const stale = `issue:TBM1:i${index}`;
    // request ids deliberately unordered relative to the entity key order
    mutations.push({ requestId: `zzz-${11 - index}-${index}`, status: "pending", entityType: "issue", machine: "TBM1", recordId: `i${index}`, domainKey: stale, payload: { id: `i${index}` } });
    entities.push({ key: `entity:optimistic:${stale}`, entityType: "issue", machine: "TBM1", domainKey: stale, payload: { id: `i${index}` } });
  }
  await seedV1({ mutations, entities });

  const db = await openOfflineDb();
  const mutationKeys = (await readAllStore(db, "mutations")).map(row => row.domainKey).sort();
  const entityKeys = (await readAllStore(db, "entities")).map(row => row.domainKey).sort();
  const expected = Array.from({ length: 12 }, (unused, index) => `issue:GLOBAL:i${index}`).sort();
  expect(mutationKeys).toEqual(expected);
  expect(entityKeys).toEqual(expected);
});

test("the migration requests the entity and conflict passes only after the mutation remap is built", () => {
  // pins the sequencing directly, independent of the IndexedDB implementation: fake-indexeddb
  // serializes getAll so the multi-domain test alone would not catch a revert to concurrent cursors
  const order = [];
  const stale = "issue:TBM1:i1";
  function fakeStore(name, rows) {
    return {
      getAll() {
        order.push(`getAll:${name}`);
        const request = {};
        Promise.resolve().then(() => request.onsuccess && request.onsuccess({ target: { result: rows } }));
        return request;
      },
      put() { order.push(`put:${name}`); },
      delete() { order.push(`delete:${name}`); },
      clear() { order.push(`clear:${name}`); },
    };
  }
  const stores = {
    mutations: fakeStore("mutations", [{ requestId: "m1", entityType: "issue", machine: "TBM1", recordId: "i1", domainKey: stale, payload: { id: "i1" } }]),
    entities: fakeStore("entities", [{ key: `entity:optimistic:${stale}`, entityType: "issue", domainKey: stale, payload: { id: "i1" } }]),
    conflicts: fakeStore("conflicts", []),
    snapshots: fakeStore("snapshots", [{ scopeKey: "getData:TBM1", machine: "TBM1", entityKeys: {} }]),
  };
  recanonicalizeDomainKeys({ objectStore: name => stores[name] });

  return Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve()).then(() => {
    const snapshotsGetAll = order.indexOf("getAll:snapshots");
    const mutationsGetAll = order.indexOf("getAll:mutations");
    const entitiesGetAll = order.indexOf("getAll:entities");
    const conflictsGetAll = order.indexOf("getAll:conflicts");
    // the snapshots are read first because the rebuild needs them, and the rest keeps its order
    expect(snapshotsGetAll).toBe(0);
    expect(mutationsGetAll).toBeGreaterThan(snapshotsGetAll);
    expect(entitiesGetAll).toBeGreaterThan(mutationsGetAll);
    expect(conflictsGetAll).toBeGreaterThan(mutationsGetAll);
    // the remap-building put on mutations happens before the entity pass is even requested
    expect(order.indexOf("put:mutations")).toBeLessThan(entitiesGetAll);
    // rebuilt from the surviving rows, never cleared: clearing takes the crew's queued work off
    // every screen, because `load` has nothing left to rebuild the lists from
    expect(order).toContain("put:snapshots");
    expect(order).not.toContain("clear:snapshots");
    expect(order.indexOf("put:snapshots")).toBeGreaterThan(entitiesGetAll);
  });
});

test("upgrading survives two records re-keying onto one canonical key", async () => {
  // the same project-wide record edited under two machines both collapse to issue:GLOBAL:i1;
  // add() would throw ConstraintError and abort the upgrade, permanently bricking the database
  await seedV1({
    mutations: [
      { requestId: "m-tbm1", status: "pending", entityType: "issue", machine: "TBM1", recordId: "i1", domainKey: "issue:TBM1:i1", payload: { id: "i1" } },
      { requestId: "m-tbm2", status: "pending", entityType: "issue", machine: "TBM2", recordId: "i1", domainKey: "issue:TBM2:i1", payload: { id: "i1" } },
    ],
    entities: [
      { key: "entity:optimistic:issue:TBM1:i1", entityType: "issue", machine: "TBM1", domainKey: "issue:TBM1:i1", payload: { id: "i1", note: "from-tbm1" } },
      { key: "entity:optimistic:issue:TBM2:i1", entityType: "issue", machine: "TBM2", domainKey: "issue:TBM2:i1", payload: { id: "i1", note: "from-tbm2" } },
    ],
  });

  const db = await openOfflineDb();
  // both mutations survive (keyed by requestId), so neither offline edit is lost
  const mutations = await readAllStore(db, "mutations");
  expect(mutations.map(row => row.requestId).sort()).toEqual(["m-tbm1", "m-tbm2"]);
  expect(mutations.every(row => row.domainKey === "issue:GLOBAL:i1")).toBe(true);
  // one optimistic entity survives under the canonical key; the database is usable
  const entities = await readAllStore(db, "entities");
  expect(entities).toHaveLength(1);
  expect(entities[0].key).toBe("entity:optimistic:issue:GLOBAL:i1:id:i1");
});

test("upgrading re-keys an already-canonical install, and rebuilds the list that named the old keys", async () => {
  // Its domain keys need no remap, but its optimistic rows are still v2-shaped — one per domain,
  // which is what let two records sharing a ring overwrite each other. Re-keying them invalidates
  // the snapshot's key list, so the list is rebuilt from the rows that survived; leaving it would
  // make `load` resolve keys that no longer exist and return a gapped list.
  const canonical = "issue:GLOBAL:i1";
  await seedV1({
    mutations: [{ requestId: "m1", status: "pending", entityType: "issue", machine: null, recordId: "i1", domainKey: canonical, payload: { id: "i1" } }],
    entities: [{ key: `entity:optimistic:${canonical}`, entityType: "issue", machine: "GLOBAL", domainKey: canonical, payload: { id: "i1" } }],
    conflicts: [],
  });
  await new Promise((resolve, reject) => {
    const request = indexedDB.open(require("./schema").DB_NAME, 1);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("snapshots", "readwrite");
      transaction.objectStore("snapshots").put({ scopeKey: "getData:TBM1", machine: "TBM1", entityKeys: { issues: [`entity:optimistic:${canonical}`] } });
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });

  const db = await openOfflineDb();
  expect((await readAllStore(db, "snapshots"))[0].entityKeys).toEqual({ issues: [`entity:optimistic:${canonical}:id:i1`] });
  expect((await readAllStore(db, "entities"))[0].key).toBe(`entity:optimistic:${canonical}:id:i1`);
});

test("upgrading rewrites the stale key list instead of leaving load() a gapped one", async () => {
  // the cache's entityKeys reference pre-migration keys; re-keying the rows under them would make
  // load() resolve keys that no longer exist and drop the record. The list is rewritten to name what
  // survived: the pending mutation and its optimistic row are re-keyed and stay on screen, and the
  // cached server row goes, to be rebuilt on the first refresh.
  const stale = "issue:TBM1:i1";
  const canonical = "issue:GLOBAL:i1";
  await seedV1({
    mutations: [{ requestId: "m1", status: "pending", entityType: "issue", machine: "TBM1", recordId: "i1", domainKey: stale, payload: { id: "i1" } }],
    entities: [
      { key: `entity:optimistic:${stale}`, entityType: "issue", machine: "TBM1", domainKey: stale, payload: { id: "i1", note: "pending" } },
      { key: `entity:TBM1:issues:${stale}:id:i1`, entityType: "issue", machine: "TBM1", domainKey: stale, payload: { id: "i1", note: "cached" } },
    ],
    conflicts: [],
  });
  // seed the snapshot cache pointing at the stale keys
  await new Promise((resolve, reject) => {
    const request = indexedDB.open(require("./schema").DB_NAME, 1);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("snapshots", "readwrite");
      transaction.objectStore("snapshots").put({ scopeKey: "getData:TBM1", machine: "TBM1", entityKeys: { issues: [`entity:optimistic:${stale}`] } });
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });

  const db = await openOfflineDb();
  // durable: the mutation and its optimistic row are re-keyed and survive
  expect((await readAllStore(db, "mutations"))[0].domainKey).toBe(canonical);
  const entities = await readAllStore(db, "entities");
  expect(entities.map(row => row.key)).toEqual([`entity:optimistic:${canonical}:id:i1`]);
  // list: rewritten, so load() resolves every key it names and still shows the queued record
  expect((await readAllStore(db, "snapshots"))[0].entityKeys).toEqual({ issues: [`entity:optimistic:${canonical}:id:i1`] });
});

test("a shift report loaded from the server keys the same as the sheet date", () => {
  // GAS reads the sheet date cell as a Date and serializes it as UTC ISO, so editing a loaded
  // record must reduce back to the Asia/Bangkok calendar date or the version check is bypassed
  const canonical = makeDomainKey({ entityType: "shiftReport", machine: "TBM1", recordId: "r1", payload: { date: "2026-07-29", shift: "Day" } });
  expect(makeDomainKey({ entityType: "shiftReport", machine: "TBM1", recordId: "r1", payload: { date: "2026-07-28T17:00:00.000Z", shift: "Day" } })).toBe(canonical);
  expect(syncDateKey("2026-07-28T17:00:00.000Z")).toBe("2026-07-29");
  expect(syncDateKey("2026-07-29")).toBe("2026-07-29");
  expect(syncDateKey("")).toBe("");
});

test("only machine-scoped entities carry a machine in their domain key", () => {
  // GAS always bumps the GLOBAL key for these, so accepting a machine here would fork versions
  expect(makeDomainKey({ entityType: "issue", machine: "TBM1", recordId: "i1", payload: {} })).toBe("issue:GLOBAL:i1");
  expect(makeDomainKey({ entityType: "instReading", machine: "TBM2", recordId: "r1", payload: {} })).toBe("instReading:GLOBAL:r1");
  expect(makeDomainKey({ entityType: "dailyReport", machine: "TBM2", recordId: "d1", payload: {} })).toBe("dailyReport:TBM2:d1");
});
