import React, { useState, useMemo, useEffect } from "react";
import { Layers, ChevronRight, Save, Loader2, Camera, Clock } from "lucide-react";
import { parseCH, formatCH } from "../../utils/formatters";
import { offsetRingNo, calculateSoilVolume, handleFileUpload } from "../../utils/helpers";
import { apiCall } from "../../utils/api";

const SegmentRecordView = ({ projectInfo, handleProjectInfoChange, segmentRecords, setSegmentRecords }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    id: null, ringNo: "", typeRing: "C1", keyPos: "16", startCH: "", finishCH: "", length: "1.40", remark: "",
    excavStartTime: "", excavEndTime: "", soilType: "", excavImageBase64: "", excavImageName: "", excavShift: projectInfo.shift,
    installStartTime: "", installEndTime: "", imageBase64: "", imageName: "", status: "In Progress", installType: "Permanent", installShift: projectInfo.shift,
  });

  const lastRing = useMemo(() => {
    if (segmentRecords.length === 0) return "-";
    const map = new Map();
    segmentRecords.forEach(rec => map.set(rec.ringNo, rec));
    const deduped = Array.from(map.values());
    return deduped[deduped.length - 1].ringNo;
  }, [segmentRecords]);

  useEffect(() => {
    if (segmentRecords.length > 0 && !formData.ringNo) {
      const map = new Map();
      segmentRecords.forEach(rec => map.set(rec.ringNo, rec));
      const deduped = Array.from(map.values());
      const lastRecord = deduped[deduped.length - 1];

      if (lastRecord.status === "In Progress") {
        setFormData((prev) => ({
          ...prev, id: lastRecord.id, ringNo: lastRecord.ringNo, typeRing: lastRecord.typeRing || "C1", keyPos: lastRecord.keyPos || "16", startCH: lastRecord.startCH, finishCH: lastRecord.finishCH, length: lastRecord.length || "1.40", status: "In Progress", installType: lastRecord.installType || "Permanent", excavStartTime: lastRecord.excavStartTime || "", excavEndTime: lastRecord.excavEndTime || "", soilType: lastRecord.soilType || "", installStartTime: lastRecord.installStartTime || lastRecord.startTime || "", installEndTime: lastRecord.installEndTime || lastRecord.endTime || "",
          excavShift: lastRecord.excavShift || projectInfo.shift, installShift: lastRecord.installShift || projectInfo.shift
        }));
      } else {
        const lastFinishRaw = parseCH(lastRecord.finishCH);
        setFormData((prev) => ({
          ...prev, id: null, ringNo: offsetRingNo(lastRecord.ringNo, 1), startCH: formatCH(lastFinishRaw), finishCH: formatCH(lastFinishRaw - parseFloat(prev.length || 0)), status: "In Progress", installType: "Permanent", soilType: "", excavImageBase64: "", excavImageName: "",
          excavShift: projectInfo.shift, installShift: projectInfo.shift
        }));
      }
    }
  }, [segmentRecords, projectInfo.shift]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let newFormData = { ...formData, [name]: value };
    if (name === "ringNo") {
      const upperVal = String(value).toUpperCase().trim();
      if (upperVal.startsWith("T")) newFormData.installType = "Temporary";
      else if (upperVal.startsWith("P")) newFormData.installType = "Permanent";
    }
    if (name === "typeRing") newFormData.length = value === "C1" ? "1.40" : "0.90";
    if (name === "startCH" || name === "length" || name === "typeRing") {
      const start = parseCH(newFormData.startCH);
      const len = parseFloat(newFormData.length) || 0;
      if (start !== 0) newFormData.finishCH = formatCH(start - len);
    }
    if (name === "installEndTime") newFormData.status = value ? "Completed" : "In Progress";
    setFormData(newFormData);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.ringNo) return;
    setIsSaving(true);
    const cleanRingNo = String(formData.ringNo).trim().toUpperCase();
    const recordData = { ...projectInfo, ...formData, ringNo: cleanRingNo, soilVolume: calculateSoilVolume(formData.length) };

    try {
      if (formData.id) {
        recordData.id = formData.id;
        await apiCall("updateSegment", recordData);
        setSegmentRecords((prev) => prev.map((r) => (r.id === recordData.id ? recordData : r)));
      } else {
        recordData.id = `seg_${Date.now()}`;
        await apiCall("addSegment", recordData);
        setSegmentRecords((prev) => [...prev, recordData]);
      }
      setFormData((prev) => {
        const isCompleted = prev.status === "Completed";
        return {
          ...prev, id: isCompleted ? null : recordData.id, ringNo: isCompleted ? offsetRingNo(prev.ringNo, 1) : prev.ringNo, startCH: isCompleted ? prev.finishCH : prev.startCH, finishCH: isCompleted ? formatCH(parseCH(prev.finishCH) - parseFloat(prev.length)) : prev.finishCH, remark: "", excavStartTime: isCompleted ? "" : prev.excavStartTime, excavEndTime: isCompleted ? "" : prev.excavEndTime, soilType: isCompleted ? "" : prev.soilType, excavImageBase64: isCompleted ? "" : prev.excavImageBase64, excavImageName: isCompleted ? "" : prev.excavImageName, installStartTime: isCompleted ? "" : prev.installStartTime, installEndTime: isCompleted ? "" : prev.installEndTime, imageBase64: "", imageName: "", status: isCompleted ? "In Progress" : prev.status, installType: isCompleted ? "Permanent" : prev.installType,
          excavShift: projectInfo.shift, installShift: projectInfo.shift
        };
      });
    } catch (err) { alert("บันทึกข้อมูลไม่สำเร็จ: " + err.message); }
    setIsSaving(false);
  };

  const currentSoilVol = calculateSoilVolume(formData.length);

  return (
    <div className="max-w-2xl mx-auto pb-24 animate-slide-up">
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-lg border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-[#0b8261] px-6 py-5 text-white flex justify-between items-center">
          <div>
            <h2 className="font-extrabold text-2xl tracking-tight flex items-center gap-2"><Layers size={24} /> Segment Install</h2>
            <p className="text-emerald-100 text-[10px] sm:text-xs mt-1 opacity-80 font-medium">Record daily segment Installation</p>
          </div>
          <div className="bg-white/20 px-3 py-1.5 rounded-lg text-xs font-bold border border-white/30 shadow-sm">
            Last: {lastRing}
          </div>
        </div>

        <div className="p-6 space-y-6 bg-slate-50/30">
          {/* Row 1: Date & Shift */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
              <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Working Date</label>
              <div className="flex items-center justify-between">
                <input type="date" name="date" value={projectInfo.date} onChange={handleProjectInfoChange} className="w-full bg-transparent font-black text-slate-700 outline-none text-sm cursor-pointer" />
              </div>
            </div>
            <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
              <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Working Shift</label>
              <select name="shift" value={projectInfo.shift} onChange={handleProjectInfoChange} className="w-full bg-transparent font-black text-slate-700 outline-none text-sm appearance-none cursor-pointer">
                <option value="Day">☀️ Day Shift</option>
                <option value="Night">🌙 Night Shift</option>
              </select>
            </div>
          </div>

          {/* Row 2: Ring & Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm focus-within:ring-2 ring-emerald-100 transition-all">
              <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Ring No.</label>
              <input type="text" name="ringNo" required value={formData.ringNo} onChange={handleInputChange} onBlur={(e) => setFormData(prev => ({ ...prev, ringNo: String(e.target.value).trim().toUpperCase() }))} className="w-full bg-transparent text-xl font-black text-slate-800 outline-none uppercase" placeholder="PXXX" />
            </div>
            <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
              <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Install Type</label>
              <select name="installType" value={formData.installType} onChange={handleInputChange} className="w-full bg-transparent font-black text-slate-700 outline-none text-sm appearance-none cursor-pointer">
                <option value="Permanent">ถาวร (Permanent)</option>
                <option value="Temporary">ชั่วคราว (Temporary)</option>
              </select>
            </div>
          </div>

          {/* EXCAVATION PHASE */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-orange-400"></div>
            <div className="flex justify-between items-center mb-4 pl-2">
              <h3 className="text-xs font-black text-slate-700 flex items-center gap-2 uppercase tracking-widest">Excavation Phase <span className="text-[10px] text-slate-400 font-medium normal-case">(ขุดเจาะ)</span></h3>
              <select name="excavShift" value={formData.excavShift} onChange={handleInputChange} className="text-[10px] font-bold bg-orange-50 text-orange-700 px-2 py-1 rounded outline-none cursor-pointer border border-orange-100">
                <option value="Day">☀️ Day Shift</option>
                <option value="Night">🌙 Night Shift</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4 pl-2">
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1.5 flex items-center gap-1"><Clock size={10} className="text-orange-500" /> Start</label>
                <input type="time" name="excavStartTime" value={formData.excavStartTime} onChange={handleInputChange} className="border border-slate-200 rounded-xl p-2.5 w-full bg-slate-50 outline-none font-mono font-bold text-slate-700 focus:border-orange-400 transition-colors text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1.5 flex items-center gap-1"><Clock size={10} className="text-orange-500" /> Finish</label>
                <input type="time" name="excavEndTime" value={formData.excavEndTime} onChange={handleInputChange} className="border border-slate-200 rounded-xl p-2.5 w-full bg-slate-50 outline-none font-mono font-bold text-slate-700 focus:border-orange-400 transition-colors text-sm" />
              </div>
            </div>

            <div className="pl-2 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1.5">ลักษณะชั้นดิน (Soil Type)</label>
                <input type="text" name="soilType" value={formData.soilType} onChange={handleInputChange} className="border border-slate-200 rounded-xl p-2.5 w-full outline-none text-sm font-medium text-slate-700 focus:border-orange-400 transition-colors" placeholder="เช่น ดินเหนียวปนทราย, Soft Clay..." />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1.5 flex items-center gap-1"><Camera size={10} /> ภาพถ่ายชั้นดิน (ไม่มีข้าม)</label>
                <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, setFormData)} className="text-xs text-slate-500 w-full file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-orange-50 file:text-orange-700 file:font-bold hover:file:bg-orange-100 transition-colors cursor-pointer" />
              </div>
            </div>
          </div>

          {/* INSTALLATION PHASE */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500"></div>
            <div className="flex justify-between items-center mb-4 pl-2">
              <h3 className="text-xs font-black text-slate-700 flex items-center gap-2 uppercase tracking-widest">Installation Phase <span className="text-[10px] text-slate-400 font-medium normal-case">(ประกอบ)</span></h3>
              <select name="installShift" value={formData.installShift} onChange={handleInputChange} className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-1 rounded outline-none cursor-pointer border border-emerald-100">
                <option value="Day">☀️ Day Shift</option>
                <option value="Night">🌙 Night Shift</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4 pl-2 mb-5">
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1.5 flex items-center gap-1"><Clock size={10} className="text-emerald-500" /> Start</label>
                <input type="time" name="installStartTime" value={formData.installStartTime} onChange={handleInputChange} className="border border-slate-200 rounded-xl p-2.5 w-full bg-slate-50 outline-none font-mono font-bold text-slate-700 focus:border-emerald-500 transition-colors text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1.5 flex items-center gap-1"><Clock size={10} className="text-emerald-500" /> Finish</label>
                <input type="time" name="installEndTime" value={formData.installEndTime} onChange={handleInputChange} className="border border-slate-200 rounded-xl p-2.5 w-full bg-slate-50 outline-none font-mono font-bold text-slate-700 focus:border-emerald-500 transition-colors text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 pl-2">
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest">Status & Length</label>
                    <select name="status" value={formData.status} onChange={handleInputChange} className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded outline-none appearance-none cursor-pointer"><option value="In Progress">⏳ In Progress</option><option value="Completed">✅ Completed</option></select>
                  </div>
                  <input type="number" step="0.01" name="length" value={formData.length} onChange={handleInputChange} className="w-full border border-slate-200 rounded-xl p-2.5 text-center font-black text-slate-800 outline-none focus:border-emerald-500 text-base shadow-inner bg-white" placeholder="1.40" />
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                  <label className="text-[9px] font-extrabold text-emerald-600 uppercase tracking-widest block mb-1">Soil Vol. (ดินขุด)</label>
                  <div className="font-black text-emerald-700 text-lg">{currentSoilVol} <span className="text-xs font-bold">m³</span></div>
                </div>
              </div>

              <div className="flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Key Pos</label>
                    <span className="bg-emerald-100 text-emerald-700 font-black px-3 py-1 rounded-lg text-sm shadow-sm">K{formData.keyPos}</span>
                  </div>
                  <input type="range" min="1" max="16" step="1" name="keyPos" value={formData.keyPos} onChange={handleInputChange} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600 mb-2" />
                  <div className="flex justify-between text-[9px] text-slate-400 font-bold px-1 mb-4"><span>1</span><span>4</span><span>8</span><span>12</span><span>16</span></div>
                </div>

                <select name="typeRing" value={formData.typeRing} onChange={handleInputChange} className="w-full border border-slate-200 rounded-xl p-2.5 font-bold text-slate-700 outline-none focus:border-emerald-500 bg-slate-50 text-sm cursor-pointer">
                  <option value="C1">C1</option>
                  <option value="C2">C2</option>
                  <option value="B1">B1</option>
                  <option value="B2">B2</option>
                  <option value="A">A</option>
                  <option value="K">K</option>
                </select>
              </div>
            </div>
          </div>

          {/* START / FINISH CH. */}
          <div className="bg-slate-900 rounded-2xl p-4 flex items-center justify-between shadow-lg relative overflow-hidden">
            <div className="absolute right-0 top-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10"></div>
            <div className="flex-1 relative z-10">
              <label className="text-[9px] font-extrabold text-emerald-400 uppercase tracking-widest block mb-1">Start (CH.)</label>
              <input type="text" name="startCH" value={formData.startCH} onChange={handleInputChange} onBlur={(e) => setFormData(prev => ({ ...prev, startCH: formatCH(prev.startCH) }))} className="w-full bg-slate-800/80 border border-slate-700 text-white rounded-xl p-3 text-center font-mono font-black outline-none focus:border-emerald-500 text-lg transition-colors shadow-inner" placeholder="0+000" />
            </div>
            <div className="px-4 relative z-10"><ChevronRight size={24} className="text-slate-500" /></div>
            <div className="flex-1 relative z-10">
              <label className="text-[9px] font-extrabold text-emerald-400 uppercase tracking-widest block mb-1">Finish (CH.)</label>
              <input type="text" name="finishCH" value={formData.finishCH} onChange={handleInputChange} onBlur={(e) => setFormData(prev => ({ ...prev, finishCH: formatCH(prev.finishCH) }))} className="w-full bg-slate-800/80 border border-slate-700 text-white rounded-xl p-3 text-center font-mono font-black outline-none focus:border-emerald-500 text-lg transition-colors shadow-inner" placeholder="0+000" />
            </div>
          </div>

          {/* REMARK */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block mb-2">Problem / Remark</label>
            <textarea name="remark" value={formData.remark} onChange={handleInputChange} rows="2" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-medium text-slate-700 outline-none focus:border-emerald-500 transition-all resize-none" placeholder="ระบุปัญหาหรืออุปสรรค..."></textarea>
          </div>

          <button type="submit" disabled={isSaving} className="w-full bg-[#0b8261] hover:bg-[#065f46] text-white font-bold py-4 rounded-2xl flex justify-center items-center gap-2 shadow-lg shadow-emerald-500/30 transition-all active:scale-[0.98]">
            {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} {formData.status === "In Progress" ? "Save Partial Status" : "Save Record"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SegmentRecordView;
