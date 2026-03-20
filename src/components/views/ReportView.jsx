import React, { useState, useMemo } from "react";
import { Sparkles, AlertCircle, X, Check, Copy, Download, Printer, Loader2 } from "lucide-react";
import { formatDisplayDate, formatDisplayTime, parseCH } from "../../utils/formatters";
import { getLogicalShiftDate, getRingNumeric, calculateSoilVolume, loadHtml2Canvas } from "../../utils/helpers";
import { generateGeminiSummary } from "../../utils/api";

const ReportView = ({ segmentRecords, groutRecords, projectInfo, shiftReports }) => {
  const [reportType, setReportType] = useState("daily");
  const [reportDate, setReportDate] = useState(new Date().toISOString().split("T")[0]);
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportShift, setReportShift] = useState("All");

  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiModalType, setAiModalType] = useState("executive");
  const [aiSummaryText, setAiSummaryText] = useState("");
  const [copied, setCopied] = useState(false);

  const deduplicatedSegments = useMemo(() => {
    const map = new Map();
    segmentRecords.forEach(rec => map.set(rec.ringNo, rec));
    return Array.from(map.values());
  }, [segmentRecords]);

  const filteredSegments = useMemo(() => {
    return deduplicatedSegments.filter((r) => {
      let exShift = r.excavShift;
      const extStart = formatDisplayTime(r.excavStartTime);
      if (!exShift && extStart) {
        const [h] = extStart.split(':').map(Number);
        exShift = (h >= 7 && h < 19) ? "Day" : "Night";
      } else if (!exShift) exShift = r.shift;

      let inShift = r.installShift;
      const instStart = formatDisplayTime(r.installStartTime || r.startTime);
      if (!inShift && instStart) {
        const [h] = instStart.split(':').map(Number);
        inShift = (h >= 7 && h < 19) ? "Day" : "Night";
      } else if (!inShift) inShift = r.shift;

      const exDate = getLogicalShiftDate(extStart, exShift, r.date, r.shift);
      const inDate = getLogicalShiftDate(instStart, inShift, r.date, r.shift);

      let matchEx = false;
      let matchIn = false;

      if (reportType === "daily") {
        matchEx = exDate === reportDate && (reportShift === "All" || exShift === reportShift);
        matchIn = inDate === reportDate && (reportShift === "All" || inShift === reportShift);
      } else if (reportType === "monthly") {
        matchEx = exDate.startsWith(reportMonth) && (reportShift === "All" || exShift === reportShift);
        matchIn = inDate.startsWith(reportMonth) && (reportShift === "All" || inShift === reportShift);
      }

      return matchEx || matchIn;
    });
  }, [deduplicatedSegments, reportType, reportDate, reportMonth, reportShift]);

  const filteredGrouts = useMemo(() => {
    return groutRecords.filter((r) => {
      const dDate = formatDisplayDate(r.date);
      if (reportShift !== "All" && r.shift !== reportShift) return false;
      if (reportType === "daily" && dDate !== reportDate) return false;
      if (reportType === "monthly" && !dDate.startsWith(reportMonth)) return false;
      return true;
    });
  }, [groutRecords, reportType, reportDate, reportMonth, reportShift]);

  const filteredShiftReports = useMemo(() => {
    if (!shiftReports) return [];
    return shiftReports.filter((r) => {
      const dDate = formatDisplayDate(r.date);
      if (reportShift !== "All" && r.shift !== reportShift) return false;
      if (reportType === "daily" && dDate !== reportDate) return false;
      if (reportType === "monthly" && !dDate.startsWith(reportMonth)) return false;
      return true;
    });
  }, [shiftReports, reportType, reportDate, reportMonth, reportShift]);

  const summary = useMemo(() => {
    const installedInShift = filteredSegments.filter((s) => {
      if (s.status === "In Progress") return false;
      const instStart = formatDisplayTime(s.installStartTime || s.startTime);
      let inShift = s.installShift;
      if (!inShift && instStart) {
        const [h] = instStart.split(':').map(Number);
        inShift = (h >= 7 && h < 19) ? "Day" : "Night";
      } else if (!inShift) inShift = s.shift;
      const inDate = getLogicalShiftDate(instStart, inShift, s.date, s.shift);

      if (reportType === "daily" && inDate !== reportDate) return false;
      if (reportType === "monthly" && !inDate.startsWith(reportMonth)) return false;
      if (reportShift !== "All" && inShift !== reportShift) return false;
      return true;
    });

    const excavatedInShift = filteredSegments.filter((s) => {
      const extStart = formatDisplayTime(s.excavStartTime);
      let exShift = s.excavShift;
      if (!exShift && extStart) {
        const [h] = extStart.split(':').map(Number);
        exShift = (h >= 7 && h < 19) ? "Day" : "Night";
      } else if (!exShift) exShift = s.shift;
      const exDate = getLogicalShiftDate(extStart, exShift, s.date, s.shift);

      if (reportType === "daily" && exDate !== reportDate) return false;
      if (reportType === "monthly" && !exDate.startsWith(reportMonth)) return false;
      if (reportShift !== "All" && exShift !== reportShift) return false;
      return true;
    });

    const permSegments = installedInShift.filter(s => s.installType !== "Temporary");
    const tempSegments = installedInShift.filter(s => s.installType === "Temporary");

    const segDay = permSegments.filter((s) => (s.installShift || s.shift) === "Day").length;
    const segNight = permSegments.filter((s) => (s.installShift || s.shift) === "Night").length;

    const totalLength = permSegments.reduce((sum, s) => sum + parseFloat(s.length || 0), 0);
    const totalSoilVol = excavatedInShift.reduce((sum, s) => sum + parseFloat(s.soilVolume || calculateSoilVolume(s.length)), 0);
    const totalGroutVol = filteredGrouts.reduce((sum, g) => sum + parseFloat(g.total || 0), 0);

    const avgGroutRatio = filteredGrouts.length > 0
      ? (filteredGrouts.reduce((sum, g) => sum + parseFloat(g.ratio || 0), 0) / filteredGrouts.length)
      : 0;
    const uniqueGroutedRings = new Set(filteredGrouts.map((g) => g.ringNo)).size;

    const allRemarks = [
      ...filteredSegments.filter((s) => s.remark).map((s) => ({ ring: s.ringNo, module: "Segment", text: s.remark })),
      ...filteredGrouts.filter((g) => g.remark).map((g) => ({ ring: g.ringNo, module: "Grout", text: g.remark })),
    ];

    return {
      permCount: permSegments.length,
      tempCount: tempSegments.length,
      totalSegments: installedInShift.length,
      segDay,
      segNight,
      totalLength: Number(totalLength || 0).toFixed(2),
      totalSoilVol: Number(totalSoilVol || 0).toFixed(2),
      totalGroutVol: Number(totalGroutVol || 0).toFixed(2),
      avgGroutRatio: Number(avgGroutRatio || 0).toFixed(1),
      uniqueGroutedRings,
      allRemarks,
    };
  }, [filteredSegments, filteredGrouts, reportShift, reportType, reportDate, reportMonth]);

  const displayDateStr = reportType === "daily"
    ? new Date(reportDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : new Date(reportMonth + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const handleDownloadImage = async () => {
    const element = document.getElementById("stats-report-container");
    if (!element) return;
    const inputs = element.querySelectorAll("input:not([type='radio']):not([type='checkbox']), textarea");
    const valuesMap = new Map();
    inputs.forEach((inp, i) => { inp.setAttribute('data-html2canvas-id', i); valuesMap.set(i.toString(), inp.value); });
    try {
      setIsExportingImage(true);
      const html2canvas = await loadHtml2Canvas();
      const canvas = await html2canvas(element, {
        scale: 2, backgroundColor: "#ffffff", useCORS: true, windowWidth: 1024,
        onclone: (clonedDoc) => {
          const clonedContainer = clonedDoc.getElementById("stats-report-container");
          if (!clonedContainer) return;
          clonedContainer.style.width = "1024px"; clonedContainer.style.maxWidth = "none";
          clonedContainer.querySelectorAll('.overflow-x-auto').forEach(el => el.style.overflow = 'visible');
          const clonedInputs = clonedContainer.querySelectorAll("input[data-html2canvas-id], textarea[data-html2canvas-id]");
          clonedInputs.forEach((input) => {
            const id = input.getAttribute('data-html2canvas-id');
            const val = valuesMap.get(id);
            const div = clonedDoc.createElement("div");
            div.innerText = val || "\u00A0";
            div.className = input.className;
            div.style.border = "none"; div.style.background = "transparent"; div.style.color = "black"; div.style.fontWeight = "bold"; div.style.display = "inline-flex"; div.style.alignItems = "center"; div.style.minHeight = "24px";
            if (input.classList.contains("text-right")) div.style.justifyContent = "flex-end";
            else if (input.classList.contains("text-center")) div.style.justifyContent = "center";
            else div.style.justifyContent = "flex-start";
            input.parentNode.replaceChild(div, input);
          });
        }
      });
      inputs.forEach(inp => inp.removeAttribute('data-html2canvas-id'));
      const link = document.createElement("a");
      link.download = `Stats_Report_${displayDateStr}.jpg`; link.href = canvas.toDataURL("image/jpeg", 0.9); link.click();
    } catch (error) { alert("เกิดข้อผิดพลาดในการสร้างรูปภาพ: " + error.message); } finally { setIsExportingImage(false); }
  };

  const handleGenerateAISummary = async () => {
    setIsGeneratingAI(true);
    setAiModalType("executive");
    setShowAIModal(true);
    setAiSummaryText("");
    setCopied(false);

    const installedInShift = [...filteredSegments].filter(s => s.status !== "In Progress" && s.installType !== "Temporary" && (reportShift === "All" || (s.installShift || s.shift) === reportShift)).sort((a, b) => getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo));
    const excavatedInShift = [...filteredSegments].filter(s => (reportShift === "All" || (s.excavShift || s.shift) === reportShift)).sort((a, b) => getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo));

    const segmentDetails = installedInShift.map(s => `${s.ringNo} (K${s.keyPos})`).join(', ') || '-';
    const excavRings = excavatedInShift.length > 0 ? (excavatedInShift.length === 1 ? excavatedInShift[0].ringNo : `${excavatedInShift[0].ringNo}-${excavatedInShift[excavatedInShift.length - 1].ringNo}`) : '-';

    let startCH = excavatedInShift.length > 0 ? excavatedInShift[0].startCH : '-';
    let finishCH = excavatedInShift.length > 0 ? excavatedInShift[excavatedInShift.length - 1].finishCH : '-';

    const sortedGrouts = [...filteredGrouts].sort((a, b) => getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo));
    const groutDetails = sortedGrouts.map(g => `${g.ringNo} = ${Number(g.total || 0).toFixed(3)} m3 (${Number(g.ratio || 0).toFixed(2)}%)`).join(', ') || '-';
    const groutRingRange = sortedGrouts.length > 0 ? (sortedGrouts.length === 1 ? sortedGrouts[0].ringNo : `${sortedGrouts[0].ringNo}-${sortedGrouts[sortedGrouts.length - 1].ringNo}`) : '-';
    const latestGroutRing = sortedGrouts.length > 0 ? sortedGrouts[sortedGrouts.length - 1].ringNo : '-';
    const soilTypes = [...new Set(excavatedInShift.map(s => s.soilType).filter(Boolean))].join(', ') || '-';

    const targetDate = reportType === 'daily' ? reportDate : `${reportMonth}-31`;
    const allAccumSegments = deduplicatedSegments.filter(s => s.status !== "In Progress" && formatDisplayDate(s.date) <= targetDate);
    const accumPermSegments = allAccumSegments.filter(s => s.installType !== "Temporary");
    const accumTempSegments = allAccumSegments.filter(s => s.installType === "Temporary");
    const totalAccumPermRings = accumPermSegments.length;
    const totalAccumTempRings = accumTempSegments.length;
    const totalAccumDist = Number(accumPermSegments.reduce((sum, s) => sum + parseFloat(s.length || 0), 0)).toFixed(3);

    let shiftDelays = [];
    filteredShiftReports.forEach(sr => {
      Object.entries(sr.events || {}).forEach(([activityName, evs]) => {
        if (!['Excavation', 'Segment Erection', 'Locomotive / Rail System', 'Survey', 'Other 1', 'Other 2'].includes(activityName)) {
          evs.forEach(ev => {
            let desc = activityName;
            if (ev.label && String(ev.label).trim() !== '') {
               desc = activityName.toLowerCase().startsWith('other') ? ev.label : `${activityName} (${ev.label})`;
            }
            shiftDelays.push(desc);
          });
        }
      });
    });

    const uniqueDelays = [...new Set(shiftDelays)];
    let combinedRemarks = [];
    if (summary.allRemarks.length > 0) combinedRemarks.push(...summary.allRemarks.map(r => `${String(r.text)} (พบในวง ${r.ring})`));
    if (uniqueDelays.length > 0) combinedRemarks.push(...uniqueDelays);
    const remarksText = combinedRemarks.length > 0 ? '-' + combinedRemarks.join('\n-') : '-ไม่มี';

    const calculatedExcavateDist = finishCH !== '-' ? (8830.488 - parseCH(finishCH)).toFixed(3) : "0.000";

    const promptText = `
=== TEMPLATE ที่ต้องใช้ (ส่งกลับมาเฉพาะข้อความตาม Template นี้เท่านั้น ห้ามอธิบายเพิ่ม) ===
รายงานประจำวันที่ ${displayDateStr} ${reportShift} Shift

🪏🪏งานขุดเจาะอุโมงค์ ${projectInfo.tbmNo}
Drive Shaft : ${projectInfo.location}
สภาพอากาศ : แจ่มใส

1. ${projectInfo.tbmNo}
-เริ่มต้น CH 8+830.488 (Center Shaft IS4) ขุดเจาะถึง CH ${finishCH} = ${calculatedExcavateDist} m
-ขุดเจาะ ${excavRings} แล้วเสร็จ

2.งานติดตั้งผนังอุโมงค์ (Segment)
-ประกอบ ${segmentDetails} = ${summary.permCount} Ring/Shift
-จำนวน Ring สะสม = Permanent ${totalAccumPermRings} Ring, Tempo ${totalAccumTempRings} Ring
-ระยะติดตั้ง ${summary.totalLength} m./Shift
-ระยะติดตั้งสะสม ${totalAccumDist} m

3.Primary Grout
-Ring ${groutRingRange} = ${summary.uniqueGroutedRings} Ring/Shift
-Grout สะสมถึง = ${latestGroutRing}
-Grout Volumn ${groutDetails}

4.สภาพดินที่ขุดเจาะ
-${soilTypes || "ไม่มีข้อมูล"}

5. ตรวจสอบคุณภาพชิ้นส่วนอุโมงค์ (ภาคพื้นดิน)
5.1 ตรวจสอบความเรียบร้อย Segment
-ไม่มี (ตรวจสอบไว้ล่วงหน้าแล้ว)

6.งานทดสอบ Primary Grout & Secondary Grout
6.1 Materials test
-ไม่มี
6.2 ทดสอบ Compressive Strength
-ไม่มี

7.งานอื่นๆ
-ไม่มี

8. Delay Activities
${remarksText}
=== สิ้นสุด TEMPLATE ===
    `;

    const sysPrompt = "คุณคือวิศวกรควบคุมงาน หน้าที่ของคุณคือ Print ข้อความตามรูปแบบ TEMPLATE ที่กำหนดให้ออกมาเป๊ะๆ โดยข้อมูลในหัวข้อ 1-7 ห้ามเปลี่ยนแปลง คิดเอง หรือตัดทอนเด็ดขาด ให้พิมพ์ตามต้นฉบับทุกตัวอักษร แต่ในส่วน '8. Delay Activities' ให้คุณนำข้อมูลมาเรียบเรียงใหม่ให้อ่านดูเป็นภาษาวิศวกรหน้างานเชิงรายงาน หากมีกิจกรรมหรือรายการที่คล้ายกันให้จัดกลุ่มและสรุปรวมให้กระชับและเป็นมืออาชีพมากที่สุด (เช่น นำมารวมเป็น 1 บรรทัด หรือเรียบเรียง wording ใหม่ให้เป็นทางการ) ห้ามเพิ่มคำอธิบายทักทายใดๆ เด็ดขาด";

    try {
      const resultText = await generateGeminiSummary(promptText, sysPrompt);
      setAiSummaryText(resultText);
    } catch (error) { setAiSummaryText("ขออภัย เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI กรุณาลองใหม่อีกครั้ง: " + error.message); } finally { setIsGeneratingAI(false); }
  };

  const getDuration = (start, end) => {
    if (!start || !end) return 0;
    let [h1, m1] = start.split(':').map(Number);
    let [h2, m2] = end.split(':').map(Number);
    let mins1 = h1 * 60 + m1;
    let mins2 = h2 * 60 + m2;
    if (mins2 < mins1) mins2 += 24 * 60;
    return mins2 - mins1;
  };

  const handleGenerateDelaySummary = async () => {
    setIsGeneratingAI(true);
    setAiModalType("delay");
    setShowAIModal(true);
    setAiSummaryText("");
    setCopied(false);

    let delaySummary = {};
    let totalDelayMins = 0;
    filteredShiftReports.forEach(sr => {
      Object.keys(sr.events || {}).forEach(activity => {
        if (!['Excavation', 'Segment Erection', 'Locomotive / Rail System', 'Survey', 'Other 1', 'Other 2'].includes(activity)) {
          let duration = sr.events[activity].reduce((acc, ev) => acc + getDuration(ev.start, ev.end), 0);
          if (duration > 0) { delaySummary[activity] = (delaySummary[activity] || 0) + duration; totalDelayMins += duration; }
        }
      });
    });

    const delayDetails = Object.entries(delaySummary).length > 0 ? Object.entries(delaySummary).map(([k, v]) => `- ${k}: ${v} นาที`).join('\n') : '- ไม่มีบันทึกเวลาหยุดชะงัก (Delay)';
    const remarksText = summary.allRemarks.length > 0 ? summary.allRemarks.map(r => `- [${r.module} วงที่ ${r.ring}] ${String(r.text)}`).join('\n') : '- ไม่มีปัญหาอุปสรรคที่ถูกบันทึก';

    const promptText = `ข้อมูลอ้างอิงสำหรับวิเคราะห์ความล่าช้า/อุปสรรค:
- วันที่/เดือน: ${displayDateStr} ${reportShift !== 'All' ? reportShift + ' Shift' : ''}
- เวลาสูญเสียรวม (Total Downtime): ${totalDelayMins} นาที
รายละเอียดเวลาที่สูญเสียแยกตามหมวดหมู่:
${delayDetails}
ปัญหาและอุปสรรคที่พบจากหน้างาน (Remarks):
${remarksText}

คำสั่ง: คุณคือวิศวกรที่ปรึกษาด้านการขุดเจาะอุโมงค์ TBM ห้ามเขียนเป็นเรียงความยาวๆ เด็ดขาด! ให้สรุปรายงานให้อ่านง่ายที่สุด เข้าใจได้ใน 1 นาที โดยใช้รูปแบบหัวข้อย่อยและ Emoji นำสายตา
กรุณาจัดรูปแบบผลลัพธ์ตามโครงสร้างนี้เท่านั้น:
📊 สรุปข้อมูลความล่าช้า (Downtime Summary)
- รวมเวลาล่าช้าทั้งหมด: [ใส่ตัวเลข] นาที
- งานที่ทำให้เสียเวลามากที่สุด: [ระบุชื่อและเวลา]

⚠️ วิเคราะห์สาเหตุหลัก (Root Cause Analysis)
- [สรุปสาเหตุจากข้อมูล Remarks และ Delay เป็นข้อๆ สั้นและกระชับ]

📉 ผลกระทบต่องาน (Impact)
- [สรุปสั้นๆ ว่าส่งผลกระทบต่อระยะทางหรือเวลาอย่างไร]

💡 ข้อเสนอแนะและแผนป้องกัน (Action Plan)
- [ข้อเสนอแนะสั้นๆ 1-2 ข้อ]`;

    const sysPrompt = "คุณคือวิศวกรผู้เชี่ยวชาญด้านการขุดเจาะอุโมงค์ TBM ห้ามตอบเป็นเรียงความ ให้ตอบในรูปแบบหัวข้อย่อย (Bullet points) ที่กระชับ ตรงประเด็น สั้นที่สุด และอ่านง่ายที่สุด";

    try {
      const resultText = await generateGeminiSummary(promptText, sysPrompt);
      setAiSummaryText(resultText);
    } catch (error) { setAiSummaryText("ขออภัย เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI กรุณาลองใหม่อีกครั้ง: " + error.message); } finally { setIsGeneratingAI(false); }
  };

  const copyToClipboard = () => {
    const textArea = document.createElement("textarea");
    textArea.value = aiSummaryText;
    document.body.appendChild(textArea);
    textArea.select();
    try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (err) { console.error('Failed to copy', err); }
    document.body.removeChild(textArea);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-32">
      <div className="no-print bg-white p-4 sm:p-5 rounded-3xl shadow-sm border border-slate-200 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 sm:gap-5">
        <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200 w-full xl:w-auto shrink-0">
          <button onClick={() => setReportType("daily")} className={`flex-1 xl:flex-none px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${reportType === "daily" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Daily Report</button>
          <button onClick={() => setReportType("monthly")} className={`flex-1 xl:flex-none px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${reportType === "monthly" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Monthly Report</button>
        </div>
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 sm:gap-4 w-full xl:w-auto justify-end">
          <div className="flex flex-row items-center gap-2 sm:gap-3 w-full lg:w-auto shrink-0">
            <select value={reportShift} onChange={(e) => setReportShift(e.target.value)} className="px-3 sm:px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500 bg-white cursor-pointer flex-1 lg:flex-none min-w-[110px]">
              <option value="All">All Shifts</option><option value="Day">Day Shift</option><option value="Night">Night Shift</option>
            </select>
            {reportType === "daily" ? <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="px-3 sm:px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500 flex-1 lg:flex-none" /> : <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} className="px-3 sm:px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500 flex-1 lg:flex-none" />}
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-row items-center gap-2 sm:gap-3 w-full lg:w-auto">
            <button onClick={handleDownloadImage} disabled={isExportingImage} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 font-bold shadow-md shadow-blue-200 transition-colors whitespace-nowrap text-xs sm:text-sm">{isExportingImage ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} <span className="hidden sm:inline">เซฟรูปภาพ</span><span className="sm:hidden">เซฟรูป</span></button>
            <button onClick={() => window.print()} className="w-full sm:w-auto bg-slate-800 hover:bg-slate-900 text-white px-3 sm:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 font-bold shadow-md transition-colors whitespace-nowrap text-xs sm:text-sm"><Printer size={16} /> <span className="hidden sm:inline">Print PDF</span><span className="sm:hidden">Print</span></button>
            <button onClick={handleGenerateAISummary} className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-3 sm:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 font-bold shadow-md shadow-indigo-200 transition-all active:scale-95 whitespace-nowrap text-xs sm:text-sm"><Sparkles size={16} /> สรุปรายงาน</button>
            <button onClick={handleGenerateDelaySummary} className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white px-3 sm:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 font-bold shadow-md shadow-orange-200 transition-all active:scale-95 whitespace-nowrap text-xs sm:text-sm"><AlertCircle size={16} /> วิเคราะห์ปัญหา</button>
          </div>
        </div>
      </div>

      <div id="stats-report-container" className="bg-white p-6 sm:p-10 md:p-14 rounded-[2rem] shadow-lg border border-slate-200 text-slate-800 print:p-0 print:m-0 print:shadow-none print:border-none">
        <div className="border-b-4 border-slate-900 pb-5 sm:pb-8 mb-8 sm:mb-10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h1 className="text-2xl sm:text-4xl font-black text-slate-900 uppercase tracking-tight">TBM Construction Report</h1>
            <p className="text-slate-500 font-bold mt-2 uppercase tracking-widest text-xs sm:text-sm">{reportType === "daily" ? "Daily Progress" : "Monthly Summary"}</p>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-base sm:text-xl font-black text-slate-800 bg-slate-100 px-4 py-1.5 rounded-lg inline-block border border-slate-200 shadow-sm">{displayDateStr} {reportShift !== "All" && <span className="text-blue-600 ml-1">({reportShift})</span>}</div>
            <div className="text-xs sm:text-sm text-slate-500 font-semibold mt-3">{projectInfo.tbmNo} | {projectInfo.location}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-8 sm:mb-12">
          <div className="bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-[10px] sm:text-xs uppercase font-extrabold text-slate-400 tracking-wider mb-2">Rings Installed</div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-600">{summary.permCount} <span className="text-xs sm:text-sm text-slate-400 font-bold ml-1">Perm.</span></div>
            <div className="text-[10px] sm:text-xs font-bold text-slate-500 mt-2 bg-slate-200/50 px-2 py-1 rounded inline-block">+ {summary.tempCount} Temp (Total: {summary.totalSegments})</div>
          </div>
          <div className="bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-[10px] sm:text-xs uppercase font-extrabold text-slate-400 tracking-wider mb-2">Total Perm. Distance</div>
            <div className="text-2xl sm:text-3xl font-black text-blue-600">{summary.totalLength} <span className="text-xs sm:text-sm text-slate-400 font-bold ml-1">m</span></div>
            <div className="text-[10px] sm:text-xs font-bold text-slate-500 mt-2 bg-slate-200/50 px-2 py-1 rounded inline-block">ดินขุดรวม: {summary.totalSoilVol} m³</div>
          </div>
          <div className="bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-[10px] sm:text-xs uppercase font-extrabold text-slate-400 tracking-wider mb-2">Total Grout Vol</div>
            <div className="text-2xl sm:text-3xl font-black text-indigo-600">{summary.totalGroutVol} <span className="text-xs sm:text-sm text-slate-400 font-bold ml-1">m³</span></div>
            <div className="text-[10px] sm:text-xs font-bold text-slate-500 mt-2 bg-slate-200/50 px-2 py-1 rounded inline-block">{summary.uniqueGroutedRings} Rings Grouted</div>
          </div>
          <div className="bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-[10px] sm:text-xs uppercase font-extrabold text-slate-400 tracking-wider mb-2">Avg Grout Ratio</div>
            <div className={`text-2xl sm:text-3xl font-black ${Number(summary.avgGroutRatio) > 150 ? "text-purple-500" : Number(summary.avgGroutRatio) >= 100 ? "text-emerald-500" : "text-red-500"}`}>{summary.avgGroutRatio} <span className="text-xs sm:text-sm font-bold ml-1">%</span></div>
            <div className="text-[10px] sm:text-xs font-bold text-slate-500 mt-2 bg-slate-200/50 px-2 py-1 rounded inline-block">Efficiency Target: 100%</div>
          </div>
        </div>

        <div className="mb-8 sm:mb-12 overflow-x-auto">
          <h3 className="text-sm sm:text-base font-black text-slate-800 uppercase tracking-widest border-l-4 border-emerald-500 pl-3 mb-4 sm:mb-5">Segment Installation Logs</h3>
          <table className="w-full text-xs sm:text-sm text-left border-collapse whitespace-nowrap shadow-sm rounded-xl overflow-hidden">
            <thead className="bg-slate-100 text-slate-600 border-y border-slate-200 font-bold">
              <tr>
                <th className="py-3 px-4 sm:px-5">Date/Shift</th>
                <th className="py-3 px-4 sm:px-5">Ring No.</th>
                <th className="py-3 px-4 sm:px-5 text-center">Type/Key</th>
                <th className="py-3 px-4 sm:px-5 text-right">Start CH.</th>
                <th className="py-3 px-4 sm:px-5 text-right">Finish CH.</th>
                <th className="py-3 px-4 sm:px-5 text-right">Length / Soil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredSegments.length > 0 ? (
                [...filteredSegments].reverse().map((r, i) => (
                  <tr key={`${r.id}-${i}`} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 sm:px-5">
                      <div className="font-bold text-slate-800">{formatDisplayDate(r.date)} <span className="text-slate-400 font-medium ml-1">({String(r.installShift || r.shift)})</span></div>
                      <div className="text-[10px] sm:text-xs text-slate-500 mt-1 font-mono"><span className="font-bold">EX:</span> {formatDisplayTime(r.excavStartTime)} - {formatDisplayTime(r.excavEndTime)}</div>
                      <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5 font-mono"><span className="font-bold">IN:</span> {formatDisplayTime(r.installStartTime || r.startTime)} - {formatDisplayTime(r.installEndTime || r.endTime)}</div>
                    </td>
                    <td className="py-3 px-4 sm:px-5 font-black text-slate-800 text-base">
                      <span className={r.installType === "Temporary" ? "text-amber-600" : ""}>{String(r.ringNo)}</span>
                      {r.installType === "Temporary" && <span className="text-amber-600 ml-2 font-bold text-[9px] bg-amber-50 px-1.5 py-0.5 rounded">(Temp)</span>}
                      {r.status === "In Progress" && <span className="text-orange-500 ml-2 font-bold text-[9px] bg-orange-50 px-1.5 py-0.5 rounded">(In Prog)</span>}
                    </td>
                    <td className="py-3 px-4 sm:px-5 text-center">
                      <span className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-600 mr-2">{String(r.typeRing)}</span>
                      <span className="text-xs text-slate-500 font-bold ml-1">K{String(r.keyPos)}</span>
                    </td>
                    <td className="py-3 px-4 sm:px-5 text-right text-slate-500 font-mono font-medium">{String(r.startCH)}</td>
                    <td className="py-3 px-4 sm:px-5 text-right text-slate-800 font-bold font-mono">{String(r.finishCH)}</td>
                    <td className="py-3 px-4 sm:px-5 text-right">
                      <div className="font-black text-emerald-600 text-base">{Number(r.length || 0).toFixed(2)} <span className="text-xs font-bold">m</span></div>
                      <div className="text-[10px] text-slate-500 font-medium mt-0.5">{Number(r.soilVolume || calculateSoilVolume(r.length)).toFixed(2)} m³</div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="6" className="py-8 text-center text-slate-400 italic">No segment data for this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mb-8 sm:mb-12 overflow-x-auto">
          <h3 className="text-sm sm:text-base font-black text-slate-800 uppercase tracking-widest border-l-4 border-blue-500 pl-3 mb-4 sm:mb-5">Primary Grout Logs</h3>
          <table className="w-full text-xs sm:text-sm text-left border-collapse whitespace-nowrap shadow-sm rounded-xl overflow-hidden">
            <thead className="bg-slate-100 text-slate-600 border-y border-slate-200 font-bold">
              <tr>
                <th className="py-3 px-4 sm:px-5">Ring No.</th>
                <th className="py-3 px-4 sm:px-5">Excav. Ring</th>
                <th className="py-3 px-4 sm:px-5">Key & Pos</th>
                <th className="py-3 px-4 sm:px-5 text-right">Vol A</th>
                <th className="py-3 px-4 sm:px-5 text-right">Vol B</th>
                <th className="py-3 px-4 sm:px-5 text-right">Total (m³)</th>
                <th className="py-3 px-4 sm:px-5 text-right">Ratio (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredGrouts.length > 0 ? (
                [...filteredGrouts].reverse().map((r, i) => (
                  <tr key={`${r.id}-${i}`} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 sm:px-5 font-black text-slate-800 text-base">
                      {String(r.ringNo)}
                      {r.groutPass === "Re-Grout" && <span className="text-purple-600 ml-2 font-bold text-[9px] bg-purple-50 px-1.5 py-0.5 rounded">(Re-Grout)</span>}
                    </td>
                    <td className="py-3 px-4 sm:px-5 text-slate-500 font-medium">{String(r.excavRing)}</td>
                    <td className="py-3 px-4 sm:px-5">
                      <div className="font-bold text-slate-700 text-xs mb-1">K{String(r.key)}</div>
                      <div className="flex gap-1 flex-wrap">
                        {r.groutPass === "Re-Grout" ? (
                          <>
                            {Object.entries(Object.values(r.primaryPositions || {}).some(v => v === true) ? r.primaryPositions : (r.positions || {})).map(([pos, active]) => active && <span key={`p_${pos}`} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[9px] rounded border border-blue-100 font-bold leading-none">{String(pos)}</span>)}
                            {Object.entries(r.secondaryPositions || {}).map(([pos, active]) => active && <span key={`s_${pos}`} className="px-1.5 py-0.5 bg-orange-50 text-orange-600 text-[9px] rounded border border-orange-200 font-bold leading-none">{String(pos)}</span>)}
                          </>
                        ) : (
                          Object.entries(Object.values(r.primaryPositions || {}).some(v => v === true) ? r.primaryPositions : (r.positions || {})).map(([pos, active]) => active && <span key={pos} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[9px] rounded border border-blue-100 font-bold leading-none">{String(pos)}</span>)
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 sm:px-5 text-right text-slate-500 font-mono">{Number(r.partA || 0).toFixed(2)}</td>
                    <td className="py-3 px-4 sm:px-5 text-right text-slate-500 font-mono">{Number(r.partB || 0).toFixed(2)}</td>
                    <td className="py-3 px-4 sm:px-5 text-right font-black text-slate-800 text-base">{Number(r.total || 0).toFixed(2)}</td>
                    <td className="py-3 px-4 sm:px-5 text-right font-black">
                      <span className={`px-2 py-1 rounded-md ${Number(r.ratio) > 150 ? "bg-purple-50 text-purple-600" : Number(r.ratio) >= 100 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>{Number(r.ratio || 0).toFixed(1)}%</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="7" className="py-8 text-center text-slate-400 italic">No grout data for this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {summary.allRemarks.length > 0 && (
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-800 uppercase tracking-widest border-l-4 border-orange-500 pl-3 mb-4 sm:mb-5">Issues & Remarks</h3>
            <ul className="space-y-3 text-xs sm:text-sm text-slate-700 bg-orange-50/30 p-5 rounded-2xl border border-orange-100">
              {summary.allRemarks.map((rem, i) => (
                <li key={i} className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-start sm:items-center bg-white p-3 rounded-xl border border-orange-100 shadow-sm">
                  <span className="font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded whitespace-nowrap text-xs">[{String(rem.module)} - {String(rem.ring)}]</span>
                  <span className="font-medium text-slate-600 whitespace-pre-wrap">{String(rem.text)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* AI Summary Modal */}
      {showAIModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md animate-fade-in no-print">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[90vh] transform transition-all border border-white/20">
            <div className={`px-6 py-5 text-white flex justify-between items-center shrink-0 ${aiModalType === 'executive' ? 'bg-gradient-to-r from-purple-600 to-indigo-600' : 'bg-gradient-to-r from-orange-500 to-red-600'}`}>
              <h3 className="font-black text-lg sm:text-xl flex items-center gap-3 tracking-tight">
                {aiModalType === 'executive' ? <Sparkles size={24} className="text-purple-200" /> : <AlertCircle size={24} className="text-orange-200" />}
                {aiModalType === 'executive' ? 'AI Executive Summary' : 'AI Delay & Issue Analysis'}
              </h3>
              <button onClick={() => setShowAIModal(false)} className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"><X size={20} /></button>
            </div>

            <div className="p-6 sm:p-8 bg-slate-50 relative min-h-[200px] overflow-y-auto flex-1 hide-scrollbar">
              {isGeneratingAI ? (
                <div className="flex flex-col items-center justify-center py-12 text-indigo-500 h-full gap-4">
                  <Loader2 size={48} className="animate-spin" />
                  <p className="font-bold animate-pulse text-base sm:text-lg">กำลังวิเคราะห์ข้อมูลและร่างรายงาน...</p>
                </div>
              ) : (
                <div className="prose prose-sm sm:prose-base max-w-none text-slate-700 whitespace-pre-wrap leading-relaxed font-medium">{aiSummaryText}</div>
              )}
            </div>

            {!isGeneratingAI && aiSummaryText && (
              <div className="bg-white px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center shrink-0 gap-4">
                <p className="text-[10px] sm:text-xs text-slate-400 font-bold flex items-center gap-1.5 text-center sm:text-left"><Sparkles size={12} /> เนื้อหาสร้างโดย AI โปรดตรวจสอบความถูกต้อง</p>
                <button onClick={copyToClipboard} className="flex items-center justify-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm transition-colors shadow-lg active:scale-95 w-full sm:w-auto">
                  {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                  {copied ? "คัดลอกแล้ว!" : "คัดลอกรายงาน"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportView;
