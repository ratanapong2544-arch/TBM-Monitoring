import { entityKeyForRecord, isLegacyOptimisticKey, isOptimisticKey, optimisticEntityKey, serverEntityKey } from "./entityKeys";

const serverRow = (domainKey, rowId) => serverEntityKey("TBM1", "segments", domainKey, `id:${rowId}`);

test("a key names the row it came from, and no other", () => {
  // two rows can share a ring, so this is what tells them apart — and it is the only question
  // anything asks about a key
  const row = serverRow("segment:TBM1:P643:Permanent", "seg_b");
  expect(entityKeyForRecord(row, "seg_b")).toBe(true);
  expect(entityKeyForRecord(row, "seg_a")).toBe(false);
});

test("a queued copy names its row the same way a server row does", () => {
  // both shapes end `:id:<recordId>`, which is what lets one rule cover both
  const queued = optimisticEntityKey("segment:TBM1:P643:Permanent", "seg_b");
  expect(entityKeyForRecord(queued, "seg_b")).toBe(true);
  expect(entityKeyForRecord(queued, "seg_a")).toBe(false);
  expect(isOptimisticKey(queued)).toBe(true);
  expect(isOptimisticKey(serverRow("segment:TBM1:P643:Permanent", "seg_b"))).toBe(false);
});

test("a record id that is a prefix of another's does not match it", () => {
  // secondary grout keys end in the record id, so `sg_1` is a strict prefix of `sg_10`: matching on
  // the prefix would take the wrong injection's row out of the snapshot's key list
  const row = serverRow("secondaryGrout:TBM1:P41:sg_10", "sg_10");
  expect(entityKeyForRecord(row, "sg_1")).toBe(false);
  expect(entityKeyForRecord(row, "sg_10")).toBe(true);
});

test("an absent record id names no row rather than every row", () => {
  // a key whose id came back empty would end `:id:`, which is what a bare `endsWith` would match
  const empty = serverRow("segment:TBM1:P643:Permanent", "");
  expect(entityKeyForRecord(empty, "")).toBe(false);
  expect(entityKeyForRecord(empty, null)).toBe(false);
  expect(entityKeyForRecord(empty, undefined)).toBe(false);
});

test("a v2 key is recognised as one to re-key, and a v3 key is not", () => {
  // the migration matches on this: v2 wrote one optimistic row per ring, v3 one per record
  expect(isLegacyOptimisticKey("entity:optimistic:segment:TBM1:P643:Permanent")).toBe(true);
  expect(isLegacyOptimisticKey(optimisticEntityKey("segment:TBM1:P643:Permanent", "seg_b"))).toBe(false);
  expect(isLegacyOptimisticKey(serverRow("segment:TBM1:P643:Permanent", "seg_b"))).toBe(false);
});
