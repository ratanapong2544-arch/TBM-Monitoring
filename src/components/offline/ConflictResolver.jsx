import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { discardOutcomeText } from "../../offline/syncSummary";


/**
 * The one screen where a crew decides between their own record and the server's.
 *
 * Field by field, both sides, with the ones that differ marked — a conflict summarised is a
 * conflict guessed at, and the thing being chosen between is a ring somebody built.
 *
 * Three ways out, and each maps to exactly one repository strategy: keep the server's row, keep
 * this device's, or type the right values. Discard is the fourth and is not a resolution: it is the
 * only way a recorded write leaves this device without reaching the sheet, so it takes two
 * deliberate actions rather than one tap on a phone in a wet glove.
 */
// The queue's own bookkeeping, which is not the crew's data and would only be noise in a
// field-by-field comparison of a ring.
const HIDDEN_FROM_COMPARISON = ["recordId", "entityType", "domainKey", "version", "syncStatus"];

const fieldsOf = (left, right) => {
  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  // Its OWN list, deliberately not `QUEUE_STAMPED_KEYS`. That one answers "what does the envelope
  // strip on the way out", and a key added to it — `machine` is the obvious candidate — would then
  // silently disappear from the comparison the crew is deciding on, which is the opposite of what
  // hiding the queue's bookkeeping is for.
  HIDDEN_FROM_COMPARISON.forEach(key => keys.delete(key));
  return [...keys];
};

const show = value => (value === undefined ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value));

