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

export async function fetchServerSnapshot(machine, { signal } = {}) {
  let response;
  try { response = await fetch(`${GAS_URL}?action=getData&machine=${encodeURIComponent(machine)}`, { redirect: "follow", signal }); } catch (error) { throw toApiFailure(error); }
  if (!response.ok) throw classifyHttpFailure(response.status);
  return parseGasResponse(response);
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

export async function postSyncMutation(mutation) {
  const envelope = mutation;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
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
