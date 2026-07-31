// How a row in the `entities` store is named, in one place.
//
// Two of them exist. A row that came from the server is keyed per SHEET ROW, not per domain — a live
// sheet legitimately holds two rows sharing a ring identity, and keying by domain alone made one
// overwrite the other in the cache and then appear twice in the list. A row a queued mutation
// produced is keyed by its domain, because there is exactly one optimistic copy per record.
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

// The surrounding colons matter: without the trailing one, a ring whose domain key is a prefix of
// another's (P64 against P643) would match it. Both key shapes end `:<domainKey>:<something>`, so
// one test covers a server row and an optimistic one alike.
export function entityKeyBelongsToDomain(key, domainKey) {
  return String(key).includes(`:${domainKey}:`);
}

// Which ROW a server key names. A mutation is about one row, and two rows can share a domain, so
// anything that edits or removes a single row has to match on this rather than on the domain.
export function entityKeyHasRecordId(key) {
  return /:id:[^:]*$/.test(String(key));
}

export function entityKeyForRecord(key, recordId) {
  // an absent id names no row, so it must not name every row: `endsWith(":id:")` would be true of a
  // key whose id is empty, and callers pass a record id straight through
  if (recordId == null || recordId === "") return false;
  return String(key).endsWith(`:id:${recordId}`);
}
