import { ApiFailure, classifyHttpFailure, fetchServerSnapshot, parseGasResponse, postSyncMutation, SNAPSHOT_FETCH_TIMEOUT_MS, SYNC_POST_TIMEOUT_MS, toApiFailure } from "./apiTransport";
import { SYNC_LEASE_MS } from "./syncRunner";

// the stalled-body case advances timers while a promise chain is mid-flight; this just flushes it
const act = async run => { run(); await Promise.resolve(); await Promise.resolve(); };

afterEach(() => jest.restoreAllMocks());

test("posts the stored domain key verbatim rather than rewriting it in flight", async () => {
  // rewriting would diverge the sent key from the persisted one, and per-domain ordering plus the
  // confirmed entity are both filed under the stored key; GAS refuses a non-canonical key loudly
  const stale = {
    requestId: "request-1", entityType: "shiftReport", operation: "update", machine: "TBM1",
    recordId: "sr1", baseVersion: 1, domainKey: "shiftReport:TBM1:2026-07-28T17:00:00.000Z:Day",
    payload: { date: "2026-07-28T17:00:00.000Z", shift: "Day" },
  };
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify({ status: "validation_error", requestId: "request-1", fields: ["domainKey"], message: "invalid sync envelope" }),
  });

  await expect(postSyncMutation(stale)).resolves.toMatchObject({ status: "validation_error", fields: ["domainKey"] });
  expect(JSON.parse(global.fetch.mock.calls[0][1].body).data.domainKey).toBe(stale.domainKey);
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
  const caller = new AbortController();
  await expect(fetchServerSnapshot("TBM 1", { signal: caller.signal }))
    .rejects.toMatchObject({ kind: "aborted", code: "ABORTED" });
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("machine=TBM%201"), expect.objectContaining({ redirect: "follow" }));
});

test("the caller's signal still cancels the request", async () => {
  // the request now carries its own timeout controller, so the caller's signal is chained onto it
  // rather than passed through — a machine switch abandoning this fetch must still abort it
  const caller = new AbortController();
  let aborted = false;
  global.fetch = jest.fn((url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      aborted = true;
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    });
  }));
  const pending = fetchServerSnapshot("TBM1", { signal: caller.signal });
  caller.abort();

  await expect(pending).rejects.toMatchObject({ kind: "aborted", code: "ABORTED" });
  expect(aborted).toBe(true);
});

test("a request that never answers times out instead of hanging", async () => {
  // a tunnel link or captive portal completes the handshake and goes quiet: the request neither
  // succeeds nor fails, and the app shows "refreshing" forever, which hides the snapshot-age strip
  jest.useFakeTimers();
  try {
    global.fetch = jest.fn((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const pending = fetchServerSnapshot("TBM1");
    const settled = jest.fn();
    pending.then(settled, settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    jest.advanceTimersByTime(SNAPSHOT_FETCH_TIMEOUT_MS);
    await expect(pending).rejects.toMatchObject({ kind: "retryable", code: "TIMEOUT" });
  } finally {
    jest.useRealTimers();
  }
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
  // asserting only that the constructor kept its own three arguments could not fail; the point of
  // this type is that the underlying error survives for diagnosis
  const cause = new Error("socket hang up");
  const failure = new ApiFailure("permanent", "CODE", "message", { cause });

  expect(failure).toMatchObject({ kind: "permanent", code: "CODE", message: "message" });
  expect(failure.cause).toBe(cause);
  expect(toApiFailure(failure)).toBe(failure); // already typed, so it passes through unchanged
});

test("a body that stalls after the headers is reported as a timeout, not a cancellation", async () => {
  // a captive portal answers the headers and then goes quiet. Reporting that as ABORTED reads to the
  // crew as "something cancelled it" rather than "it timed out".
  jest.useFakeTimers();
  try {
    global.fetch = jest.fn(async () => ({
      ok: true,
      text: () => new Promise((resolve, reject) => {
        setTimeout(() => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), SNAPSHOT_FETCH_TIMEOUT_MS + 1000);
      }),
    }));
    const pending = fetchServerSnapshot("TBM1");
    const settled = jest.fn();
    pending.then(settled, settled);
    await Promise.resolve();

    await act(() => jest.advanceTimersByTime(SNAPSHOT_FETCH_TIMEOUT_MS + 1000));
    await expect(pending).rejects.toMatchObject({ kind: "retryable", code: "TIMEOUT" });
  } finally {
    jest.useRealTimers();
  }
});

test("the snapshot request bypasses the HTTP cache", async () => {
  // the shift report's server check depends on this fetch reading the sheet AFTER it is issued; a
  // cached body would be a read from before the question was asked
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ status: "success" }) });

  await fetchServerSnapshot("TBM1");

  expect(global.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cache: "no-store" }));
});

