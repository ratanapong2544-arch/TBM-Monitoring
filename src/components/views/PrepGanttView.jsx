import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Plus } from "lucide-react";
import { apiCall } from "../../utils/api";
import {
  loadPrepTasks, savePrepTasks, upsertPrepTask, removePrepTask,
  todayBKK, taskStatus, prepSummary,
  TH_MONTHS, addDays, computePxPerDay, ganttTicks,
} from "../../utils/prepGantt";
import {
  computeForecast, showSplit, setBaseline, forecastBounds,
  loadForecastMode, saveForecastMode, depEndpoints,
} from "../../utils/prepForecast";
import { buildTree, visibleOrder, rollupAll, loadCollapsed, saveCollapsed } from "../../utils/prepTree";
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
// คอลัมน์ซ้าย freeze (position: sticky) — scroll แนวนอนเลื่อนเฉพาะส่วน chart
const STICKY_LEFTS = [0, COL_IDX, COL_IDX + COL_NAME, COL_IDX + COL_NAME + COL_DATE, COL_IDX + COL_NAME + COL_DATE * 2];
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
  const rowRefs = useRef({});
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
  const [fcMode, setFcMode] = useState(() => loadForecastMode());
  const changeMode = (m) => { setFcMode(m); saveForecastMode(m); };

  const tree = useMemo(() => buildTree(tasks), [tasks]);
  const leaves = useMemo(() => tree.order.filter((t) => !tree.isParent.has(t.id)), [tree]);
  const [collapsed, setCollapsed] = useState(() => loadCollapsed(machine));
  useEffect(() => { setCollapsed(loadCollapsed(machine)); }, [machine]);
  const toggleCollapse = (id) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    saveCollapsed(machine, next);
    return next;
  });
  const rows = useMemo(() => visibleOrder(tree, collapsed), [tree, collapsed]);

  const forecast = useMemo(() => computeForecast(leaves, today, fcMode), [leaves, today, fcMode]);
  const anySplit = useMemo(() => leaves.some((t) => showSplit(t, forecast.byId[t.id])), [leaves, forecast]);
  const anyDeps = useMemo(() => leaves.some((t) => Array.isArray(t.deps) && t.deps.length > 0), [leaves]);
  const bounds = useMemo(() => forecastBounds(leaves, forecast.byId), [leaves, forecast]);
  const summary = useMemo(() => prepSummary(leaves, today), [leaves, today]);
  const rollups = useMemo(() => {
    const isRedLeaf = (l) => taskStatus(l, today) === "behind" || !!(forecast.byId[l.id] && forecast.byId[l.id].isCritical);
    return rollupAll(tasks, forecast.byId, isRedLeaf);
  }, [tasks, forecast, today]);

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

  const onSetBaseline = () => {
    if (!window.confirm(`Set Baseline (${machine}): บันทึกแผนปัจจุบันเป็นแผนเดิมสำหรับเทียบ — ทับ baseline เก่าทั้งหมด?`)) return;
    const next = setBaseline(tasks);
    persist(next);
    next.forEach((t) => apiCall("savePrepTask", { ...t, machine }).catch((e) => console.warn("PrepTask sync (baseline) failed — kept locally:", e.message)));
  };

  const axisStart = bounds ? addDays(bounds.minDate, -2) : today;
  const axisEnd = bounds ? addDays(bounds.maxDate, anySplit ? 5 : 2) : today;
  const totalDays = dayDiff(axisStart, axisEnd) + 1;
  const pxPerDay = computePxPerDay(availW, totalDays);
  const width = totalDays * pxPerDay;

  const gridRef = useRef(null);
  const [overlay, setOverlay] = useState({ h: 0, ys: {} });
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || !anyDeps) return;
    const ys = {};
    for (const t of rows) {
      const el = rowRefs.current[t.id];
      if (el) ys[t.id] = el.offsetTop + el.offsetHeight / 2; // offsetParent = grid (มี class relative)
    }
    setOverlay({ h: grid.offsetHeight, ys });
  }, [rows, availW, pxPerDay, fcMode, anyDeps]);

  const ticks = useMemo(
    () => (bounds ? ganttTicks(axisStart, axisEnd, pxPerDay) : { months: [], days: [], weekLines: [], weekendBands: [] }),
    [bounds, axisStart, axisEnd, pxPerDay]
  );
  const todayX = bounds && today >= axisStart && today <= axisEnd ? dayDiff(axisStart, today) * pxPerDay : null;

  const cellBase = "flex items-center border-b border-line/50";
  // sticky cell ต้องพื้นทึบ (chart ลอดด้านหลังตอน scroll) — hover จึงใช้ tint ทึบแทนแบบโปร่ง
  const hoverCls = readOnly ? "" : "cursor-pointer group-hover:bg-cyan-tint";
  const stickyCls = "sticky z-40 bg-surface";

  return (
    <section className="rounded-card border border-line bg-surface shadow-card p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-ink">Work Plan · {machine}</h3>
          {tasks.length > 0 && (
            <p className="text-xs text-ink-3 mt-0.5">
              {summary.done}/{summary.total} เสร็จ{summary.behind > 0 ? ` · ⚠ ${summary.behind} ช้ากว่าแผน` : ""}
              {forecast.project && anySplit && (
                <span className={forecast.project.slipDays > 0 ? "text-code-d font-semibold" : ""}>
                  {" · forecast: งานสุดท้ายจบ "}{fmtTH(forecast.project.fcEnd)}
                  {forecast.project.slipDays !== 0 && ` (${forecast.project.slipDays > 0 ? "+" : "−"}${Math.abs(forecast.project.slipDays)} วัน)`}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {tasks.length > 0 && (
            <div className="flex border border-line-input rounded-input overflow-hidden text-[11px] font-semibold print:hidden">
              <button onClick={() => changeMode("remaining")} className={`px-2 py-1.5 transition-colors ${fcMode === "remaining" ? "bg-navy text-white" : "bg-surface text-ink-2 hover:bg-cyan-tint"}`}>เลื่อนตามงานเหลือ</button>
              <button onClick={() => changeMode("rate")} className={`px-2 py-1.5 transition-colors ${fcMode === "rate" ? "bg-navy text-white" : "bg-surface text-ink-2 hover:bg-cyan-tint"}`}>ตาม rate จริง</button>
            </div>
          )}
          {!readOnly && tasks.length > 0 && (
            <button onClick={onSetBaseline} className="border border-navy text-navy hover:bg-cyan-tint text-xs font-semibold px-2.5 py-1.5 rounded-input transition-colors print:hidden">Set Baseline</button>
          )}
          {!readOnly && (
            <button onClick={() => setModal({ open: true, editing: null })} className="inline-flex items-center gap-1 bg-navy hover:bg-navy-deepest text-white text-xs font-semibold px-2.5 py-1.5 rounded-input transition-colors shrink-0">
              <Plus size={14} /> เพิ่มงาน
            </button>
          )}
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="text-center text-ink-3 text-sm py-8">ยังไม่มีงาน — กด "เพิ่มงาน" เพื่อเริ่ม</p>
      ) : (
        <>
          <div ref={wrapRef} className="overflow-x-auto">
            <div ref={gridRef} className="relative inline-grid" style={{ gridTemplateColumns: `${COL_IDX}px ${COL_NAME}px ${COL_DATE}px ${COL_DATE}px ${COL_PCT}px ${width}px` }}>
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
                <div className={`${cellBase} ${stickyCls} justify-center px-1`} style={{ height: HEADER_H, left: STICKY_LEFTS[0] }}>#</div>
                <div className={`${cellBase} ${stickyCls} px-2`} style={{ left: STICKY_LEFTS[1] }}>งาน</div>
                <div className={`${cellBase} ${stickyCls} justify-center px-1`} style={{ left: STICKY_LEFTS[2] }}>เริ่ม</div>
                <div className={`${cellBase} ${stickyCls} justify-center px-1`} style={{ left: STICKY_LEFTS[3] }}>จบ</div>
                <div className={`${cellBase} ${stickyCls} justify-end px-1 pr-2 border-r border-line`} style={{ left: STICKY_LEFTS[4] }}>%</div>
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
              {rows.map((t) => {
                const depth = tree.depthOf.get(t.id) || 0;
                const isParentRow = tree.isParent.has(t.id);
                const roll = isParentRow ? rollups.get(t.id) : null;

                if (isParentRow && roll) {
                  const rollStatus = taskStatus({ start: roll.start, end: roll.end, percent: roll.percent }, today);
                  const sumColor = roll.allDone ? "bg-sgreen-dark" : roll.anyRed ? "bg-code-d" : "bg-navy-dark";
                  const sumLeft = dayDiff(axisStart, roll.start) * pxPerDay;
                  const sumW = Math.max(pxPerDay, (dayDiff(roll.start, roll.end) + 1) * pxPerDay);
                  const sumTitle = `${t.name} — สรุปจากงานย่อย · forecast ${fmtTH(roll.fcStart)} → ${fmtTH(roll.fcEnd)}${roll.slipDays !== 0 ? ` (${roll.slipDays > 0 ? "+" : "−"}${Math.abs(roll.slipDays)} วัน)` : ""}`;
                  return (
                    <div key={t.id} className="contents group" onClick={readOnly ? undefined : () => setModal({ open: true, editing: t })}>
                      <div className={`${cellBase} ${stickyCls} ${hoverCls} justify-center px-1 text-xs text-ink-3`} style={{ minHeight: MIN_ROW_H, left: STICKY_LEFTS[0] }}>{tree.numberOf.get(t.id)}</div>
                      <div className={`${cellBase} ${stickyCls} ${hoverCls} py-1.5 text-sm leading-snug text-ink font-semibold`} style={{ left: STICKY_LEFTS[1], paddingLeft: 8 + depth * 16, paddingRight: 8 }}>
                        <button onClick={(e) => { e.stopPropagation(); toggleCollapse(t.id); }} className="mr-1 text-ink-3 hover:text-ink" aria-label="ย่อ/ขยายงานย่อย">{collapsed.has(t.id) ? "▸" : "▾"}</button>
                        {t.name}
                        {collapsed.has(t.id) && <span className="ml-1 font-normal text-xs text-ink-3">({tree.childrenOf.get(t.id).length} งานย่อย)</span>}
                      </div>
                      <div className={`${cellBase} ${stickyCls} ${hoverCls} justify-center px-1 text-xs text-ink-3`} style={{ left: STICKY_LEFTS[2] }}>{fmtTH(roll.start)}</div>
                      <div className={`${cellBase} ${stickyCls} ${hoverCls} justify-center px-1 text-xs text-ink-3`} style={{ left: STICKY_LEFTS[3] }}>{fmtTH(roll.end)}</div>
                      <div className={`${cellBase} ${stickyCls} ${hoverCls} justify-end px-1 pr-2 text-xs font-semibold border-r border-line ${STATUS_TEXT[rollStatus] || "text-ink-2"}`} style={{ left: STICKY_LEFTS[4] }}>{roll.percent}%</div>
                      <div ref={(el) => { rowRefs.current[t.id] = el; }} className="relative border-b border-line/50">
                        {/* แถบสรุปแบบ bracket: แท่ง 5px + ขีดลงสองปลาย */}
                        <div className={`absolute top-1/2 -translate-y-1/2 h-[5px] ${sumColor}`} style={{ left: sumLeft, width: sumW }} title={sumTitle} />
                        <div className={`absolute w-[3px] h-[10px] ${sumColor}`} style={{ top: "calc(50% - 5px)", left: sumLeft }} />
                        <div className={`absolute w-[3px] h-[10px] ${sumColor}`} style={{ top: "calc(50% - 5px)", left: sumLeft + sumW - 3 }} />
                      </div>
                    </div>
                  );
                }

                const left = dayDiff(axisStart, t.start) * pxPerDay;
                const st = taskStatus(t, today);
                const color = STATUS_BAR[st] || "bg-navy";
                const f = forecast.byId[t.id];
                const split = showSplit(t, f);
                const planEnd = t.end || t.start;
                const baseS = t.baseStart || t.start;
                const baseE = t.baseEnd || planEnd;
                const baseLeft = dayDiff(axisStart, baseS) * pxPerDay;
                const baseW = Math.max(pxPerDay, (dayDiff(baseS, baseE) + 1) * pxPerDay);
                const fcLeft = f ? dayDiff(axisStart, f.fcStart) * pxPerDay : 0;
                const fcW = f ? Math.max(pxPerDay, (dayDiff(f.fcStart, f.fcEnd) + 1) * pxPerDay) : 0;
                // สี hybrid: แดง = งานตัวเองช้ากว่าแผน หรืออยู่บนสายวิกฤต (CPM), navy = ตามแผน/มี float, เขียว = เสร็จ
                const fcRed = st === "behind" || (f && f.isCritical);
                const fcColor = st === "done" ? "bg-sgreen-dark" : fcRed ? "bg-code-d" : "bg-navy";
                const slip = f ? f.slipDays : 0;
                const slipCls = slip > 0 ? (fcRed ? "text-code-d" : "text-ink-2") : "text-sgreen-dark";
                const slipLabel = slip !== 0 ? `${slip > 0 ? "+" : "−"}${Math.abs(slip)} วัน` : "";
                const fcTitle = f
                  ? `${t.name} — forecast ${fmtTH(f.fcStart)} → ${fmtTH(f.fcEnd)}${slip !== 0 ? ` (${slipLabel})` : ""} · float ${f.totalFloat} วัน`
                  : t.name;
                return (
                  <div key={t.id} className="contents group" onClick={readOnly ? undefined : () => setModal({ open: true, editing: t })}>
                    <div className={`${cellBase} ${stickyCls} ${hoverCls} justify-center px-1 text-xs text-ink-3`} style={{ minHeight: MIN_ROW_H, left: STICKY_LEFTS[0] }}>{tree.numberOf.get(t.id)}</div>
                    <div className={`${cellBase} ${stickyCls} ${hoverCls} py-1.5 text-sm leading-snug text-ink`} style={{ left: STICKY_LEFTS[1], paddingLeft: 8 + depth * 16, paddingRight: 8 }}>{t.milestone ? "◆ " : ""}{t.name}</div>
                    <div className={`${cellBase} ${stickyCls} ${hoverCls} justify-center px-1 text-xs text-ink-3`} style={{ left: STICKY_LEFTS[2] }}>{fmtTH(t.start)}</div>
                    <div className={`${cellBase} ${stickyCls} ${hoverCls} justify-center px-1 text-xs text-ink-3`} style={{ left: STICKY_LEFTS[3] }}>{t.milestone ? "—" : fmtTH(t.end)}</div>
                    <div className={`${cellBase} ${stickyCls} ${hoverCls} justify-end px-1 pr-2 text-xs font-semibold border-r border-line ${STATUS_TEXT[st] || "text-ink-2"}`} style={{ left: STICKY_LEFTS[4] }}>{t.milestone ? "" : `${t.percent}%`}</div>
                    <div ref={(el) => { rowRefs.current[t.id] = el; }} className="relative border-b border-line/50">
                      {split ? (
                        t.milestone ? (
                          <>
                            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-ink-3/40" style={{ left: baseLeft }} />
                            <div className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rotate-45 ${fcColor}`} style={{ left: fcLeft }} title={fcTitle} />
                          </>
                        ) : (
                          <>
                            {/* แท่งบน = แผนเดิม (baseline) */}
                            <div className="absolute h-1.5 rounded-sm bg-ink-3/40" style={{ top: "calc(50% - 8px)", left: baseLeft, width: baseW }} />
                            {/* แท่งล่าง = forecast (โทนอ่อน + % fill เข้ม เหมือนแท่งเดี่ยว) */}
                            <div className={`absolute h-2.5 rounded-sm ${fcColor}/20 overflow-hidden`} style={{ top: "calc(50% + 1px)", left: fcLeft, width: fcW }} title={fcTitle}>
                              <div className={`h-full ${fcColor}`} style={{ width: `${t.percent}%` }} />
                            </div>
                          </>
                        )
                      ) : t.milestone ? (
                        <div className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rotate-45 ${color}`} style={{ left }} title={t.name} />
                      ) : (
                        <div className={`absolute top-1/2 -translate-y-1/2 h-5 rounded-md ${color}/20 overflow-hidden`} style={{ left, width: Math.max(pxPerDay, (dayDiff(t.start, t.end || t.start) + 1) * pxPerDay) }} title={`${t.name} (${t.percent}%)`}>
                          <div className={`h-full ${color}`} style={{ width: `${t.percent}%` }} />
                        </div>
                      )}
                      {split && slip !== 0 && (
                        <span className={`absolute text-[10px] font-semibold whitespace-nowrap ${slipCls}`} style={{ top: "calc(50% - 1px)", left: (t.milestone ? fcLeft + 10 : fcLeft + fcW) + 6 }}>
                          {slipLabel}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* ลูกศร dependency (z-10 — ใต้เส้นวันนี้ z-20) */}
              {anyDeps && overlay.h > 0 && (
                <svg className="absolute pointer-events-none z-10" style={{ left: LEFT_W, top: 0 }} width={width} height={overlay.h} aria-hidden="true">
                  <defs>
                    <marker id="prepDepArrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                      <path d="M1 1 L7 4 L1 7" fill="none" stroke="#999999" strokeWidth="1.2" />
                    </marker>
                  </defs>
                  {leaves.flatMap((t) =>
                    (Array.isArray(t.deps) ? t.deps : []).map((d) => {
                      const p = forecast.byId[d.id];
                      const s = forecast.byId[t.id];
                      const y1 = overlay.ys[d.id];
                      const y2 = overlay.ys[t.id];
                      if (!p || !s || y1 == null || y2 == null) return null;
                      const xOf = (date, isEnd) => (dayDiff(axisStart, date) + (isEnd ? 1 : 0)) * pxPerDay;
                      const { x1, x2, intoLeft } = depEndpoints(d.type, p, s, xOf);
                      const a = intoLeft ? -6 : 6; // เผื่อระยะหัวลูกศรเข้าหา edge
                      const midY = (y1 + y2) / 2;
                      const path = `M${x1} ${y1} L${x1} ${midY} L${x2 + a} ${midY} L${x2 + a} ${y2} L${x2} ${y2}`;
                      return <path key={`${t.id}_${d.id}`} d={path} fill="none" stroke="#999999" strokeWidth="1" markerEnd="url(#prepDepArrow)" />;
                    })
                  )}
                </svg>
              )}

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
            {tree.isParent.size > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-3"><span className="w-3.5 h-1 bg-navy-dark" /> งานแม่ (สรุปจากงานย่อย)</span>
            )}
            {(anySplit || anyDeps) && (
              <>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-3"><span className="w-3.5 h-1 rounded-sm bg-ink-3/40" /> แผนเดิม (แท่งบน)</span>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-3"><span className="w-3.5 h-1 rounded-sm bg-code-d" /> ช้ากว่าแผน / งานวิกฤต</span>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-3"><span className="w-3.5 h-1 rounded-sm bg-navy" /> ตามแผน / มี float</span>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-3">→ เชื่อมงาน</span>
              </>
            )}
          </div>
        </>
      )}

      <PrepTaskModal open={modal.open} initial={modal.editing} tasks={tasks} onSubmit={submit} onDelete={del} onClose={() => setModal({ open: false, editing: null })} />
    </section>
  );
};

export default PrepGanttView;
