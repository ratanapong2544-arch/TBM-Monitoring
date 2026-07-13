// Task R4c — dashboard LocationCard: top banner (REF/STA, name+type, status, TBM-distance, progress,
// View Details) wrapping the REUSED R3a components as-is. Full-fidelity port of tunnel-monitoring's
// DataGrid.tsx:270-659 (LocationCard), navy reskin. See .superpowers/sdd/R4-source-map.md §2.2/§2.3/
// §2.6 and .superpowers/sdd/task-R4c-brief.md.
//
// CRITICAL (map §2.6): ScheduleTimeline + LongTermMonitoring (R3a) are dropped in AS-IS below — both
// already own their own `selectedSchedule` state and render their own <SchedReportModal> internally,
// so this card gets a modal-per-section "for free". Do NOT lift a confirmSched state here and do NOT
// mount a second/standalone modal (that's what source's DataGrid had to do at the grid level; target
// already solved this pattern once at R3d's InstrumentLocationView — this file just repeats it once
// per card instead of once per screen).
//
// Props contract: this component takes ONE location's ALREADY-FILTERED {location, schedules,
// instruments, tbmChainage} — same shape InstrumentLocationView.jsx (R3d) uses for a single location;
// R4d's grid is expected to build the locationId→{instruments,schedules} grouping once (map §3.3.1)
// and invoke this component N times, not pass project-wide arrays down.
import { useMemo } from "react";
import { Clock, MapPin, AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import ScheduleTimeline from "./ScheduleTimeline";
import LongTermMonitoring from "./LongTermMonitoring";
import { TYPE_ICON } from "./InstallationStatus";
import { tallyMeasurementProgress } from "../../utils/instrumentDashboard";
import {
  getOperationalChainage,
  hasActualInstallChainage,
  distanceDue,
  getLocationStatus,
} from "../../utils/instrumentSchedule";
import { stationLabel } from "../../utils/chainageAdapter";

// Taxonomy chip labels (DataGrid.tsx:133-138 LOCATION_TYPE_LABEL) — same English labels already used
// by DashboardToolbar's filter pills (R4b), kept consistent across the dashboard.
const TYPE_LABEL = {
  SHAFT: "Shaft",
  BRIDGE: "Bridge",
  ABOVE_TUNNEL: "Above Tunnel",
  SETTLEMENT_ONLY: "Settlement",
};

// getLocationStatus badge config — port of DataGrid.tsx:126-131 (STATUS_CONFIG), navy reskin.
// Navy decision (brief §navy / R4-source-map.md §5): ACTIVE deliberately does NOT reuse code-a —
// source overloads emerald for both "location currently active" and "schedule measured/done", which
// would read ambiguously here (a green pulsing badge could look like "already measured" when it
// actually means "TBM is here right now"). Uses a solid navy pulse instead, distinct from both
// SCHEDULED's light cyan-tint chip and COMPLETED's code-a chip.
const STATUS_CONFIG = {
  NOT_ACTIVE: { label: "Not Active", icon: Clock, badgeClass: "bg-surface-alt text-ink-3 border border-line" },
  SCHEDULED: {
    label: "Scheduled",
    icon: MapPin,
    badgeClass: "bg-cyan-tint text-navy border border-cyan/30 font-semibold",
  },
  ACTIVE: {
    label: "Active",
    icon: AlertTriangle,
    badgeClass:
      "bg-navy text-white border border-navy shadow-card ring-2 ring-navy/20 animate-pulse font-semibold",
  },
  COMPLETED: {
    label: "Completed",
    icon: CheckCircle2,
    badgeClass: "bg-code-a/10 text-code-a border border-code-a/30 font-semibold",
  },
};

export default function LocationCard({
  location,
  schedules = [],
  instruments = [],
  tbmChainage,
  onMark,
  onOpenLocation,
  readOnly = false,
}) {
  const operationalChainage = getOperationalChainage(location);
  const showInstallChainage = hasActualInstallChainage(location);
  const hasTbmPosition = tbmChainage != null && operationalChainage != null;
  const distance = hasTbmPosition ? operationalChainage - tbmChainage : null;

  const status = getLocationStatus(schedules, distance);
  const statusInfo = STATUS_CONFIG[status];
  const StatusIcon = statusInfo.icon;

  // N/A counts as measured (R4a decision, R4-source-map.md §1.2) — reuses the same tally fn
  // ComplianceCards uses project-wide, scoped here to just this location's already-filtered schedules.
  const { measured, total, percent } = tallyMeasurementProgress(schedules);

  const typeLabel = TYPE_LABEL[location?.type] ?? location?.type ?? "-";

  // (-50,0] ระยะ TBM ใกล้ถึงจุดนี้แล้ว — boundary เดียวกับ DataGrid.tsx:298 (isApproaching)
  const isApproaching = hasTbmPosition && distance > -50 && distance <= 0;

  // มี DISTANCE ที่ TBM ผ่าน trigger แล้วแต่ยังไม่วัด → ring แดง (code-d) รอบทั้งการ์ด (DataGrid.tsx:299)
  const hasPassedAndPending = (schedules || []).some((s) => !s.isMeasured && distanceDue(s, tbmChainage));

  // ป้ายระยะ TBM: เหมือน InstrumentLocationView.jsx's tbmDistanceLabel calc (2-3 บรรทัด ซ้ำโดยเจตนา —
  // ไม่มี shared export สำหรับ derived-display นี้อยู่แล้ว เหมือน precedent ของ instCounts memo ที่นั่น).
  let tbmDistanceLabel = "-";
  if (distance != null) {
    const r = Math.round(distance);
    tbmDistanceLabel = `${r >= 0 ? "+" : ""}${r} m`;
  }

  const instrumentTypeCounts = useMemo(() => {
    const counts = {};
    (instruments || []).forEach((inst) => {
      counts[inst.type] = (counts[inst.type] || 0) + 1;
    });
    return Object.entries(counts);
  }, [instruments]);

  if (!location) return null;

  return (
    <div
      className={`bg-surface rounded-card shadow-card border overflow-hidden transition-all ${
        hasPassedAndPending ? "border-code-d/40 ring-1 ring-code-d/30" : "border-line hover:shadow-hover"
      }`}
    >
      {/* Top banner (identifiers, status, TBM-distance, progress) — NEW code, port of DataGrid.tsx:363-437 */}
      <div className="bg-surface px-5 py-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line">
        <div className="flex items-center gap-4 sm:gap-6 flex-1 min-w-0">
          <div className="flex-shrink-0 h-14 w-14 rounded-card bg-surface-alt border border-line flex flex-col justify-center items-center">
            <span className="text-[10px] font-black text-ink-3 uppercase tracking-widest leading-none mb-0.5">
              {showInstallChainage ? "REF" : "STA"}
            </span>
            <span className="text-sm font-extrabold text-navy font-mono leading-none">
              {stationLabel(location.chainage)}
            </span>
          </div>

          <div className="flex flex-col items-start min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <h3 className="text-base sm:text-lg font-extrabold text-ink truncate">{location.name}</h3>
              <span className="px-2 py-0.5 rounded-badge text-[10px] font-black tracking-wide uppercase whitespace-nowrap bg-surface-alt text-ink-2 border border-line">
                {typeLabel}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm font-medium">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-input ${statusInfo.badgeClass}`}>
                <StatusIcon className="w-3.5 h-3.5" />
                {statusInfo.label}
              </span>

              <span className="text-line">|</span>

              <span
                className={`font-mono font-bold flex items-center gap-1.5 px-2 py-0.5 rounded-input border flex-shrink-0 w-fit ${
                  isApproaching ? "text-code-b bg-code-b/10 border-code-b/30" : "text-ink-2 bg-surface-alt border-line"
                }`}
              >
                TBM Dist: {tbmDistanceLabel}
                {isApproaching && (
                  <span className="flex h-2 w-2 relative ml-1">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-code-b opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-code-b" />
                  </span>
                )}
              </span>

              {showInstallChainage && (
                <>
                  <span className="text-line">|</span>
                  <span className="inline-flex items-center gap-1.5 rounded-input border border-cyan/30 bg-cyan-tint px-2 py-0.5 text-[11px] font-bold text-navy shadow-card">
                    Install STA {stationLabel(operationalChainage)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-start sm:items-end gap-3">
          <button
            type="button"
            onClick={() => onOpenLocation && onOpenLocation(location.id)}
            className="group inline-flex items-center gap-1.5 px-4 py-1.5 bg-cyan-tint hover:bg-navy text-navy hover:text-white rounded-input text-xs font-bold transition-all shadow-card"
          >
            View Details <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>

          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-code-a" />
              <span className="text-xs font-bold tracking-wider text-ink-2 uppercase">Meas. Progress</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-28 sm:w-36 h-3 bg-surface-alt rounded-full overflow-hidden shadow-inner border border-line">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    percent === 100 ? "bg-code-a" : hasPassedAndPending ? "bg-code-d" : "bg-navy"
                  }`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="text-sm font-mono font-black text-ink min-w-[36px] text-right">
                {measured}/{total}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Body: reused R3a sections (as-is, zero new timeline/modal code) + instruments mini-list */}
      <div className="bg-surface-alt p-4 sm:p-6 space-y-4">
        <ScheduleTimeline
          schedules={schedules}
          locationName={location.name}
          tbmChainage={tbmChainage}
          operationalChainage={operationalChainage}
          onMark={onMark}
          readOnly={readOnly}
        />

        <LongTermMonitoring schedules={schedules} locationName={location.name} onMark={onMark} readOnly={readOnly} />

        {/* Instruments mini-list (port of DataGrid.tsx:628-655) — grouped counts only, no click/modal */}
        {instrumentTypeCounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black tracking-widest text-ink-3 uppercase mr-2 border-r border-line pr-3">
              Inst. ({instruments.length})
            </span>
            {instrumentTypeCounts.map(([type, count]) => {
              const TypeIcon = TYPE_ICON[type];
              return (
                <div
                  key={type}
                  className="flex items-center gap-1.5 px-2 py-1 bg-surface border border-line rounded-input text-[9px] font-bold text-ink-2 shadow-card"
                >
                  {TypeIcon && <TypeIcon className="w-3 h-3 text-ink-2" />}
                  <span className="uppercase tracking-wide">{(type || "").replace("_", " ")}</span>
                  <span className="w-[1px] h-3 bg-line mx-0.5" />
                  <span className="text-navy font-black bg-cyan-tint px-1.5 rounded-badge">{count}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
