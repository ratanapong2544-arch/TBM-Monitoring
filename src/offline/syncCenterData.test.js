import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));
import { deleteOfflineDbForTests, openOfflineDb } from "./db";
import { buildMutationEnvelope } from "./mutationEnvelope";
import { createRepository } from "./repository";

beforeEach(async () => { await deleteOfflineDbForTests(); });
afterEach(async () => { await deleteOfflineDbForTests(); });

let nextId = 0;
function makeRepository(overrides = {}) {
  return createRepository({
    openDb: openOfflineDb, now: () => "2026-08-02T00:00:00.000Z", getDeviceId: async () => "device-1",
    createRequestId: () => `request-${++nextId}`, ...overrides,
  });
}

const segment = (ringNo, extra = {}) => buildMutationEnvelope({
  entityType: "segment", operation: "update", machine: "TBM1", recordId: `seg-${ringNo}`,
  payload: { ringNo, installType: "Permanent" }, syncMeta: { [`segment:TBM1:${ringNo}:Permanent`]: { version: 1 } }, ...extra,
});

test("the Sync Center is given every queued write, grouped by what the crew can do about it", async () => {
  // Four tabs, four questions: what is on its way, what was refused, what disagrees with the server,
  // what has landed. Each row has to name the record — Step 4: "Never hide the record identifier,
  // machine, entity type, or request ID in diagnostic detail."
  const repository = makeRepository();
  const onItsWay = await repository.mutate(segment("P1"));
  const refused = await repository.mutate(segment("P2"));
  const landed = await repository.mutate(segment("P3"));
  await repository.updateMutation(refused.requestId, { status: "validation_error", nextAttemptAt: null, lastError: { code: "VALIDATION", message: "ring ไม่ถูกต้อง" } });
  await repository.applySyncSuccess(landed.requestId, { status: "success", version: 2, record: { id: "seg-P3", ringNo: "P3" } });

  const view = await repository.getSyncCenter();

  expect(view.pending.map(row => row.recordId)).toEqual(["seg-P1"]);
  expect(view.errors.map(row => row.recordId)).toEqual(["seg-P2"]);
  expect(view.recent.map(row => row.recordId)).toEqual(["seg-P3"]);
  expect(view.conflicts).toEqual([]);
  const [row] = view.pending;
  expect(row).toEqual(expect.objectContaining({
    requestId: onItsWay.requestId, entityType: "segment", machine: "TBM1", domainKey: "segment:TBM1:P1:Permanent",
  }));
  expect(view.errors[0].lastError.message).toBe("ring ไม่ถูกต้อง");
});

test("a conflict is listed with both sides so the crew can compare them field by field", async () => {
  const repository = makeRepository();
  const queued = await repository.mutate(segment("P4"));
  await repository.applyConflict(queued.requestId, {
    status: "conflict", currentVersion: 7,
    serverRecord: { id: "seg-P4", ringNo: "P4", grade: "B" },
  });

  const view = await repository.getSyncCenter();

  expect(view.conflicts).toHaveLength(1);
  expect(view.conflicts[0]).toEqual(expect.objectContaining({
    requestId: queued.requestId, entityType: "segment", recordId: "seg-P4", currentVersion: 7,
  }));
  expect(view.conflicts[0].serverRecord).toEqual(expect.objectContaining({ grade: "B" }));
  expect(view.conflicts[0].localRecord).toEqual(expect.objectContaining({ ringNo: "P4" }));
});

test("a record stranded behind a stuck one is listed as stuck, not as on its way", async () => {
  // The same rule `getSyncCounts` already applies to the numbers: the queue orders per record, so
  // everything behind a refused head is never posted. Showing it under "กำลังส่ง" would be a lie the
  // crew acts on.
  const repository = makeRepository();
  const head = await repository.mutate(segment("P5"));
  await repository.mutate(segment("P5"));
  await repository.updateMutation(head.requestId, { status: "permanent_error", nextAttemptAt: null, lastError: { code: "PERMANENT", message: "ถูกปฏิเสธ" } });

  const view = await repository.getSyncCenter();

  expect(view.pending).toEqual([]);
  expect(view.blocked.map(row => row.recordId)).toEqual(["seg-P5"]);
});

