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
