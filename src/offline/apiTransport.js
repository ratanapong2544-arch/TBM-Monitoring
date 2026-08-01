// A mutation is posted with the domainKey it was queued under, and GAS refuses any envelope whose
// key differs from the canonical one it recomputes. Rewriting the key here instead would silently
// diverge the sent key from the persisted one — per-domain ordering and the confirmed entity are
// both filed under the stored key — so a stale key must fail loudly. repository.mutate refuses a
// non-canonical key at queue time; a future key-format change needs an IndexedDB migration
// (DB_VERSION bump) rather than a rewrite in flight.
import { GAS_URL } from "../utils/constants";

export class ApiFailure extends Error {
  constructor(kind, code, message = code, details = {}) {
    super(message); this.name = "ApiFailure"; this.kind = kind; this.code = code; Object.assign(this, details);
  }
  static fromGas(result) {
    const code = result.code || result.errorCode || "GAS_ERROR";
    if (result.httpStatus != null) {
      const classified = classifyHttpFailure(Number(result.httpStatus));
      return new ApiFailure(classified.kind, code, result.message || classified.message, { response: result, status: classified.status });
    }
    const normalizedCode = String(code).toUpperCase();
    const kind = result.httpStatus === 422 || /VALIDATION|INVALID/.test(normalizedCode) ? "validation" : /RETRY|BUSY|LOCK|TIMEOUT|RATE/.test(normalizedCode) ? "retryable" : "permanent";
    return new ApiFailure(kind, code, result.message || "GAS request failed", { response: result });
  }
}

export function classifyHttpFailure(status) {
  const kind = status === 422 ? "validation" : (status === 408 || status === 429 || status >= 500) ? "retryable" : "permanent";
  return new ApiFailure(kind, "HTTP_ERROR", `HTTP ${status}`, { status });
}

export function toApiFailure(error) {
  if (error instanceof ApiFailure) return error;
  if (error && error.name === "AbortError") return new ApiFailure("aborted", "ABORTED", error.message || "Request aborted", { cause: error });
  return new ApiFailure("retryable", "NETWORK", error && error.message || "Network request failed", { cause: error });
}

export async function parseGasResponse(response) {
  let text;
  try { text = await response.text(); } catch (error) { throw toApiFailure(error); }
  if (text.trim().startsWith("<")) throw new ApiFailure("permanent", "GAS_PERMISSION_HTML", "GAS returned an HTML permission page");
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.status === "error") throw ApiFailure.fromGas(parsed);
    return parsed;
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure("permanent", "GAS_MALFORMED_JSON", "GAS returned malformed JSON", { cause: error });
  }
}

// A GET that never settles is the twin of an IndexedDB open that never settles, and it is the more
// likely one underground: a tunnel link or a captive portal completes the TCP handshake and then
// goes quiet, so the request neither succeeds nor errors. The app shows "refreshing" forever, which
// also suppresses the snapshot-age strip — the crew is told data is on its way instead of being told
// how old what they are looking at is.
//
// The ceiling has to tell "dead" apart from "slow", and this payload is not small: the largest
// capture in this worktree (`data.json`, a PARTIAL one-machine response — it carries 3 of the 12
// collections) measures 463 KB, so a full one is larger, and GAS itself burns
// several seconds before the first byte. At 100 kbps — ordinary for a link underground — that is
// roughly 45 s of honest transfer, so a 30 s ceiling would turn a working link into a deterministic
// failure the crew cannot raise, pinning them to the previous shift's snapshot. 90 s still bounds
// the never-settles case; it just refuses to call a slow link dead.
export const SNAPSHOT_FETCH_TIMEOUT_MS = 90000;

export async function fetchServerSnapshot(machine, { signal } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, SNAPSHOT_FETCH_TIMEOUT_MS);
  // `signal` is honoured if a caller passes one; none does today (a machine switch abandons its
  // response through the request token in useOfflineData, not by aborting)
  const onCallerAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else if (typeof signal.addEventListener === "function") signal.addEventListener("abort", onCallerAbort);
  }
  try {
    let response;
    // `no-store`: a refresh has to read the sheet as it is NOW. The service worker already excludes
    // cross-origin requests, but the browser HTTP cache does not, and a cached body would describe
    // the sheet from before the request — which the merge would then treat as newer than the rows it
    // holds. (The caller that first needed this, the shift report's "check with the server", is gone;
    // the flag is not, because every refresh has the same requirement.)
    try { response = await fetch(`${GAS_URL}?action=getData&machine=${encodeURIComponent(machine)}`, { redirect: "follow", cache: "no-store", signal: controller.signal }); }
    catch (error) { throw timedOutFailure(timedOut, error); }
    if (!response.ok) throw classifyHttpFailure(response.status);
    // the body read is inside the deadline too: a captive portal that returns headers and then
    // stalls the body is the same failure one step later, and reporting it as ABORTED reads to the
    // crew as "something cancelled it" rather than "it timed out"
    try { return await parseGasResponse(response); }
    catch (error) { throw timedOutFailure(timedOut, error); }
  } finally {
    clearTimeout(timeout);
    if (signal && typeof signal.removeEventListener === "function") signal.removeEventListener("abort", onCallerAbort);
  }
}

