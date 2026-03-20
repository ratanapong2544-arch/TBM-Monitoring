import React, { useMemo } from "react";
import { Clock, Layers, Droplet, ChevronRight } from "lucide-react";
import { formatDisplayTime } from "../../utils/formatters";
import { offsetRingNo, getRingNumeric } from "../../utils/helpers";

const OverviewView = ({ segmentRecords, groutRecords, setCurrentModule, setActiveTab }) => {
  const liveStatus = useMemo(() => {
    if (segmentRecords.length === 0) return { state: "IDLE", ring: "-", desc: "ยังไม่มีข้อมูล", color: "slate" };
    const map = new Map();
    segmentRecords.forEach(rec => map.set(rec.ringNo, rec));
    const deduped = Array.from(map.values());
    const lastSeg = deduped[deduped.length - 1];

    if (lastSeg.status === "In Progress") {
      if (lastSeg.excavStartTime && !lastSeg.excavEndTime) return { state: "EXCAVATING", ring: String(lastSeg.ringNo), desc: `เริ่มขุดเมื่อ ${formatDisplayTime(lastSeg.excavStartTime)} น.`, color: "amber" };
      else if (lastSeg.excavEndTime && !lastSeg.installStartTime) return { state: "WAITING_INSTALL", ring: String(lastSeg.ringNo), desc: `รอติดตั้ง Segment (ขุดเสร็จ ${formatDisplayTime(lastSeg.excavEndTime)} น.)`, color: "slate" };
      else if (lastSeg.installStartTime && !lastSeg.installEndTime) return { state: "INSTALLING", ring: String(lastSeg.ringNo), desc: `เริ่มประกอบเมื่อ ${formatDisplayTime(lastSeg.installStartTime)} น.`, color: "emerald" };
      return { state: "IN_PROGRESS", ring: String(lastSeg.ringNo), desc: "กำลังดำเนินการบันทึกข้อมูล...", color: "blue" };
    } else {
      return { state: "IDLE", ring: String(offsetRingNo(lastSeg.ringNo, 1)), desc: "รอเริ่มขุดวงถัดไป", color: "slate" };
    }
  }, [segmentRecords]);

  const groutStatus = useMemo(() => {
    if (segmentRecords.length === 0) return { pending: 0, latestGrout: "-" };
    const completedSegs = segmentRecords.filter(s => s.status === "Completed");
    const latestSeg = completedSegs.length > 0 ? String(completedSegs[completedSegs.length - 1].ringNo) : "-";
    const latestGrout = groutRecords.length > 0 ? String(groutRecords[groutRecords.length - 1].ringNo) : "-";
    let pendingCount = 0;
    if (latestSeg !== "-" && latestGrout !== "-") {
      const segNum = getRingNumeric(latestSeg);
      const groutNum = getRingNumeric(latestGrout);
      pendingCount = Math.max(0, segNum - groutNum);
    }
    return { pending: pendingCount, latestGrout, latestSeg };
  }, [segmentRecords, groutRecords]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24 animate-fade-in">
      <div className={`rounded-3xl p-8 sm:p-10 text-white relative overflow-hidden shadow-2xl ${liveStatus.state === "EXCAVATING" ? "bg-gradient-to-br from-amber-500 to-orange-600 shadow-orange-500/20" :
        liveStatus.state === "INSTALLING" ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20" :
          liveStatus.state === "WAITING_INSTALL" ? "bg-gradient-to-br from-slate-600 to-slate-800 shadow-slate-500/20" :
            "bg-gradient-to-br from-blue-600 to-indigo-700 shadow-blue-500/20"
        }`}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            {liveStatus.state !== "IDLE" && <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span></span>}
            <span className="text-xs sm:text-sm font-extrabold uppercase tracking-widest opacity-90">Live Activity Status</span>
          </div>
          <h2 className="text-4xl sm:text-6xl font-black mb-2 tracking-tight drop-shadow-sm">
            {liveStatus.state === "EXCAVATING" && "กำลังขุดเจาะดิน"}
            {liveStatus.state === "INSTALLING" && "กำลังประกอบ Ring"}
            {liveStatus.state === "WAITING_INSTALL" && "ขุดเจาะเสร็จ รอประกอบ"}
            {liveStatus.state === "IDLE" && "เครื่องจักรจอดพัก"}
            {liveStatus.state === "IN_PROGRESS" && "กำลังทำงาน"}
          </h2>
          <div className="text-xl sm:text-3xl font-bold opacity-90 mb-8 flex items-center gap-3">
            Target Ring: <span className="bg-white/20 px-4 py-1 rounded-xl backdrop-blur-sm">{String(liveStatus.ring)}</span>
          </div>
          <div className="bg-black/20 backdrop-blur-md rounded-2xl p-4 sm:p-5 inline-flex items-center gap-3 border border-white/10 shadow-inner">
            <Clock size={20} className="opacity-80" />
            <p className="text-sm sm:text-base font-medium">{String(liveStatus.desc)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer group flex flex-col justify-between" onClick={() => { setCurrentModule("segment"); setActiveTab("record"); }}>
          <div>
            <div className="flex justify-between items-start mb-6">
              <div className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300"><Layers size={32} /></div>
              <div className="text-right">
                <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest">วงล่าสุดที่ติดตั้งเสร็จ</div>
                <div className="text-3xl sm:text-4xl font-black text-slate-800 tracking-tight mt-1">{String(groutStatus.latestSeg)}</div>
              </div>
            </div>
            <p className="text-sm text-slate-500 mb-8 font-medium leading-relaxed">เข้าสู่หน้าบันทึกข้อมูลเวลาการขุดเจาะและการประกอบ Segment แบบละเอียด (ขุดเจาะ & ประกอบ)</p>
          </div>
          <button className="w-full py-4 bg-slate-50 group-hover:bg-emerald-50 text-slate-600 group-hover:text-emerald-700 text-sm font-bold rounded-2xl border border-slate-200 transition-colors flex justify-center items-center gap-2">บันทึกข้อมูล Segment <ChevronRight size={18} /></button>
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer group flex flex-col justify-between" onClick={() => { setCurrentModule("grout"); setActiveTab("record"); }}>
          <div>
            <div className="flex justify-between items-start mb-6">
              <div className="bg-blue-50 text-blue-600 p-4 rounded-2xl group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-300"><Droplet size={32} /></div>
              <div className="text-right">
                <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest">ค้างฉีด Primary Grout</div>
                <div className="text-3xl sm:text-4xl font-black tracking-tight mt-1">{Number(groutStatus.pending) > 0 ? <span className="text-red-500">{Number(groutStatus.pending)} วง</span> : <span className="text-emerald-500">ครบถ้วน</span>}</div>
              </div>
            </div>
            <p className="text-sm text-slate-500 mb-8 font-medium leading-relaxed">{Number(groutStatus.pending) > 0 ? `วงล่าสุดที่ฉีดคือ ${groutStatus.latestGrout} (ตามหลังอยู่ ${groutStatus.pending} วง)` : `ฉีด Grout ตามติด Segment ล่าสุดเรียบร้อยแล้ว`}</p>
          </div>
          <button className="w-full py-4 bg-slate-50 group-hover:bg-blue-50 text-slate-600 group-hover:text-blue-700 text-sm font-bold rounded-2xl border border-slate-200 transition-colors flex justify-center items-center gap-2">บันทึกข้อมูล Grout <ChevronRight size={18} /></button>
        </div>
      </div>
    </div>
  );
};

export default OverviewView;
