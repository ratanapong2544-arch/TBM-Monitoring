import React, { useState, useMemo, useEffect, useRef } from "react";
import { Activity, Camera, Save, Loader2, AlertTriangle } from "lucide-react";
import RingVisualizer from "../common/RingVisualizer";
import { THEORETICAL_VOL } from "../../utils/constants";
import { getRingByOffsetFromHistory, handleFileUpload } from "../../utils/helpers";
import { buildMutationEnvelope } from "../../offline/mutationEnvelope";
import { SegmentedToggle } from "../../ui-ux-pro-max";
import StickyActionBar from "../../ui-ux-pro-max/components/StickyActionBar";

// The secondary-only columns of the paper sheet (บันทึกการทำงาน Secondary Grout): a drilling record
// and a grouting record per ring. They live on the same formData as the primary fields because the
// primary branch never renders — nor submits — them. Blank, not prefilled: the crew measures each
// hole, and a depth or a Dry/Wet the app filled in would be recorded as if someone had read it.
const SECONDARY_BLANK = { drillPosition: "", drillingDepth: "", holeCondition: "", drillRemark: "", timeStart: "", timeEnd: "", volumeLitre: "", recordedBy: "" };
// what a save clears. drillingDepth / holeCondition / recordedBy stay: one sheet is one shift, one
// recorder, and rows drilled to the same depth — retyping them per ring is how they end up wrong.
const SECONDARY_PER_RING = { drillPosition: "", drillRemark: "", timeStart: "", timeEnd: "", volumeLitre: "" };

