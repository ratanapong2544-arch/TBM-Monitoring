import { makeDomainKey } from "./domainKey";
import { toSyncVersion } from "./syncVersion";

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
 * `identity` is the record as it stood BEFORE the edit, and it is what tells us the write
 * RE-IDENTIFIES the record: the ring, its install type, the grout pass and the report's date and
 * shift are all editable, and all of them are part of the key.
 *
 * Re-identifying a record in place is refused. The sync protocol cannot express it. The key travels
 * with the payload, so the write lands under the NEW key and GAS mints metadata for it — while the
 * OLD key's metadata stays behind, alive, pointing at a ring no row carries any more. Ring numbers
 * here are sequential and never skipped, so the ring that was mistyped is a ring the machine will
 * actually reach, weeks later; recording it then returns SYNC_META_ORPHAN, which is terminal, and
 * replaying it returns the same. Nothing on screen would say so — the row still looks recorded.
 * A mistyped ring corrected in place therefore poisons that ring number for the rest of the drive.
 *
 * Delete the record and record it again instead: the delete tombstones the old key, and the new
 * record starts a clean stream under its own. That is two actions where the crew expected one, and
 * it is the only sequence the protocol has.
 */
export function buildMutationEnvelope({ entityType, operation, machine, recordId, payload, syncMeta, identity }) {
  const domainKey = makeDomainKey({ entityType, machine, recordId, payload });
  const known = syncMeta && syncMeta[domainKey];
  // update only: a delete carries the record as it stands, so there is nothing for it to re-identify
  if (operation === "update" && identity && reidentifies({ entityType, machine, recordId, payload, identity })) {
    throw new ReidentifiedRecordError(makeDomainKey({ entityType, machine, recordId, payload: identity }), domainKey);
  }
  return {
    entityType,
    operation,
    machine,
    recordId,
    payload,
    domainKey,
    baseVersion: operation === "create" ? createBaseVersion(known) : toSyncVersion(known && known.version),
  };
}

// What a create claims depends on whether that identity is free, taken, or vacated.
//
//   - never seen: 0. The server has no metadata for it and mints version 1.
//   - taken by a live record: 0, so the server answers `conflict`. Claiming the version it knows
//     would tell GAS this is a post-conflict successor and MERGE the record onto the row already
//     holding that ring — the other shift's record overwritten, and the response a success. Two rows
//     on one ring is a state this app supports, and its data logs dedupe for it; collapsing them
//     silently is not the app's call.
//   - vacated by a delete: the tombstone's own version, which lifts it. A tombstone is not inert —
//     `checkSyncVersion_` compares against it like any other version, so a create at 0 is refused
//     for a ring whose only record was deleted. That is the ordinary "delete the bad row and record
//     it again" correction, and it is also the remedy this file prescribes for a mistyped ring, so
//     it has to work.
function createBaseVersion(known) {
  return known && known.deleted ? toSyncVersion(known.version) : 0;
}

// A refusal, not a failure: nothing was attempted and nothing is queued, so the views must not
// announce it as a save that went wrong. The `code` is there so Task 10's Sync Center can tell this
// apart from a storage fault without matching on the message.
export class ReidentifiedRecordError extends Error {
  constructor(previousKey, nextKey) {
    super("แก้ข้อมูลที่ใช้ระบุรายการ (เช่น เลขริง) ในรายการเดิมไม่ได้ — ให้ลบรายการนี้แล้วบันทึกใหม่");
    this.name = "ReidentifiedRecordError";
    this.code = "SYNC_REIDENTIFIED_RECORD";
    this.previousKey = previousKey;
    this.nextKey = nextKey;
  }
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

export { toSyncVersion };
