// Contract tests for the GAS sync backend (gas-live/Code.js, outside this repo).
// They pin the pure helpers shared with the client: domain keys (tools/sync-domain-vectors.json),
// optimistic version checks, response shapes accepted by src/offline/apiTransport.js
// (assertSyncResponse), field diffing, and envelope validation.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const vectors = require(path.join(__dirname, "sync-domain-vectors.json"));
const gas = require(path.join(__dirname, "..", "..", "gas-live", "Code.js"));

const {
  makeSyncRecordKey_,
  checkSyncVersion_,
  buildSyncResponse_,
  diffSyncFields_,
  validateSyncEnvelope_,
  SYNC_META_HEADERS,
  SYNC_REQUEST_HEADERS,
} = gas;

function validEnvelope(overrides) {
  const base = {
    requestId: "req-1",
    entityType: "segment",
    operation: "update",
    machine: "TBM1",
    recordId: "s1",
    baseVersion: 3,
    deviceId: "device-1",
    actorId: null,
    createdAtLocal: "2026-07-30T08:00:00.000Z",
    payload: { ringNo: "P41", installType: "Permanent", length: "1.4" },
  };
  const envelope = Object.assign({}, base, overrides);
  if (!("domainKey" in (overrides || {}))) envelope.domainKey = makeSyncRecordKey_(envelope);
  return envelope;
}

test("client and GAS produce the same domain keys for every shared vector", () => {
  assert.ok(vectors.length >= 13, "domain vectors must cover every entity type");
  for (const vector of vectors) {
    assert.equal(makeSyncRecordKey_(vector.input), vector.domainKey, JSON.stringify(vector.input));
  }
});

test("stale base version is a conflict", () => {
  assert.deepEqual(checkSyncVersion_(2, 3), { ok: false, currentVersion: 3 });
});

test("a base version ahead of the server is also a conflict", () => {
  assert.deepEqual(checkSyncVersion_(5, 3), { ok: false, currentVersion: 3 });
});

test("matching base version advances exactly once", () => {
  assert.deepEqual(checkSyncVersion_(3, 3), { ok: true, nextVersion: 4 });
});

test("first write against an untracked record advances from zero", () => {
  assert.deepEqual(checkSyncVersion_(0, 0), { ok: true, nextVersion: 1 });
  assert.deepEqual(checkSyncVersion_(null, 0), { ok: true, nextVersion: 1 });
});

test("version comparison coerces numeric strings", () => {
  assert.deepEqual(checkSyncVersion_("2", 2), { ok: true, nextVersion: 3 });
  assert.deepEqual(checkSyncVersion_("1", "2"), { ok: false, currentVersion: 2 });
});

test("success responses carry every field the client transport requires", () => {
  const record = { id: "s1", ringNo: "P41" };
  const response = buildSyncResponse_("success", "req-1", {
    record,
    version: 4,
    updatedAt: "2026-07-30T08:00:00.000Z",
  });
  assert.equal(response.status, "success");
  assert.equal(response.requestId, "req-1");
  assert.deepEqual(response.record, record);
  assert.equal(response.version, 4);
  assert.equal(response.updatedAt, "2026-07-30T08:00:00.000Z");
});

test("conflict responses carry both records, sorted fields, and the current version", () => {
  const response = buildSyncResponse_("conflict", "req-2", {
    serverRecord: { id: "s1", length: "1.5" },
    localRecord: { id: "s1", length: "1.4" },
    conflictingFields: ["ringNo", "length", "date"],
    currentVersion: 7,
    currentUpdatedAt: "2026-07-30T08:00:00.000Z",
  });
  assert.equal(response.status, "conflict");
  assert.equal(response.requestId, "req-2");
  assert.deepEqual(response.serverRecord, { id: "s1", length: "1.5" });
  assert.deepEqual(response.localRecord, { id: "s1", length: "1.4" });
  assert.deepEqual(response.conflictingFields, ["date", "length", "ringNo"]);
  assert.equal(response.currentVersion, 7);
  assert.equal(response.currentUpdatedAt, "2026-07-30T08:00:00.000Z");
});

test("conflict responses never return a missing conflictingFields array", () => {
  const response = buildSyncResponse_("conflict", "req-2b", {
    serverRecord: { id: "s1" },
    localRecord: { id: "s1" },
    currentVersion: 2,
  });
  assert.deepEqual(response.conflictingFields, []);
});

test("validation responses carry fields and a message", () => {
  const response = buildSyncResponse_("validation_error", "req-3", {
    fields: ["ringNo"],
    message: "invalid",
    code: "SYNC_META_ORPHAN",
  });
  assert.equal(response.status, "validation_error");
  assert.equal(response.requestId, "req-3");
  assert.deepEqual(response.fields, ["ringNo"]);
  assert.equal(response.message, "invalid");
  assert.equal(response.code, "SYNC_META_ORPHAN");
});

test("unknown response types are refused", () => {
  assert.throws(() => buildSyncResponse_("partial", "req-4", {}));
});

