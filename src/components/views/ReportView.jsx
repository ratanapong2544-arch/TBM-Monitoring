import React, { useState, useMemo } from "react";
import { Sparkles, X, Check, Copy, Download, Printer, Loader2, FileSpreadsheet } from "lucide-react";
import { formatDisplayDate, formatDisplayTime, formatThaiBuddhistDate, formatThaiBuddhistDateForFile } from "../../utils/formatters";
import { getLogicalShiftDate, getRingNumeric, calculateSoilVolume, loadHtml2Canvas } from "../../utils/helpers";
import { generateGeminiSummary } from "../../utils/api";
import { TOTAL_ROUTE_DISTANCE } from "../../utils/constants";
import { composeExcavationWorkLog, mapManpowerToLabor } from "../../utils/worklogCompose";
import { newDailyReport, MACHINES } from "../../utils/dailyReports";

const ReportView = ({ segmentRecords, groutRecords, projectInfo, shiftReports, onCreateDaily }) => {
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

  const accumulation = useMemo(() => {
    const targetDate = reportType === "daily" ? reportDate : `${reportMonth}-31`;
    const allAccum = deduplicatedSegments.filter(s => s.status !== "In Progress" && formatDisplayDate(s.date) <= targetDate);
    const permAccum = allAccum.filter(s => s.installType !== "Temporary");
    const tempAccum = allAccum.filter(s => s.installType === "Temporary");
    const sortedPerm = [...permAccum].sort((a, b) => getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo));
    const latestPermRing = sortedPerm.length > 0 ? String(sortedPerm[sortedPerm.length - 1].ringNo) : "-";
    const totalAccumDist = permAccum.reduce((sum, s) => sum + parseFloat(s.length || 0), 0);
    const progressPercent = TOTAL_ROUTE_DISTANCE > 0 ? (totalAccumDist / TOTAL_ROUTE_DISTANCE) * 100 : 0;
    return {
      latestPermRing,
      permRings: permAccum.length,
      tempRings: tempAccum.length,
      totalRings: allAccum.length,
      totalAccumDist: Number(totalAccumDist || 0).toFixed(3),
      progressPercent: Number(progressPercent || 0).toFixed(2),
    };
  }, [deduplicatedSegments, reportType, reportDate, reportMonth]);

  const displayDateStr = reportType === "daily"
    ? formatThaiBuddhistDate(reportDate)
    : new Date(reportMonth + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const fileDateStr = reportType === "daily"
    ? formatThaiBuddhistDateForFile(reportDate)
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
      link.download = `Stats_Report_${fileDateStr}.jpg`; link.href = canvas.toDataURL("image/jpeg", 0.9); link.click();
    } catch (error) { alert("เกิดข้อผิดพลาดในการสร้างรูปภาพ: " + error.message); } finally { setIsExportingImage(false); }
  };

  const handleGenerateAISummary = async () => {
    setIsGeneratingAI(true);
    setAiModalType("executive");
    setShowAIModal(true);
    setAiSummaryText("");
    setCopied(false);

    const body = composeExcavationWorkLog({
      filteredSegments, filteredGrouts, filteredShiftReports,
      summary, accumulation, projectInfo, reportShift,
    });

    const promptText = `รายงานประจำวันที่ ${displayDateStr} ${reportShift} Shift

🪏🪏งานขุดเจาะอุโมงค์ ${projectInfo.tbmNo}
Drive Shaft : ${projectInfo.location}
สภาพอากาศ : แจ่มใส

${body}`;

    const sysPrompt = "คุณคือวิศวกรควบคุมงาน หน้าที่ของคุณคือ Print ข้อความตามรูปแบบ TEMPLATE ที่กำหนดให้ออกมาเป๊ะๆ โดยข้อมูลในหัวข้อ 1-7 ห้ามเปลี่ยนแปลง คิดเอง หรือตัดทอนเด็ดขาด ให้พิมพ์ตามต้นฉบับทุกตัวอักษร แต่ในส่วน '8. Delay Activities' ให้คุณนำข้อมูลมาเรียบเรียงใหม่ให้อ่านดูเป็นภาษาวิศวกรหน้างานเชิงรายงาน หากมีกิจกรรมหรือรายการที่คล้ายกันให้จัดกลุ่มและสรุปรวมให้กระชับและเป็นมืออาชีพมากที่สุด (เช่น นำมารวมเป็น 1 บรรทัด หรือเรียบเรียง wording ใหม่ให้เป็นทางการ) ห้ามเพิ่มคำอธิบายทักทายใดๆ เด็ดขาด";

    try {
      const resultText = await generateGeminiSummary(promptText, sysPrompt);
      setAiSummaryText(resultText);
    } catch (error) { setAiSummaryText("ขออภัย เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI กรุณาลองใหม่อีกครั้ง: " + error.message); } finally { setIsGeneratingAI(false); }
  };



  const handleCreateDailyFromReport = () => {
    const machine = MACHINES.includes(projectInfo.tbmNo) ? projectInfo.tbmNo : "TBM1";
    const base = newDailyReport(machine, "excavation");
    const draft = {
      ...base,
      date: reportType === "daily" ? reportDate : base.date,
      area: projectInfo.location || "",
      workLogText: composeExcavationWorkLog({
        filteredSegments, filteredGrouts, filteredShiftReports,
        summary, accumulation, projectInfo, reportShift,
      }),
      labor: { ...base.labor, ...mapManpowerToLabor(filteredShiftReports) },
    };
    setShowAIModal(false);
    if (onCreateDaily) onCreateDaily(draft);
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
      <div className="no-print bg-white p-4 sm:p-5 rounded-card shadow-card border border-line flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 sm:gap-5">
        <div className="flex bg-surface-alt p-1.5 rounded-input border border-line w-full xl:w-auto shrink-0">
          <button onClick={() => setReportType("daily")} className={`flex-1 xl:flex-none px-5 py-2.5 rounded-input text-sm font-semibold transition-all ${reportType === "daily" ? "bg-white text-ink shadow-sm" : "text-ink-3 hover:text-ink-2"}`}>Daily Report</button>
          <button onClick={() => setReportType("monthly")} className={`flex-1 xl:flex-none px-5 py-2.5 rounded-input text-sm font-semibold transition-all ${reportType === "monthly" ? "bg-white text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}>Monthly Report</button>
        </div>
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 sm:gap-4 w-full xl:w-auto justify-end">
          <div className="flex flex-row items-center gap-2 sm:gap-3 w-full lg:w-auto shrink-0">
            <select value={reportShift} onChange={(e) => setReportShift(e.target.value)} className="px-3 sm:px-4 py-2.5 border border-input rounded-input text-sm font-semibold text-ink-2 outline-none focus:border-navy bg-white cursor-pointer flex-1 lg:flex-none min-w-[110px]">
              <option value="All">All Shifts</option><option value="Day">Day Shift</option><option value="Night">Night Shift</option>
            </select>
            {reportType === "daily" ? <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="px-3 sm:px-4 py-2.5 border border-input rounded-input text-sm font-semibold text-ink-2 outline-none focus:border-navy flex-1 lg:flex-none" /> : <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} className="px-3 sm:px-4 py-2.5 border border-input rounded-input text-sm font-semibold text-ink-2 outline-none focus:border-navy flex-1 lg:flex-none" />}
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-row items-center gap-2 sm:gap-3 w-full lg:w-auto">
            <button onClick={handleDownloadImage} disabled={isExportingImage} className="w-full sm:w-auto bg-navy hover:bg-navy-deepest text-white px-3 sm:px-4 py-2.5 rounded-input flex items-center justify-center gap-1.5 font-semibold shadow-card transition-colors whitespace-nowrap text-xs sm:text-sm">{isExportingImage ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} <span className="hidden sm:inline">เซฟรูปภาพ</span><span className="sm:hidden">เซฟรูป</span></button>
            <button onClick={() => window.print()} className="w-full sm:w-auto bg-navy hover:bg-navy-dark text-white px-3 sm:px-4 py-2.5 rounded-input flex items-center justify-center gap-1.5 font-semibold shadow-card transition-colors whitespace-nowrap text-xs sm:text-sm"><Printer size={16} /> <span className="hidden sm:inline">Print PDF</span><span className="sm:hidden">Print</span></button>
            <button onClick={handleGenerateAISummary} className="col-span-2 w-full sm:w-auto bg-navy hover:bg-navy-dark text-white px-3 sm:px-4 py-2.5 rounded-input flex items-center justify-center gap-1.5 font-semibold shadow-card transition-all active:scale-95 whitespace-nowrap text-xs sm:text-sm"><Sparkles size={16} /> สรุปรายงานประจำวัน</button>
          </div>
        </div>
      </div>

      <div id="stats-report-container" className="bg-white p-6 sm:p-10 md:p-14 rounded-card shadow-card border border-line text-ink print:p-0 print:m-0 print:shadow-none print:border-none">
        <div className="border-b-4 border-navy pb-5 sm:pb-8 mb-8 sm:mb-10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h1 className="text-2xl sm:text-4xl font-semibold text-ink uppercase tracking-tight">TBM Construction Report</h1>
            <p className="text-ink-3 font-semibold mt-2 uppercase tracking-widest text-xs sm:text-sm">{reportType === "daily" ? "Daily Progress" : "Monthly Summary"}</p>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-base sm:text-xl font-semibold text-ink bg-surface-alt px-4 py-1.5 rounded-input inline-block border border-line shadow-sm">{displayDateStr} {reportShift !== "All" && <span className="text-cyan-med ml-1">({reportShift})</span>}</div>
            <div className="text-xs sm:text-sm text-ink-3 font-semibold mt-3">{projectInfo.tbmNo} | {projectInfo.location}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-8 sm:mb-12">
          <div className="bg-surface-alt p-4 sm:p-6 rounded-card border border-line shadow-card">
            <div className="text-[10px] sm:text-xs uppercase font-semibold text-ink-3 tracking-wider mb-2">Rings Installed</div>
            <div className="text-2xl sm:text-3xl font-semibold text-sgreen-dark font-mono">{summary.permCount} <span className="text-xs sm:text-sm text-ink-3 font-semibold ml-1">Perm.</span></div>
            <div className="text-[10px] sm:text-xs font-semibold text-ink-3 mt-2 bg-surface px-2 py-1 rounded-badge inline-block">+ {summary.tempCount} Temp (Total: {summary.totalSegments})</div>
          </div>
          <div className="bg-surface-alt p-4 sm:p-6 rounded-card border border-line shadow-card">
            <div className="text-[10px] sm:text-xs uppercase font-semibold text-ink-3 tracking-wider mb-2">Total Perm. Distance</div>
            <div className="text-2xl sm:text-3xl font-semibold text-navy font-mono">{summary.totalLength} <span className="text-xs sm:text-sm text-ink-3 font-semibold ml-1">m</span></div>
            <div className="text-[10px] sm:text-xs font-semibold text-ink-3 mt-2 bg-surface px-2 py-1 rounded-badge inline-block">ดินขุดรวม: {summary.totalSoilVol} m³</div>
          </div>
          <div className="bg-surface-alt p-4 sm:p-6 rounded-card border border-line shadow-card">
            <div className="text-[10px] sm:text-xs uppercase font-semibold text-ink-3 tracking-wider mb-2">Total Grout Vol</div>
            <div className="text-2xl sm:text-3xl font-semibold text-cyan-med font-mono">{summary.totalGroutVol} <span className="text-xs sm:text-sm text-ink-3 font-semibold ml-1">m³</span></div>
            <div className="text-[10px] sm:text-xs font-semibold text-ink-3 mt-2 bg-surface px-2 py-1 rounded-badge inline-block">{summary.uniqueGroutedRings} Rings Grouted</div>
          </div>
          <div className="bg-surface-alt p-4 sm:p-6 rounded-card border border-line shadow-card">
            <div className="text-[10px] sm:text-xs uppercase font-semibold text-ink-3 tracking-wider mb-2">Avg Grout Ratio</div>
            <div className={`text-2xl sm:text-3xl font-semibold font-mono ${Number(summary.avgGroutRatio) > 150 ? "text-cyan-med" : Number(summary.avgGroutRatio) >= 100 ? "text-sgreen-dark" : "text-code-d"}`}>{summary.avgGroutRatio} <span className="text-xs sm:text-sm font-semibold ml-1">%</span></div>
            <div className="text-[10px] sm:text-xs font-semibold text-ink-3 mt-2 bg-surface px-2 py-1 rounded-badge inline-block">Efficiency Target: 100%</div>
          </div>
          <div className="bg-surface-alt p-4 sm:p-6 rounded-card border border-line shadow-card">
            <div className="text-[10px] sm:text-xs uppercase font-semibold text-ink-3 tracking-wider mb-2">Latest Ring</div>
            <div className="text-2xl sm:text-3xl font-semibold text-ink font-mono">{accumulation.latestPermRing}</div>
            <div className="text-[10px] sm:text-xs font-semibold text-ink-3 mt-2 bg-surface px-2 py-1 rounded-badge inline-block">วงล่าสุด (Permanent)</div>
          </div>
          <div className="bg-surface-alt p-4 sm:p-6 rounded-card border border-line shadow-card">
            <div className="text-[10px] sm:text-xs uppercase font-semibold text-ink-3 tracking-wider mb-2">Accum. Rings</div>
            <div className="text-2xl sm:text-3xl font-semibold text-sgreen-dark font-mono">{accumulation.permRings} <span className="text-xs sm:text-sm text-ink-3 font-semibold ml-1">Perm.</span></div>
            <div className="text-[10px] sm:text-xs font-semibold text-ink-3 mt-2 bg-surface px-2 py-1 rounded-badge inline-block">+ {accumulation.tempRings} Temp (Total: {accumulation.totalRings})</div>
          </div>
          <div className="bg-surface-alt p-4 sm:p-6 rounded-card border border-line shadow-card">
            <div className="text-[10px] sm:text-xs uppercase font-semibold text-ink-3 tracking-wider mb-2">Accum. Distance</div>
            <div className="text-2xl sm:text-3xl font-semibold text-navy font-mono">{accumulation.totalAccumDist} <span className="text-xs sm:text-sm text-ink-3 font-semibold ml-1">m</span></div>
            <div className="text-[10px] sm:text-xs font-semibold text-ink-3 mt-2 bg-surface px-2 py-1 rounded-badge inline-block">ระยะติดตั้งสะสม (Permanent)</div>
          </div>
          <div className="bg-surface-alt p-4 sm:p-6 rounded-card border border-line shadow-card">
            <div className="text-[10px] sm:text-xs uppercase font-semibold text-ink-3 tracking-wider mb-2">% ผลงานแล้วเสร็จ</div>
            <div className="text-2xl sm:text-3xl font-semibold text-cyan-med font-mono">{accumulation.progressPercent} <span className="text-xs sm:text-sm font-semibold ml-1">%</span></div>
            <div className="text-[10px] sm:text-xs font-semibold text-ink-3 mt-2 bg-surface px-2 py-1 rounded-badge inline-block">จากระยะรวม {TOTAL_ROUTE_DISTANCE.toLocaleString()} ม.</div>
          </div>
        </div>

        <div className="mb-8 sm:mb-12 overflow-x-auto">
          <h3 className="text-sm sm:text-base font-semibold text-ink uppercase tracking-widest border-l-4 border-sgreen-med pl-3 mb-4 sm:mb-5">Segment Installation Logs</h3>
          <table className="w-full text-xs sm:text-sm text-left border-collapse whitespace-nowrap shadow-card rounded-card overflow-hidden">
            <thead className="bg-navy-dark text-white border-y border-line font-semibold">
              <tr>
                <th className="py-3 px-4 sm:px-5">Date/Shift</th>
                <th className="py-3 px-4 sm:px-5">Ring No.</th>
                <th className="py-3 px-4 sm:px-5 text-center">Type/Key</th>
                <th className="py-3 px-4 sm:px-5 text-right">Start CH.</th>
                <th className="py-3 px-4 sm:px-5 text-right">Finish CH.</th>
                <th className="py-3 px-4 sm:px-5 text-right">Length / Soil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredSegments.length > 0 ? (
                [...filteredSegments].reverse().map((r, i) => (
                  <tr key={`${r.id}-${i}`} className={`hover:bg-cyan-tint transition-colors ${i % 2 === 0 ? "bg-surface" : "bg-surface-page"}`}>
                    <td className="py-3 px-4 sm:px-5">
                      <div className="font-semibold text-ink">{formatDisplayDate(r.date)} <span className="text-ink-3 font-medium ml-1">({String(r.installShift || r.shift)})</span></div>
                      <div className="text-[10px] sm:text-xs text-ink-3 mt-1 font-mono"><span className="font-semibold">EX:</span> {formatDisplayTime(r.excavStartTime)} - {formatDisplayTime(r.excavEndTime)}</div>
                      <div className="text-[10px] sm:text-xs text-ink-3 mt-0.5 font-mono"><span className="font-semibold">IN:</span> {formatDisplayTime(r.installStartTime || r.startTime)} - {formatDisplayTime(r.installEndTime || r.endTime)}</div>
                    </td>
                    <td className="py-3 px-4 sm:px-5 font-semibold text-ink text-base font-mono">
                      <span className={r.installType === "Temporary" ? "text-code-b" : ""}>{String(r.ringNo)}</span>
                      {r.installType === "Temporary" && <span className="text-code-b ml-2 font-semibold text-[9px] bg-code-b/10 px-1.5 py-0.5 rounded-badge">(Temp)</span>}
                      {r.status === "In Progress" && <span className="text-code-c ml-2 font-semibold text-[9px] bg-code-c/10 px-1.5 py-0.5 rounded-badge">(In Prog)</span>}
                    </td>
                    <td className="py-3 px-4 sm:px-5 text-center">
                      <span className="bg-surface-alt px-2 py-1 rounded-badge text-xs font-semibold text-ink-2 mr-2">{String(r.typeRing)}</span>
                      <span className="text-xs text-ink-3 font-semibold ml-1">K{String(r.keyPos)}</span>
                    </td>
                    <td className="py-3 px-4 sm:px-5 text-right text-ink-3 font-mono font-medium">{String(r.startCH)}</td>
                    <td className="py-3 px-4 sm:px-5 text-right text-ink font-semibold font-mono">{String(r.finishCH)}</td>
                    <td className="py-3 px-4 sm:px-5 text-right">
                      <div className="font-semibold text-sgreen-dark text-base font-mono">{Number(r.length || 0).toFixed(2)} <span className="text-xs font-semibold">m</span></div>
                      <div className="text-[10px] text-ink-3 font-medium mt-0.5">{Number(r.soilVolume || calculateSoilVolume(r.length)).toFixed(2)} m³</div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="6" className="py-8 text-center text-ink-3 italic">No segment data for this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mb-8 sm:mb-12 overflow-x-auto">
          <h3 className="text-sm sm:text-base font-semibold text-ink uppercase tracking-widest border-l-4 border-navy pl-3 mb-4 sm:mb-5">Primary Grout Logs</h3>
          <table className="w-full text-xs sm:text-sm text-left border-collapse whitespace-nowrap shadow-card rounded-card overflow-hidden">
            <thead className="bg-navy-dark text-white border-y border-line font-semibold">
              <tr>
                <th className="py-3 px-4 sm:px-5">Ring No.</th>
                <th className="py-3 px-4 sm:px-5">Excav. Ring</th>
                <th className="py-3 px-4 sm:px-5 text-right">Pressure</th>
                <th className="py-3 px-4 sm:px-5">Key & Pos</th>
                <th className="py-3 px-4 sm:px-5 text-right">Vol A</th>
                <th className="py-3 px-4 sm:px-5 text-right">Vol B</th>
                <th className="py-3 px-4 sm:px-5 text-right">Total (m³)</th>
                <th className="py-3 px-4 sm:px-5 text-right">Ratio (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredGrouts.length > 0 ? (
                [...filteredGrouts].reverse().map((r, i) => (
                  <tr key={`${r.id}-${i}`} className={`hover:bg-cyan-tint transition-colors ${i % 2 === 0 ? "bg-surface" : "bg-surface-page"}`}>
                    <td className="py-3 px-4 sm:px-5 font-semibold text-ink text-base font-mono">
                      {String(r.ringNo)}
                      {r.groutPass === "Re-Grout" && <span className="text-cyan-med ml-2 font-semibold text-[9px] bg-cyan-tint px-1.5 py-0.5 rounded-badge">(Re-Grout)</span>}
                    </td>
                    <td className="py-3 px-4 sm:px-5 text-ink-3 font-medium">{String(r.excavRing)}</td>
                    <td className="py-3 px-4 sm:px-5 text-right">
                      {r.pressure ? (
                        <span className="font-semibold font-mono text-code-d bg-code-d/10 px-2 py-1 rounded-input border border-code-d/20">{Number(r.pressure).toFixed(1)} <span className="text-[10px] font-semibold text-code-d/70">bar</span></span>
                      ) : (
                        <span className="text-ink-3 italic">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 sm:px-5">
                      <div className="font-semibold text-ink-2 text-xs mb-1">K{String(r.key)}</div>
                      <div className="flex gap-1 flex-wrap">
                        {r.groutPass === "Re-Grout" ? (
                          <>
                            {Object.entries(Object.values(r.primaryPositions || {}).some(v => v === true) ? r.primaryPositions : (r.positions || {})).map(([pos, active]) => active && <span key={`p_${pos}`} className="px-1.5 py-0.5 bg-cyan-tint text-cyan-med text-[9px] rounded-badge border border-cyan-tint font-semibold leading-none">{String(pos)}</span>)}
                            {Object.entries(r.secondaryPositions || {}).map(([pos, active]) => active && <span key={`s_${pos}`} className="px-1.5 py-0.5 bg-code-c/10 text-code-c text-[9px] rounded-badge border border-code-c/30 font-semibold leading-none">{String(pos)}</span>)}
                          </>
                        ) : (
                          Object.entries(Object.values(r.primaryPositions || {}).some(v => v === true) ? r.primaryPositions : (r.positions || {})).map(([pos, active]) => active && <span key={pos} className="px-1.5 py-0.5 bg-cyan-tint text-cyan-med text-[9px] rounded-badge border border-cyan-tint font-semibold leading-none">{String(pos)}</span>)
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 sm:px-5 text-right text-ink-3 font-mono">{Number(r.partA || 0).toFixed(2)}</td>
                    <td className="py-3 px-4 sm:px-5 text-right text-ink-3 font-mono">{Number(r.partB || 0).toFixed(2)}</td>
                    <td className="py-3 px-4 sm:px-5 text-right font-semibold text-ink text-base font-mono">{Number(r.total || 0).toFixed(2)}</td>
                    <td className="py-3 px-4 sm:px-5 text-right font-semibold">
                      <span className={`px-2 py-1 rounded-badge ${Number(r.ratio) > 150 ? "bg-cyan-tint text-cyan-med" : Number(r.ratio) >= 100 ? "bg-sgreen-med/10 text-sgreen-dark" : "bg-code-d/10 text-code-d"}`}>{Number(r.ratio || 0).toFixed(1)}%</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="8" className="py-8 text-center text-ink-3 italic">No grout data for this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {summary.allRemarks.length > 0 && (
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-ink uppercase tracking-widest border-l-4 border-code-b pl-3 mb-4 sm:mb-5">Issues & Remarks</h3>
            <ul className="space-y-3 text-xs sm:text-sm text-ink-2 bg-code-b/5 p-5 rounded-card border border-code-b/20">
              {summary.allRemarks.map((rem, i) => (
                <li key={i} className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-start sm:items-center bg-surface p-3 rounded-input border border-line shadow-sm">
                  <span className="font-semibold text-code-b bg-code-b/10 px-2 py-1 rounded-badge whitespace-nowrap text-xs">[{String(rem.module)} - {String(rem.ring)}]</span>
                  <span className="font-medium text-ink-2 whitespace-pre-wrap">{String(rem.text)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* AI Summary Modal */}
      {showAIModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-navy-dark/50 backdrop-blur-md animate-fade-in no-print">
          <div className="bg-white rounded-modal w-full max-w-2xl shadow-modal overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[90vh] transform transition-all border border-line">
            <div className="px-6 py-5 text-white flex justify-between items-center shrink-0 bg-navy">
              <h3 className="font-semibold text-lg sm:text-xl flex items-center gap-3 tracking-tight">
                <Sparkles size={24} className="text-cyan-tint" />
                AI Executive Summary
              </h3>
              <button onClick={() => setShowAIModal(false)} className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"><X size={20} /></button>
            </div>

            <div className="p-6 sm:p-8 bg-surface-alt relative min-h-[200px] overflow-y-auto flex-1 hide-scrollbar">
              {isGeneratingAI ? (
                <div className="flex flex-col items-center justify-center py-12 text-cyan-med h-full gap-4">
                  <Loader2 size={48} className="animate-spin" />
                  <p className="font-semibold animate-pulse text-base sm:text-lg">กำลังวิเคราะห์ข้อมูลและร่างรายงาน...</p>
                </div>
              ) : (
                <div className="prose prose-sm sm:prose-base max-w-none text-ink-2 whitespace-pre-wrap leading-relaxed font-medium">{aiSummaryText}</div>
              )}
            </div>

            {!isGeneratingAI && (
              <div className="bg-surface px-6 py-4 border-t border-line flex flex-col sm:flex-row justify-between items-center shrink-0 gap-4">
                <p className="text-[10px] sm:text-xs text-ink-3 font-semibold flex items-center gap-1.5 text-center sm:text-left"><Sparkles size={12} /> เนื้อหา AI โปรดตรวจสอบ · "สร้าง Daily Report" ใช้ตัวเลขจากข้อมูลจริง (deterministic)</p>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button onClick={handleCreateDailyFromReport} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-sgreen-dark hover:opacity-90 text-white rounded-input font-semibold text-sm transition-colors shadow-card active:scale-95">
                    <FileSpreadsheet size={18} /> สร้าง Daily Report
                  </button>
                  {aiSummaryText && (
                    <button onClick={copyToClipboard} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-navy hover:bg-navy-dark text-white rounded-input font-semibold text-sm transition-colors shadow-card active:scale-95">
                      {copied ? <Check size={18} className="text-sgreen-med" /> : <Copy size={18} />}
                      {copied ? "คัดลอกแล้ว!" : "คัดลอกรายงาน"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportView;
