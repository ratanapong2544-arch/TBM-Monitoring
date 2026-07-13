// Task R3d — location detail shell: the sub-task where every R3 piece gets assembled into the full
// screen. Header (back + name + STA + quick-stat chips) → ScheduleTimeline (R3a) → LongTermMonitoring
// (R3a) → grid(InstallationStatus (R3b) ⟷ LocationRightPane BLUEPRINT/CHART (R3c)). Each section owns
// its own modal (SchedReportModal via R3a, InstReportModal via R3b) — this view only derives the
// header numbers and places components; no modal state is lifted here (R3a concern 1 / R3b concern 2).
//
// Per R3c's heads-up (task-R3d-brief.md §Heads-up / task-R3c-report.md concern 3): BlueprintPlot's
// callout uses stopPropagation and isn't wired to a second modal — `onSelectInstrument` is intentionally
// left unset on LocationRightPane so the callout just shows in place; InstallationStatus already owns
// InstReportModal for instrument detail.
import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import ScheduleTimeline from "../instrument/ScheduleTimeline";
import LongTermMonitoring from "../instrument/LongTermMonitoring";
import InstallationStatus from "../instrument/InstallationStatus";
import LocationRightPane from "../instrument/LocationRightPane";
import { currentChainage, stationLabel } from "../../utils/chainageAdapter";
import { getOperationalChainage, hasActualInstallChainage, scheduleStatus } from "../../utils/instrumentSchedule";

function HeaderChip({ label, value, tone = "neutral" }) {
  const toneCls = tone === "alert" ? "bg-code-d/10 border-code-d/30 text-code-d" : "bg-cyan-tint border-cyan/30 text-navy";
  return (
    <div className={`flex flex-col items-center px-3 py-1.5 rounded-xl border min-w-[84px] ${toneCls}`}>
      <span className="text-[9px] font-black uppercase tracking-wider opacity-70">{label}</span>
      <span className="text-sm font-black font-mono">{value}</span>
    </div>
  );
}

