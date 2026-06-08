import React, { useState, useMemo, useEffect } from "react";
import { Activity, Camera, Save, Loader2 } from "lucide-react";
import RingVisualizer from "../common/RingVisualizer";
import { THEORETICAL_VOL } from "../../utils/constants";
import { formatDisplayDate } from "../../utils/formatters";
import { getRingByOffsetFromHistory, handleFileUpload } from "../../utils/helpers";
import { apiCall } from "../../utils/api";
import { SegmentedToggle } from "../../ui-ux-pro-max";
import StickyActionBar from "../../ui-ux-pro-max/components/StickyActionBar";

const GroutRecordView = ({ projectInfo, handleProjectInfoChange, groutRecords, setGroutRecords, segmentRecords, setCurrentModule, setActiveTab, machine = "TBM1" }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({ ringNo: "", excavRing: "", pressure: "", partA: "", partB: "", keyType: "16", positions: { A: false, B1: false, B2: false, C1: false, C2: false, K: false }, remark: "", imageBase64: "", imageName: "" });
  const [isKeyLinked, setIsKeyLinked] = useState(false);

  const existingRecord = useMemo(() => {
    if (!formData.ringNo) return null;
    const inputRing = String(formData.ringNo).trim().toUpperCase();
    return groutRecords.find((r) => String(r.ringNo).trim().toUpperCase() === inputRing);
  }, [formData.ringNo, groutRecords]);

  const isReGrout = !!existingRecord;

  useEffect(() => {
    if (groutRecords.length > 0 && segmentRecords.length > 0 && !formData.ringNo) {
      const lastRecord = groutRecords[groutRecords.length - 1];
      const nextGroutRing = getRingByOffsetFromHistory(lastRecord.ringNo, 2, segmentRecords);
      const latestSegmentRing = segmentRecords.length > 0 ? segmentRecords[segmentRecords.length - 1].ringNo : "";
      setFormData((prev) => ({ ...prev, ringNo: nextGroutRing, excavRing: latestSegmentRing }));
    }
  }, [groutRecords, segmentRecords]);

  useEffect(() => {
    if (formData.ringNo) {
      const inputRing = String(formData.ringNo).trim().toUpperCase();
      const segment = segmentRecords.find((s) => String(s.ringNo).trim().toUpperCase() === inputRing);
      if (segment) {
        setFormData((prev) => prev.keyType !== segment.keyPos ? { ...prev, keyType: segment.keyPos } : prev);
        setIsKeyLinked(true);
      } else {
        setIsKeyLinked(false);
      }
    }
  }, [formData.ringNo, segmentRecords]);

  const currentTotal = Number(Number(formData.partA || 0) + Number(formData.partB || 0)).toFixed(2);
  let displayRatio = Number((Number(currentTotal) / THEORETICAL_VOL) * 100).toFixed(1);

  if (isReGrout && existingRecord) {
    const primTotal = Number(existingRecord.primaryPartA || existingRecord.partA || 0) + Number(existingRecord.primaryPartB || existingRecord.partB || 0);
    const combinedTotal = primTotal + Number(currentTotal);
    displayRatio = Number((combinedTotal / THEORETICAL_VOL) * 100).toFixed(1);
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let newFormData = { ...formData, [name]: value };
    if (name === "ringNo") newFormData.excavRing = getRingByOffsetFromHistory(String(value).trim(), 3, segmentRecords);
    setFormData(newFormData);
  };

  const togglePosition = (pos) => setFormData((prev) => ({ ...prev, positions: { ...prev.positions, [pos]: !prev.positions[pos] } }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.ringNo || !formData.partA) return;
    setIsSaving(true);
    const inputRing = String(formData.ringNo).trim().toUpperCase();

    if (existingRecord) {
      const primPartA = Number(existingRecord.primaryPartA || existingRecord.partA || 0);
      const primPartB = Number(existingRecord.primaryPartB || existingRecord.partB || 0);
      const primTotal = primPartA + primPartB;
      const primDate = existingRecord.primaryDate || existingRecord.date;
      const primPos = existingRecord.primaryPositions || existingRecord.positions || {};

      const secPartA = Number(existingRecord.secondaryPartA || 0) + Number(formData.partA || 0);
      const secPartB = Number(existingRecord.secondaryPartB || 0) + Number(formData.partB || 0);
      const secTotal = secPartA + secPartB;
      const secDate = projectInfo.date;

      const secPos = { ...(existingRecord.secondaryPositions || {}) };
      for (const pos in formData.positions) if (formData.positions[pos]) secPos[pos] = true;

      const newPartA = primPartA + secPartA;
      const newPartB = primPartB + secPartB;
      const newTotal = newPartA + newPartB;
      const newRatio = (newTotal / THEORETICAL_VOL) * 100;

      let newRemark = `Primary วันที่ ${formatDisplayDate(primDate)} ปริมาณ ${Number(primTotal).toFixed(2)}\nSecondary วันที่ ${formatDisplayDate(secDate)} ปริมาณ ${Number(secTotal).toFixed(2)}`;
      if (formData.remark) newRemark += `\nหมายเหตุ: ${formData.remark}`;

      const updatedRecord = {
        ...existingRecord,
        partA: Number(newPartA).toFixed(2),
        partB: Number(newPartB).toFixed(2),
        total: Number(newTotal),
        ratio: Number(newRatio),
        primaryPartA: Number(primPartA).toFixed(2),
        primaryPartB: Number(primPartB).toFixed(2),
        primaryDate: primDate,
        primaryPositions: primPos,
        secondaryPartA: Number(secPartA).toFixed(2),
        secondaryPartB: Number(secPartB).toFixed(2),
        secondaryDate: secDate,
        secondaryPositions: secPos,
        pressure: formData.pressure || existingRecord.pressure,
        remark: newRemark,
        positions: { ...primPos, ...secPos },
        groutPass: "Re-Grout"
      };
      if (formData.imageBase64) { updatedRecord.imageBase64 = formData.imageBase64; updatedRecord.imageName = formData.imageName; }

      try {
        const payloadRecord = {
          ...updatedRecord,
          positions: JSON.stringify(updatedRecord.positions),
          primaryPositions: JSON.stringify(updatedRecord.primaryPositions),
          secondaryPositions: JSON.stringify(updatedRecord.secondaryPositions)
        };
        await apiCall("updateGrout", { ...payloadRecord, machine });
        if (updatedRecord.imageBase64) updatedRecord.imageUrl = "Attached";
        setGroutRecords((prev) => prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r)));
        resetFormAfterSave(true);
      } catch (err) { alert("อัปเดตข้อมูลไม่สำเร็จ: " + err.message); }
    } else {
      const newRecord = {
        id: `grout_${Date.now()}`,
        ...projectInfo,
        ...formData,
        ringNo: inputRing,
        key: formData.keyType,
        total: Number(currentTotal),
        ratio: Number((Number(currentTotal) / THEORETICAL_VOL) * 100),
        groutPass: "1st Pass",
        primaryPartA: Number(formData.partA || 0).toFixed(2),
        primaryPartB: Number(formData.partB || 0).toFixed(2),
        primaryDate: projectInfo.date,
        primaryPositions: formData.positions
      };
      try {
        const payloadRecord = {
          ...newRecord,
          positions: JSON.stringify(newRecord.positions),
          primaryPositions: JSON.stringify(newRecord.primaryPositions)
        };
        await apiCall("addGrout", { ...payloadRecord, machine });
        if (newRecord.imageBase64) newRecord.imageUrl = "Attached";
        setGroutRecords((prev) => [...prev, newRecord]);
        resetFormAfterSave(false);
      } catch (err) { alert("บันทึกข้อมูลไม่สำเร็จ: " + err.message); }
    }
    setIsSaving(false);
  };

  const resetFormAfterSave = (wasReGrout) => {
    setFormData((prev) => {
      const nextGroutRing = !wasReGrout ? getRingByOffsetFromHistory(prev.ringNo, 2, segmentRecords) : prev.ringNo;
      const latestSegmentRing = !wasReGrout ? (segmentRecords.length > 0 ? segmentRecords[segmentRecords.length - 1].ringNo : "") : prev.excavRing;
      return { ...prev, ringNo: nextGroutRing, excavRing: latestSegmentRing, pressure: "", partA: "", partB: "", positions: { A: false, B1: false, B2: false, C1: false, C2: false, K: false }, remark: "", imageBase64: "", imageName: "" };
    });
  };

  return (
    <div className="max-w-xl mx-auto pb-24 animate-slide-up">
      {/* Module switcher — lets mobile users toggle between Segment and Grout */}
      <div className="mb-4">
        <SegmentedToggle
          value="grout"
          options={[{ value: "segment", label: "Segment" }, { value: "grout", label: "Grout" }]}
          onChange={(m) => { setCurrentModule(m); }}
        />
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-card shadow-card border border-line overflow-hidden">
        {/* Header */}
        <div className={`px-6 sm:px-8 py-6 text-white relative ${isReGrout ? 'bg-code-c' : 'bg-navy'}`}>
          <h2 className="font-semibold text-2xl flex items-center gap-2">{isReGrout ? "Secondary Grout Record" : "Primary Grout Record"}</h2>
          <p className="text-white/80 text-xs mt-1">{isReGrout ? "บันทึกข้อมูลการอัดน้ำปูนรอบที่ 2 (Re-Grout)" : "Enter details for primary grout"}</p>
        </div>

        <div className="p-6 space-y-5">
          {/* Date & Shift */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface-alt p-4 rounded-input border border-input">
              <label className="text-[10px] font-semibold text-ink-3 block mb-1">Working Date</label>
              <input type="date" name="date" value={projectInfo.date} onChange={handleProjectInfoChange} className="w-full bg-transparent font-semibold text-ink outline-none cursor-pointer" />
            </div>
            <div className="bg-surface-alt p-4 rounded-input border border-input">
              <label className="text-[10px] font-semibold text-ink-3 block mb-1">Working Shift</label>
              <select name="shift" value={projectInfo.shift} onChange={handleProjectInfoChange} className="w-full bg-transparent font-semibold text-ink outline-none cursor-pointer">
                <option value="Day">☀️ Day Shift</option><option value="Night">🌙 Night Shift</option>
              </select>
            </div>
          </div>

          {/* Ring inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface-alt p-4 rounded-input border border-input focus-within:border-navy focus-within:ring-2 focus-within:ring-cyan-tint transition-all">
              <label className="text-[10px] font-semibold text-ink-3 block mb-1">Grouting Ring</label>
              <input type="text" name="ringNo" required value={formData.ringNo} onChange={handleInputChange} onBlur={(e) => setFormData(prev => ({ ...prev, ringNo: String(e.target.value).trim().toUpperCase() }))} className={`w-full bg-transparent text-2xl font-semibold outline-none uppercase mt-1 ${isReGrout ? "text-code-c" : "text-ink"}`} placeholder="P-XXXX" />
              {isReGrout && <span className="text-[9px] bg-code-c/10 text-code-c px-2 py-0.5 rounded-badge font-semibold mt-2 inline-block">โหมดบันทึก Re-Grout อัตโนมัติ</span>}
            </div>
            <div className="bg-surface-alt p-4 rounded-input border border-input">
              <label className="text-[10px] font-semibold text-ink-3 block mb-1 flex items-center justify-between">Excavation Ring <Activity size={12} className="text-navy" /></label>
              <input type="text" name="excavRing" value={formData.excavRing} onChange={handleInputChange} className="w-full bg-transparent text-2xl font-semibold text-ink outline-none uppercase mt-1" />
            </div>
          </div>

          {/* Key segment & RingVisualizer */}
          <div className="bg-white border border-line rounded-input p-4 text-center">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-semibold text-ink-3">Key Segment {isKeyLinked && <span className="bg-sgreen-med/20 text-sgreen-dark px-1.5 py-0.5 rounded-badge text-[8px] ml-1">Synced</span>}</span>
              <span className="font-semibold text-sm bg-surface-alt px-3 py-1 rounded-input border border-line">Key {String(formData.keyType)}</span>
            </div>
            <input type="range" min="1" max="16" step="1" name="keyType" value={formData.keyType} onChange={handleInputChange} disabled={isKeyLinked} className="w-full h-2 rounded-full appearance-none bg-surface-alt accent-navy cursor-pointer" />
            <p className="text-[9px] text-ink-3 font-semibold mt-3">แตะเลือกตำแหน่งที่ฉีด (สีน้ำเงิน = รูเดิม, สีส้ม = รูที่เลือกใหม่)</p>
            <div className="scale-90 transform origin-top mt-2">
              <RingVisualizer
                ringKey={formData.keyType}
                primaryPositions={isReGrout && existingRecord ? (Object.values(existingRecord.primaryPositions || {}).some(v => v === true) ? existingRecord.primaryPositions : existingRecord.positions) : formData.positions}
                secondaryPositions={isReGrout ? formData.positions : null}
                onTogglePosition={togglePosition}
              />
            </div>
          </div>

          {/* Part A / Part B / Pressure */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface-alt p-3 rounded-input border border-input">
              <label className={`block text-[10px] font-semibold mb-1 ${isReGrout ? 'text-code-c' : 'text-ink-3'}`}>{isReGrout ? "Sec. Part A" : "Part A"}</label>
              <input type="number" step="0.01" name="partA" value={formData.partA} onChange={handleInputChange} className="bg-transparent w-full font-mono text-lg font-semibold text-ink outline-none" placeholder="0.00" />
              {isReGrout && <div className="text-[9px] text-navy font-semibold mt-1 pt-1 border-t border-line">Prim: {String(existingRecord?.primaryPartA || existingRecord?.partA || '0.00')}</div>}
            </div>
            <div className="bg-surface-alt p-3 rounded-input border border-input">
              <label className={`block text-[10px] font-semibold mb-1 ${isReGrout ? 'text-code-c' : 'text-ink-3'}`}>{isReGrout ? "Sec. Part B" : "Part B"}</label>
              <input type="number" step="0.01" name="partB" value={formData.partB} onChange={handleInputChange} className="bg-transparent w-full font-mono text-lg font-semibold text-ink outline-none" placeholder="0.00" />
              {isReGrout && <div className="text-[9px] text-navy font-semibold mt-1 pt-1 border-t border-line">Prim: {String(existingRecord?.primaryPartB || existingRecord?.partB || '0.00')}</div>}
            </div>
            <div className="bg-surface-alt p-3 rounded-input border border-input">
              <label className="block text-[10px] font-semibold text-ink-3 mb-1">Pressure (bar)</label>
              <input type="number" step="0.1" name="pressure" value={formData.pressure} onChange={handleInputChange} className="bg-transparent w-full font-mono text-lg font-semibold text-ink outline-none" placeholder="0.0" />
            </div>
          </div>

          {/* Total volume / Ratio box */}
          <div className={`p-4 rounded-input flex justify-between items-center ${isReGrout ? 'bg-code-c/10 border border-code-c/30' : 'bg-cyan-tint border border-cyan-med/30'}`}>
            <div>
              <span className={`block text-[10px] font-semibold ${isReGrout ? 'text-code-c' : 'text-cyan-med'}`}>{isReGrout ? 'Total (Prim + Sec)' : 'Total Volume'}</span>
              <div className="text-2xl font-semibold text-ink font-mono">{isReGrout && existingRecord ? Number(Number(existingRecord.primaryPartA || existingRecord.partA || 0) + Number(existingRecord.primaryPartB || existingRecord.partB || 0) + Number(currentTotal)).toFixed(2) : String(currentTotal)} m³</div>
            </div>
            <div className="text-right">
              <span className={`block text-[10px] font-semibold ${isReGrout ? 'text-code-c' : 'text-cyan-med'}`}>Ratio</span>
              <div className={`text-2xl font-semibold font-mono ${Number(displayRatio) > 150 ? "text-cyan-med" : Number(displayRatio) >= 100 ? "text-sgreen-dark" : "text-code-d"}`}>{String(displayRatio)}%</div>
            </div>
          </div>

          {/* Remark & Photo */}
          <div className="bg-white p-4 border border-line rounded-input shadow-card">
            <textarea name="remark" value={formData.remark} onChange={handleInputChange} rows="2" className="w-full bg-surface-alt border border-input p-3 rounded-input text-sm outline-none focus:border-navy focus:ring-2 focus:ring-cyan-tint transition-all text-ink" placeholder="Problem / Remark (อุปสรรค)"></textarea>
            <div className="mt-3 pt-3 border-t border-line">
              <label className="text-[10px] font-semibold text-ink-3 mb-2 flex items-center gap-1"><Camera size={12} /> Attach Photo</label>
              <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, setFormData)} className="text-xs text-ink-3 w-full file:mr-4 file:py-1.5 file:px-4 file:rounded-badge file:border-0 file:bg-cyan-tint file:text-navy" />
            </div>
          </div>

          {/* Submit — wrapped in StickyActionBar for mobile reachability */}
          <StickyActionBar>
            <button type="submit" disabled={isSaving} className={`w-full text-white font-semibold py-4 rounded-input flex justify-center items-center gap-2 shadow-card transition-transform active:scale-95 ${isSaving ? 'bg-ink-3' : isReGrout ? 'bg-code-c' : 'bg-navy'}`}>
              {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} {isReGrout ? "Save Re-Grout Data" : "Confirm & Save Record"}
            </button>
          </StickyActionBar>
        </div>
      </form>
    </div>
  );
};

export default GroutRecordView;
