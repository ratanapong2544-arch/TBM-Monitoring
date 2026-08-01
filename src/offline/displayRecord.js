import { makeDomainKey } from "./domainKey";
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
const PHOTOS = [
  ["imageBase64", "imageName", "imageUrl"],
  ["excavImageBase64", "excavImageName", "excavImageUrl"],
];

// How a queued write lands in the list the crew is looking at. It lives here, next to the photo
// rule, because every caller needs both and because the alternative — inlining it in App — left the
// rule with nothing that could test it: the difference between carrying the photo bytes and not is
// invisible in the DOM, so only a direct test of the reducer can see it at all.
// Which row of the list a queued write is about. The id alone is not it: the production sheet
// carries one id across four rings, so matching on `row.id` turned three rings the crew never
// touched into copies of the one they saved, the moment they pressed it — and a delete removed all
// four. A record built by the queue carries the domain key it was filed under, and for a ring that
// key IS the identity; a record without one (a caller outside the queue) falls back to the id.
function namesRow(record, entityType, row) {
  const rowId = row.id ?? row.recordId;
  const recordId = record.id ?? record.recordId;
  if (rowId !== recordId) return false;
  if (!record.domainKey) {
    // Unreachable through the queue: `optimisticEntity` always injects the key. Reachable from a
    // caller that builds a record by hand — and falling back to the id alone is the rule the
    // cross-ring duplicates proved wrong, so it must not degrade quietly.
    if (process.env.NODE_ENV !== "production") console.warn("applyOptimisticRow got a record with no domainKey; falling back to matching on the record id alone");
    return true;
  }
  return makeDomainKey({ entityType, machine: record.machine, recordId: rowId, payload: row }) === record.domainKey;
}

export function applyOptimisticRow(rows, operation, incoming) {
  const record = stripQueuedPhotos(incoming);
  if (!record) return rows;
  const entityType = record.entityType;
  // A record that names no row matches nothing: `row.id === undefined` is true of every row the
  // sheet returned without an id, so an unnamed record would overwrite the first of them and a
  // delete would remove it. Every type Task 8 queues sets `id` to its own record id; Task 9 adds
  // types where that need not hold.
  const recordId = record.id ?? record.recordId;
  if (recordId == null || recordId === "") return operation === "delete" ? rows : [...rows, record];
  // ONE row, in both directions. A mutation is about one row, and the snapshot merge overwrites one
  // and hides one — filtering and mapping over every match made the screen disagree with the refresh
  // that followed it: two rows sharing a ring and an id rendered the edit twice and a delete emptied
  // the list, with the neighbour returning at the next refresh.
  const at = rows.findIndex(row => namesRow(record, entityType, row));
  if (operation === "delete") return at === -1 ? rows : rows.filter((unused, index) => index !== at);
  return at === -1 ? [...rows, record] : rows.map((row, index) => (index === at ? record : row));
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
