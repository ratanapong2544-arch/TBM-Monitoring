/**
 * How much room the browser is giving this device's offline store, and whether it can be evicted.
 *
 * The Sync Center shows it because the two failures a crew cannot otherwise see are a store that is
 * nearly full and a store the browser is free to throw away. Neither announces itself: a write that
 * cannot be persisted surfaces as "บันทึกลงเครื่องไม่ได้" only at the moment it fails, which
 * underground is after the ring is already on the screen.
 *
 * Eviction of the SERVICE WORKER's caches is the service worker's business. Nothing here touches the
 * IndexedDB business stores — the queue is the one thing that must never be cleared to make room.
 */

// One number, so the panel and anything else that has an opinion about "nearly full" cannot disagree
// about where that is. 80% is where browsers start evicting non-persisted origins under pressure.
export const STORAGE_WARN_RATIO = 0.8;

const UNSUPPORTED = Object.freeze({ supported: false, usage: null, quota: null, ratio: null, persisted: null, warn: false });

/**
 * `supported: false` rather than a throw, and rather than zeros.
 *
 * Safari variants and older Android WebViews have no `navigator.storage`, and `estimate()` can
 * reject outright (a SecurityError in some embedded contexts). Zero bytes used would read as
 * "plenty of room", which is the opposite of what an error means; a throw would take down the panel
 * a crew opens to find out whether their work is safe.
 */
export async function getStorageHealth() {
  const storage = typeof navigator !== "undefined" && navigator.storage;
  if (!storage || typeof storage.estimate !== "function") return UNSUPPORTED;
  let estimate;
  try {
    estimate = await storage.estimate();
  } catch (error) {
    return UNSUPPORTED;
  }
  const usage = Number.isFinite(estimate && estimate.usage) ? estimate.usage : null;
  const quota = Number.isFinite(estimate && estimate.quota) ? estimate.quota : null;
  // `persisted()` is missing on more browsers than `estimate()` is, and unknown is not false: telling
  // a crew their data can be evicted when nobody knows is as wrong as telling them it cannot.
  let persisted = null;
  if (typeof storage.persisted === "function") {
    try { persisted = Boolean(await storage.persisted()); } catch (error) { persisted = null; }
  }
  const ratio = quota ? usage / quota : null;
  return { supported: true, usage, quota, ratio, persisted, warn: ratio !== null && ratio >= STORAGE_WARN_RATIO };
}
