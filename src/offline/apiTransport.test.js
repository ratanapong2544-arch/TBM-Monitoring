import { ApiFailure, canonicalizeMutationEnvelope, classifyHttpFailure, fetchServerSnapshot, parseGasResponse, postSyncMutation } from "./apiTransport";

afterEach(() => jest.restoreAllMocks());

test("a stale queued domain key is recomputed before it is posted", async () => {
  // a mutation queued by an older build carries a key GAS would reject as non-canonical, which
  // would park a terminal error at the domain head forever
  const stale = {
    requestId: "request-1", entityType: "shiftReport", operation: "update", machine: "TBM1",
    recordId: "sr1", baseVersion: 1, domainKey: "shiftReport:TBM1:2026-07-28T17:00:00.000Z:Day",
    payload: { date: "2026-07-28T17:00:00.000Z", shift: "Day" },
  };
  expect(canonicalizeMutationEnvelope(stale).domainKey).toBe("shiftReport:TBM1:2026-07-29:Day");
  const canonical = { ...stale, domainKey: "shiftReport:TBM1:2026-07-29:Day" };
  expect(canonicalizeMutationEnvelope(canonical)).toBe(canonical);

  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify({ status: "success", requestId: "request-1", record: { id: "sr1" }, version: 2, updatedAt: "2026-07-29T00:00:00.000Z" }),
  });
  await postSyncMutation(stale);
  const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(sent.data.domainKey).toBe("shiftReport:TBM1:2026-07-29:Day");
});

test.each([
  [429, "retryable"], [500, "retryable"], [503, "retryable"], [400, "permanent"], [422, "validation"]
])("classifies HTTP %s as %s", (status, kind) => {
  expect(classifyHttpFailure(status).kind).toBe(kind);
});

test("HTML permission response is permanent", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => "<html>permission</html>" });
  await expect(fetchServerSnapshot("TBM1")).rejects.toMatchObject({ kind: "permanent", code: "GAS_PERMISSION_HTML" });
});

test("classifies a GAS validation error", async () => {
  await expect(parseGasResponse({ text: async () => JSON.stringify({ status: "error", code: "VALIDATION", message: "Bad ring" }) }))
    .rejects.toMatchObject({ kind: "validation", code: "VALIDATION", message: "Bad ring" });
});

test.each([[429, "retryable"], [500, "retryable"], [503, "retryable"], [422, "validation"]])("classifies a wrapped GAS HTTP %s as %s", async (httpStatus, kind) => {
  await expect(parseGasResponse({ text: async () => JSON.stringify({ status: "error", httpStatus, message: "wrapped" }) }))
    .rejects.toMatchObject({ kind, status: httpStatus });
});

test("classifies malformed JSON as a permanent GAS response failure", async () => {
  await expect(parseGasResponse({ text: async () => "not json" }))
    .rejects.toMatchObject({ kind: "permanent", code: "GAS_MALFORMED_JSON" });
});

test("preserves abort failures as a distinct typed failure", async () => {
  global.fetch = jest.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
  await expect(fetchServerSnapshot("TBM 1", { signal: "signal" }))
    .rejects.toMatchObject({ kind: "aborted", code: "ABORTED" });
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("machine=TBM%201"), expect.objectContaining({ redirect: "follow", signal: "signal" }));
});

test("classifies normal network rejection as retryable", async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
  await expect(fetchServerSnapshot("TBM1")).rejects.toMatchObject({ kind: "retryable", code: "NETWORK", message: "offline" });
});

test("rejects non-success HTTP responses before parsing their body", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "nope" });
  await expect(fetchServerSnapshot("TBM1")).rejects.toMatchObject({ kind: "retryable", status: 503 });
});

test("ApiFailure retains a typed cause", () => {
  expect(new ApiFailure("permanent", "CODE", "message")).toMatchObject({ kind: "permanent", code: "CODE", message: "message" });
});

test("posts the complete mutation envelope and returns the typed sync response", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ status: "success", requestId: "request-1", record: { recordId: "segment-1" }, version: 2, updatedAt: "2026-07-29T00:00:00.000Z" }) });
  const mutation = { requestId: "request-1", entityType: "segment", machine: "TBM1", recordId: "segment-1", payload: { ringNo: "P1" } };

  await expect(postSyncMutation(mutation)).resolves.toMatchObject({ status: "success", requestId: "request-1" });
  // the posted envelope always carries the canonical domain key, recomputed at post time
  expect(global.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ action: "syncMutation", data: { ...mutation, domainKey: "segment:TBM1:P1:Permanent" } }),
  }));
});

test("cleans up the 15 second timeout after a successful sync post", async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ status: "validation_error", requestId: "request-1", fields: [], message: "Bad ring" }) });

  await postSyncMutation({ requestId: "request-1" });

  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});
