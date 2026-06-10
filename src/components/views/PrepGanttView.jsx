import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Plus } from "lucide-react";
import { apiCall } from "../../utils/api";
import {
  loadPrepTasks, savePrepTasks, upsertPrepTask, removePrepTask,
  todayBKK, taskStatus, ganttBounds, prepSummary,
  TH_MONTHS, addDays, computePxPerDay, ganttTicks,
} from "../../utils/prepGantt";
import PrepTaskModal from "./PrepTaskModal";

const STATUS_BAR = { done: "bg-sgreen-dark", behind: "bg-code-d", ontrack: "bg-navy", notstarted: "bg-ink-3" };
const STATUS_TEXT = { done: "text-sgreen-dark", behind: "text-code-d", ontrack: "text-navy", notstarted: "text-ink-3" };
const LEGEND = [
  ["bg-sgreen-dark", "เสร็จ"],
  ["bg-navy", "ตามแผน"],
  ["bg-code-d", "ช้ากว่าแผน"],
  ["bg-ink-3", "ยังไม่เริ่ม"],
];
// grid แถวเดียวกันทั้งซ้าย/ขวา → แถวสูง auto (ชื่องาน wrap แสดงครบ) แล้ว bar ยังตรงแถวเสมอ
// คอลัมน์ซ้ายต้องกว้างคงที่ เพราะ overlay (แรเงา/เส้น/วันนี้) อิงพิกัด LEFT_W
const COL_IDX = 28, COL_NAME = 224, COL_DATE = 64, COL_PCT = 48;
const LEFT_W = COL_IDX + COL_NAME + COL_DATE * 2 + COL_PCT; // 428
const MIN_ROW_H = 38;
const HEADER_MONTH_H = 20;
const HEADER_H = 40; // เดือน 20 + เลขวัน 20
const MIN_MONTH_LABEL_PX = 56; // ช่วงเดือนแคบกว่านี้ (เดือนหัว/ท้ายโดนตัดจาก pad ±2 วัน) → ซ่อน label กันซ้อนกับเดือนถัดไป

const _d = (s) => new Date(s + "T00:00:00");
const dayDiff = (a, b) => Math.round((_d(b) - _d(a)) / 86400000);
const fmtTH = (s) => { const x = _d(s); return `${x.getDate()} ${TH_MONTHS[x.getMonth()]}`; };

