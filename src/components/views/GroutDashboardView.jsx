import React, { useState, useMemo, useEffect } from "react";
import { FileText, Droplet, Activity, ChevronLeft, ChevronRight, Edit, Trash2, X, Camera, Calendar, Save, Loader2, Info } from "lucide-react";
import { formatDisplayDate, formatCH } from "../../utils/formatters";
import { getRingNumeric } from "../../utils/helpers";
import { THEORETICAL_VOL, VOL_120, VOL_150 } from "../../utils/constants";
import { buildMutationEnvelope } from "../../offline/mutationEnvelope";
import StatCard from "../common/StatCard";
import RingVisualizer from "../common/RingVisualizer";
import { ResponsiveContainer, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, Area } from "recharts";
import { Badge } from "../../ui-ux-pro-max";

const GroutDashboardView = ({ groutRecords, segmentRecords, secondaryGroutRecords = [], machine = "TBM1", onMutate, syncMeta, readOnly = false }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const [groutScope, setGroutScope] = useState("all"); // all | primary | secondary
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

  // merge primary + secondary (tag groutType) ตาม scope
  const allRecords = useMemo(() => {
    const prim = (groutRecords || []).map((r) => ({ ...r, groutType: "primary" }));
    const sec = (secondaryGroutRecords || []).map((r) => ({ ...r, groutType: "secondary" }));
    if (groutScope === "primary") return prim;
    if (groutScope === "secondary") return sec;
    return [...prim, ...sec];
  }, [groutRecords, secondaryGroutRecords, groutScope]);

  const chartData = useMemo(() => {
    let baseData = filterShift === "All" ? allRecords : allRecords.filter((r) => r.shift === filterShift);
    baseData = baseData.map((r) => ({ ...r, displayRing: r.groutType === "secondary" ? `${r.ringNo} (S)` : (r.groutPass === "Re-Grout" ? `${r.ringNo} (Re)` : r.ringNo) }));

    if (filterMode === "all") return baseData;
    else if (filterMode === "range" && rangeStart && rangeEnd) {
      const startNum = getRingNumeric(rangeStart);
      const endNum = getRingNumeric(rangeEnd);
      return baseData.filter((r) => { const rNum = getRingNumeric(r.ringNo); return rNum >= startNum && rNum <= endNum; }).sort((a, b) => getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo));
    } else if (filterMode === "daily") return baseData.filter((r) => r.date && r.date.startsWith(filterDate));
    else if (filterMode === "monthly") return baseData.filter((r) => r.date && r.date.startsWith(filterMonth));
    else { const start = Math.max(0, baseData.length - chartWindow); return baseData.slice(start, baseData.length); }
  }, [allRecords, filterMode, chartWindow, rangeStart, rangeEnd, filterDate, filterMonth, filterShift]);

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
    // the ring is not editable, so nothing here has to re-derive anything from it
    setEditFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveEdit = async () => {
    // secondary grout → sheet แยก, ไม่มี ratio
    if (editFormData.groutType === "secondary") {
      const total = Number(editFormData.partA || 0) + Number(editFormData.partB || 0);
      // the ring is not editable here, so it travels exactly as the record carries it
      const updated = { ...editFormData, total: Number(total) };
      try {
        await onMutate(buildMutationEnvelope({
          entityType: "secondaryGrout", operation: "update", machine,
          recordId: updated.id, payload: updated, syncMeta,
        }));
        setSelectedRecord(updated); setIsEditing(false);
      } catch (e) { alert("อัปเดตข้อมูลล้มเหลว: " + e.message); }
      return;
    }
    const isReGrout = editFormData.groutPass === "Re-Grout";
    const total = isReGrout
      ? Number(editFormData.primaryPartA || editFormData.partA || 0) + Number(editFormData.primaryPartB || editFormData.partB || 0) + Number(editFormData.secondaryPartA || 0) + Number(editFormData.secondaryPartB || 0)
      : Number(editFormData.partA || 0) + Number(editFormData.partB || 0);
    const ratio = (total / THEORETICAL_VOL) * 100;
    // the ring is not editable here, so it travels exactly as the record carries it
    const updatedRecord = { ...editFormData, total: Number(total), ratio: Number(ratio) };

    try {
      // the queue serializes the payload itself, so it takes the record with `positions` still an
      // object — the one-shot write used to stringify them here to stop GAS double-encoding
      await onMutate(buildMutationEnvelope({
        entityType: "grout", operation: "update", machine,
        recordId: updatedRecord.id, payload: updatedRecord, syncMeta,
      }));
      setSelectedRecord(updatedRecord);
      setIsEditing(false);
    } catch (e) { alert("อัปเดตข้อมูลล้มเหลว: " + e.message); }
  };

  const handleDeleteRecord = async () => {
    try {
      const isSecondaryRecord = selectedRecord.groutType === "secondary";
      // the payload still carries the ring, because the domain key is derived from it
      await onMutate(buildMutationEnvelope({
        entityType: isSecondaryRecord ? "secondaryGrout" : "grout", operation: "delete", machine,
        recordId: selectedRecord.id, payload: selectedRecord, syncMeta,
      }));
      setSelectedRecord(null);
      setShowDeleteConfirm(false);
    } catch (e) { alert("ลบข้อมูลล้มเหลว: " + e.message); }
  };

  return (
    <div className="max-w-full mx-auto space-y-6 sm:space-y-8 animate-fade-in pb-24">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Unique Rings" value={new Set(groutRecords.map((r) => r.ringNo)).size} subtext="Records found" color="text-navy" icon={FileText} />
        <StatCard label="Avg. Volume" value={Number((groutRecords.reduce((acc, r) => acc + Number(r.total || 0), 0) / (groutRecords.length || 1))).toFixed(2)} subtext="Cubic Meters" color="text-sgreen-dark" icon={Droplet} />
        <StatCard label="Avg. Ratio" value={`${Number((groutRecords.reduce((acc, r) => acc + Number(r.ratio || 0), 0) / (groutRecords.length || 1))).toFixed(1)}%`} subtext="Efficiency" color="text-code-c" icon={Activity} />
        {/* Status card — CMI navy */}
        <div className="bg-navy p-5 rounded-card shadow-card text-white relative overflow-hidden flex flex-col justify-between">
          <div className="relative z-10 flex flex-col h-full justify-center">
            <div className="flex items-center gap-2 font-semibold text-xl mb-1"><Activity size={24} /> Status</div>
            <div className="text-sm opacity-90 font-medium">Data Synced Successfully</div>
          </div>
          <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="bg-surface rounded-card shadow-card border border-line p-5 sm:p-8">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center w-full bg-surface-alt p-2 rounded-input border border-line">
          <div className="flex bg-surface rounded-input p-1 border border-line shadow-card w-full sm:w-auto overflow-x-auto">
            <button onClick={() => setFilterMode("all")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-input font-semibold transition whitespace-nowrap ${filterMode === "all" ? "bg-navy text-white shadow" : "text-ink-2 hover:bg-surface-alt"}`}>All</button>
            <button onClick={() => setFilterMode("lastN")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-input font-semibold transition whitespace-nowrap ${filterMode === "lastN" ? "bg-navy text-white shadow" : "text-ink-2 hover:bg-surface-alt"}`}>Last N</button>
            <button onClick={() => setFilterMode("daily")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-input font-semibold transition whitespace-nowrap ${filterMode === "daily" ? "bg-navy text-white shadow" : "text-ink-2 hover:bg-surface-alt"}`}>Daily</button>
            <button onClick={() => setFilterMode("monthly")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-input font-semibold transition whitespace-nowrap ${filterMode === "monthly" ? "bg-navy text-white shadow" : "text-ink-2 hover:bg-surface-alt"}`}>Monthly</button>
            <button onClick={() => setFilterMode("range")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-input font-semibold transition whitespace-nowrap ${filterMode === "range" ? "bg-navy text-white shadow" : "text-ink-2 hover:bg-surface-alt"}`}>Range</button>
          </div>

          {filterMode === "lastN" && (
            <div className="flex gap-1 w-full sm:w-auto overflow-x-auto">
              {[10, 20, 50, 100].map((val) => (
                <button key={val} onClick={() => setChartWindow(val)} className={`px-3 py-1.5 text-xs rounded-input font-semibold border transition whitespace-nowrap ${chartWindow === val ? "bg-cyan-tint border-line text-cyan-med" : "bg-surface border-line text-ink-2 hover:bg-surface-alt"}`}>Last {val}</button>
              ))}
            </div>
          )}
          {filterMode === "daily" && <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="px-3 py-1.5 text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy focus:border-navy outline-none text-ink w-full sm:w-auto bg-surface" />}
          {filterMode === "monthly" && <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="px-3 py-1.5 text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy focus:border-navy outline-none text-ink w-full sm:w-auto bg-surface" />}
          {filterMode === "range" && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input type="text" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} placeholder="P1" className="px-2 py-1.5 w-full sm:w-16 text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy focus:border-navy outline-none uppercase text-ink text-center bg-surface" />
              <span className="text-ink-3">-</span>
              <input type="text" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} placeholder="P10" className="px-2 py-1.5 w-full sm:w-16 text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy focus:border-navy outline-none uppercase text-ink text-center bg-surface" />
            </div>
          )}
          <div className="w-px h-6 bg-line hidden sm:block"></div>
          <div className="flex bg-surface rounded-input p-1 border border-line shadow-card">
            {[["all","All"],["primary","Primary"],["secondary","Secondary"]].map(([v,l]) => (
              <button key={v} onClick={() => setGroutScope(v)} className={`px-3 py-1.5 text-xs rounded-input font-semibold transition whitespace-nowrap ${groutScope === v ? "bg-navy text-white shadow" : "text-ink-2 hover:bg-surface-alt"}`}>{l}</button>
            ))}
          </div>
          <select value={filterShift} onChange={(e) => setFilterShift(e.target.value)} className="px-3 py-1.5 text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy focus:border-navy outline-none text-ink bg-surface cursor-pointer w-full sm:w-auto">
            <option value="All">All Shifts</option>
            <option value="Day">Day Shift</option>
            <option value="Night">Night Shift</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-card shadow-card border border-line overflow-hidden">
        <div className="px-6 py-5 border-b border-line flex flex-col sm:flex-row justify-between sm:items-center bg-surface-alt gap-3">
          <h3 className="font-semibold text-ink text-base">Detailed Grout Logs</h3>
          <div className="flex gap-2 self-end sm:self-auto">
            <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} className="p-1.5 border border-line rounded-input bg-surface hover:bg-surface-alt text-ink-2"><ChevronLeft size={16} /></button>
            <span className="px-3 py-1.5 text-xs border border-line rounded-input bg-surface font-semibold text-ink-2">Page {currentPage} of {totalPages || 1}</span>
            <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} className="p-1.5 border border-line rounded-input bg-surface hover:bg-surface-alt text-ink-2"><ChevronRight size={16} /></button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-white uppercase bg-navy-dark border-b border-navy sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4">Ring / Timeline</th>
                <th className="px-6 py-4">Config (Key & Pos)</th>
                <th className="px-6 py-4 text-right">Volume</th>
                <th className="px-6 py-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tableData.map((record, index) => (
                <tr key={`${record.id}-${index}`} onClick={() => { setSelectedRecord(record); setIsEditing(false); }} className={`hover:bg-cyan-tint transition-colors group cursor-pointer ${index % 2 === 0 ? "bg-surface" : "bg-surface-page"}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-ink text-base font-mono">{String(record.ringNo)}</div>
                      {record.groutType === "secondary" ? <Badge code="c">Secondary</Badge> : record.groutPass === "Re-Grout" ? <Badge code="info">Re-Grout</Badge> : <Badge code="info">Primary</Badge>}
                    </div>
                    <div className="text-xs text-ink-3 mt-1">Ex: <span className="font-mono">{String(record.excavRing)}</span></div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`w-2 h-2 rounded-full ${record.shift === "Day" ? "bg-code-b" : "bg-navy"}`}></span>
                      <span className="text-xs text-ink-2 font-semibold">{formatDisplayDate(record.date)} ({String(record.shift)})</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs font-mono bg-surface-alt px-2 py-1 rounded-badge text-ink-2 inline-block mb-1 border border-line">Key {String(record.key)}</div>
                    <div className="flex gap-1 flex-wrap">
                      {record.groutPass === "Re-Grout" ? (
                        <>
                          {Object.entries(Object.values(record.primaryPositions || {}).some(v => v === true) ? record.primaryPositions : (record.positions || {})).map(([pos, active]) => active && <span key={`p_${pos}`} className="px-1.5 py-0.5 bg-cyan-tint text-cyan-med text-[9px] rounded-badge border border-line font-semibold leading-none">{String(pos)}</span>)}
                          {Object.entries(record.secondaryPositions || {}).map(([pos, active]) => active && <span key={`s_${pos}`} className="px-1.5 py-0.5 bg-code-c/10 text-code-c text-[9px] rounded-badge border border-line font-semibold leading-none">{String(pos)}</span>)}
                        </>
                      ) : (
                        Object.entries(Object.values(record.primaryPositions || {}).some(v => v === true) ? record.primaryPositions : (record.positions || {})).map(([pos, active]) => active && <span key={pos} className="px-1.5 py-0.5 bg-cyan-tint text-cyan-med text-[9px] rounded-badge border border-line font-semibold leading-none">{String(pos)}</span>)
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="font-semibold text-ink text-base font-mono">{Number(record.total || 0).toFixed(2)} m³</div>
                    <div className="text-xs text-ink-3 mt-1 font-mono">{String(record.pressure || '')} bar</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {record.groutType === "secondary" ? (
                      <span className="inline-flex px-3 py-1 rounded-badge text-xs font-semibold border bg-surface-alt text-ink-3 border-line">—</span>
                    ) : (
                      <span className={`inline-flex px-3 py-1 rounded-badge text-xs font-semibold border ${Number(record.ratio || 0) > 150 ? "bg-code-b/10 text-code-b border-code-b/20" : Number(record.ratio || 0) >= 100 ? "bg-sgreen-med/10 text-sgreen-dark border-sgreen-med/20" : "bg-code-d/10 text-code-d border-code-d/20"}`}>
                        {Number(record.ratio || 0).toFixed(1)}%
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- Edit Modal Grout --- */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-dark/50 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-surface rounded-modal w-full max-w-2xl shadow-modal overflow-hidden flex flex-col max-h-[90vh] transform transition-all">
            <div className="bg-navy px-6 py-4 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2"><FileText size={18} /> {selectedRecord.groutPass === "Re-Grout" ? "Secondary Grout Details" : "Ring Details"}</h3>
                <p className="text-white/70 text-xs mt-0.5">Record ID: {String(selectedRecord.id)}</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedRecord.imageUrl && selectedRecord.imageUrl !== "Attached" && (
                  <a href={selectedRecord.imageUrl} target="_blank" rel="noreferrer" className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors" title="View Photo"><Camera size={18} /></a>
                )}
                {!isEditing && !readOnly && <button onClick={() => { setEditFormData(selectedRecord); setIsEditing(true); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors" title="Edit"><Edit size={18} /></button>}
                {!readOnly && <button onClick={() => setShowDeleteConfirm(true)} className="p-2 bg-white/10 hover:bg-code-d rounded-full transition-colors" title="Delete"><Trash2 size={18} /></button>}
                <button onClick={() => { setSelectedRecord(null); setIsEditing(false); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors ml-2"><X size={20} /></button>
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
                  <div className="text-xs font-semibold text-ink-3 uppercase tracking-widest mb-1">Grouting Ring</div>
                  <div className="flex items-center gap-2">
                    <div className={`text-2xl font-semibold font-mono ${selectedRecord.groutPass === 'Re-Grout' ? 'text-code-c' : 'text-ink'}`}>
                      {/* The ring identifies the record to the server: it is in the domain key, and
                          the sync protocol cannot move a record from one key to another — the old
                          key's metadata would stay behind describing a ring no row carries, and the
                          real ring, when the machine reaches it, would be refused. So the save
                          refuses it, and offering a field that can only be refused is worse than
                          not offering it. Correcting a ring means deleting the record and recording
                          it again, which the queue now handles. Re-Grout makes that plainer still:
                          no view can create one, so there would be no way back at all. */}
                      {String(selectedRecord.ringNo)}
                    </div>
                    {selectedRecord.groutPass === "Re-Grout" && <Badge code="c">Re-Grout</Badge>}
                  </div>
                  <div className="text-xs text-ink-2 mt-1 flex items-center gap-1">Excavation: {isEditing ? <input type="text" name="excavRing" value={editFormData?.excavRing || ''} onChange={handleEditChange} className="w-20 bg-surface border border-line rounded-input px-1 outline-none uppercase focus:border-navy" /> : <span className="font-mono">{String(selectedRecord.excavRing)}</span>}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold text-ink-3 uppercase tracking-widest mb-1">Latest Working Date</div>
                  <div className="text-sm font-semibold text-ink flex items-center justify-end gap-1.5"><Calendar size={14} /> {isEditing ? <input type="date" name="date" value={editFormData?.date || ''} onChange={handleEditChange} className="bg-surface border border-line rounded-input px-2 outline-none focus:border-navy" /> : formatDisplayDate(selectedRecord.date)}</div>
                  <div className="text-xs text-ink-2 mt-1 flex items-center justify-end gap-1">
                    {isEditing ? (
                      <select name="shift" value={editFormData?.shift || ''} onChange={handleEditChange} className="bg-surface border border-line rounded-input px-1 outline-none cursor-pointer focus:border-navy">
                        <option value="Day">Day</option>
                        <option value="Night">Night</option>
                      </select>
                    ) : <span className="font-semibold text-ink-2">({String(selectedRecord.shift)})</span>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-surface-alt rounded-card border border-line p-4 flex flex-col items-center justify-center relative">
                  <span className="text-xs font-semibold text-ink-3 uppercase tracking-widest mb-2 text-center">Injection Configuration</span>
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
                    <div className="bg-surface rounded-card p-4 border border-line shadow-card mb-4">
                      <div className="text-xs font-semibold text-ink-2 uppercase tracking-widest mb-3">Volume Breakdown</div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="bg-cyan-tint p-3 rounded-input border border-line">
                          <div className="font-semibold text-cyan-med text-[10px] mb-2 uppercase">Primary Grout</div>
                          <div className="flex justify-between text-xs items-center mb-1"><span className="text-ink-2">Part A</span><span className="font-semibold text-ink font-mono">{isEditing ? <input type="number" step="0.01" name="primaryPartA" value={editFormData?.primaryPartA || editFormData?.partA || ''} onChange={handleEditChange} className="w-16 bg-surface border rounded-input px-1 text-right outline-none focus:border-navy" /> : Number(selectedRecord.primaryPartA || selectedRecord.partA || 0).toFixed(2)}</span></div>
                          <div className="flex justify-between text-xs items-center"><span className="text-ink-2">Part B</span><span className="font-semibold text-ink font-mono">{isEditing ? <input type="number" step="0.01" name="primaryPartB" value={editFormData?.primaryPartB || editFormData?.partB || ''} onChange={handleEditChange} className="w-16 bg-surface border rounded-input px-1 text-right outline-none focus:border-navy" /> : Number(selectedRecord.primaryPartB || selectedRecord.partB || 0).toFixed(2)}</span></div>
                        </div>
                        <div className="bg-code-c/10 p-3 rounded-input border border-line">
                          <div className="font-semibold text-code-c text-[10px] mb-2 uppercase">Secondary Grout</div>
                          <div className="flex justify-between text-xs items-center mb-1"><span className="text-ink-2">Part A</span><span className="font-semibold text-ink font-mono">{isEditing ? <input type="number" step="0.01" name="secondaryPartA" value={editFormData?.secondaryPartA || ''} onChange={handleEditChange} className="w-16 bg-surface border rounded-input px-1 text-right outline-none focus:border-navy" /> : Number(selectedRecord.secondaryPartA || 0).toFixed(2)}</span></div>
                          <div className="flex justify-between text-xs items-center"><span className="text-ink-2">Part B</span><span className="font-semibold text-ink font-mono">{isEditing ? <input type="number" step="0.01" name="secondaryPartB" value={editFormData?.secondaryPartB || ''} onChange={handleEditChange} className="w-16 bg-surface border rounded-input px-1 text-right outline-none focus:border-navy" /> : Number(selectedRecord.secondaryPartB || 0).toFixed(2)}</span></div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-line">
                        <div className="text-center">
                          <div className="text-[10px] text-ink-3">Total Part A</div>
                          <div className="font-semibold text-ink font-mono">{(Number(isEditing ? (editFormData?.primaryPartA || editFormData?.partA || 0) : (selectedRecord.primaryPartA || selectedRecord.partA || 0)) + Number(isEditing ? (editFormData?.secondaryPartA || 0) : (selectedRecord.secondaryPartA || 0))).toFixed(2)} m³</div>
                        </div>
                        <div className="text-center border-l border-r border-line">
                          <div className="text-[10px] text-ink-3">Total Part B</div>
                          <div className="font-semibold text-ink font-mono">{(Number(isEditing ? (editFormData?.primaryPartB || editFormData?.partB || 0) : (selectedRecord.primaryPartB || selectedRecord.partB || 0)) + Number(isEditing ? (editFormData?.secondaryPartB || 0) : (selectedRecord.secondaryPartB || 0))).toFixed(2)} m³</div>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] text-ink-3">Total Vol.</div>
                          <div className="font-semibold text-cyan-med font-mono">{Number(isEditing ? (Number(editFormData?.primaryPartA || editFormData?.partA || 0) + Number(editFormData?.secondaryPartA || 0) + Number(editFormData?.primaryPartB || editFormData?.partB || 0) + Number(editFormData?.secondaryPartB || 0)) : selectedRecord.total || 0).toFixed(2)} m³</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-cyan-tint rounded-card p-4 border border-line">
                      <div className="text-xs font-semibold text-cyan-med uppercase tracking-widest mb-3">Volume Data</div>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-ink-2 mb-1">Part A</div>
                          <div className="font-mono text-lg font-semibold text-ink">{isEditing ? <input type="number" step="0.01" name="partA" value={editFormData?.partA || ''} onChange={handleEditChange} className="w-20 bg-surface border border-line rounded-input px-2 outline-none focus:border-navy" /> : Number(selectedRecord.partA || 0).toFixed(2)} <span className="text-xs font-sans text-ink-3">m³</span></div>
                        </div>
                        <div>
                          <div className="text-xs text-ink-2 mb-1">Part B</div>
                          <div className="font-mono text-lg font-semibold text-ink">{isEditing ? <input type="number" step="0.01" name="partB" value={editFormData?.partB || ''} onChange={handleEditChange} className="w-20 bg-surface border border-line rounded-input px-2 outline-none focus:border-navy" /> : Number(selectedRecord.partB || 0).toFixed(2)} <span className="text-xs font-sans text-ink-3">m³</span></div>
                        </div>
                      </div>
                      <div className="border-t border-line pt-3 flex justify-between items-end">
                        <div>
                          <div className="text-xs text-ink-2 mb-1">Total Volume</div>
                          <div className="text-2xl font-semibold text-navy font-mono">{Number(isEditing ? (Number(editFormData?.partA || 0) + Number(editFormData?.partB || 0)) : (selectedRecord.total || 0)).toFixed(2)} <span className="text-sm font-sans font-normal text-cyan-med">m³</span></div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-surface rounded-card p-4 border border-line shadow-card">
                      <div className="text-xs font-semibold text-ink-3 uppercase tracking-widest mb-1">Pressure</div>
                      <div className="font-mono text-xl font-semibold text-ink">{isEditing ? <input type="number" step="0.1" name="pressure" value={editFormData?.pressure || ''} onChange={handleEditChange} className="w-20 bg-surface border border-line rounded-input px-2 outline-none focus:border-navy" /> : String(selectedRecord.pressure || '')} <span className="text-sm font-sans text-ink-3 font-normal">bar</span></div>
                    </div>
                    <div className="bg-surface rounded-card p-4 border border-line shadow-card flex flex-col justify-center items-end">
                      <div className="text-xs font-semibold text-ink-3 uppercase tracking-widest mb-1">Final Ratio</div>
                      {selectedRecord.groutType === "secondary" ? (
                        <div className="text-2xl font-semibold font-mono text-ink-3">—</div>
                      ) : (
                      <div className={`text-2xl font-semibold font-mono ${Number(isEditing ? (((Number(editFormData?.partA || editFormData?.primaryPartA || 0) + Number(editFormData?.partB || editFormData?.primaryPartB || 0) + Number(editFormData?.secondaryPartA || 0) + Number(editFormData?.secondaryPartB || 0))) / THEORETICAL_VOL * 100) : selectedRecord.ratio || 0) > 150 ? "text-code-b" : Number(isEditing ? (((Number(editFormData?.partA || editFormData?.primaryPartA || 0) + Number(editFormData?.partB || editFormData?.primaryPartB || 0) + Number(editFormData?.secondaryPartA || 0) + Number(editFormData?.secondaryPartB || 0))) / THEORETICAL_VOL * 100) : selectedRecord.ratio || 0) >= 100 ? "text-sgreen-dark" : "text-code-d"}`}>
                        {Number(isEditing ? (((Number(editFormData?.partA || editFormData?.primaryPartA || 0) + Number(editFormData?.partB || editFormData?.primaryPartB || 0) + Number(editFormData?.secondaryPartA || 0) + Number(editFormData?.secondaryPartB || 0))) / THEORETICAL_VOL * 100) : selectedRecord.ratio || 0).toFixed(1)}%
                      </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {(selectedRecord.remark || isEditing) && (
                <div className="bg-surface-alt rounded-card p-4 border border-line">
                  <div className="text-xs font-semibold text-ink-2 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Info size={14} /> Remarks (ปัญหา)</div>
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
    </div>
  );
};

export default GroutDashboardView;