export default function ConflictResolver({ conflict, onResolve, onDiscard, onClose }) {
  const [mode, setMode] = useState("choose");
  // Empty on purpose. Prefilled with this device's record, "พิมพ์ค่าที่ถูกต้องเอง" submitted
  // unchanged is the local strategy wearing another name, and the crew would have chosen it without
  // deciding anything. Filling it is one deliberate tap below.
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const rows = useMemo(
    () => fieldsOf(conflict && conflict.localRecord, conflict && conflict.serverRecord).map(key => ({
      key,
      local: conflict.localRecord ? conflict.localRecord[key] : undefined,
      server: conflict.serverRecord ? conflict.serverRecord[key] : undefined,
    })),
    [conflict],
  );

  if (!conflict) return null;

  const parsedDraft = () => {
    try {
      const parsed = JSON.parse(draft);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return parsed;
    } catch (parseError) {
      return null;
    }
  };
  const submitManual = () => {
    const payload = parsedDraft();
    // the repository refuses an unusable payload too; reaching that refusal by pressing a button
    // that looked ready is the part this stops
    if (!payload) { setError("อ่านค่าไม่ได้ — ต้องเป็น JSON ของ record นี้"); return; }
    setError(null);
    onResolve(conflict, { strategy: "manual", payload });
  };

  // z-85: above the update banner (z-80). On a phone this sheet is bottom-anchored and the banner
  // sits at `bottom-20`, so a build deployed mid-shift covered the buttons a crew was deciding on.
  return (
    <div className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center print:hidden">
      <div className="absolute inset-0 bg-navy-dark/45" onClick={onClose} />
      <div className="relative bg-surface rounded-t-modal sm:rounded-modal shadow-modal w-full sm:max-w-lg max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <div>
            <h3 className="font-semibold text-ink">ข้อมูลขัดแย้งกับเซิร์ฟเวอร์</h3>
            <div className="text-xs text-ink-2 font-mono">
              {conflict.entityType} · {conflict.machine} · {conflict.recordId}
              <span className="text-ink-3"> · {conflict.requestId}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} title="ปิด" className="p-1.5 rounded-input text-ink-3 hover:bg-surface-alt"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-ink-3 text-left">
                <th className="py-1 font-semibold">ฟิลด์</th>
                <th className="py-1 font-semibold">ในเครื่องนี้</th>
                <th className="py-1 font-semibold">บนเซิร์ฟเวอร์</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const differs = show(row.local) !== show(row.server);
                return (
                  <tr key={row.key} data-differs={differs ? "true" : "false"} className={differs ? "bg-code-c/10" : ""}>
                    <td className="py-1.5 pr-2 font-mono text-ink-2">{row.key}</td>
                    <td className={`py-1.5 pr-2 font-mono ${differs ? "text-ink font-semibold" : "text-ink-2"}`}>{show(row.local)}</td>
                    <td className={`py-1.5 font-mono ${differs ? "text-ink font-semibold" : "text-ink-2"}`}>{show(row.server)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {mode === "manual" && (
            <div className="mt-3">
              <label className="text-xs font-semibold text-ink-2 block mb-1">ค่าที่ถูกต้อง (JSON ของ record นี้)</label>
              <textarea
                value={draft}
                onChange={event => { setDraft(event.target.value); setError(null); }}
                rows={7}
                placeholder={'{"ringNo": "…"}'}
                className="w-full border border-line rounded-input px-3 py-2 text-xs font-mono bg-surface text-ink focus:outline-none focus:border-navy resize-none"
              />
              <div className="flex gap-2 mt-1">
                <button type="button" onClick={() => { setDraft(JSON.stringify(conflict.localRecord, null, 2)); setError(null); }} className="text-xs text-navy font-semibold">เริ่มจากค่าในเครื่องนี้</button>
                <button type="button" onClick={() => { setDraft(JSON.stringify(conflict.serverRecord, null, 2)); setError(null); }} className="text-xs text-navy font-semibold">เริ่มจากค่าบนเซิร์ฟเวอร์</button>
              </div>
              {error && <div className="text-xs text-code-d mt-1">{error}</div>}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-line space-y-2">
          {mode === "choose" && (
            <>
              <button type="button" onClick={() => onResolve(conflict, { strategy: "server" })} className="w-full px-4 py-2.5 rounded-input text-sm font-semibold bg-navy text-white">เก็บของเซิร์ฟเวอร์</button>
              <button type="button" onClick={() => onResolve(conflict, { strategy: "local" })} className="w-full px-4 py-2.5 rounded-input text-sm font-semibold border border-navy text-navy">เก็บของเครื่องนี้ (ส่งใหม่)</button>
              <button type="button" onClick={() => setMode("manual")} className="w-full px-4 py-2.5 rounded-input text-sm font-semibold text-ink-2 hover:bg-surface-alt">พิมพ์ค่าที่ถูกต้องเอง</button>
            </>
          )}
          {mode === "manual" && (
            <>
              {/* Disabled only while there is nothing to submit. A draft that cannot be READ is
                  enabled on purpose: the crew gets a reason rather than a button that quietly does
                  nothing while they hunt for the typo. */}
              <button
                type="button"
                onClick={submitManual}
                disabled={!draft.trim()}
                className="w-full px-4 py-2.5 rounded-input text-sm font-semibold bg-navy text-white disabled:opacity-50"
              >
                บันทึกค่าที่แก้
              </button>
              <button type="button" onClick={() => { setMode("choose"); setError(null); }} className="w-full px-4 py-2.5 rounded-input text-sm font-semibold text-ink-2 hover:bg-surface-alt">ย้อนกลับ</button>
            </>
          )}

          {!confirmingDiscard && (
            <button type="button" onClick={() => setConfirmingDiscard(true)} className="w-full px-4 py-2 rounded-input text-xs font-semibold text-code-d hover:bg-code-d/10">ทิ้งงานนี้</button>
          )}
          {confirmingDiscard && (
            <div className="rounded-input border border-code-d/40 bg-code-d/5 p-3">
              <div className="text-xs text-ink mb-2">{discardOutcomeText(conflict.operation)}</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => onDiscard(conflict)} className="flex-1 px-3 py-2 rounded-input text-xs font-semibold bg-code-d text-white">ยืนยันทิ้ง</button>
                <button type="button" onClick={() => setConfirmingDiscard(false)} className="flex-1 px-3 py-2 rounded-input text-xs font-semibold text-ink-2 border border-line">ยกเลิก</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