test("the recent list is newest first and bounded", async () => {
  const repository = makeRepository();
  for (let index = 0; index < 3; index += 1) {
    const queued = await repository.mutate(segment(`R${index}`));
    await repository.applySyncSuccess(queued.requestId, { status: "success", version: index + 1, record: { id: `seg-R${index}` } });
  }

  const view = await repository.getSyncCenter({ recentLimit: 2 });

  expect(view.recent.map(row => row.recordId)).toEqual(["seg-R2", "seg-R1"]);
});

test("discarding a stuck write drops it from the queue and says so on the record", async () => {
  // The only destructive action the Sync Center has, and it is per record. The write is gone from
  // the queue — it will never be posted — so what is left has to say that happened rather than look
  // like it synced: a crew reading "ส่งแล้ว" for a ring they threw away would stop looking for it.
  const repository = makeRepository();
  const queued = await repository.mutate(segment("P9"));
  await repository.updateMutation(queued.requestId, { status: "permanent_error", nextAttemptAt: null, lastError: { code: "PERMANENT", message: "ถูกปฏิเสธ" } });

  await repository.discardMutation(queued.requestId);

  const view = await repository.getSyncCenter();
  expect(view.errors).toEqual([]);
  expect(view.pending).toEqual([]);
  expect(view.recent.map(r => r.recordId)).toEqual([]); // discarded is not "sent"
  expect(view.discarded.map(r => r.recordId)).toEqual(["seg-P9"]);
});

test("a write still on its way cannot be discarded by accident", async () => {
  // Discard exists for a write nothing can move. A pending one is still going to be sent, and
  // dropping it would take a record off the sheet's future with no trace on this device.
  const repository = makeRepository();
  const queued = await repository.mutate(segment("P10"));

  await expect(repository.discardMutation(queued.requestId)).rejects.toThrow(/ยังไม่ติดค้าง|not stuck/);
});

test("discarded writes are pruned with the confirmed ones rather than kept for ever", async () => {
  // A discarded mutation is finished with — never claimable, never counted, on no screen but the
  // discarded list. Left out of the prune it would be the one row class that grows without bound on
  // a phone that is never reinstalled. The window is 200, so 260 rows proves the sweep reaches them.
  const repository = makeRepository({ fetchServerSnapshot: async machine => ({ status: "success", segments: [], machine }) });
  const db = await openOfflineDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("mutations", "readwrite");
    const store = transaction.objectStore("mutations");
    for (let index = 0; index < 260; index += 1) {
      store.put({
        requestId: `discarded-${index}`, status: "discarded", queueSequence: index,
        entityType: "segment", operation: "update", machine: "TBM1", recordId: `seg-D${index}`,
        domainKey: `segment:TBM1:D${index}:Permanent`, payload: {}, createdAtLocal: "2026-08-02T00:00:00.000Z",
      });
    }
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  // no db.close(): the repository shares this connection, and closing it here would make its own
  // reads fail rather than test anything

  await repository.refresh("TBM1"); // the sweep runs with the snapshot write

  const view = await repository.getSyncCenter();
  expect(view.discarded.length).toBe(200);
});

