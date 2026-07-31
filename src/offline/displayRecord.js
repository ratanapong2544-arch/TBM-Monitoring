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
export function applyOptimisticRow(rows, operation, incoming) {
  const record = stripQueuedPhotos(incoming);
  if (!record) return rows;
  if (operation === "delete") return rows.filter(row => row.id !== record.id);
  return rows.some(row => row.id === record.id)
    ? rows.map(row => (row.id === record.id ? record : row))
    : [...rows, record];
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
