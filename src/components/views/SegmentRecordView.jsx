import React, { useState, useMemo, useEffect } from "react";
import { Layers, ChevronRight, Save, Loader2, Camera, Clock } from "lucide-react";
import { parseCH, formatCH } from "../../utils/formatters";
import { offsetRingNo, calculateSoilVolume, handleFileUpload } from "../../utils/helpers";
import { apiCall } from "../../utils/api";
import { SegmentedToggle } from "../../ui-ux-pro-max";
import StickyActionBar from "../../ui-ux-pro-max/components/StickyActionBar";

const SegmentRecordView = ({ projectInfo, handleProjectInfoChange, segmentRecords, setSegmentRecords, setCurrentModule, setActiveTab, machine = "TBM1" }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    id: null, ringNo: "", typeRing: "C1", keyPos: "16", startCH: "", finishCH: "", length: "1.40", remark: "",
    excavStartTime: "", excavEndTime: "", soilType: "", excavImageBase64: "", excavImageName: "", excavShift: projectInfo.shift,
    installStartTime: "", installEndTime: "", imageBase64: "", imageName: "", status: "In Progress", installType: "Permanent", installShift: projectInfo.shift,
    headV: "", artV: "", tailV: "", vrt: "", // ระดับหัวเจาะ (+ = สูงกว่าแบบ, mm; vrt = °)
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
          excavShift: lastRecord.excavShift || projectInfo.shift, installShift: lastRecord.installShift || projectInfo.shift,
          headV: lastRecord.headV != null ? lastRecord.headV : "", artV: lastRecord.artV != null ? lastRecord.artV : "", tailV: lastRecord.tailV != null ? lastRecord.tailV : "", vrt: lastRecord.vrt != null ? lastRecord.vrt : ""
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
        await apiCall("updateSegment", { ...recordData, machine });
        setSegmentRecords((prev) => prev.map((r) => (r.id === recordData.id ? recordData : r)));
      } else {
        recordData.id = `seg_${Date.now()}`;
        await apiCall("addSegment", { ...recordData, machine });
        setSegmentRecords((prev) => [...prev, recordData]);
      }
      setFormData((prev) => {
        const isCompleted = prev.status === "Completed";
        return {
          ...prev, id: isCompleted ? null : recordData.id, ringNo: isCompleted ? offsetRingNo(prev.ringNo, 1) : prev.ringNo, startCH: isCompleted ? prev.finishCH : prev.startCH, finishCH: isCompleted ? formatCH(parseCH(prev.finishCH) - parseFloat(prev.length)) : prev.finishCH, remark: "", excavStartTime: isCompleted ? "" : prev.excavStartTime, excavEndTime: isCompleted ? "" : prev.excavEndTime, soilType: isCompleted ? "" : prev.soilType, excavImageBase64: isCompleted ? "" : prev.excavImageBase64, excavImageName: isCompleted ? "" : prev.excavImageName, installStartTime: isCompleted ? "" : prev.installStartTime, installEndTime: isCompleted ? "" : prev.installEndTime, imageBase64: "", imageName: "", status: isCompleted ? "In Progress" : prev.status, installType: isCompleted ? "Permanent" : prev.installType,
          headV: isCompleted ? "" : prev.headV, artV: isCompleted ? "" : prev.artV, tailV: isCompleted ? "" : prev.tailV, vrt: isCompleted ? "" : prev.vrt, // reset head fields บนริงใหม่ (กัน carry)
          excavShift: projectInfo.shift, installShift: projectInfo.shift
        };
      });
    } catch (err) { alert("บันทึกข้อมูลไม่สำเร็จ: " + err.message); }
    setIsSaving(false);
  };

  const currentSoilVol = calculateSoilVolume(formData.length);

  return (
    <div className="max-w-2xl mx-auto pb-24 animate-slide-up">
      {/* Module switcher — lets mobile users toggle between Segment and Grout */}
      <div className="mb-4">
        <SegmentedToggle
          value="segment"
          options={[{ value: "segment", label: "Segment" }, { value: "grout", label: "Grout" }]}
          onChange={(m) => { setCurrentModule(m); }}
        />
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-card shadow-card border border-line overflow-hidden">
        {/* Header */}
        <div className="bg-sgreen-dark px-6 py-5 text-white flex justify-between items-center">
          <div>
            <h2 className="font-semibold text-2xl tracking-tight flex items-center gap-2"><Layers size={24} /> Segment Install</h2>
            <p className="text-cyan-tint text-[10px] sm:text-xs mt-1 opacity-90 font-medium">Record daily segment Installation</p>
          </div>
          <div className="bg-white/20 px-3 py-1.5 rounded-input text-xs font-semibold border border-white/30 shadow-card">
            Last: {lastRing}
          </div>
        </div>

        <div className="p-6 space-y-6 bg-surface-page">
          {/* Row 1: Date & Shift */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface border border-input p-3 rounded-input shadow-card">
              <label className="text-[9px] font-semibold text-ink-3 uppercase tracking-widest block mb-1">Working Date</label>
              <div className="flex items-center justify-between">
                <input type="date" name="date" value={projectInfo.date} onChange={handleProjectInfoChange} className="w-full bg-transparent font-semibold text-ink outline-none text-sm cursor-pointer" />
              </div>
            </div>
            <div className="bg-surface border border-input p-3 rounded-input shadow-card">
              <label className="text-[9px] font-semibold text-ink-3 uppercase tracking-widest block mb-1">Working Shift</label>
              <select name="shift" value={projectInfo.shift} onChange={handleProjectInfoChange} className="w-full bg-transparent font-semibold text-ink outline-none text-sm appearance-none cursor-pointer">
                <option value="Day">☀️ Day Shift</option>
                <option value="Night">🌙 Night Shift</option>
              </select>
            </div>
          </div>

          {/* Row 2: Ring & Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface border border-input p-3 rounded-input shadow-card focus-within:ring-2 focus-within:ring-sgreen-med/30 transition-all">
              <label className="text-[9px] font-semibold text-ink-3 uppercase tracking-widest block mb-1">Ring No.</label>
              <input type="text" name="ringNo" required value={formData.ringNo} onChange={handleInputChange} onBlur={(e) => setFormData(prev => ({ ...prev, ringNo: String(e.target.value).trim().toUpperCase() }))} className="w-full bg-transparent text-xl font-semibold text-ink outline-none uppercase" placeholder="PXXX" />
            </div>
            <div className="bg-surface border border-input p-3 rounded-input shadow-card">
              <label className="text-[9px] font-semibold text-ink-3 uppercase tracking-widest block mb-1">Install Type</label>
              <select name="installType" value={formData.installType} onChange={handleInputChange} className="w-full bg-transparent font-semibold text-ink outline-none text-sm appearance-none cursor-pointer">
                <option value="Permanent">ถาวร (Permanent)</option>
                <option value="Temporary">ชั่วคราว (Temporary)</option>
              </select>
            </div>
          </div>

          {/* EXCAVATION PHASE */}
          <div className="bg-surface border border-input rounded-card p-5 shadow-card relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-code-b"></div>
            <div className="flex justify-between items-center mb-4 pl-2">
              <h3 className="text-xs font-semibold text-ink flex items-center gap-2 uppercase tracking-widest">Excavation Phase <span className="text-[10px] text-ink-3 font-medium normal-case">(ขุดเจาะ)</span></h3>
              <select name="excavShift" value={formData.excavShift} onChange={handleInputChange} className="text-[10px] font-semibold bg-code-b/10 text-code-b px-2 py-1 rounded-badge outline-none cursor-pointer border border-code-b/30">
                <option value="Day">☀️ Day Shift</option>
                <option value="Night">🌙 Night Shift</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4 pl-2">
              <div>
                <label className="text-[10px] font-semibold text-ink-3 block mb-1.5 flex items-center gap-1"><Clock size={10} className="text-code-b" /> Start</label>
                <input type="time" name="excavStartTime" value={formData.excavStartTime} onChange={handleInputChange} className="border border-input rounded-input p-2.5 w-full bg-surface-alt outline-none font-mono font-semibold text-ink focus:border-code-b transition-colors text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-ink-3 block mb-1.5 flex items-center gap-1"><Clock size={10} className="text-code-b" /> Finish</label>
                <input type="time" name="excavEndTime" value={formData.excavEndTime} onChange={handleInputChange} className="border border-input rounded-input p-2.5 w-full bg-surface-alt outline-none font-mono font-semibold text-ink focus:border-code-b transition-colors text-sm" />
              </div>
            </div>

            <div className="pl-2 space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-ink-3 block mb-1.5">ลักษณะชั้นดิน (Soil Type)</label>
                <input type="text" name="soilType" value={formData.soilType} onChange={handleInputChange} className="border border-input rounded-input p-2.5 w-full outline-none text-sm font-medium text-ink focus:border-code-b transition-colors" placeholder="เช่น ดินเหนียวปนทราย, Soft Clay..." />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-ink-3 block mb-1.5 flex items-center gap-1"><Camera size={10} /> ภาพถ่ายชั้นดิน (ไม่มีข้าม)</label>
                <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, setFormData)} className="text-xs text-ink-3 w-full file:mr-3 file:py-2 file:px-4 file:rounded-input file:border-0 file:bg-code-b/10 file:text-code-b file:font-semibold hover:file:bg-code-b/20 transition-colors cursor-pointer" />
              </div>
            </div>
          </div>

          {/* INSTALLATION PHASE */}
          <div className="bg-surface border border-input rounded-card p-5 shadow-card relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-sgreen-med"></div>
            <div className="flex justify-between items-center mb-4 pl-2">
              <h3 className="text-xs font-semibold text-ink flex items-center gap-2 uppercase tracking-widest">Installation Phase <span className="text-[10px] text-ink-3 font-medium normal-case">(ประกอบ)</span></h3>
              <select name="installShift" value={formData.installShift} onChange={handleInputChange} className="text-[10px] font-semibold bg-sgreen-med/10 text-sgreen-dark px-2 py-1 rounded-badge outline-none cursor-pointer border border-sgreen-med/30">
                <option value="Day">☀️ Day Shift</option>
                <option value="Night">🌙 Night Shift</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4 pl-2 mb-5">
              <div>
                <label className="text-[10px] font-semibold text-ink-3 block mb-1.5 flex items-center gap-1"><Clock size={10} className="text-sgreen-med" /> Start</label>
                <input type="time" name="installStartTime" value={formData.installStartTime} onChange={handleInputChange} className="border border-input rounded-input p-2.5 w-full bg-surface-alt outline-none font-mono font-semibold text-ink focus:border-sgreen-med transition-colors text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-ink-3 block mb-1.5 flex items-center gap-1"><Clock size={10} className="text-sgreen-med" /> Finish</label>
                <input type="time" name="installEndTime" value={formData.installEndTime} onChange={handleInputChange} className="border border-input rounded-input p-2.5 w-full bg-surface-alt outline-none font-mono font-semibold text-ink focus:border-sgreen-med transition-colors text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 pl-2">
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[8px] font-semibold text-ink-3 uppercase tracking-widest">Status & Length</label>
                    <select name="status" value={formData.status} onChange={handleInputChange} className="text-[10px] font-semibold bg-code-b/10 text-code-b px-2 py-0.5 rounded-badge outline-none appearance-none cursor-pointer"><option value="In Progress">⏳ In Progress</option><option value="Completed">✅ Completed</option></select>
                  </div>
                  <input type="number" step="0.01" name="length" value={formData.length} onChange={handleInputChange} className="w-full border border-input rounded-input p-2.5 text-center font-semibold text-ink outline-none focus:border-sgreen-med text-base shadow-card bg-surface" placeholder="1.40" />
                </div>
                <div className="bg-sgreen-med/10 border border-sgreen-med/30 rounded-input p-3 text-center">
                  <label className="text-[9px] font-semibold text-sgreen-dark uppercase tracking-widest block mb-1">Soil Vol. (ดินขุด)</label>
                  <div className="font-semibold text-sgreen-dark text-lg font-mono">{currentSoilVol} <span className="text-xs font-semibold">m³</span></div>
                </div>
              </div>

              <div className="flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[9px] font-semibold text-ink-3 uppercase tracking-widest">Key Pos</label>
                    <span className="bg-sgreen-med/10 text-sgreen-dark font-semibold px-3 py-1 rounded-input text-sm shadow-card">K{formData.keyPos}</span>
                  </div>
                  <input type="range" min="1" max="16" step="1" name="keyPos" value={formData.keyPos} onChange={handleInputChange} className="w-full h-1.5 bg-surface-alt rounded-lg appearance-none cursor-pointer accent-sgreen-dark mb-2" />
                  <div className="flex justify-between text-[9px] text-ink-3 font-semibold px-1 mb-4"><span>1</span><span>4</span><span>8</span><span>12</span><span>16</span></div>
                </div>

                <select name="typeRing" value={formData.typeRing} onChange={handleInputChange} className="w-full border border-input rounded-input p-2.5 font-semibold text-ink outline-none focus:border-sgreen-med bg-surface-alt text-sm cursor-pointer">
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

          {/* START / FINISH CH. — navy-dark dark section, white text for legibility */}
          <div className="bg-navy-dark rounded-card p-4 flex items-center justify-between shadow-hover relative overflow-hidden">
            <div className="absolute right-0 top-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10"></div>
            <div className="flex-1 relative z-10">
              <label className="text-[9px] font-semibold text-cyan uppercase tracking-widest block mb-1">Start (CH.)</label>
              <input type="text" name="startCH" value={formData.startCH} onChange={handleInputChange} onBlur={(e) => setFormData(prev => ({ ...prev, startCH: formatCH(prev.startCH) }))} className="w-full bg-white/10 border border-white/20 text-white rounded-input p-3 text-center font-mono font-semibold outline-none focus:border-sgreen-med text-lg transition-colors shadow-card" placeholder="0+000" />
            </div>
            <div className="px-4 relative z-10"><ChevronRight size={24} className="text-white/40" /></div>
            <div className="flex-1 relative z-10">
              <label className="text-[9px] font-semibold text-cyan uppercase tracking-widest block mb-1">Finish (CH.)</label>
              <input type="text" name="finishCH" value={formData.finishCH} onChange={handleInputChange} onBlur={(e) => setFormData(prev => ({ ...prev, finishCH: formatCH(prev.finishCH) }))} className="w-full bg-white/10 border border-white/20 text-white rounded-input p-3 text-center font-mono font-semibold outline-none focus:border-sgreen-med text-lg transition-colors shadow-card" placeholder="0+000" />
            </div>
          </div>

          {/* HEAD LEVEL — ระดับหัวเจาะ (optional; + = สูงกว่าแบบ) */}
          <div className="bg-surface border border-input rounded-card p-5 shadow-card relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-navy"></div>
            <div className="flex justify-between items-center mb-3 pl-2">
              <h3 className="text-xs font-semibold text-ink flex items-center gap-2 uppercase tracking-widest">ระดับหัวเจาะ <span className="text-[10px] text-ink-3 font-medium normal-case">(Head Level · ไม่บังคับ)</span></h3>
              <span className="text-[9px] text-ink-3 font-medium">+ = สูงกว่าแบบ</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pl-2">
              <div>
                <label className="text-[10px] font-semibold text-ink-3 block mb-1.5">Head (mm)</label>
                <input type="number" step="1" name="headV" value={formData.headV} onChange={handleInputChange} className="border border-input rounded-input p-2.5 w-full bg-surface-alt outline-none font-mono font-semibold text-ink focus:border-navy transition-colors text-sm text-center" placeholder="+29" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-ink-3 block mb-1.5">Art (mm)</label>
                <input type="number" step="1" name="artV" value={formData.artV} onChange={handleInputChange} className="border border-input rounded-input p-2.5 w-full bg-surface-alt outline-none font-mono font-semibold text-ink focus:border-navy transition-colors text-sm text-center" placeholder="+33" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-ink-3 block mb-1.5">Tail (mm)</label>
                <input type="number" step="1" name="tailV" value={formData.tailV} onChange={handleInputChange} className="border border-input rounded-input p-2.5 w-full bg-surface-alt outline-none font-mono font-semibold text-ink focus:border-navy transition-colors text-sm text-center" placeholder="+34" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-ink-3 block mb-1.5">VRT (°)</label>
                <input type="number" step="0.1" name="vrt" value={formData.vrt} onChange={handleInputChange} className="border border-input rounded-input p-2.5 w-full bg-surface-alt outline-none font-mono font-semibold text-ink focus:border-navy transition-colors text-sm text-center" placeholder="0.2" />
              </div>
            </div>
          </div>

          {/* REMARK */}
          <div className="bg-surface border border-input rounded-card p-4 shadow-card">
            <label className="text-[9px] font-semibold text-ink-3 uppercase tracking-widest block mb-2">Problem / Remark</label>
            <textarea name="remark" value={formData.remark} onChange={handleInputChange} rows="2" className="w-full bg-surface-alt border border-input rounded-input p-3 text-sm font-medium text-ink outline-none focus:border-sgreen-med transition-all resize-none" placeholder="ระบุปัญหาหรืออุปสรรค..."></textarea>
          </div>

          {/* Submit — wrapped in StickyActionBar for mobile reachability */}
          <StickyActionBar>
            <button type="submit" disabled={isSaving} className={`w-full text-white font-semibold py-4 rounded-input flex justify-center items-center gap-2 shadow-card transition-all active:scale-[0.98] ${isSaving ? 'bg-ink-3' : 'bg-sgreen-dark hover:opacity-90'}`}>
              {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} {formData.status === "In Progress" ? "Save Partial Status" : "Save Record"}
            </button>
          </StickyActionBar>
        </div>
      </form>
    </div>
  );
};

export default SegmentRecordView;