test("a write the server never confirmed is not listed as sent", async () => {
  // `RESOLVED` is set on the mutation the crew REPLACED — the server refused it, a successor was
  // queued in its place, and it was never confirmed. Listing it beside the synced ones put the same
  // ring on screen twice at once: "กำลังส่ง" for the successor and "ซิงก์สำเร็จ" for the original.
  const repository = makeRepository();
  const queued = await repository.mutate(segment("P77"));
  await repository.applyConflict(queued.requestId, { status: "conflict", currentVersion: 3, serverRecord: { id: "seg-P77", ringNo: "P77" } });
  await repository.resolveConflict(queued.requestId, { strategy: "local" });

  const view = await repository.getSyncCenter();

  expect(view.recent).toEqual([]);
  expect(view.pending.map(r => r.recordId)).toEqual(["seg-P77"]); // the successor, and only it
  expect(view.superseded.map(r => r.recordId)).toEqual(["seg-P77"]);
});

test("a conflict carries the server's time and device, and when this device saved its own copy", async () => {
  // Design §9: a field-by-field comparison with server time, local save time and device label.
  // `saveConflict` stores all three on purpose; the row was dropping them.
  const repository = makeRepository();
  const queued = await repository.mutate(segment("P78"));
  await repository.applyConflict(queued.requestId, {
    status: "conflict", currentVersion: 5,
    serverRecord: { id: "seg-P78", ringNo: "P78" },
    currentUpdatedAt: "2026-08-02T03:00:00.000Z",
    currentUpdatedByDevice: "device-2",
  });

  const [row] = (await repository.getSyncCenter()).conflicts;

  expect(row.serverUpdatedAt).toBe("2026-08-02T03:00:00.000Z");
  expect(row.serverUpdatedByDevice).toBe("device-2");
  expect(row.savedAtLocal).toBe("2026-08-02T00:00:00.000Z");
});

test("a refused row carries the values the server refused, so they can be corrected", async () => {
  // A validation error is about THESE values. Without them on the row the only offers are resend
  // (refused identically) and discard (destroys the record locally), which is the same dead end the
  // errors tab had before it grew buttons.
  const repository = makeRepository();
  const queued = await repository.mutate(segment("P80"));
  await repository.updateMutation(queued.requestId, {
    status: "validation_error", nextAttemptAt: null,
    lastError: { code: "VALIDATION", fields: ["ringNo"], message: "ring ซ้ำ" },
  });

  const [row] = (await repository.getSyncCenter()).errors;

  expect(row.payload).toEqual(expect.objectContaining({ ringNo: "P80" }));
  expect(row.lastError.fields).toEqual(["ringNo"]);
});

test("the recent list keeps the last 50 by default", async () => {
  // The plan fixes the number, and only an explicit `recentLimit` was exercised — the default could
  // have been anything.
  const repository = makeRepository();
  const db = await openOfflineDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("mutations", "readwrite");
    const store = transaction.objectStore("mutations");
    for (let index = 0; index < 60; index += 1) {
      store.put({
        requestId: `synced-${index}`, status: "synced", queueSequence: index,
        confirmedAtLocal: `2026-08-02T00:${String(index).padStart(2, "0")}:00.000Z`,
        entityType: "segment", operation: "update", machine: "TBM1", recordId: `seg-S${index}`,
        domainKey: `segment:TBM1:S${index}:Permanent`, payload: {},
      });
    }
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });

  expect((await repository.getSyncCenter()).recent).toHaveLength(50);
});

test("a refused write with a photo does not carry its bytes into the panel", async () => {
  // `handleFileUpload` reads a phone photo whole and never resizes it, so the payload is megabytes.
  // The Sync Center puts that payload in a controlled textarea that re-serialises on every
  // keystroke — the worst place in the app to hold the one budget an offline queue cannot overspend.
  const repository = makeRepository();
  const queued = await repository.mutate(buildMutationEnvelope({
    entityType: "grout", operation: "update", machine: "TBM1", recordId: "g-1",
    payload: { ringNo: "P1", groutPass: "Primary", imageBase64: "data:image/jpeg;base64,AAAA".padEnd(5000, "A") },
    syncMeta: {},
  }));
  await repository.updateMutation(queued.requestId, { status: "validation_error", nextAttemptAt: null, lastError: { code: "VALIDATION", message: "ผิด" } });

  const [row] = (await repository.getSyncCenter()).errors;

  expect(row.payload.imageBase64).toBeUndefined(); // omitted, not marked — a marker is round-trippable
  expect(row.payload.ringNo).toBe("P1"); // the values the crew has to correct are still there
});

