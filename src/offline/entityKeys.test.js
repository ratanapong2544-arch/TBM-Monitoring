import { entityKeyBelongsToDomain, entityKeyForRecord, entityKeyHasRecordId, optimisticEntityKey, serverEntityKey } from "./entityKeys";

const key = (domainKey, rowId) => serverEntityKey("TBM1", "segments", domainKey, `id:${rowId}`);

test("a record does not match another whose domain key merely starts the same way", () => {
  // The trailing colon is the whole guard, and secondary grout is where it earns its keep: those
  // keys end in the record id, so `…:sg_1` is a strict prefix of `…:sg_10`. Without it, a queued
  // edit of one injection would take the other's row out of the snapshot's key list — the second
  // injection on that ring would vanish from the log with nothing to say why.
  expect(entityKeyBelongsToDomain(key("secondaryGrout:TBM1:P41:sg_10", "sg_10"), "secondaryGrout:TBM1:P41:sg_1")).toBe(false);
  expect(entityKeyBelongsToDomain(key("secondaryGrout:TBM1:P41:sg_1", "sg_1"), "secondaryGrout:TBM1:P41:sg_1")).toBe(true);
  expect(entityKeyBelongsToDomain(key("segment:TBM1:P643:Permanent", "s1"), "segment:TBM1:P64:Permanent")).toBe(false);
});

test("the optimistic copy of a domain belongs to it", () => {
  expect(entityKeyBelongsToDomain(optimisticEntityKey("segment:TBM1:P643:Permanent"), "segment:TBM1:P643:Permanent")).toBe(true);
  expect(entityKeyBelongsToDomain(optimisticEntityKey("segment:TBM1:P644:Permanent"), "segment:TBM1:P643:Permanent")).toBe(false);
});

test("a key names the row it came from", () => {
  // two sheet rows can share a ring, so this is what tells them apart
  const row = key("segment:TBM1:P643:Permanent", "seg_b");
  expect(entityKeyForRecord(row, "seg_b")).toBe(true);
  expect(entityKeyForRecord(row, "seg_a")).toBe(false);
  expect(entityKeyHasRecordId(row)).toBe(true);
});

test("a row the sheet returned without an id is recognisable as such", () => {
  // it can only ever be matched by its domain, and the callers need to know that
  const row = serverEntityKey("TBM1", "segments", "segment:TBM1:P643:Permanent", "row:3");
  expect(entityKeyHasRecordId(row)).toBe(false);
  expect(entityKeyForRecord(row, "seg_a")).toBe(false);
});

test("an absent record id names no row rather than every row", () => {
  // the fixture has to be a key that WOULD match a bare `:id:` suffix, or the guard is never
  // exercised: a row whose id came back empty is exactly the case
  const empty = serverEntityKey("TBM1", "segments", "segment:TBM1:P643:Permanent", "id:");
  expect(entityKeyForRecord(empty, "")).toBe(false);
  expect(entityKeyForRecord(empty, null)).toBe(false);
  expect(entityKeyForRecord(empty, undefined)).toBe(false);
});
