/**
 * How many queued writes need a person, as opposed to needing patience.
 *
 * Conflicts, refusals and everything stranded behind them: three rings behind one conflict is three
 * records nobody can fix by waiting. It lives here because two surfaces show it together — the
 * status button and the notice strip — and when each spelled it itself either could change while the
 * other silently disagreed on the same screen.
 */
/**
 * The one way this app writes a sync time, for the two surfaces that show it together: the status
 * button and the Sync Center, one tap apart.
 *
 * Both parts, always. Printing the time alone is tighter and is a trap — a phone that synced at
 * 07:15 and went underground reads "ออฟไลน์ 07:15" at six the next evening — and printing the date
 * only when it is not today is the same trap wearing a disguise: the comparison would run during
 * render, midnight is not an event, and these surfaces re-render only when a queue count changes.
 *
 * The app's own formatters, not a new pair: `th-TH` resolves to the Buddhist calendar, so
 * `dateStyle: "short"` prints 2569 truncated to "69", a date that reads as 1969.
 */
export function formatSyncStamp(value, { formatDate, formatTime }) {
  if (!value) return "";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "";
  const at = new Date(parsed);
  return `${formatDate(at)} ${formatTime(at)}`;
}

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
export function discardOutcomeText(operation, cascadeCount = 0) {
  if (operation === "create") {
    // The cascade is part of what the crew is consenting to. Discarding a create takes every write
    // still queued for that record with it — they can only ever post an edit against a row the sheet
    // has never held — so a crew that queued a create and three corrections was told one write was
    // going and lost four.
    const also = cascadeCount > 0 ? ` และรายการอื่นของข้อมูลนี้อีก ${cascadeCount} รายการจะถูกทิ้งไปด้วย` : "";
    return `งานนี้จะไม่ถูกส่งขึ้นเซิร์ฟเวอร์อีก และจะหายไปจากหน้าจอของเครื่องนี้ เพราะยังไม่เคยมีอยู่บนชีต${also}`;
  }
  if (operation === "delete") return "การลบจะไม่ถูกส่งขึ้นเซิร์ฟเวอร์ — ข้อมูลนี้จะกลับมาแสดงบนหน้าจอ";
  return "งานนี้จะไม่ถูกส่งขึ้นเซิร์ฟเวอร์อีก — ค่าที่บันทึกไว้จะยังอยู่บนหน้าจอจนกว่าจะดึงข้อมูลจากเซิร์ฟเวอร์ครั้งถัดไป";
}
