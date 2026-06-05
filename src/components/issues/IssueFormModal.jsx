import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import Button from "../../ui-ux-pro-max/components/Button";
import { SEVERITY, SEVERITY_ORDER, validateForm } from "../../utils/issues";

const EMPTY = { title: "", severity: "delay", qtyEnabled: false, qtyCurrent: "", qtyTarget: "", qtyUnit: "", qtyAuto: false, qtyOffset: "", date: "", detail: "", ringCH: "" };

export default function IssueFormModal({ open, initial, onSubmit, onClose, currentRingNum = 0 }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(initial ? {
      id: initial.id,
      title: initial.title,
      severity: initial.severity,
      qtyEnabled: !!initial.qtyEnabled,
      qtyCurrent: initial.qtyCurrent ?? "",
      qtyTarget: initial.qtyTarget ?? "",
      qtyUnit: initial.qtyUnit ?? "",
      qtyAuto: !!initial.qtyAuto,
      qtyOffset: initial.qtyOffset ?? "",
      date: initial.date ?? "",
      detail: initial.detail ?? "",
      ringCH: initial.ringCH ?? "",
    } : EMPTY);
  }, [open, initial]);

  if (!open) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = () => {
    const res = validateForm(form);
    setErrors(res.errors);
    if (res.valid) onSubmit(form);
  };

  const inputCls = "w-full border border-line rounded-input px-3 py-2 text-sm bg-surface text-ink focus:outline-none focus:border-navy";

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center print:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-navy-dark/35" />
      <div className="relative bg-surface rounded-t-modal sm:rounded-modal shadow-modal w-full sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line sticky top-0 bg-surface z-10">
          <h3 className="text-base font-semibold text-ink">{form.id ? "แก้ไขปัญหา" : "เพิ่มปัญหา"}</h3>
          <button onClick={onClose} className="p-1 rounded-input text-ink-3 hover:bg-cyan-tint"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1">หัวข้อปัญหา *</label>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="เช่น ติดตั้ง Platform ทางเดิน" className={inputCls} />
            {errors.title && <p className="text-[11px] text-code-d mt-1">{errors.title}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1">ระดับ *</label>
            <div className="flex gap-2">
              {SEVERITY_ORDER.map((key) => (
                <button key={key} type="button" onClick={() => set("severity", key)}
                  className={`flex-1 text-xs font-semibold py-2 rounded-input border transition-colors ${form.severity === key ? "bg-navy text-white border-navy" : "bg-surface text-ink-2 border-line hover:bg-cyan-tint"}`}>
                  {SEVERITY[key].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-ink-2 mb-1">
              <input type="checkbox" checked={form.qtyEnabled} onChange={(e) => set("qtyEnabled", e.target.checked)} />
              เก็บปริมาณ (ทำได้ / เป้า)
            </label>
            {form.qtyEnabled && (
              <div className="mt-1 space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-cyan-med">
                  <input type="checkbox" checked={form.qtyAuto} onChange={(e) => set("qtyAuto", e.target.checked)} />
                  🔄 ติดตามวงปัจจุบันอัตโนมัติ
                </label>
                {form.qtyAuto ? (
                  <>
                    <div className="flex items-center gap-2 text-sm text-ink-2 flex-wrap">
                      <span className="text-ink-3 shrink-0">วงปัจจุบัน {currentRingNum} +</span>
                      <input type="number" value={form.qtyOffset} onChange={(e) => set("qtyOffset", e.target.value)} placeholder="0" className={`${inputCls} w-20 text-center`} />
                      <span className="shrink-0">= ทำได้ <b className="text-navy">{Math.max(0, currentRingNum + (Number(form.qtyOffset) || 0))}</b></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-ink-3 text-sm shrink-0">เป้า</span>
                      <input type="number" value={form.qtyTarget} onChange={(e) => set("qtyTarget", e.target.value)} placeholder="450" className={`${inputCls} text-center`} />
                      <input value={form.qtyUnit} onChange={(e) => set("qtyUnit", e.target.value)} placeholder="วง" className={`${inputCls} w-24`} />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <input type="number" value={form.qtyCurrent} onChange={(e) => set("qtyCurrent", e.target.value)} placeholder="350" className={`${inputCls} text-center`} />
                    <span className="text-ink-3">/</span>
                    <input type="number" value={form.qtyTarget} onChange={(e) => set("qtyTarget", e.target.value)} placeholder="450" className={`${inputCls} text-center`} />
                    <input value={form.qtyUnit} onChange={(e) => set("qtyUnit", e.target.value)} placeholder="วง" className={`${inputCls} w-24`} />
                  </div>
                )}
              </div>
            )}
            {(errors.qtyCurrent || errors.qtyTarget) && <p className="text-[11px] text-code-d mt-1">{errors.qtyCurrent || errors.qtyTarget}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">วันที่</label>
              <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Ring / CH</label>
              <input value={form.ringCH} onChange={(e) => set("ringCH", e.target.value)} placeholder="Ring 412" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1">รายละเอียด</label>
            <textarea value={form.detail} onChange={(e) => set("detail", e.target.value)} rows={2} placeholder="สาเหตุ / ผู้รับผิดชอบ…" className={`${inputCls} resize-none`} />
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-line sticky bottom-0 bg-surface">
          <Button variant="secondary" className="flex-1" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" className="flex-1" onClick={submit}>{form.id ? "บันทึก" : "เพิ่ม"}</Button>
        </div>
      </div>
    </div>
  );
}
