import React, { useState } from "react";
import { Printer, Sparkles, AlertCircle, X, Loader2, Check, Copy } from "lucide-react";
import { generateGeminiSummary } from "../../utils/api";
import { fitAndPrint } from "../../utils/printFit";

const STD_ACTIVITIES = ["Excavation", "Segment Erection", "Locomotive / Rail System", "Survey", "Other 1", "Other 2"];

function getDuration(start, end) {
  if (!start || !end) return 0;
  let [h1, m1] = start.split(":").map(Number);
  let [h2, m2] = end.split(":").map(Number);
  let mins1 = h1 * 60 + m1, mins2 = h2 * 60 + m2;
  if (mins2 < mins1) mins2 += 24 * 60;
  return mins2 - mins1;
}

export default function DashboardHeaderActions({ segmentRecords = [], groutRecords = [], shiftReports = [], isViewer = false }) {
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiSummaryText, setAiSummaryText] = useState("");
  const [copied, setCopied] = useState(false);

  const handleGenerateDelaySummary = async () => {
    setIsGeneratingAI(true);
    setShowAIModal(true);
    setAiSummaryText("");
    setCopied(false);

    const allRemarks = [
      ...segmentRecords.filter((s) => s.remark).map((s) => ({ ring: s.ringNo, module: "Segment", text: s.remark })),
      ...groutRecords.filter((g) => g.remark).map((g) => ({ ring: g.ringNo, module: "Grout", text: g.remark })),
    ];
    let delaySummary = {}, totalDelayMins = 0;
    (shiftReports || []).forEach((sr) => {
      Object.keys(sr.events || {}).forEach((activity) => {
        if (!STD_ACTIVITIES.includes(activity)) {
          let duration = sr.events[activity].reduce((acc, ev) => acc + getDuration(ev.start, ev.end), 0);
          if (duration > 0) { delaySummary[activity] = (delaySummary[activity] || 0) + duration; totalDelayMins += duration; }
        }
      });
    });
    const delayDetails = Object.entries(delaySummary).length > 0 ? Object.entries(delaySummary).map(([k, v]) => `- ${k}: ${v} นาที`).join("\n") : "- ไม่มีบันทึกเวลาหยุดชะงัก (Delay)";
    const remarksText = allRemarks.length > 0 ? allRemarks.map((r) => `- [${r.module} ring ${r.ring}] ${String(r.text)}`).join("\n") : "- ไม่มีปัญหาอุปสรรคที่ถูกบันทึก";

    const promptText = `อ้างอิงข้อมูลปัญหาและความล่าช้า:
ช่วงเวลา: ทั้งหมด (All)
Total Downtime: ${totalDelayMins} นาที

หมวดหมู่เวลาที่สูญเสีย:
${delayDetails}

ปัญหาเรื้อรังจากบันทึกหน้างาน (Remarks):
${remarksText}

คุณคือวิศวกรที่ปรึกษาอาวุโสด้านการขุดเจาะอุโมงค์ TBM ให้ความเห็นและวิเคราะห์สาเหตุ (Root Cause Analysis) แด่ผู้บริหาร
ห้ามใช้คำทักทาย ห้ามเขียนเป็นเรียงความ ให้ใช้ภาษาวิศวกรผู้เชี่ยวชาญที่มีความเป็นมนุษย์ โทนตื่นตัว มืออาชีพแต่เข้าใจง่าย และให้ข้อเสนอแนะที่ปฏิบัติได้จริง

รูปแบบที่ต้องการ:
📌 บทสรุปผู้บริหารย่อ (Overview)
[สรุปสั้นๆ 2-3 บรรทัด]

⚠️ การวิเคราะห์สาเหตุและความเชื่อมโยง (Root Cause & Insight)
- [วิเคราะห์เจาะลึกจาก Remarks และ Delay Time เรียงตามผลกระทบ]

💡 แผนปฏิบัติการและข้อเสนอแนะเชิงรุก (Proactive Action Plan)
- [แนะนำวิธีจัดการ/ป้องกัน]`;
    const sysPrompt = "คุณคือวิศวกรวิเคราะห์ข้อมูล TBM Consultant อาวุโส ภาษาแบบผู้เชี่ยวชาญที่มีความเป็นมนุษย์ กระชับ ตรงจุด จัดหน้าอ่านง่ายด้วย Bullet points";

    try {
      const resultText = await generateGeminiSummary(promptText, sysPrompt);
      setAiSummaryText(resultText);
    } catch (error) {
      setAiSummaryText("ขออภัย เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI กรุณาลองใหม่อีกครั้ง: " + error.message);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const copyToClipboard = () => {
    const textArea = document.createElement("textarea");
    textArea.value = aiSummaryText;
    document.body.appendChild(textArea);
    textArea.select();
    try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (err) { console.error("Failed to copy", err); }
    document.body.removeChild(textArea);
  };

  return (
    <>
      <div className="flex gap-2 shrink-0 print:hidden">
        {!isViewer && (
          <button onClick={() => fitAndPrint(document.getElementById("dashboard-print-root"), { orientation: "landscape", onePage: true })} className="bg-surface hover:bg-cyan-tint border border-line text-ink-2 hover:text-navy px-3 py-2 rounded-input flex items-center gap-1.5 font-semibold text-xs transition-colors active:scale-95 whitespace-nowrap">
            <Printer size={15} /> <span className="hidden sm:inline">ปริ้น PDF</span>
          </button>
        )}
        {!isViewer && (
          <button onClick={handleGenerateDelaySummary} disabled={isGeneratingAI} className="bg-gradient-to-r from-code-c to-code-d hover:opacity-90 text-white px-3 py-2 rounded-input flex items-center gap-1.5 font-semibold text-xs transition-all active:scale-95 whitespace-nowrap disabled:opacity-60">
            <Sparkles size={15} /> <span className="hidden sm:inline">วิเคราะห์ AI</span>
          </button>
        )}
      </div>

      {showAIModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 bg-navy-dark/60 backdrop-blur-md animate-fade-in no-print">
          <div className="bg-surface rounded-modal w-full max-w-2xl shadow-modal overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[90vh] border border-line">
            <div className="px-6 py-5 text-white flex justify-between items-center shrink-0 bg-navy-dark">
              <h3 className="font-semibold text-lg sm:text-xl flex items-center gap-3 tracking-tight"><AlertCircle size={24} className="text-cyan" /> AI Delay &amp; Issue Analysis</h3>
              <button onClick={() => setShowAIModal(false)} className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 sm:p-8 bg-surface-alt relative min-h-[200px] overflow-y-auto flex-1">
              {isGeneratingAI ? (
                <div className="flex flex-col items-center justify-center py-12 text-navy h-full gap-4">
                  <Loader2 size={48} className="animate-spin" />
                  <p className="font-semibold animate-pulse text-base sm:text-lg">AI Consultant กำลังวิเคราะห์ข้อมูลเชิงลึก...</p>
                </div>
              ) : (
                <div className="max-w-none text-ink whitespace-pre-wrap leading-relaxed font-medium">{aiSummaryText}</div>
              )}
            </div>
            {!isGeneratingAI && aiSummaryText && (
              <div className="bg-surface px-6 py-4 border-t border-line flex flex-col sm:flex-row justify-between items-center shrink-0 gap-4">
                <p className="text-[10px] sm:text-xs text-ink-3 font-semibold flex items-center gap-1.5 text-center sm:text-left"><Sparkles size={12} /> ข้อมูลประเมินโดย AI โปรดใช้วิจารณญาณร่วม</p>
                <button onClick={copyToClipboard} className="flex items-center justify-center gap-2 px-6 py-2.5 bg-navy-dark hover:bg-navy text-white rounded-input font-semibold text-sm transition-colors active:scale-95 w-full sm:w-auto">
                  {copied ? <Check size={18} className="text-sgreen-med" /> : <Copy size={18} />}
                  {copied ? "คัดลอกแล้ว!" : "คัดลอกการวิเคราะห์"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