test("a completed request clears its timer and its abort listener", async () => {
  // asserting only that *some* clearTimeout ran would pass with this request's timer still pending;
  // the timer count is what actually shows it is gone
  jest.useFakeTimers();
  try {
    const caller = new AbortController();
    const removeSpy = jest.spyOn(caller.signal, "removeEventListener");
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ status: "success" }) });
    const before = jest.getTimerCount();

    await fetchServerSnapshot("TBM1", { signal: caller.signal });

    expect(jest.getTimerCount()).toBe(before);
    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  } finally {
    jest.useRealTimers();
  }
});

test("a signal already aborted before the call never leaves the device", async () => {
  const caller = new AbortController();
  caller.abort();
  global.fetch = jest.fn((url, options) => (options.signal.aborted
    ? Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
    : Promise.resolve({ ok: true, text: async () => "{}" })));

  await expect(fetchServerSnapshot("TBM1", { signal: caller.signal })).rejects.toMatchObject({ kind: "aborted" });
});

test("posts the complete mutation envelope and returns the typed sync response", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ status: "success", requestId: "request-1", record: { recordId: "segment-1" }, version: 2, updatedAt: "2026-07-29T00:00:00.000Z" }) });
  const mutation = { requestId: "request-1", entityType: "segment", machine: "TBM1", recordId: "segment-1", domainKey: "segment:TBM1:P1:Permanent", payload: { ringNo: "P1" } };

  await expect(postSyncMutation(mutation)).resolves.toMatchObject({ status: "success", requestId: "request-1" });
  expect(global.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ action: "syncMutation", data: mutation }),
  }));
});

test("clears the post deadline once the request settles, either way", async () => {
  // named for a success but mocked as a validation_error, so the path it claimed was never the path
  // it ran; both settle the request, and both must clear the timer
  jest.useFakeTimers();
  try {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ status: "success", requestId: "request-1", record: { recordId: "segment-1" }, version: 2, updatedAt: "2026-07-29T00:00:00.000Z" }) });
    await postSyncMutation({ requestId: "request-1" });
    expect(jest.getTimerCount()).toBe(0);

    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ status: "validation_error", requestId: "request-1", fields: [], message: "Bad ring" }) });
    await postSyncMutation({ requestId: "request-1" });
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test("a write is given the time the payload it carries needs", async () => {
  // The write is the LARGER payload: every other field is bounded by GAS's 50 000-character cell
  // limit, and `imageBase64` is exempt from it because it goes to Drive — a phone photo is read
  // whole and rides inside the envelope. The 15 s that used to be here could carry about 190 KB at
  // the link speed the read ceiling is argued from, so a save with a photo timed out every time,
  // was classified retryable, and blocked its ring's domain while the strip called it on its way.
  jest.useFakeTimers();
  try {
    global.fetch = jest.fn((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const pending = postSyncMutation({ requestId: "r1", entityType: "segment", operation: "create", payload: {} });
    const settled = jest.fn();
    pending.then(settled, settled);
    await Promise.resolve();

    jest.advanceTimersByTime(30000); // where a 15 s ceiling would already have given up
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    jest.advanceTimersByTime(SYNC_POST_TIMEOUT_MS - 30000);
    await expect(pending).rejects.toMatchObject({ kind: "retryable", code: "TIMEOUT" });
  } finally {
    jest.useRealTimers();
  }
});

test("the claim lease outlives the write deadline", async () => {
  // A lease shorter than the deadline lets a second runner claim and re-post a mutation whose first
  // post is still in flight. Nothing is written twice — GAS takes a script lock and replays the
  // stored response for a repeated requestId — but the second post spends the crew's link again on
  // the payload that was already too slow for it. The derivation makes that impossible today, so
  // what this catches is someone replacing it with a literal: it is a tripwire, not coverage.
  expect(SYNC_LEASE_MS).toBeGreaterThan(SYNC_POST_TIMEOUT_MS);
});
