import { domainKeyForRow, optimisticRecordIdOf } from "./entityKeys";
// What goes on screen is not what goes on the wire.
//
// A photo travels as base64 inside the mutation payload, and the queue needs it there until GAS
// answers with a real Drive URL. Holding the same bytes in React state as well buys nothing and
// spends the one budget an offline queue cannot overspend: a phone that runs out of storage
// underground stops being able to record anything at all.
//
// `imageUrl: "Attached"` is the marker the data logs already understand — both of them render the
// photo link only when `imageUrl` exists AND is not "Attached", so it says "a photo is queued"
// while suppressing a link there is no URL for yet.
export const PHOTOS = [
  ["imageBase64", "imageName", "imageUrl"],
  ["excavImageBase64", "excavImageName", "excavImageUrl"],
];

// Which row of the list a queued write is about. The id alone is not it: the production sheet
// carries one id across four rings, so matching on `row.id` turned three rings the crew never
// touched into copies of the one they saved, the moment they pressed it — and a delete removed all
// four. A record built by the queue carries the domain key it was filed under, and for a ring that
// key IS the identity; a record without one (a caller outside the queue) falls back to the id.
function namesRow(record, entityType, row) {
  if (optimisticRecordIdOf(row) !== optimisticRecordIdOf(record)) return false;
  if (!record.domainKey) {
    // Unreachable through the queue: `optimisticEntity` always injects the key. Reachable from a
    // caller that builds a record by hand — and falling back to the id alone is the rule the
    // cross-ring duplicates proved wrong, so it must not degrade quietly.
    if (process.env.NODE_ENV !== "production") console.warn("applyOptimisticRow got a record with no domainKey; falling back to matching on the record id alone");
    return true;
  }
  return domainKeyForRow(entityType, row, record.machine) === record.domainKey;
}

// How a queued write lands in the list the crew is looking at: it changes exactly ONE row, the same
// one `writeServerSnapshot` will change at the next refresh. It lives here, next to the photo rule,
// because every caller needs both and because the alternative — inlining it in App — left the photo
// rule with nothing that could test it: carrying the bytes and not renders identically in the DOM.
export function applyOptimisticRow(rows, operation, incoming) {
  const record = stripQueuedPhotos(incoming);
  if (!record) return rows;
  const entityType = record.entityType;
  const recordId = optimisticRecordIdOf(record);
  // An ABSENT id names nothing, and matching on it would claim the first row that also has none.
  // A BLANK one does name a row — within its domain, which is what the merge's `claimWithinDomain`
  // matches and what `namesRow` asks. Every type Task 8 queues sets `id` to its own record id;
  // Task 9 adds types where that need not hold.
  if (recordId == null) return operation === "delete" ? rows : [...rows, record];
  // ONE row, in both directions. A mutation is about one row, and the snapshot merge overwrites one
  // and hides one — filtering and mapping over every match made the screen disagree with the refresh
  // that followed it: two rows sharing a ring and an id rendered the edit twice and a delete emptied
  // the list, with the neighbour returning at the next refresh.
  const at = rows.findIndex(row => namesRow(record, entityType, row));
  if (operation === "delete") return at === -1 ? rows : rows.filter((unused, index) => index !== at);
  return at === -1 ? [...rows, record] : rows.map((row, index) => (index === at ? record : row));
}

// The inverse, for the families that change their own list BEFORE the write goes out — issues, daily
// reports, instruments, readings, schedules. Under write-through a refused save must not leave that
// change on screen: the sheet does not have it, and the crew reading it back has no way to tell.
//
// ONE row, again, and by id rather than by restoring the whole list: a save can be in flight while
// the crew edits something else, and putting the old array back would silently undo that too. The
// index is where the row sat before, so a restored row returns to its place instead of the end —
// these lists are read in order (newest issue first, the schedule by date).
export function revertOptimisticRow(rows, recordId, previous, previousIndex) {
  if (recordId == null) return rows;
  const without = rows.filter(row => String(row && row.id) !== String(recordId));
  // No previous row means the write was a create — the row only ever existed because of the save that
  // failed, so it goes with it.
  if (!previous) return without;
  const at = Math.max(0, Math.min(Number.isInteger(previousIndex) ? previousIndex : without.length, without.length));
  return [...without.slice(0, at), previous, ...without.slice(at)];
}

export function stripQueuedPhotos(record) {
  if (!record || !PHOTOS.some(([base64]) => record[base64])) return record;
  const display = { ...record };
  PHOTOS.forEach(([base64, name, url]) => {
    if (!display[base64]) return;
    display[url] = display[url] || "Attached";
    delete display[base64];
    delete display[name];
  });
  return display;
}