test("editing a refused write keeps the photo that was never on screen to edit", async () => {
  // The editor cannot show megabytes of base64, so a payload without them means "I did not touch
  // the photo" — never "remove it". A marker string here went to the sheet AS the photo while
  // `imageName` survived beside it, and GAS's `invalidSyncImage_` then refused the successor for
  // ever: the ring dead-ended with discard as its only way out, and the picture was gone.
  const photo = `data:image/jpeg;base64,${"A".repeat(400)}`;
  const repository = makeRepository();
  const queued = await repository.mutate(buildMutationEnvelope({
    entityType: "grout", operation: "update", machine: "TBM1", recordId: "g-2",
    payload: { ringNo: "P2", groutPass: "Primary", note: "ผิด", imageBase64: photo, imageName: "ring.jpg" },
    syncMeta: {},
  }));
  await repository.updateMutation(queued.requestId, { status: "validation_error", nextAttemptAt: null, lastError: { code: "VALIDATION", message: "ผิด" } });

  const [row] = (await repository.getSyncCenter()).errors;
  expect(row.payload.imageBase64).toBeUndefined(); // never handed to the textarea
  expect(row.payload.imageName).toBe("ring.jpg");

  const retried = await repository.retryMutation(queued.requestId, { payload: { ...row.payload, note: "แก้แล้ว" } });

  const successor = await repository.getMutation(retried.requestId);
  expect(successor.payload.note).toBe("แก้แล้ว");
  expect(successor.payload.imageBase64).toBe(photo); // re-attached, byte for byte
});

test("a conflict's two records do not carry photo bytes to the screen either", async () => {
  // `SyncCenter` renders both into a <pre> the moment the tab opens, and `ConflictResolver` loads
  // either into a controlled textarea.
  const photo = `data:image/jpeg;base64,${"B".repeat(400)}`;
  const repository = makeRepository();
  const queued = await repository.mutate(buildMutationEnvelope({
    entityType: "grout", operation: "update", machine: "TBM1", recordId: "g-3",
    payload: { ringNo: "P3", groutPass: "Primary", imageBase64: photo }, syncMeta: {},
  }));
  await repository.applyConflict(queued.requestId, {
    status: "conflict", currentVersion: 2,
    serverRecord: { id: "g-3", ringNo: "P3", imageBase64: photo },
  });

  const [row] = (await repository.getSyncCenter()).conflicts;

  expect(JSON.stringify(row.localRecord)).not.toContain("BBBB");
  expect(JSON.stringify(row.serverRecord)).not.toContain("BBBB");
  expect(row.localRecord.ringNo).toBe("P3");
});

test("resolving a conflict by hand keeps the photo too", async () => {
  // The other successor path, and the one with no shipped coverage: the resolver's textarea is fed
  // the same stripped record, so a manual resolution had exactly the same hole.
  const photo = `data:image/jpeg;base64,${"C".repeat(300)}`;
  const excav = `data:image/jpeg;base64,${"D".repeat(300)}`;
  const repository = makeRepository();
  const queued = await repository.mutate(buildMutationEnvelope({
    entityType: "grout", operation: "update", machine: "TBM1", recordId: "g-4",
    payload: { ringNo: "P4", groutPass: "Primary", note: "เดิม", imageBase64: photo, imageName: "a.jpg", excavImageBase64: excav, excavImageName: "b.jpg" },
    syncMeta: {},
  }));
  await repository.applyConflict(queued.requestId, { status: "conflict", currentVersion: 4, serverRecord: { id: "g-4", ringNo: "P4" } });

  const [row] = (await repository.getSyncCenter()).conflicts;
  const resolved = await repository.resolveConflict(row.conflictId, { strategy: "manual", payload: { ...row.localRecord, note: "แก้แล้ว" } });

  const successor = await repository.getMutation(resolved.requestId);
  expect(successor.payload.note).toBe("แก้แล้ว");
  expect(successor.payload.imageBase64).toBe(photo);
  expect(successor.payload.excavImageBase64).toBe(excav);
});

