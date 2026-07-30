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
  handleSyncMutation_,
  handleLegacyWrite_,
  getSyncMetaRow_,
  bumpSyncMetaMany_,
  getSyncMetaMap_,
  storeSyncResponse_,
  SYNC_META_HEADERS,
  SYNC_REQUEST_HEADERS,
} = gas;

// ---------------------------------------------------------------------------
// Fake Sheets harness — enough of the SpreadsheetApp surface for the sync
// engine (getRange/getDataRange/appendRow/deleteRow(s)/TextFinder).
// TextFinder simulates the real Sheets default: case-INSENSITIVE unless
// matchCase(true) is called, so missing matchCase in production code fails here.
// ---------------------------------------------------------------------------
function makeFakeSheet(name, rows) {
  const data = (rows || []).map((r) => r.slice());
  function makeRange(row, col, numRows, numCols) {
    return {
      getValues() {
        const out = [];
        for (let r = 0; r < numRows; r++) {
          const src = data[row - 1 + r] || [];
          const line = [];
          for (let c = 0; c < numCols; c++) line.push(src[col - 1 + c] !== undefined ? src[col - 1 + c] : "");
          out.push(line);
        }
        return out;
      },
      setValues(vals) {
        for (let r = 0; r < vals.length; r++) {
          const tr = row - 1 + r;
          while (data.length <= tr) data.push([]);
          for (let c = 0; c < vals[r].length; c++) {
            while (data[tr].length < col - 1 + c) data[tr].push("");
            data[tr][col - 1 + c] = vals[r][c];
          }
        }
      },
      setValue(v) { this.setValues([[v]]); },
      setFontWeight() { return this; },
      setBackground() { return this; },
      createTextFinder(text) {
        let entire = false;
        let caseSensitive = false;
        const finder = {
          matchEntireCell(v) { entire = v; return finder; },
          matchCase(v) { caseSensitive = v; return finder; },
          findNext() {
            const target = String(text);
            for (let r = 0; r < numRows; r++) {
              for (let c = 0; c < numCols; c++) {
                const cell = String(((data[row - 1 + r] || [])[col - 1 + c]) ?? "");
                const a = caseSensitive ? cell : cell.toLowerCase();
                const b = caseSensitive ? target : target.toLowerCase();
                if (entire ? a === b : a.indexOf(b) !== -1) {
                  return { getRow: () => row + r, getColumn: () => col + c };
                }
              }
            }
            return null;
          },
        };
        return finder;
      },
    };
  }
  return {
    _data: data,
    getName: () => name,
    getLastRow: () => data.length,
    getLastColumn: () => (data[0] ? data[0].length : 0),
    appendRow(row) {
      const width = Math.max(data[0] ? data[0].length : row.length, row.length);
      const out = row.slice();
      while (out.length < width) out.push("");
      data.push(out);
    },
    deleteRow(r) { data.splice(r - 1, 1); },
    deleteRows(r, n) { data.splice(r - 1, n); },
    getDataRange() { return makeRange(1, 1, Math.max(data.length, 1), data[0] ? data[0].length : 1); },
    getRange(row, col, numRows, numCols) {
      if (typeof row === "string") return { setFontWeight() { return this; }, setBackground() { return this; } };
      return makeRange(row, col, numRows || 1, numCols || 1);
    },
  };
}

function makeFakeSpreadsheet(sheets) {
  return {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet(n) { sheets[n] = makeFakeSheet(n, []); return sheets[n]; },
  };
}

const SEG_HEADERS = ["id", "date", "shift", "ringNo", "typeRing", "keyPos", "startTime", "endTime", "length", "startCH", "finishCH", "problem", "imageUrl", "timestamp", "installType"];
const SHIFT_HEADERS = ["id", "date", "shift", "tbmNo", "location", "events", "manpower", "result", "timestamp"];
const GROUT_HEADERS = ["id", "date", "shift", "ringNo", "excavRing", "key", "partA", "partB", "total", "ratio", "pressure", "positions", "remark", "imageUrl", "timestamp", "groutPass"];

function makeFakeState(seed) {
  const sheets = {
    Segments: makeFakeSheet("Segments", [SEG_HEADERS.slice()]),
    ShiftReports: makeFakeSheet("ShiftReports", [SHIFT_HEADERS.slice()]),
    Grouts: makeFakeSheet("Grouts", [GROUT_HEADERS.slice()]),
    SyncMeta: makeFakeSheet("SyncMeta", [SYNC_META_HEADERS.slice()]),
    SyncRequests: makeFakeSheet("SyncRequests", [SYNC_REQUEST_HEADERS.slice()]),
  };
  Object.assign(sheets, seed || {});
  return { ss: makeFakeSpreadsheet(sheets), sheets };
}

