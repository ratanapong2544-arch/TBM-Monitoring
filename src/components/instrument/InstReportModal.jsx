// Task R3b — InstReportModal: installation report modal, DISPLAY-ONLY (write-light).
// Visual port from tunnel-monitoring's LocationDetailClient.tsx:824-910 (navy reskin), with the
// write-light decision applied: source is an EDIT modal (status selector + date picker + mock photo
// upload -> updateInstrumentStatus server action). Per task-R3b-brief.md this app version shows the
// same information (status / install date / photo / note) with NO editing affordance.
//
// ponytail: the 3-cell status grid below keeps source's exact visual shape (a status "selector") but
// drops onClick/useState — it just highlights the current status. Restoring mark-installed later is
// then a small diff (add setStatus + onClick here), not a rewrite. Mark-installed itself is
// deferred — see task-R3b-report.md — installation data today comes only from seed/PDF-ingest skill;
// writing it back needs a GAS round-trip through App.jsx's handleUpdateInstrument, which (per
// R1/Phase-7 ledger notes) must receive the FULL instrument object since GAS upsertById_ overwrites
// the whole row.
import { X, ImageOff } from "lucide-react";
import { formatLongTermDate } from "../../utils/instrumentSchedule";

// สถานะการติดตั้ง 3 แบบ (ตรง instrument.installStatus) — export ให้ InstallationStatus.jsx (list-row
// badge) ใช้ label/สีชุดเดียวกัน
export const INSTALL_STATUSES = ["PENDING", "INSTALLING", "INSTALLED"];
export const INSTALL_STATUS_LABEL = {
  PENDING: "รอดำเนินการ",
  INSTALLING: "กำลังดำเนินการ",
  INSTALLED: "ติดตั้งเสร็จสิ้น",
};
// สี navy ตามความหมาย (R3-source-map.md §8): emerald(INSTALLED)->code-a, blue(INSTALLING)->cyan, slate/rose(PENDING)->ink-3
export const INSTALL_STATUS_BADGE_CLS = {
  PENDING: "bg-line/40 text-ink-2",
  INSTALLING: "bg-cyan-tint text-cyan-med",
  INSTALLED: "bg-code-a/10 text-code-a",
};
const INSTALL_STATUS_SOLID_CLS = {
  PENDING: "bg-ink-3 text-white border-ink-3",
  INSTALLING: "bg-cyan-med text-white border-cyan-med",
  INSTALLED: "bg-code-a text-white border-code-a",
};

export default function InstReportModal({ inst, onClose }) {
  if (!inst) return null;
  const status = INSTALL_STATUSES.includes(inst.installStatus) ? inst.installStatus : "PENDING";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-navy-dark/50 backdrop-blur-sm animate-fade-in no-print">
      <div className="bg-surface rounded-modal w-full max-w-md shadow-modal overflow-hidden">
        <div className="px-6 py-4 bg-navy-dark text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-base">รายงานการติดตั้ง</h3>
            <p className="text-xs text-cyan-tint/80 font-medium mt-0.5">
              {inst.code} — {(inst.type || "").replace("_", " ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-ink-3 mb-2 block">สถานะการติดตั้ง</label>
            <div className="grid grid-cols-3 gap-2">
              {INSTALL_STATUSES.map((s) => (
                <div
                  key={s}
                  className={`py-2.5 text-[11px] font-bold rounded-xl border text-center ${
                    status === s ? INSTALL_STATUS_SOLID_CLS[s] : "bg-surface border-line text-ink-3"
                  }`}
                >
                  {s}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-ink-3 mt-1.5 font-medium">{INSTALL_STATUS_LABEL[status]}</p>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-ink-3 mb-2 block">วันที่ติดตั้ง</label>
            <div className="w-full px-4 py-3 bg-surface-alt border border-line rounded-xl text-sm font-bold text-ink">
              {inst.installedAt ? formatLongTermDate(inst.installedAt) : "ยังไม่ระบุ"}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-ink-3 mb-2 block">รูปถ่ายการติดตั้ง</label>
            {inst.installPhotoUrl ? (
              <div className="rounded-2xl overflow-hidden border border-line aspect-[4/3]">
                <img src={inst.installPhotoUrl} alt={`ภาพติดตั้ง ${inst.code}`} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-full aspect-[4/3] rounded-2xl border-2 border-dashed border-line flex flex-col items-center justify-center text-ink-3">
                <ImageOff className="w-6 h-6 mb-2" />
                <span className="text-sm font-bold">ยังไม่มีรูปถ่าย</span>
              </div>
            )}
          </div>

          {inst.note && (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-ink-3 mb-2 block">หมายเหตุ</label>
              <p className="w-full px-4 py-3 bg-surface-alt border border-line rounded-xl text-sm text-ink-2">{inst.note}</p>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 bg-surface-alt hover:bg-line/60 text-ink rounded-xl font-bold text-sm transition"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
