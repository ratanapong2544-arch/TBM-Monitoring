import { makeDomainKey } from "./domainKey";

// Task 9 Step 5b — propagating a deletion that empties a collection.
//
// The collections App mirrors behind a `.length` guard cannot use emptiness as the signal. Two
// different things arrive as `[]`: `normalizeServerData` maps an absent key to `[]`, and GAS's own
// `getSheetDataAsJson` returns `[]` for a sheet that does not exist — so an older deployment, a
// partial `doGet` and a spreadsheet missing a tab all look exactly like "the crew deleted the last
// record". Losing a field record outranks showing a stale one, which is why the guard went in.
//
// The mechanism that tells them apart is already on the wire and needs no GAS change: SyncMeta
// carries `deleted` per recordKey, GAS stamps it on every delete (`legacySyncBump_` too), and
// `getSyncMetaMap_` ships the tombstoned entries with the rest. A record is removed because the
// server NAMES it as deleted — never because a list came back short.
//
// Deliberately not applied to segments, grouts, secondary grouts or shift reports. Those are
// replaced wholesale from the server already, so their deletions propagate without this; and open
// item 1 records that GAS tombstones a segment's ring KEY rather than its row, so a ring holding two
// rows would lose both from the screen if this were pointed at them.
export function isServerDeleted(entityType, record, syncMeta, fallbackMachine) {
  if (!syncMeta || !record) return false;
  const key = makeDomainKey({
    entityType,
    machine: record.machine || fallbackMachine,
    recordId: record.id,
    payload: record,
  });
  const meta = syncMeta[key];
  return Boolean(meta && meta.deleted);
}

/**
 * What a guarded collection becomes when a server response arrives.
 *
 * A response carrying rows is authoritative — it already reflects the deletion. A response carrying
 * none keeps what is on screen, minus anything the server has tombstoned: that is the case where
 * the last record of a collection was deleted elsewhere, and the only case where an empty list is
 * allowed to remove anything.
 */
export function applyServerRows(entityType, incoming, previous, syncMeta, fallbackMachine) {
  if (incoming && incoming.length) return incoming;
  if (!previous || !previous.length) return previous;
  const kept = previous.filter(row => !isServerDeleted(entityType, row, syncMeta, fallbackMachine));
  return kept.length === previous.length ? previous : kept;
}