const PrepGanttView = ({ machine = "TBM1", readOnly = false }) => {
  const [tasks, setTasks] = useState(() => loadPrepTasks(machine));
  const [modal, setModal] = useState({ open: false, editing: null });
  const [availW, setAvailW] = useState(0);
  const wrapRef = useRef(null);
  useEffect(() => { setTasks(loadPrepTasks(machine)); }, [machine]);

  const hasTasks = tasks.length > 0;
  useLayoutEffect(() => {
    const measure = () => {
      if (!wrapRef.current) return;
      setAvailW(Math.max(0, wrapRef.current.clientWidth - LEFT_W - 1));
    };
    measure();
    if (typeof ResizeObserver !== "undefined" && wrapRef.current) {
      const ro = new ResizeObserver(measure);
      ro.observe(wrapRef.current);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [hasTasks]);

  const today = todayBKK();
  const bounds = useMemo(() => ganttBounds(tasks), [tasks]);
  const summary = useMemo(() => prepSummary(tasks, today), [tasks, today]);

  const persist = (next) => { setTasks(next); savePrepTasks(machine, next); };
  const submit = (form) => {
    const next = upsertPrepTask(tasks, form);
    persist(next);
    const saved = form.id ? next.find((t) => t.id === form.id) : next.find((t) => !tasks.some((o) => o.id === t.id));
    if (saved) apiCall("savePrepTask", { ...saved, machine }).catch((e) => console.warn("PrepTask sync (save) failed — kept locally:", e.message));
    setModal({ open: false, editing: null });
  };
  const del = (id) => {
    persist(removePrepTask(tasks, id));
    apiCall("deletePrepTask", { id }).catch((e) => console.warn("PrepTask sync (delete) failed — kept locally:", e.message));
    setModal({ open: false, editing: null });
  };

  const axisStart = bounds ? addDays(bounds.minDate, -2) : today;
  const axisEnd = bounds ? addDays(bounds.maxDate, 2) : today;
  const totalDays = dayDiff(axisStart, axisEnd) + 1;
  const pxPerDay = computePxPerDay(availW, totalDays);
  const width = totalDays * pxPerDay;
  const ticks = useMemo(
    () => (bounds ? ganttTicks(axisStart, axisEnd, pxPerDay) : { months: [], days: [], weekLines: [], weekendBands: [] }),
    [bounds, axisStart, axisEnd, pxPerDay]
  );
  const todayX = bounds && today >= axisStart && today <= axisEnd ? dayDiff(axisStart, today) * pxPerDay : null;

  const cellBase = "flex items-center border-b border-line/50";
  const hoverCls = readOnly ? "" : "cursor-pointer group-hover:bg-cyan-tint/40";

  return (
    <section className="rounded-card border border-line bg-surface shadow-card p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-base font-semibold text-ink">Work Plan · {machine}</h3>
          {tasks.length > 0 && (
            <p className="text-xs text-ink-3 mt-0.5">{summary.done}/{summary.total} เสร็จ{summary.behind > 0 ? ` · ⚠ ${summary.behind} ช้ากว่าแผน` : ""}</p>
          )}
        </div>
        {!readOnly && (
          <button onClick={() => setModal({ open: true, editing: null })} className="inline-flex items-center gap-1 bg-navy hover:bg-navy-deepest text-white text-xs font-semibold px-2.5 py-1.5 rounded-input transition-colors shrink-0">
            <Plus size={14} /> เพิ่มงาน
          </button>
        )}
      </div>

      {tasks.length === 0 ? (
        <p className="text-center text-ink-3 text-sm py-8">ยังไม่มีงาน — กด "เพิ่มงาน" เพื่อเริ่ม</p>
      ) : (
        <>
          <div ref={wrapRef} className="overflow-x-auto">
            <div className="relative inline-grid" style={{ gridTemplateColumns: `${COL_IDX}px ${COL_NAME}px ${COL_DATE}px ${COL_DATE}px ${COL_PCT}px ${width}px` }}>
              {/* grid layers (ใต้ทุกอย่าง — วาดก่อนใน DOM, พิกัดอิง LEFT_W คงที่) */}
              {ticks.weekendBands.map((b) => (
                <div key={`wb${b.x}`} className="absolute bg-line/20" style={{ top: HEADER_H, bottom: 0, left: LEFT_W + b.x, width: b.width }} />
              ))}
              {ticks.weekLines.map((x) => (
                <div key={`wl${x}`} className="absolute w-px bg-line/40" style={{ top: HEADER_H, bottom: 0, left: LEFT_W + x }} />
              ))}
              {ticks.months.filter((m) => m.x > 0).map((m) => (
                <div key={`ml${m.x}`} className="absolute top-0 bottom-0 w-px bg-line" style={{ left: LEFT_W + m.x }} />
              ))}

              {/* header row */}
              <div className="contents text-[11px] font-semibold text-ink-3 uppercase">
                <div className={`${cellBase} justify-center px-1`} style={{ height: HEADER_H }}>#</div>
                <div className={`${cellBase} px-2`}>งาน</div>
                <div className={`${cellBase} justify-center px-1`}>เริ่ม</div>
                <div className={`${cellBase} justify-center px-1`}>จบ</div>
                <div className={`${cellBase} justify-end px-1 pr-2 border-r border-line`}>%</div>
                <div className="border-b border-line/50">
                  {/* ชั้นเดือน — ซ่อน label เดือนที่ช่วงแคบกว่าความยาวป้าย (เส้นแบ่งเดือนยังอยู่) */}
                  <div className="relative border-b border-line/30" style={{ height: HEADER_MONTH_H }}>
                    {ticks.months.filter((m) => m.span >= MIN_MONTH_LABEL_PX).map((m) => (
                      <span key={m.iso} className="absolute inset-y-0 flex items-center pl-1.5 text-[10px] font-medium text-ink-2 whitespace-nowrap normal-case" style={{ left: m.x }}>{m.label}</span>
                    ))}
                  </div>
                  {/* ชั้นเลขวัน */}
                  <div className="relative" style={{ height: HEADER_H - HEADER_MONTH_H - 2 }}>
                    {ticks.days.map((d) => (
                      <span key={d.iso} className="absolute inset-y-0 flex items-center justify-center text-[9px] text-ink-3" style={{ left: d.x, width: pxPerDay }}>{d.label}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* task rows — แถว grid เดียวกัน: ชื่อ wrap แสดงครบ แถวสูง auto, bar กึ่งกลางแถวเสมอ */}
              {tasks.map((t, i) => {
                const left = dayDiff(axisStart, t.start) * pxPerDay;
                const st = taskStatus(t, today);
                const color = STATUS_BAR[st] || "bg-navy";
                return (
                  <div key={t.id} className="contents group" onClick={readOnly ? undefined : () => setModal({ open: true, editing: t })}>
                    <div className={`${cellBase} ${hoverCls} justify-center px-1 text-xs text-ink-3`} style={{ minHeight: MIN_ROW_H }}>{i + 1}</div>
                    <div className={`${cellBase} ${hoverCls} px-2 py-1.5 text-sm leading-snug text-ink`}>{t.milestone ? "◆ " : ""}{t.name}</div>
                    <div className={`${cellBase} ${hoverCls} justify-center px-1 text-xs text-ink-3`}>{fmtTH(t.start)}</div>
                    <div className={`${cellBase} ${hoverCls} justify-center px-1 text-xs text-ink-3`}>{t.milestone ? "—" : fmtTH(t.end)}</div>
                    <div className={`${cellBase} ${hoverCls} justify-end px-1 pr-2 text-xs font-semibold border-r border-line ${STATUS_TEXT[st] || "text-ink-2"}`}>{t.milestone ? "" : `${t.percent}%`}</div>
                    <div className="relative border-b border-line/50">
                      {t.milestone ? (
                        <div className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rotate-45 ${color}`} style={{ left }} title={t.name} />
                      ) : (
                        <div className={`absolute top-1/2 -translate-y-1/2 h-5 rounded-md ${color}/20 overflow-hidden`} style={{ left, width: Math.max(pxPerDay, (dayDiff(t.start, t.end || t.start) + 1) * pxPerDay) }} title={`${t.name} (${t.percent}%)`}>
                          <div className={`h-full ${color}`} style={{ width: `${t.percent}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* เส้นวันนี้ + chip (บนสุด — วาดท้าย DOM) */}
              {todayX !== null && (
                <>
                  <div className="absolute w-px bg-code-c z-20" style={{ top: HEADER_MONTH_H, bottom: 0, left: LEFT_W + todayX }} />
                  <span className="absolute z-30 bg-code-c text-white text-[9px] font-semibold rounded px-1 py-px whitespace-nowrap" style={{ top: HEADER_MONTH_H + 2, left: LEFT_W + Math.min(todayX + 2, Math.max(0, width - 64)) }}>
                    วันนี้ {fmtTH(today)}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
            {LEGEND.map(([c, label]) => (
              <span key={label} className="inline-flex items-center gap-1.5 text-[11px] text-ink-3">
                <span className={`w-2 h-2 rounded-full ${c}`} /> {label}
              </span>
            ))}
          </div>
        </>
      )}

      <PrepTaskModal open={modal.open} initial={modal.editing} onSubmit={submit} onDelete={del} onClose={() => setModal({ open: false, editing: null })} />
    </section>
  );
};

export default PrepGanttView;