test("clearing the photo's name is how a crew removes it", async () => {
  // The base64 key is never shown, so the name is the only handle. GAS needs both to upload
  // anything, so bytes with no name would ride the tunnel link for nothing and upload nothing.
  const photo = `data:image/jpeg;base64,${"E".repeat(300)}`;
  const repository = makeRepository();
  const queued = await repository.mutate(buildMutationEnvelope({
    entityType: "grout", operation: "update", machine: "TBM1", recordId: "g-5",
    payload: { ringNo: "P5", groutPass: "Primary", imageBase64: photo, imageName: "a.jpg" }, syncMeta: {},
  }));
  await repository.updateMutation(queued.requestId, { status: "validation_error", nextAttemptAt: null, lastError: { code: "VALIDATION", message: "ผิด" } });
  const [row] = (await repository.getSyncCenter()).errors;

  const retried = await repository.retryMutation(queued.requestId, { payload: { ...row.payload, imageName: "" } });

  const successor = await repository.getMutation(retried.requestId);
  expect(successor.payload.imageBase64).toBeUndefined();
});

test("a corrected payload that carries its own photo keeps that one, not the original", async () => {
  // The third branch of `carryPhotosFrom`, and the third round running in which one branch of this
  // helper was fixed while a sibling stayed unguarded.
  const original = `data:image/jpeg;base64,${"F".repeat(200)}`;
  const replacement = `data:image/jpeg;base64,${"G".repeat(200)}`;
  const repository = makeRepository();
  const queued = await repository.mutate(buildMutationEnvelope({
    entityType: "grout", operation: "update", machine: "TBM1", recordId: "g-6",
    payload: { ringNo: "P6", groutPass: "Primary", imageBase64: original, imageName: "a.jpg" }, syncMeta: {},
  }));
  await repository.updateMutation(queued.requestId, { status: "validation_error", nextAttemptAt: null, lastError: { code: "VALIDATION", message: "ผิด" } });
  const [row] = (await repository.getSyncCenter()).errors;

  const retried = await repository.retryMutation(queued.requestId, { payload: { ...row.payload, imageBase64: replacement } });

  expect((await repository.getMutation(retried.requestId)).payload.imageBase64).toBe(replacement);
});

test("discarding the head of a record lets everything queued behind it move again", async () => {
  // Offline, a crew saves one ring twice — In Progress at excavation, Completed at install — and
  // both queue on the same record. The head is refused terminally. Discard is the ONE action the
  // panel offers to unjam it, and `domainHeads` filtered on `isTerminalStatus`, which DISCARDED is
  // not: the discarded write stayed the head for ever, nothing behind it was ever posted again, and
  // the counts reclassified the stranded one from "ติดค้าง" to "กำลังส่ง". The Completed record for
  // that ring never reached the sheet and nothing on the device said so.
  const repository = makeRepository();
  const head = await repository.mutate(segment("P643"));
  const behind = await repository.mutate(segment("P643"));
  await repository.updateMutation(head.requestId, { status: "permanent_error", nextAttemptAt: null, lastError: { code: "PERMANENT", message: "ถูกปฏิเสธ" } });

  await repository.discardMutation(head.requestId);

  const due = await repository.getDueMutations(Date.now());
  expect(due.map(item => item.requestId)).toEqual([behind.requestId]);
});