export default function InstrumentLocationView({
  location = null,
  instruments = [],
  allInstruments = [],
  readings = [],
  thresholds = [],
  schedules = [],
  machineProgress = null,
  activeMachine = "TBM1",
  onMark,
  onBack,
  readOnly = false,
}) {
  const locationSchedules = useMemo(
    () => (location ? schedules.filter((s) => String(s.locationId) === String(location.id)) : []),
    [schedules, location]
  );

  // Reached only from the machine-scoped dashboard (InstrumentDashboardView), so activeMachine
  // already matches this location's own zone — no re-derivation via locationMachine needed here.
  // R7b gate: currentChainage's CH_EXCAV_START − dist formula is valid only for TBM1 (chainage
  // decreasing); TBM2 increases from IS04 and its launch CH/direction is undefined, so a computed
  // TBM2 position would be wrong-direction. Show it as unavailable (null → "-") rather than wrong.
  const tbmChainage = activeMachine === "TBM1" ? currentChainage(machineProgress, activeMachine) : null;
  const operationalChainage = getOperationalChainage(location);
  const hasTbmPosition = tbmChainage != null && operationalChainage != null;
  // ระยะ TBM ถึงจุด (ม.) — ลบ = TBM ยังไม่ถึง (สอดคล้อง sign convention เดียวกับ ScheduleTimeline/isTbmHere:
  // chainage ลดลงเมื่อเจาะหน้า), บวก = ผ่านจุดนี้ไปแล้ว. ไม่ reuse formatOffsetLabel เพราะฟังก์ชันนั้นมี
  // special-case (SHAFT IS04 → +|offset| เสมอ) ที่ใช้ได้กับ "ป้ายชื่อ node" เท่านั้น ไม่ใช่ "ระยะ TBM" นี้
  const tbmDistance = hasTbmPosition ? operationalChainage - tbmChainage : null;
  let tbmDistanceLabel = "-";
  if (tbmDistance != null) {
    const r = Math.round(tbmDistance);
    // source (page.tsx:190) นำหน้าด้วย + เสมอเมื่อ >= 0 (รวม 0 → "+0 m"); ค่าลบมี - ของตัวเลขเองอยู่แล้ว
    tbmDistanceLabel = `${r >= 0 ? "+" : ""}${r} m`;
  }

  // instCounts: ports the same installed/total shape as InstallationStatus.jsx's own memo (not
  // exported from there, so re-derived here for the header chip — same 2-line calc, no new concept)
  const instCounts = useMemo(() => {
    const total = instruments.length;
    const installed = instruments.filter((i) => i.installStatus === "INSTALLED").length;
    return { installed, total };
  }, [instruments]);

  const measuredCount = useMemo(() => locationSchedules.filter((s) => s.isMeasured).length, [locationSchedules]);
  // Action Req = จำนวนวาระที่ "ต้องลงมือวัดตอนนี้" (ไม่ใช่แค่ค้าง). แยกตามชนิดตาม source (page.tsx:91-98 pendingSched):
  //   DISTANCE  → actionable เมื่อ TBM ผ่านจุด trigger แล้วและยังไม่วัด (status "due")
  //   LONG_TERM → actionable เฉพาะเมื่อ effective target date มาถึงแล้ว (status "overdue"); ช่วง "due" คือ
  //               "รอในหน้าต่างเวลา" ยังไม่ต้องลงมือ จึงไม่นับ — ไม่งั้น chip แดงจะโกหกตลอด window (เช่น 180 วัน)
  // ต้องส่ง locationSchedules เป็น allSchedules ให้ scheduleStatus คำนวณ effective target ของ LONG_TERM ได้
  const actionReq = useMemo(() => {
    const now = new Date().toISOString();
    return locationSchedules.filter((s) => {
      const st = scheduleStatus(s, tbmChainage, now, locationSchedules);
      if (s.scheduleType === "LONG_TERM") return st === "overdue";
      return st === "due" || st === "overdue";
    }).length;
  }, [locationSchedules, tbmChainage]);

  if (!location) {
    return (
      <div className="p-6 text-ink-2">
        ไม่พบจุดตรวจวัด{" "}
        <button className="text-navy underline" onClick={onBack}>
          กลับ
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-full mx-auto space-y-6 animate-fade-in pb-24">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="p-2 rounded-input hover:bg-cyan-tint shrink-0">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h2 className="font-semibold text-ink text-lg truncate">{location.name}</h2>
            <p className="text-ink-2 text-sm">
              Ref STA {stationLabel(location.chainage)}
              {hasActualInstallChainage(location) ? ` · Install STA ${stationLabel(location.actualChainage)}` : ""}
              {` · ${instruments.length} เครื่อง`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <HeaderChip label="TBM Distance" value={tbmDistanceLabel} />
          <HeaderChip label="Installed" value={`${instCounts.installed}/${instCounts.total}`} />
          <HeaderChip label="Measured" value={`${measuredCount}/${locationSchedules.length}`} />
          <HeaderChip label="Action Req" value={actionReq} tone={actionReq > 0 ? "alert" : "neutral"} />
        </div>
      </div>

      <ScheduleTimeline
        schedules={locationSchedules}
        locationName={location.name}
        tbmChainage={tbmChainage}
        operationalChainage={operationalChainage}
        onMark={onMark}
        readOnly={readOnly}
      />

      <LongTermMonitoring schedules={locationSchedules} locationName={location.name} onMark={onMark} readOnly={readOnly} />

      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 flex flex-col">
          <InstallationStatus instruments={instruments} />
        </div>
        <div className="lg:col-span-8">
          <LocationRightPane
            location={location}
            instruments={instruments}
            allInstruments={allInstruments}
            readings={readings}
            thresholds={thresholds}
            machineProgress={machineProgress}
            activeMachine={activeMachine}
          />
        </div>
      </div>
    </div>
  );
}
