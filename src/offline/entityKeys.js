import { makeDomainKey } from "./domainKey";

// How a row is named — the `entities` store's keys, and the two readers that answer "which record
// is this row", in one place. Everything that has to agree about a row's identity — the migrations,
// the snapshot merge and the on-screen list — imports from here rather than spelling it out.
//
// Two of them exist, and BOTH name one row. A live sheet legitimately holds two rows sharing a ring
// identity, so keying either shape by domain alone made one overwrite the other in the cache and
// then appear twice in the list — which is what happened first to the server rows and later, for the
// same reason, to the queued ones.
//
// This lives in its own leaf module because everything from the migration in `db.js` up to the
// snapshot merge needs it, and a second spelling of a key is not a cosmetic problem: the two halves
// simply stop finding each other's rows, silently.

// Per RECORD, not per domain. Keyed by domain alone, two records sharing a ring shared one
// optimistic row: the second queued write overwrote the first, and the snapshot key list ended up
// naming that single key twice — the same record rendered twice while the other one was deleted.
// Two rows on one ring is a supported state, so the local copy has to be able to represent it.
// `recordId` is required by `requireMutationEnvelope` for everything the queue accepts.
export function optimisticEntityKey(domainKey, recordId) {
  return `entity:optimistic:${domainKey}:id:${recordId}`;
}

export function isOptimisticKey(key) {
  return /^entity:optimistic:/.test(String(key));
}

// v2 wrote one optimistic row per domain. The migration re-keys them, and this is what it matches.
export function isLegacyOptimisticKey(key) {
  return isOptimisticKey(key) && !/:id:[^:]*$/.test(String(key));
}

export function serverEntityKey(machine, field, domainKey, rowId) {
  return `entity:${machine}:${field}:${domainKey}:${rowId}`;
}

// Which ROW a key names — the record id AND the domain it belongs to. Both shapes end
// `:<domainKey>:id:<recordId>`, so one suffix test covers them. A server row the sheet returned
// without an id is keyed `:<domainKey>:row:<index>` instead and matches nothing here, which is
// right: it names no record, so no mutation can name it.
//
// The domain is not decoration. A record id is not unique on a live sheet: the captured production
// payload carries seven ids spread over sixteen rows, every pair on a DIFFERENT ring, and matching
// the `:id:` suffix alone made a queued edit of one ring claim the first row carrying that id
// whatever its ring — so the edit appeared on a ring nobody touched, and the ring the crew deleted
// stayed while another went.
export function entityKeyForRecord(key, domainKey, recordId) {
  // an absent id names no row, so it must not name every row: `endsWith(":id:")` would be true of a
  // key whose id is empty, and callers pass a record id straight through
  if (recordId == null || recordId === "") return false;
  return String(key).endsWith(`:${domainKey}:id:${recordId}`);
}

// Which record a SHEET ROW names — the id column, and only that: a sheet has no `recordId` header,
// so a fallback here would only ever fire for a row that did not come from a sheet. `""` and an
// absent id both mean "names no record"; a blank Id cell reaches the client as the empty string,
// because `getSheetDataAsJson` assigns every header key from the row's values.
export function rowIdOf(row) {
  const id = row && row.id;
  return id == null || id === "" ? null : id;
}

// Which record an OPTIMISTIC ROW was keyed under. Deliberately the other field order, and the two
// are not one rule: `optimisticEntity` injects `recordId` into every queued payload, so that is the
// value the runtime built the key from — while `rowIdOf` above answers what a row from the sheet
// calls itself. Which to call is decided by the row's PROVENANCE, not by the caller: the migrations
// in `db.js` recover a queued row's key, and `writeServerSnapshot` picks between the two on
// `isOptimisticKey(record.key)`. They agree for every write Task 8 queues (all eight call sites pass
// `recordId: <payload>.id`) and Task 9 adds types where they need not — which is when reading a
// queued row the wrong way strands it under a key nothing looks up, or slots it beside the row it
// was meant to replace. Consolidating them into one function was tried; this is why it was undone.
export function optimisticRecordIdOf(payload) {
  const id = payload && (payload.recordId ?? payload.id);
  return id == null || id === "" ? null : id;
}

// The domain a row belongs to, built from the ROW's own fields. The machine is the row's when it has
// one — `dailyReport` and `prepTask` carry a machine column AND are machine-keyed, so reading it off
// anything else names a different domain — and `||`, not `??`, because a blank machine cell means
// "no machine of its own" and `normalizeReport` writes exactly that for an unrecognised machine.
// Shared for the same reason: the cache and the on-screen list have to agree on which row is which.
export function domainKeyForRow(entityType, row, fallbackMachine) {
  const source = row || {};
  // `recordId` first, like `optimisticRecordIdOf` and for the same reason: `secondaryGrout` and every
  // `default`-branch type EMBED the record id in their domain key, and the key was built from the
  // mutation's `recordId`. A row this app put on screen from the queue carries both fields — reading
  // its `id` rebuilt a different domain than the mutation names, so the next save was appended
  // beside it. A row from the sheet carries only `id` and falls through to it.
  return makeDomainKey({ entityType, machine: source.machine || fallbackMachine, recordId: source.recordId ?? source.id, payload: source });
}

// What `optimisticEntity` stamps onto the record App renders. They are the QUEUE's bookkeeping, not
// the crew's data: a second edit of a row queued offline reads them back off state, and GAS's
// JSON-blob path copies every payload key into the sheet cell — so `syncStatus: "pending"` on a
// server row makes `preserveLocal` treat it as this device's unsynced work and freezes it on every
// other phone. `machine` is NOT here: it is a real column on both blob-backed sheets.
export const QUEUE_STAMPED_KEYS = Object.freeze(["recordId", "entityType", "domainKey", "version", "syncStatus"]);

export function withoutQueueStamps(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  if (!QUEUE_STAMPED_KEYS.some(key => key in payload)) return payload;
  const clean = { ...payload };
  QUEUE_STAMPED_KEYS.forEach(key => { delete clean[key]; });
  return clean;
}
