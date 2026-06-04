import React, { useState } from "react";
import { ChevronDown, Plus, Trash2, X, Save, FileText } from "lucide-react";
import { EQUIPMENT, LABOR } from "../../utils/dailyReportSchema";
import { MACHINES, newItem, itemPercent, validateReport } from "../../utils/dailyReports";
import CountGrid from "./CountGrid";
import WeatherGrid from "./WeatherGrid";

function Section({ title, hint, status, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-line-divider">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-1 py-3 text-left">
        <ChevronDown size={16} className={`text-ink-3 transition-transform ${open ? "" : "-rotate-90"}`} />
        <h3 className="text-sm font-bold text-navy">{title}</h3>
        {hint && <span className="text-xs text-ink-3 font-normal">{hint}</span>}
        {status && (
          <span className={`ml-auto text-[10.5px] font-semibold rounded-full px-2 py-0.5 ${status.done ? "bg-sgreen-dark/10 text-sgreen-dark" : "bg-line text-ink-3"}`}>
            {status.label}
          </span>
        )}
      </button>
      {open && <div className="pb-4 px-1">{children}</div>}
    </div>
  );
}

const countFilled = (vals) => Object.values(vals).filter((v) => v !== "" && v != null).length;
const sumCounts = (vals) => Object.values(vals).reduce((s, v) => s + (Number(v) || 0), 0);

