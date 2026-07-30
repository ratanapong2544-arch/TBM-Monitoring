// Contract tests for the GAS sync backend (gas-live/Code.js, outside this repo).
// They pin the pure helpers shared with the client: domain keys (tools/sync-domain-vectors.json),
// optimistic version checks, response shapes accepted by src/offline/apiTransport.js
// (assertSyncResponse), field diffing, and envelope validation.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const vectors = require(path.join(__dirname, "sync-domain-vectors.json"));
const gas = require(path.join(__dirname, "..", "..", "gas-live", "Code.js"));

const {
  makeSyncRecordKey_,
  checkSyncVersion_,
  buildSyncResponse_,
  diffSyncFields_,
  validateSyncEnvelope_,
  syncTimeZoneMismatch_,
  syncDateKey_,
  syncEntityHeaders_,
  serializeSyncRowValues_,
  headerRecord_,
  canonicalConfigPayload_,
  oversizedSyncFields_,
  syncStoredCellLength_,
  syncSizeRefusal_,
  invalidSyncImage_,
  classifySyncApplyFailure_,
  syncErrorEnvelope_,
  stableSyncJson_,
  handleSyncMutation_,
  handleLegacyWrite_,
  getSyncMetaRow_,
  bumpSyncMetaMany_,
  getSyncMetaMap_,
  storeSyncResponse_,
  findStoredSyncResponse_,
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

// Real Sheets rejects any cell over 50,000 characters on EVERY write path, so the fake enforces
// the limit on appendRow and setValues alike (a business row is written through both).
const CELL_LIMIT_ERROR = "Your input contains more than the maximum of 50000 characters in a single cell.";
function assertCellSizes(row) {
  row.forEach((value) => {
    if (typeof value === "string" && value.length > 50000) throw new Error(CELL_LIMIT_ERROR);
  });
}

function withCellLimit(sheet) {
  const appendRow = sheet.appendRow.bind(sheet);
  sheet.appendRow = (row) => { assertCellSizes(row); appendRow(row); };
  const getRange = sheet.getRange.bind(sheet);
  sheet.getRange = (...args) => {
    const range = getRange(...args);
    if (range && typeof range.setValues === "function") {
      const setValues = range.setValues.bind(range);
      range.setValues = (vals) => { vals.forEach(assertCellSizes); setValues(vals); };
    }
    return range;
  };
  return sheet;
}

function withCellLimitEverywhere(sheets) {
  Object.keys(sheets).forEach((name) => withCellLimit(sheets[name]));
  return sheets;
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
const DAILY_HEADERS = ["id", "machine", "date", "json"];
const PREP_HEADERS = ["id", "machine", "json"];

function makeFakeState(seed) {
  const sheets = {
    Segments: makeFakeSheet("Segments", [SEG_HEADERS.slice()]),
    ShiftReports: makeFakeSheet("ShiftReports", [SHIFT_HEADERS.slice()]),
    Grouts: makeFakeSheet("Grouts", [GROUT_HEADERS.slice()]),
    DailyReports: makeFakeSheet("DailyReports", [DAILY_HEADERS.slice()]),
    PrepTasks: makeFakeSheet("PrepTasks", [PREP_HEADERS.slice()]),
    PlanConfig: makeFakeSheet("PlanConfig", [["Key", "Value"]]),
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

test("a device label reaches the client on both success and conflict", () => {
  const { ss, sheets } = makeFakeState();
  const created = handleSyncMutation_(ss, segmentEnvelope({ requestId: "req-dev-1" }));
  assert.equal(created.updatedByDevice, "device-A", "the writing device is echoed back");
  assert.equal(sheetObjects(sheets.SyncMeta)[0].updatedByDevice, "device-A");
  // a second device edits from a stale base — the conflict must say who holds the server version
  const conflict = handleSyncMutation_(ss, segmentEnvelope({
    requestId: "req-dev-2", operation: "update", baseVersion: 0, deviceId: "device-B",
    payload: { ringNo: "41", installType: "Permanent", length: "9.9", date: "2026-07-29" },
  }));
  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.currentUpdatedByDevice, "device-A", "design §9 needs a device label in the comparison");
  assert.equal(getSyncMetaMap_(ss, "TBM1")["segment:TBM1:41:Permanent"].updatedByDevice, "device-A");
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

// A shift report loaded from getData carries `date` as the UTC ISO string GAS produced from the
// sheet cell. Editing that loaded record must not key differently from the record itself, or the
// version check is bypassed and a stale edit overwrites a newer write with no conflict.
test("a server-round-tripped shift report date keys the same as the sheet date", () => {
  const fromSheet = { entityType: "shiftReport", machine: "TBM1", recordId: "sr1", payload: { date: new Date(2026, 6, 29), shift: "Day" } };
  const canonical = makeSyncRecordKey_(fromSheet);
  assert.equal(canonical, "shiftReport:TBM1:2026-07-29:Day");
  // what the client submits after loading that record over the wire
  const roundTripped = { ...fromSheet, payload: { date: "2026-07-28T17:00:00.000Z", shift: "Day" } };
  assert.equal(makeSyncRecordKey_(roundTripped), canonical, "UTC ISO must reduce to the Bangkok date");
  assert.equal(syncDateKey_("2026-07-28T17:00:00.000Z"), "2026-07-29");
  assert.equal(syncDateKey_("2026-07-29"), "2026-07-29", "an already-canonical date is untouched");
  assert.equal(syncDateKey_(""), "");
  assert.equal(syncDateKey_("not-a-date"), "not-a-date");
});

test("a stale edit of a round-tripped shift report conflicts instead of overwriting", () => {
  const { ss, sheets } = makeFakeState();
  // the office writes the report through the legacy path, minting version 1
  sheets.ShiftReports.appendRow(["sr1", new Date(2026, 6, 29), "Day", "TBM1", "", "", "", "office-latest", ""]);
  handleLegacyWrite_(ss, "updateShiftReport", "TBM1", { id: "sr1", result: "office-latest" });
  // a device that loaded the record over the wire edits it offline against version 0
  const stale = {
    requestId: "req-drift", entityType: "shiftReport", operation: "update", machine: "TBM1",
    recordId: "sr1", baseVersion: 0, deviceId: "device-A",
    payload: { date: "2026-07-28T17:00:00.000Z", shift: "Day", result: "stale-offline" },
  };
  stale.domainKey = makeSyncRecordKey_(stale);
  const response = handleSyncMutation_(ss, stale);
  assert.equal(response.status, "conflict", "must not silently overwrite the newer office write");
  assert.equal(sheetObjects(sheets.ShiftReports)[0].result, "office-latest");
  assert.equal(sheetObjects(sheets.SyncMeta).length, 1, "one version stream per business row");
});

test("a datetime-typed date cell still keys by its calendar date", () => {
  // syncDateString_ keeps the time of day for field diffing; a KEY must not, or a hand-typed
  // "29/07/2026 08:30" cell keys as a full ISO string no client can reproduce
  assert.equal(syncDateKey_(new Date(2026, 6, 29, 8, 30)), "2026-07-29");
  assert.equal(syncDateKey_(new Date(2026, 6, 29, 23, 30)), "2026-07-29");
  assert.equal(syncDateKey_(new Date(2026, 6, 29)), "2026-07-29");
  const fromSheet = { entityType: "shiftReport", machine: "TBM1", recordId: "sr1", payload: { date: new Date(2026, 6, 29, 8, 30), shift: "Day" } };
  assert.equal(makeSyncRecordKey_(fromSheet), "shiftReport:TBM1:2026-07-29:Day");
  // and the wire form of that same cell agrees
  const wire = { ...fromSheet, payload: { date: new Date(2026, 6, 29, 8, 30).toISOString(), shift: "Day" } };
  assert.equal(makeSyncRecordKey_(wire), "shiftReport:TBM1:2026-07-29:Day");
});

test("a datetime-typed cell cannot be overwritten without a conflict", () => {
  const { ss, sheets } = makeFakeState();
  sheets.ShiftReports.appendRow(["sr1", new Date(2026, 6, 29, 8, 30), "Day", "TBM1", "", "", "", "office-latest", ""]);
  handleLegacyWrite_(ss, "updateShiftReport", "TBM1", { id: "sr1", result: "office-latest" });
  assert.equal(sheetObjects(sheets.SyncMeta)[0].recordKey, "shiftReport:TBM1:2026-07-29:Day");
  const stale = {
    requestId: "req-dt", entityType: "shiftReport", operation: "update", machine: "TBM1",
    recordId: "sr1", baseVersion: 0, deviceId: "device-A",
    payload: { date: new Date(2026, 6, 29, 8, 30).toISOString(), shift: "Day", result: "stale" },
  };
  stale.domainKey = makeSyncRecordKey_(stale);
  assert.equal(handleSyncMutation_(ss, stale).status, "conflict");
  assert.equal(sheetObjects(sheets.ShiftReports)[0].result, "office-latest");
  assert.equal(sheetObjects(sheets.SyncMeta).length, 1, "one version stream per business row");
});

test("structured columns are serialized before they reach a cell", () => {
  const rec = { events: { "08:00": { act: "boring" } }, manpower: ["a"], result: { ok: true }, ringNo: 41, when: new Date(2026, 6, 29) };
  serializeSyncRowValues_(rec);
  assert.equal(rec.events, '{"08:00":{"act":"boring"}}');
  assert.equal(rec.manpower, '["a"]');
  assert.equal(rec.result, '{"ok":true}');
  assert.equal(rec.ringNo, 41, "scalars are untouched");
  assert.ok(rec.when instanceof Date, "Sheets stores Dates natively");
});

test("a shift report write stores strings, not raw objects, and keeps the date canonical", () => {
  const { ss, sheets } = makeFakeState();
  const envelope = {
    requestId: "req-obj", entityType: "shiftReport", operation: "create", machine: "TBM1",
    recordId: "sr9", baseVersion: 0, deviceId: "device-A",
    payload: { date: "2026-07-28T17:00:00.000Z", shift: "Day", events: { "08:00": { act: "boring" } }, manpower: { crew: 4 } },
  };
  envelope.domainKey = makeSyncRecordKey_(envelope);
  const response = handleSyncMutation_(ss, envelope);
  assert.equal(response.status, "success");
  const row = sheetObjects(sheets.ShiftReports)[0];
  assert.equal(typeof row.events, "string");
  assert.deepEqual(JSON.parse(row.events), { "08:00": { act: "boring" } });
  assert.equal(typeof row.manpower, "string");
  assert.equal(row.date, "2026-07-29", "a round-tripped ISO date is written back as a date, not ISO text");
});

test("the response record only describes what was stored", () => {
  assert.deepEqual(headerRecord_({ id: "s1", problem: "x", uiOnlyNote: "dropped" }, ["id", "problem"]), { id: "s1", problem: "x" });
  const { ss } = makeFakeState();
  const envelope = segmentEnvelope({ requestId: "req-echo", payload: { ringNo: "41", installType: "Permanent", uiOnlyNote: "dropped" } });
  const response = handleSyncMutation_(ss, envelope);
  assert.equal(response.status, "success");
  assert.equal(response.record.uiOnlyNote, undefined, "a key with no column never reached the sheet");
  assert.equal(response.record.ringNo, "41");
});

test("an unchanged round-tripped record reports no conflicting fields", () => {
  const { ss, sheets } = makeFakeState();
  sheets.ShiftReports.appendRow(["sr1", new Date(2026, 6, 29), "Day", "TBM1", "", "", "", "same", ""]);
  handleLegacyWrite_(ss, "updateShiftReport", "TBM1", { id: "sr1", result: "same" });
  const stale = {
    requestId: "req-nodiff", entityType: "shiftReport", operation: "update", machine: "TBM1",
    recordId: "sr1", baseVersion: 0, deviceId: "device-A",
    payload: { date: "2026-07-28T17:00:00.000Z", shift: "Day", result: "same" },
  };
  stale.domainKey = makeSyncRecordKey_(stale);
  const conflict = handleSyncMutation_(ss, stale);
  assert.equal(conflict.status, "conflict");
  assert.deepEqual(conflict.conflictingFields, [], "an ISO date equal to the sheet date is not a difference");
  // two datetimes on one day are still a real difference
  assert.deepEqual(diffSyncFields_({ measuredAt: "2026-07-29T01:00:00.000Z" }, { measuredAt: "2026-07-29T09:00:00.000Z" }), ["measuredAt"]);
});

test("a create successor keeps the columns it never carried", () => {
  const { ss, sheets } = makeFakeState();
  const create = {
    requestId: "req-issue-full", entityType: "issue", operation: "create",
    recordId: "i1", baseVersion: 0, deviceId: "device-A",
    payload: { machine: "TBM1", title: "Leak", severity: "high", detail: "at ring 41", status: "open" },
  };
  create.domainKey = makeSyncRecordKey_(create);
  handleSyncMutation_(ss, create);
  // a post-conflict successor replays the ORIGINAL create against the existing row
  const successor = Object.assign({}, create, { requestId: "req-issue-succ", baseVersion: 1, payload: { status: "closed" } });
  assert.equal(handleSyncMutation_(ss, successor).status, "success");
  const row = sheetObjects(ss.getSheetByName("Issues"))[0];
  assert.equal(row.status, "closed");
  assert.equal(row.title, "Leak", "a create successor must not blank stored columns");
  assert.equal(row.severity, "high");
});

test("only machine-scoped entities carry a machine in their key", () => {
  // a caller passing machine for a GLOBAL entity must not fork a second version stream, because
  // legacy writes always bump the GLOBAL key for these
  assert.equal(makeSyncRecordKey_({ entityType: "issue", machine: "TBM1", recordId: "i1", payload: {} }), "issue:GLOBAL:i1");
  assert.equal(makeSyncRecordKey_({ entityType: "instReading", machine: "TBM2", recordId: "r1", payload: {} }), "instReading:GLOBAL:r1");
  assert.equal(makeSyncRecordKey_({ entityType: "dailyReport", machine: "TBM2", recordId: "d1", payload: {} }), "dailyReport:TBM2:d1");
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
  assert.equal(entry.updatedByDevice, "dev", "design §6.1 requires the writing device on a synchronized record");
});

test("an oversized response degrades to a marker row instead of throwing", () => {
  const { sheets } = makeFakeState();
  withCellLimit(sheets.SyncRequests);
  const huge = { status: "success", requestId: "req-huge", record: { note: "B".repeat(60000) }, version: 1, updatedAt: "x" };
  storeSyncResponse_(sheets.SyncRequests, huge);
  const rows = sheetObjects(sheets.SyncRequests);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].requestId, "req-huge");
  assert.equal(rows[0].responseJson, "");
  assert.equal(findStoredSyncResponse_(sheets.SyncRequests, "req-huge"), null, "a degraded row must not replay as a response");
});

// Every individual field here stays under the cell limit (so the row itself is writable) while
// the serialized response exceeds it — the only way a real response can be too large to store.
const NEAR_LIMIT = "C".repeat(24000);

test("a lost oversized success replays without double-applying the write", () => {
  const { ss, sheets } = makeFakeState();
  withCellLimitEverywhere(sheets);
  const envelope = segmentEnvelope({
    requestId: "req-huge-seg",
    payload: { ringNo: "41", installType: "Permanent", date: "2026-07-29", problem: NEAR_LIMIT, keyPos: NEAR_LIMIT, typeRing: NEAR_LIMIT },
  });
  const first = handleSyncMutation_(ss, envelope);
  assert.equal(first.status, "success", "each field fits a cell, so the write itself succeeds");
  assert.equal(sheetObjects(sheets.Segments).length, 1);
  assert.equal(sheetObjects(sheets.SyncRequests)[0].responseJson, "", "response too large to store");
  const retry = handleSyncMutation_(ss, envelope);
  assert.equal(sheetObjects(sheets.Segments).length, 1, "retry must not append a second row");
  assert.equal(sheetObjects(sheets.SyncMeta)[0].version, 1, "retry must not bump the version again");
  assert.equal(retry.status, "conflict", "the applied write is now the server truth");
  assert.deepEqual(retry.conflictingFields, [], "server already holds exactly what was submitted");
});

test("a lost oversized conflict replays as the identical conflict", () => {
  const { ss, sheets } = makeFakeState();
  withCellLimitEverywhere(sheets);
  sheets.Segments.appendRow(["seg-legacy", "2026-07-29", "Day", 41, "", NEAR_LIMIT, "", "", 1.4, "", "", NEAR_LIMIT, "", "", "Permanent"]);
  const envelope = segmentEnvelope({ requestId: "req-huge-conflict", payload: { ringNo: "41", installType: "Permanent", problem: NEAR_LIMIT } });
  const first = handleSyncMutation_(ss, envelope);
  assert.equal(first.status, "conflict");
  assert.equal(sheetObjects(sheets.SyncRequests)[0].responseJson, "");
  const retry = handleSyncMutation_(ss, envelope);
  assert.equal(retry.status, "conflict");
  assert.deepEqual(retry.conflictingFields, first.conflictingFields);
  assert.equal(retry.currentVersion, first.currentVersion);
  assert.equal(sheetObjects(sheets.Segments).length, 1);
});

test("an oversized field is refused before any write, upload, or ledger row", () => {
  const { ss, sheets } = makeFakeState();
  withCellLimitEverywhere(sheets);
  const envelope = segmentEnvelope({
    requestId: "req-too-big",
    payload: { ringNo: "41", installType: "Permanent", problem: "C".repeat(60001) },
  });
  const response = handleSyncMutation_(ss, envelope);
  assert.equal(response.status, "validation_error");
  assert.equal(response.code, "SYNC_FIELD_TOO_LARGE");
  assert.deepEqual(response.fields, ["problem"]);
  assert.equal(sheetObjects(sheets.Segments).length, 0, "no partial business write");
  assert.equal(sheetObjects(sheets.SyncMeta).length, 0, "no version bump");
  assert.equal(sheetObjects(sheets.SyncRequests).length, 0);
});

test("an oversized structured field is measured as its serialized form", () => {
  const seg = { entityType: "segment", machine: "TBM1", recordId: "s1" };
  // positions is a Grouts column, not a Segments one
  assert.deepEqual(
    oversizedSyncFields_({ entityType: "grout", machine: "TBM1", recordId: "g1", payload: { positions: { log: "x".repeat(60000) } } }),
    ["positions"]
  );
  assert.deepEqual(oversizedSyncFields_({ ...seg, payload: { problem: "x".repeat(50000) } }), []);
  assert.deepEqual(
    oversizedSyncFields_({ ...seg, payload: { imageBase64: "data:image/png;base64," + "A".repeat(90000), imageName: "a.png" } }),
    [],
    "a row entity uploads imageBase64 and strips it before any cell is written"
  );
});

test("JSON-blob entities are measured as the whole serialized record", () => {
  const daily = { entityType: "dailyReport", machine: "TBM1", recordId: "d1" };
  // each field fits a cell, but dailyReport stores the whole record in one json cell
  const split = syncSizeRefusal_({ ...daily, payload: { activities: "a".repeat(40000), remarks: "b".repeat(40000) } });
  assert.equal(split.code, "SYNC_RECORD_TOO_LARGE");
  assert.deepEqual(split.fields, ["activities", "remarks"], "real payload keys, largest first");
  assert.match(split.message, /one cell/);
  assert.equal(syncSizeRefusal_({ ...daily, payload: { activities: "a".repeat(1000) } }), null);
  const withImage = syncSizeRefusal_({ ...daily, payload: { imageBase64: "data:image/png;base64," + "A".repeat(120000), imageName: "a.png" } });
  assert.equal(withImage.code, "SYNC_FIELD_TOO_LARGE", "a JSON-blob entity never uploads images");
  assert.deepEqual(withImage.fields, ["imageBase64"]);
  const prep = { entityType: "prepTask", machine: "TBM2", recordId: "p1" };
  const single = syncSizeRefusal_({ ...prep, payload: { notes: "n".repeat(60000) } });
  assert.equal(single.code, "SYNC_FIELD_TOO_LARGE");
  assert.deepEqual(single.fields, ["notes"], "one culprit field is named on its own");
  assert.ok(syncStoredCellLength_({ ...prep, payload: { notes: "n" } }) > 0);
  assert.equal(syncStoredCellLength_({ entityType: "segment", payload: { problem: "x" } }), 0, "row entities write one cell per key");
});

test("only keys that reach a cell can be refused as oversized", () => {
  // a non-header key is dropped by the write, so it must not produce a terminal refusal
  assert.deepEqual(
    oversizedSyncFields_({ entityType: "segment", machine: "TBM1", recordId: "s1", payload: { excavImageBase64: "x".repeat(60000), problem: "ok" } }),
    []
  );
  assert.deepEqual(
    oversizedSyncFields_({ entityType: "segment", machine: "TBM1", recordId: "s1", payload: { problem: "x".repeat(60000) } }),
    ["problem"]
  );
  assert.deepEqual(
    oversizedSyncFields_({ entityType: "issue", recordId: "i1", payload: { uiOnlyNote: "x".repeat(60000) } }),
    []
  );
  assert.ok(syncEntityHeaders_("segment").indexOf("problem") !== -1);
  assert.equal(syncEntityHeaders_("dailyReport"), null, "JSON-blob entities have no column list");
});

test("an issue update merges instead of blanking the columns it omits", () => {
  // let ensureSheet_ create Issues with the real ISSUE_HEADERS, so column mapping is faithful
  const { ss, sheets } = makeFakeState();
  const create = {
    requestId: "req-issue-0", entityType: "issue", operation: "create",
    recordId: "i1", baseVersion: 0, deviceId: "device-A",
    payload: { machine: "TBM1", title: "Leak", severity: "high", detail: "at ring 41", status: "open" },
  };
  create.domainKey = makeSyncRecordKey_(create);
  assert.equal(handleSyncMutation_(ss, create).status, "success");

  const update = Object.assign({}, create, { requestId: "req-issue-1", operation: "update", baseVersion: 1, payload: { status: "closed" } });
  const response = handleSyncMutation_(ss, update);
  assert.equal(response.status, "success");
  const row = sheetObjects(ss.getSheetByName("Issues"))[0];
  assert.equal(row.status, "closed");
  assert.equal(row.title, "Leak", "an omitted column must survive the update");
  assert.equal(row.severity, "high");
  assert.equal(row.machine, "TBM1");
  assert.equal(row.detail, "at ring 41");
});

test("a raw route config keeps the project total out of the stored config body", () => {
  assert.deepEqual(
    canonicalConfigPayload_("routeConfig", { legs: [1, 2], routeProjectTotal: 6193 }),
    { routeConfig: { legs: [1, 2] }, routeProjectTotal: 6193 }
  );
  assert.deepEqual(
    canonicalConfigPayload_("routeConfig", { routeConfig: { legs: [1, 2] }, routeProjectTotal: 6193 }),
    { routeConfig: { legs: [1, 2] }, routeProjectTotal: 6193 },
    "wrapped and raw submissions store the same config body"
  );
});

test("a config mutation writes the PlanConfig rows it owns", () => {
  const { ss, sheets } = makeFakeState();
  const envelope = {
    requestId: "req-route-1", entityType: "routeConfig", operation: "create", machine: "TBM1",
    recordId: "routeConfig", baseVersion: 0, deviceId: "device-A",
    payload: { legs: [1, 2], routeProjectTotal: 6193 },
  };
  envelope.domainKey = makeSyncRecordKey_(envelope);
  const response = handleSyncMutation_(ss, envelope);
  assert.equal(response.status, "success");
  const rows = sheetObjects(sheets.PlanConfig);
  const byKey = {};
  rows.forEach((r) => { byKey[r.Key] = r.Value; });
  assert.deepEqual(JSON.parse(byKey["routeConfig_TBM1"]), { legs: [1, 2] });
  assert.equal(byKey["routeProjectTotal"], "6193");
  assert.equal(sheetObjects(sheets.SyncMeta)[0].recordKey, "routeConfig:TBM1");
});

test("a raw config payload is measured as the single stored config cell", () => {
  const cfg = { entityType: "planConfig", machine: "TBM1", recordId: "planConfig" };
  const refusal = syncSizeRefusal_({ ...cfg, payload: { notesA: "a".repeat(30000), notesB: "b".repeat(30000) } });
  assert.equal(refusal.code, "SYNC_RECORD_TOO_LARGE");
  assert.deepEqual(refusal.fields, ["notesA", "notesB"]);
  assert.equal(syncSizeRefusal_({ ...cfg, payload: { target: 4 } }), null);
});

test("an oversized JSON-blob record is refused before the json cell is written", () => {
  const { ss, sheets } = makeFakeState();
  withCellLimitEverywhere(sheets);
  const envelope = {
    requestId: "req-daily-big", entityType: "dailyReport", operation: "create", machine: "TBM1",
    recordId: "d1", baseVersion: 0, deviceId: "device-A",
    payload: { activities: "a".repeat(40000), remarks: "b".repeat(40000) },
  };
  envelope.domainKey = makeSyncRecordKey_(envelope);
  const response = handleSyncMutation_(ss, envelope);
  assert.equal(response.status, "validation_error");
  assert.equal(response.code, "SYNC_RECORD_TOO_LARGE");
  assert.deepEqual(response.fields, ["activities", "remarks"]);
  assert.equal(sheetObjects(sheets.DailyReports).length, 0);
  assert.equal(sheetObjects(sheets.SyncMeta).length, 0);
});

test("dailyReport and prepTask round-trip through the sync endpoint", () => {
  const { ss, sheets } = makeFakeState();
  withCellLimitEverywhere(sheets);
  const daily = {
    requestId: "req-daily-1", entityType: "dailyReport", operation: "create", machine: "TBM1",
    recordId: "d1", baseVersion: 0, deviceId: "device-A", payload: { date: "2026-07-29", area: "Shaft" },
  };
  daily.domainKey = makeSyncRecordKey_(daily);
  const created = handleSyncMutation_(ss, daily);
  assert.equal(created.status, "success");
  assert.equal(created.version, 1);
  const rows = sheetObjects(sheets.DailyReports);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "d1");
  assert.equal(rows[0].machine, "TBM1");
  assert.deepEqual(JSON.parse(rows[0].json), { date: "2026-07-29", area: "Shaft", id: "d1", machine: "TBM1" });
  assert.equal(sheetObjects(sheets.SyncMeta)[0].recordKey, "dailyReport:TBM1:d1");

  // a stale update on the same domain conflicts against the stored JSON record
  const stale = Object.assign({}, daily, { requestId: "req-daily-2", operation: "update", baseVersion: 0, payload: { date: "2026-07-29", area: "Portal" } });
  const conflict = handleSyncMutation_(ss, stale);
  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.currentVersion, 1);
  assert.deepEqual(conflict.conflictingFields, ["area"]);

  const prep = {
    requestId: "req-prep-1", entityType: "prepTask", operation: "create", machine: "TBM2",
    recordId: "p1", baseVersion: 0, deviceId: "device-A", payload: { title: "Prep", percent: 10 },
  };
  prep.domainKey = makeSyncRecordKey_(prep);
  assert.equal(handleSyncMutation_(ss, prep).status, "success");
  assert.equal(sheetObjects(sheets.PrepTasks)[0].machine, "TBM2");
});

test("a JSON-blob update keeps the fields it omits", () => {
  const { ss, sheets } = makeFakeState();
  const create = {
    requestId: "req-daily-full", entityType: "dailyReport", operation: "create", machine: "TBM1",
    recordId: "dr1", baseVersion: 0, deviceId: "device-A",
    payload: { date: "2026-07-29", area: "IS1", weather: { am: "clear" }, workLog: [{ id: "w1" }], remark: "keep me" },
  };
  create.domainKey = makeSyncRecordKey_(create);
  assert.equal(handleSyncMutation_(ss, create).status, "success");

  const partial = Object.assign({}, create, { requestId: "req-daily-partial", operation: "update", baseVersion: 1, payload: { area: "IS2" } });
  const response = handleSyncMutation_(ss, partial);
  assert.equal(response.status, "success");
  const stored = JSON.parse(sheetObjects(sheets.DailyReports)[0].json);
  assert.equal(stored.area, "IS2");
  assert.equal(stored.date, "2026-07-29", "an omitted field must not be deleted");
  assert.deepEqual(stored.weather, { am: "clear" });
  assert.deepEqual(stored.workLog, [{ id: "w1" }]);
  assert.equal(stored.remark, "keep me");
  assert.equal(response.record.remark, "keep me", "the echoed record describes the merged result");
});

test("a JSON-blob create successor keeps the fields it never carried", () => {
  const { ss, sheets } = makeFakeState();
  const create = {
    requestId: "req-prep-full", entityType: "prepTask", operation: "create", machine: "TBM2",
    recordId: "p1", baseVersion: 0, deviceId: "device-A",
    payload: { title: "Prep", percent: 10, owner: "team-a" },
  };
  create.domainKey = makeSyncRecordKey_(create);
  handleSyncMutation_(ss, create);
  const successor = Object.assign({}, create, { requestId: "req-prep-succ", baseVersion: 1, payload: { percent: 55 } });
  assert.equal(handleSyncMutation_(ss, successor).status, "success");
  const stored = JSON.parse(sheetObjects(sheets.PrepTasks)[0].json);
  assert.equal(stored.percent, 55);
  assert.equal(stored.title, "Prep");
  assert.equal(stored.owner, "team-a");
});

test("a datetime cell still reports a same-day time change as a difference", () => {
  // reducing a datetime-typed cell to its calendar date would hide a real time-of-day change
  assert.deepEqual(
    diffSyncFields_({ measuredAt: "2026-07-29T01:00:00.000Z" }, { measuredAt: new Date(2026, 6, 29, 15, 0) }),
    ["measuredAt"]
  );
  // a date-only cell versus its wire form is still not a difference
  assert.deepEqual(diffSyncFields_({ date: "2026-07-28T17:00:00.000Z" }, { date: new Date(2026, 6, 29) }), []);
});

test("the echoed record carries no sheet Date objects", () => {
  const stamped = headerRecord_({ id: "r1", date: new Date(2026, 6, 29), note: "x" }, ["id", "date", "note"]);
  assert.equal(stamped.date, "2026-07-29");
  assert.equal(typeof stamped.date, "string");
});

test("getData reads version metadata before the business rows", () => {
  // doGet is not exported, so pin the ordering by source position: reading metadata last would
  // return stale rows labelled with a fresh version and let the next write overwrite silently
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "gas-live", "Code.js"), "utf8");
  const doGetBody = source.slice(source.indexOf("function doGet("), source.indexOf("function segProgress_"));
  const metaAt = doGetBody.indexOf("getSyncMetaMap_(ss, machine)");
  const firstRowRead = doGetBody.indexOf("getSheetDataAsJson(");
  assert.ok(metaAt > -1 && firstRowRead > -1);
  assert.ok(metaAt < firstRowRead, "syncMeta must be read before any business sheet");
});