test("discarding one write does not take another write's row off the screen", async () => {
  // The optimistic entity key is per RECORD, not per request. Deleting it unconditionally destroyed
  // the on-screen row of the write still queued for that same ring.
  // The DISCARDED one is queued last, so its own values are what the row currently shows — which is
  // the only arrangement where handing the row back to the survivor is observable. Discarding the
  // first one is invisible either way, because the second already overwrote the row.
  const repository = makeRepository();
  await repository.mutate(buildMutationEnvelope({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "seg-P644",
    payload: { id: "seg-P644", ringNo: "P644", installType: "Permanent", note: "ตัวที่ยังรอส่ง" }, syncMeta: {},
  }));
  const last = await repository.mutate(buildMutationEnvelope({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "seg-P644",
    payload: { id: "seg-P644", ringNo: "P644", installType: "Permanent", note: "ตัวที่ถูกทิ้ง" }, syncMeta: {},
  }));
  await repository.updateMutation(last.requestId, { status: "permanent_error", nextAttemptAt: null, lastError: { code: "PERMANENT" } });

  await repository.discardMutation(last.requestId);

  const { data } = await repository.load("TBM1");
  expect(data.segments.map(row => row.ringNo)).toEqual(["P644"]);
  // and it shows the write that is still going, not the one that was thrown away
  expect(data.segments[0].note).toBe("ตัวที่ยังรอส่ง");
});

test("discarding a correction does not take the ring the sheet already holds off the screen", async () => {
  // `patchSnapshotKeys` replaces the cached SERVER key with the optimistic one when a write is
  // queued, so after a refused edit the optimistic copy is this device's only copy of that ring.
  // Deleting it on discard made the whole ring vanish from the data log for the rest of the shift —
  // and the predictable response, re-entering it, is the duplicate row this branch exists to stop.
  const repository = makeRepository({
    fetchServerSnapshot: async machine => ({ status: "success", machine, segments: [{ id: "seg-P7", ringNo: "P7", installType: "Permanent", machine }] }),
  });
  await repository.refresh("TBM1");
  const queued = await repository.mutate(buildMutationEnvelope({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "seg-P7",
    payload: { id: "seg-P7", ringNo: "P7", installType: "Permanent", note: "แก้" },
    syncMeta: { "segment:TBM1:P7:Permanent": { version: 1 } },
  }));
  await repository.updateMutation(queued.requestId, { status: "validation_error", nextAttemptAt: null, lastError: { code: "VALIDATION" } });

  await repository.discardMutation(queued.requestId);

  const { data } = await repository.load("TBM1");
  expect(data.segments.map(row => row.ringNo)).toEqual(["P7"]);
});

test("legacy staged differences are listed one per record, and cannot be acted on as if they were writes", async () => {
  // `legacyMigration` files its differences in the same store with NO requestId and its own field
  // names. Keyed on `requestId` they all collapsed onto `undefined`: the count said three, the tab
  // showed one blank row, and both of its buttons threw — `resolveConflict` has no mutation to
  // resolve and `discardMutation(undefined)` is an unknown mutation. This is the state open item 3k
  // says Task 10 exists to clear.
  const repository = makeRepository();
  const db = await openOfflineDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("conflicts", "readwrite");
    const store = transaction.objectStore("conflicts");
    ["issue-1", "issue-2"].forEach(id => store.put({
      conflictId: `legacy:tbmIssues:issue:GLOBAL:${id}`,
      status: "open", reason: "legacy_local_difference",
      domainKey: `issue:GLOBAL:${id}`,
      local: { id, title: `ในเครื่อง ${id}` },
      server: { id, title: `บนเซิร์ฟเวอร์ ${id}` },
      legacyKey: "tbmIssues",
      createdAtLocal: "2026-08-02T00:00:00.000Z",
    }));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });

  const view = await repository.getSyncCenter();

  expect(view.conflicts).toHaveLength(2);
  expect(view.conflicts.map(row => row.recordId).sort()).toEqual(["issue-1", "issue-2"]);
  expect(view.conflicts[0].localRecord).toBeTruthy();
  expect(view.conflicts[0].serverRecord).toBeTruthy();
  // and they carry no requestId, which is what tells the panel not to offer the write actions
  expect(view.conflicts.every(row => !row.requestId)).toBe(true);
});