function timedOutFailure(timedOut, error) {
  if (timedOut && error && (error.name === "AbortError" || error.code === "ABORTED")) {
    return new ApiFailure("retryable", "TIMEOUT", "Snapshot request timed out", { cause: error });
  }
  return toApiFailure(error);
}

export function assertSyncResponse(mutation, result) {
  if (!result || !["success", "conflict", "validation_error"].includes(result.status) || result.requestId !== mutation.requestId) {
    throw new ApiFailure("permanent", "GAS_MALFORMED_SYNC_RESPONSE", "GAS returned a malformed sync response", { response: result });
  }
  if (result.status === "success" && (!result.record || result.version === undefined || !result.updatedAt)) {
    throw new ApiFailure("permanent", "GAS_MALFORMED_SYNC_RESPONSE", "GAS did not return a complete success response", { response: result });
  }
  if (result.status === "conflict" && (!result.serverRecord || !result.localRecord || !Array.isArray(result.conflictingFields) || result.currentVersion === undefined)) {
    throw new ApiFailure("permanent", "GAS_MALFORMED_SYNC_RESPONSE", "GAS did not return complete conflict details", { response: result });
  }
  if (result.status === "validation_error" && (!Array.isArray(result.fields) || typeof result.message !== "string")) {
    throw new ApiFailure("permanent", "GAS_MALFORMED_SYNC_RESPONSE", "GAS did not return validation fields", { response: result });
  }
  return result;
}

// The write ceiling, argued the same way as the read one above and from the same link speed.
//
// Every field that reaches a CELL is bounded by GAS's own 50 000-character limit
// (`syncSizeRefusal_`), so an ordinary ring or shift report is a few tens of kilobytes — about four
// seconds at 100 kbps. `imageBase64` is the exception on the entities that do not store their
// payload as one JSON blob, and it is exempt precisely because it does not go in a cell: `handleFileUpload` reads the file whole with `readAsDataURL` and never
// resizes, so a phone photo rides inside the envelope at some megabytes. The 15 s that used to be
// here — unnamed, and a sixth of the read's — could carry about 190 KB, so on a tunnel link a save
// with a photo timed out every time, was classified retryable, and sat at the head of its ring's
// domain retrying forever while the strip reported it as still on its way. Before Task 8 the same
// save went through `apiCall` with no deadline at all, so the queue is what introduced the ceiling.
//
// 90 s carries about 1.1 MB at that speed and every payload on an ordinary link. It does NOT carry a
// full-size phone photo underground; nothing bounded would, and the fix for that is resizing at
// capture (see `task8-open-items.md`). It EXCEEDS the sync runner's claim lease, which is deliberate
// and why `SYNC_LEASE_MS` is set from this constant rather than independently: a lease shorter than
// the deadline lets a second claim re-post a mutation still in flight — safe, because GAS takes a
// script lock and replays the stored response for a duplicate requestId, but it spends the crew's
// link a second time on the payload that was already too slow for it.
export const SYNC_POST_TIMEOUT_MS = 90000;

export async function postSyncMutation(mutation) {
  const envelope = mutation;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, SYNC_POST_TIMEOUT_MS);
  try {
    const response = await fetch(GAS_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "syncMutation", data: envelope }),
      signal: controller.signal,
    });
    if (!response.ok) throw classifyHttpFailure(response.status);
    return assertSyncResponse(envelope, await parseGasResponse(response));
  } catch (error) {
    if (timedOut && error && error.name === "AbortError") throw new ApiFailure("retryable", "TIMEOUT", "Sync request timed out", { cause: error });
    throw toApiFailure(error);
  } finally {
    clearTimeout(timeout);
  }
}