test("an unparseable stored record is refused, not replaced", () => {
  const { ss, sheets } = makeFakeState();
  sheets.DailyReports.appendRow(["d1", "TBM1", "2026-07-29", '{"date":"2026-07-29","area":"IS1",']);
  bumpSyncMetaMany_(ss, [{
    recordKey: "dailyReport:TBM1:d1", entityType: "dailyReport", machine: "TBM1",
    recordId: "d1", version: 1, updatedAt: "2026-07-29T00:00:00.000Z", updatedByDevice: "x", deleted: false,
  }]);
  const envelope = {
    requestId: "req-corrupt", entityType: "dailyReport", operation: "update", machine: "TBM1",
    recordId: "d1", baseVersion: 1, deviceId: "device-A", payload: { area: "IS2" },
  };
  envelope.domainKey = makeSyncRecordKey_(envelope);
  const response = handleSyncMutation_(ss, envelope);
  assert.equal(response.status, "validation_error");
  assert.equal(response.code, "SYNC_RECORD_UNPARSEABLE");
  assert.match(String(sheetObjects(sheets.DailyReports)[0].json), /IS1/, "the repairable cell is untouched");
});

test("a small update onto a large record is refused by measuring the merged result", () => {
  const { ss, sheets } = makeFakeState();
  const big = JSON.stringify({ id: "d1", machine: "TBM1", notes: "n".repeat(49000) });
  sheets.DailyReports.appendRow(["d1", "TBM1", "2026-07-29", big]);
  bumpSyncMetaMany_(ss, [{
    recordKey: "dailyReport:TBM1:d1", entityType: "dailyReport", machine: "TBM1",
    recordId: "d1", version: 1, updatedAt: "2026-07-29T00:00:00.000Z", updatedByDevice: "x", deleted: false,
  }]);
  const envelope = {
    requestId: "req-merge-big", entityType: "dailyReport", operation: "update", machine: "TBM1",
    recordId: "d1", baseVersion: 1, deviceId: "device-A", payload: { extra: "e".repeat(2000) },
  };
  envelope.domainKey = makeSyncRecordKey_(envelope);
  const response = handleSyncMutation_(ss, envelope);
  assert.equal(response.status, "validation_error");
  assert.equal(response.code, "SYNC_RECORD_TOO_LARGE", "the payload alone fits; the merged record does not");
  assert.equal(JSON.parse(sheetObjects(sheets.DailyReports)[0].json).extra, undefined);
});

