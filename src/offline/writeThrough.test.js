import { MUTATION_STATUS } from "./schema";
import { OFFLINE_SAVE_MESSAGE, writeThrough } from "./writeThrough";

// A repository stub with only what this seam touches. The real one is exercised by
// repository.write.test.js; what has to be pinned here is the CONTRACT between a save and the queue:
// nothing is left behind unless the server took it.
function fakeRepository({ after }) {
  const calls = { mutated: 0, discarded: [] };
  return {
    calls,
    async mutate(input) { calls.mutated += 1; calls.input = input; return { requestId: "req-1", status: MUTATION_STATUS.PENDING, optimisticRecord: { ...input.payload, id: input.recordId } }; },
    async getMutation() { return after; },
    async discardMutation(requestId) { calls.discarded.push(requestId); },
  };
}

const runner = { runNow: async () => ({ attempted: 1, synced: 1, conflicts: 0, errors: 0 }) };
const input = { entityType: "segment", operation: "create", machine: "TBM1", recordId: "seg-1", payload: { ringNo: "P900" } };

test("a save that the server took returns the record and leaves nothing queued", async () => {
  // the queue prunes a landed write, so the mutation is GONE by the time this reads it back
  const repository = fakeRepository({ after: undefined });
  await expect(writeThrough({ repository, runner, input, online: () => true })).resolves.toMatchObject({ ringNo: "P900" });
  expect(repository.calls.discarded).toEqual([]);
});

test("a synced mutation that has not been pruned yet is still a success", async () => {
  const repository = fakeRepository({ after: { requestId: "req-1", status: MUTATION_STATUS.SYNCED } });
  await expect(writeThrough({ repository, runner, input, online: () => true })).resolves.toMatchObject({ ringNo: "P900" });
  expect(repository.calls.discarded).toEqual([]);
});

test("a write the server never took is discarded and the crew is told, not left to retry unseen", async () => {
  // this is the whole point of the mode: the old queue would have kept this and reported "กำลังส่ง"
  const repository = fakeRepository({ after: { requestId: "req-1", status: MUTATION_STATUS.PENDING, lastError: { message: "Failed to fetch" } } });
  await expect(writeThrough({ repository, runner, input, online: () => true })).rejects.toThrow(/Failed to fetch/);
  expect(repository.calls.discarded).toEqual(["req-1"]);
});

test("a mutation still claimed when the drain ends counts as not saved", async () => {
  // syncing = a post whose outcome this device never learned. Reporting it as saved is the failure
  // that started this: a row on screen that the sheet has never had.
  const repository = fakeRepository({ after: { requestId: "req-1", status: MUTATION_STATUS.SYNCING } });
  await expect(writeThrough({ repository, runner, input, online: () => true })).rejects.toThrow(/ยังไม่ได้บันทึก/);
  expect(repository.calls.discarded).toEqual(["req-1"]);
});

test("a refusal names the fields the server named", async () => {
  const repository = fakeRepository({ after: { requestId: "req-1", status: MUTATION_STATUS.VALIDATION_ERROR, lastError: { message: "invalid sync envelope", fields: ["ringNo"] } } });
  await expect(writeThrough({ repository, runner, input, online: () => true })).rejects.toThrow(/ringNo/);
});

test("a conflict tells the crew to reload rather than to press save again", async () => {
  const repository = fakeRepository({ after: { requestId: "req-1", status: MUTATION_STATUS.CONFLICT } });
  await expect(writeThrough({ repository, runner, input, online: () => true })).rejects.toThrow(/ดึงข้อมูลล่าสุด/);
  expect(repository.calls.discarded).toEqual(["req-1"]);
});

test("with no link the save is refused before a mutation exists", async () => {
  // an offline save that queued and was then discarded would still show in the Sync Center's history
  const repository = fakeRepository({ after: undefined });
  await expect(writeThrough({ repository, runner, input, online: () => false })).rejects.toThrow(OFFLINE_SAVE_MESSAGE);
  expect(repository.calls.mutated).toBe(0);
});

test("a drain that throws does not decide the outcome — the stored mutation does", async () => {
  const repository = fakeRepository({ after: undefined });
  const throwingRunner = { runNow: async () => { throw new Error("drain blew up"); } };
  await expect(writeThrough({ repository, runner: throwingRunner, input, online: () => true })).resolves.toMatchObject({ ringNo: "P900" });
});