test("a confirmed write records the version the server gave it", async () => {
  const repository = makeRepository();
  const queued = await repository.mutate(segment("P81"));
  await repository.applySyncSuccess(queued.requestId, { status: "success", version: 9, record: { id: "seg-P81" } });

  expect((await repository.getSyncCenter()).recent[0].version).toBe(9);
});

test("keeping the server's row is not listed as a successful send of this device's values", async () => {
  // `applySyncSuccess` marks the mutation SYNCED because the record is settled — but nothing this
  // device wrote reached the sheet, and ประวัติ said "ซิงก์สำเร็จ" for values that were dropped.
  const repository = makeRepository();
  const queued = await repository.mutate(segment("P82"));
  await repository.applyConflict(queued.requestId, { status: "conflict", currentVersion: 4, serverRecord: { id: "seg-P82", ringNo: "P82" } });

  await repository.resolveConflict(queued.requestId, { strategy: "server" });

  const view = await repository.getSyncCenter();
  expect(view.recent).toEqual([]);
  expect(view.superseded.map(row => row.recordId)).toEqual(["seg-P82"]);
});

test("a discarded correction stops masking the ring the sheet holds", async () => {
  // Keeping the row was right — deleting it took the whole ring off the data log. But the kept row
  // was still stamped `pending`, and `preserveLocal` reads THAT, not the mutation. So every refresh
  // replaced the sheet's row with the values the crew threw away, for ever: the data log, both
  // dashboards and the ring count all showed the discarded copy, badged as still on its way, and a
  // correction another crew made later never arrived.
  let serverNote = "SERVER TRUTH";
  const repository = makeRepository({
    fetchServerSnapshot: async machine => ({ status: "success", machine, segments: [{ id: "seg-P8", ringNo: "P8", installType: "Permanent", note: serverNote }] }),
  });
  await repository.refresh("TBM1");
  const queued = await repository.mutate(buildMutationEnvelope({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "seg-P8",
    payload: { id: "seg-P8", ringNo: "P8", installType: "Permanent", note: "CREW REFUSED VALUE" },
    syncMeta: { "segment:TBM1:P8:Permanent": { version: 1 } },
  }));
  await repository.updateMutation(queued.requestId, { status: "validation_error", nextAttemptAt: null, lastError: { code: "VALIDATION" } });
  await repository.discardMutation(queued.requestId);

  // offline the ring is still there — that is the loss the kept row exists to prevent
  expect((await repository.load("TBM1")).data.segments[0].ringNo).toBe("P8");

  serverNote = "CORRECTED BY ANOTHER CREW";
  const { data } = await repository.refresh("TBM1");

  expect(data.segments[0].note).toBe("CORRECTED BY ANOTHER CREW");
  expect((await repository.load("TBM1")).data.segments[0].note).toBe("CORRECTED BY ANOTHER CREW");
});

test("a legacy difference can be marked reviewed, and stops counting once it is", async () => {
  // Nothing in the app could clear one: `resolveConflict` refuses a conflict with no mutation and
  // `discardMutation` is keyed by request id, so the strip read "N รายการติดค้าง" for ever on every
  // upgraded phone while the panel it pointed at said to fix it somewhere else. Reviewing is the
  // action that exists for it — the difference has already been carried into the record by hand.
  const repository = makeRepository();
  const db = await openOfflineDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("conflicts", "readwrite");
    transaction.objectStore("conflicts").put({
      conflictId: "legacy:tbmIssues:issue:GLOBAL:issue-9",
      status: "open", reason: "legacy_local_difference", domainKey: "issue:GLOBAL:issue-9",
      local: { id: "issue-9", title: "ในเครื่อง" }, server: { id: "issue-9", title: "บนเซิร์ฟเวอร์" },
      legacyKey: "tbmIssues", createdAtLocal: "2026-08-02T00:00:00.000Z",
    });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  expect((await repository.getSyncSummary()).conflicts).toBe(1);

  await repository.reviewLegacyDifference("legacy:tbmIssues:issue:GLOBAL:issue-9");

  expect((await repository.getSyncCenter()).conflicts).toEqual([]);
  expect((await repository.getSyncSummary()).conflicts).toBe(0);
});