test("a partial row update echoes the whole stored row", () => {
  const { ss, sheets } = makeFakeState();
  sheets.Segments.appendRow(["s1", "2026-07-29", "Day", 41, "", "", "", "", 1.4, "8000", "8001", "", "", "", "Permanent"]);
  bumpSyncMetaMany_(ss, [{
    recordKey: "segment:TBM1:41:Permanent", entityType: "segment", machine: "TBM1",
    recordId: "s1", version: 1, updatedAt: "2026-07-29T00:00:00.000Z", updatedByDevice: "x", deleted: false,
  }]);
  const envelope = segmentEnvelope({
    requestId: "req-partial", operation: "update", recordId: "s1", baseVersion: 1,
    payload: { ringNo: "41", installType: "Permanent", problem: "leak" },
  });
  const response = handleSyncMutation_(ss, envelope);
  assert.equal(response.status, "success");
  assert.equal(response.record.problem, "leak");
  assert.equal(response.record.startCH, "8000", "an untouched column is still described");
  assert.equal(response.record.shift, "Day");
  assert.equal(response.record.date, "2026-07-29");
});

test("a structured column echoes as an object while the sheet stores a string", () => {
  const { ss, sheets } = makeFakeState();
  const envelope = {
    requestId: "req-echo-obj", entityType: "shiftReport", operation: "create", machine: "TBM1",
    recordId: "sr5", baseVersion: 0, deviceId: "device-A",
    payload: { date: "2026-07-29", shift: "Day", events: { "08:00": { act: "boring" } } },
  };
  envelope.domainKey = makeSyncRecordKey_(envelope);
  const response = handleSyncMutation_(ss, envelope);
  assert.deepEqual(response.record.events, { "08:00": { act: "boring" } }, "the client gets back what it submitted");
  assert.equal(typeof sheetObjects(sheets.ShiftReports)[0].events, "string");
});

