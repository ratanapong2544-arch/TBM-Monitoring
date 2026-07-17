import React, { useMemo, useState } from "react";
import { ArrowUpDown, Printer, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip, ReferenceArea, ReferenceLine,
} from "recharts";
import { chartColors, axisTick, tooltipStyle } from "../../ui-ux-pro-max/chartTheme";
import { HEAD_TOL_MM } from "../../utils/constants";
import { DESIGN_LINE } from "../../utils/profileGeo";
import { deviationSeries, latestRingState, toleranceBreaches, parseRingNo } from "../../utils/profileSection";
import { focusWindow, niceDomain, breachSpans, latestStatus, RANGE_OPTIONS } from "../../utils/headTrend";
import SectionHeader from "../common/SectionHeader";
import StatCard from "../common/StatCard";
import { fitAndPrint } from "../../utils/printFit";
import HeadCutter3D from "./HeadCutter3D";
import HeadTrendContext from "./HeadTrendContext";

// สี Head/Art/Tail (ให้ต่างชัด, โทน CMI)
const C_HEAD = "#243B53", C_ART = "#2F5D50", C_TAIL = "#B08D4C", C_BREACH = "#B23A34";

const fmtMM = (v) => (v == null || isNaN(v) ? "—" : `${v > 0 ? "+" : ""}${Math.round(v)}`);