function sheetObjects(sheet) {
  const rows = sheet._data;
  const headers = rows[0] || [];
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i]; });
    return obj;
  });
}

function segmentEnvelope(overrides) {
  const envelope = Object.assign({
    requestId: "req-seg-1", entityType: "segment", operation: "create", machine: "TBM1",
    recordId: "seg-new-1", baseVersion: 0, deviceId: "device-A",
    payload: { ringNo: "41", installType: "Permanent", length: "1.4", date: "2026-07-29" },
  }, overrides);
  envelope.domainKey = makeSyncRecordKey_(envelope);
  return envelope;
}

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

// ---------------------------------------------------------------------------
// Sheet-typed value handling (Sheets returns Date objects for date/time cells)
// ---------------------------------------------------------------------------

test("shiftReport domain keys normalize Date-typed sheet dates", () => {
  const fromSheet = {
    entityType: "shiftReport", machine: "TBM1", recordId: "sr1",
    payload: { date: new Date(2026, 6, 29), shift: "Night" },
  };
  assert.equal(makeSyncRecordKey_(fromSheet), "shiftReport:TBM1:2026-07-29:Night");
});

test("field diff treats Date-typed sheet values as their client string forms", () => {
  assert.deepEqual(
    diffSyncFields_(
      { date: "2026-07-29", startTime: "08:00", length: "1.40" },
      { date: new Date(2026, 6, 29), startTime: new Date(1899, 11, 30, 8, 0), length: 1.4 }
    ),
    []
  );
  assert.deepEqual(
    diffSyncFields_({ date: "2026-07-30" }, { date: new Date(2026, 6, 29) }),
    ["date"]
  );
});

test("field diff skips the imageBase64Omitted redaction marker", () => {
  assert.deepEqual(diffSyncFields_({ imageBase64Omitted: true, length: "1.4" }, { length: 1.4 }), []);
});

test("dailyReport and prepTask envelopes require machine to avoid key splits", () => {
  const daily = {
    requestId: "req-d", entityType: "dailyReport", operation: "create", baseVersion: 0,
    recordId: "d1", payload: {},
  };
  daily.domainKey = makeSyncRecordKey_(daily);
  assert.ok(validateSyncEnvelope_(daily).includes("machine"));
  const prep = Object.assign({}, daily, { entityType: "prepTask", recordId: "p1" });
  prep.domainKey = makeSyncRecordKey_(prep);
  assert.ok(validateSyncEnvelope_(prep).includes("machine"));
});

// ---------------------------------------------------------------------------
// State machine on fake sheets: idempotency, versions, conflicts, convergence
// ---------------------------------------------------------------------------

test("create applies once, bumps meta to v1, and stores the ledger response", () => {
  const { ss, sheets } = makeFakeState();
  const envelope = segmentEnvelope();
  const response = handleSyncMutation_(ss, envelope);
  assert.equal(response.status, "success");
  assert.equal(response.version, 1);
  assert.ok(response.updatedAt);
  assert.equal(response.record.id, "seg-new-1");
  const rows = sheetObjects(sheets.Segments);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "seg-new-1");
  const meta = sheetObjects(sheets.SyncMeta);
  assert.equal(meta.length, 1);
  assert.equal(meta[0].recordKey, envelope.domainKey);
  assert.equal(meta[0].version, 1);
  assert.equal(meta[0].updatedByDevice, "device-A");
  const ledger = sheetObjects(sheets.SyncRequests);
  assert.equal(ledger.length, 1);
  assert.deepEqual(JSON.parse(ledger[0].responseJson), response);
});

test("duplicate delivery replays the stored response without a second apply", () => {
  const { ss, sheets } = makeFakeState();
  const envelope = segmentEnvelope();
  const first = handleSyncMutation_(ss, envelope);
  const replay = handleSyncMutation_(ss, envelope);
  assert.deepEqual(replay, first);
  assert.equal(sheetObjects(sheets.Segments).length, 1);
  assert.equal(sheetObjects(sheets.SyncRequests).length, 1);
  assert.equal(sheetObjects(sheets.SyncMeta)[0].version, 1);
});

