import React, { useState, useEffect, useMemo } from "react";
import { Plus } from "lucide-react";
import {
  loadPrepTasks, savePrepTasks, upsertPrepTask, removePrepTask,
  todayBKK, taskStatus, ganttBounds, prepSummary,
} from "../../utils/prepGantt";
import PrepTaskModal from "./PrepTaskModal";

const STATUS_BAR = { done: "bg-sgreen-dark", behind: "bg-code-d", ontrack: "bg-navy", notstarted: "bg-ink-3" };
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const PX_PER_DAY = 7;
const ROW_H = 34;

const _d = (s) => new Date(s + "T00:00:00");
const dayDiff = (a, b) => Math.round((_d(b) - _d(a)) / 86400000);
const fmtTH = (s) => { const x = _d(s); return `${x.getDate()} ${TH_MONTHS[x.getMonth()]}`; };

function monthTicks(startStr, endStr) {
  const s = _d(startStr), e = _d(endStr);
  const ticks = [];
  let cur = new Date(s.getFullYear(), s.getMonth(), 1);
  let guard = 0;
  while (cur <= e && guard < 240) {
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-01`;
    ticks.push({ iso, label: `${TH_MONTHS[cur.getMonth()]} ${String((cur.getFullYear() + 543)).slice(-2)}` });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    guard++;
  }
  return ticks;
}

const PrepGanttView = ({ machine = "TBM1" }) => {
  const [tasks, setTasks] = useState(() => loadPrepTasks(machine));
  const [modal, setModal] = useState({ open: false, editing: null });
  useEffect(() => { setTasks(loadPrepTasks(machine)); }, [machine]);

  const today = todayBKK();
  const bounds = useMemo(() => ganttBounds(tasks), [tasks]);
  const summary = useMemo(() => prepSummary(tasks, today), [tasks, today]);

  const persist = (next) => { setTasks(next); savePrepTasks(machine, next); };
  const submit = (form) => { persist(upsertPrepTask(tasks, form)); setModal({ open: false, editing: null }); };
  const del = (id) => { persist(removePrepTask(tasks, id)); setModal({ open: false, editing: null }); };

  const axisStart = bounds ? bounds.minDate : today;
  const axisEnd = bounds ? bounds.maxDate : today;
  const width = Math.max(1, dayDiff(axisStart, axisEnd) + 1) * PX_PER_DAY;
  const ticks = bounds ? monthTicks(axisStart, axisEnd) : [];
  const todayX = bounds && today >= axisStart && today <= axisEnd ? dayDiff(axisStart, today) * PX_PER_DAY : null;

  return (
    <section className="rounded-card border border-line bg-surface shadow-card p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-base font-semibold text-ink">แผนเตรียมงาน · {machine}</h3>
          {tasks.length > 0 && (
            <p className="text-xs text-ink-3 mt-0.5">{summary.done}/{summary.total} เสร็จ{summary.behind > 0 ? ` · ⚠ ${summary.behind} ช้ากว่าแผน` : ""}</p>
          )}
        </div>
        <button onClick={() => setModal({ open: true, editing: null })} className="inline-flex items-center gap-1 bg-navy hover:bg-navy-deepest text-white text-xs font-semibold px-2.5 py-1.5 rounded-input transition-colors shrink-0">
          <Plus size={14} /> เพิ่มงาน
        </button>
      </div>

      {tasks.length === 0 ? (
        <p className="text-center text-ink-3 text-sm py-8">ยังไม่มีงานเตรียม — กด "เพิ่มงาน" เพื่อเริ่ม</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex min-w-max">
            {/* Left table */}
            <div className="shrink-0 bg-surface z-10 border-r border-line">
              <div className="flex items-center h-7 text-[11px] font-semibold text-ink-3 uppercase border-b border-line/50">
                <div className="w-40 px-2">งาน</div>
                <div className="w-16 px-1 text-center">เริ่ม</div>
                <div className="w-16 px-1 text-center">จบ</div>
                <div className="w-12 px-1 text-right">%</div>
              </div>
              {tasks.map((t) => (
                <div key={t.id} onClick={() => setModal({ open: true, editing: t })} style={{ height: ROW_H }}
                  className="flex items-center cursor-pointer hover:bg-cyan-tint/40 border-b border-line/50">
                  <div className="w-40 px-2 truncate text-sm text-ink">{t.milestone ? "◆ " : ""}{t.name}</div>
                  <div className="w-16 px-1 text-center text-xs text-ink-3">{fmtTH(t.start)}</div>
                  <div className="w-16 px-1 text-center text-xs text-ink-3">{t.milestone ? "—" : fmtTH(t.end)}</div>
                  <div className="w-12 px-1 text-right text-xs font-semibold text-ink-2">{t.milestone ? "" : `${t.percent}%`}</div>
                </div>
              ))}
            </div>

            {/* Right timeline */}
            <div className="relative" style={{ width }}>
              <div className="relative h-7 border-b border-line/50">
                {ticks.map((tk) => (
                  <div key={tk.iso} className="absolute top-0 bottom-0 border-l border-line/40" style={{ left: Math.max(0, dayDiff(axisStart, tk.iso) * PX_PER_DAY) }}>
                    <span className="text-[10px] text-ink-3 pl-1 whitespace-nowrap">{tk.label}</span>
                  </div>
                ))}
              </div>
              <div className="relative">
                {todayX !== null && (
                  <div className="absolute top-0 bottom-0 w-px bg-code-c z-20" style={{ left: todayX }}>
                    <span className="absolute top-0 left-0.5 text-[9px] text-code-c font-semibold whitespace-nowrap">วันนี้</span>
                  </div>
                )}
                {tasks.map((t) => {
                  const left = dayDiff(axisStart, t.start) * PX_PER_DAY;
                  const st = taskStatus(t, today);
                  const color = STATUS_BAR[st] || "bg-navy";
                  return (
                    <div key={t.id} style={{ height: ROW_H }} className="relative border-b border-line/50">
                      {t.milestone ? (
                        <div className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rotate-45 ${color}`} style={{ left }} title={t.name} />
                      ) : (
                        <div className={`absolute top-1/2 -translate-y-1/2 h-4 rounded ${color}/25 overflow-hidden`} style={{ left, width: Math.max(PX_PER_DAY, (dayDiff(t.start, t.end || t.start) + 1) * PX_PER_DAY) }} title={`${t.name} (${t.percent}%)`}>
                          <div className={`h-full ${color}`} style={{ width: `${t.percent}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <PrepTaskModal open={modal.open} initial={modal.editing} onSubmit={submit} onDelete={del} onClose={() => setModal({ open: false, editing: null })} />
    </section>
  );
};

export default PrepGanttView;
