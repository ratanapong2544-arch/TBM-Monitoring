import React, { useState } from "react";
import { ArrowLeft, Pencil, Trash2, X, ImagePlus, FileText, Loader2 } from "lucide-react";
import { EQUIPMENT, LABOR, WEATHER_SLOTS, WEATHER_CONDITIONS } from "../../utils/dailyReportSchema";
import { checkHelper, buildPdf, downloadBundle, openPdfBlob } from "../../utils/pdfBridge";

const condLabel = (k) => (WEATHER_CONDITIONS.find((c) => c.key === k) || {}).label || k;

export default function DailyReportDetail({ report, onBack, onEdit, onDelete }) {
  const [photos, setPhotos] = useState([]);
  const [screenshot, setScreenshot] = useState(null);
  const [building, setBuilding] = useState(false);
  const [buildMsg, setBuildMsg] = useState("");

  const readDataUrl = (file) => new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  });
  const addPhotos = async (fl) => { const u = (await Promise.all([...fl].map(readDataUrl))).filter(Boolean); setPhotos((p) => [...p, ...u]); };
  const removePhoto = (i) => setPhotos((p) => p.filter((_, j) => j !== i));
  const onShot = async (f) => setScreenshot(f ? await readDataUrl(f) : null);

  const handleBuildPdf = async () => {
    setBuilding(true); setBuildMsg("");
    try {
      if (!(await checkHelper())) throw new Error("helper offline");
      const blob = await buildPdf(report, photos, screenshot);
      openPdfBlob(blob);
      setBuildMsg("สร้าง PDF สำเร็จ — เปิดในแท็บใหม่แล้ว");
    } catch (e) {
      downloadBundle(report, photos, screenshot);
      setBuildMsg("ไม่พบ helper — ดาวน์โหลดไฟล์ bundle ให้แล้ว รัน: python build_report.py --bundle <ไฟล์> --out report.pdf  (หรือเปิด python server.py แล้วลองใหม่)");
    } finally {
      setBuilding(false);
    }
  };

  const eqFilled = EQUIPMENT.filter((c) => report.equipment && report.equipment[c.key] != null && report.equipment[c.key] !== "");
  const lbFilled = LABOR.filter((c) => report.labor && report.labor[c.key] != null && report.labor[c.key] !== "");
  const wx = WEATHER_SLOTS.filter((s) => report.weather && report.weather[s]);
  const chip = "inline-block bg-surface-alt border border-line rounded-badge px-2 py-0.5 text-xs text-ink-2 mr-1 mb-1";

  return (
    <div className="bg-surface rounded-card border border-line shadow-card overflow-hidden">
      <div className="bg-navy-dark px-5 py-4 text-white flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-input"><ArrowLeft size={15} /> กลับ</button>
        <h2 className="font-semibold text-base sm:text-lg truncate">{report.area || "(ไม่ระบุพื้นที่)"} · {report.date}{report.machine ? ` · ${report.machine}` : ""}</h2>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => onEdit(report)} className="inline-flex items-center gap-1.5 text-sm font-semibold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-input"><Pencil size={14} /> แก้ไข</button>
          <button type="button" onClick={() => onDelete(report.id)} className="p-2 bg-white/10 hover:bg-code-d/40 rounded-full"><Trash2 size={16} /></button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {wx.length > 0 && <div><div className="text-xs font-bold text-navy mb-1">สภาพอากาศ</div>{wx.map((s) => <span key={s} className={chip}>{s}:00 {condLabel(report.weather[s])}</span>)}</div>}
        {eqFilled.length > 0 && <div><div className="text-xs font-bold text-navy mb-1">เครื่องจักร</div>{eqFilled.map((c) => <span key={c.key} className={chip}>{c.label}: {report.equipment[c.key]}</span>)}</div>}
        {lbFilled.length > 0 && <div><div className="text-xs font-bold text-navy mb-1">แรงงาน</div>{lbFilled.map((c) => <span key={c.key} className={chip}>{c.label}: {report.labor[c.key]}</span>)}</div>}
        <div>
          <div className="text-xs font-bold text-navy mb-1">บันทึกการทำงาน</div>
          {report.kind === "excavation"
            ? <pre className="whitespace-pre-wrap font-mono text-xs text-ink-2 bg-surface-alt border border-line rounded-input p-3">{report.workLogText || "-"}</pre>
            : <ul className="text-sm text-ink-2 list-disc pl-5">{(report.workLog || []).filter((it) => it.title).map((it) => <li key={it.id}>{it.title}{it.total ? ` (${it.done}/${it.total})` : ""}</li>)}</ul>}
        </div>
        {(report.problems || report.solutions) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {report.problems && <div><div className="text-xs font-bold text-code-d mb-1">ปัญหา/อุปสรรค</div><p className="text-sm text-ink-2 whitespace-pre-wrap">{report.problems}</p></div>}
            {report.solutions && <div><div className="text-xs font-bold text-sgreen-dark mb-1">แนวทางแก้ไข</div><p className="text-sm text-ink-2 whitespace-pre-wrap">{report.solutions}</p></div>}
          </div>
        )}

        <div className="border-t border-line-divider pt-4">
          <div className="text-sm font-bold text-navy mb-2">เอกสารแนบ + สร้าง PDF</div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-ink-2 block mb-1">รูปหน้างาน (เลือกได้หลายรูป)</label>
              <label className="inline-flex items-center gap-1.5 bg-cyan-tint text-navy px-3 py-1.5 rounded-input text-xs font-semibold cursor-pointer hover:opacity-90">
                <ImagePlus size={14} /> เพิ่มรูป
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
              </label>
              {photos.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {photos.map((src, i) => (
                    <div key={i} className="relative">
                      <img src={src} alt={`p${i}`} className="w-16 h-16 object-cover rounded-input border border-line" />
                      <button type="button" onClick={() => removePhoto(i)} className="absolute -top-1.5 -right-1.5 bg-code-d text-white rounded-full p-0.5"><X size={11} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-2 block mb-1">Screenshot dashboard (เซฟจากหน้า Stats Report "เซฟรูปภาพ")</label>
              <input type="file" accept="image/*" onChange={(e) => onShot(e.target.files[0])} className="text-xs" />
              {screenshot && <img src={screenshot} alt="shot" className="w-32 h-auto rounded-input border border-line mt-2" />}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 bg-surface-alt border-t border-line flex items-center justify-end gap-2 flex-wrap">
        <span className="text-xs text-ink-2 mr-auto max-w-[60%]">{buildMsg}</span>
        <button type="button" onClick={handleBuildPdf} disabled={building} className="px-4 py-2.5 bg-sgreen-dark text-white rounded-input text-sm font-semibold inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow-card">{building ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />} สร้าง PDF</button>
      </div>
    </div>
  );
}
