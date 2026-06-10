import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  MapPin, Ruler, Settings, Printer, Maximize2, Plus, Save, Trash2, X, Loader2, TrendingUp
} from "lucide-react";
import { filterByState } from "../../hooks/useGlobalFilter";
import { formatDisplayDate } from "../../utils/formatters";
import { getRingNumeric } from "../../utils/helpers";
import { TOTAL_ROUTE_DISTANCE, ROUTE_SEGMENTS } from "../../utils/constants";
import { apiCall } from "../../utils/api";
import { loadDistancePlan, saveDistancePlan } from "../../utils/planConfig";
import { chartColors, axisTick, tooltipStyle } from "../../ui-ux-pro-max/chartTheme";
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Line, ReferenceLine
} from "recharts";

const RouteScheduleView = ({ segmentRecords = [], projectInfo, machine = "TBM1", filterState = {}, readOnly = false }) => {
  const filteredSegments = useMemo(() => filterByState(segmentRecords, filterState), [segmentRecords, filterState]);

  // ── Print State ──
  const [printingChartId, setPrintingChartId] = useState("all");

  const printGroupRef = useRef(null);

  const handlePrintSpecificChart = (chartId) => {
    setPrintingChartId(chartId);
    setTimeout(() => {
      // fit-to-one-page แนวนอน: วัด print group ใน layout ปกติ แล้วย่อด้วย CSS zoom (ย่อ layout box จริง
      // ไม่เหลือกล่องสูงเกินไปดันหน้า 2 แบบ transform) — ตั้ง inline + !important ให้ชนะทุก stylesheet
      const grp = printGroupRef.current;
      const mainDiv = document.querySelector("main > div"); // globals สั่ง scale(0.88) ตอนปริ้น — ยกเลิกชั่วคราว
      let cleanup = () => {};
      if (grp && grp.scrollWidth > 0 && grp.scrollHeight > 0) {
        const PAGE_W = 1020, PAGE_H = 680; // A4 landscape − margin 10mm @96dpi − เผื่อ header/footer ของ browser (ของจริงกินพื้นที่เกิน margin)
        const W = grp.scrollWidth, H = grp.scrollHeight;
        const s = Math.min(PAGE_W / W, PAGE_H / H, 1) * 0.99; // ×0.99 กันปัดเศษ zoom เกินหน้า
        grp.style.setProperty("width", `${W}px`, "important"); // freeze layout กว้างเท่าจอ (recharts SVG ไม่ reflow ตอนปริ้น)
        grp.style.zoom = String(s);
        if (mainDiv) mainDiv.style.setProperty("transform", "none", "important");
        cleanup = () => {
          grp.style.removeProperty("width");
          grp.style.zoom = "";
          if (mainDiv) mainDiv.style.removeProperty("transform");
        };
      }
      window.print();
      cleanup();
      setPrintingChartId("all");
    }, 350);
  };

  const getPrintClass = (id) => {
    return printingChartId === "all" ? "" : (printingChartId === id ? "print-target" : "print:hidden");
  };

  // ── Distance Filter State ──
  const [distFilterMode, setDistFilterMode] = useState("all");
  const [distRangeStart, setDistRangeStart] = useState("");
  const [distRangeEnd, setDistRangeEnd] = useState("");
  const [expandedChart, setExpandedChart] = useState(null);

  // ── Distance Plan Config ──
  const [showDistPlanModal, setShowDistPlanModal] = useState(false);
  const [distPlanConfig, setDistPlanConfig] = useState(() => loadDistancePlan(machine));
  // โหลดแผนใหม่เมื่อสลับหัวขณะอยู่หน้านี้
  useEffect(() => { setDistPlanConfig(loadDistancePlan(machine)); }, [machine]);

  // ── Distance Plan settings handlers ──
  const [isSavingDistPlan, setIsSavingDistPlan] = useState(false);
  const handleSaveDistPlanSettings = async () => {
    if (readOnly) return;
    setIsSavingDistPlan(true);
    try {
      saveDistancePlan(machine, distPlanConfig);
      // GAS sync เฉพาะ TBM1 (per-machine GAS = future); หัวอื่น = local-only
      if (machine === "TBM1") {
        const planConfig = JSON.parse(localStorage.getItem("tbmPlanConfig") || "null") || { basePlanAcc: 0, baseActualAcc: 0, ranges: [] };
        await apiCall("savePlanConfig", { machine, planConfig, distPlanConfig });
      }
      setShowDistPlanModal(false);
    } catch (e) {
      console.error("Failed to save distance plan config", e);
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูลไปยัง Server");
    } finally {
      setIsSavingDistPlan(false);
    }
  };
  const addDistPlanRange = () => setDistPlanConfig({ ...distPlanConfig, ranges: [...(distPlanConfig.ranges || []), { startMonth: "", endMonth: "", mode: "rings", ringsPerDay: 0, avgLength: 1.2, distancePerMonth: 0 }] });
  const removeDistPlanRange = (index) => { const r = [...(distPlanConfig.ranges || [])]; r.splice(index, 1); setDistPlanConfig({ ...distPlanConfig, ranges: r }); };

  // ══════════════════════════════════════════════
  // HELPER: Smart deduplicate — เลือก Completed ก่อน, ถ้าไม่มีใช้แถวสุดท้าย
  // ══════════════════════════════════════════════
  const deduplicateRecords = (records) => {
    const map = new Map();
    records.forEach(r => {
      const key = r.ringNo;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, r);
      } else {
        if (existing.status === "In Progress" && r.status !== "In Progress") {
          map.set(key, r);
        } else if (existing.status === r.status) {
          map.set(key, r);
        }
      }
    });
    return Array.from(map.values());
  };

  // ══════════════════════════════════════════════
  // SECTION: Distance Chart Data (รายเดือน)
  // ══════════════════════════════════════════════

  const distanceChartData = useMemo(() => {
    const allDeduped = deduplicateRecords(filteredSegments);

    // ใช้เฉพาะ Ring ถาวร (ให้สอดคล้องกับ Total Distance) ไม่ตัด In Progress ออกแล้ว
    const completedPermRings = allDeduped.filter(r => r.installType !== "Temporary");

    completedPermRings.sort((a, b) => {
      const prefA = String(a.ringNo).replace(/\d/g, '');
      const prefB = String(b.ringNo).replace(/\d/g, '');
      if (prefA !== prefB) return prefA.localeCompare(prefB);
      return getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo);
    });

    const monthsMap = new Map();
    const carryOverMonth = "2025-11";

    completedPermRings.forEach(rec => {
      const dDate = formatDisplayDate(rec.date);
      if (!dDate) return;
      let monthKey = dDate.slice(0, 7);

      // ถ้ายอดเกิดก่อน พ.ย. 68 (2025-11) ให้ปัดไปรวมใน พ.ย. 68 (ยกยอดตามความต้องการ)
      if (monthKey < carryOverMonth) {
        monthKey = carryOverMonth;
      }

      if (!monthsMap.has(monthKey)) monthsMap.set(monthKey, { month: monthKey, distance: 0, rings: 0, hasActual: true });
      const d = monthsMap.get(monthKey);
      d.distance += parseFloat(rec.length || 0);
      d.rings++;
    });

    // เริ่มสร้าง sequence เดือนตั้งแต่เดือนแรกที่มีข้อมูล
    let minMonth = "2024-11";
    if (monthsMap.size > 0) {
      minMonth = Array.from(monthsMap.keys()).sort()[0];
    }

    // หาเดือนปัจจุบัน (เวลาไทย)
    const now = new Date();
    const nowTH = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    const currentMonth = `${nowTH.getFullYear()}-${String(nowTH.getMonth() + 1).padStart(2, '0')}`;

    // เดือนสุดท้ายของโครงการ: ก.ย. 2028 (ก.ย. 71)
    const projectEndMonth = "2028-09";

    let currentActualAcc = 0;
    let currentPlanAcc = 0;
    let currentMonthStr = minMonth;
    const result = [];

    // สร้างข้อมูลจนถึง ก.ย. 71 เต็มโครงการ
    let loopCount = 0;
    while (currentMonthStr <= projectEndMonth && loopCount < 100) {
      let mData = monthsMap.get(currentMonthStr);
      let distThisMonth = mData ? mData.distance : 0;

      // Actual: นับเฉพาะเดือนที่มีข้อมูลจริงหรือเดือนที่ผ่านมาแล้ว
      if (currentMonthStr <= currentMonth) {
        currentActualAcc += distThisMonth;
      }

      // คำนวณ Plan สำหรับเดือนนี้
      let monthPlan = 0;
      if (distPlanConfig.ranges && distPlanConfig.ranges.length > 0) {
        for (const range of distPlanConfig.ranges) {
          if ((!range.startMonth || currentMonthStr >= range.startMonth) && (!range.endMonth || currentMonthStr <= range.endMonth)) {
            if (range.mode === "distance") {
              monthPlan = parseFloat(range.distancePerMonth) || 0;
            } else {
              const ringsPerDay = parseFloat(range.ringsPerDay) || 0;
              const avgLen = parseFloat(range.avgLength) || 1.2;
              monthPlan = ringsPerDay * avgLen * 30;
            }
            break;
          }
        }
      }
      currentPlanAcc += monthPlan;
      if (currentPlanAcc > TOTAL_ROUTE_DISTANCE) currentPlanAcc = TOTAL_ROUTE_DISTANCE;

      const [y, mo] = currentMonthStr.split("-");
      const thMonths = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
      const buddhistYear = (parseInt(y) + 543).toString().slice(-2);
      const displayMonth = `${thMonths[parseInt(mo) - 1]} ${buddhistYear}`;

      // Actual: เดือนอนาคตไม่แสดงจุด
      const isActualAvailable = currentMonthStr <= currentMonth;

      result.push({
        month: currentMonthStr,
        displayMonth,
        actualAcc: isActualAvailable ? (currentActualAcc > 0 ? Math.round(currentActualAcc * 10) / 10 : (mData ? 0 : 0)) : null,
        planAcc: Math.round(currentPlanAcc * 10) / 10,
        hasActual: !!mData,
        isFuture: currentMonthStr > currentMonth
      });

      // Next month
      let ny = parseInt(y);
      let nm = parseInt(mo) + 1;
      if (nm > 12) { nm = 1; ny++; }
      currentMonthStr = `${ny}-${String(nm).padStart(2, '0')}`;
      loopCount++;
    }

    return result;
  }, [segmentRecords, filteredSegments, distPlanConfig]);

  // ระยะสะสมรวม (ทั้งหมด ไม่ filter) สำหรับ TBM position + summary
  const totalActualDistance = useMemo(() => {
    // หาค่า actualAcc ล่าสุดที่ไม่ใช่ null
    for (let i = distanceChartData.length - 1; i >= 0; i--) {
      if (distanceChartData[i].actualAcc !== null && distanceChartData[i].actualAcc > 0) {
        return distanceChartData[i].actualAcc;
      }
    }
    return 0;
  }, [distanceChartData]);

  // Filter ตามช่วงเดือน
  const filteredDistanceChartData = useMemo(() => {
    if (distFilterMode === "all" || !distRangeStart || !distRangeEnd) return distanceChartData;
    return distanceChartData.filter(d => d.month >= distRangeStart && d.month <= distRangeEnd);
  }, [distanceChartData, distFilterMode, distRangeStart, distRangeEnd]);

  const totalPlanDistance = useMemo(() => {
    // ใช้ planAcc ณ เดือนปัจจุบัน (ไม่ใช่เดือนสุดท้ายของโครงการ)
    const now = new Date();
    const nowTH = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    const currentMonth = `${nowTH.getFullYear()}-${String(nowTH.getMonth() + 1).padStart(2, '0')}`;

    const currentMonthData = distanceChartData.find(d => d.month === currentMonth);
    if (currentMonthData) return currentMonthData.planAcc;

    // fallback: หาเดือนที่ใกล้เคียงที่สุดที่ไม่เกินเดือนปัจจุบัน
    for (let i = distanceChartData.length - 1; i >= 0; i--) {
      if (distanceChartData[i].month <= currentMonth) {
        return distanceChartData[i].planAcc;
      }
    }
    return 0;
  }, [distanceChartData]);

  // Delay warning
  const distanceDelay = useMemo(() => {
    if (totalPlanDistance <= 0) return null;
    const diff = totalPlanDistance - totalActualDistance;
    if (diff <= 0) return null;
    const ratePerMonth = 300;
    const monthsDelay = diff / ratePerMonth;
    return { diff: Math.round(diff * 100) / 100, months: Math.round(monthsDelay * 100) / 100, rate: ratePerMonth };
  }, [totalActualDistance, totalPlanDistance]);

  // คำนวณตำแหน่ง X (%) ของสถานีบน Route Progress โดยใช้ระยะจริง
  const routeStationPlacements = useMemo(() => {
    return ROUTE_SEGMENTS.map(seg => {
      const xPercent = TOTAL_ROUTE_DISTANCE > 0 ? (seg.distance / TOTAL_ROUTE_DISTANCE) * 100 : 0;
      return { ...seg, xPercent: Math.min(100, Math.max(0, xPercent)) };
    });
  }, []);

  const forecast = useMemo(() => {
    const data = distanceChartData;
    if (!data || data.length === 0 || totalActualDistance <= 0) return null;
    const firstIdx = data.findIndex((d) => d.actualAcc !== null && d.actualAcc > 0);
    let lastIdx = -1;
    for (let i = data.length - 1; i >= 0; i--) { if (data[i].actualAcc !== null && data[i].actualAcc > 0) { lastIdx = i; break; } }
    if (firstIdx < 0 || lastIdx < 0) return null;
    const elapsedMonths = Math.max(1, lastIdx - firstIdx + 1);
    const currentRate = totalActualDistance / elapsedMonths; // m/month
    const remaining = Math.max(0, TOTAL_ROUTE_DISTANCE - totalActualDistance);
    const monthsToFinish = currentRate > 0 ? remaining / currentRate : null;
    const [cy, cm] = data[lastIdx].month.split("-").map(Number);
    const curIdx = cy * 12 + (cm - 1);
    const thMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const fmtThai = (idx) => `${thMonths[((idx % 12) + 12) % 12]} ${String(Math.floor(idx / 12) + 543).slice(-2)}`;
    const finishIdx = monthsToFinish != null ? curIdx + Math.ceil(monthsToFinish) : null;
    const forecastLabel = finishIdx != null ? fmtThai(finishIdx) : "—";
    const deadlineIdx = 2028 * 12 + 8; // ก.ย. 2028 (month index 8)
    const monthsToDeadline = Math.max(0, deadlineIdx - curIdx);
    const requiredRate = monthsToDeadline > 0 ? remaining / monthsToDeadline : 0;
    const onTime = finishIdx != null && finishIdx <= deadlineIdx;
    return { currentRate, remaining, forecastLabel, requiredRate, onTime };
  }, [distanceChartData, totalActualDistance]);

  return (
    <div className="max-w-full mx-auto pb-24 animate-fade-in space-y-6">
      <style>{`
        @media print {
          @page { size: landscape; margin: 10mm; }
          body { background: white !important; }
          .print-target { page-break-inside: avoid !important; }
        }
      `}</style>

      {/* ═══ SECTION 3.5: แผนผังสถานะเส้นทางและตำแหน่ง TBM1 ปัจจุบัน ═══ */}
      {/* print group: zoom-to-fit หน้าเดียวใน handlePrintSpecificChart (การ์ดคาดการณ์อยู่นอก group + print:hidden) */}
      <div ref={printGroupRef} className={`space-y-6 ${getPrintClass('distance')}`}>
      <div className="bg-surface p-4 sm:p-6 rounded-card shadow-card border border-line flex flex-col gap-2 overflow-x-auto">
        {/* Header แถวที่ 1 */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-navy-dark tracking-tight">
              แผนผังสถานะเส้นทางและตำแหน่ง {projectInfo?.tbmNo || "TBM"} ปัจจุบัน
            </h2>
            <div className="text-xs sm:text-sm text-ink-2 mt-2 font-medium tracking-tight space-y-0.5">
              <p><span className="font-semibold text-ink">เฟส 1 (Main Bore):</span> IS4-1 → IS2 → IS1 TBM เจาะต่อเนื่อง (เฟสปัจจุบัน)</p>
              <p><span className="font-semibold text-ink">เฟส 2 (Extension):</span> IS3 → เจาะเข้าอุโมงค์หลัก — TBM เจาะต่อไป ส่วนเชื่อม IS3 รอก่อสร้างในภายหลัง</p>
            </div>
          </div>
          <div className="text-right mt-4 md:mt-0 flex items-center gap-3">
            {!readOnly && (
              <button onClick={() => handlePrintSpecificChart('distance')} className="p-2 text-ink-3 hover:text-navy bg-surface hover:bg-cyan-tint rounded-input transition-colors border border-line shadow-card print:hidden" title="Print Chart"><Printer size={18} /></button>
            )}
            <button onClick={() => setExpandedChart('distance')} className="p-2 text-ink-3 hover:text-navy bg-surface hover:bg-cyan-tint rounded-input transition-colors border border-line shadow-card print:hidden" title="Expand Chart"><Maximize2 size={18} /></button>
            <span className="bg-navy-dark text-white text-xs font-semibold px-4 py-2 rounded-input shadow-card">
              อัปเดตล่าสุด: {formatDisplayDate(new Date())}
            </span>
          </div>
        </div>

        {/* Header แถวที่ 2: Legends และ Delay Warning */}
        <div className="flex flex-col lg:flex-row justify-between items-center bg-surface-alt p-3 rounded-input border border-line">
          <div className="flex flex-wrap gap-6 items-center w-full lg:w-auto justify-center">
            <div className="flex items-center gap-2">
              <span className="w-8 h-1 rounded-full" style={{ backgroundColor: chartColors.delay }}></span>
              <span className="text-sm font-semibold text-ink">Actual Acc. (ผลงานจริงสะสม)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-0.5"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: chartColors.planned }}></span><span className="w-5 h-1 rounded-full" style={{ backgroundColor: chartColors.planned }}></span></span>
              <span className="text-sm font-semibold text-ink">Plan Acc. (แผนงานสะสม)</span>
            </div>
            {!readOnly && (
              <button onClick={() => setShowDistPlanModal(true)} className="p-1.5 text-ink-3 hover:text-navy hover:bg-cyan-tint rounded-input transition-colors border border-transparent shadow-card print:hidden" title="Distance Plan Settings"><Settings size={18} /></button>
            )}
          </div>

          {/* Project Delay Warning Box */}
          {distanceDelay && (
            <div className="flex items-center gap-3 bg-code-d/10 border border-code-d/30 px-4 py-2 rounded-input shadow-card mt-4 lg:mt-0 lg:ml-auto">
              <div className="w-8 h-8 rounded-full bg-code-d/20 flex justify-center items-center overflow-hidden border border-code-d/30">
                <span className="text-code-d font-semibold text-lg">!</span>
              </div>
              <div className="text-left">
                <p className="text-[10px] font-semibold text-code-d mb-0.5 tracking-widest uppercase">Project Delay Warning</p>
                <p className="text-xs font-semibold text-ink">
                  ล่าช้ากว่าแผน: <span className="font-mono" style={{ color: chartColors.delay }}>{distanceDelay.diff.toLocaleString()} ม.</span>
                  <span className="text-[10px] text-ink-2 font-medium ml-1">({distanceDelay.months} เดือน)</span>
                  <span className="text-[10px] text-code-d font-medium ml-1">(คิดที่ {distanceDelay.rate} ม./เดือน)</span>
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="h-[380px] sm:h-[460px] w-full relative z-10">
          <div className="w-full h-full pl-2 pr-4 sm:pr-8">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={filteredDistanceChartData} margin={{ top: 35, right: 30, left: 10, bottom: 15 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} stroke={chartColors.grid} />
                <XAxis
                  dataKey="displayMonth"
                  tick={axisTick}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tickMargin={15}
                  axisLine={{ stroke: chartColors.axis, strokeWidth: 1 }}
                  interval={0}
                  label={{ value: "เดือน/ปี", position: "insideBottomRight", offset: -5, style: { fontSize: 11, fill: chartColors.axisLabel, fontWeight: "bold" } }}
                />
                <YAxis
                  domain={[0, 10000]}
                  ticks={[0, 2500, 5000, 7500, 10000]}
                  tick={axisTick}
                  axisLine={{ stroke: chartColors.axis, strokeWidth: 1 }}
                  tickLine={{ stroke: chartColors.axis }}
                  label={{ value: "ระยะทาง (เมตร)", angle: 0, position: "top", offset: 20, style: { fontSize: 11, fill: chartColors.axisLabel, fontWeight: "bold" } }}
                  width={60}
                  tickFormatter={val => val.toLocaleString()}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(val, name) => {
                    if (val === null || val === undefined) return ['-', name === "planAcc" ? "แผนงานสะสม" : "ผลงานจริงสะสม"];
                    return [`${Number(val).toLocaleString()} m`, name === "planAcc" ? "แผนงานสะสม" : "ผลงานจริงสะสม"];
                  }}
                />

                {/* เส้น Plan — แสดงเต็มจนถึง ก.ย. 71 */}
                <Line
                  type="monotone"
                  dataKey="planAcc"
                  stroke={chartColors.planned}
                  strokeWidth={3}
                  connectNulls={false}
                  activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                  isAnimationActive={printingChartId === "all"}
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    if (cx === undefined || cy === undefined) return null;
                    return (
                      <g key={`dot-plan-${payload.month}`}>
                        <circle cx={cx} cy={cy} r={4} fill={chartColors.planned} />
                        {payload.planAcc > 0 && <text x={cx} y={cy - 12} fill={chartColors.planned} fontSize={9} fontWeight="bold" textAnchor="middle">{payload.planAcc.toLocaleString(undefined, {maximumFractionDigits:0})}</text>}
                      </g>
                    );
                  }}
                />

                {/* เส้น Actual — หยุดที่เดือนปัจจุบัน */}
                <Line
                  type="monotone"
                  dataKey="actualAcc"
                  stroke={chartColors.delay}
                  strokeWidth={3}
                  connectNulls={true}
                  activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                  isAnimationActive={printingChartId === "all"}
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    if (payload.actualAcc === null || payload.actualAcc === undefined || cx === undefined || cy === undefined) return null;
                    return (
                      <g key={`dot-act-${payload.month}`}>
                        <rect x={cx - 4} y={cy - 4} width={8} height={8} fill={chartColors.delay} rx={1} />
                        {payload.actualAcc > 0 && <text x={cx} y={cy + 18} fill={chartColors.delay} fontSize={9} fontWeight="bold" textAnchor="middle">{payload.actualAcc.toLocaleString(undefined, {maximumFractionDigits:0})}</text>}
                      </g>
                    );
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ═══ ส่วนที่ 2: Progress Bar — เปรียบเทียบแผน vs ผลงาน ณ เดือนปัจจุบัน ═══ */}
        <div className="relative min-w-[700px] overflow-hidden bg-surface-alt border border-line rounded-input p-4 shadow-card">
          {/* หัวข้อ + ระยะทางรวม */}
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold text-ink-2 uppercase tracking-wider">เปรียบเทียบ ณ เดือนปัจจุบัน</span>
            <span className="text-[11px] font-semibold text-ink-2">ระยะโครงการ: <span className="text-ink font-mono font-semibold">{TOTAL_ROUTE_DISTANCE.toLocaleString()} ม.</span></span>
          </div>

          <div className="flex flex-col gap-3 relative z-20">
            {/* แผนงานสะสม ณ เดือนปัจจุบัน */}
            <div className="flex items-center h-[38px]">
              <span className="w-32 text-xs font-semibold text-ink shrink-0">แผนงานสะสม</span>
              <div className="flex-1 h-full rounded-input border border-line relative overflow-hidden bg-surface-page">
                {totalPlanDistance > 0 ? (
                  <>
                    <div
                      className="h-full bg-navy-dark rounded-input flex items-center justify-end px-3 relative z-10 shadow-card transition-all duration-700"
                      style={{ width: `${Math.max((totalPlanDistance / TOTAL_ROUTE_DISTANCE) * 100, 5)}%` }}
                    >
                      <span className="text-white text-xs font-mono font-semibold drop-shadow-md whitespace-nowrap">{totalPlanDistance.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                    </div>
                    {/* ส่วนเหลือของโครงการ (สีจาง) */}
                    <div className="absolute top-0 right-2 h-full flex items-center z-0">
                      <span className="text-[9px] font-semibold text-ink-3">{TOTAL_ROUTE_DISTANCE.toLocaleString()}</span>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-ink-2 text-xs font-semibold">{readOnly ? "ยังไม่ตั้งค่าแผน" : "ยังไม่ตั้งค่าแผน — กดปุ่ม ⚙️ เพื่อตั้งค่า"}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ผลงานจริง */}
            <div className="flex items-center h-[38px] relative">
              <span className="w-32 text-xs font-semibold text-ink shrink-0">ผลงานจริง</span>
              <div className="flex-1 h-full rounded-input border border-line relative overflow-hidden bg-surface-page">
                {(() => {
                  const planPercent = totalPlanDistance > 0 ? (totalPlanDistance / TOTAL_ROUTE_DISTANCE) * 100 : 0;
                  const actualPercent = (totalActualDistance / TOTAL_ROUTE_DISTANCE) * 100;
                  const gapWidth = planPercent - actualPercent;

                  return (
                    <>
                      {/* ส่วนที่ทำได้ (สีเขียว) */}
                      {totalActualDistance > 0 && (
                        <div
                          className="absolute top-0 left-0 h-full bg-sgreen-dark flex items-center justify-center z-10 shadow-card transition-all duration-700"
                          style={{ width: `${Math.max(actualPercent, 3)}%`, borderRight: totalPlanDistance > 0 ? '2px solid #0C2C65' : 'none' }}
                        >
                          <span className="text-white text-[10px] font-mono font-semibold whitespace-nowrap px-1 drop-shadow-md">
                            {totalActualDistance.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                          </span>
                        </div>
                      )}
                      {/* ส่วนที่ยังขาดจากแผน (ลายขวาง) */}
                      {totalPlanDistance > 0 && gapWidth > 0 && (
                        <div
                          className="absolute top-0 h-full flex items-center justify-center z-5"
                          style={{
                            left: `${actualPercent}%`,
                            width: `${gapWidth}%`,
                            backgroundImage: "repeating-linear-gradient(45deg, #fecaca 0px, #fecaca 6px, #fff 6px, #fff 12px)"
                          }}
                        >
                          <span className="text-code-d text-[9px] font-mono font-semibold bg-white/90 px-1.5 py-0.5 rounded-badge shadow-card whitespace-nowrap border border-code-d/30 z-10 relative">
                            -{(totalPlanDistance - totalActualDistance).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                          </span>
                        </div>
                      )}
                      {/* ส่วนเหลือของโครงการ */}
                      <div className="absolute top-0 right-2 h-full flex items-center z-0">
                        <span className="text-[9px] font-semibold text-ink-3">{TOTAL_ROUTE_DISTANCE.toLocaleString()}</span>
                      </div>
                      {/* ไม่มีผลงานเลย */}
                      {totalActualDistance === 0 && (
                        <div className="w-full h-full flex items-center justify-center z-20 relative">
                          <span className="text-ink-3 text-[10px] font-semibold">ยังไม่มีผลงาน</span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ ส่วนที่ 3: Route Progress — แสดงเต็มเส้นทาง ═══ */}
        <div className="relative min-w-[700px] overflow-hidden bg-surface border border-line rounded-input p-4 shadow-card">
          <style>{`
            .track-pattern {
              background-image: repeating-linear-gradient(90deg, transparent, transparent 15px, #94a3b8 15px, #94a3b8 18px);
            }
            .track-pattern-light {
              background-image: repeating-linear-gradient(90deg, transparent, transparent 15px, #cbd5e1 15px, #cbd5e1 18px);
            }
            .track-pattern-vertical {
              background-image: repeating-linear-gradient(0deg, transparent, transparent 10px, #94a3b8 10px, #94a3b8 13px);
            }
            .track-pattern-light-vertical {
              background-image: repeating-linear-gradient(0deg, transparent, transparent 10px, #cbd5e1 10px, #cbd5e1 13px);
            }
          `}</style>

          <div className="flex justify-between items-center mb-2">
            <span className="text-ink-2 text-[11px] font-semibold tracking-[0.2em] uppercase">Route Progress</span>
          </div>

          <div className="relative mx-4 sm:mx-8" style={{ height: '95px' }}>
            {/* แถบรางเฟส 1: IS4-1 → IS1 (ต่อเนื่อง สีปกติ) */}
            <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[18px] bg-surface-alt border-y-[3px] border-line track-pattern shadow-card z-0"></div>

            {/* พื้นที่ของผลงานจริง */}
            <div
              className="absolute top-1/2 -translate-y-1/2 left-0 h-[32px] rounded-l-full z-1 transition-all duration-1000"
              style={{ width: `${Math.min((totalActualDistance / TOTAL_ROUTE_DISTANCE) * 100, 100)}%`, backgroundColor: `${chartColors.delay}33`, border: `1px solid ${chartColors.delay}66` }}
            ></div>

            {/* เส้นแบ่งเฟสแนวตั้งประที่ IS3 */}
            {(() => {
              const is3Seg = routeStationPlacements.find(s => s.id === "IS3");
              if (!is3Seg) return null;
              return (
                <div
                  className="absolute z-20"
                  style={{ left: `${is3Seg.xPercent}%`, top: 'calc(50% - 16px)', transform: 'translateX(-50%)', width: 2, height: 32, borderLeft: "2.5px dashed #f59e0b" }}
                />
              );
            })()}

            {/* อุโมงค์แยกส่วนแนวตั้งที่ IS3 (สีอ่อนกว่า) */}
            {(() => {
              const is3Seg = routeStationPlacements.find(s => s.id === "IS3");
              if (!is3Seg) return null;
              return (
                <div
                  className="absolute z-0"
                  style={{ left: `calc(${is3Seg.xPercent}%)`, top: 'calc(50% - 30px)', width: 2, height: '25px', borderLeft: '1.5px dashed #f59e0b' }}
                />
              );
            })()}

            {/* หมุดสถานี */}
            {routeStationPlacements.map((seg, i) => {
              if (i === 0) return null;
              const prevSeg = routeStationPlacements[i - 1];
              const isIS3 = seg.id === "IS3";
              return (
                <React.Fragment key={`route-${seg.id}`}>
                  {/* กรอบแสดงระยะระหว่างสถานี */}
                  <div
                    className="absolute -top-6 -translate-x-1/2 bg-surface border-2 border-navy rounded-full px-2 py-0.5 text-[9px] font-semibold font-mono text-ink shadow-card whitespace-nowrap z-10"
                    style={{ left: `${(prevSeg.xPercent + seg.xPercent) / 2}%` }}
                  >
                    {((seg.distance - ROUTE_SEGMENTS[i - 1].distance)).toLocaleString(undefined, { minimumFractionDigits: 3 })} m
                  </div>

                  {/* หมุดสถานี */}
                  <div
                    className="absolute flex flex-col items-center justify-center z-20"
                    style={isIS3 ? { left: `${seg.xPercent}%`, top: `calc(50% - 38px)`, transform: 'translateX(-50%) translateY(-50%)' } : { left: `${seg.xPercent}%`, top: `50%`, transform: 'translateX(-50%) translateY(-50%)' }}
                  >
                    {isIS3 ? (
                      <div className="relative flex flex-col items-center">
                        <span className="absolute whitespace-nowrap text-[9px] font-semibold text-code-b bg-code-b/10 border border-code-b/30 px-1.5 py-0.5 rounded-badge shadow-card tracking-wide" style={{ top: -24 }}>
                          D-wall
                        </span>
                        <div className="relative bg-navy-dark border-[1.5px] border-navy rounded-input p-1 shadow-card flex items-center justify-center z-10 w-11 h-11 pointer-events-none">
                          <div className="bg-surface w-full h-full flex items-center justify-center rounded-badge">
                            <div className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[10px] font-semibold" style={{ backgroundColor: chartColors.planned }}>
                              {seg.label.replace("IS", "")}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="relative w-9 h-9 rounded-full border-[4px] border-white shadow-hover text-white flex items-center justify-center text-[10px] font-semibold z-10 tracking-tighter" style={{ backgroundColor: chartColors.planned }}>
                        {seg.label.replace("IS", "")}
                      </div>
                    )}
                    <span className="absolute text-[10px] font-semibold text-ink whitespace-nowrap" style={{ top: isIS3 ? 66 : 44 }}>{seg.label}</span>
                  </div>
                </React.Fragment>
              );
            })}

            {/* หมุดสถานีแรก (ซ้ายสุด) */}
            <div className="absolute top-1/2 -translate-y-1/2 left-0 -translate-x-1/2 flex flex-col items-center justify-center z-20">
              <div className="relative w-9 h-9 rounded-full border-[4px] border-white shadow-hover text-white flex items-center justify-center text-[10px] font-semibold z-10 tracking-tighter" style={{ backgroundColor: chartColors.planned }}>
                {ROUTE_SEGMENTS[0].label.replace("IS", "")}
              </div>
              <span className="absolute top-11 text-[10px] font-semibold text-ink whitespace-nowrap">{ROUTE_SEGMENTS[0].label}</span>
            </div>

            {/* หมุดสถานีปัจจุบัน (TBM) */}
            <div
              className="absolute top-1/2 -translate-y-1/2 z-30 transition-all duration-[1500ms] ease-out"
              style={{ left: `${Math.min((totalActualDistance / TOTAL_ROUTE_DISTANCE) * 100, 100)}%`, transform: 'translateX(-50%) translateY(-50%)' }}
            >
              <div className="relative drop-shadow-xl group cursor-pointer">
                <span className="absolute -inset-2 rounded-full opacity-40 animate-ping" style={{ backgroundColor: chartColors.delay }}></span>
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold text-ink bg-surface/90 backdrop-blur-sm px-1.5 py-0.5 rounded-badge shadow-card border border-line z-50">
                  Progress : {((totalActualDistance / TOTAL_ROUTE_DISTANCE) * 100).toFixed(2)} %
                </div>
                <div className="w-8 h-8 bg-navy border-[3px] border-white flex items-center justify-center rounded-badge rotate-90 relative z-10 shadow-hover overflow-hidden">
                  <div className="w-full h-[60%] bg-navy-dark absolute bottom-0 left-0"></div>
                  <div className="w-full h-[2px] bg-white opacity-50 absolute top-[40%] left-0"></div>
                  <span className="text-[8px] text-white font-semibold z-10 -rotate-90">{projectInfo?.tbmNo || "TBM"}</span>
                </div>
                <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-navy-dark text-white text-[10px] px-3 py-1.5 rounded-input font-semibold whitespace-nowrap shadow-modal opacity-0 group-hover:opacity-100 transition-opacity z-40 pointer-events-none">
                  {projectInfo?.tbmNo || "TBM"}: {totalActualDistance.toLocaleString()} m ({(totalActualDistance / TOTAL_ROUTE_DISTANCE * 100).toFixed(1)}%)
                </div>
              </div>
            </div>
          </div>
          {/* spacer below route */}
          <div className="h-8"></div>
        </div>
      </div>
      </div>{/* /print group */}

      {/* คาดการณ์ — ไม่พิมพ์ (user: "ไม่ต้องปริ้นส่วนนี้") */}
      {forecast && (
        <div className="bg-surface rounded-card p-5 shadow-card border border-line print:hidden">
          <h3 className="font-semibold text-ink text-base mb-3 flex items-center gap-2"><TrendingUp size={18} className="text-navy" /> คาดการณ์ (Forecast)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs font-semibold text-ink-3 uppercase mb-1">คาดเสร็จ (rate ปัจจุบัน)</div>
              <div className={`text-xl font-semibold font-mono ${forecast.onTime ? "text-sgreen-dark" : "text-code-d"}`}>{forecast.forecastLabel}</div>
              <div className="text-[11px] text-ink-2 mt-0.5">{forecast.onTime ? "✓ ทันกำหนด ก.ย. 71" : "⚠ ช้ากว่ากำหนด ก.ย. 71"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-ink-3 uppercase mb-1">rate ปัจจุบัน</div>
              <div className="text-xl font-semibold font-mono text-navy">{forecast.currentRate.toFixed(0)} <span className="text-xs text-ink-3">ม./เดือน</span></div>
              <div className="text-[11px] text-ink-2 mt-0.5">เหลืออีก {forecast.remaining.toLocaleString(undefined, { maximumFractionDigits: 0 })} ม.</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-ink-3 uppercase mb-1">ต้องเร่งเป็น</div>
              <div className="text-xl font-semibold font-mono text-code-c">{forecast.requiredRate.toFixed(0)} <span className="text-xs text-ink-3">ม./เดือน</span></div>
              <div className="text-[11px] text-ink-2 mt-0.5">เพื่อทันกำหนด ก.ย. 71</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Distance Plan Settings Modal ═══ */}
      {showDistPlanModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-navy-dark/60 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-surface rounded-modal w-full max-w-xl shadow-modal overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-navy px-6 py-4 text-white flex justify-between items-center shrink-0">
              <h3 className="font-semibold text-lg flex items-center gap-2"><Ruler size={20} /> ตั้งค่าแผนระยะขุดเจาะ (Distance Plan)</h3>
              <button onClick={() => setShowDistPlanModal(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-semibold text-ink text-sm">ช่วงเวลาแผนระยะทาง</h4>
                  <button onClick={addDistPlanRange} className="text-navy hover:text-navy-dark bg-cyan-tint hover:bg-cyan-tint/80 px-2.5 py-1 rounded-input text-xs font-semibold flex items-center gap-1 transition-colors border border-line"><Plus size={14} /> เพิ่มช่วง</button>
                </div>
                <div className="space-y-4">
                  {(distPlanConfig.ranges || []).map((range, index) => (
                    <div key={index} className="bg-surface-alt p-4 rounded-input border border-line space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-semibold text-ink-3 block mb-1">เดือนเริ่ม</label>
                            <input type="month" value={range.startMonth} onChange={e => { const nr = [...(distPlanConfig.ranges || [])]; nr[index].startMonth = e.target.value; setDistPlanConfig({ ...distPlanConfig, ranges: nr }); }} className="w-full bg-surface border border-line rounded-input p-1.5 text-xs outline-none focus:border-navy text-ink" />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-ink-3 block mb-1">เดือนสิ้นสุด</label>
                            <input type="month" value={range.endMonth} onChange={e => { const nr = [...(distPlanConfig.ranges || [])]; nr[index].endMonth = e.target.value; setDistPlanConfig({ ...distPlanConfig, ranges: nr }); }} className="w-full bg-surface border border-line rounded-input p-1.5 text-xs outline-none focus:border-navy text-ink" />
                          </div>
                        </div>
                        <button onClick={() => removeDistPlanRange(index)} className="p-1.5 text-code-d hover:text-code-d hover:bg-code-d/10 rounded-input mt-4 transition-colors"><Trash2 size={16} /></button>
                      </div>
                      <div className="flex items-center gap-2">
                        <select value={range.mode || "rings"} onChange={e => { const nr = [...(distPlanConfig.ranges || [])]; nr[index].mode = e.target.value; setDistPlanConfig({ ...distPlanConfig, ranges: nr }); }} className="bg-surface border border-line rounded-input p-1.5 text-xs outline-none focus:border-navy font-semibold text-ink">
                          <option value="rings">Rings/Day</option>
                          <option value="distance">Distance/Month</option>
                        </select>
                        {(range.mode || "rings") === "rings" ? (
                          <div className="flex items-center gap-2 flex-1">
                            <div>
                              <label className="text-[10px] font-semibold text-ink-3 block mb-1">Ring/วัน</label>
                              <input type="number" step="0.5" value={range.ringsPerDay} onChange={e => { const nr = [...(distPlanConfig.ranges || [])]; nr[index].ringsPerDay = Number(e.target.value); setDistPlanConfig({ ...distPlanConfig, ranges: nr }); }} className="w-20 bg-surface border border-line rounded-input p-1.5 text-xs outline-none focus:border-navy font-mono text-center font-semibold text-ink" />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-ink-3 block mb-1">ยาวเฉลี่ย (m)</label>
                              <input type="number" step="0.1" value={range.avgLength} onChange={e => { const nr = [...(distPlanConfig.ranges || [])]; nr[index].avgLength = Number(e.target.value); setDistPlanConfig({ ...distPlanConfig, ranges: nr }); }} className="w-20 bg-surface border border-line rounded-input p-1.5 text-xs outline-none focus:border-navy font-mono text-center font-semibold text-ink" />
                            </div>
                            <div className="text-[10px] text-ink-3 font-semibold mt-4">≈ {((parseFloat(range.ringsPerDay) || 0) * (parseFloat(range.avgLength) || 1.2) * 30).toFixed(0)} m/เดือน</div>
                          </div>
                        ) : (
                          <div>
                            <label className="text-[10px] font-semibold text-ink-3 block mb-1">ระยะ/เดือน (m)</label>
                            <input type="number" value={range.distancePerMonth} onChange={e => { const nr = [...(distPlanConfig.ranges || [])]; nr[index].distancePerMonth = Number(e.target.value); setDistPlanConfig({ ...distPlanConfig, ranges: nr }); }} className="w-28 bg-surface border border-line rounded-input p-1.5 text-xs outline-none focus:border-navy font-mono text-center font-semibold text-ink" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {(distPlanConfig.ranges || []).length === 0 && <div className="text-center p-4 text-xs text-ink-3 bg-surface-alt rounded-input border border-dashed border-line">ไม่พบช่วงเวลาแผน (ใช้ Default 0 m/เดือน)</div>}
                </div>
                <p className="text-[10px] text-ink-2 mt-2">หมายเหตุ* : หากมีช่วงเวลาทับซ้อนกัน จะใช้ข้อมูลจากลำดับแรกที่ตรงกัน</p>
              </div>
            </div>
            <div className="p-4 bg-surface-alt border-t border-line flex justify-end gap-2 shrink-0">
              <button onClick={() => setShowDistPlanModal(false)} className="px-5 py-2.5 bg-surface text-ink-2 rounded-input text-sm font-semibold border border-line hover:bg-surface-alt shadow-card transition-colors" disabled={isSavingDistPlan}>ยกเลิก</button>
              <button onClick={handleSaveDistPlanSettings} disabled={isSavingDistPlan} className="px-5 py-2.5 bg-navy text-white rounded-input text-sm font-semibold shadow-hover hover:opacity-90 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                {isSavingDistPlan ? <><Loader2 size={16} className="animate-spin" /> กำลังบันทึก...</> : <><Save size={16} /> บันทึกการตั้งค่า</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Chart Expansion Modal (distance branch) ═══ */}
      {expandedChart === 'distance' && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-8 bg-navy-dark/80 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-surface rounded-modal w-full h-full max-w-[1400px] max-h-[90vh] shadow-modal overflow-hidden flex flex-col">
            <div className="bg-navy-dark px-6 py-4 text-white flex justify-between items-center shrink-0">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <MapPin size={20} /> รายงานความก้าวหน้างานขุดเจาะอุโมงค์ {projectInfo?.tbmNo || "TBM"}
              </h3>
              <button onClick={() => setExpandedChart(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-4 sm:p-6 flex-1 overflow-hidden flex flex-col bg-surface-alt">
              <div className="flex-1 w-full h-full bg-surface rounded-input border border-line shadow-card p-4 sm:p-6">
                <div className="w-full h-full flex flex-col gap-4 overflow-y-auto pr-2 pb-4">
                  <div className="flex justify-center shrink-0">
                    <div className="flex flex-wrap gap-6 items-center bg-surface-alt px-6 py-3 rounded-input border border-line shadow-card">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-1 rounded-full" style={{ backgroundColor: chartColors.delay }}></span>
                        <span className="text-[11px] sm:text-sm font-semibold text-ink">Actual Acc. (ผลงานจริงสะสม)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-0.5"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: chartColors.planned }}></span><span className="w-5 h-1 rounded-full" style={{ backgroundColor: chartColors.planned }}></span></span>
                        <span className="text-[11px] sm:text-sm font-semibold text-ink">Plan Acc. (แผนงานสะสม)</span>
                      </div>
                    </div>
                  </div>
                  {/* ═══ ส่วนที่ 1: กราฟเส้น (Line Chart) ═══ */}
                  <div className="flex-1 min-h-[400px] w-full relative z-10 shrink-0">
                    <div className="w-full h-full pl-2 pr-4 sm:pr-8">
                      <ResponsiveContainer>
                        <ComposedChart data={filteredDistanceChartData} margin={{ top: 35, right: 30, left: 10, bottom: 15 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} stroke={chartColors.grid} />
                          <XAxis
                            dataKey="displayMonth"
                            tick={axisTick}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                            tickMargin={15}
                            axisLine={{ stroke: chartColors.axis, strokeWidth: 1 }}
                            interval={0}
                            label={{ value: "เดือน/ปี", position: "insideBottomRight", offset: -5, style: { fontSize: 11, fill: chartColors.axisLabel, fontWeight: "bold" } }}
                          />
                          <YAxis
                            domain={[0, 10000]}
                            ticks={[0, 2500, 5000, 7500, 10000]}
                            tick={axisTick}
                            axisLine={{ stroke: chartColors.axis, strokeWidth: 1 }}
                            tickLine={{ stroke: chartColors.axis }}
                            label={{ value: "ระยะทาง (เมตร)", angle: 0, position: "top", offset: 20, style: { fontSize: 11, fill: chartColors.axisLabel, fontWeight: "bold" } }}
                            width={60}
                            tickFormatter={val => val.toLocaleString()}
                          />
                          <Tooltip
                            {...tooltipStyle}
                            formatter={(val, name) => {
                              if (val === null || val === undefined) return ['-', name === "planAcc" ? "แผนงานสะสม" : "ผลงานจริงสะสม"];
                              return [`${Number(val).toLocaleString()} m`, name === "planAcc" ? "แผนงานสะสม" : "ผลงานจริงสะสม"];
                            }}
                          />
                          <Line type="monotone" dataKey="planAcc" stroke={chartColors.planned} strokeWidth={3} connectNulls={false} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} dot={(props) => { const { cx, cy, payload } = props; if (cx === undefined || cy === undefined) return null; return ( <g key={`dot-plan-${payload.month}`}> <circle cx={cx} cy={cy} r={4} fill={chartColors.planned} /> {payload.planAcc > 0 && <text x={cx} y={cy - 12} fill={chartColors.planned} fontSize={9} fontWeight="bold" textAnchor="middle">{payload.planAcc.toLocaleString(undefined, {maximumFractionDigits:0})}</text>} </g> ); }} />
                          <Line type="monotone" dataKey="actualAcc" stroke={chartColors.delay} strokeWidth={3} connectNulls={true} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} dot={(props) => { const { cx, cy, payload } = props; if (payload.actualAcc === null || payload.actualAcc === undefined || cx === undefined || cy === undefined) return null; return ( <g key={`dot-act-${payload.month}`}> <rect x={cx - 4} y={cy - 4} width={8} height={8} fill={chartColors.delay} rx={1} /> {payload.actualAcc > 0 && <text x={cx} y={cy + 18} fill={chartColors.delay} fontSize={9} fontWeight="bold" textAnchor="middle">{payload.actualAcc.toLocaleString(undefined, {maximumFractionDigits:0})}</text>} </g> ); }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* ═══ ส่วนที่ 2: Progress Bar ═══ */}
                  <div className="relative min-w-[700px] overflow-hidden bg-surface-alt border border-line rounded-input p-4 shadow-card shrink-0">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-semibold text-ink-2 uppercase tracking-wider">เปรียบเทียบ ณ เดือนปัจจุบัน</span>
                      <span className="text-[11px] font-semibold text-ink-2">ระยะโครงการ: <span className="text-ink font-mono font-semibold">{TOTAL_ROUTE_DISTANCE.toLocaleString()} ม.</span></span>
                    </div>

                    <div className="flex flex-col gap-3 relative z-20">
                      {/* แผนงานสะสม ณ เดือนปัจจุบัน */}
                      <div className="flex items-center h-[38px]">
                        <span className="w-32 text-xs font-semibold text-ink shrink-0">แผนงานสะสม</span>
                        <div className="flex-1 h-full rounded-input border border-line relative overflow-hidden bg-surface-page">
                          {totalPlanDistance > 0 ? (
                            <>
                              <div className="h-full bg-navy-dark rounded-input flex items-center justify-end px-3 relative z-10 shadow-card transition-all duration-700" style={{ width: `${Math.max((totalPlanDistance / TOTAL_ROUTE_DISTANCE) * 100, 5)}%` }}>
                                <span className="text-white text-xs font-mono font-semibold drop-shadow-md whitespace-nowrap">{totalPlanDistance.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                              </div>
                              <div className="absolute top-0 right-2 h-full flex items-center z-0"><span className="text-[9px] font-semibold text-ink-3">{TOTAL_ROUTE_DISTANCE.toLocaleString()}</span></div>
                            </>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><span className="text-ink-2 text-xs font-semibold">ยังไม่ตั้งค่าแผน — กดปุ่ม ⚙️ เพื่อตั้งค่า</span></div>
                          )}
                        </div>
                      </div>

                      {/* ผลงานจริง */}
                      <div className="flex items-center h-[38px] relative">
                        <span className="w-32 text-xs font-semibold text-ink shrink-0">ผลงานจริง</span>
                        <div className="flex-1 h-full rounded-input border border-line relative overflow-hidden bg-surface-page">
                          {(() => {
                            const planPercent = totalPlanDistance > 0 ? (totalPlanDistance / TOTAL_ROUTE_DISTANCE) * 100 : 0;
                            const actualPercent = (totalActualDistance / TOTAL_ROUTE_DISTANCE) * 100;
                            const gapWidth = planPercent - actualPercent;

                            return (
                              <>
                                {totalActualDistance > 0 && (
                                  <div className="absolute top-0 left-0 h-full bg-sgreen-dark flex items-center justify-center z-10 shadow-card transition-all duration-700" style={{ width: `${Math.max(actualPercent, 3)}%`, borderRight: totalPlanDistance > 0 ? '2px solid #0C2C65' : 'none' }}>
                                    <span className="text-white text-[10px] font-mono font-semibold whitespace-nowrap px-1 drop-shadow-md">{totalActualDistance.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                                  </div>
                                )}
                                {totalPlanDistance > 0 && gapWidth > 0 && (
                                  <div className="absolute top-0 h-full flex items-center justify-center z-5" style={{ left: `${actualPercent}%`, width: `${gapWidth}%`, backgroundImage: "repeating-linear-gradient(45deg, #fecaca 0px, #fecaca 6px, #fff 6px, #fff 12px)" }}>
                                    <span className="text-code-d text-[9px] font-mono font-semibold bg-white/90 px-1.5 py-0.5 rounded-badge shadow-card whitespace-nowrap border border-code-d/30 z-10 relative">
                                      -{(totalPlanDistance - totalActualDistance).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                    </span>
                                  </div>
                                )}
                                <div className="absolute top-0 right-2 h-full flex items-center z-0"><span className="text-[9px] font-semibold text-ink-3">{TOTAL_ROUTE_DISTANCE.toLocaleString()}</span></div>
                                {totalActualDistance === 0 && <div className="w-full h-full flex items-center justify-center z-20 relative"><span className="text-ink-3 text-[10px] font-semibold">ยังไม่มีผลงาน</span></div>}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ═══ ส่วนที่ 3: Route Progress ═══ */}
                  <div className="relative min-w-[700px] overflow-hidden bg-surface border border-line rounded-input p-4 shadow-card shrink-0">
                    <style>{` .track-pattern { background-image: repeating-linear-gradient(90deg, transparent, transparent 15px, #94a3b8 15px, #94a3b8 18px); } .track-pattern-vertical { background-image: repeating-linear-gradient(0deg, transparent, transparent 10px, #94a3b8 10px, #94a3b8 13px); } .track-pattern-light-vertical { background-image: repeating-linear-gradient(0deg, transparent, transparent 10px, #cbd5e1 10px, #cbd5e1 13px); } `}</style>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-ink-2 text-[11px] font-semibold tracking-[0.2em] uppercase">Route Progress</span>
                    </div>
                    <div className="relative mx-4 sm:mx-8" style={{ height: '85px' }}>
                      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[18px] bg-surface-alt border-y-[3px] border-line track-pattern shadow-card z-0"></div>
                      <div className="absolute top-1/2 -translate-y-1/2 left-0 h-[32px] rounded-l-full z-1 transition-all duration-1000" style={{ width: `${Math.min((totalActualDistance / TOTAL_ROUTE_DISTANCE) * 100, 100)}%`, backgroundColor: `${chartColors.delay}33`, border: `1px solid ${chartColors.delay}66` }}></div>
                      {(() => {
                        const is3Seg = routeStationPlacements.find(s => s.id === "IS3");
                        if (!is3Seg) return null;
                        return (
                          <div className="absolute z-20" style={{ left: `${is3Seg.xPercent}%`, top: 'calc(50% - 16px)', transform: 'translateX(-50%)', width: 2, height: 32, borderLeft: "2.5px dashed #f59e0b" }} />
                        );
                      })()}
                      {(() => {
                        const is3Seg = routeStationPlacements.find(s => s.id === "IS3");
                        if (!is3Seg) return null;
                        return (
                          <div className="absolute z-0" style={{ left: `calc(${is3Seg.xPercent}%)`, top: 'calc(50% - 30px)', width: 2, height: '25px', borderLeft: '1.5px dashed #f59e0b' }} />
                        );
                      })()}
                      {routeStationPlacements.map((seg, i) => {
                        if (i === 0) return null;
                        const prevSeg = routeStationPlacements[i - 1];
                        return (
                          <React.Fragment key={`route-modal-${seg.id}`}>
                            <div className="absolute -top-6 -translate-x-1/2 bg-surface border-2 border-navy rounded-full px-2 py-0.5 text-[9px] font-semibold font-mono text-ink shadow-card whitespace-nowrap z-10" style={{ left: `${(prevSeg.xPercent + seg.xPercent) / 2}%` }}>{((seg.distance - ROUTE_SEGMENTS[i - 1].distance)).toLocaleString(undefined, { minimumFractionDigits: 3 })} m</div>
                            <div className="absolute flex flex-col items-center justify-center z-20" style={seg.id === "IS3" ? { left: `${seg.xPercent}%`, top: `calc(50% - 38px)`, transform: 'translateX(-50%) translateY(-50%)' } : { left: `${seg.xPercent}%`, top: `50%`, transform: 'translateX(-50%) translateY(-50%)' }}>
                              {seg.id === "IS3" ? (
                                <div className="relative flex flex-col items-center">
                                  <span className="absolute whitespace-nowrap text-[9px] font-semibold text-code-b bg-code-b/10 border border-code-b/30 px-1.5 py-0.5 rounded-badge shadow-card tracking-wide" style={{ top: -24 }}>
                                    D-wall
                                  </span>
                                  <div className="relative bg-navy-dark border-[1.5px] border-navy rounded-input p-1 shadow-card flex items-center justify-center z-10 w-11 h-11 pointer-events-none">
                                    <div className="bg-surface w-full h-full flex items-center justify-center rounded-badge">
                                      <div className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[10px] font-semibold" style={{ backgroundColor: chartColors.planned }}>{seg.label.replace("IS", "")}</div>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="relative w-9 h-9 rounded-full border-[4px] border-white shadow-hover text-white flex items-center justify-center text-[10px] font-semibold z-10 tracking-tighter" style={{ backgroundColor: chartColors.planned }}>{seg.label.replace("IS", "")}</div>
                              )}
                              <span className="absolute text-[10px] font-semibold text-ink whitespace-nowrap" style={{ top: seg.id === "IS3" ? 66 : 44 }}>{seg.label}</span>
                            </div>
                          </React.Fragment>
                        );
                      })}
                      <div className="absolute top-1/2 -translate-y-1/2 left-0 -translate-x-1/2 flex flex-col items-center justify-center z-20">
                        <div className="relative w-9 h-9 rounded-full border-[4px] border-white shadow-hover text-white flex items-center justify-center text-[10px] font-semibold z-10 tracking-tighter" style={{ backgroundColor: chartColors.planned }}>{ROUTE_SEGMENTS[0].label.replace("IS", "")}</div>
                        <span className="absolute top-11 text-[10px] font-semibold text-ink whitespace-nowrap">{ROUTE_SEGMENTS[0].label}</span>
                      </div>
                      <div className="absolute top-1/2 -translate-y-1/2 z-30 transition-all duration-[1500ms] ease-out" style={{ left: `${Math.min((totalActualDistance / TOTAL_ROUTE_DISTANCE) * 100, 100)}%`, transform: 'translateX(-50%) translateY(-50%)' }}>
                        <div className="relative drop-shadow-xl group cursor-pointer">
                          <span className="absolute -inset-2 rounded-full opacity-40 animate-ping" style={{ backgroundColor: chartColors.delay }}></span>
                          <div className="w-8 h-8 bg-navy border-[3px] border-white flex items-center justify-center rounded-badge rotate-90 relative z-10 shadow-hover overflow-hidden">
                            <div className="w-full h-[60%] bg-navy-dark absolute bottom-0 left-0"></div><div className="w-full h-[2px] bg-white opacity-50 absolute top-[40%] left-0"></div><span className="text-[8px] text-white font-semibold z-10 -rotate-90">{projectInfo?.tbmNo || "TBM"}</span>
                          </div>
                          <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold text-ink bg-surface/90 backdrop-blur-sm px-1.5 py-0.5 rounded-badge shadow-card border border-line z-50">Progress : {((totalActualDistance / TOTAL_ROUTE_DISTANCE) * 100).toFixed(2)} %</div>
                          <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-navy-dark text-white text-[10px] px-3 py-1.5 rounded-input font-semibold whitespace-nowrap shadow-modal opacity-0 group-hover:opacity-100 transition-opacity z-40 pointer-events-none">{projectInfo?.tbmNo || "TBM"}: {totalActualDistance.toLocaleString()} m ({(totalActualDistance / TOTAL_ROUTE_DISTANCE * 100).toFixed(1)}%)</div>
                        </div>
                      </div>
                    </div>
                    <div className="h-8"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RouteScheduleView;
