import { PHOTOS } from "./displayRecord";
import { MUTATION_STATUS } from "./schema";
import { formatDisplayDate, formatDisplayTime } from "../utils/formatters";

/**
 * Everything this device is still holding for the sheet, as one file a crew can send.
 *
 * The last resort behind every other safeguard: a phone whose queue cannot drain — a link that never
 * comes back, a device being replaced, a store the browser is about to evict — can hand the work to
 * someone who can replay it. So it carries the request ids and the FULL payloads. A recovery file
 * that cannot name the write, or that summarises it, cannot put the ring on the sheet.
 *
 * What it must not carry: anything that is a way in. This file is emailed, dropped in a chat, or
 * passed over on a phone — the GAS deployment URL and the API keys live in `apiTransport` and the
 * environment, and nothing here reads them.
 */
export const EXPORT_FORMAT = "tbm-offline-recovery";
export const EXPORT_VERSION = 1;

// OMITTED and SAID SO, unlike `withoutPhotoBytes` in the store, which deletes the key outright. That
// one feeds `retryMutationAsSuccessor`, which reads a missing key as "the editor never had the
// bytes" and re-attaches the originals. This one is read by a person: a photo that vanishes silently
// looks like the crew never took one. `imageName` stays beside it for the same reason.
const OMITTED = Object.freeze({ omitted: true, reason: "binary payload" });

function redactPhotos(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return record;
  if (!PHOTOS.some(([base64]) => record[base64] !== undefined)) return record;
  const clean = { ...record };
  PHOTOS.forEach(([base64]) => { if (clean[base64] !== undefined) clean[base64] = OMITTED; });
  return clean;
}

const rowOf = mutation => ({
  requestId: mutation.requestId,
  entityType: mutation.entityType,
  operation: mutation.operation,
  machine: mutation.machine || "GLOBAL",
  recordId: mutation.recordId,
  domainKey: mutation.domainKey,
  baseVersion: mutation.baseVersion ?? null,
  status: mutation.status,
  attemptCount: mutation.attemptCount || 0,
  createdAtLocal: mutation.createdAtLocal || null,
  lastError: mutation.lastError || null,
  payload: redactPhotos(mutation.payload),
});

/**
 * `YYYYMMDD-HHmm` in Bangkok, from the app's own formatters — two exports in one shift must not
 * overwrite each other in the phone's download folder, and a stamp in the browser's zone would sort
 * against every other time this app writes.
 */
export function exportFileName(isoString) {
  const at = new Date(isoString);
  const day = formatDisplayDate(at).replace(/-/g, "");
  const time = formatDisplayTime(at).replace(":", "");
  return `${EXPORT_FORMAT}-${day}-${time}.json`;
}

/**
 * Write the bundle to the device as one JSON file, and return the name it was given.
 *
 * The object URL is revoked immediately after the click: an un-revoked one keeps the whole bundle
 * alive in memory on a phone that is already short of it, which is the state a crew is in when they
 * reach for this.
 */
export function downloadExportBundle(bundle) {
  const name = exportFileName(bundle.exportedAt);
  const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return name;
}

export async function exportPendingBundle(repository, { now = () => new Date().toISOString() } = {}) {
  const [{ mutations, conflicts }, deviceId] = await Promise.all([
    repository.listUnsynced(),
    repository.deviceId(),
  ]);
  const byStatus = status => mutations.filter(item => item.status === status).map(rowOf);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now(),
    deviceId: deviceId || null,
    // PENDING and SYNCING alike: a write claimed by a worker that never came back is still work this
    // device is holding. A CONFLICT is listed under `conflicts` and nowhere else — listing it twice
    // would have a recovery replay it twice, which is the duplicate row this whole feature prevents.
    pendingMutations: mutations
      .filter(item => item.status === MUTATION_STATUS.PENDING || item.status === MUTATION_STATUS.SYNCING)
      .map(rowOf),
    validationErrors: byStatus(MUTATION_STATUS.VALIDATION_ERROR),
    permanentErrors: byStatus(MUTATION_STATUS.PERMANENT_ERROR),
    conflicts: conflicts.map(conflict => ({
      conflictId: conflict.conflictId,
      requestId: conflict.requestId || null,
      domainKey: conflict.domainKey,
      currentVersion: conflict.currentVersion ?? null,
      createdAt: conflict.createdAt || conflict.createdAtLocal || null,
      // both spellings, like every other reader of this store: a legacy staged difference says
      // `local`/`server`, a queued one `localRecord`/`serverRecord`
      localRecord: redactPhotos(conflict.localRecord ?? conflict.local ?? null),
      serverRecord: redactPhotos(conflict.serverRecord ?? conflict.server ?? null),
    })),
  };
}
