import { buildMutationEnvelope } from "./mutationEnvelope";

/**
 * The envelope for every business write App itself owns — issues, daily reports, instruments,
 * instrument readings and instrument schedules.
 *
 * `makeDomainKey` decides whether the key carries a machine or GLOBAL, so the caller does not:
 * `machine` is passed through untouched and only the machine-keyed families supply one. Passing a
 * machine for a project-wide family is harmless; withholding one from `dailyReport` is not, which
 * is why the daily-report call sites read it off the record itself.
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
