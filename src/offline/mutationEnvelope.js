import { makeDomainKey } from "./domainKey";

/**
 * Build the envelope a view hands to `onMutate`.
 *
 * Every core write goes through here so the `domainKey` is derived one way. GAS keys idempotency and
 * versioning on it, so two views computing it slightly differently would split one record's history
 * into two version streams — a stale edit could then win with nothing on screen to show it.
 *
 * The key is always derived from the payload being sent. It is not a choice: `repository.mutate`
 * recomputes it from the payload and refuses a mismatch, and `validateSyncEnvelope_` in
 * gas-live/Code.js does the same. A previous attempt to key an edit on the record's pre-edit
 * identity therefore threw before anything was queued — it failed in exactly the case it existed
 * for, and a corrected ring number was lost rather than merely mis-keyed.
 *
 * `baseVersion` is the version this device last saw for that key. A create has none, so it is 0;
 * for an update or delete it comes from the merged `syncMeta`, and the server refuses the mutation
 * if the row has moved on since — which is what turns a lost update into a conflict.
 *
 * `identity` is the record as it stood BEFORE the edit. It cannot change where the write goes, but
 * it is what tells us the write RE-IDENTIFIES the record: the ring, its install type, the grout
 * pass and the report's date and shift are all editable, and all of them are part of the key. A
 * re-identified record has no history under its new key, so it must not inherit a version:
 *
 *   - if this device knows no version for the new key, the record starts a fresh stream at 0. GAS
 *     accepts that (base 0 against no metadata) and mints version 1 for it.
 *   - if it DOES know one, some other record already occupies that identity. Sending its version
 *     would put two rows on one version stream, where each edit of either silently invalidates the
 *     other. That is refused here, before anything is queued, so the crew is told rather than
 *     finding out through a conflict no screen shows until Task 10.
 */
export function buildMutationEnvelope({ entityType, operation, machine, recordId, payload, syncMeta, identity }) {
  const domainKey = makeDomainKey({ entityType, machine, recordId, payload });
  const known = syncMeta && syncMeta[domainKey];
  // update only: a delete carries the record as it stands, so there is nothing for it to re-identify
  if (operation === "update" && identity && reidentifies({ entityType, machine, recordId, payload, identity })) {
    if (known) throw new Error(`มีข้อมูลของรายการนี้อยู่แล้ว (${domainKey}) — ลบรายการเดิมก่อน หรือแก้ที่รายการนั้นแทน`);
    return { entityType, operation, machine, recordId, payload, domainKey, baseVersion: 0 };
  }
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

// The views trim and upper-case a ring on the way into the payload while the stored record still
// holds whatever the sheet had. Comparing the raw keys would read that tidy-up as a re-identified
// record and refuse an edit that changed nothing but whitespace, so both sides are normalised for
// the comparison ONLY — the key that actually travels stays exactly what the payload derives.
function reidentifies({ entityType, machine, recordId, payload, identity }) {
  const keyOf = source => makeDomainKey({ entityType, machine, recordId, payload: normalizeRing(source) });
  return keyOf(identity) !== keyOf(payload);
}

function normalizeRing(source) {
  if (!source || source.ringNo == null) return source;
  return { ...source, ringNo: String(source.ringNo).trim().toUpperCase() };
}

// GAS compares versions loosely (`checkSyncVersion_` coerces), and a version that has been through a
// Sheets cell can arrive as text. Rejecting a numeric string here would silently degrade
// `baseVersion` to 0 — the lost-update state the field exists to prevent — so accept what the
// server accepts.
export function toSyncVersion(value) {
  if (Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return 0;
}