test("stale base version returns a structured conflict and writes nothing", () => {
  const { ss, sheets } = makeFakeState();
  handleSyncMutation_(ss, segmentEnvelope());
  handleSyncMutation_(ss, segmentEnvelope({
    requestId: "req-seg-2", operation: "update", recordId: "seg-new-1", baseVersion: 1,
    payload: { ringNo: "41", installType: "Permanent", length: "1.5", date: "2026-07-29" },
  }));
  const conflict = handleSyncMutation_(ss, segmentEnvelope({
    requestId: "req-seg-3", operation: "update", recordId: "seg-new-1", baseVersion: 1,
    payload: { ringNo: "41", installType: "Permanent", length: "1.6", date: "2026-07-29" },
  }));
  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.currentVersion, 2);
  assert.equal(conflict.serverRecord.id, "seg-new-1");
  assert.deepEqual(conflict.conflictingFields, ["length"]);
  assert.equal(String(sheetObjects(sheets.Segments)[0].length), "1.5");
});

test("create colliding with an untracked legacy row conflicts even when the sheet date is Date-typed", () => {
  const { ss, sheets } = makeFakeState();
  sheets.ShiftReports.appendRow(["sr-legacy", new Date(2026, 6, 29), "Day", "TBM1", "", "", "", "legacy result", ""]);
  const envelope = {
    requestId: "req-shift-1", entityType: "shiftReport", operation: "create", machine: "TBM1",
    recordId: "sr-new", baseVersion: 0, deviceId: "device-A",
    payload: { date: "2026-07-29", shift: "Day", result: "pwa result" },
  };
  envelope.domainKey = makeSyncRecordKey_(envelope);
  const response = handleSyncMutation_(ss, envelope);
  assert.equal(response.status, "conflict");
  assert.equal(response.currentVersion, 1);
  assert.equal(response.serverRecord.id, "sr-legacy");
  assert.equal(sheetObjects(sheets.ShiftReports).length, 1, "must not append a duplicate shift report");
  const meta = sheetObjects(sheets.SyncMeta);
  assert.equal(meta.length, 1);
  assert.equal(meta[0].recordKey, "shiftReport:TBM1:2026-07-29:Day");
  assert.equal(meta[0].version, 1);
  assert.equal(meta[0].updatedByDevice, "legacy-backfill");
});

test("a resolved duplicate-create successor applies onto the existing server row", () => {
  const { ss, sheets } = makeFakeState();
  sheets.ShiftReports.appendRow(["sr-legacy", new Date(2026, 6, 29), "Day", "TBM1", "", "", "", "legacy result", ""]);
  const create = {
    requestId: "req-shift-1", entityType: "shiftReport", operation: "create", machine: "TBM1",
    recordId: "sr-new", baseVersion: 0, deviceId: "device-A",
    payload: { date: "2026-07-29", shift: "Day", result: "pwa result" },
  };
  create.domainKey = makeSyncRecordKey_(create);
  const conflict = handleSyncMutation_(ss, create);
  assert.equal(conflict.status, "conflict");
  const successor = Object.assign({}, create, {
    requestId: "req-shift-2", baseVersion: conflict.currentVersion,
    payload: { date: "2026-07-29", shift: "Day", result: "merged result" },
  });
  const response = handleSyncMutation_(ss, successor);
  assert.equal(response.status, "success");
  assert.equal(response.version, 2);
  const rows = sheetObjects(sheets.ShiftReports);
  assert.equal(rows.length, 1, "successor must update the existing row, not append");
  assert.equal(rows[0].id, "sr-legacy");
  assert.equal(rows[0].result, "merged result");
});

test("segment create collision is detected across differing record ids", () => {
  const { ss, sheets } = makeFakeState();
  sheets.Segments.appendRow(["seg-legacy", "2026-07-29", "Day", 41, "", "", "", "", 1.4, "", "", "", "", "", "Permanent"]);
  const response = handleSyncMutation_(ss, segmentEnvelope({ requestId: "req-seg-x" }));
  assert.equal(response.status, "conflict");
  assert.equal(response.serverRecord.id, "seg-legacy");
  assert.equal(sheetObjects(sheets.Segments).length, 1);
});

