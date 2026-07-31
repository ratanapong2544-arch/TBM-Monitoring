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
 */
export function buildMutationEnvelope({ entityType, operation, machine, recordId, payload, syncMeta }) {
  const domainKey = makeDomainKey({ entityType, machine, recordId, payload });
  const known = syncMeta && syncMeta[domainKey];
  return {
    entityType,
    operation,
    machine,
    recordId,
    payload,
    domainKey,
    baseVersion: (known && Number.isInteger(known.version) ? known.version : 0),
  };
}
