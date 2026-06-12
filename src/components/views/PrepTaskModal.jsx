import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import Button from "../../ui-ux-pro-max/components/Button";
import { wouldCreateCycle } from "../../utils/prepForecast";
import { wouldCreateParentCycle } from "../../utils/prepTree";

const EMPTY = { name: "", start: "", end: "", percent: 0, milestone: false, deps: [], parentId: "" };

export default function PrepTaskModal({ open, initial, tasks = [], onSubmit, onDelete, onClose }) {
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
      deps: Array.isArray(initial.deps) ? initial.deps.map((d) => ({ ...d })) : [],
      parentId: initial.parentId ?? "",
    } : EMPTY);
  }, [open, initial]);

  if (!open) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const isParentOf = (id) => tasks.some((x) => x.parentId === id);
  const hasChildren = !!form.id && isParentOf(form.id);

  const depOptions = (currentId) =>
    tasks.filter((t) => t.id !== form.id && (t.id === currentId || (!isParentOf(t.id) && !wouldCreateCycle(tasks, form.id, t.id))));
  const setDep = (i, k, v) => setForm((f) => ({ ...f, deps: f.deps.map((d, j) => (j === i ? { ...d, [k]: v } : d)) }));
  const addDep = () => setForm((f) => ({ ...f, deps: [...f.deps, { id: "", type: "FS", lag: 0 }] }));
  const delDep = (i) => setForm((f) => ({ ...f, deps: f.deps.filter((_, j) => j !== i) }));
  // งานแม่ที่เลือกได้: ไม่ใช่ตัวเอง/ลูกหลานตัวเอง/milestone
  const parentOptions = tasks.filter((t) => t.id !== form.id && !t.milestone && !wouldCreateParentCycle(tasks, form.id, t.id));

  const submit = () => {
    if (!form.name.trim()) { setErr("กรุณากรอกชื่องาน"); return; }
    if (!hasChildren && !form.start) { setErr("กรุณาเลือกวันเริ่ม"); return; }
    if (!form.milestone && form.end && form.end < form.start) { setErr("วันจบต้องไม่ก่อนวันเริ่ม"); return; }
    if (form.deps.some((d) => !d.id)) { setErr("กรุณาเลือกงานก่อนหน้าให้ครบทุกแถว"); return; }
    const ids = form.deps.map((d) => d.id);
    if (ids.some((id, i) => ids.indexOf(id) !== i)) { setErr("เลือกงานก่อนหน้าซ้ำกัน"); return; }
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

          {parentOptions.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">อยู่ภายใต้งาน (งานแม่)</label>
              <select value={form.parentId} onChange={(e) => set("parentId", e.target.value)} className={inputCls}>
                <option value="">— ไม่มี (งานหลัก) —</option>
                {parentOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          {hasChildren && (
            <p className="text-xs text-ink-3 bg-cyan-vtint rounded-input px-3 py-2">วันที่ ความคืบหน้า และงานก่อนหน้า คำนวณจากงานย่อยอัตโนมัติ</p>
          )}
          {!hasChildren && (
            <>
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

              {tasks.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1">งานก่อนหน้า (predecessor)</label>
                  {form.deps.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 mb-2">
                      <select value={d.id} onChange={(e) => setDep(i, "id", e.target.value)} className={`${inputCls} flex-1 min-w-0`}>
                        <option value="">— เลือกงาน —</option>
                        {depOptions(d.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <select value={d.type} onChange={(e) => setDep(i, "type", e.target.value)} className={`${inputCls} w-20 shrink-0`}>
                        {["FS", "SS", "FF", "SF"].map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                      <input type="number" value={d.lag} onChange={(e) => setDep(i, "lag", e.target.value)} className={`${inputCls} w-16 shrink-0`} title="lag (วัน, ติดลบได้)" />
                      <button onClick={() => delDep(i)} className="p-1 rounded-input text-ink-3 hover:bg-cyan-tint shrink-0"><X size={14} /></button>
                    </div>
                  ))}
                  <button onClick={addDep} className="text-xs font-semibold text-navy hover:underline">+ เพิ่มงานก่อนหน้า</button>
                  {form.deps.length > 0 && (
                    <p className="text-[10px] text-ink-3 mt-1">FS จบ→เริ่ม · SS เริ่มพร้อมกัน · FF จบพร้อมกัน · SF เริ่ม→จบ · lag = วัน (ติดลบได้)</p>
                  )}
                </div>
              )}

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
            </>
          )}

          {err && <p className="text-[11px] text-code-d">{err}</p>}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-line">
          {form.id && (
            <Button variant="secondary" className="text-code-d" disabled={hasChildren} title={hasChildren ? "ย้าย/ลบงานย่อยออกก่อน" : undefined} onClick={() => !hasChildren && onDelete(form.id)}>ลบ</Button>
          )}
          <Button variant="secondary" className="flex-1" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" className="flex-1" onClick={submit}>{form.id ? "บันทึก" : "เพิ่ม"}</Button>
        </div>
      </div>
    </div>
  );
}
