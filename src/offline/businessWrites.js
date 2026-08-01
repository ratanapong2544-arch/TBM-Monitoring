import { buildMutationEnvelope } from "./mutationEnvelope";

/**
 * The envelope for every business write App itself owns — issues, daily reports, instruments,
 * instrument readings and instrument schedules.
 *
 * `makeDomainKey` decides whether the key carries a machine or GLOBAL, so the caller does not:
 * `machine` is passed through untouched. EVERY caller supplies one — `queueRecord` defaults to the
 * machine on screen — and for a project-wide family that is not decoration but a SCOPE HINT: it is
 * what lets `scopesFor` file the write into the snapshot of the machine the crew is looking at, and
 * without it a record raised before that machine ever fetched is in the queue and on no screen.
 * The key is unaffected — `makeDomainKey` still spells it GLOBAL for those families — and the
 * record's own `machine` column is unaffected too, because `optimisticEntity` prefers it.
 *
 * It exists as its own function because two of its callers cannot be reached from the screen:
 * `handleUpdateInstrument` and `handleSaveInstReading` are wired to no view (open item 3s), so no UI
 * test can drive them. This is the exact code their envelope comes out of, so a test here is a test
 * of the real path rather than of a fixture that imitates it.
 */
export function businessEnvelope({ entityType, operation, record, machine, syncMeta }) {
  return buildMutationEnvelope({
    entityType,
    operation,
    machine,
    recordId: record.id,
    payload: record,
    syncMeta,
  });
}
