import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));
import { deleteOfflineDbForTests, openOfflineDb } from "./db";
import { buildMutationEnvelope } from "./mutationEnvelope";
import { createRepository } from "./repository";
import { downloadExportBundle, exportFileName, exportPendingBundle } from "./exportPending";

beforeEach(async () => { await deleteOfflineDbForTests(); });
afterEach(async () => { await deleteOfflineDbForTests(); });

let nextId = 0;
const makeRepository = (overrides = {}) => createRepository({
  openDb: openOfflineDb, now: () => "2026-08-03T04:00:00.000Z", getDeviceId: async () => "device-1",
  createRequestId: () => `request-${++nextId}`, ...overrides,
});

const segment = (ringNo, extra = {}) => buildMutationEnvelope({
  entityType: "segment", operation: "update", machine: "TBM1", recordId: `seg-${ringNo}`,
  payload: { ringNo, installType: "Permanent" }, syncMeta: { [`segment:TBM1:${ringNo}:Permanent`]: { version: 1 } }, ...extra,
});

test("the bundle carries everything a recovery needs and nothing else", async () => {
  // This file is what a crew sends when the app cannot get their work to the sheet. It has to hold
  // the request ids and the full payloads — a recovery that cannot name the write cannot replay it.
  const repository = makeRepository();
  const pending = await repository.mutate(segment("P1"));
  const refused = await repository.mutate(segment("P2"));
  const dead = await repository.mutate(segment("P3"));
  const conflicted = await repository.mutate(segment("P4"));
  const landed = await repository.mutate(segment("P5"));
  await repository.updateMutation(refused.requestId, { status: "validation_error", nextAttemptAt: null, lastError: { code: "VALIDATION", message: "ring ไม่ถูกต้อง" } });
  await repository.updateMutation(dead.requestId, { status: "permanent_error", nextAttemptAt: null, lastError: { code: "PERMANENT", message: "ถูกปฏิเสธ" } });
  await repository.applyConflict(conflicted.requestId, { status: "conflict", currentVersion: 9, serverRecord: { id: "seg-P4", ringNo: "P4" } });
  await repository.applySyncSuccess(landed.requestId, { status: "success", version: 2, record: { id: "seg-P5", ringNo: "P5" } });

  const bundle = await exportPendingBundle(repository, { now: () => "2026-08-03T04:30:00.000Z" });

  expect(bundle).toMatchObject({ format: "tbm-offline-recovery", version: 1, exportedAt: "2026-08-03T04:30:00.000Z", deviceId: "device-1" });
  expect(bundle.pendingMutations.map(row => row.requestId)).toEqual([pending.requestId]);
  expect(bundle.validationErrors.map(row => row.requestId)).toEqual([refused.requestId]);
  expect(bundle.permanentErrors.map(row => row.requestId)).toEqual([dead.requestId]);
  expect(bundle.conflicts.map(row => row.requestId)).toEqual([conflicted.requestId]);
  expect(bundle.pendingMutations[0].payload).toMatchObject({ ringNo: "P1", installType: "Permanent" });
  // the write that reached the sheet is not this file's business
  expect(JSON.stringify(bundle)).not.toContain("seg-P5");
});

test("a conflicted write is listed once, under conflicts", async () => {
  // Its mutation is CONFLICT, not pending — listing it in both would have a recovery replay it twice.
  const repository = makeRepository();
  const conflicted = await repository.mutate(segment("P6"));
  await repository.applyConflict(conflicted.requestId, { status: "conflict", currentVersion: 3, serverRecord: { id: "seg-P6" } });

  const bundle = await exportPendingBundle(repository, { now: () => "2026-08-03T04:30:00.000Z" });

  expect(bundle.pendingMutations).toEqual([]);
  expect(bundle.conflicts).toHaveLength(1);
  expect(bundle.conflicts[0]).toMatchObject({ requestId: conflicted.requestId, currentVersion: 3 });
  expect(bundle.conflicts[0].localRecord).toMatchObject({ ringNo: "P6" });
  expect(bundle.conflicts[0].serverRecord).toMatchObject({ id: "seg-P6" });
});

test("photo bytes are reported, not carried", async () => {
  // A ring photo is megabytes of base64. The file has to say the photo was there — a recovery that
  // silently drops it looks like the crew never took one — without becoming unsendable.
  const repository = makeRepository();
  const queued = await repository.mutate(segment("P7", {
    payload: { ringNo: "P7", installType: "Permanent", imageBase64: "AAAABBBBCCCC", imageName: "P7.jpg" },
  }));

  const bundle = await exportPendingBundle(repository, { now: () => "2026-08-03T04:30:00.000Z" });

  const row = bundle.pendingMutations.find(item => item.requestId === queued.requestId);
  expect(row.payload.imageBase64).toEqual({ omitted: true, reason: "binary payload" });
  expect(row.payload.imageName).toBe("P7.jpg"); // the name stays: it says a photo existed
  expect(JSON.stringify(bundle)).not.toContain("AAAABBBBCCCC");
});