test("metadata without a business row is a SYNC_META_ORPHAN diagnostic on both version paths", () => {
  const { ss } = makeFakeState();
  bumpSyncMetaMany_(ss, [{
    recordKey: "segment:TBM1:41:Permanent", entityType: "segment", machine: "TBM1",
    recordId: "seg-gone", version: 2, updatedAt: "2026-07-29T00:00:00.000Z", updatedByDevice: "x", deleted: false,
  }]);
  const stale = handleSyncMutation_(ss, segmentEnvelope({
    requestId: "req-orphan-1", operation: "update", recordId: "seg-gone", baseVersion: 1,
  }));
  assert.equal(stale.status, "validation_error");
  assert.equal(stale.code, "SYNC_META_ORPHAN");
  const matching = handleSyncMutation_(ss, segmentEnvelope({
    requestId: "req-orphan-2", operation: "update", recordId: "seg-gone", baseVersion: 2,
  }));
  assert.equal(matching.status, "validation_error");
  assert.equal(matching.code, "SYNC_META_ORPHAN");
});

test("delete tombstones the domain and stale edits then conflict against the deletion", () => {
  const { ss, sheets } = makeFakeState();
  handleSyncMutation_(ss, segmentEnvelope());
  const del = handleSyncMutation_(ss, segmentEnvelope({ requestId: "req-del", operation: "delete", baseVersion: 1 }));
  assert.equal(del.status, "success");
  assert.deepEqual(del.record, { id: "seg-new-1", deleted: true });
  assert.equal(sheetObjects(sheets.Segments).length, 0);
  const meta = sheetObjects(sheets.SyncMeta)[0];
  assert.equal(meta.version, 2);
  assert.equal(meta.deleted, true);
  const conflict = handleSyncMutation_(ss, segmentEnvelope({
    requestId: "req-after-del", operation: "update", recordId: "seg-new-1", baseVersion: 1,
  }));
  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.serverRecord.deleted, true);
  assert.equal(conflict.currentVersion, 2);
});

test("conflict responses redact imageBase64 so the stored ledger row stays small", () => {
  const { ss, sheets } = makeFakeState();
  sheets.Grouts.appendRow(["g1", "2026-07-29", "Day", 42, "", "", 1, 2, 3, "", 2.5, "", "", "", "", "Primary"]);
  bumpSyncMetaMany_(ss, [{
    recordKey: "grout:TBM1:42:Primary", entityType: "grout", machine: "TBM1",
    recordId: "g1", version: 2, updatedAt: "2026-07-29T00:00:00.000Z", updatedByDevice: "x", deleted: false,
  }]);
  const envelope = {
    requestId: "req-grout-img", entityType: "grout", operation: "update", machine: "TBM1",
    recordId: "g1", baseVersion: 1, deviceId: "device-A",
    payload: { ringNo: "42", pressure: "3.0", imageBase64: "data:image/png;base64," + "A".repeat(60000), imageName: "photo.png" },
  };
  envelope.domainKey = makeSyncRecordKey_(envelope);
  const response = handleSyncMutation_(ss, envelope);
  assert.equal(response.status, "conflict");
  assert.equal(response.localRecord.imageBase64, undefined);
  assert.equal(response.localRecord.imageBase64Omitted, true);
  assert.equal(response.localRecord.imageName, "photo.png");
  const ledger = sheetObjects(sheets.SyncRequests);
  assert.equal(ledger.length, 1);
  assert.ok(String(ledger[0].responseJson).length < 50000, "stored responseJson must fit a Sheets cell");
  assert.deepEqual(JSON.parse(ledger[0].responseJson), response);
  const replay = handleSyncMutation_(ss, envelope);
  assert.deepEqual(replay, response);
});

test("invalid envelopes never touch business sheets or the ledger", () => {
  const { ss, sheets } = makeFakeState();
  const response = handleSyncMutation_(ss, segmentEnvelope({ entityType: "mystery" }));
  assert.equal(response.status, "validation_error");
  assert.equal(sheetObjects(sheets.Segments).length, 0);
  assert.equal(sheetObjects(sheets.SyncRequests).length, 0);
});

// ---------------------------------------------------------------------------
// Legacy write paths
// ---------------------------------------------------------------------------

test("legacy shiftReport update bumps the canonical key for Date-typed rows", () => {
  const { ss, sheets } = makeFakeState();
  sheets.ShiftReports.appendRow(["sr-legacy", new Date(2026, 6, 29), "Day", "TBM1", "", "", "", "old", ""]);
  const result = handleLegacyWrite_(ss, "updateShiftReport", "TBM1", { id: "sr-legacy", result: "new" });
  assert.equal(result.status, "success");
  const meta = sheetObjects(sheets.SyncMeta);
  assert.equal(meta.length, 1);
  assert.equal(meta[0].recordKey, "shiftReport:TBM1:2026-07-29:Day");
  assert.equal(meta[0].updatedByDevice, "legacy-client");
  assert.equal(meta[0].version, 1);
});

