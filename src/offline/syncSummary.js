/**
 * How many queued writes need a person, as opposed to needing patience.
 *
 * Conflicts, refusals and everything stranded behind them: three rings behind one conflict is three
 * records nobody can fix by waiting. It lives here because two surfaces show it together — the
 * status button and the notice strip — and when each spelled it itself either could change while the
 * other silently disagreed on the same screen.
 */
export function stuckCount(summary) {
  const counts = summary || {};
  return (counts.conflicts || 0) + (counts.errors || 0) + (counts.blocked || 0);
}

export function travellingCount(summary) {
  const counts = summary || {};
  return (counts.pending || 0) + (counts.syncing || 0);
}

/**
 * What discarding this write actually does to the row on screen — which differs by operation, and
 * was written twice and wrong twice before it was written once.
 *
 * A CREATE's row goes: the sheet never had it. A DELETE's row COMES BACK: the delete is what was
 * hiding it. An UPDATE's row stays as it is until the next getData replaces it with the server's.
 */
export function discardOutcomeText(operation) {
  if (operation === "create") return "งานนี้จะไม่ถูกส่งขึ้นเซิร์ฟเวอร์อีก และจะหายไปจากหน้าจอของเครื่องนี้ เพราะยังไม่เคยมีอยู่บนชีต";
  if (operation === "delete") return "การลบจะไม่ถูกส่งขึ้นเซิร์ฟเวอร์ — ริงนี้จะกลับมาแสดงบนหน้าจอ";
  return "งานนี้จะไม่ถูกส่งขึ้นเซิร์ฟเวอร์อีก — ค่าที่บันทึกไว้จะยังอยู่บนหน้าจอจนกว่าจะดึงข้อมูลจากเซิร์ฟเวอร์ครั้งถัดไป";
}