export default function DailyReportForm({ initial, carriedKeys, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setCount = (group, key, val) => setForm((f) => ({ ...f, [group]: { ...f[group], [key]: val } }));
  const setWeather = (slot, cond) => setForm((f) => ({ ...f, weather: { ...f.weather, [slot]: cond } }));
  const setItem = (id, patch) => set({ workLog: form.workLog.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  const addItem = () => set({ workLog: [...form.workLog, newItem()] });
  const removeItem = (id) => set({ workLog: form.workLog.filter((it) => it.id !== id) });

  const valid = validateReport(form).valid;
  const eqFilled = countFilled(form.equipment);
  const lbFilled = countFilled(form.labor);
  const wxFilled = Object.values(form.weather).some((v) => v);

  const inputCls = "w-full bg-surface border border-line-input rounded-input px-3 py-2 text-sm text-ink outline-none focus:border-navy";

  return (
    <div className="bg-surface rounded-card border border-line shadow-card overflow-hidden">
      {/* header */}
      <div className="bg-navy-dark px-5 py-4 text-white flex items-center justify-between">
        <h2 className="font-semibold text-lg">{form.id ? "แก้ไขรายงานประจำวัน" : (form.kind === "excavation" ? "บันทึกประจำวัน (งานขุดเจาะ)" : "บันทึกประจำวันใหม่")}</h2>
        <button type="button" onClick={onCancel} className="p-2 bg-white/10 hover:bg-white/20 rounded-full"><X size={18} /></button>
      </div>

      {/* meta */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-5 py-4 bg-surface-alt border-b border-line">
        <div className="sm:col-span-1">
          <label className="text-xs font-semibold text-ink-2 block mb-1">พื้นที่ทำงาน *</label>
          <input type="text" value={form.area} onChange={(e) => set({ area: e.target.value })} placeholder="เช่น AOB โซน A" className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-semibold text-ink-2 block mb-1">วันที่ *</label>
          <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-semibold text-ink-2 block mb-1">เครื่อง (tag)</label>
          <div className="flex bg-surface border border-line-input rounded-input p-1">
            {["", ...MACHINES].map((m) => (
              <button key={m || "none"} type="button" onClick={() => set({ machine: m })}
                className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-[5px] transition ${form.machine === m ? "bg-cyan-med text-white" : "text-ink-2 hover:bg-surface-alt"}`}>
                {m || "—"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* carry-forward banner */}
      {carriedKeys && carriedKeys.size > 0 && (
        <div className="mx-5 mt-4 flex items-center gap-2 bg-cyan-tint border border-cyan-med/30 rounded-input px-3 py-2 text-xs font-semibold text-cyan-med">
          ↻ เติมเครื่องจักร/แรงงานจากใบล่าสุดให้แล้ว — แก้เฉพาะที่เปลี่ยน
        </div>
      )}

      <div className="px-5">
        <Section title="สภาพอากาศ" status={{ done: wxFilled, label: wxFilled ? "กรอกแล้ว" : "ว่าง" }}>
          <WeatherGrid weather={form.weather} onChange={setWeather} />
          <p className="text-xs text-ink-3 mt-2">แตะช่องเดียวต่อช่วงเวลา — แตะซ้ำเพื่อล้าง</p>
        </Section>

        <Section title="เครื่องจักร" hint="(13 ชนิด)" status={{ done: eqFilled > 0, label: eqFilled > 0 ? `${eqFilled} รายการ` : "ว่าง" }}>
          <CountGrid catalog={EQUIPMENT} values={form.equipment} onChange={(k, v) => setCount("equipment", k, v)} carriedKeys={carriedKeys} />
          <p className="text-xs text-ink-3 mt-2">เว้นว่าง = 0 · ช่องฟ้า = เติมจากเมื่อวาน แก้ทับได้</p>
        </Section>

        <Section title="แรงงาน" hint="(16 ชนิด)" status={{ done: lbFilled > 0, label: lbFilled > 0 ? `${lbFilled} รายการ · รวม ${sumCounts(form.labor)} คน` : "ว่าง" }}>
          <CountGrid catalog={LABOR} values={form.labor} onChange={(k, v) => setCount("labor", k, v)} carriedKeys={carriedKeys} />
        </Section>

        <Section title="บันทึกการทำงาน" status={form.kind === "excavation"
          ? { done: !!(form.workLogText && form.workLogText.trim()), label: form.workLogText && form.workLogText.trim() ? "มีข้อความ" : "ว่าง" }
          : { done: form.workLog.some((it) => it.title.trim()), label: `${form.workLog.filter((it) => it.title.trim()).length} รายการ` }}>
          {form.kind === "excavation" ? (
            <>
              <textarea
                value={form.workLogText || ""}
                onChange={(e) => set({ workLogText: e.target.value })}
                rows={16}
                className={inputCls + " resize-y font-mono text-xs leading-relaxed whitespace-pre"}
                placeholder="บันทึกการทำงาน (ดึงจาก dashboard) — แก้ไขได้"
              />
              <p className="text-xs text-ink-3 mt-2">ดึงจาก dashboard อัตโนมัติ — ตรวจ/แก้ก่อนบันทึก (ตัวเลขจากข้อมูลจริง)</p>
            </>
          ) : (
            <div className="space-y-2">
              {form.workLog.map((it) => {
                const pct = itemPercent({ done: it.done, total: it.total });
                return (
                  <div key={it.id} className="bg-surface-alt border border-line rounded-input p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <input type="text" value={it.title} onChange={(e) => setItem(it.id, { title: e.target.value })} placeholder="หัวข้องาน" className="flex-1 bg-surface border border-line rounded-input px-2 py-1.5 text-sm outline-none focus:border-navy" />
                      <button type="button" onClick={() => removeItem(it.id)} className="p-1.5 text-code-d hover:bg-code-d/10 rounded-input shrink-0"><Trash2 size={15} /></button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" value={it.done} onChange={(e) => setItem(it.id, { done: e.target.value })} placeholder="ทำได้" className="w-20 bg-surface border border-line rounded-input px-2 py-1.5 text-xs font-mono text-center outline-none focus:border-navy" />
                      <span className="text-ink-3 text-xs">/</span>
                      <input type="number" min="0" value={it.total} onChange={(e) => setItem(it.id, { total: e.target.value })} placeholder="ทั้งหมด" className="w-20 bg-surface border border-line rounded-input px-2 py-1.5 text-xs font-mono text-center outline-none focus:border-navy" />
                      {pct !== null && <span className="text-xs font-semibold font-mono text-ink-2">{pct}%</span>}
                      <input type="text" value={it.note} onChange={(e) => setItem(it.id, { note: e.target.value })} placeholder="โน้ต (ไม่บังคับ)" className="flex-1 bg-surface border border-line rounded-input px-2 py-1.5 text-xs outline-none focus:border-navy" />
                    </div>
                  </div>
                );
              })}
              <button type="button" onClick={addItem} className="text-navy bg-cyan-tint px-2.5 py-1 rounded-input text-xs font-semibold inline-flex items-center gap-1"><Plus size={13} /> เพิ่มรายการ</button>
            </div>
          )}
        </Section>

        <Section title="ปัญหา / อุปสรรค & แนวทางแก้ไข" status={null}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-ink-2 block mb-1">ปัญหา / อุปสรรค</label>
              <textarea value={form.problems} onChange={(e) => set({ problems: e.target.value })} rows={3} className={inputCls + " resize-none"} />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-2 block mb-1">แนวทางแก้ไข</label>
              <textarea value={form.solutions} onChange={(e) => set({ solutions: e.target.value })} rows={3} className={inputCls + " resize-none"} />
            </div>
          </div>
        </Section>

        <Section title="ลงนาม" status={null} defaultOpen={false}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div><label className="text-xs font-semibold text-ink-2 block mb-1">ผู้บันทึกรายงาน</label><input type="text" value={form.sign.recorderName} onChange={(e) => set({ sign: { ...form.sign, recorderName: e.target.value } })} className={inputCls} /></div>
              <div><label className="text-xs font-semibold text-ink-2 block mb-1">ตำแหน่ง</label><input type="text" value={form.sign.recorderPos} onChange={(e) => set({ sign: { ...form.sign, recorderPos: e.target.value } })} className={inputCls} /></div>
            </div>
            <div className="space-y-2">
              <div><label className="text-xs font-semibold text-ink-2 block mb-1">ตรวจสอบโดย</label><input type="text" value={form.sign.checkerName} onChange={(e) => set({ sign: { ...form.sign, checkerName: e.target.value } })} className={inputCls} /></div>
              <div><label className="text-xs font-semibold text-ink-2 block mb-1">ตำแหน่ง</label><input type="text" value={form.sign.checkerPos} onChange={(e) => set({ sign: { ...form.sign, checkerPos: e.target.value } })} className={inputCls} /></div>
            </div>
          </div>
        </Section>
      </div>

      {/* save bar */}
      <div className="px-5 py-4 bg-surface-alt border-t border-line flex items-center justify-end gap-2 flex-wrap">
        <span className="text-xs text-code-d mr-auto">{valid ? "" : "ต้องกรอก พื้นที่ทำงาน + วันที่"}</span>
        <button type="button" disabled title="เปิดใช้ใน SP3 (helper สร้าง PDF เป๊ะ)" className="px-4 py-2.5 bg-surface text-ink-3 rounded-input text-sm font-semibold border border-line inline-flex items-center gap-2 cursor-not-allowed opacity-60"><FileText size={16} /> สร้าง PDF</button>
        <button type="button" onClick={onCancel} className="px-5 py-2.5 bg-surface text-ink-2 rounded-input text-sm font-semibold border border-line hover:bg-surface-alt shadow-card">ยกเลิก</button>
        <button type="button" onClick={() => onSave(form)} disabled={!valid} className="px-5 py-2.5 bg-navy text-white rounded-input text-sm font-semibold shadow-hover hover:opacity-90 inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"><Save size={16} /> บันทึก</button>
      </div>
    </div>
  );
}
