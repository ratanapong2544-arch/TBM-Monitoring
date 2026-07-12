// Task R3b — Installation Status panel: progress bar + legend + instrument list (left column of the
// location-detail grid). Full-fidelity port from tunnel-monitoring's LocationDetailClient.tsx:414-490
// (navy reskin; instCounts memo ported from source 192-197). Self-contained like R3a's timelines: owns
// `selectedInst` state and renders InstReportModal internally — R3d just drops
// <InstallationStatus instruments={...} /> into its `lg:col-span-4` grid column.
//
// Cut per write-light (admin CRUD, out of scope — see task-R3b-brief.md): the Settings-gear button
// that opened source's ManageInstrumentsModal (add/rename/delete instruments) is not rendered at all.
import { useMemo, useState } from "react";
import { Wrench, Activity, Layers, Droplets, MapPin, Image as ImageIcon } from "lucide-react";
import InstReportModal, { INSTALL_STATUSES, INSTALL_STATUS_BADGE_CLS } from "./InstReportModal";

// เดียวกับ ICON map ใน InstrumentReportTabs.jsx — คงไอคอนต่อชนิดเครื่องมือให้ตรงกันทั้งแอป
// exported: R4c's LocationCard mini-list reuses this exact map (R4-source-map.md §2.6/§5) instead of
// introducing a third icon vocabulary or raw emoji.
export const TYPE_ICON = { INCLINOMETER: Activity, EXTENSOMETER: Layers, PIEZOMETER: Droplets, SETTLEMENT_POINT: MapPin };
const STATUS_DOT_CLS = {
  PENDING: "bg-ink-3 ring-ink-3/30",
  INSTALLING: "bg-cyan-med ring-cyan-med/30",
  INSTALLED: "bg-code-a ring-code-a/30",
};

export default function InstallationStatus({ instruments = [] }) {
  const [selectedInst, setSelectedInst] = useState(null);

  // port ตรงจาก source instCounts memo (LocationDetailClient.tsx:192-197)
  const instCounts = useMemo(() => {
    const total = instruments.length;
    const installed = instruments.filter((i) => i.installStatus === "INSTALLED").length;
    const installing = instruments.filter((i) => i.installStatus === "INSTALLING").length;
    return { total, installed, installing, pending: total - installed - installing };
  }, [instruments]);

  const pct = instCounts.total > 0 ? (instCounts.installed / instCounts.total) * 100 : 0;

  return (
    <>
      <div className="bg-surface rounded-card shadow-card border border-line p-6 flex flex-col h-full min-h-0">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-xl bg-cyan-tint border border-cyan/30 shrink-0">
            <Wrench className="w-5 h-5 text-navy" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-ink tracking-tight">สถานะการติดตั้ง</h2>
            <p className="text-xs text-ink-2 font-medium">ความคืบหน้าและรายการเครื่องมือวัดที่จุดนี้</p>
          </div>
        </div>

        {/* Progress bar + legend */}
        <div className="mb-5">
          <div className="flex justify-between text-xs font-bold text-ink-2 mb-2">
            <span>ความคืบหน้า</span>
            <span className="text-ink">{instCounts.installed}/{instCounts.total} ติดตั้งแล้ว</span>
          </div>
          <div className="w-full h-3 bg-surface-alt rounded-full overflow-hidden border border-line shadow-inner">
            <div
              className="h-full bg-code-a rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex gap-4 mt-3 text-[10px] font-bold flex-wrap">
            <span className="flex items-center gap-1.5 text-ink-2">
              <span className="w-2.5 h-2.5 rounded-full bg-code-a" /> ติดตั้งแล้ว ({instCounts.installed})
            </span>
            <span className="flex items-center gap-1.5 text-ink-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-med" /> กำลังติดตั้ง ({instCounts.installing})
            </span>
            <span className="flex items-center gap-1.5 text-ink-2">
              <span className="w-2.5 h-2.5 rounded-full bg-ink-3" /> รอดำเนินการ ({instCounts.pending})
            </span>
          </div>
        </div>

        {/* Instrument list */}
        <div className="space-y-2 flex-1 overflow-y-auto pr-1">
          {instruments.map((inst) => {
            const status = INSTALL_STATUSES.includes(inst.installStatus) ? inst.installStatus : "PENDING";
            const TypeIcon = TYPE_ICON[inst.type];
            return (
              <button
                key={inst.id}
                type="button"
                onClick={() => setSelectedInst(inst)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-line hover:border-cyan hover:bg-cyan-tint/40 transition-all text-left"
              >
                <span className={`w-3.5 h-3.5 rounded-full ring-2 ring-offset-1 flex-shrink-0 ${STATUS_DOT_CLS[status]}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {TypeIcon && <TypeIcon className="w-3.5 h-3.5 text-ink-2 shrink-0" />}
                    <span className="text-sm font-bold text-ink truncate">{inst.code}</span>
                  </div>
                  <p className="text-[10px] text-ink-3 font-medium">{(inst.type || "").replace("_", " ")}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {inst.installPhotoUrl && <ImageIcon className="w-3.5 h-3.5 text-cyan-med" />}
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${INSTALL_STATUS_BADGE_CLS[status]}`}>
                    {status}
                  </span>
                </div>
              </button>
            );
          })}

          {instruments.length === 0 && (
            <div className="text-center py-8 text-ink-3">
              <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">ไม่มีเครื่องมือวัดที่จุดนี้</p>
            </div>
          )}
        </div>
      </div>

      {selectedInst && <InstReportModal inst={selectedInst} onClose={() => setSelectedInst(null)} />}
    </>
  );
}