test("field diff ignores representation-only differences", () => {
  assert.deepEqual(
    diffSyncFields_({ length: "1.4", ringNo: 41, remark: null }, { length: 1.4, ringNo: "41", remark: "" }),
    []
  );
});

test("field diff reports engineering differences sorted", () => {
  assert.deepEqual(
    diffSyncFields_(
      { ringNo: "41", length: "1.5", remark: "b", startCH: "8100" },
      { ringNo: "41", length: "1.4", remark: "a", startCH: "8100" }
    ),
    ["length", "remark"]
  );
});

test("field diff skips identity, binary image, and server timestamp fields", () => {
  assert.deepEqual(
    diffSyncFields_(
      { id: "new-id", imageBase64: "data:image/png;base64,AAA", imageName: "a.png", timestamp: "x", length: "1.4" },
      { id: "server-id", imageBase64: "", imageName: "", timestamp: "y", length: "1.4" }
    ),
    []
  );
});

test("field diff treats structured values as JSON", () => {
  assert.deepEqual(diffSyncFields_({ positions: [1, 2] }, { positions: "[1,2]" }), []);
  assert.deepEqual(diffSyncFields_({ positions: [1, 2] }, { positions: "[1,3]" }), ["positions"]);
});

test("a complete envelope validates cleanly", () => {
  assert.deepEqual(validateSyncEnvelope_(validEnvelope()), []);
});

test("every shared vector round-trips through envelope validation", () => {
  for (const vector of vectors) {
    const envelope = {
      requestId: "req-v",
      operation: "create",
      baseVersion: 0,
      payload: vector.input.payload,
      entityType: vector.input.entityType,
      machine: vector.input.machine,
      recordId: vector.input.recordId,
      domainKey: vector.domainKey,
    };
    if (vector.input.entityType === "shiftReport") {
      envelope.payload = { date: "2026-07-29", shift: "Night" };
    }
    assert.deepEqual(validateSyncEnvelope_(envelope), [], vector.domainKey);
  }
});

test("missing envelope identity fields are reported", () => {
  assert.ok(validateSyncEnvelope_(validEnvelope({ requestId: "" })).includes("requestId"));
  assert.ok(validateSyncEnvelope_(validEnvelope({ recordId: "" })).includes("recordId"));
  assert.ok(validateSyncEnvelope_(validEnvelope({ payload: null })).includes("payload"));
});

test("unknown entity types and operations are validation errors", () => {
  assert.ok(validateSyncEnvelope_(validEnvelope({ entityType: "mystery" })).includes("entityType"));
  assert.ok(validateSyncEnvelope_(validEnvelope({ operation: "merge" })).includes("operation"));
});

test("unsupported per-entity operations are refused", () => {
  const shiftDelete = validEnvelope({
    entityType: "shiftReport",
    operation: "delete",
    recordId: "sr1",
    payload: { date: "2026-07-29", shift: "Night" },
  });
  assert.ok(validateSyncEnvelope_(shiftDelete).includes("operation"));
  const configDelete = validEnvelope({
    entityType: "planConfig",
    operation: "delete",
    recordId: "cfg",
    payload: { planConfig: {} },
  });
  assert.ok(validateSyncEnvelope_(configDelete).includes("operation"));
});

test("machine-scoped entities require machine and ring identity", () => {
  assert.ok(validateSyncEnvelope_(validEnvelope({ machine: "" })).includes("machine"));
  assert.ok(
    validateSyncEnvelope_(validEnvelope({ payload: { installType: "Permanent" } })).includes("ringNo")
  );
  const shiftMissing = validEnvelope({
    entityType: "shiftReport",
    operation: "create",
    baseVersion: 0,
    recordId: "sr1",
    payload: { date: "", shift: "" },
  });
  const shiftFields = validateSyncEnvelope_(shiftMissing);
  assert.ok(shiftFields.includes("date"));
  assert.ok(shiftFields.includes("shift"));
});

test("updates and deletes require a usable base version", () => {
  assert.ok(validateSyncEnvelope_(validEnvelope({ baseVersion: null })).includes("baseVersion"));
  assert.ok(validateSyncEnvelope_(validEnvelope({ baseVersion: -1 })).includes("baseVersion"));
  assert.ok(validateSyncEnvelope_(validEnvelope({ baseVersion: 1.5 })).includes("baseVersion"));
  const create = validEnvelope({ operation: "create", baseVersion: 0 });
  assert.deepEqual(validateSyncEnvelope_(create), []);
});

test("a domain key that disagrees with the canonical key is refused", () => {
  assert.ok(validateSyncEnvelope_(validEnvelope({ domainKey: "segment:TBM1:P41:Temporary" })).includes("domainKey"));
});

test("sync sheets use the exact additive headers from the plan", () => {
  assert.deepEqual(SYNC_META_HEADERS, [
    "recordKey",
    "entityType",
    "machine",
    "recordId",
    "version",
    "updatedAt",
    "updatedByDevice",
    "deleted",
  ]);
  assert.deepEqual(SYNC_REQUEST_HEADERS, ["requestId", "status", "responseJson", "createdAt"]);
});
