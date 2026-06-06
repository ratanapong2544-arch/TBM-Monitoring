import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import Button from "../../ui-ux-pro-max/components/Button";

const EMPTY = { name: "", start: "", end: "", percent: 0, milestone: false };

export default function PrepTaskModal({ open, initial, onSubmit, onDelete, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setErr("");
    setForm(initial ? {
      id: initial.id,
      name: initial.name ?? "",
      start: initial.start ?? "",
      end: initial.end ?? "",
      percent: initial.percent ?? 0,
      milestone: !!initial.milestone,
    } : EMPTY);
  }, [open, initial]);

  if (!open) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = () => {
    if (!form.name.trim()) { setErr("กรุณากรอกชื่องาน"); return; }
    if (!form.start) { setErr("กรุณาเลือกวันเริ่ม"); return; }
    if (!form.milestone && form.end && form.end < form.start) { setErr("วันจบต้องไม่ก่อนวันเริ่ม"); return; }
    onSubmit(form);
  };
  const inputCls = "w-full border border-line rounded-input px-3 py-2 text-sm bg-surface text-ink focus:outline-none focus:border-navy";

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center print:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-navy-dark/35" />
      <div className="relative bg-surface rounded-t-modal sm:rounded-modal shadow-modal w-full sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="text-base font-semibold text-ink">{form.id ? "แก้ไขงาน" : "เพิ่มงาน"}</h3>
          <button onClick={onClose} className="p-1 rounded-input text-ink-3 hover:bg-cyan-tint"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1">ชื่องาน *</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="เช่น ประกอบหัวเจาะ / สร้าง launch shaft" className={inputCls} />
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-cyan-med">
            <input type="checkbox" checked={form.milestone} onChange={(e) => set("milestone", e.target.checked)} />
            ◆ เป็น milestone (จุดสำคัญวันเดียว)
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">{form.milestone ? "วันที่ *" : "เริ่ม *"}</label>
              <input type="date" value={form.start} onChange={(e) => set("start", e.target.value)} className={inputCls} />
            </div>
            {!form.milestone && (
              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1">จบ</label>
                <input type="date" value={form.end} onChange={(e) => set("end", e.target.value)} className={inputCls} />
              </div>
            )}
          </div>

          {form.milestone ? (
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" checked={Number(form.percent) >= 100} onChange={(e) => set("percent", e.target.checked ? 100 : 0)} />
              เสร็จแล้ว
            </label>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">ความคืบหน้า: {form.percent}%</label>
              <input type="range" min="0" max="100" step="5" value={form.percent} onChange={(e) => set("percent", Number(e.target.value))} className="w-full" />
            </div>
          )}

          {err && <p className="text-[11px] text-code-d">{err}</p>}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-line">
          {form.id && <Button variant="secondary" className="text-code-d" onClick={() => onDelete(form.id)}>ลบ</Button>}
          <Button variant="secondary" className="flex-1" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" className="flex-1" onClick={submit}>{form.id ? "บันทึก" : "เพิ่ม"}</Button>
        </div>
      </div>
    </div>
  );
}