// the setters are gone for the reason given in SegmentRecordView: one writer per row, and it is App
const GroutRecordView = ({ projectInfo, handleProjectInfoChange, groutRecords, secondaryGroutRecords = [], segmentRecords, setCurrentModule, setActiveTab, machine = "TBM1", isCurrentMachine, onMutate, syncMeta }) => {
  const [isSaving, setIsSaving] = useState(false);
  // App answers this, because a save can resolve after this view unmounts (any nav tap) and a local
  // ref would be frozen at the machine selected then. The local fallback is for standalone renders.
  const machineRef = useRef(machine);
  machineRef.current = machine;
  const stillOnMachine = (m) => (isCurrentMachine ? isCurrentMachine(m) : machineRef.current === m);
  const [groutType, setGroutType] = useState("primary"); // primary | secondary
  const isSecondary = groutType === "secondary";
  const [formData, setFormData] = useState({ ringNo: "", excavRing: "", pressure: "", partA: "", partB: "", keyType: "16", positions: { A: false, B1: false, B2: false, C1: false, C2: false, K: false }, remark: "", imageBase64: "", imageName: "", ...SECONDARY_BLANK });
  const [isKeyLinked, setIsKeyLinked] = useState(false);

  // A form left open across a machine switch kept the previous machine's ring, and the prefill
  // below only fires on an empty ringNo — so a submit wrote that ring into the other machine.
  // keyType matters most: it is DERIVED from the previous machine's segment record (the effect
  // below syncs it to that ring's keyPos), it is submitted as `key`, and RingVisualizer turns it
  // into a rotation — so a stale value replays the injection positions 90° out of place. The other
  // machine may have no rings yet, in which case nothing would ever re-sync it.
  useEffect(() => {
    setFormData((prev) => ({
      ...prev, ringNo: "", excavRing: "", pressure: "", partA: "", partB: "", remark: "",
      imageBase64: "", imageName: "", keyType: "16",
      positions: { A: false, B1: false, B2: false, C1: false, C2: false, K: false },
      // the drilling and grouting readings belong to the machine that was selected, so all of them
      // go — including the ones a save keeps, which are only shift-stable within one machine
      ...SECONDARY_BLANK,
    }));
    setIsKeyLinked(false);
    // Note: the sync effect below reads the render's formData.ringNo, which is still the previous
    // machine's during this same commit, so if BOTH machines happen to have that ring number it
    // would re-derive keyType and re-lock the slider straight after this reset. App gates the rows
    // to empty on a machine switch (rowsReady in App.jsx), so the effect finds nothing to sync and
    // the reset stands. That dependency is deliberate — see the App-level machine-switch test.
  }, [machine]);

  // ริงนี้มี primary record อยู่แล้วไหม (โหมด primary เท่านั้น) → เตือน แต่บันทึกได้
  const dupPrimary = useMemo(() => {
    if (isSecondary || !formData.ringNo) return false;
    const ring = String(formData.ringNo).trim().toUpperCase();
    return groutRecords.some((r) => String(r.ringNo).trim().toUpperCase() === ring);
  }, [formData.ringNo, groutRecords, isSecondary]);

  // Same shape as the segment form: the emptiness check reads `prev`, not the render's formData, so
  // a snapshot arriving with a new array identity cannot revert a ring the crew corrected by hand,
  // and the reset above (same commit) is visible to it.
  useEffect(() => {
    if (groutRecords.length > 0 && segmentRecords.length > 0) {
      const lastRecord = groutRecords[groutRecords.length - 1];
      // ONE ring on from the last one grouted. It was two, which skipped a ring on every shift the
      // crew did not correct the number by hand: the sheet grouted P838, P839, P840, P841, P842 on
      // consecutive shifts and the form kept offering the ring after next. The 3 below is a
      // different number answering a different question — how far ahead the machine has dug — and
      // the two sitting near each other is why this one looked right.
      const nextGroutRing = getRingByOffsetFromHistory(lastRecord.ringNo, 1, segmentRecords);
      const latestSegmentRing = segmentRecords.length > 0 ? segmentRecords[segmentRecords.length - 1].ringNo : "";
      setFormData((prev) => prev.ringNo ? prev : ({ ...prev, ringNo: nextGroutRing, excavRing: latestSegmentRing }));
    }
  }, [groutRecords, segmentRecords, machine]);

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
  const displayRatio = Number((Number(currentTotal) / THEORETICAL_VOL) * 100).toFixed(1);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let newFormData = { ...formData, [name]: value };
    if (name === "ringNo") newFormData.excavRing = getRingByOffsetFromHistory(String(value).trim(), 3, segmentRecords);
    setFormData(newFormData);
  };

  const togglePosition = (pos) => setFormData((prev) => ({ ...prev, positions: { ...prev.positions, [pos]: !prev.positions[pos] } }));

  const resetFormAfterSave = () => {
    setFormData((prev) => {
      // the same +1 as the prefill above, and it has to move with it: this is the OTHER place the
      // crew meets a proposed ring — back-to-back saves never go through the prefill at all, so
      // fixing only one of the two leaves the skip in place for exactly the shift that grouts more
      // than one ring
      const nextGroutRing = getRingByOffsetFromHistory(prev.ringNo, 1, segmentRecords);
      const latestSegmentRing = segmentRecords.length > 0 ? segmentRecords[segmentRecords.length - 1].ringNo : "";
      return {
        ...prev,
        ringNo: isSecondary ? prev.ringNo : nextGroutRing,        // secondary ไม่ auto-advance (ผู้ใช้เลือกริง)
        excavRing: isSecondary ? prev.excavRing : latestSegmentRing,
        pressure: "", partA: "", partB: "",
        positions: { A: false, B1: false, B2: false, C1: false, C2: false, K: false },
        remark: "", imageBase64: "", imageName: "",
        ...SECONDARY_PER_RING,
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // A secondary hole that took no grout is still a record the sheet keeps (the paper form has
    // rows of 0 litre), so volume cannot gate that save the way Part A gates a primary one.
    if (!formData.ringNo || (!isSecondary && !formData.partA)) return;
    setIsSaving(true);
    const machineAtSave = machine;
    const inputRing = String(formData.ringNo).trim().toUpperCase();
    // ส่ง positions เป็น object → GAS encode ครั้งเดียว (กัน double-encode)
    // split the form once: each mode submits its own columns and nothing of the other's. A Part A
    // typed in primary mode before the toggle must not be filed as a secondary volume, and the
    // drilling record must not ride along on a primary row.
    const { partA, partB, volumeLitre, ...common } = { ...projectInfo, ...formData, ringNo: inputRing, key: formData.keyType };
    const { drillPosition, drillingDepth, holeCondition, drillRemark, timeStart, timeEnd, recordedBy, ...primaryCommon } = common;

    try {
      const entityType = isSecondary ? "secondaryGrout" : "grout";
      const litre = Number(volumeLitre || 0);
      const rec = isSecondary
        ? {
            id: `sgrout_${Date.now()}`, ...common, // ไม่มี ratio/groutPass
            volumeLitre: litre,
            // litre is what the crew reads off the pump and what the sheet keeps, but the m³ column
            // is filled too, derived exactly (1 L = 0.001 m³): every chart and total in the app
            // reads `total` as m³, and a litre value parked there would read as 1000× itself
            total: litre / 1000,
            // the machine, not projectInfo.tbmNo — that field is typed once and never follows a
            // machine switch, so it can label a TBM2 row TBM1
            tbmNo: machineAtSave,
          }
        : { id: `grout_${Date.now()}`, ...primaryCommon, partA, partB, total: Number(currentTotal), ratio: Number((Number(currentTotal) / THEORETICAL_VOL) * 100), groutPass: "1st Pass" };
      await onMutate(buildMutationEnvelope({
        entityType, operation: "create", machine: machineAtSave,
        recordId: rec.id, payload: rec, syncMeta,
      }));
      // A save resolves seconds later. If the crew switched machine meanwhile the form holds the
      // OTHER machine's ring and its measured Part A / Part B volumes, so the reset must not run:
      // clearing them here wiped readings the crew had typed and not yet saved.
      if (!stillOnMachine(machineAtSave)) { setIsSaving(false); return; }
      resetFormAfterSave();
    } catch (err) { alert("บันทึกข้อมูลไม่สำเร็จ: " + err.message); }
    setIsSaving(false);
  };

  const accent = isSecondary ? "code-c" : "navy";

  return (
    <div className="max-w-xl mx-auto pb-24 animate-slide-up">
      {/* Module switcher */}
      <div className="mb-4">
        <SegmentedToggle
          value="grout"
          options={[{ value: "segment", label: "Segment" }, { value: "grout", label: "Grout" }]}
          onChange={(m) => { setCurrentModule(m); }}
        />
      </div>

      {/* Primary / Secondary type toggle */}
      <div className="mb-4">
        <SegmentedToggle
          value={groutType}
          options={[{ value: "primary", label: "Primary Grout" }, { value: "secondary", label: "Secondary Grout" }]}
          onChange={(t) => setGroutType(t)}
        />
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-card shadow-card border border-line overflow-hidden">
        {/* Header */}
        <div className={`px-6 sm:px-8 py-6 text-white relative ${isSecondary ? 'bg-code-c' : 'bg-navy'}`}>
          <h2 className="font-semibold text-2xl flex items-center gap-2">{isSecondary ? "Secondary Grout Record" : "Primary Grout Record"}</h2>
          <p className="text-white/80 text-xs mt-1">{isSecondary ? "บันทึก secondary grout (ทำเฉพาะบางริง)" : "บันทึก primary grout"}</p>
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

          {/* Sheet header (secondary): ตำแหน่ง + หัวเจาะ + ผู้บันทึก — the paper form's top and
              signature blocks. The machine is shown, not typed: it is whatever machine this record
              is being filed under. */}
          {isSecondary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-surface-alt p-4 rounded-input border border-input sm:col-span-2">
                <label className="text-[10px] font-semibold text-ink-3 block mb-1">ตำแหน่ง (Location)</label>
                <input type="text" name="location" value={projectInfo.location || ""} onChange={handleProjectInfoChange} className="w-full bg-transparent font-semibold text-ink outline-none text-sm" placeholder="อุโมงค์จากบ่อ IS4 ถึง บ่อ IS2" />
              </div>
              <div className="bg-surface-alt p-4 rounded-input border border-input">
                <label className="text-[10px] font-semibold text-ink-3 block mb-1">หัวเจาะหมายเลข</label>
                <div className="font-semibold text-ink text-sm">{String(machine)}</div>
              </div>
              <div className="bg-surface-alt p-4 rounded-input border border-input">
                <label className="text-[10px] font-semibold text-ink-3 block mb-1">ผู้บันทึก</label>
                <input type="text" name="recordedBy" value={formData.recordedBy} onChange={handleInputChange} className="w-full bg-transparent font-semibold text-ink outline-none text-sm" placeholder="ชื่อผู้บันทึก" />
              </div>
            </div>
          )}

          {/* Ring inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface-alt p-4 rounded-input border border-input focus-within:border-navy focus-within:ring-2 focus-within:ring-cyan-tint transition-all">
              <label className="text-[10px] font-semibold text-ink-3 block mb-1">Grouting Ring</label>
              <input type="text" name="ringNo" required value={formData.ringNo} onChange={handleInputChange} onBlur={(e) => setFormData(prev => ({ ...prev, ringNo: String(e.target.value).trim().toUpperCase() }))} className={`w-full bg-transparent text-2xl font-semibold outline-none uppercase mt-1 ${isSecondary ? "text-code-c" : "text-ink"}`} placeholder="P-XXXX" />
            </div>
            <div className="bg-surface-alt p-4 rounded-input border border-input">
              <label className="text-[10px] font-semibold text-ink-3 block mb-1 flex items-center justify-between">Excavation Ring <Activity size={12} className="text-navy" /></label>
              <input type="text" name="excavRing" value={formData.excavRing} onChange={handleInputChange} className="w-full bg-transparent text-2xl font-semibold text-ink outline-none uppercase mt-1" />
            </div>
          </div>

          {/* Duplicate primary warning (allow save) */}
          {dupPrimary && (
            <div className="bg-code-c/10 border border-code-c/30 rounded-input p-3 flex items-start gap-2">
              <AlertTriangle size={16} className="text-code-c mt-0.5 shrink-0" />
              <p className="text-xs font-semibold text-code-c">ริงนี้มี primary grout แล้ว — ถ้าเป็นการอัดซ้ำ แนะนำสลับไปโหมด <b>Secondary Grout</b> (ยังบันทึก primary ซ้ำได้ถ้าต้องการ)</p>
            </div>
          )}

          {/* Key segment & RingVisualizer */}
          <div className="bg-white border border-line rounded-input p-4 text-center">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-semibold text-ink-3">Key Segment {isKeyLinked && <span className="bg-sgreen-med/20 text-sgreen-dark px-1.5 py-0.5 rounded-badge text-[8px] ml-1">Synced</span>}</span>
              <span className="font-semibold text-sm bg-surface-alt px-3 py-1 rounded-input border border-line">Key {String(formData.keyType)}</span>
            </div>
            <input type="range" min="1" max="16" step="1" name="keyType" value={formData.keyType} onChange={handleInputChange} disabled={isKeyLinked} className="w-full h-2 rounded-full appearance-none bg-surface-alt accent-navy cursor-pointer" />
            <p className="text-[9px] text-ink-3 font-semibold mt-3">{isSecondary ? "แตะเลือก Segment ที่เจาะ — Segment Drilled (สีส้ม)" : "แตะเลือกตำแหน่งที่ฉีด"}</p>
            <div className="scale-90 transform origin-top mt-2">
              <RingVisualizer
                ringKey={formData.keyType}
                primaryPositions={isSecondary ? {} : formData.positions}
                secondaryPositions={isSecondary ? formData.positions : null}
                onTogglePosition={togglePosition}
              />
            </div>
          </div>

          {/* Drilling Record (secondary) — the paper form's left half: where the hole was drilled,
              how deep, and whether it came back wet or dry */}
          {isSecondary && (
            <div className="bg-white border border-line rounded-input p-4 space-y-3">
              <div className="text-[10px] font-semibold text-code-c uppercase tracking-wide">Drilling Record</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-alt p-3 rounded-input border border-input">
                  <label className="block text-[10px] font-semibold text-ink-3 mb-1">Drill Position</label>
                  <input type="text" name="drillPosition" value={formData.drillPosition} onChange={handleInputChange} className="bg-transparent w-full text-sm font-semibold text-ink outline-none" placeholder="ตำแหน่งเจาะ" />
                </div>
                <div className="bg-surface-alt p-3 rounded-input border border-input">
                  <label className="block text-[10px] font-semibold text-ink-3 mb-1">Drilling Depth (mm)</label>
                  <input type="number" step="1" name="drillingDepth" value={formData.drillingDepth} onChange={handleInputChange} className="bg-transparent w-full font-mono text-lg font-semibold text-ink outline-none" placeholder="500" />
                </div>
                <div className="bg-surface-alt p-3 rounded-input border border-input">
                  <label className="block text-[10px] font-semibold text-ink-3 mb-1">Hole Wet / Dry</label>
                  <select name="holeCondition" value={formData.holeCondition} onChange={handleInputChange} className="w-full bg-transparent text-sm font-semibold text-ink outline-none cursor-pointer">
                    <option value="">—</option><option value="Dry">Dry</option><option value="Wet">Wet</option>
                  </select>
                </div>
                <div className="bg-surface-alt p-3 rounded-input border border-input">
                  <label className="block text-[10px] font-semibold text-ink-3 mb-1">Remark (Drilling)</label>
                  <input type="text" name="drillRemark" value={formData.drillRemark} onChange={handleInputChange} className="bg-transparent w-full text-sm text-ink outline-none" placeholder="—" />
                </div>
              </div>
            </div>
          )}

          {/* Grouting Record (secondary) — เวลาเริ่ม/จบ, แรงดันสูงสุด, ปริมาณเป็นลิตร */}
          {isSecondary && (
            <div className="bg-white border border-line rounded-input p-4 space-y-3">
              <div className="text-[10px] font-semibold text-code-c uppercase tracking-wide">Grouting Record</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-alt p-3 rounded-input border border-input">
                  <label className="block text-[10px] font-semibold text-ink-3 mb-1">Time Start</label>
                  <input type="time" name="timeStart" value={formData.timeStart} onChange={handleInputChange} className="bg-transparent w-full font-mono text-lg font-semibold text-ink outline-none" />
                </div>
                <div className="bg-surface-alt p-3 rounded-input border border-input">
                  <label className="block text-[10px] font-semibold text-ink-3 mb-1">Time End</label>
                  <input type="time" name="timeEnd" value={formData.timeEnd} onChange={handleInputChange} className="bg-transparent w-full font-mono text-lg font-semibold text-ink outline-none" />
                </div>
                <div className="bg-surface-alt p-3 rounded-input border border-input">
                  <label className="block text-[10px] font-semibold text-ink-3 mb-1">Max Pressure (bar)</label>
                  <input type="number" step="0.1" name="pressure" value={formData.pressure} onChange={handleInputChange} className="bg-transparent w-full font-mono text-lg font-semibold text-ink outline-none" placeholder="0.0" />
                </div>
                <div className="bg-code-c/10 p-3 rounded-input border border-code-c/30">
                  <label className="block text-[10px] font-semibold text-code-c mb-1">Grout Volume (litre)</label>
                  <input type="number" step="0.1" name="volumeLitre" value={formData.volumeLitre} onChange={handleInputChange} className="bg-transparent w-full font-mono text-lg font-semibold text-ink outline-none" placeholder="0" />
                </div>
              </div>
            </div>
          )}

          {/* Part A / Part B / Pressure (primary) */}
          {!isSecondary && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface-alt p-3 rounded-input border border-input">
              <label className="block text-[10px] font-semibold text-ink-3 mb-1">Part A</label>
              <input type="number" step="0.01" name="partA" value={formData.partA} onChange={handleInputChange} className="bg-transparent w-full font-mono text-lg font-semibold text-ink outline-none" placeholder="0.00" />
            </div>
            <div className="bg-surface-alt p-3 rounded-input border border-input">
              <label className="block text-[10px] font-semibold text-ink-3 mb-1">Part B</label>
              <input type="number" step="0.01" name="partB" value={formData.partB} onChange={handleInputChange} className="bg-transparent w-full font-mono text-lg font-semibold text-ink outline-none" placeholder="0.00" />
            </div>
            <div className="bg-surface-alt p-3 rounded-input border border-input">
              <label className="block text-[10px] font-semibold text-ink-3 mb-1">Pressure (bar)</label>
              <input type="number" step="0.1" name="pressure" value={formData.pressure} onChange={handleInputChange} className="bg-transparent w-full font-mono text-lg font-semibold text-ink outline-none" placeholder="0.0" />
            </div>
          </div>
          )}

          {/* Total volume + Ratio (primary only — a secondary row's volume is the litre field above) */}
          {!isSecondary && (
          <div className="p-4 rounded-input flex justify-between items-center bg-cyan-tint border border-cyan-med/30">
            <div>
              <span className="block text-[10px] font-semibold text-cyan-med">Total Volume</span>
              <div className="text-2xl font-semibold text-ink font-mono">{String(currentTotal)} m³</div>
            </div>
            <div className="text-right">
              <span className="block text-[10px] font-semibold text-cyan-med">Ratio</span>
              <div className={`text-2xl font-semibold font-mono ${Number(displayRatio) > 150 ? "text-cyan-med" : Number(displayRatio) >= 100 ? "text-sgreen-dark" : "text-code-d"}`}>{String(displayRatio)}%</div>
            </div>
          </div>
          )}

          {/* Remark & Photo */}
          <div className="bg-white p-4 border border-line rounded-input shadow-card">
            <textarea name="remark" value={formData.remark} onChange={handleInputChange} rows="2" className="w-full bg-surface-alt border border-input p-3 rounded-input text-sm outline-none focus:border-navy focus:ring-2 focus:ring-cyan-tint transition-all text-ink" placeholder={isSecondary ? "Remark (Grouting) — หมายเหตุการอัดน้ำปูน" : "Problem / Remark (อุปสรรค)"}></textarea>
            <div className="mt-3 pt-3 border-t border-line">
              <label className="text-[10px] font-semibold text-ink-3 mb-2 flex items-center gap-1"><Camera size={12} /> Attach Photo</label>
              <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, setFormData)} className="text-xs text-ink-3 w-full file:mr-4 file:py-1.5 file:px-4 file:rounded-badge file:border-0 file:bg-cyan-tint file:text-navy" />
            </div>
          </div>

          {/* Submit */}
          <StickyActionBar>
            <button type="submit" disabled={isSaving} className={`w-full text-white font-semibold py-4 rounded-input flex justify-center items-center gap-2 shadow-card transition-transform active:scale-95 ${isSaving ? 'bg-ink-3' : isSecondary ? 'bg-code-c' : 'bg-navy'}`}>
              {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} {isSecondary ? "Save Secondary Grout" : "Confirm & Save Record"}
            </button>
          </StickyActionBar>
        </div>
      </form>
    </div>
  );
};

export default GroutRecordView;
