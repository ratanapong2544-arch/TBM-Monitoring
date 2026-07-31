// One reading of a version, for everything that compares them.
//
// GAS compares loosely on purpose — `checkSyncVersion_` coerces, because a version that has been
// through a Sheets cell can come back as text. Rejecting a numeric string on this side would
// silently degrade `baseVersion` to 0, which is the lost-update state the field exists to prevent,
// so accept what the server accepts.
//
// It lives in its own leaf module because the queue, the snapshot store and the envelope builder all
// need it, and a storage module reaching into the envelope builder for one helper is the layering
// problem `entityKeys.js` was extracted to fix.
export function toSyncVersion(value) {
  if (Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return 0;
}