test("photo bytes inside a conflict's two sides are reported too", async () => {
  // The conflict carries the crew's payload as `localRecord`, so redacting only the mutation list
  // would let the same megabytes out through the other door.
  const repository = makeRepository();
  const conflicted = await repository.mutate(segment("P8", {
    payload: { ringNo: "P8", installType: "Permanent", imageBase64: "LOCALBYTES" },
  }));
  await repository.applyConflict(conflicted.requestId, {
    status: "conflict", currentVersion: 4, serverRecord: { id: "seg-P8", ringNo: "P8", imageBase64: "SERVERBYTES" },
  });

  const bundle = await exportPendingBundle(repository, { now: () => "2026-08-03T04:30:00.000Z" });

  expect(bundle.conflicts[0].localRecord.imageBase64).toEqual({ omitted: true, reason: "binary payload" });
  expect(bundle.conflicts[0].serverRecord.imageBase64).toEqual({ omitted: true, reason: "binary payload" });
  expect(JSON.stringify(bundle)).not.toMatch(/LOCALBYTES|SERVERBYTES/);
});

test("the file carries no credential and no server address", async () => {
  // It is emailed, put in a chat, or handed over on a phone. Nothing in it may be a way in.
  const repository = makeRepository();
  await repository.mutate(segment("P9"));

  const bundle = await exportPendingBundle(repository, { now: () => "2026-08-03T04:30:00.000Z" });
  const text = JSON.stringify(bundle);

  expect(text).not.toMatch(/script\.google\.com|macros\/s\/|AKfycb/);
  expect(text).not.toMatch(/AIza|GEMINI|apiKey|api_key|token/i);
});

test("the file names itself by the minute it was made", async () => {
  // Two exports in one shift must not overwrite each other in the phone's download folder.
  expect(exportFileName("2026-08-03T04:30:00.000Z")).toBe("tbm-offline-recovery-20260803-1130.json");
});

test("an empty queue still produces a well-formed file", async () => {
  // A crew told to export when there is nothing to export must get a file that says so, not an
  // error that reads as the export having failed.
  const repository = makeRepository();

  const bundle = await exportPendingBundle(repository, { now: () => "2026-08-03T04:30:00.000Z" });

  expect(bundle).toMatchObject({
    format: "tbm-offline-recovery", version: 1,
    pendingMutations: [], validationErrors: [], permanentErrors: [], conflicts: [],
  });
});

test("the download writes one JSON file and lets go of the object URL", async () => {
  // A blob URL that is never revoked keeps the whole bundle alive in memory on a phone that is
  // already short of it — which is the state the crew is in when they reach for this.
  const clicked = [];
  const anchor = { click: () => clicked.push(anchor.download), href: "", download: "", remove: () => {} };
  const realCreate = document.createElement.bind(document);
  jest.spyOn(document, "createElement").mockImplementation(tag => (tag === "a" ? anchor : realCreate(tag)));
  jest.spyOn(document.body, "appendChild").mockImplementation(() => {});
  global.URL.createObjectURL = jest.fn(() => "blob:x");
  global.URL.revokeObjectURL = jest.fn();

  const name = downloadExportBundle({ format: "tbm-offline-recovery", version: 1, exportedAt: "2026-08-03T04:30:00.000Z" });

  expect(name).toBe("tbm-offline-recovery-20260803-1130.json");
  expect(clicked).toEqual([name]);
  expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
  jest.restoreAllMocks();
});

test("a legacy staged difference exports both its sides", async () => {
  // `legacyMigration` files its differences in the same store with the older `local`/`server`
  // spelling and no requestId. Reading only the queued names exported them as null/null — a row in
  // the recovery file that says a disagreement exists and nothing about what it is.
  const repository = makeRepository();
  const db = await openOfflineDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("conflicts", "readwrite");
    tx.objectStore("conflicts").put({
      conflictId: "legacy-1", requestId: null, status: "open", domainKey: "segment:TBM1:P70:Permanent",
      local: { ringNo: "P70", grade: "A" }, server: { ringNo: "P70", grade: "B" },
    });
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });

  const bundle = await exportPendingBundle(repository, { now: () => "2026-08-03T04:30:00.000Z" });

  expect(bundle.conflicts).toHaveLength(1);
  expect(bundle.conflicts[0].localRecord).toMatchObject({ grade: "A" });
  expect(bundle.conflicts[0].serverRecord).toMatchObject({ grade: "B" });
});

test("a claim whose worker never came back is still work this device is holding", async () => {
  // SYNCING, not just PENDING. Dropping it from the file would lose exactly the write whose fate is
  // least certain — the one that was in flight when the app died.
  const repository = makeRepository();
  const queued = await repository.mutate(segment("P71"));
  await repository.updateMutation(queued.requestId, { status: "syncing" });

  const bundle = await exportPendingBundle(repository, { now: () => "2026-08-03T04:30:00.000Z" });

  expect(bundle.pendingMutations.map(row => row.requestId)).toEqual([queued.requestId]);
});
