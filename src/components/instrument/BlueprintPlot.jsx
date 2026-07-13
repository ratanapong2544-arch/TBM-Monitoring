// Task R3c — Blueprint install-view: banner (INSTRUMENT PLAN / Ref STA / Install STA / Page) + pins
// shaped by instrument type and colored by installStatus + photo callout + legend. Full-fidelity
// display-path port from tunnel-monitoring's LocationDetailClient.tsx BlueprintPane (535-776) —
// navy reskin, edit-coordinates mode CUT entirely (write-light: no Edit Positions button, no
// batchUpdateInstrumentCoordinates). Was v1 Task 6.2 (colored pins by *measurement* status only);
// this replaces that with the source's install-view (shape = type, color = installStatus).
//
// Reuses R3b's InstReportModal exports (INSTALL_STATUSES/INSTALL_STATUS_LABEL/INSTALL_STATUS_BADGE_CLS)
// for the status list, Thai labels, and the soft badge tint (callout label pill + photo-empty tint) —
// per task-R3c-brief.md "reuse status/color maps, อย่าเขียน map ซ้ำ". INSTALL_STATUS_BADGE_CLS is a
// soft tint designed for text badges/chips; a solid map for the pins/legend dots (needs to read
// clearly against the blueprint image, matching source's solid marker/legend treatment) is NOT
// exported by InstReportModal.jsx, so STATUS_ACCENT below is a small local companion — same 3-status
// semantic already established in InstallationStatus.jsx's STATUS_DOT_CLS and InstReportModal.jsx's
// (unexported) INSTALL_STATUS_SOLID_CLS, not a redefinition of the exported badge map.
import { useState } from "react";
import { Map as MapIcon, Camera, Triangle, Plus } from "lucide-react";
import { INSTALL_STATUSES, INSTALL_STATUS_LABEL, INSTALL_STATUS_BADGE_CLS } from "./InstReportModal";
import { formatLongTermDate, hasActualInstallChainage } from "../../utils/instrumentSchedule";
import { stationLabel } from "../../utils/chainageAdapter";

// source's hardcoded fallback page when neither this location's instruments nor the pool resolve one
// (LocationDetailClient.tsx:537) — faithfully preserved, including the quirk that a location with zero
// blueprintPage data still renders page 26 (see task-R3c-report.md).
const DEFAULT_BLUEPRINT_PAGE = 26;

const TYPE_NOTE_LABEL = {
  INCLINOMETER: "Inclinometer",
  EXTENSOMETER: "Extensometer",
  PIEZOMETER: "VW Piezometer",
  SETTLEMENT_POINT: "Settlement Point",
};

// solid/translucent accent per installStatus — see file-header note on why this isn't reused from
// InstReportModal.jsx's (soft, text-badge-shaped) export.
const STATUS_ACCENT = {
  PENDING: { text: "text-ink-3", solidBg: "bg-ink-3", softBg: "bg-ink-3/30" },
  INSTALLING: { text: "text-cyan-med", solidBg: "bg-cyan-med", softBg: "bg-cyan-med/30" },
  INSTALLED: { text: "text-code-a", solidBg: "bg-code-a", softBg: "bg-code-a/30" },
};

function resolveStatus(installStatus) {
  return INSTALL_STATUSES.includes(installStatus) ? installStatus : "PENDING";
}

// หมุดวงกลม/สี่เหลี่ยม = ตัวมันเองมีพื้น+ขอบ (INC/EXT); หมุดสามเหลี่ยม/บวก = ไอคอนล้วน ไม่มีพื้นหลัง (PI/SS)
function isShapeMarker(type) {
  return type === "INCLINOMETER" || type === "EXTENSOMETER";
}

