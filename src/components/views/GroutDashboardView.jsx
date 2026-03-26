import React, { useState, useMemo, useEffect } from "react";
import { FileText, Droplet, Activity, ChevronLeft, ChevronRight, Edit, Trash2, X, Camera, Calendar, Save, Loader2, Info } from "lucide-react";
import { formatDisplayDate, formatCH } from "../../utils/formatters";
import { getRingNumeric, getRingByOffsetFromHistory } from "../../utils/helpers";
import { THEORETICAL_VOL, VOL_120, VOL_150 } from "../../utils/constants";
import { apiCall } from "../../utils/api";
import StatCard from "../common/StatCard";
import RingVisualizer from "../common/RingVisualizer";
import { ResponsiveContainer, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, Area } from "recharts";

const GroutDashboardView = ({ groutRecords, segmentRecords, setGroutRecords }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const [filterMode, setFilterMode] = useState("all");
  const [chartWindow, setChartWindow] = useState(20);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filterShift, setFilterShift] = useState("All");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const chartData = useMemo(() => {
    let baseData = filterShift === "All" ? groutRecords : groutRecords.filter((r) => r.shift === filterShift);
    baseData = baseData.map((r) => ({ ...r, displayRing: r.groutPass === "Re-Grout" ? `${r.ringNo} (Re)` : r.ringNo }));

    if (filterMode === "all") return baseData;
    else if (filterMode === "range" && rangeStart && rangeEnd) {
      const startNum = getRingNumeric(rangeStart);
      const endNum = getRingNumeric(rangeEnd);
      return baseData.filter((r) => { const rNum = getRingNumeric(r.ringNo); return rNum >= startNum && rNum <= endNum; }).sort((a, b) => getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo));
    } else if (filterMode === "daily") return baseData.filter((r) => r.date && r.date.startsWith(filterDate));
    else if (filterMode === "monthly") return baseData.filter((r) => r.date && r.date.startsWith(filterMonth));
    else { const start = Math.max(0, baseData.length - chartWindow); return baseData.slice(start, baseData.length); }
  }, [groutRecords, filterMode, chartWindow, rangeStart, rangeEnd, filterDate, filterMonth, filterShift]);

  const filteredRecords = useMemo(() => [...chartData].reverse(), [chartData]);
  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
  const tableData = useMemo(() => filteredRecords.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredRecords, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [filterMode, chartWindow, rangeStart, rangeEnd, filterDate, filterMonth, filterShift]);

  useEffect(() => {
    if (isEditing && editFormData?.ringNo) {
      const inputRing = String(editFormData.ringNo).trim().toUpperCase();
      const segment = segmentRecords.find((s) => String(s.ringNo).trim().toUpperCase() === inputRing);
      if (segment) {
        setEditFormData((prev) => prev.key !== segment.keyPos ? { ...prev, key: segment.keyPos } : prev);
      }
    }
  }, [isEditing, editFormData?.ringNo, segmentRecords]);

  const handleTogglePosition = (pos) => {
    setEditFormData((prev) => {
      const isReGrout = selectedRecord.groutPass === "Re-Grout";
      if (isReGrout) {
        return { ...prev, secondaryPositions: { ...(prev.secondaryPositions || {}), [pos]: !(prev.secondaryPositions || {})[pos] } };
      } else {
        return { ...prev, positions: { ...(prev.positions || {}), [pos]: !(prev.positions || {})[pos] }, primaryPositions: { ...(prev.primaryPositions || {}), [pos]: !(prev.primaryPositions || {})[pos] } };
      }
    });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData((prev) => {
      let updated = { ...prev, [name]: value };
      if (name === "ringNo") updated.excavRing = getRingByOffsetFromHistory(String(value).trim(), 3, segmentRecords);
      return updated;
    });
  };

  const handleSaveEdit = async () => {
    const isReGrout = editFormData.groutPass === "Re-Grout";
    const total = isReGrout
      ? Number(editFormData.primaryPartA || editFormData.partA || 0) + Number(editFormData.primaryPartB || editFormData.partB || 0) + Number(editFormData.secondaryPartA || 0) + Number(editFormData.secondaryPartB || 0)
      : Number(editFormData.partA || 0) + Number(editFormData.partB || 0);
    const ratio = (total / THEORETICAL_VOL) * 100;
    const cleanRingNo = String(editFormData.ringNo).trim().toUpperCase();
    const updatedRecord = { ...editFormData, ringNo: cleanRingNo, total: Number(total), ratio: Number(ratio) };

    try {
      const payloadRecord = {
        ...updatedRecord,
        positions: typeof updatedRecord.positions === 'object' ? JSON.stringify(updatedRecord.positions) : updatedRecord.positions,
        primaryPositions: typeof updatedRecord.primaryPositions === 'object' ? JSON.stringify(updatedRecord.primaryPositions) : updatedRecord.primaryPositions,
        secondaryPositions: typeof updatedRecord.secondaryPositions === 'object' ? JSON.stringify(updatedRecord.secondaryPositions) : updatedRecord.secondaryPositions
      };
      await apiCall("updateGrout", payloadRecord);
      setGroutRecords((prev) => prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r)));
      setSelectedRecord(updatedRecord);
      setIsEditing(false);
    } catch (e) { alert("อัปเดตข้อมูลล้มเหลว"); }
  };

  const handleDeleteRecord = async () => {
    try {
      await apiCall("deleteGrout", { id: selectedRecord.id });
      setGroutRecords((prev) => prev.filter((r) => r.id !== selectedRecord.id));
      setSelectedRecord(null);
      setShowDeleteConfirm(false);
    } catch (e) { alert("ลบข้อมูลล้มเหลว"); }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-fade-in pb-24">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Unique Rings" value={new Set(groutRecords.map((r) => r.ringNo)).size} subtext="Records found" color="text-blue-600" icon={FileText} />
        <StatCard label="Avg. Volume" value={Number((groutRecords.reduce((acc, r) => acc + Number(r.total || 0), 0) / (groutRecords.length || 1))).toFixed(2)} subtext="Cubic Meters" color="text-emerald-600" icon={Droplet} />
        <StatCard label="Avg. Ratio" value={`${Number((groutRecords.reduce((acc, r) => acc + Number(r.ratio || 0), 0) / (groutRecords.length || 1))).toFixed(1)}%`} subtext="Efficiency" color="text-orange-500" icon={Activity} />
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-5 rounded-3xl shadow-lg text-white relative overflow-hidden flex flex-col justify-between">
          <div className="relative z-10 flex flex-col h-full justify-center">
            <div className="flex items-center gap-2 font-black text-xl mb-1"><Activity size={24} /> Status</div>
            <div className="text-sm opacity-90 font-medium">Data Synced Successfully</div>
          </div>
          <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-white/20 rounded-full blur-2xl"></div>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 sm:p-8">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center w-full bg-slate-50 p-2 rounded-xl border border-slate-100">
          <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm w-full sm:w-auto overflow-x-auto">
            <button onClick={() => setFilterMode("all")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${filterMode === "all" ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>All</button>
            <button onClick={() => setFilterMode("lastN")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${filterMode === "lastN" ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>Last N</button>
            <button onClick={() => setFilterMode("daily")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${filterMode === "daily" ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>Daily</button>
            <button onClick={() => setFilterMode("monthly")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${filterMode === "monthly" ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>Monthly</button>
            <button onClick={() => setFilterMode("range")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${filterMode === "range" ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>Range</button>
          </div>

          {filterMode === "lastN" && (
            <div className="flex gap-1 w-full sm:w-auto overflow-x-auto">
              {[10, 20, 50, 100].map((val) => (
                <button key={val} onClick={() => setChartWindow(val)} className={`px-3 py-1.5 text-xs rounded-md font-medium border transition whitespace-nowrap ${chartWindow === val ? "bg-blue-100 border-blue-200 text-blue-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>Last {val}</button>
              ))}
            </div>
          )}
          {filterMode === "daily" && <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 w-full sm:w-auto" />}
          {filterMode === "monthly" && <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 w-full sm:w-auto" />}
          {filterMode === "range" && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input type="text" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} placeholder="P1" className="px-2 py-1.5 w-full sm:w-16 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none uppercase text-slate-700 text-center" />
              <span className="text-slate-400">-</span>
              <input type="text" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} placeholder="P10" className="px-2 py-1.5 w-full sm:w-16 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none uppercase text-slate-700 text-center" />
            </div>
          )}
          <div className="w-px h-6 bg-slate-200 hidden sm:block"></div>
          <select value={filterShift} onChange={(e) => setFilterShift(e.target.value)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 bg-white cursor-pointer w-full sm:w-auto">
            <option value="All">All Shifts</option>
            <option value="Day">Day Shift</option>
            <option value="Night">Night Shift</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center bg-slate-50/50 gap-3">
          <h3 className="font-bold text-slate-700 text-base">Detailed Grout Logs</h3>
          <div className="flex gap-2 self-end sm:self-auto">
            <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} className="p-1.5 border border-slate-200 rounded-md bg-white hover:bg-slate-50 text-slate-500"><ChevronLeft size={16} /></button>
            <span className="px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white font-medium text-slate-600">Page {currentPage} of {totalPages || 1}</span>
            <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} className="p-1.5 border border-slate-200 rounded-md bg-white hover:bg-slate-50 text-slate-500"><ChevronRight size={16} /></button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-slate-400 uppercase bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Ring / Timeline</th>
                <th className="px-6 py-4">Config (Key & Pos)</th>
                <th className="px-6 py-4 text-right">Volume</th>
                <th className="px-6 py-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {tableData.map((record, index) => (
                <tr key={`${record.id}-${index}`} onClick={() => { setSelectedRecord(record); setIsEditing(false); }} className="hover:bg-blue-50/40 transition-colors group cursor-pointer">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-slate-800 text-base">{String(record.ringNo)}</div>
                      {record.groutPass === "Re-Grout" && <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[9px] font-bold">Re-Grout</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Ex: {String(record.excavRing)}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`w-2 h-2 rounded-full ${record.shift === "Day" ? "bg-amber-400" : "bg-indigo-500"}`}></span>
                      <span className="text-xs text-slate-500 font-medium">{formatDisplayDate(record.date)} ({String(record.shift)})</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600 inline-block mb-1">Key {String(record.key)}</div>
                    <div className="flex gap-1 flex-wrap">
                      {record.groutPass === "Re-Grout" ? (
                        <>
                          {Object.entries(Object.values(record.primaryPositions || {}).some(v => v === true) ? record.primaryPositions : (record.positions || {})).map(([pos, active]) => active && <span key={`p_${pos}`} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[9px] rounded border border-blue-100 font-bold leading-none">{String(pos)}</span>)}
                          {Object.entries(record.secondaryPositions || {}).map(([pos, active]) => active && <span key={`s_${pos}`} className="px-1.5 py-0.5 bg-orange-50 text-orange-600 text-[9px] rounded border border-orange-200 font-bold leading-none">{String(pos)}</span>)}
                        </>
                      ) : (
                        Object.entries(Object.values(record.primaryPositions || {}).some(v => v === true) ? record.primaryPositions : (record.positions || {})).map(([pos, active]) => active && <span key={pos} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[9px] rounded border border-blue-100 font-bold leading-none">{String(pos)}</span>)
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="font-bold text-slate-800 text-base">{Number(record.total || 0).toFixed(2)} m³</div>
                    <div className="text-xs text-slate-400 mt-1">{String(record.pressure || '')} bar</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold border ${Number(record.ratio || 0) > 150 ? "bg-purple-50 text-purple-700 border-purple-200" : Number(record.ratio || 0) >= 100 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                      {Number(record.ratio || 0).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- Edit Modal Grout --- */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transform transition-all">
            <div className={`px-6 py-4 text-white flex justify-between items-center shrink-0 ${selectedRecord.groutPass === 'Re-Grout' ? 'bg-gradient-to-r from-orange-500 to-red-600' : 'bg-gradient-to-r from-blue-600 to-indigo-700'}`}>
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2"><FileText size={18} /> {selectedRecord.groutPass === "Re-Grout" ? "Secondary Grout Details" : "Ring Details"}</h3>
                <p className="text-white/80 text-xs mt-0.5">Record ID: {String(selectedRecord.id)}</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedRecord.imageUrl && selectedRecord.imageUrl !== "Attached" && (
                  <a href={selectedRecord.imageUrl} target="_blank" rel="noreferrer" className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors" title="View Photo"><Camera size={18} /></a>
                )}
                {!isEditing && <button onClick={() => { setEditFormData(selectedRecord); setIsEditing(true); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors" title="Edit"><Edit size={18} /></button>}
                <button onClick={() => setShowDeleteConfirm(true)} className="p-2 bg-white/10 hover:bg-red-500 rounded-full transition-colors" title="Delete"><Trash2 size={18} /></button>
                <button onClick={() => { setSelectedRecord(null); setIsEditing(false); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors ml-2"><X size={20} /></button>
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
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Grouting Ring</div>
                  <div className="flex items-center gap-2">
                    <div className={`text-2xl font-black ${selectedRecord.groutPass === 'Re-Grout' ? 'text-orange-600' : 'text-slate-800'}`}>
                      {isEditing ? <input type="text" name="ringNo" value={editFormData?.ringNo || ''} onChange={handleEditChange} className="w-32 bg-white border border-slate-200 rounded px-2 outline-none uppercase" /> : String(selectedRecord.ringNo)}
                    </div>
                    {selectedRecord.groutPass === "Re-Grout" && <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-bold">Re-Grout</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">Excavation: {isEditing ? <input type="text" name="excavRing" value={editFormData?.excavRing || ''} onChange={handleEditChange} className="w-20 bg-white border border-slate-200 rounded px-1 outline-none uppercase" /> : String(selectedRecord.excavRing)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Latest Working Date</div>
                  <div className="text-sm font-bold text-slate-700 flex items-center justify-end gap-1.5"><Calendar size={14} /> {isEditing ? <input type="date" name="date" value={editFormData?.date || ''} onChange={handleEditChange} className="bg-white border border-slate-200 rounded px-2 outline-none" /> : formatDisplayDate(selectedRecord.date)}</div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center justify-end gap-1">
                    {isEditing ? (
                      <select name="shift" value={editFormData?.shift || ''} onChange={handleEditChange} className="bg-white border border-slate-200 rounded px-1 outline-none cursor-pointer">
                        <option value="Day">Day</option>
                        <option value="Night">Night</option>
                      </select>
                    ) : <span className="font-bold text-slate-600">({String(selectedRecord.shift)})</span>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 flex flex-col items-center justify-center relative">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 text-center">Injection Configuration</span>
                  <div className="scale-90 transform origin-top -mt-2">
                    <RingVisualizer
                      ringKey={isEditing ? editFormData?.key : selectedRecord.key}
                      primaryPositions={isEditing ? (Object.values(editFormData?.primaryPositions || {}).some(v => v === true) ? editFormData?.primaryPositions : (editFormData?.positions || {})) : Object.values(selectedRecord.primaryPositions || {}).some(v => v === true) ? selectedRecord.primaryPositions : (selectedRecord.positions || {})}
                      secondaryPositions={(isEditing ? editFormData?.groutPass : selectedRecord.groutPass) === "Re-Grout" ? (isEditing ? editFormData?.secondaryPositions : selectedRecord.secondaryPositions) : null}
                      onTogglePosition={isEditing ? handleTogglePosition : () => { }}
                    />
                  </div>
                </div>

                <div className="space-y-4 flex flex-col justify-center">
                  {selectedRecord.groutPass === "Re-Grout" ? (
                    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm mb-4">
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Volume Breakdown</div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                          <div className="font-bold text-blue-600 text-[10px] mb-2 uppercase">Primary Grout</div>
                          <div className="flex justify-between text-xs items-center mb-1"><span className="text-slate-500">Part A</span><span className="font-bold text-slate-700">{isEditing ? <input type="number" step="0.01" name="primaryPartA" value={editFormData?.primaryPartA || editFormData?.partA || ''} onChange={handleEditChange} className="w-16 bg-white border rounded px-1 text-right outline-none" /> : Number(selectedRecord.primaryPartA || selectedRecord.partA || 0).toFixed(2)}</span></div>
                          <div className="flex justify-between text-xs items-center"><span className="text-slate-500">Part B</span><span className="font-bold text-slate-700">{isEditing ? <input type="number" step="0.01" name="primaryPartB" value={editFormData?.primaryPartB || editFormData?.partB || ''} onChange={handleEditChange} className="w-16 bg-white border rounded px-1 text-right outline-none" /> : Number(selectedRecord.primaryPartB || selectedRecord.partB || 0).toFixed(2)}</span></div>
                        </div>
                        <div className="bg-orange-50 p-3 rounded-xl border border-orange-100">
                          <div className="font-bold text-orange-600 text-[10px] mb-2 uppercase">Secondary Grout</div>
                          <div className="flex justify-between text-xs items-center mb-1"><span className="text-slate-500">Part A</span><span className="font-bold text-slate-700">{isEditing ? <input type="number" step="0.01" name="secondaryPartA" value={editFormData?.secondaryPartA || ''} onChange={handleEditChange} className="w-16 bg-white border rounded px-1 text-right outline-none" /> : Number(selectedRecord.secondaryPartA || 0).toFixed(2)}</span></div>
                          <div className="flex justify-between text-xs items-center"><span className="text-slate-500">Part B</span><span className="font-bold text-slate-700">{isEditing ? <input type="number" step="0.01" name="secondaryPartB" value={editFormData?.secondaryPartB || ''} onChange={handleEditChange} className="w-16 bg-white border rounded px-1 text-right outline-none" /> : Number(selectedRecord.secondaryPartB || 0).toFixed(2)}</span></div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-200">
                        <div className="text-center">
                          <div className="text-[10px] text-slate-500">Total Part A</div>
                          <div className="font-bold text-slate-800">{(Number(isEditing ? (editFormData?.primaryPartA || editFormData?.partA || 0) : (selectedRecord.primaryPartA || selectedRecord.partA || 0)) + Number(isEditing ? (editFormData?.secondaryPartA || 0) : (selectedRecord.secondaryPartA || 0))).toFixed(2)} m³</div>
                        </div>
                        <div className="text-center border-l border-r border-slate-200">
                          <div className="text-[10px] text-slate-500">Total Part B</div>
                          <div className="font-bold text-slate-800">{(Number(isEditing ? (editFormData?.primaryPartB || editFormData?.partB || 0) : (selectedRecord.primaryPartB || selectedRecord.partB || 0)) + Number(isEditing ? (editFormData?.secondaryPartB || 0) : (selectedRecord.secondaryPartB || 0))).toFixed(2)} m³</div>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] text-slate-500">Total Vol.</div>
                          <div className="font-black text-blue-600">{Number(isEditing ? (Number(editFormData?.primaryPartA || editFormData?.partA || 0) + Number(editFormData?.secondaryPartA || 0) + Number(editFormData?.primaryPartB || editFormData?.partB || 0) + Number(editFormData?.secondaryPartB || 0)) : selectedRecord.total || 0).toFixed(2)} m³</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                      <div className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-3">Volume Data</div>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Part A</div>
                          <div className="font-mono text-lg font-bold text-slate-700">{isEditing ? <input type="number" step="0.01" name="partA" value={editFormData?.partA || ''} onChange={handleEditChange} className="w-20 bg-white border border-blue-200 rounded px-2 outline-none" /> : Number(selectedRecord.partA || 0).toFixed(2)} <span className="text-xs font-sans text-slate-400">m³</span></div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Part B</div>
                          <div className="font-mono text-lg font-bold text-slate-700">{isEditing ? <input type="number" step="0.01" name="partB" value={editFormData?.partB || ''} onChange={handleEditChange} className="w-20 bg-white border border-blue-200 rounded px-2 outline-none" /> : Number(selectedRecord.partB || 0).toFixed(2)} <span className="text-xs font-sans text-slate-400">m³</span></div>
                        </div>
                      </div>
                      <div className="border-t border-blue-200/50 pt-3 flex justify-between items-end">
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Total Volume</div>
                          <div className="text-2xl font-black text-blue-700">{Number(isEditing ? (Number(editFormData?.partA || 0) + Number(editFormData?.partB || 0)) : (selectedRecord.total || 0)).toFixed(2)} <span className="text-sm font-sans font-normal text-blue-500">m³</span></div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Pressure</div>
                      <div className="font-mono text-xl font-bold text-slate-700">{isEditing ? <input type="number" step="0.1" name="pressure" value={editFormData?.pressure || ''} onChange={handleEditChange} className="w-20 bg-white border border-slate-200 rounded px-2 outline-none" /> : String(selectedRecord.pressure || '')} <span className="text-sm font-sans text-slate-400 font-normal">bar</span></div>
                    </div>
                    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-center items-end">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Final Ratio</div>
                      <div className={`text-2xl font-black ${Number(isEditing ? (((Number(editFormData?.partA || editFormData?.primaryPartA || 0) + Number(editFormData?.partB || editFormData?.primaryPartB || 0) + Number(editFormData?.secondaryPartA || 0) + Number(editFormData?.secondaryPartB || 0))) / THEORETICAL_VOL * 100) : selectedRecord.ratio || 0) > 150 ? "text-purple-500" : Number(isEditing ? (((Number(editFormData?.partA || editFormData?.primaryPartA || 0) + Number(editFormData?.partB || editFormData?.primaryPartB || 0) + Number(editFormData?.secondaryPartA || 0) + Number(editFormData?.secondaryPartB || 0))) / THEORETICAL_VOL * 100) : selectedRecord.ratio || 0) >= 100 ? "text-emerald-500" : "text-red-500"}`}>
                        {Number(isEditing ? (((Number(editFormData?.partA || editFormData?.primaryPartA || 0) + Number(editFormData?.partB || editFormData?.primaryPartB || 0) + Number(editFormData?.secondaryPartA || 0) + Number(editFormData?.secondaryPartB || 0))) / THEORETICAL_VOL * 100) : selectedRecord.ratio || 0).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {(selectedRecord.remark || isEditing) && (
                <div className="bg-slate-100 rounded-2xl p-4 border border-slate-200">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Info size={14} /> Remarks (ปัญหา)</div>
                  {isEditing ? <textarea name="remark" value={editFormData?.remark || ''} onChange={handleEditChange} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm outline-none" rows="2" /> : <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{String(selectedRecord.remark)}</p>}
                </div>
              )}

              {isEditing && (
                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 mt-4">
                  <button onClick={() => setIsEditing(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold text-sm hover:bg-slate-200">Cancel</button>
                  <button onClick={handleSaveEdit} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm flex items-center gap-1"><Save size={16} /> Save Changes</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroutDashboardView;
