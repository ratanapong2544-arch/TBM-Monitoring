import React, { useCallback, useEffect, useState } from "react";
import { X, RefreshCw, RotateCcw, Trash2, Pencil } from "lucide-react";

import { formatDisplayDate, formatDisplayTime } from "../../utils/formatters";
import { discardOutcomeText, formatSyncStamp } from "../../offline/syncSummary";

/**
 * Where a write that has not reached the sheet is looked at, and the only screen that can tell a
 * crew why.
 *
 * Four tabs, and the split between them is the point rather than a layout: what is on its way needs
 * patience; what is stuck needs a person; a conflict needs a decision; what has landed is the
 * receipt. A stranded record sits with the stuck ones, because it is never posted while the head of
 * its record is refused — putting it under "กำลังส่ง" would be a lie the crew waits on.
 *
 * Every row names its record. `Step 4`: never hide the record identifier, machine, entity type or
 * request id in diagnostic detail.
 */
// The plan's four: pending, errors, conflicts, recent. `errors` also carries the rows stranded
// behind a refused head — stuck for the same reason and cleared by the same fix — but labelled as
// waiting on another record rather than as refused themselves.
const TABS = [
  { id: "pending", label: "กำลังส่ง" },
  { id: "errors", label: "ติดค้าง" },
  { id: "conflicts", label: "ขัดแย้ง" },
  { id: "recent", label: "ประวัติ" },
];

const stamp = value => formatSyncStamp(value, { formatDate: formatDisplayDate, formatTime: formatDisplayTime });

function RecordLine({ row }) {
  return (
    <div className="text-xs text-ink-2 font-mono">
      {row.entityType} · {row.machine} · {row.recordId}
      <span className="text-ink-3"> · {row.requestId}</span>
    </div>
  );
}

function Row({ row, note, tone = "text-ink", children }) {
  return (
    <li className="px-3 py-2.5 border-b border-line last:border-0">
      <div className={`text-sm font-semibold ${tone}`}>{row.recordId}</div>
      <RecordLine row={row} />
      {note && <div className="text-xs text-ink-2 mt-1">{note}</div>}
      {children}
    </li>
  );
}

function Empty({ children }) {
  return <li className="px-3 py-6 text-sm text-ink-3 text-center">{children}</li>;
}

/**
 * The values the server refused, in front of the crew, so they can be corrected and sent again.
 *
 * `repository.retryMutation` already takes a payload and re-checks that it still names the same
 * record; without a way to reach it, a validation error had exactly two outcomes — resend the
 * refused values, or destroy the record on this device.
 */
