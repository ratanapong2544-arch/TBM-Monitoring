import "fake-indexeddb/auto";

if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));

import { closeOfflineDb, deleteOfflineDbForTests, openOfflineDb } from "./db";
import { getOrCreateDeviceId } from "./device";
import { makeDomainKey, syncDateKey } from "./domainKey";

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
  expect(await read("entities", `entity:optimistic:${canonical}`)).toMatchObject({ domainKey: canonical });
  expect(await read("entities", `entity:optimistic:${stale}`)).toBeUndefined();
  expect(await read("conflicts", "c1")).toMatchObject({ domainKey: canonical });
});

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
  expect(entities[0].key).toBe("entity:optimistic:issue:GLOBAL:i1");
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