export default function HeadLevelView({ segmentRecords = [], machine = "TBM1", readOnly = false }) {
  const [printing, setPrinting] = useState(false);
  const [winSize, setWinSize] = useState(150);   // ค่าเริ่มต้น = 150 ริงล่าสุด
  const [winEnd, setWinEnd] = useState(null);    // null = เกาะริงล่าสุดเสมอ · เลข = ตำแหน่งที่คลิกบนแถบภาพรวม

  const series = useMemo(() => deviationSeries(segmentRecords, DESIGN_LINE), [segmentRecords]);
  const latest = useMemo(() => latestRingState(segmentRecords), [segmentRecords]);
  const breaches = useMemo(() => toleranceBreaches(series, HEAD_TOL_MM), [series]);

  // chart data: เรียงตามเลขริง (น้อย→มาก) สำหรับแกน X
  const chartData = useMemo(() => {
    return series
      .map((s) => ({ ring: String(s.ringNo), ringN: parseRingNo(s.ringNo) ?? 0, headV: s.headV, artV: s.artV, tailV: s.tailV, vrt: s.vrt }))
      .sort((a, b) => a.ringN - b.ringN);
  }, [series]);

  const vrtData = useMemo(() => chartData.filter((d) => d.vrt != null), [chartData]);

  const view = useMemo(() => focusWindow(chartData, winSize, winEnd), [chartData, winSize, winEnd]);
  const yDomain = useMemo(() => niceDomain(view, HEAD_TOL_MM), [view]);
  const spans = useMemo(() => breachSpans(view, HEAD_TOL_MM), [view]);
  const status = useMemo(() => latestStatus(chartData, HEAD_TOL_MM), [chartData]);
  const spansAll = useMemo(() => breachSpans(chartData, HEAD_TOL_MM), [chartData]);
  const winFrom = view.length ? view[0].ringN : 0;
  const winTo = view.length ? view[view.length - 1].ringN : 0;

  const pitch = latest && latest.headV != null && latest.tailV != null ? latest.headV - latest.tailV : null;

  const doPrint = () => {
    setPrinting(true);
    setTimeout(() => { fitAndPrint(document.querySelector(".print-target"), { orientation: "landscape", onePage: true }); setPrinting(false); }, 500);
  };

  // side-view schematic + PNG sprite removed — now rendered by <HeadCutter3D/> (live 3D)

  const hasData = chartData.length > 0;

  return (
    <div className="max-w-full mx-auto pb-24 animate-fade-in space-y-6">
      <style>{`@media print { @page { size: landscape; margin: 8mm; } body { background:white !important; } }
        ${printing ? `.print-target{position:absolute;top:0;left:0;right:0;width:100%;min-height:100vh;margin:0;padding:16px;background:#fff;z-index:99999;} body{overflow:hidden;}` : ""}`}</style>

      <section className={`space-y-6 ${printing ? "print-target" : ""}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <SectionHeader title={`${machine} — ระดับหัวเจาะ`} subtitle={`ค่าเบี่ยงหัวเจาะ Head / Art / Tail · Tolerance ±${HEAD_TOL_MM} mm`} icon={ArrowUpDown} />
          {!readOnly && (
            <button onClick={doPrint} className="p-2 text-ink-3 hover:text-navy bg-surface-alt hover:bg-cyan-tint rounded-input border border-line shadow-card print:hidden" title="Print"><Printer size={16} /></button>
          )}
        </div>

        {!hasData ? (
          <div className="bg-surface rounded-card border border-dashed border-line p-10 text-center text-ink-3">
            <ArrowUpDown className="mx-auto mb-3 text-ink-3" size={30} />
            <p className="font-semibold text-ink-2">ยังไม่มีข้อมูลระดับหัวเจาะ</p>
            <p className="text-sm mt-1">กรอกค่า Head / Art / Tail / VRT ต่อริงในฟอร์มบันทึก Segment แล้วค่าจะแสดงที่นี่</p>
          </div>
        ) : (
          <>
            {/* ── KPI cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="ริงล่าสุด" value={latest ? String(latest.ringNo) : "—"} subtext={latest && latest.ch != null ? `CH ${latest.ch.toLocaleString()}` : ""} color="text-navy" icon={ArrowUpDown} />
              <StatCard label="Head · Art · Tail" value={latest ? `${fmtMM(latest.headV)}·${fmtMM(latest.artV)}·${fmtMM(latest.tailV)}` : "—"} subtext="mm (ล่าสุด)" color="text-navy" valueColor="text-ink" />
              <StatCard label="ก้ม/เงย (Head−Tail)" value={pitch == null ? "—" : `${fmtMM(pitch)} mm`} subtext={pitch == null ? "" : (pitch < 0 ? "หัวต่ำกว่าหาง (ก้ม)" : pitch > 0 ? "หัวสูงกว่าหาง (เงย)" : "ระดับ")} color="text-code-c" valueColor="text-ink" />
              <StatCard
                label="สถานะริงล่าสุด"
                value={status == null ? "—" : status.status === "over" ? "เกินเกณฑ์" : "อยู่ในเกณฑ์"}
                subtext={breaches.length ? `เคยหลุด ${spansAll.length} ช่วง · ${breaches.length} ริง` : "ไม่เคยหลุดเกณฑ์"}
                color={status && status.status === "over" ? "text-code-d" : "text-sgreen-dark"}
                valueColor={status && status.status === "over" ? "text-code-d" : "text-sgreen-dark"}
                icon={status && status.status === "over" ? AlertTriangle : CheckCircle2}
              />
            </div>

            {/* ── ท่าทางหัวเจาะ: bullseye + side-view เรียง 2 คอลัมน์ ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
            {/* ── Bullseye cross-section (Concept B · 2 แกน) ── */}
            <div className="bg-surface rounded-card shadow-card border border-line p-5 sm:p-6">
              <h3 className="font-semibold text-ink text-base mb-1">ท่าทางหัวเจาะ · เป้า 2 แกน (cross-section)</h3>
              <p className="text-[11px] text-ink-3 font-semibold mb-3">
                ตำแหน่ง Head / Art / Tail เทียบแนวออกแบบ (สูง-ต่ำ × ซ้าย-ขวา) · วง = ±{HEAD_TOL_MM} mm · ริง {latest ? latest.ringNo : ""}
                {latest && latest.headH == null && (
                  <span className="block text-code-d mt-0.5">ริงนี้ไม่มีข้อมูลแนวราบ — จุดจึงตกบนแกนตั้ง (ค่าแนวราบมีถึง P509)</span>
                )}
              </p>
              {(() => {
                const R = 110, cx = 150, cy = 150, sc = R / HEAD_TOL_MM;
                const pts = [
                  { k: "T", h: latest && latest.tailH, v: latest && latest.tailV, c: C_TAIL },
                  { k: "A", h: latest && latest.artH, v: latest && latest.artV, c: C_ART },
                  { k: "H", h: latest && latest.headH, v: latest && latest.headV, c: C_HEAD },
                ];
                return (
                  <div className="w-full overflow-x-auto">
                    <svg viewBox="0 0 300 300" width="100%" style={{ maxWidth: 340, display: "block", margin: "0 auto" }}>
                      <circle cx={cx} cy={cy} r={R} fill="#F4FBF7" stroke={C_ART} strokeWidth="1.5" strokeDasharray="5 4" />
                      <circle cx={cx} cy={cy} r={R / 2} fill="none" stroke="#D8E4DD" strokeWidth="1" />
                      <line x1={cx - R - 14} y1={cy} x2={cx + R + 14} y2={cy} stroke="#E4E0D6" />
                      <line x1={cx} y1={cy - R - 14} x2={cx} y2={cy + R + 14} stroke="#E4E0D6" />
                      <text x={cx} y={cy - R - 4} fontSize="10" textAnchor="middle" fill="#8A94A0">สูง +</text>
                      <text x={cx} y={cy + R + 15} fontSize="10" textAnchor="middle" fill="#8A94A0">ต่ำ −</text>
                      <text x={cx - R - 16} y={cy + 3} fontSize="10" textAnchor="end" fill="#8A94A0">ซ้าย</text>
                      <text x={cx + R + 16} y={cy + 3} fontSize="10" fill="#8A94A0">ขวา</text>
                      <text x={cx + 4} y={cy - R + 14} fontSize="8.5" fill={C_ART}>±{HEAD_TOL_MM}mm</text>
                      {pts.map((p, i) => {
                        const hh = p.h != null ? p.h : (p.v != null ? 0 : null);
                        const vv = p.v != null ? p.v : (p.h != null ? 0 : null);
                        if (hh == null || vv == null) return null;
                        const x = cx + hh * sc, y = cy - vv * sc;
                        const out = Math.hypot(hh, vv) > HEAD_TOL_MM;
                        return (
                          <g key={i}>
                            <circle cx={x} cy={y} r="5.5" fill={out ? C_BREACH : p.c} stroke="#fff" strokeWidth="1.5" />
                            <text x={x + 9} y={y + 3} fontSize="10.5" fontWeight="700" fill={out ? C_BREACH : p.c}>{p.k}</text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                );
              })()}
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                {[["Head", latest && latest.headH, latest && latest.headV, C_HEAD], ["Art", latest && latest.artH, latest && latest.artV, C_ART], ["Tail", latest && latest.tailH, latest && latest.tailV, C_TAIL]].map(([l, h, v, c], i) => (
                  <div key={i} className="bg-surface-alt rounded-input border border-line p-2">
                    <div className="text-[10px] font-semibold" style={{ color: c }}>{l}</div>
                    <div className="text-[11px] font-mono text-ink">ดิ่ง {fmtMM(v)} · ราบ {fmtMM(h)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Cutterhead 3D (attitude, live) ── */}
            <div className="bg-surface rounded-card shadow-card border border-line p-5 sm:p-6">
              <h3 className="font-semibold text-ink text-base mb-1">หัวเจาะ 3D (ท่าทางด้านข้าง)</h3>
              <p className="text-xs text-ink-3 font-semibold mb-3">เทียบ<b className="text-ink-2">เฉพาะมุม ก้ม/เงย</b> ของริง {latest ? latest.ringNo : ""} (ขยายให้เห็นชัด) · ระยะห่างจากแนวออกแบบ ดูที่เป้า 2 แกน · ลากเพื่อหมุน สกอลล์เพื่อซูม</p>
              <HeadCutter3D posture={latest} machine={machine} readOnly={readOnly} printing={printing} className="w-full" />
            </div>
            </div>

            {/* ── Trend chart Head/Art/Tail ── */}
            <div className="bg-surface rounded-card shadow-card border border-line p-5 sm:p-6">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h3 className="font-semibold text-ink text-base">
                  แนวโน้มค่าเบี่ยง Head / Art / Tail
                  {view.length > 0 && <span className="ml-2 text-[11px] font-bold text-ink-3">P{winFrom}–P{winTo}</span>}
                </h3>
                <div className="flex gap-4 text-xs font-semibold">
                  <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-[3px] rounded" style={{ background: C_HEAD }} /> Head</span>
                  <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-[3px] rounded" style={{ background: C_ART }} /> Art</span>
                  <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-[3px] rounded" style={{ background: C_TAIL }} /> Tail</span>
                </div>
              </div>
              <p className="text-[11px] text-ink-3 font-semibold mb-3">
                แกน X = เลขริง · แถบเขียว = ช่วงยอมรับ ±{HEAD_TOL_MM} mm · พื้นแดง = ช่วงที่เกินเกณฑ์
              </p>
              <div className="flex gap-1.5 mb-3 print:hidden">
                {RANGE_OPTIONS.map((o) => (
                  <button key={o.value}
                    onClick={() => { setWinSize(o.value); setWinEnd(null); }}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-input border transition-colors ${
                      winSize === o.value ? "bg-navy text-white border-navy" : "bg-surface text-ink-3 border-line hover:bg-cyan-tint"
                    }`}>{o.label}</button>
                ))}
                {winEnd != null && (
                  <button onClick={() => setWinEnd(null)}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-input border border-line text-ink-3 bg-surface hover:bg-cyan-tint">
                    ← กลับไปริงล่าสุด
                  </button>
                )}
              </div>
              <div className="w-full" style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={view} margin={{ top: 12, right: 24, left: -6, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                    <XAxis dataKey="ringN" type="number" domain={["dataMin", "dataMax"]} allowDecimals={false}
                      tick={axisTick} axisLine={false} tickLine={false} minTickGap={28}
                      tickFormatter={(v) => `P${v}`}
                      label={{ value: "Ring No.", position: "insideBottomRight", offset: -4, style: { fontSize: 12, fill: chartColors.axisLabel, fontWeight: "bold" } }} />
                    <YAxis domain={yDomain} tick={axisTick} axisLine={false} tickLine={false}
                      label={{ value: "ค่าเบี่ยง (mm)", angle: -90, position: "insideLeft", offset: 16, style: { fontSize: 12, fill: chartColors.axisLabel, fontWeight: "bold" } }} />
                    <Tooltip {...tooltipStyle} labelFormatter={(v) => `Ring P${v}`} />
                    {spans.map((s, i) => (
                      <ReferenceArea key={i} x1={s.from} x2={s.to} fill={C_BREACH} fillOpacity={0.10} />
                    ))}
                    <ReferenceArea y1={-HEAD_TOL_MM} y2={HEAD_TOL_MM} fill="#2F5D50" fillOpacity={0.08} />
                    <ReferenceLine y={HEAD_TOL_MM} stroke="#2F5D50" strokeDasharray="5 5" label={{ position: "insideTopRight", value: `+${HEAD_TOL_MM}`, fill: "#2F5D50", fontSize: 11, fontWeight: "bold" }} />
                    <ReferenceLine y={-HEAD_TOL_MM} stroke="#2F5D50" strokeDasharray="5 5" label={{ position: "insideBottomRight", value: `−${HEAD_TOL_MM}`, fill: "#2F5D50", fontSize: 11, fontWeight: "bold" }} />
                    <ReferenceLine y={0} stroke="#B9C2CC" strokeWidth={1} />
                    <Line type="monotone" dataKey="tailV" stroke={C_TAIL} strokeWidth={1.8} dot={false} connectNulls name="Tail" isAnimationActive={!printing} />
                    <Line type="monotone" dataKey="artV" stroke={C_ART} strokeWidth={1.8} dot={false} connectNulls name="Art" isAnimationActive={!printing} />
                    <Line type="monotone" dataKey="headV" stroke={C_HEAD} strokeWidth={2.6} dot={false} connectNulls name="Head" isAnimationActive={!printing} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <HeadTrendContext series={chartData} tol={HEAD_TOL_MM}
                windowFrom={winFrom} windowTo={winTo}
                onPick={(r) => setWinEnd(r)} />
            </div>

            {/* ── VRT bar chart ── */}
            {vrtData.length > 0 && (
              <div className="bg-surface rounded-card shadow-card border border-line p-5 sm:p-6">
                <h3 className="font-semibold text-ink text-base mb-1">VRT (°) ต่อริง</h3>
                <p className="text-[11px] text-ink-3 font-semibold mb-3">
                  มุมงอข้อต่อ articulation แนวดิ่ง — ค่าบวก = บังคับหัวขึ้น · ยิ่งมาก = ยิ่งดัดกลับแรง · แดง = |VRT| ≥ 0.3°
                </p>
                <div className="w-full" style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={vrtData} margin={{ top: 16, right: 24, left: -6, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                      <XAxis dataKey="ring" tick={axisTick} axisLine={false} tickLine={false} minTickGap={24} />
                      <YAxis domain={[-0.6, 0.6]} tick={axisTick} axisLine={false} tickLine={false} />
                      <Tooltip {...tooltipStyle} />
                      <ReferenceLine y={0} stroke={chartColors.axis} />
                      <Bar dataKey="vrt" radius={[2, 2, 0, 0]} maxBarSize={22} isAnimationActive={!printing}>
                        {vrtData.map((d, i) => <Cell key={i} fill={Math.abs(d.vrt) >= 0.3 ? C_BREACH : "#6A8CA0"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
