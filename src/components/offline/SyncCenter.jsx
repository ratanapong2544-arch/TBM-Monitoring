import React, { useCallback, useEffect, useState } from "react";
import { X, RefreshCw } from "lucide-react";

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
const TABS = [
  { id: "pending", label: "กำลังส่ง" },
  { id: "stuck", label: "ติดค้าง" },
  { id: "conflicts", label: "ขัดแย้ง" },
  { id: "recent", label: "ส่งแล้ว" },
];

const stamp = value => {
  if (!value) return "";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" });
};

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

export default function SyncCenter({ open, onClose, summary, load, onSyncNow, onResolve, installPanel = null }) {
  const [tab, setTab] = useState("pending");
  const [view, setView] = useState({ pending: [], blocked: [], errors: [], conflicts: [], recent: [] });
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    if (!load) return;
    try { setView(await load()); } catch (error) { /* the panel must open even if the read fails */ }
  }, [load]);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  if (!open) return null;

  const syncNow = async () => {
    setSyncing(true);
    try { if (onSyncNow) await onSyncNow(); } finally { setSyncing(false); }
    await refresh();
  };

  const stuckRows = [...(view.errors || []), ...(view.blocked || [])];
  const counts = {
    pending: (view.pending || []).length,
    stuck: stuckRows.length,
    conflicts: (view.conflicts || []).length,
    recent: (view.recent || []).length,
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
              onClick={() => setTab(item.id)}
              className={`px-3 py-1.5 rounded-input text-xs font-semibold whitespace-nowrap transition-colors ${tab === item.id ? "bg-navy text-white" : "text-ink-2 hover:bg-surface-alt"}`}
            >
              {item.label}{counts[item.id] ? ` (${counts[item.id]})` : ""}
            </button>
          ))}
        </div>

        <ul className="flex-1 overflow-y-auto">
          {tab === "pending" && ((view.pending || []).length
            ? view.pending.map(row => (
              // "saved on this device" is not "on the sheet", and the whole branch turns on the crew
              // being told which one they have.
              <Row key={row.requestId} row={row} note="บันทึกในเครื่องแล้ว · รอส่งขึ้นเซิร์ฟเวอร์" />
            ))
            : <Empty>ไม่มีรายการรอส่ง</Empty>)}

          {tab === "stuck" && (stuckRows.length
            ? stuckRows.map(row => (
              <Row
                key={row.requestId}
                row={row}
                tone="text-code-d"
                note={row.lastError && row.lastError.message
                  ? `เซิร์ฟเวอร์ปฏิเสธ: ${row.lastError.message}`
                  : "รออยู่หลังรายการที่ติดค้างของ record เดียวกัน — จะไม่ถูกส่งจนกว่าตัวหน้าจะแก้"}
              />
            ))
            : <Empty>ไม่มีรายการติดค้าง</Empty>)}

          {tab === "conflicts" && ((view.conflicts || []).length
            ? view.conflicts.map(conflict => (
              <Row key={conflict.conflictId} row={conflict} tone="text-code-c" note={`เซิร์ฟเวอร์แก้ไปแล้ว (เวอร์ชัน ${conflict.currentVersion ?? "-"})`}>
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
                {onResolve && (
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

          {tab === "recent" && ((view.recent || []).length
            ? view.recent.map(row => (
              <Row key={row.requestId} row={row} tone="text-code-a" note={`ซิงก์สำเร็จ ${stamp(row.confirmedAtLocal)}${row.version != null ? ` · เวอร์ชัน ${row.version}` : ""}`} />
            ))
            : <Empty>ยังไม่มีรายการที่ส่งสำเร็จ</Empty>)}
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