test("the metadata sheet grows its grid rather than failing a bulk write", () => {
  const { ss, sheets } = makeFakeState();
  let maxRows = 3;
  const inserted = [];
  sheets.SyncMeta.getMaxRows = () => maxRows;
  sheets.SyncMeta.insertRowsAfter = (after, count) => { inserted.push([after, count]); maxRows += count; };
  const entries = [];
  for (let index = 0; index < 8; index += 1) {
    entries.push({
      recordKey: `instReading:GLOBAL:r${index}`, entityType: "instReading", machine: "GLOBAL",
      recordId: `r${index}`, version: 1, updatedAt: "2026-07-29T00:00:00.000Z", updatedByDevice: "legacy-client", deleted: false,
    });
  }
  bumpSyncMetaMany_(ss, entries);
  assert.deepEqual(inserted, [[3, 6]], "the grid is extended to fit header plus entries");
  assert.equal(sheetObjects(sheets.SyncMeta).length, 8);
});

test("a JSON-blob delete tombstones the domain", () => {
  const { ss, sheets } = makeFakeState();
  const daily = {
    requestId: "req-daily-c", entityType: "dailyReport", operation: "create", machine: "TBM1",
    recordId: "d1", baseVersion: 0, deviceId: "device-A", payload: { date: "2026-07-29" },
  };
  daily.domainKey = makeSyncRecordKey_(daily);
  handleSyncMutation_(ss, daily);
  const del = handleSyncMutation_(ss, Object.assign({}, daily, { requestId: "req-daily-d", operation: "delete", baseVersion: 1 }));
  assert.equal(del.status, "success");
  assert.equal(sheetObjects(sheets.DailyReports).length, 0);
  const meta = sheetObjects(sheets.SyncMeta)[0];
  assert.equal(meta.version, 2);
  assert.equal(meta.deleted, true);
});

