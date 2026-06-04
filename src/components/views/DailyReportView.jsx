import React, { useState } from "react";
import { ClipboardList, Plus, Pencil, Trash2, X, Save, AlertTriangle } from "lucide-react";
import SectionHeader from "../common/SectionHeader";
import { formatDisplayDate } from "../../utils/formatters";
import { MACHINES, newDailyReport, newItem, itemPercent, validateReport, sortReports } from "../../utils/dailyReports";

const MACHINE_BADGE = {
  TBM1: "bg-navy/10 text-navy border-navy/20",
  TBM2: "bg-cyan-tint text-cyan-med border-cyan-med/30",
};

export default function DailyReportView({ dailyReports = [], onSave, onDelete }) {
  const [machineFilter, setMachineFilter] = useState("All");
  const [modal, setModal] = useState({ open: false, form: null });

  const list = sortReports(dailyReports, machineFilter);

  const openNew = () => setModal({ open: true, form: newDailyReport(machineFilter === "TBM2" ? "TBM2" : "TBM1") });
  const openEdit = (r) => setModal({ open: true, form: { ...r, items: r.items.map((it) => ({ ...it, done: it.done ?? "", total: it.total ?? "" })) } });
  const close = () => setModal({ open: false, form: null });

  const form = modal.form;
  const valid = form ? validateReport(form).valid : false;
  const setForm = (patch) => setModal((m) => ({ ...m, form: { ...m.form, ...patch } }));
  const setItem = (id, patch) => setForm({ items: form.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  const addItem = () => setForm({ items: [...form.items, newItem()] });
  const removeItem = (id) => setForm({ items: form.items.filter((it) => it.id !== id) });
  const submit = () => { if (valid) { onSave(form); close(); } };

  return (
    <div className="max-w-full mx-auto pb-24 animate-fade-in space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <SectionHeader title="บันทึกประจำวัน" subtitle="Daily Report" icon={ClipboardList} />
        <div className="flex items-center gap-2 shrink-0 print:hidden">
          <div className="flex bg-surface-alt border border-line rounded-input p-1">
            {["All", ...MACHINES].map((m) => (
              <button key={m} onClick={() => setMachineFilter(m)} className={`px-3 py-1.5 text-xs font-semibold rounded-input transition ${machineFilter === m ? "bg-navy text-white shadow" : "text-ink-2 hover:bg-surface"}`}>{m === "All" ? "ทั้งหมด" : m}</button>
            ))}
          </div>
          <button onClick={openNew} className="inline-flex items-center gap-1.5 bg-navy hover:bg-navy-deepest text-white text-sm font-semibold px-3.5 py-2 rounded-input transition-colors"><Plus size={16} /> บันทึกใหม่</button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="bg-surface rounded-card border border-line shadow-card p-12 text-center text-ink-3 text-sm">ยังไม่มีรายงาน — กด "บันทึกใหม่" เพื่อเริ่ม</div>
      ) : (
        <div className="space-y-4">
          {list.map((r) => (
            <div key={r.id} className="bg-surface rounded-card border border-line shadow-card p-5">
              <div className="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-line">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-badge border ${MACHINE_BADGE[r.machine] || MACHINE_BADGE.TBM1}`}>{r.machine}</span>
                  <span className="font-semibold text-ink">{formatDisplayDate(r.date)}</span>
                  {r.driveShaft && <span className="text-xs text-ink-3">· {r.driveShaft}</span>}
                  {r.weather && <span className="text-xs text-ink-3">· {r.weather}</span>}
                </div>
                <div className="flex items-center gap-1 shrink-0 print:hidden">
                  <button onClick={() => openEdit(r)} className="p-1.5 text-ink-3 hover:text-navy hover:bg-surface-alt rounded-input transition-colors" title="แก้ไข"><Pencil size={15} /></button>
                  <button onClick={() => onDelete(r.id)} className="p-1.5 text-ink-3 hover:text-code-d hover:bg-code-d/10 rounded-input transition-colors" title="ลบ"><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="space-y-2.5">
                {r.items.map((it) => {
                  const pct = itemPercent(it);
                  return (
                    <div key={it.id}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-ink">{it.title}</span>
                        {pct !== null && <span className="text-xs font-semibold font-mono text-ink-2 shrink-0">{it.done}/{it.total} · {pct}%</span>}
                      </div>
                      {it.note && <div className="text-xs text-ink-3 mt-0.5">{it.note}</div>}
                      {pct !== null && (
                        <div className="mt-1 h-1.5 bg-surface-alt rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pct >= 100 ? "bg-sgreen-dark" : "bg-navy"}`} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {r.problems && (
                <div className="mt-3 flex items-start gap-2 bg-code-d/10 border border-code-d/20 rounded-input p-3 text-sm">
                  <AlertTriangle size={15} className="text-code-d shrink-0 mt-0.5" />
                  <span className="text-ink-2 whitespace-pre-wrap">{r.problems}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal.open && form && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-navy-dark/60 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-surface rounded-modal w-full max-w-xl shadow-modal overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-navy-dark px-6 py-4 text-white flex justify-between items-center shrink-0">
              <h3 className="font-semibold text-lg flex items-center gap-2"><ClipboardList size={20} /> {form.id ? "แก้ไขรายงาน" : "บันทึกประจำวันใหม่"}</h3>
              <button onClick={close} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-ink-2 block mb-1">เครื่อง</label>
                  <select value={form.machine} onChange={(e) => setForm({ machine: e.target.value })} className="w-full bg-surface border border-line rounded-input p-2 text-sm text-ink outline-none focus:border-navy">
                    {MACHINES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-ink-2 block mb-1">วันที่</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({ date: e.target.value })} className="w-full bg-surface border border-line rounded-input p-2 text-sm text-ink outline-none focus:border-navy" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-ink-2 block mb-1">Drive Shaft (ไม่บังคับ)</label>
                  <input type="text" value={form.driveShaft} onChange={(e) => setForm({ driveShaft: e.target.value })} placeholder="เช่น IS4 → OS1" className="w-full bg-surface border border-line rounded-input p-2 text-sm text-ink outline-none focus:border-navy" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-ink-2 block mb-1">สภาพอากาศ (ไม่บังคับ)</label>
                  <input type="text" value={form.weather} onChange={(e) => setForm({ weather: e.target.value })} placeholder="เช่น แจ่มใส" className="w-full bg-surface border border-line rounded-input p-2 text-sm text-ink outline-none focus:border-navy" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-ink-2">รายการงาน</label>
                  <button onClick={addItem} className="text-navy hover:text-navy-deepest bg-cyan-tint px-2.5 py-1 rounded-input text-xs font-semibold flex items-center gap-1"><Plus size={13} /> เพิ่มรายการ</button>
                </div>
                <div className="space-y-2">
                  {form.items.map((it) => (
                    <div key={it.id} className="bg-surface-alt border border-line rounded-input p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input type="text" value={it.title} onChange={(e) => setItem(it.id, { title: e.target.value })} placeholder="หัวข้องาน" className="flex-1 bg-surface border border-line rounded-input p-1.5 text-sm text-ink outline-none focus:border-navy" />
                        <button onClick={() => removeItem(it.id)} className="p-1.5 text-code-d hover:bg-code-d/10 rounded-input shrink-0"><Trash2 size={15} /></button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="number" value={it.done} onChange={(e) => setItem(it.id, { done: e.target.value })} placeholder="ทำได้" className="w-20 bg-surface border border-line rounded-input p-1.5 text-xs font-mono text-center text-ink outline-none focus:border-navy" />
                        <span className="text-ink-3 text-xs">/</span>
                        <input type="number" value={it.total} onChange={(e) => setItem(it.id, { total: e.target.value })} placeholder="ทั้งหมด" className="w-20 bg-surface border border-line rounded-input p-1.5 text-xs font-mono text-center text-ink outline-none focus:border-navy" />
                        <input type="text" value={it.note} onChange={(e) => setItem(it.id, { note: e.target.value })} placeholder="โน้ต (ไม่บังคับ)" className="flex-1 bg-surface border border-line rounded-input p-1.5 text-xs text-ink outline-none focus:border-navy" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-ink-2 block mb-1">ปัญหา / อุปสรรค</label>
                <textarea value={form.problems} onChange={(e) => setForm({ problems: e.target.value })} rows={3} placeholder="เช่น ผู้รับจ้างมีคนงานไม่เพียงพอ" className="w-full bg-surface border border-line rounded-input p-2 text-sm text-ink outline-none focus:border-navy resize-none" />
              </div>
            </div>
            <div className="p-4 bg-surface-alt border-t border-line flex justify-end gap-2 shrink-0">
              <button onClick={close} className="px-5 py-2.5 bg-surface text-ink-2 rounded-input text-sm font-semibold border border-line hover:bg-surface-alt shadow-card">ยกเลิก</button>
              <button onClick={submit} disabled={!valid} className="px-5 py-2.5 bg-navy text-white rounded-input text-sm font-semibold shadow-hover hover:opacity-90 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"><Save size={16} /> บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