test("reviewing refuses a conflict that is a queued write, because that one has to be decided", async () => {
  const repository = makeRepository();
  const queued = await repository.mutate(segment("P83"));
  await repository.applyConflict(queued.requestId, { status: "conflict", currentVersion: 2, serverRecord: { id: "seg-P83" } });

  await expect(repository.reviewLegacyDifference(queued.requestId)).rejects.toThrow(/เลือก|queued/);
});

test("discarding a create takes its row off the screen, since no server row is behind it", async () => {
  // The one case where deleting is right: nothing on the sheet corresponds to it, so a kept row
  // would be a ring that never existed sitting in the data log for ever.
  const repository = makeRepository();
  const queued = await repository.mutate(buildMutationEnvelope({
    entityType: "segment", operation: "create", machine: "TBM1", recordId: "seg-new",
    payload: { id: "seg-new", ringNo: "P99", installType: "Permanent" }, syncMeta: {},
  }));
  await repository.updateMutation(queued.requestId, { status: "permanent_error", nextAttemptAt: null, lastError: { code: "PERMANENT" } });

  await repository.discardMutation(queued.requestId);

  expect((await repository.load("TBM1")).data.segments).toEqual([]);
});

test("discarding a conflicted write closes its conflict too", async () => {
  // Otherwise the row leaves the ขัดแย้ง tab's source and stays in the count for ever.
  const repository = makeRepository();
  const queued = await repository.mutate(segment("P84"));
  await repository.applyConflict(queued.requestId, { status: "conflict", currentVersion: 3, serverRecord: { id: "seg-P84" } });

  await repository.discardMutation(queued.requestId);

  expect((await repository.getSyncSummary()).conflicts).toBe(0);
  expect((await repository.getSyncCenter()).conflicts).toEqual([]);
});

test("a discarded write cannot overwrite a row another write has since confirmed", async () => {
  // `newestOutstanding` decides which copy the confirmation leaves on screen; asking
  // `isTerminalStatus` there would let a discarded mutation count as outstanding and put the values
  // the crew threw away back over a confirmed row.
  const repository = makeRepository();
  const first = await repository.mutate(segment("P85"));
  const second = await repository.mutate(segment("P85"));
  await repository.updateMutation(second.requestId, { status: "permanent_error", nextAttemptAt: null, lastError: { code: "PERMANENT" } });
  await repository.discardMutation(second.requestId);

  await repository.applySyncSuccess(first.requestId, { status: "success", version: 5, record: { id: "seg-P85", ringNo: "P85", note: "ยืนยันแล้ว" } });

  const { data } = await repository.load("TBM1");
  expect(data.segments[0].note).toBe("ยืนยันแล้ว");
});

test("a legacy row is listed as unactionable by the store, not only by the screen", async () => {
  const repository = makeRepository();
  const db = await openOfflineDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("conflicts", "readwrite");
    transaction.objectStore("conflicts").put({
      conflictId: "legacy:tbmIssues:issue:GLOBAL:issue-5", status: "open",
      reason: "legacy_local_difference", domainKey: "issue:GLOBAL:issue-5",
      local: { id: "issue-5" }, server: { id: "issue-5" }, legacyKey: "tbmIssues",
    });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });

  const [row] = (await repository.getSyncCenter()).conflicts;

  expect(row.actionable).toBe(false);
  expect(row.savedAtLocal).toBeNull();
});
