/**
 * How long the wire actually took, last time it worked.
 *
 * Two deadlines guard this app's link — 90 s for a `getData`, 90 s for a write — and neither has ever
 * been measured against a real underground link. A false "dead" verdict on the GET costs a stale
 * snapshot; on the write it costs a report whose outcome is unknown until the next refresh.
 *
 * The instrument has to be the app itself. Chrome's remote inspection needs a USB cable and a
 * desktop; Safari's Web Inspector needs a Mac. Neither travels down a shaft. Two numbers in the Sync
 * Center, recorded on the device, read after coming back up, do.
 *
 * Recorded only on SUCCESS. A timing from an attempt that failed measures how long the crew waited
 * before giving up, which is a different question and would quietly replace the answer to this one.
 */

// `syncMeta` keys — durable, because the phone is read after it has been closed and reopened
export const LAST_FETCH_MS_KEY = "lastFetchMs";
export const LAST_POST_MS_KEY = "lastPostMs";

export function formatWireTiming(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  return `${(ms / 1000).toFixed(1)} วิ`;
}
