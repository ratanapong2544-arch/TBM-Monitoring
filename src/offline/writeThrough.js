import { MUTATION_STATUS } from "./schema";

/**
 * Write-through saves: the crew's Save button means "on the sheet", not "on this phone".
 *
 * The queue underneath is unchanged — every write is still enveloped, still carries a `requestId`
 * GAS dedupes on, still checks `baseVersion` — but a save no longer RETURNS until the server has
 * answered, and a write the server never took is removed instead of being kept for later. So there
 * is no third state to explain: a row on screen is a row on the sheet, and a failure is an error the
 * crew reads while they still have the numbers in front of them.
 *
 * Decided by the project owner on 2026-08-06, after the CORS preflight blocked every queued write
 * for two days and the queue reported them as "on their way" the whole time. The crew records where
 * there is signal (site office / surface), so deferred writes buy nothing here and cost the one
 * thing that matters: knowing whether the record is safe. Underground entry would need the queue
 * back — the machinery is still here, only this seam changed.
 */

export const OFFLINE_SAVE_MESSAGE =
  "ไม่มีสัญญาณอินเทอร์เน็ต — ยังบันทึกไม่ได้ ต่อเน็ตแล้วกดบันทึกอีกครั้ง (ข้อมูลในฟอร์มยังอยู่)";

// What the crew is told, from what the server actually said. A conflict and a refusal need different
// actions from them, and "บันทึกไม่สำเร็จ" alone sends both to the same dead end.
export function failureMessage(mutation) {
  if (!mutation) return "ส่งขึ้นเซิร์ฟเวอร์ไม่สำเร็จ — ยังไม่ได้บันทึก ลองกดบันทึกใหม่อีกครั้ง";
  const error = mutation.lastError || {};
  if (mutation.status === MUTATION_STATUS.CONFLICT) {
    return "แถวนี้ถูกแก้บนเซิร์ฟเวอร์ไปแล้ว — ปิดแล้วเปิดแอพใหม่เพื่อดึงข้อมูลล่าสุด แล้วบันทึกอีกครั้ง";
  }
  if (mutation.status === MUTATION_STATUS.VALIDATION_ERROR) {
    const fields = Array.isArray(error.fields) && error.fields.length ? ` (${error.fields.join(", ")})` : "";
    return `เซิร์ฟเวอร์ไม่รับข้อมูล${fields}: ${error.message || "ไม่ทราบสาเหตุ"}`;
  }
  return `ส่งขึ้นเซิร์ฟเวอร์ไม่สำเร็จ: ${error.message || "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้"} — ยังไม่ได้บันทึก ลองกดบันทึกใหม่อีกครั้ง`;
}

const LANDED = new Set([MUTATION_STATUS.SYNCED, MUTATION_STATUS.RESOLVED]);

/**
 * Returns the optimistic record only when the server took the write. Throws otherwise, and the queue
 * is left with nothing to show for the attempt.
 */
export async function writeThrough({ repository, runner, input, online = () => typeof navigator === "undefined" || navigator.onLine !== false }) {
  // Checked BEFORE the write is created: an offline save that leaves a discarded row behind still
  // shows up in the Sync Center's history, and the crew would be reading a list of ghosts.
  if (!online()) throw new Error(OFFLINE_SAVE_MESSAGE);

  const { requestId, optimisticRecord } = await repository.mutate(input);

  // The drain is the same one the leftovers use, and it can throw for reasons that have nothing to
  // do with this write. The stored mutation is what decides the outcome, not this call.
  try { await runner.runNow(); } catch (error) { /* the record below is the verdict */ }

  // A landed write is pruned from the queue, so "gone" is a success here — this mutation existed a
  // line ago. Anything still sitting in the store did NOT reach the sheet.
  const after = await repository.getMutation(requestId);
  if (!after || LANDED.has(after.status)) return optimisticRecord;

  // No queue means no queue: take the failed write out rather than leaving it to retry unseen.
  // `discardMutation` also closes any conflict it raised and puts the server's row back on screen.
  try { await repository.discardMutation(requestId); } catch (error) { /* the throw below is what the crew needs */ }
  throw new Error(failureMessage(after));
}
