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
