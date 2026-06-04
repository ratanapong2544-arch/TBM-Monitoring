import React, { useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import SectionHeader from "../common/SectionHeader";
import { MACHINES, prefillFromLatest, sortReports } from "../../utils/dailyReports";
import DailyReportCard from "../dailyreport/DailyReportCard";
import DailyReportForm from "../dailyreport/DailyReportForm";

// แปลง report (number|null) → form (string "") สำหรับ binding
const mapVals = (o) => {
  const out = {};
  Object.keys(o || {}).forEach((k) => { out[k] = o[k] == null ? "" : String(o[k]); });
  return out;
};
const toForm = (r) => ({
  ...r,
  equipment: mapVals(r.equipment),
  labor: mapVals(r.labor),
  workLog:
    (r.workLog && r.workLog.length ? r.workLog : [{ id: `it_${Date.now()}`, title: "", done: "", total: "", note: "" }])
      .map((it) => ({ ...it, done: it.done ?? "", total: it.total ?? "" })),
});

export default function DailyReportView({ dailyReports = [], onSave, onDelete }) {
  const [machineFilter, setMachineFilter] = useState("All");
  const [editing, setEditing] = useState(null); // { form, carriedKeys } | null

  const list = sortReports(dailyReports, machineFilter);

  const openNew = () => {
    const machine = machineFilter === "TBM2" ? "TBM2" : "TBM1";
    const pre = prefillFromLatest(dailyReports, { machine });
    // carriedKeys = key เครื่องจักร/แรงงานที่ถูกเติมจากใบล่าสุด (ค่าไม่ว่าง) → ไฮไลต์ฟ้าในฟอร์ม
    const carried = new Set();
    Object.entries(pre.equipment).forEach(([k, v]) => { if (v !== "") carried.add(k); });
    Object.entries(pre.labor).forEach(([k, v]) => { if (v !== "") carried.add(k); });
    setEditing({ form: pre, carriedKeys: carried });
  };
  const openEdit = (r) => setEditing({ form: toForm(r), carriedKeys: new Set() });
  const close = () => setEditing(null);
  const save = (form) => { onSave(form); close(); };

  if (editing) {
    return (
      <div className="max-w-[1100px] mx-auto pb-24 animate-fade-in">
        <DailyReportForm initial={editing.form} carriedKeys={editing.carriedKeys} onCancel={close} onSave={save} />
      </div>
    );
  }

  return (
    <div className="max-w-full mx-auto pb-24 animate-fade-in space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <SectionHeader title="บันทึกประจำวัน" subtitle="Daily Site Report" icon={ClipboardList} />
        <div className="flex items-center gap-2 shrink-0 print:hidden">
          <div className="flex bg-surface-alt border border-line rounded-input p-1">
            {["All", ...MACHINES].map((m) => (
              <button key={m} onClick={() => setMachineFilter(m)} className={`px-3 py-1.5 text-xs font-semibold rounded-input transition ${machineFilter === m ? "bg-navy text-white shadow" : "text-ink-2 hover:bg-surface"}`}>{m === "All" ? "ทั้งหมด" : m}</button>
            ))}
          </div>
          <span className="text-xs text-ink-3">แสดง {list.length} รายการ</span>
          <button onClick={openNew} className="inline-flex items-center gap-1.5 bg-navy hover:bg-navy-deepest text-white text-sm font-semibold px-3.5 py-2 rounded-input transition-colors"><Plus size={16} /> บันทึกใหม่</button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="bg-surface rounded-card border border-line shadow-card p-12 text-center text-ink-3 text-sm">ยังไม่มีรายงาน — กด "บันทึกใหม่" เพื่อเริ่ม</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {list.map((r) => (
            <DailyReportCard key={r.id} report={r} onOpen={openEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