test("a malformed image data URI is a terminal validation error, not a retry", () => {
  const { ss, sheets } = makeFakeState();
  const envelope = segmentEnvelope({
    requestId: "req-bad-image",
    payload: { ringNo: "41", installType: "Permanent", imageBase64: "not-a-data-uri", imageName: "a.png" },
  });
  const response = handleSyncMutation_(ss, envelope);
  assert.equal(response.status, "validation_error");
  assert.equal(response.code, "SYNC_IMAGE_INVALID");
  assert.deepEqual(response.fields, ["imageBase64"]);
  assert.equal(sheetObjects(sheets.Segments).length, 0);
  assert.equal(invalidSyncImage_({ imageBase64: "data:image/png;base64,QUJD", imageName: "a.png" }), false);
  assert.equal(invalidSyncImage_({ imageBase64: "data:image/jpeg;base64,QQ==", imageName: "a.jpg" }), false);
  assert.equal(invalidSyncImage_({}), false);
  // shapes that pass a loose data-URI check but still throw inside Utilities.base64Decode
  assert.equal(invalidSyncImage_({ imageBase64: "data:image/png;name=a,b;base64,QUJD", imageName: "a.png" }), true);
  assert.equal(invalidSyncImage_({ imageBase64: "data:image/png;base64,%%%not-base64%%%", imageName: "a.png" }), true);
  assert.equal(invalidSyncImage_({ imageBase64: "data:image/png;base64,", imageName: "a.png" }), true);
  // FileReader on a blob with no type still yields an empty mime; that is a real browser shape
  assert.equal(invalidSyncImage_({ imageBase64: "data:;base64,QUJD", imageName: "a.png" }), false);
});

