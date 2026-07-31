import React, { useState, useMemo } from "react";
import { TrendingUp, Layers, Activity, MapPin, Calendar, Clock, Edit, Trash2, X, Settings, Database, Plus, Save, Camera } from "lucide-react";
import StatCard from "../common/StatCard";
import RingVisualizer from "../common/RingVisualizer";
import { formatDisplayDate, formatDisplayTime, parseCH, formatCH } from "../../utils/formatters";
import { getRingNumeric, getLogicalShiftDate, calculateSoilVolume } from "../../utils/helpers";
import { buildMutationEnvelope } from "../../offline/mutationEnvelope";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Line } from "recharts";
import { Badge } from "../../ui-ux-pro-max";

const SegmentDashboardView = ({ segmentRecords, setSegmentRecords, machine = "TBM1", onMutate, syncMeta }) => {
  const [filterMode, setFilterMode] = useState("all");
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [filterShift, setFilterShift] = useState("All");

  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);

  const defaultPlanConfig = { basePlanAcc: 0, baseActualAcc: 0, ranges: [] };
  const [planConfig, setPlanConfig] = useState(() => {
    try {
      const saved = localStorage.getItem("tbmPlanConfig");
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaultPlanConfig, ...parsed, ranges: parsed.ranges || [] };
      }
    } catch (e) { }
    return defaultPlanConfig;
  });

  const getPlanForDate = (dateStr, config) => {
    if (!config || !config.ranges || config.ranges.length === 0) return 0;
    for (let range of config.ranges) {
      if ((!range.start || dateStr >= range.start) && (!range.end || dateStr <= range.end)) {
        return parseFloat(range.dailyPlan) || 0;
      }
    }
    return 0;
  };

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

  const baseSegmentRecords = useMemo(() => {
    let recordsToFilter = segmentRecords;
    if (filterShift !== "All") {
      recordsToFilter = segmentRecords.filter((rec) => rec.shift === filterShift || rec.installShift === filterShift || rec.excavShift === filterShift);
    }
    const filtered = recordsToFilter.filter((rec) => {
      const dDate = formatDisplayDate(rec.date);
      if (filterMode === "all") return true;
      if (filterMode === "daily") return dDate === filterDate;
      if (filterMode === "monthly") return dDate.startsWith(filterMonth);
      if (filterMode === "range") {
        if (rangeStart && dDate < rangeStart) return false;
        if (rangeEnd && dDate > rangeEnd) return false;
        return true;
      }
      return true;
    });

    // Deduplicate แล้วเรียงตาม: P ก่อน T, แล้ว ringNo มากไปน้อย
    const deduped = deduplicateRecords(filtered);
    return deduped.sort((a, b) => {
      const prefA = String(a.ringNo).replace(/\d/g, '');
      const prefB = String(b.ringNo).replace(/\d/g, '');
      if (prefA !== prefB) return prefA.localeCompare(prefB); // P ก่อน T
      const numA = getRingNumeric(a.ringNo);
      const numB = getRingNumeric(b.ringNo);
      return numB - numA; // เลขมากอยู่บน
    });
  }, [segmentRecords, filterMode, filterDate, filterMonth, rangeStart, rangeEnd, filterShift]);

  const stats = useMemo(() => {
    const permRings = baseSegmentRecords.filter(r => r.installType !== "Temporary");
    const tempRings = baseSegmentRecords.filter(r => r.installType === "Temporary");

    const totalDistance = permRings.reduce((sum, rec) => sum + parseFloat(rec.length || 0), 0);
    const totalSoilVol = permRings.reduce((sum, rec) => sum + parseFloat(rec.soilVolume || calculateSoilVolume(rec.length)), 0);

    const dates = [...new Set(permRings.map((rec) => formatDisplayDate(rec.date)))];
    const avgRings = dates.length > 0 ? (permRings.length / dates.length).toFixed(1) : 0;
    const avgDist = dates.length > 0 ? (totalDistance / dates.length).toFixed(1) : 0;

    let currentCH = "-";
    if (permRings.length > 0) {
      const permWithCH = permRings.filter(r => r.finishCH);
      if (permWithCH.length > 0) {
        // เรียงตาม ringNo เพื่อหา CH ล่าสุด
        const sorted = [...permWithCH].sort((a, b) => getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo));
        currentCH = sorted[sorted.length - 1].finishCH;
      }
    }

    return { permRings: permRings.length, tempRings: tempRings.length, totalRings: permRings.length + tempRings.length, totalDistance, totalSoilVol, avgRings, avgDist, currentCH };
  }, [baseSegmentRecords]);

  const fullDailyProgress = useMemo(() => {
    const datesMap = new Map();
    const completedPerms = baseSegmentRecords.filter((r) => r.status !== "In Progress" && r.installType !== "Temporary");
    const tempRecords = baseSegmentRecords.filter((r) => r.status !== "In Progress" && r.installType === "Temporary");

    completedPerms.forEach((rec) => {
      const dDate = formatDisplayDate(rec.date);
      if (!datesMap.has(dDate)) datesMap.set(dDate, { date: dDate, dayRings: 0, nightRings: 0, tempRings: 0, totalRings: 0 });
      const dayData = datesMap.get(dDate);
      if (rec.shift === "Day" || rec.installShift === "Day") dayData.dayRings++;
      else dayData.nightRings++;
      dayData.totalRings++;
    });

    tempRecords.forEach((rec) => {
      const dDate = formatDisplayDate(rec.date);
      if (!datesMap.has(dDate)) datesMap.set(dDate, { date: dDate, dayRings: 0, nightRings: 0, tempRings: 0, totalRings: 0 });
      const dayData = datesMap.get(dDate);
      dayData.tempRings++;
    });

    const sortedArray = Array.from(datesMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    let runningActual = parseFloat(planConfig.baseActualAcc) || 0;
    let runningPlan = parseFloat(planConfig.basePlanAcc) || 0;
    let prevDate = null;

    const mappedArray = sortedArray.map((day, index) => {
      runningActual += day.dayRings + day.nightRings;
      if (prevDate) {
        let tempD = new Date(prevDate);
        tempD.setDate(tempD.getDate() + 1);
        let endD = new Date(day.date);
        while (tempD <= endD) {
          runningPlan += getPlanForDate(tempD.toISOString().split("T")[0], planConfig);
          tempD.setDate(tempD.getDate() + 1);
        }
      } else {
        runningPlan += getPlanForDate(day.date, planConfig);
      }
      prevDate = day.date;

      return {
        ...day,
        plan: getPlanForDate(day.date, planConfig),
        displayDate: new Date(day.date).toLocaleDateString("th-TH", { day: "numeric", month: "short" }),
        actualAcc: runningActual,
        planAcc: Math.round(runningPlan * 10) / 10,
      };
    });

    return mappedArray;
  }, [baseSegmentRecords, planConfig, getPlanForDate]);

  const chartData = useMemo(() => {
    if (filterMode === "daily") {
      const dayRecords = baseSegmentRecords.filter((r) => formatDisplayDate(r.date) === filterDate);
      let baselineAcc = parseFloat(planConfig.baseActualAcc) || 0;
      const sortedDates = [...new Set(baseSegmentRecords.map((r) => formatDisplayDate(r.date)))].sort();
      for (const d of sortedDates) {
        if (d < filterDate) {
          baselineAcc += baseSegmentRecords.filter((r) => formatDisplayDate(r.date) === d && r.status !== "In Progress" && r.installType !== "Temporary").length;
        }
      }
      let baselinePlan = parseFloat(planConfig.basePlanAcc) || 0;
      if (sortedDates.length > 0 && filterDate > sortedDates[0]) {
        let tempD = new Date(sortedDates[0]);
        let endD = new Date(filterDate);
        while (tempD < endD) {
          baselinePlan += getPlanForDate(tempD.toISOString().split("T")[0], planConfig);
          tempD.setDate(tempD.getDate() + 1);
        }
      }
      const currentDayPlan = getPlanForDate(filterDate, planConfig);
      const hourlyData = Array.from({ length: 24 }, (_, i) => ({ displayDate: `${String(i).padStart(2, "0")}:00`, dayRings: 0, nightRings: 0, tempRings: 0, totalRings: 0, plan: currentDayPlan / 24 }));

      dayRecords.forEach((rec) => {
        const timeToUse = rec.installStartTime || rec.startTime;
        if (timeToUse && rec.status !== "In Progress") {
          const hour = parseInt(formatDisplayTime(timeToUse).split(":")[0], 10);
          if (!isNaN(hour) && hour >= 0 && hour <= 23) {
            if (rec.installType === "Temporary") hourlyData[hour].tempRings++;
            else {
              if (rec.shift === "Day" || rec.installShift === "Day") hourlyData[hour].dayRings++;
              else hourlyData[hour].nightRings++;
              hourlyData[hour].totalRings++;
            }
          }
        }
      });
      let currentAcc = baselineAcc;
      let currentPlan = baselinePlan;
      return hourlyData.map((h) => {
        currentAcc += h.totalRings;
        currentPlan += currentDayPlan / 24;
        return { ...h, actualAcc: currentAcc, planAcc: Math.round(currentPlan * 10) / 10 };
      });
    }

    return fullDailyProgress;
  }, [fullDailyProgress, filterMode, filterDate, filterMonth, rangeStart, rangeEnd, baseSegmentRecords, planConfig, getPlanForDate]);

  const filteredTableRecords = useMemo(() => {
    return baseSegmentRecords.filter((rec) => {
      const dDate = formatDisplayDate(rec.date);
      if (filterMode === "all") return true;
      if (filterMode === "daily") return dDate === filterDate;
      if (filterMode === "monthly") return dDate.startsWith(filterMonth);
      if (filterMode === "range") {
        if (rangeStart && dDate < rangeStart) return false;
        if (rangeEnd && dDate > rangeEnd) return false;
        return true;
      }
      return true;
    });
  }, [baseSegmentRecords, filterMode, filterDate, filterMonth, rangeStart, rangeEnd]);

  const handleEditChange = (e) => setEditFormData({ ...editFormData, [e.target.name]: e.target.value });

  const handleSaveEdit = async () => {
    try {
      const updatedRecord = { ...editFormData };
      await onMutate(buildMutationEnvelope({
        entityType: "segment", operation: "update", machine,
        recordId: updatedRecord.id, payload: updatedRecord, syncMeta,
      }));
      setSelectedRecord(null);
      setIsEditing(false);
    } catch (err) { alert("อัปเดตข้อมูลไม่สำเร็จ: " + err.message); }
  };

  const handleDeleteRecord = async () => {
    try {
      // the payload still carries the ring: the domain key is derived from it, and a delete keyed
      // differently from its own record would queue against a domain nothing else touches
      await onMutate(buildMutationEnvelope({
        entityType: "segment", operation: "delete", machine,
        recordId: selectedRecord.id, payload: selectedRecord, syncMeta,
      }));
      setSelectedRecord(null);
      setShowDeleteConfirm(false);
    } catch (err) { alert("ลบข้อมูลไม่สำเร็จ: " + err.message); }
  };

  const handleSavePlanSettings = () => {
    localStorage.setItem('tbmPlanConfig', JSON.stringify(planConfig));
    setShowPlanModal(false);
  };

  const removePlanRange = (index) => {
    const newRanges = [...(planConfig.ranges || [])];
    newRanges.splice(index, 1);
    setPlanConfig({ ...planConfig, ranges: newRanges });
  };

  const addPlanRange = () => {
    setPlanConfig({ ...planConfig, ranges: [...(planConfig.ranges || []), { start: "", end: "", dailyPlan: 0 }] });
  };

  return (
    <div className="max-w-full mx-auto space-y-6 sm:space-y-8 animate-fade-in pb-24">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Permanent Rings" value={stats.permRings} subtext={`+ ${stats.tempRings} Temp. (Total: ${stats.totalRings})`} color="text-sgreen-dark" icon={Layers} />
        <StatCard label="Perm. Distance" value={`${Number(stats.totalDistance || 0).toFixed(2)} m`} subtext={`ดินขุดรวม: ${Number(stats.totalSoilVol || 0).toFixed(2)} m³`} color="text-navy" icon={TrendingUp} />
        <StatCard label="Daily Average" value={`${stats.avgRings} Rings`} subtext={`~ ${stats.avgDist} m / day`} color="text-code-c" icon={Activity} />
        <StatCard label="Current Position" value={stats.currentCH} subtext="Latest Finish CH." color="text-cyan-med" icon={MapPin} />
      </div>

      {/* Filter Controls */}
      <div className="bg-surface rounded-card shadow-card border border-line p-5 sm:p-8">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center w-full bg-surface-alt p-2 rounded-input border border-line">
          <div className="flex bg-surface rounded-input p-1 border border-line shadow-card w-full sm:w-auto overflow-x-auto">
            <button onClick={() => setFilterMode("all")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-input font-semibold transition whitespace-nowrap ${filterMode === "all" ? "bg-navy text-white shadow" : "text-ink-2 hover:bg-surface-alt"}`}>All</button>
            <button onClick={() => setFilterMode("daily")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-input font-semibold transition whitespace-nowrap ${filterMode === "daily" ? "bg-navy text-white shadow" : "text-ink-2 hover:bg-surface-alt"}`}>Daily</button>
            <button onClick={() => setFilterMode("monthly")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-input font-semibold transition whitespace-nowrap ${filterMode === "monthly" ? "bg-navy text-white shadow" : "text-ink-2 hover:bg-surface-alt"}`}>Monthly</button>
            <button onClick={() => setFilterMode("range")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-input font-semibold transition whitespace-nowrap ${filterMode === "range" ? "bg-navy text-white shadow" : "text-ink-2 hover:bg-surface-alt"}`}>Range</button>
          </div>

          {filterMode === "daily" && <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="px-3 py-1.5 text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy focus:border-navy outline-none text-ink w-full sm:w-auto bg-surface" />}
          {filterMode === "monthly" && <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="px-3 py-1.5 text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy focus:border-navy outline-none text-ink w-full sm:w-auto bg-surface" />}
          {filterMode === "range" && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="px-2 py-1.5 flex-1 sm:flex-none sm:w-[120px] text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy focus:border-navy outline-none text-ink bg-surface" />
              <span className="text-ink-3">-</span>
              <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="px-2 py-1.5 flex-1 sm:flex-none sm:w-[120px] text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy focus:border-navy outline-none text-ink bg-surface" />
            </div>
          )}
          <div className="w-px h-6 bg-line hidden sm:block"></div>
          <select value={filterShift} onChange={(e) => setFilterShift(e.target.value)} className="px-3 py-1.5 text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy focus:border-navy outline-none text-ink bg-surface cursor-pointer w-full sm:w-auto">
            <option value="All">All Shifts</option>
            <option value="Day">Day Shift</option>
            <option value="Night">Night Shift</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-card shadow-card border border-line overflow-hidden">
        <div className="px-6 py-5 border-b border-line bg-surface-alt flex justify-between items-center">
          <h3 className="font-semibold text-ink text-base">Segment Logs</h3>
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-sm text-left relative whitespace-nowrap">
            <thead className="text-xs text-white uppercase bg-navy-dark border-b border-navy sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-4">Date / Shift</th>
                <th className="px-6 py-4">Ring No.</th>
                <th className="px-6 py-4 text-center">Type / Key</th>
                <th className="px-6 py-4 text-right">Start CH.</th>
                <th className="px-6 py-4 text-right">Finish CH.</th>
                <th className="px-6 py-4 text-right">Length / Soil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredTableRecords.length > 0 ? (
                filteredTableRecords.map((rec, index) => (
                  <tr key={`${rec.id}-${index}`} onClick={() => { setSelectedRecord(rec); setIsEditing(false); }} className={`hover:bg-cyan-tint transition-colors cursor-pointer group ${index % 2 === 0 ? "bg-surface" : "bg-surface-page"}`}>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-ink text-base">{formatDisplayDate(rec.date)}</div>
                      <div className="text-xs text-ink-2 mt-1.5 font-mono"><span className="font-semibold text-ink-3">Excav:</span> {formatDisplayTime(rec.excavStartTime)} - {formatDisplayTime(rec.excavEndTime)}</div>
                      <div className="text-xs text-ink-2 mt-0.5 font-mono"><span className="font-semibold text-ink-3">Inst:</span> {formatDisplayTime(rec.installStartTime || rec.startTime)} - {formatDisplayTime(rec.installEndTime || rec.endTime)}</div>
                      <div className="text-xs text-ink-3 font-semibold mt-1.5">{String(rec.shift)} Shift</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`font-semibold text-lg font-mono ${rec.installType === "Temporary" ? "text-code-b" : "text-sgreen-dark"}`}>{String(rec.ringNo)}</div>
                      {rec.installType === "Temporary" && <div className="text-[10px] text-code-b font-semibold mt-1 px-2 py-0.5 bg-code-b/10 rounded-badge inline-block border-l-2 border-code-b">Temporary</div>}
                      {rec.status === "In Progress" && <div className="text-[10px] text-code-c font-semibold mt-1 px-2 py-0.5 bg-code-c/10 rounded-badge inline-block border-l-2 border-code-c">In Progress</div>}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-surface-alt px-3 py-1 rounded-input text-xs font-semibold text-ink-2 mr-2 border border-line">{String(rec.typeRing)}</span>
                      <span className="text-xs font-semibold text-ink-3 font-mono">K{String(rec.keyPos)}</span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-ink-2 text-base">{String(rec.startCH)}</td>
                    <td className="px-6 py-4 text-right font-mono text-ink font-semibold text-base">{String(rec.finishCH)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sgreen-dark font-semibold text-base font-mono">{Number(rec.length || 0).toFixed(2)} m</div>
                      <div className="text-[10px] text-ink-3 font-medium mt-0.5 font-mono">{Number(rec.soilVolume || calculateSoilVolume(rec.length)).toFixed(2)} m³</div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="6" className="px-6 py-12 text-center text-ink-3">ไม่พบข้อมูล หรือกำลังรอเชื่อมต่อฐานข้อมูล...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Segment Details Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-dark/50 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-surface rounded-modal w-full max-w-2xl shadow-modal overflow-hidden flex flex-col max-h-[90vh] transform transition-all">
            <div className="bg-navy px-6 py-4 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2"><Layers size={20} /> Segment Details</h3>
                <p className="text-white/70 text-xs mt-1">Record ID: {String(selectedRecord.id)}</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedRecord.imageUrl && selectedRecord.imageUrl !== "Attached" && (
                  <a href={selectedRecord.imageUrl} target="_blank" rel="noreferrer" className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors" title="View Photo"><Camera size={18} /></a>
                )}
                {!isEditing && <button onClick={() => { setEditFormData(selectedRecord); setIsEditing(true); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors" title="Edit"><Edit size={18} /></button>}
                <button onClick={() => setShowDeleteConfirm(true)} className="p-2 bg-white/10 hover:bg-code-d rounded-full transition-colors" title="Delete"><Trash2 size={18} /></button>
                <button onClick={() => { setSelectedRecord(null); setShowDeleteConfirm(false); setIsEditing(false); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors ml-2"><X size={20} /></button>
              </div>
            </div>

            {showDeleteConfirm && (
              <div className="bg-code-d/10 p-4 flex justify-between items-center border-b border-code-d/30 shrink-0 animate-fade-in">
                <span className="text-code-d text-sm font-semibold flex items-center gap-2"><Trash2 size={16} /> ยืนยันการลบข้อมูล Ring {String(selectedRecord.ringNo)} ใช่หรือไม่?</span>
                <div className="flex gap-2">
                  <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-1.5 bg-surface text-ink-2 rounded-input shadow-card text-xs font-semibold border border-line hover:bg-surface-alt">ยกเลิก</button>
                  <button onClick={handleDeleteRecord} className="px-4 py-1.5 bg-code-d text-white rounded-input shadow-card text-xs font-semibold hover:opacity-90 flex items-center gap-1">ลบ</button>
                </div>
              </div>
            )}

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              <div className="flex flex-wrap justify-between items-center bg-surface-alt p-4 rounded-card border border-line gap-3">
                <div>
                  <div className="text-xs font-semibold text-ink-3 uppercase tracking-widest mb-1">Ring No. & Type</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <div className={`text-2xl font-semibold font-mono ${selectedRecord.installType === "Temporary" ? "text-code-b" : "text-ink"}`}>
                        {isEditing ? <input type="text" name="ringNo" value={editFormData?.ringNo || ''} onChange={handleEditChange} className="w-32 bg-surface border border-line rounded-input px-2 outline-none uppercase focus:border-navy focus:ring-1 focus:ring-cyan-tint" /> : String(selectedRecord.ringNo)}
                      </div>
                      {isEditing ? (
                        <select name="typeRing" value={editFormData?.typeRing || ''} onChange={handleEditChange} className="bg-surface border border-line rounded-input px-2 py-1 text-sm font-semibold text-ink-2 outline-none cursor-pointer focus:border-navy">
                          <option value="C1">C1</option>
                          <option value="C2">C2</option>
                          <option value="B1">B1</option>
                          <option value="B2">B2</option>
                          <option value="A">A</option>
                          <option value="K">K</option>
                        </select>
                      ) : (
                        <span className="bg-surface-alt px-3 py-1 rounded-input text-sm font-semibold text-ink-2 border border-line">{String(selectedRecord.typeRing)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <select name="installType" value={editFormData?.installType || ''} onChange={handleEditChange} className="bg-surface border rounded-input text-[10px] font-semibold px-1 outline-none text-ink-2 focus:border-navy">
                            <option value="Permanent">Permanent</option>
                            <option value="Temporary">Temporary</option>
                          </select>
                          <select name="status" value={editFormData?.status || ''} onChange={handleEditChange} className="bg-surface border rounded-input text-[10px] font-semibold px-1 outline-none text-ink-2 focus:border-navy">
                            <option value="Completed">Completed</option>
                            <option value="In Progress">In Progress</option>
                          </select>
                        </div>
                      ) : (
                        <>
                          {selectedRecord.installType === "Temporary" && <Badge code="b">Temporary Ring</Badge>}
                          {selectedRecord.status === "In Progress" && <Badge code="c">In Progress</Badge>}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold text-ink-3 uppercase tracking-widest mb-1">Working Date & Shift</div>
                  <div className="text-sm font-semibold text-ink flex items-center justify-end gap-1.5"><Calendar size={14} /> {isEditing ? <input type="date" name="date" value={editFormData?.date || ''} onChange={handleEditChange} className="bg-surface border border-line rounded-input px-1 outline-none focus:border-navy" /> : formatDisplayDate(selectedRecord.date)}</div>
                  <div className="text-xs text-ink-2 mt-1 flex items-center justify-end gap-1">
                    {isEditing ? (
                      <select name="shift" value={editFormData?.shift || ''} onChange={handleEditChange} className="bg-surface border border-line rounded-input px-1 font-semibold text-ink-2 outline-none focus:border-navy">
                        <option value="Day">Day</option>
                        <option value="Night">Night</option>
                      </select>
                    ) : <span className="font-semibold text-ink-2">({String(selectedRecord.shift)})</span>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-surface-alt rounded-card border border-line p-4 flex flex-col items-center justify-center relative">
                  <span className="text-xs font-semibold text-ink-3 uppercase tracking-widest mb-2 text-center">Ring Orientation</span>
                  {isEditing ? (
                    <div className="flex flex-col items-center w-full max-w-xs mt-2 p-4 bg-surface rounded-card border border-line">
                      <div className="flex justify-between items-center w-full mb-3">
                        <label className="text-xs font-semibold text-ink-2">Key Position</label>
                        <span className="bg-sgreen-med/10 text-sgreen-dark font-semibold px-3 py-1 rounded-input text-sm shadow-card border border-line">K{editFormData?.keyPos || 1}</span>
                      </div>
                      <input type="range" min="1" max="16" step="1" name="keyPos" value={editFormData?.keyPos || 1} onChange={handleEditChange} className="w-full h-1.5 bg-line rounded-full appearance-none cursor-pointer accent-navy mb-2" />
                      <div className="flex justify-between w-full text-[10px] text-ink-3 font-semibold px-1"><span>1</span><span>4</span><span>8</span><span>12</span><span>16</span></div>
                    </div>
                  ) : (
                    <div className="scale-90 transform origin-top -mt-2">
                      <RingVisualizer ringKey={selectedRecord.keyPos} selectedPositions={{ K: true }} onTogglePosition={() => { }} />
                    </div>
                  )}
                </div>

                <div className="space-y-4 flex flex-col justify-center">
                  <div className="bg-sgreen-med/10 rounded-card p-4 border border-sgreen-med/20">
                    <div className="text-xs font-semibold text-sgreen-dark uppercase tracking-widest mb-3">Chainage Data</div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-xs text-ink-2 mb-1">Start CH.</div>
                        <div className="font-mono text-base font-semibold text-ink">{isEditing ? <input type="text" name="startCH" value={editFormData?.startCH || ''} onChange={handleEditChange} onBlur={(e) => setEditFormData(prev => ({ ...prev, startCH: formatCH(prev.startCH) }))} className="w-24 bg-surface border border-sgreen-med/30 rounded-input px-1 outline-none focus:border-navy" /> : String(selectedRecord.startCH)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-ink-2 mb-1">Finish CH.</div>
                        <div className="font-mono text-base font-semibold text-ink">{isEditing ? <input type="text" name="finishCH" value={editFormData?.finishCH || ''} onChange={handleEditChange} onBlur={(e) => setEditFormData(prev => ({ ...prev, finishCH: formatCH(prev.finishCH) }))} className="w-24 bg-surface border border-sgreen-med/30 rounded-input px-1 outline-none focus:border-navy" /> : String(selectedRecord.finishCH)}</div>
                      </div>
                    </div>
                    <div className="border-t border-sgreen-med/20 pt-4 flex justify-between items-center">
                      <span className="text-xs text-ink-2">Length</span>
                      <div className="text-xl font-semibold text-sgreen-dark font-mono">{Number(isEditing ? editFormData?.length : selectedRecord.length || 0).toFixed(2)} <span className="text-sm font-normal">m</span></div>
                    </div>
                  </div>

                  <div className="bg-surface rounded-card p-4 border border-line shadow-card flex flex-col gap-4">
                    <div className="flex justify-between items-center gap-2">
                      <div className="text-[10px] font-semibold text-ink-3 uppercase tracking-widest w-16">Excavate</div>
                      <div className="flex-1 flex items-center justify-end gap-2">
                        <div className="font-mono text-sm font-semibold text-ink">
                          {isEditing ? (
                            <div className="flex gap-1">
                              <input type="time" name="excavStartTime" value={editFormData?.excavStartTime?.slice(0, 5) || ''} onChange={handleEditChange} className="bg-surface border border-line rounded-input px-1 outline-none w-20 focus:border-navy" />
                              <span>-</span>
                              <input type="time" name="excavEndTime" value={editFormData?.excavEndTime?.slice(0, 5) || ''} onChange={handleEditChange} className="bg-surface border border-line rounded-input px-1 outline-none w-20 focus:border-navy" />
                            </div>
                          ) : `${formatDisplayTime(selectedRecord.excavStartTime)} - ${formatDisplayTime(selectedRecord.excavEndTime)}`}
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-line"></div>
                    <div className="flex justify-between items-center gap-2">
                      <div className="text-[10px] font-semibold text-ink-3 uppercase tracking-widest w-16">Install</div>
                      <div className="flex-1 flex items-center justify-end gap-2">
                        <div className="font-mono text-sm font-semibold text-ink">
                          {isEditing ? (
                            <div className="flex gap-1">
                              <input type="time" name="installStartTime" value={(editFormData?.installStartTime || editFormData?.startTime || '')?.slice(0, 5)} onChange={handleEditChange} className="bg-surface border border-line rounded-input px-1 outline-none w-20 focus:border-navy" />
                              <span>-</span>
                              <input type="time" name="installEndTime" value={(editFormData?.installEndTime || editFormData?.endTime || '')?.slice(0, 5)} onChange={handleEditChange} className="bg-surface border border-line rounded-input px-1 outline-none w-20 focus:border-navy" />
                            </div>
                          ) : `${formatDisplayTime(selectedRecord.installStartTime || selectedRecord.startTime)} - ${formatDisplayTime(selectedRecord.installEndTime || selectedRecord.endTime)}`}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {(selectedRecord.remark || isEditing) && (
                <div className="bg-code-b/5 rounded-card p-4 border border-code-b/20">
                  <div className="text-xs font-semibold text-code-b uppercase tracking-widest mb-2 flex items-center gap-1.5">Remarks (ปัญหา)</div>
                  {isEditing ? <textarea name="remark" value={editFormData?.remark || ''} onChange={handleEditChange} className="w-full bg-surface border border-line rounded-input p-2 text-sm outline-none focus:border-navy focus:ring-1 focus:ring-cyan-tint" rows="2" /> : <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{String(selectedRecord.remark)}</p>}
                </div>
              )}

              {isEditing && (
                <div className="flex justify-end gap-2 pt-4 border-t border-line mt-4">
                  <button onClick={() => setIsEditing(false)} className="px-4 py-2 bg-surface-alt text-ink-2 rounded-input font-semibold text-sm hover:bg-line">Cancel</button>
                  <button onClick={handleSaveEdit} className="px-4 py-2 bg-navy hover:bg-navy-dark text-white rounded-input font-semibold text-sm flex items-center gap-1"><Save size={16} /> Save Changes</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Plan Settings Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-navy-dark/50 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-surface rounded-modal w-full max-w-lg shadow-modal overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-navy-dark px-6 py-4 text-white flex justify-between items-center shrink-0">
              <h3 className="font-semibold text-lg flex items-center gap-2"><Settings size={20} /> ตั้งค่าแผนงาน (Plan Settings)</h3>
              <button onClick={() => setShowPlanModal(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="bg-cyan-tint p-4 rounded-card border border-line">
                <h4 className="font-semibold text-navy mb-3 text-sm">ตั้งค่าพื้นฐาน (Baseline)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-ink-2 block mb-1">Baseline Actual (Rings)</label>
                    <input type="number" value={planConfig.baseActualAcc} onChange={(e) => setPlanConfig({ ...planConfig, baseActualAcc: Number(e.target.value) })} className="w-full bg-surface border border-line rounded-input p-2 outline-none focus:border-navy font-mono text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-ink-2 block mb-1">Baseline Plan (Rings)</label>
                    <input type="number" value={planConfig.basePlanAcc} onChange={(e) => setPlanConfig({ ...planConfig, basePlanAcc: Number(e.target.value) })} className="w-full bg-surface border border-line rounded-input p-2 outline-none focus:border-navy font-mono text-sm" />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-semibold text-ink text-sm">ช่วงเวลาแผนงาน (Plan Ranges)</h4>
                  <button onClick={addPlanRange} className="text-sgreen-dark hover:text-sgreen-dark bg-sgreen-med/10 hover:bg-sgreen-med/20 px-2.5 py-1 rounded-input text-xs font-semibold flex items-center gap-1 transition-colors border border-sgreen-med/20"><Plus size={14} /> เพิ่มช่วง (Add Range)</button>
                </div>
                <div className="space-y-3">
                  {(planConfig.ranges || []).map((range, index) => (
                    <div key={index} className="flex items-center gap-2 bg-surface-alt p-3 rounded-card border border-line">
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-ink-3 block mb-1">เริ่ม (Start)</label>
                          <input type="date" value={range.start} onChange={(e) => { const newRanges = [...(planConfig.ranges || [])]; newRanges[index].start = e.target.value; setPlanConfig({ ...planConfig, ranges: newRanges }); }} className="w-full bg-surface border border-line rounded-input p-1.5 text-xs outline-none focus:border-navy" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-ink-3 block mb-1">สิ้นสุด (End)</label>
                          <input type="date" value={range.end} onChange={(e) => { const newRanges = [...(planConfig.ranges || [])]; newRanges[index].end = e.target.value; setPlanConfig({ ...planConfig, ranges: newRanges }); }} className="w-full bg-surface border border-line rounded-input p-1.5 text-xs outline-none focus:border-navy" />
                        </div>
                      </div>
                      <div className="w-20 shrink-0">
                        <label className="text-[10px] font-semibold text-ink-3 block mb-1">Plan/Day</label>
                        <input type="number" step="0.5" value={range.dailyPlan} onChange={(e) => { const newRanges = [...(planConfig.ranges || [])]; newRanges[index].dailyPlan = Number(e.target.value); setPlanConfig({ ...planConfig, ranges: newRanges }); }} className="w-full bg-surface border border-line rounded-input p-1.5 text-xs outline-none focus:border-navy font-mono text-center font-semibold" />
                      </div>
                      <button onClick={() => removePlanRange(index)} className="p-1.5 text-code-d hover:text-code-d hover:bg-code-d/10 rounded-input mt-4 transition-colors" title="ลบ"><Trash2 size={16} /></button>
                    </div>
                  ))}
                  {(planConfig.ranges || []).length === 0 && <div className="text-center p-4 text-xs text-ink-3 bg-surface-alt rounded-card border border-dashed border-line">ไม่พบช่วงเวลาแผนงาน (ใช้ Default 0 Ring/Day)</div>}
                </div>
                <p className="text-[10px] text-ink-3 mt-2">หมายเหตุ* : หากมีช่วงเวลาทับซ้อนกัน จะใช้ข้อมูลจากลำดับล่าสุดเป็นหลัก ส่วนวันที่อยู่นอกช่วงจะใช้แผนเป็น 0 Ring/Day</p>
              </div>
            </div>
            <div className="p-4 bg-surface-alt border-t border-line flex justify-end gap-2 shrink-0">
              <button onClick={() => setShowPlanModal(false)} className="px-5 py-2.5 bg-surface text-ink-2 rounded-input text-sm font-semibold border border-line hover:bg-surface-alt shadow-card transition-colors">ยกเลิก</button>
              <button onClick={handleSavePlanSettings} className="px-5 py-2.5 bg-navy text-white rounded-input text-sm font-semibold shadow-card hover:bg-navy-dark transition-colors flex items-center gap-2"><Save size={16} /> บันทึกการตั้งค่า</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SegmentDashboardView;