function Pin({ inst, isOpen, onToggle, onSelectInstrument }) {
  const status = resolveStatus(inst.installStatus);
  const accent = STATUS_ACCENT[status];
  const badgeCls = INSTALL_STATUS_BADGE_CLS[status];
  const dateLabel = inst.installedAt ? formatLongTermDate(inst.installedAt) : null;
  const locLabel = inst.locName || inst.locationName || null;

  return (
    <div
      className="absolute z-10 group hover:z-40"
      style={{ left: `${inst.blueprintX}%`, top: `${inst.blueprintY}%` }}
      onClick={(e) => e.stopPropagation()}
    >
      {isOpen && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 cursor-pointer transition-transform hover:scale-105"
          onClick={() => onSelectInstrument && onSelectInstrument(inst)}
        >
          <div className={`text-[8px] font-bold text-center px-1.5 py-0.5 rounded-t-badge whitespace-nowrap ${badgeCls}`}>
            {locLabel && (
              <>
                <span className="opacity-70 mr-1">{locLabel}</span>
                <br />
              </>
            )}
            {INSTALL_STATUS_LABEL[status]}
            {dateLabel && (
              <>
                <br />
                {dateLabel}
              </>
            )}
          </div>
          <div className={`w-14 h-10 border-2 border-current overflow-hidden rounded-b-badge shadow-md ${accent.text}`}>
            {inst.installPhotoUrl ? (
              <img src={inst.installPhotoUrl} className="w-full h-full object-cover" alt={inst.code} />
            ) : (
              <div className={`w-full h-full flex items-center justify-center ${badgeCls}`}>
                <Camera className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
          <div className={`w-[2px] h-2 mx-auto ${accent.solidBg}`} />
        </div>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(inst.id);
        }}
        title={inst.code}
        className={
          isShapeMarker(inst.type)
            ? `-translate-x-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center border-2 border-current shadow-sm transition-transform hover:scale-150 ${accent.text} ${accent.softBg} ${inst.type === "INCLINOMETER" ? "rounded-full" : "rounded-sm"}`
            : `-translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-transform hover:scale-150 ${accent.text}`
        }
      >
        {inst.type === "PIEZOMETER" && (
          <Triangle className="w-5 h-5" strokeWidth={2.5} fill="currentColor" fillOpacity={0.3} />
        )}
        {inst.type === "SETTLEMENT_POINT" && <Plus className="w-5 h-5" strokeWidth={4} />}
        {!isOpen && (
          <span className="pointer-events-none absolute top-1/2 left-full ml-1.5 -translate-y-1/2 whitespace-nowrap rounded bg-navy-dark/80 px-1 text-[8px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
            {inst.code}
          </span>
        )}
      </button>
    </div>
  );
}

function Legend() {
  return (
    <div className="absolute bottom-6 left-6 z-20 space-y-1.5 rounded-card border border-line bg-surface p-3 text-[10px] font-bold shadow-card">
      <p className="mb-1 border-b border-line pb-1 uppercase tracking-widest text-ink-3">Instrument Note</p>
      <div className="flex items-center gap-2 text-ink-2">
        <span className="h-3 w-3 rounded-full border-2 border-ink-3" /> {TYPE_NOTE_LABEL.INCLINOMETER}
      </div>
      <div className="flex items-center gap-2 text-ink-2">
        <span className="h-3 w-3 rounded-sm border-2 border-ink-3" /> {TYPE_NOTE_LABEL.EXTENSOMETER}
      </div>
      <div className="flex items-center gap-2 text-ink-2">
        <span className="flex h-3 w-3 items-center justify-center text-ink-3">
          <Triangle className="h-4 w-4" strokeWidth={2} fill="currentColor" fillOpacity={0.3} />
        </span>
        {TYPE_NOTE_LABEL.PIEZOMETER}
      </div>
      <div className="flex items-center gap-2 text-ink-2">
        <span className="flex h-3 w-3 items-center justify-center text-ink-3">
          <Plus className="h-4 w-4" strokeWidth={3} />
        </span>
        {TYPE_NOTE_LABEL.SETTLEMENT_POINT}
      </div>
      <div className="mt-1.5 space-y-1 border-t border-line pt-1.5">
        <div className="flex items-center gap-2 text-ink-2">
          <span className={`h-3 w-3 rounded-full ${STATUS_ACCENT.INSTALLED.solidBg}`} /> {INSTALL_STATUS_LABEL.INSTALLED}
        </div>
        <div className="flex items-center gap-2 text-ink-2">
          <span className={`h-3 w-3 rounded-full ${STATUS_ACCENT.PENDING.solidBg}`} /> {INSTALL_STATUS_LABEL.PENDING}
        </div>
        <div className="flex items-center gap-2 text-ink-2">
          <span className={`h-3 w-3 rounded-full ${STATUS_ACCENT.INSTALLING.solidBg}`} /> {INSTALL_STATUS_LABEL.INSTALLING}
        </div>
      </div>
    </div>
  );
}

// allInstruments (optional) = ทั้งโครงการ, ใช้ derive หมุด cross-location (เครื่องทุกตัวที่ใช้ blueprintPage
// เดียวกัน ไม่จำกัดแค่ location นี้ — R3-source-map.md §7). ไม่ส่งมา = fallback ใช้แค่ instruments ที่ให้.
export default function BlueprintPlot({ location = null, instruments = [], allInstruments, onSelectInstrument }) {
  const [activeCalloutId, setActiveCalloutId] = useState(null);

  const page = instruments.find((i) => i.blueprintPage != null)?.blueprintPage ?? DEFAULT_BLUEPRINT_PAGE;
  const pool = allInstruments ?? instruments;
  const blueprintInstruments = pool.filter(
    (i) => i.blueprintPage === page && i.blueprintX !== "" && i.blueprintX != null && i.blueprintY !== "" && i.blueprintY != null
  );
  const showInstallSta = hasActualInstallChainage(location);

  return (
    <div className="relative flex w-full flex-col">
      {/* Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-card border border-line bg-surface px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="shrink-0 rounded-lg border border-cyan/30 bg-cyan-tint p-1.5">
            <MapIcon className="h-4 w-4 text-navy" />
          </div>
          <span className="text-sm font-extrabold text-ink">
            INSTRUMENT PLAN{location?.name ? ` — ${location.name}` : ""}
          </span>
          {location && (
            <span className="ml-1 text-xs font-medium text-ink-3">
              Ref STA {stationLabel(location.chainage)}
              {showInstallSta ? ` | Install STA ${stationLabel(location.actualChainage)}` : ""}
            </span>
          )}
        </div>
        <span className="text-[10px] font-bold text-ink-3">Page {page}</span>
      </div>

      {/* Blueprint area */}
      <div className="relative rounded-b-card border border-t-0 border-line bg-surface-alt">
        <div className="relative w-full px-2 py-4">
          <div className="relative w-full" onClick={() => setActiveCalloutId(null)}>
            <img src={`/blueprints/page_${page}.png`} alt={`Blueprint page ${page}`} className="block h-auto w-full" />

            {blueprintInstruments.map((inst) => (
              <Pin
                key={inst.id}
                inst={inst}
                isOpen={activeCalloutId === inst.id}
                onToggle={(id) => setActiveCalloutId((cur) => (cur === id ? null : id))}
                onSelectInstrument={onSelectInstrument}
              />
            ))}

            <Legend />
          </div>
        </div>
      </div>
    </div>
  );
}