test("a deterministic apply failure is classified terminal, transient ones retryable", () => {
  assert.equal(classifySyncApplyFailure_(CELL_LIMIT_ERROR), "validation");
  assert.equal(classifySyncApplyFailure_("Service Spreadsheets timed out"), "retryable");
  assert.equal(classifySyncApplyFailure_(undefined), "retryable");
});

test("localized and grouped cell-limit errors are still classified terminal", () => {
  // Apps Script localizes exception text, and locales group digits differently
  assert.equal(
    classifySyncApplyFailure_("ข้อมูลที่คุณป้อนมีอักขระมากกว่าจำนวนสูงสุด 50000 อักขระในเซลล์เดียว"),
    "validation"
  );
  assert.equal(
    classifySyncApplyFailure_("ข้อมูลที่คุณป้อนมีอักขระมากกว่าจำนวนสูงสุด 50,000 อักขระในเซลล์เดียว"),
    "validation"
  );
  assert.equal(
    classifySyncApplyFailure_("ข้อมูลมีอักขระมากกว่า ๕๐,๐๐๐ อักขระในเซลล์เดียว"),
    "validation",
    "Thai numerals"
  );
  assert.equal(classifySyncApplyFailure_("Your input contains more than the maximum of 50,000 characters in a single cell."), "validation");
  assert.equal(classifySyncApplyFailure_("Could not decode string."), "validation");
  assert.equal(classifySyncApplyFailure_("Exception: Invalid argument: data"), "validation");
});