test("a legacy update that matches no row does not mint metadata", () => {
  const { ss, sheets } = makeFakeState();
  const result = handleLegacyWrite_(ss, "updateSegment", "TBM1", { id: "ghost", ringNo: "99", installType: "Permanent" });
  assert.equal(result.status, "success");
  assert.equal(sheetObjects(sheets.SyncMeta).length, 0);
});

test("legacy delete bumps a tombstone from the pre-delete row", () => {
  const { ss, sheets } = makeFakeState();
  sheets.Segments.appendRow(["seg-legacy", "2026-07-29", "Day", 41, "", "", "", "", 1.4, "", "", "", "", "", "Permanent"]);
  const result = handleLegacyWrite_(ss, "deleteSegment", "TBM1", { id: "seg-legacy" });
  assert.equal(result.status, "success");
  assert.equal(sheetObjects(sheets.Segments).length, 0);
  const meta = sheetObjects(sheets.SyncMeta);
  assert.equal(meta.length, 1);
  assert.equal(meta[0].recordKey, "segment:TBM1:41:Permanent");
  assert.equal(meta[0].deleted, true);
});

test("unknown legacy actions return the historical error shape", () => {
  const { ss } = makeFakeState();
  assert.deepEqual(handleLegacyWrite_(ss, "explodeSheet", "TBM1", { id: "x" }),
    { status: "error", message: "unknown action", action: "explodeSheet" });
});

// ---------------------------------------------------------------------------
// Meta/ledger store behavior
// ---------------------------------------------------------------------------

test("meta lookups are case-sensitive so near-identical keys stay distinct", () => {
  const { ss, sheets } = makeFakeState();
  bumpSyncMetaMany_(ss, [{
    recordKey: "segment:TBM1:P41:Permanent", entityType: "segment", machine: "TBM1",
    recordId: "s1", version: 1, updatedAt: "2026-07-29T00:00:00.000Z", updatedByDevice: "x", deleted: false,
  }]);
  assert.equal(getSyncMetaRow_(sheets.SyncMeta, "segment:TBM1:p41:Permanent"), null);
  bumpSyncMetaMany_(ss, [{
    recordKey: "segment:TBM1:p41:Permanent", entityType: "segment", machine: "TBM1",
    recordId: "s2", version: 1, updatedAt: "2026-07-29T00:00:00.000Z", updatedByDevice: "x", deleted: false,
  }]);
  const meta = sheetObjects(sheets.SyncMeta);
  assert.equal(meta.length, 2);
  assert.equal(meta[0].recordKey, "segment:TBM1:P41:Permanent");
});

test("getSyncMetaMap_ serializes Date cells and coerces deleted flags", () => {
  const { ss, sheets } = makeFakeState();
  sheets.SyncMeta.appendRow(["segment:TBM1:41:Permanent", "segment", "TBM1", "s1", 2, new Date(2026, 6, 29, 8, 30, 15), "dev", "TRUE"]);
  const map = getSyncMetaMap_(ss);
  const entry = map["segment:TBM1:41:Permanent"];
  assert.equal(entry.version, 2);
  assert.equal(typeof entry.updatedAt, "string");
  assert.ok(entry.updatedAt.indexOf("T") !== -1, "updatedAt must be an ISO string");
  assert.equal(entry.deleted, true);
});

test("the idempotency ledger prunes oldest rows beyond the retention window", () => {
  const { sheets } = makeFakeState();
  for (let i = 0; i < 4500; i++) {
    sheets.SyncRequests.appendRow([`req-old-${i}`, "success", "{}", "2026-07-01T00:00:00.000Z"]);
  }
  storeSyncResponse_(sheets.SyncRequests, { status: "success", requestId: "req-new", record: {}, version: 1, updatedAt: "x" });
  const rows = sheetObjects(sheets.SyncRequests);
  assert.ok(rows.length <= 3001, `ledger must stay bounded, got ${rows.length}`);
  assert.equal(rows[rows.length - 1].requestId, "req-new");
  assert.equal(rows[0].requestId, "req-old-1500", "oldest rows are removed first");
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