function PayloadEditor({ payload, error, onCancel, onSubmit }) {
  const [draft, setDraft] = useState(() => JSON.stringify(payload, null, 2));
  const parsed = () => {
    try {
      const value = JSON.parse(draft);
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch (parseError) {
      return null;
    }
  };
  return (
    <div className="mt-2">
      <textarea
        value={draft}
        onChange={event => setDraft(event.target.value)}
        rows={6}
        className="w-full border border-line rounded-input px-2 py-1.5 text-xs font-mono bg-surface text-ink focus:outline-none focus:border-navy resize-none"
      />
      {error && <div className="text-xs text-code-d mt-1">{error}</div>}
      <div className="flex gap-2 mt-1.5">
        <button type="button" onClick={() => onSubmit(parsed())} disabled={!draft.trim()} className="px-3 py-1.5 rounded-input text-xs font-semibold bg-navy text-white disabled:opacity-50">ส่งค่าที่แก้</button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-input text-xs font-semibold text-ink-2 border border-line">ยกเลิก</button>
      </div>
    </div>
  );
}

export default function SyncCenter({ open, onClose, summary, load, onSyncNow, onResolve, onRetry, onDiscard, onReview, installPanel = null }) {
  const [tab, setTab] = useState("pending");
  const [view, setView] = useState({ pending: [], blocked: [], errors: [], conflicts: [], recent: [], superseded: [], discarded: [] });
  const [syncing, setSyncing] = useState(false);
  // Discard is the one destructive action here, so it takes a second deliberate tap — the same rule
  // the conflict resolver applies, for the same reason.
  const [confirmingDiscard, setConfirmingDiscard] = useState(null);
  // The values the crew is correcting, keyed by request id. A validation error is about THESE
  // values, so resending them unchanged is refused identically — the only way out that is not
  // destructive is to edit them.
  const [editing, setEditing] = useState(null);
  const [editError, setEditError] = useState(null);

  const [readError, setReadError] = useState(null);
  const refresh = useCallback(async () => {
    if (!load) return;
    // The panel must open even if the read fails — but it must not then say the queue is empty. That
    // is the state `openDb` rejects in (quota, private browsing, an upgrade blocked by another tab),
    // and the button beside it is still showing a count read before the failure.
    try { setView(await load()); setReadError(null); } catch (error) { setReadError(error); }
  }, [load]);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  // Re-read after anything that changes what this panel is showing. Without it a discarded row stays
  // listed with live buttons while the status button's count has already dropped: the two surfaces
  // disagree, and the second tap reaches a store guard that refuses it as "ยังไม่ติดค้าง".
  const act = async (action, ...args) => {
    if (!action) return;
    try { await action(...args); } finally { await refresh(); }
  };

  if (!open) return null;

  const syncNow = async () => {
    setSyncing(true);
    try { if (onSyncNow) await onSyncNow(); } finally { setSyncing(false); }
    await refresh();
  };

  // WHICH LIST a row came from, kept. `getSyncCenterView` has already answered "refused by the
  // server" vs "stranded behind one" — they are different stores of truth, `isRetryableErrorStatus`
  // and a blocked domain — and flattening the two threw that away, leaving the tab to guess from
  // `lastError`. `syncRunner` writes `lastError` onto rows it puts BACK to pending, so the guess
  // would label a stranded row "เซิร์ฟเวอร์ปฏิเสธ: <network message>" and offer it retry and edit,
  // which the store then refuses as "ยังไม่ติดค้าง".
  const stuckRows = [
    ...(view.errors || []).map(row => ({ row, refused: true })),
    ...(view.blocked || []).map(row => ({ row, refused: false })),
  ];
  const counts = {
    pending: (view.pending || []).length,
    errors: stuckRows.length,
    conflicts: (view.conflicts || []).length,
    // what the tab SHOWS, not one of the three groups on it — a badge reading none over a list of
    // rows is a badge the crew stops reading
    recent: (view.recent || []).length + (view.superseded || []).length + (view.discarded || []).length,
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center print:hidden">
      <div className="absolute inset-0 bg-navy-dark/35" onClick={onClose} />
      <div className="relative bg-surface rounded-t-modal sm:rounded-modal shadow-modal w-full sm:max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <div>
            <h3 className="font-semibold text-ink">สถานะการซิงก์</h3>
            <div className="text-xs text-ink-2">
              {summary && summary.online === false ? "ออฟไลน์ — งานที่บันทึกไว้จะส่งเมื่อกลับมาออนไลน์" : "ออนไลน์"}
              {summary && summary.lastSyncedAt ? ` · ซิงก์ล่าสุด ${stamp(summary.lastSyncedAt)}` : ""}
            </div>
          </div>
          <button type="button" onClick={onClose} title="ปิด" className="p-1.5 rounded-input text-ink-3 hover:bg-surface-alt"><X size={18} /></button>
        </div>

        <div className="flex gap-1 px-3 py-2 border-b border-line overflow-x-auto">
          {TABS.map(item => (
            <button
              key={item.id}
              type="button"
              data-tab={item.id}
              onClick={() => setTab(item.id)}
              className={`px-3 py-1.5 rounded-input text-xs font-semibold whitespace-nowrap transition-colors ${tab === item.id ? "bg-navy text-white" : "text-ink-2 hover:bg-surface-alt"}`}
            >
              {item.label}{counts[item.id] ? ` (${counts[item.id]})` : ""}
            </button>
          ))}
        </div>

        {readError && (
          <div className="px-4 py-3 text-xs text-code-d border-b border-line">
            อ่านคิวในเครื่องไม่ได้ — รายการด้านล่างอาจไม่ครบ: {readError.message || String(readError)}
          </div>
        )}
        <ul className="flex-1 overflow-y-auto">
          {tab === "pending" && ((view.pending || []).length
            ? view.pending.map(row => (
              // "saved on this device" is not "on the sheet", and the whole branch turns on the crew
              // being told which one they have. A row in flight says so, and one waiting says when it
              // will be tried again — "รอ" with no when is what makes a crew re-enter a record.
              <Row
                key={row.requestId}
                row={row}
                note={row.status === "syncing"
                  ? "บันทึกในเครื่องแล้ว · กำลังส่งอยู่"
                  : `บันทึกในเครื่องแล้ว · รอส่งขึ้นเซิร์ฟเวอร์${row.nextAttemptAt ? ` · ลองใหม่ ${stamp(row.nextAttemptAt)}` : ""}${row.attemptCount ? ` · พยายามแล้ว ${row.attemptCount} ครั้ง` : ""}`}
              />
            ))
            : <Empty>ไม่มีรายการรอส่ง</Empty>)}

          {tab === "errors" && (stuckRows.length
            ? stuckRows.map(({ row, refused }) => {
              return (
                <Row
                  key={row.requestId}
                  row={row}
                  tone="text-code-d"
                  note={refused
                    ? `เซิร์ฟเวอร์ปฏิเสธ: ${(row.lastError && row.lastError.message) || "ไม่ทราบสาเหตุ"}`
                    : "รออยู่หลังรายการที่ติดค้างของข้อมูลชุดเดียวกัน — จะไม่ถูกส่งจนกว่าตัวหน้าจะแก้"}
                >
                  {/* Which fields the server named. `syncRunner` stores them for exactly this, and
                      a message without them tells the crew something is wrong but not where. */}
                  {refused && row.lastError.fields && row.lastError.fields.length > 0 && (
                    <div className="text-xs text-code-d mt-1">ฟิลด์ที่ต้องแก้: {row.lastError.fields.join(", ")}</div>
                  )}
                  {refused && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {/* `retry` re-throws so the editor can keep a refused draft; a plain resend has
                          no draft to keep, so it swallows the rejection here rather than leaving one
                          unhandled. The crew has already been told by the alert. */}
                      {onRetry && (
                        <button type="button" onClick={() => { act(onRetry, row).catch(() => {}); }} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-input text-xs font-semibold border border-navy text-navy">
                          <RotateCcw size={13} /> ลองส่งใหม่
                        </button>
                      )}
                      {onRetry && row.payload && editing !== row.requestId && (
                        <button type="button" onClick={() => { setEditing(row.requestId); setEditError(null); }} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-input text-xs font-semibold border border-navy text-navy">
                          <Pencil size={13} /> แก้ค่าแล้วส่งใหม่
                        </button>
                      )}
                      {onDiscard && confirmingDiscard !== row.requestId && (
                        <button type="button" onClick={() => setConfirmingDiscard(row.requestId)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-input text-xs font-semibold text-code-d">
                          <Trash2 size={13} /> ทิ้งรายการนี้
                        </button>
                      )}
                    </div>
                  )}
                  {editing === row.requestId && (
                    <PayloadEditor
                      payload={row.payload}
                      error={editError}
                      onCancel={() => { setEditing(null); setEditError(null); }}
                      onSubmit={async payload => {
                        if (!payload) { setEditError("อ่านค่าไม่ได้ — ต้องเป็น JSON ของ record นี้"); return; }
                        setEditError(null);
                        // The editor stays open until the retry is ACCEPTED. Closing it first meant a
                        // refusal — a corrected payload that names a different record, which the
                        // store rejects — threw the crew's typing away and reopened the original.
                        // caught here, not swallowed upstream: a refusal keeps the editor open with
                        // the crew's typing in it, and `retry` has already said why
                        try {
                          await act(onRetry, row, { payload });
                          setEditing(null);
                        } catch (error) { /* the alert came from the seam; the draft stays */ }
                      }}
                    />
                  )}
                  {onDiscard && confirmingDiscard === row.requestId && (
                    <div className="mt-2 rounded-input border border-code-d/40 bg-code-d/5 p-2">
                      <div className="text-xs text-ink mb-2">{discardOutcomeText(row.operation, row.cascadeCount)}</div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setConfirmingDiscard(null); act(onDiscard, row); }} className="flex-1 px-3 py-1.5 rounded-input text-xs font-semibold bg-code-d text-white">ยืนยันทิ้ง</button>
                        <button type="button" onClick={() => setConfirmingDiscard(null)} className="flex-1 px-3 py-1.5 rounded-input text-xs font-semibold text-ink-2 border border-line">ยกเลิก</button>
                      </div>
                    </div>
                  )}
                </Row>
              );
            })
            : <Empty>ไม่มีรายการติดค้าง</Empty>)}

          {tab === "conflicts" && ((view.conflicts || []).length
            ? view.conflicts.map(conflict => (
              <Row
                key={conflict.conflictId}
                row={conflict}
                tone="text-code-c"
                note={`เซิร์ฟเวอร์แก้ไปแล้ว (เวอร์ชัน ${conflict.currentVersion ?? "-"})`
                  + (conflict.serverUpdatedAt ? ` · เมื่อ ${stamp(conflict.serverUpdatedAt)}` : "")
                  + (conflict.serverUpdatedByDevice ? ` · โดย ${conflict.serverUpdatedByDevice}` : "")
                  + (conflict.savedAtLocal ? ` · เครื่องนี้บันทึกไว้ ${stamp(conflict.savedAtLocal)}` : "")}
              >
                <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                  <div className="bg-surface-alt rounded-input p-2">
                    <div className="text-ink-3 mb-1">ในเครื่องนี้</div>
                    <pre className="whitespace-pre-wrap break-words text-ink">{JSON.stringify(conflict.localRecord, null, 1)}</pre>
                  </div>
                  <div className="bg-surface-alt rounded-input p-2">
                    <div className="text-ink-3 mb-1">บนเซิร์ฟเวอร์</div>
                    <pre className="whitespace-pre-wrap break-words text-ink">{JSON.stringify(conflict.serverRecord, null, 1)}</pre>
                  </div>
                </div>
                {/* A legacy staged difference has no mutation behind it: there is nothing to
                    resolve through the queue and nothing to discard, and offering either threw. It
                    is reviewed here and cleared by the next reconciliation. */}
                {!conflict.actionable && (
                  <div className="mt-2">
                    <div className="text-xs text-ink-2">ข้อมูลเดิมในเครื่องต่างจากเซิร์ฟเวอร์ — เทียบสองฝั่งด้านบน แล้วแก้ในหน้าบันทึกข้อมูลถ้าต้องแก้</div>
                    {onReview && (
                      <button type="button" onClick={() => act(onReview, conflict)} className="mt-2 px-3 py-1.5 rounded-input text-xs font-semibold border border-navy text-navy">
                        ตรวจแล้ว
                      </button>
                    )}
                  </div>
                )}
                {onResolve && conflict.actionable && (
                  <button
                    type="button"
                    onClick={() => onResolve(conflict)}
                    className="mt-2 px-3 py-1.5 rounded-input text-xs font-semibold bg-navy text-white"
                  >
                    เลือกว่าจะเก็บอันไหน
                  </button>
                )}
              </Row>
            ))
            : <Empty>ไม่มีรายการขัดแย้ง</Empty>)}

          {tab === "recent" && ((view.recent || []).length + (view.superseded || []).length + (view.discarded || []).length
            ? [
              ...(view.recent || []).map(row => (
                <Row key={row.requestId} row={row} tone="text-code-a" note={`ซิงก์สำเร็จ ${stamp(row.confirmedAtLocal)}${row.version != null ? ` · เวอร์ชัน ${row.version}` : ""}`} />
              )),
              // Replaced and thrown-away writes are history too, and each is its own fact. Neither
              // reached the sheet, so neither may borrow the word that means it did.
              ...(view.superseded || []).map(row => (
                <Row
                  key={row.requestId}
                  row={row}
                  tone="text-ink-2"
                  note={row.strategy === "server"
                    ? "เลือกเก็บของเซิร์ฟเวอร์ — ค่าที่บันทึกในเครื่องนี้ไม่ได้ถูกส่ง"
                    : `แทนที่ด้วยรายการใหม่${row.strategy ? ` (${row.strategy})` : ""}`}
                />
              )),
              ...(view.discarded || []).map(row => (
                <Row key={row.requestId} row={row} tone="text-ink-3" note={`ทิ้งโดยผู้ใช้${row.discardedAt ? ` ${stamp(row.discardedAt)}` : ""} — ไม่ได้ส่งขึ้นเซิร์ฟเวอร์`} />
              )),
            ]
            : <Empty>ยังไม่มีประวัติ</Empty>)}
        </ul>

        <div className="px-4 py-3 border-t border-line space-y-2">
          {/* Beside the offline explanation rather than on a settings page: the crew reads about
              installing at the moment they are looking at why a write has not gone. */}
          {installPanel}
          <button
            type="button"
            onClick={syncNow}
            disabled={syncing}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-input text-sm font-semibold bg-navy text-white disabled:opacity-50"
          >
            <RefreshCw size={16} /> {syncing ? "กำลังซิงก์…" : "ซิงก์ตอนนี้"}
          </button>
        </div>
      </div>
    </div>
  );
}