test("a transient error that merely contains the limit digits stays retryable", () => {
  assert.equal(classifySyncApplyFailure_("Service Spreadsheets timed out while accessing document 50000abc"), "retryable");
  assert.equal(classifySyncApplyFailure_("Timeout: Row 50000 could not be read"), "retryable");
  assert.equal(classifySyncApplyFailure_("Timeout reading cell A50000"), "retryable", "a cell reference is not the limit");
  assert.equal(classifySyncApplyFailure_("more than the maximum of 50'000 characters in a single cell"), "validation", "apostrophe grouping");
});

test("the doPost error envelope carries the terminal or retryable code", () => {
  assert.deepEqual(syncErrorEnvelope_(new Error(CELL_LIMIT_ERROR)), {
    status: "error", code: "SYNC_APPLY_INVALID", message: "Error: " + CELL_LIMIT_ERROR,
  });
  const transient = syncErrorEnvelope_(new Error("Service Spreadsheets timed out"));
  assert.equal(transient.code, "SYNC_RETRYABLE");
  assert.match(transient.message, /timed out/);
});

test("stable serialization makes key order irrelevant", () => {
  assert.equal(stableSyncJson_({ b: 1, a: [2, { d: 4, c: 3 }] }), stableSyncJson_({ a: [2, { c: 3, d: 4 }], b: 1 }));
  assert.deepEqual(diffSyncFields_({ positions: { b: 1, a: 2 } }, { positions: '{"a":2,"b":1}' }), []);
});

test("a config conflict reports only the fields that actually differ", () => {
  const { ss, sheets } = makeFakeState({
    PlanConfig: makeFakeSheet("PlanConfig", [
      ["Key", "Value"],
      ["planConfig_TBM1", JSON.stringify({ target: 4, crew: "A" })],
    ]),
  });
  bumpSyncMetaMany_(ss, [{
    recordKey: "planConfig:TBM1", entityType: "planConfig", machine: "TBM1",
    recordId: "", version: 2, updatedAt: "2026-07-29T00:00:00.000Z", updatedByDevice: "x", deleted: false,
  }]);
  // raw (unwrapped) payload, identical to the stored config
  const identical = {
    requestId: "req-cfg-1", entityType: "planConfig", operation: "update", machine: "TBM1",
    recordId: "planConfig", baseVersion: 1, deviceId: "device-A",
    payload: { target: 4, crew: "A" },
  };
  identical.domainKey = makeSyncRecordKey_(identical);
  const same = handleSyncMutation_(ss, identical);
  assert.equal(same.status, "conflict");
  assert.deepEqual(same.conflictingFields, [], "an identical config must not report every field");
  assert.deepEqual(same.localRecord, { planConfig: { target: 4, crew: "A" } }, "localRecord is canonicalized");
  // same config, different key insertion order — still not a difference
  const reordered = Object.assign({}, identical, { requestId: "req-cfg-order", payload: { crew: "A", target: 4 } });
  assert.deepEqual(handleSyncMutation_(ss, reordered).conflictingFields, []);
  const changed = Object.assign({}, identical, { requestId: "req-cfg-2", payload: { target: 5, crew: "A" } });
  const diff = handleSyncMutation_(ss, changed);
  assert.deepEqual(diff.conflictingFields, ["planConfig"]);
});

