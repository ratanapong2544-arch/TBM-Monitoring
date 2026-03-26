import React, { useState, useMemo } from "react";
import { TrendingUp, Layers, Activity, MapPin, Calendar, Clock, Edit, Trash2, X, Settings, Database, Plus, Save, Camera } from "lucide-react";
import StatCard from "../common/StatCard";
import RingVisualizer from "../common/RingVisualizer";
import { formatDisplayDate, formatDisplayTime, parseCH, formatCH } from "../../utils/formatters";
import { getRingNumeric, getLogicalShiftDate, calculateSoilVolume } from "../../utils/helpers";
import { apiCall } from "../../utils/api";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Line } from "recharts";

const SegmentDashboardView = ({ segmentRecords, setSegmentRecords }) => {
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
      await apiCall("updateSegment", updatedRecord);
      setSegmentRecords((prev) => prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r)));
      setSelectedRecord(null);
      setIsEditing(false);
    } catch (err) { alert("อัปเดตข้อมูลไม่สำเร็จ: " + err.message); }
  };

  const handleDeleteRecord = async () => {
    try {
      await apiCall("deleteSegment", { id: selectedRecord.id });
      setSegmentRecords((prev) => prev.filter((r) => r.id !== selectedRecord.id));
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
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-fade-in pb-24">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Permanent Rings" value={stats.permRings} subtext={`+ ${stats.tempRings} Temp. (Total: ${stats.totalRings})`} color="text-emerald-600" icon={Layers} />
        <StatCard label="Perm. Distance" value={`${Number(stats.totalDistance || 0).toFixed(2)} m`} subtext={`ดินขุดรวม: ${Number(stats.totalSoilVol || 0).toFixed(2)} m³`} color="text-blue-600" icon={TrendingUp} />
        <StatCard label="Daily Average" value={`${stats.avgRings} Rings`} subtext={`~ ${stats.avgDist} m / day`} color="text-orange-500" icon={Activity} />
        <StatCard label="Current Position" value={stats.currentCH} subtext="Latest Finish CH." color="text-indigo-600" icon={MapPin} />
      </div>

      {/* Filter Controls */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 sm:p-8">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center w-full bg-slate-50 p-2 rounded-xl border border-slate-100">
          <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm w-full sm:w-auto overflow-x-auto">
            <button onClick={() => setFilterMode("all")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${filterMode === "all" ? "bg-emerald-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>All</button>
            <button onClick={() => setFilterMode("daily")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${filterMode === "daily" ? "bg-emerald-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>Daily</button>
            <button onClick={() => setFilterMode("monthly")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${filterMode === "monthly" ? "bg-emerald-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>Monthly</button>
            <button onClick={() => setFilterMode("range")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${filterMode === "range" ? "bg-emerald-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>Range</button>
          </div>

          {filterMode === "daily" && <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-700 w-full sm:w-auto" />}
          {filterMode === "monthly" && <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-700 w-full sm:w-auto" />}
          {filterMode === "range" && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="px-2 py-1.5 flex-1 sm:flex-none sm:w-[120px] text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-700" />
              <span className="text-slate-400">-</span>
              <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="px-2 py-1.5 flex-1 sm:flex-none sm:w-[120px] text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-700" />
            </div>
          )}
          <div className="w-px h-6 bg-slate-200 hidden sm:block"></div>
          <select value={filterShift} onChange={(e) => setFilterShift(e.target.value)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-700 bg-white cursor-pointer w-full sm:w-auto">
            <option value="All">All Shifts</option>
            <option value="Day">Day Shift</option>
            <option value="Night">Night Shift</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-700 text-base">Segment Logs</h3>
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-sm text-left relative whitespace-nowrap">
            <thead className="text-xs text-slate-400 uppercase bg-slate-50 border-b border-slate-100 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-4">Date / Shift</th>
                <th className="px-6 py-4">Ring No.</th>
                <th className="px-6 py-4 text-center">Type / Key</th>
                <th className="px-6 py-4 text-right">Start CH.</th>
                <th className="px-6 py-4 text-right">Finish CH.</th>
                <th className="px-6 py-4 text-right">Length / Soil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredTableRecords.length > 0 ? (
                filteredTableRecords.map((rec, index) => (
                  <tr key={`${rec.id}-${index}`} onClick={() => { setSelectedRecord(rec); setIsEditing(false); }} className="hover:bg-emerald-50/40 transition-colors cursor-pointer group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800 text-base">{formatDisplayDate(rec.date)}</div>
                      <div className="text-xs text-slate-500 mt-1.5 font-mono"><span className="font-bold text-slate-400">Excav:</span> {formatDisplayTime(rec.excavStartTime)} - {formatDisplayTime(rec.excavEndTime)}</div>
                      <div className="text-xs text-slate-500 mt-0.5 font-mono"><span className="font-bold text-slate-400">Inst:</span> {formatDisplayTime(rec.installStartTime || rec.startTime)} - {formatDisplayTime(rec.installEndTime || rec.endTime)}</div>
                      <div className="text-xs text-slate-400 font-bold mt-1.5">{String(rec.shift)} Shift</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`font-black text-lg ${rec.installType === "Temporary" ? "text-amber-600" : "text-emerald-700"}`}>{String(rec.ringNo)}</div>
                      {rec.installType === "Temporary" && <div className="text-[10px] text-amber-500 font-bold mt-1 px-2 py-0.5 bg-amber-50 rounded inline-block">Temporary</div>}
                      {rec.status === "In Progress" && <div className="text-[10px] text-orange-500 font-bold mt-1 px-2 py-0.5 bg-orange-50 rounded inline-block">In Progress</div>}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-slate-100 px-3 py-1 rounded-lg text-xs font-bold text-slate-600 mr-2">{String(rec.typeRing)}</span>
                      <span className="text-xs font-bold text-slate-400">K{String(rec.keyPos)}</span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-slate-500 text-base">{String(rec.startCH)}</td>
                    <td className="px-6 py-4 text-right font-mono text-slate-800 font-bold text-base">{String(rec.finishCH)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-emerald-600 font-black text-base">{Number(rec.length || 0).toFixed(2)} m</div>
                      <div className="text-[10px] text-slate-500 font-medium mt-0.5">{Number(rec.soilVolume || calculateSoilVolume(rec.length)).toFixed(2)} m³</div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="6" className="px-6 py-12 text-center text-slate-400">ไม่พบข้อมูล หรือกำลังรอเชื่อมต่อฐานข้อมูล...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Segment Details Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transform transition-all">
            <div className="bg-gradient-to-r from-teal-600 to-emerald-700 px-6 py-4 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2"><Layers size={20} /> Segment Details</h3>
                <p className="text-emerald-100 text-xs mt-1">Record ID: {String(selectedRecord.id)}</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedRecord.imageUrl && selectedRecord.imageUrl !== "Attached" && (
                  <a href={selectedRecord.imageUrl} target="_blank" rel="noreferrer" className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors" title="View Photo"><Camera size={18} /></a>
                )}
                {!isEditing && <button onClick={() => { setEditFormData(selectedRecord); setIsEditing(true); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors" title="Edit"><Edit size={18} /></button>}
                <button onClick={() => setShowDeleteConfirm(true)} className="p-2 bg-white/10 hover:bg-red-500 rounded-full transition-colors" title="Delete"><Trash2 size={18} /></button>
                <button onClick={() => { setSelectedRecord(null); setShowDeleteConfirm(false); setIsEditing(false); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors ml-2"><X size={20} /></button>
              </div>
            </div>

            {showDeleteConfirm && (
              <div className="bg-red-50 p-4 flex justify-between items-center border-b border-red-100 shrink-0 animate-fade-in">
                <span className="text-red-700 text-sm font-bold flex items-center gap-2"><Trash2 size={16} /> ยืนยันการลบข้อมูล Ring {String(selectedRecord.ringNo)} ใช่หรือไม่?</span>
                <div className="flex gap-2">
                  <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-1.5 bg-white text-slate-600 rounded-lg shadow-sm text-xs font-bold border border-slate-200 hover:bg-slate-100">ยกเลิก</button>
                  <button onClick={handleDeleteRecord} className="px-4 py-1.5 bg-red-600 text-white rounded-lg shadow-sm text-xs font-bold hover:bg-red-700 flex items-center gap-1">ลบ</button>
                </div>
              </div>
            )}

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              <div className="flex flex-wrap justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100 gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Ring No. & Type</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <div className={`text-2xl font-black ${selectedRecord.installType === "Temporary" ? "text-amber-600" : "text-slate-800"}`}>
                        {isEditing ? <input type="text" name="ringNo" value={editFormData?.ringNo || ''} onChange={handleEditChange} className="w-32 bg-white border border-slate-200 rounded px-2 outline-none uppercase" /> : String(selectedRecord.ringNo)}
                      </div>
                      {isEditing ? (
                        <select name="typeRing" value={editFormData?.typeRing || ''} onChange={handleEditChange} className="bg-white border border-slate-200 rounded px-2 py-1 text-sm font-bold text-slate-600 outline-none cursor-pointer">
                          <option value="C1">C1</option>
                          <option value="C2">C2</option>
                          <option value="B1">B1</option>
                          <option value="B2">B2</option>
                          <option value="A">A</option>
                          <option value="K">K</option>
                        </select>
                      ) : (
                        <span className="bg-slate-200 px-3 py-1 rounded-lg text-sm font-bold text-slate-600">{String(selectedRecord.typeRing)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <select name="installType" value={editFormData?.installType || ''} onChange={handleEditChange} className="bg-white border rounded text-[10px] font-bold px-1 outline-none text-slate-600">
                            <option value="Permanent">Permanent</option>
                            <option value="Temporary">Temporary</option>
                          </select>
                          <select name="status" value={editFormData?.status || ''} onChange={handleEditChange} className="bg-white border rounded text-[10px] font-bold px-1 outline-none text-slate-600">
                            <option value="Completed">Completed</option>
                            <option value="In Progress">In Progress</option>
                          </select>
                        </div>
                      ) : (
                        <>
                          {selectedRecord.installType === "Temporary" && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold">Temporary Ring</span>}
                          {selectedRecord.status === "In Progress" && <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-bold">In Progress</span>}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Working Date & Shift</div>
                  <div className="text-sm font-bold text-slate-700 flex items-center justify-end gap-1.5"><Calendar size={14} /> {isEditing ? <input type="date" name="date" value={editFormData?.date || ''} onChange={handleEditChange} className="bg-white border rounded px-1 outline-none" /> : formatDisplayDate(selectedRecord.date)}</div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center justify-end gap-1">
                    {isEditing ? (
                      <select name="shift" value={editFormData?.shift || ''} onChange={handleEditChange} className="bg-white border rounded px-1 font-bold text-slate-600 outline-none">
                        <option value="Day">Day</option>
                        <option value="Night">Night</option>
                      </select>
                    ) : <span className="font-bold text-slate-600">({String(selectedRecord.shift)})</span>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 flex flex-col items-center justify-center relative">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 text-center">Ring Orientation</span>
                  {isEditing ? (
                    <div className="flex flex-col items-center w-full max-w-xs mt-2 p-4 bg-white rounded-xl border border-slate-200">
                      <div className="flex justify-between items-center w-full mb-3">
                        <label className="text-xs font-bold text-slate-500">Key Position</label>
                        <span className="bg-emerald-100 text-emerald-700 font-black px-3 py-1 rounded-lg text-sm shadow-sm">K{editFormData?.keyPos || 1}</span>
                      </div>
                      <input type="range" min="1" max="16" step="1" name="keyPos" value={editFormData?.keyPos || 1} onChange={handleEditChange} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600 mb-2" />
                      <div className="flex justify-between w-full text-[10px] text-slate-400 font-bold px-1"><span>1</span><span>4</span><span>8</span><span>12</span><span>16</span></div>
                    </div>
                  ) : (
                    <div className="scale-90 transform origin-top -mt-2">
                      <RingVisualizer ringKey={selectedRecord.keyPos} selectedPositions={{ K: true }} onTogglePosition={() => { }} />
                    </div>
                  )}
                </div>

                <div className="space-y-4 flex flex-col justify-center">
                  <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                    <div className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-3">Chainage Data</div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Start CH.</div>
                        <div className="font-mono text-base font-bold text-slate-700">{isEditing ? <input type="text" name="startCH" value={editFormData?.startCH || ''} onChange={handleEditChange} onBlur={(e) => setEditFormData(prev => ({ ...prev, startCH: formatCH(prev.startCH) }))} className="w-24 bg-white border border-emerald-200 rounded px-1 outline-none" /> : String(selectedRecord.startCH)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Finish CH.</div>
                        <div className="font-mono text-base font-bold text-slate-700">{isEditing ? <input type="text" name="finishCH" value={editFormData?.finishCH || ''} onChange={handleEditChange} onBlur={(e) => setEditFormData(prev => ({ ...prev, finishCH: formatCH(prev.finishCH) }))} className="w-24 bg-white border border-emerald-200 rounded px-1 outline-none" /> : String(selectedRecord.finishCH)}</div>
                      </div>
                    </div>
                    <div className="border-t border-emerald-200/50 pt-4 flex justify-between items-center">
                      <span className="text-xs text-slate-500">Length</span>
                      <div className="text-xl font-black text-emerald-600">{Number(isEditing ? editFormData?.length : selectedRecord.length || 0).toFixed(2)} <span className="text-sm font-normal">m</span></div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col gap-4">
                    <div className="flex justify-between items-center gap-2">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-16">Excavate</div>
                      <div className="flex-1 flex items-center justify-end gap-2">
                        <div className="font-mono text-sm font-bold text-slate-700">
                          {isEditing ? (
                            <div className="flex gap-1">
                              <input type="time" name="excavStartTime" value={editFormData?.excavStartTime?.slice(0, 5) || ''} onChange={handleEditChange} className="bg-white border rounded px-1 outline-none w-20" />
                              <span>-</span>
                              <input type="time" name="excavEndTime" value={editFormData?.excavEndTime?.slice(0, 5) || ''} onChange={handleEditChange} className="bg-white border rounded px-1 outline-none w-20" />
                            </div>
                          ) : `${formatDisplayTime(selectedRecord.excavStartTime)} - ${formatDisplayTime(selectedRecord.excavEndTime)}`}
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-slate-100"></div>
                    <div className="flex justify-between items-center gap-2">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-16">Install</div>
                      <div className="flex-1 flex items-center justify-end gap-2">
                        <div className="font-mono text-sm font-bold text-slate-700">
                          {isEditing ? (
                            <div className="flex gap-1">
                              <input type="time" name="installStartTime" value={(editFormData?.installStartTime || editFormData?.startTime || '')?.slice(0, 5)} onChange={handleEditChange} className="bg-white border rounded px-1 outline-none w-20" />
                              <span>-</span>
                              <input type="time" name="installEndTime" value={(editFormData?.installEndTime || editFormData?.endTime || '')?.slice(0, 5)} onChange={handleEditChange} className="bg-white border rounded px-1 outline-none w-20" />
                            </div>
                          ) : `${formatDisplayTime(selectedRecord.installStartTime || selectedRecord.startTime)} - ${formatDisplayTime(selectedRecord.installEndTime || selectedRecord.endTime)}`}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {(selectedRecord.remark || isEditing) && (
                <div className="bg-orange-50/50 rounded-2xl p-4 border border-orange-100">
                  <div className="text-xs font-bold text-orange-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">Remarks (ปัญหา)</div>
                  {isEditing ? <textarea name="remark" value={editFormData?.remark || ''} onChange={handleEditChange} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm outline-none" rows="2" /> : <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{String(selectedRecord.remark)}</p>}
                </div>
              )}

              {isEditing && (
                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 mt-4">
                  <button onClick={() => setIsEditing(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold text-sm hover:bg-slate-200">Cancel</button>
                  <button onClick={handleSaveEdit} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm flex items-center gap-1"><Save size={16} /> Save Changes</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Plan Settings Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-slate-800 px-6 py-4 text-white flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg flex items-center gap-2"><Settings size={20} /> ตั้งค่าแผนงาน (Plan Settings)</h3>
              <button onClick={() => setShowPlanModal(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                <h4 className="font-bold text-blue-800 mb-3 text-sm">ตั้งค่าพื้นฐาน (Baseline)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">Baseline Actual (Rings)</label>
                    <input type="number" value={planConfig.baseActualAcc} onChange={(e) => setPlanConfig({ ...planConfig, baseActualAcc: Number(e.target.value) })} className="w-full bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500 font-mono text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">Baseline Plan (Rings)</label>
                    <input type="number" value={planConfig.basePlanAcc} onChange={(e) => setPlanConfig({ ...planConfig, basePlanAcc: Number(e.target.value) })} className="w-full bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500 font-mono text-sm" />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-bold text-slate-800 text-sm">ช่วงเวลาแผนงาน (Plan Ranges)</h4>
                  <button onClick={addPlanRange} className="text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 transition-colors"><Plus size={14} /> เพิ่มช่วง (Add Range)</button>
                </div>
                <div className="space-y-3">
                  {(planConfig.ranges || []).map((range, index) => (
                    <div key={index} className="flex items-center gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1">เริ่ม (Start)</label>
                          <input type="date" value={range.start} onChange={(e) => { const newRanges = [...(planConfig.ranges || [])]; newRanges[index].start = e.target.value; setPlanConfig({ ...planConfig, ranges: newRanges }); }} className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs outline-none focus:border-emerald-500" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1">สิ้นสุด (End)</label>
                          <input type="date" value={range.end} onChange={(e) => { const newRanges = [...(planConfig.ranges || [])]; newRanges[index].end = e.target.value; setPlanConfig({ ...planConfig, ranges: newRanges }); }} className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs outline-none focus:border-emerald-500" />
                        </div>
                      </div>
                      <div className="w-20 shrink-0">
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">Plan/Day</label>
                        <input type="number" step="0.5" value={range.dailyPlan} onChange={(e) => { const newRanges = [...(planConfig.ranges || [])]; newRanges[index].dailyPlan = Number(e.target.value); setPlanConfig({ ...planConfig, ranges: newRanges }); }} className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs outline-none focus:border-emerald-500 font-mono text-center font-bold" />
                      </div>
                      <button onClick={() => removePlanRange(index)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded mt-4 transition-colors" title="ลบ"><Trash2 size={16} /></button>
                    </div>
                  ))}
                  {(planConfig.ranges || []).length === 0 && <div className="text-center p-4 text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">ไม่พบช่วงเวลาแผนงาน (ใช้ Default 0 Ring/Day)</div>}
                </div>
                <p className="text-[10px] text-slate-500 mt-2">หมายเหตุ* : หากมีช่วงเวลาทับซ้อนกัน จะใช้ข้อมูลจากลำดับล่าสุดเป็นหลัก ส่วนวันที่อยู่นอกช่วงจะใช้แผนเป็น 0 Ring/Day</p>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 shrink-0">
              <button onClick={() => setShowPlanModal(false)} className="px-5 py-2.5 bg-white text-slate-600 rounded-xl text-sm font-bold border border-slate-200 hover:bg-slate-100 shadow-sm transition-colors">ยกเลิก</button>
              <button onClick={handleSavePlanSettings} className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-emerald-700 transition-colors flex items-center gap-2"><Save size={16} /> บันทึกการตั้งค่า</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SegmentDashboardView;
