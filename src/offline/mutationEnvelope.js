import { makeDomainKey } from "./domainKey";

/**
 * Build the envelope a view hands to `onMutate`.
 *
 * Every core write goes through here so the `domainKey` is derived one way. GAS keys idempotency and
 * versioning on it, so two views computing it slightly differently would split one record's history
 * into two version streams — a stale edit could then win with nothing on screen to show it.
 *
 * `baseVersion` is the version this device last saw for that key. A create has none, so it is 0;
 * for an update or delete it comes from the snapshot's `syncMeta`, and the server refuses the
 * mutation if the row has moved on since — which is what turns a lost update into a conflict.
 *
 * `identity` is the record as it stood BEFORE the edit, and an update or delete of an existing row
 * must pass it. The domain key is built from business fields — the ring and its install type, the
 * grout pass, the report's date and shift — and the data log lets those be corrected. Deriving the
 * key from the edited payload asks the server about a record that has never existed under that key:
 * `baseVersion` comes back 0, or worse, it is ANOTHER ring's version. The write then either fails as
 * unknown or advances a second version stream over one sheet row, which is the exact hazard this
 * single derivation exists to prevent.
 *
 * Correcting a mistyped ring therefore keeps writing to the record's original key, so its version
 * history stays continuous. The server's metadata still carries the old ring in that key afterwards
 * — re-keying a record is not something the sync protocol can express today, and the alternative is
 * losing the edit outright.
 */
export function buildMutationEnvelope({ entityType, operation, machine, recordId, payload, syncMeta, identity }) {
  const keyedOn = (operation === "update" || operation === "delete") && identity ? identity : payload;
  const domainKey = makeDomainKey({ entityType, machine, recordId, payload: keyedOn });
  const known = syncMeta && syncMeta[domainKey];
  return {
    entityType,
    operation,
    machine,
    recordId,
    payload,
    domainKey,
    baseVersion: toSyncVersion(known && known.version),
  };
}

// GAS compares versions loosely on purpose (`checkSyncVersion_("2", 2)` is a match), because a
// version read back out of a Sheets cell can arrive as text. Rejecting a numeric string here would
// silently degrade `baseVersion` to 0 — the lost-update state the field exists to prevent — so
// accept what the server accepts.
export function toSyncVersion(value) {
  if (Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return 0;
}