test("getData sync metadata drops the inactive machine's ring rows only", () => {
  const { ss, sheets } = makeFakeState();
  const rows = [
    ["segment:TBM1:41:Permanent", "segment", "TBM1", "s1", 1],
    ["segment:TBM2:12:Permanent", "segment", "TBM2", "s2", 1],
    ["shiftReport:TBM2:2026-07-29:Day", "shiftReport", "TBM2", "sr2", 1],
    ["routeConfig:TBM2", "routeConfig", "TBM2", "", 1],
    ["dailyReport:TBM2:d9", "dailyReport", "TBM2", "d9", 1],
    ["issue:GLOBAL:i1", "issue", "GLOBAL", "i1", 1],
  ];
  rows.forEach((r) => sheets.SyncMeta.appendRow(r.concat(["2026-07-29T00:00:00.000Z", "dev", false])));
  const scoped = getSyncMetaMap_(ss, "TBM1");
  assert.ok(scoped["segment:TBM1:41:Permanent"]);
  assert.equal(scoped["segment:TBM2:12:Permanent"], undefined);
  assert.equal(scoped["shiftReport:TBM2:2026-07-29:Day"], undefined);
  assert.ok(scoped["routeConfig:TBM2"], "project-wide configs stay for every machine");
  assert.ok(scoped["dailyReport:TBM2:d9"]);
  assert.ok(scoped["issue:GLOBAL:i1"]);
  assert.equal(Object.keys(getSyncMetaMap_(ss)).length, rows.length, "no machine argument keeps every row");
});

test("a time-zone mismatch refuses only the mutations whose keys use sheet dates", () => {
  const { ss, sheets } = makeFakeState();
  ss.getSpreadsheetTimeZone = () => "America/New_York";
  global.Session = { getScriptTimeZone: () => "Asia/Bangkok" };
  try {
    const shift = {
      requestId: "req-tz-shift", entityType: "shiftReport", operation: "create", machine: "TBM1",
      recordId: "sr1", baseVersion: 0, deviceId: "device-A", payload: { date: "2026-07-29", shift: "Day" },
    };
    shift.domainKey = makeSyncRecordKey_(shift);
    // thrown, not returned: doPost maps it to a retryable code so the queue drains once an admin
    // realigns the time zones, instead of terminally blocking the domain key
    assert.throws(() => handleSyncMutation_(ss, shift), /SYNC_TIMEZONE_MISMATCH/);
    assert.equal(syncErrorEnvelope_(new Error("SYNC_TIMEZONE_MISMATCH: script ...")).code, "SYNC_RETRYABLE");
    assert.equal(sheetObjects(sheets.ShiftReports).length, 0);
    assert.equal(sheetObjects(sheets.SyncMeta).length, 0);
    // a segment key is ringNo-based, so a mismatch must not block it
    assert.equal(handleSyncMutation_(ss, segmentEnvelope({ requestId: "req-tz-seg" })).status, "success");
  } finally {
    delete global.Session;
  }
});

test("equivalent time zones named differently are not a mismatch", () => {
  const { ss } = makeFakeState();
  ss.getSpreadsheetTimeZone = () => "Etc/GMT-7";
  global.Session = { getScriptTimeZone: () => "Asia/Bangkok" };
  global.Utilities = { formatDate: () => "+0700" };
  try {
    const shift = {
      requestId: "req-tz-equiv", entityType: "shiftReport", operation: "create", machine: "TBM1",
      recordId: "sr1", baseVersion: 0, deviceId: "device-A", payload: { date: "2026-07-29", shift: "Day" },
    };
    shift.domainKey = makeSyncRecordKey_(shift);
    assert.equal(handleSyncMutation_(ss, shift).status, "success", "equal offsets must not refuse the write");
  } finally {
    delete global.Session;
    delete global.Utilities;
  }
});

test("a late time-zone change cannot shadow an already stored response", () => {
  const { ss, sheets } = makeFakeState();
  // must be a shiftReport: it is the only entity the guard refuses, so any other envelope would
  // pass this test with the guard on either side of the ledger lookup
  const envelope = {
    requestId: "req-tz-replay", entityType: "shiftReport", operation: "create", machine: "TBM1",
    recordId: "sr1", baseVersion: 0, deviceId: "device-A", payload: { date: "2026-07-29", shift: "Day" },
  };
  envelope.domainKey = makeSyncRecordKey_(envelope);
  const first = handleSyncMutation_(ss, envelope);
  assert.equal(first.status, "success");
  ss.getSpreadsheetTimeZone = () => "America/New_York";
  global.Session = { getScriptTimeZone: () => "Asia/Bangkok" };
  try {
    const replay = handleSyncMutation_(ss, envelope);
    assert.deepEqual(replay, first, "a duplicate must replay its stored response");
    assert.equal(sheetObjects(sheets.ShiftReports).length, 1);
  } finally {
    delete global.Session;
  }
});

test("the script and spreadsheet time zones must agree for sheet-date keys", () => {
  assert.equal(syncTimeZoneMismatch_("Asia/Bangkok", "Asia/Bangkok"), null);
  assert.equal(syncTimeZoneMismatch_("Asia/Bangkok", ""), null);
  const warning = syncTimeZoneMismatch_("Asia/Bangkok", "America/New_York");
  assert.match(warning, /^SYNC_TIMEZONE_MISMATCH/);
  assert.match(warning, /Asia\/Bangkok/);
  assert.match(warning, /America\/New_York/);
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
