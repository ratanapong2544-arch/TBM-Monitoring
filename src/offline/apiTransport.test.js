import { ApiFailure, classifyHttpFailure, fetchServerSnapshot, parseGasResponse } from "./apiTransport";

afterEach(() => jest.restoreAllMocks());

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
