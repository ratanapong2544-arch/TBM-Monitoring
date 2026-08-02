import { buildMutationEnvelope, payloadForWire } from "./mutationEnvelope";

test("the queue's own bookkeeping never reaches the payload", () => {
  // Open item 3n's trap, made reachable by Task 9. `optimisticEntity` stamps `recordId`,
  // `entityType`, `domainKey`, `version` and `syncStatus` onto the record App renders, so the second
  // edit of a row queued offline carries them — and GAS's JSON-blob path copies EVERY payload key
  // into the sheet cell. `syncStatus: "pending"` coming back from the server then makes
  // `preserveLocal` treat the cached server row as this device's unsynced work, and that row freezes
  // on every other phone: a later server copy can never replace it, and a deletion never lands.
  const record = {
    id: "prep_1", name: "ตั้งเครน", machine: "TBM1",
    recordId: "prep_1", entityType: "prepTask", domainKey: "prepTask:TBM1:prep_1",
    version: 3, syncStatus: "pending",
  };

  const envelope = buildMutationEnvelope({
    entityType: "prepTask", operation: "update", machine: "TBM1", recordId: "prep_1", payload: record, syncMeta: {},
  });

  expect(envelope.payload).toEqual({ id: "prep_1", name: "ตั้งเครน", machine: "TBM1" });
  // `machine` stays: it is a real column on both blob-backed sheets
  expect(envelope.payload.machine).toBe("TBM1");
});

test("what goes on the wire carries neither the queue's stamps nor the photo marker", () => {
  // Both halves are the rule, and the rule is about what may reach the sheet — not about which
  // module happens to build the envelope. `payloadForWire` exists because the two write paths the
  // Sync Center added do not build one, and they were applying half of it.
  const clean = payloadForWire({
    ringNo: "P41", grade: "A", imageUrl: "Attached",
    recordId: "seg-P41", entityType: "segment", domainKey: "segment:TBM1:P41:Permanent", version: 9, syncStatus: "pending",
  });

  expect(clean).toEqual({ ringNo: "P41", grade: "A" });
});
