import { entityKeyForRecord, isLegacyOptimisticKey, isOptimisticKey, optimisticEntityKey, serverEntityKey } from "./entityKeys";

const serverRow = (domainKey, rowId) => serverEntityKey("TBM1", "segments", domainKey, `id:${rowId}`);

test("a key names the row it came from, and no other", () => {
  // two rows can share a ring, so this is what tells them apart — and it is the only question
  // anything asks about a key
  const domain = "segment:TBM1:P643:Permanent";
  const row = serverRow(domain, "seg_b");
  expect(entityKeyForRecord(row, domain, "seg_b")).toBe(true);
  expect(entityKeyForRecord(row, domain, "seg_a")).toBe(false);
});

test("a key names the row's RING too, not just its record id", () => {
  // A record id is not unique on a live sheet: the captured production payload spreads seven ids
  // over sixteen rows, every pair on a different ring. Matching the `:id:` suffix alone let a
  // queued edit of one ring claim another ring's row — the edit landed on a ring nobody touched,
  // and a delete took away a ring the crew never asked to remove.
  const row = serverRow("segment:TBM1:P71:Permanent", "s1");
  expect(entityKeyForRecord(row, "segment:TBM1:P71:Permanent", "s1")).toBe(true);
  expect(entityKeyForRecord(row, "segment:TBM1:P37:Temporary", "s1")).toBe(false);
  const queued = optimisticEntityKey("segment:TBM1:P71:Permanent", "s1");
  expect(entityKeyForRecord(queued, "segment:TBM1:P71:Permanent", "s1")).toBe(true);
  expect(entityKeyForRecord(queued, "segment:TBM1:P37:Temporary", "s1")).toBe(false);
});

test("a queued copy names its row the same way a server row does", () => {
  // both shapes end `:id:<recordId>`, which is what lets one rule cover both
  const domain = "segment:TBM1:P643:Permanent";
  const queued = optimisticEntityKey(domain, "seg_b");
  expect(entityKeyForRecord(queued, domain, "seg_b")).toBe(true);
  expect(entityKeyForRecord(queued, domain, "seg_a")).toBe(false);
  expect(isOptimisticKey(queued)).toBe(true);
  expect(isOptimisticKey(serverRow("segment:TBM1:P643:Permanent", "seg_b"))).toBe(false);
});

test("a record id that is a prefix of another's does not match it", () => {
  // secondary grout keys end in the record id, so `sg_1` is a strict prefix of `sg_10`: matching on
  // the prefix would take the wrong injection's row out of the snapshot's key list
  const domain = "secondaryGrout:TBM1:P41:sg_10";
  const row = serverRow(domain, "sg_10");
  expect(entityKeyForRecord(row, domain, "sg_1")).toBe(false);
  expect(entityKeyForRecord(row, domain, "sg_10")).toBe(true);
});

test("an absent record id names no row rather than every row", () => {
  // a key whose id came back empty would end `:id:`, which is what a bare `endsWith` would match
  const domain = "segment:TBM1:P643:Permanent";
  const empty = serverRow(domain, "");
  expect(entityKeyForRecord(empty, domain, "")).toBe(false);
  expect(entityKeyForRecord(empty, domain, null)).toBe(false);
  expect(entityKeyForRecord(empty, domain, undefined)).toBe(false);
});

test("a v2 key is recognised as one to re-key, and a v3 key is not", () => {
  // the migration matches on this: v2 wrote one optimistic row per ring, v3 one per record
  expect(isLegacyOptimisticKey("entity:optimistic:segment:TBM1:P643:Permanent")).toBe(true);
  expect(isLegacyOptimisticKey(optimisticEntityKey("segment:TBM1:P643:Permanent", "seg_b"))).toBe(false);
  expect(isLegacyOptimisticKey(serverRow("segment:TBM1:P643:Permanent", "seg_b"))).toBe(false);
});
