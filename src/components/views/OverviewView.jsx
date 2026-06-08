import React, { useMemo } from "react";
import { Clock, Layers, Droplet, ChevronRight } from "lucide-react";
import { formatDisplayTime } from "../../utils/formatters";
import { offsetRingNo, getRingNumeric } from "../../utils/helpers";
import MachineSwitcher from "../../ui-ux-pro-max/components/MachineSwitcher";

const OverviewView = ({ segmentRecords, groutRecords, setCurrentModule, setActiveTab, activeMachine, onMachineChange }) => {
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

  const statusAccent =
    liveStatus.state === "EXCAVATING"   ? "border-code-b"    :
    liveStatus.state === "INSTALLING"   ? "border-sgreen-med" :
    liveStatus.state === "WAITING_INSTALL" ? "border-ink-3"  :
    "border-navy";

  const pingColor =
    liveStatus.state === "EXCAVATING"   ? "bg-code-b"    :
    liveStatus.state === "INSTALLING"   ? "bg-sgreen-med" :
    "bg-navy";

  const headingColor =
    liveStatus.state === "EXCAVATING"   ? "text-code-b"    :
    liveStatus.state === "INSTALLING"   ? "text-sgreen-dark" :
    liveStatus.state === "WAITING_INSTALL" ? "text-ink-3"  :
    "text-navy";

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24 animate-fade-in">
      <div className="mb-6 no-print">
        <div className="text-xs font-semibold text-ink-3 uppercase tracking-wider mb-2">เลือกหัวเจาะ</div>
        <MachineSwitcher value={activeMachine} onChange={onMachineChange} size="lg" />
      </div>
      {/* Hero status card */}
      <div className={`bg-surface border border-line rounded-card shadow-card border-l-4 ${statusAccent} p-8 sm:p-10`}>
        <div className="flex items-center gap-2 mb-3">
          {liveStatus.state !== "IDLE" && (
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${pingColor}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${pingColor}`}></span>
            </span>
          )}
          <span className="text-xs font-semibold uppercase tracking-widest text-ink-3">Live Activity Status</span>
        </div>
        <h2 className={`text-2xl sm:text-3xl font-semibold mb-3 tracking-tight ${headingColor}`}>
          {liveStatus.state === "EXCAVATING"     && "กำลังขุดเจาะดิน"}
          {liveStatus.state === "INSTALLING"     && "กำลังประกอบ Ring"}
          {liveStatus.state === "WAITING_INSTALL" && "ขุดเจาะเสร็จ รอประกอบ"}
          {liveStatus.state === "IDLE"           && "เครื่องจักรจอดพัก"}
          {liveStatus.state === "IN_PROGRESS"    && "กำลังทำงาน"}
        </h2>
        <div className="text-base font-semibold text-ink-2 mb-6 flex items-center gap-3">
          Target Ring:
          <span className="font-mono bg-cyan-tint text-cyan-med px-3 py-1 rounded-input text-sm">
            {String(liveStatus.ring)}
          </span>
        </div>
        <div className="bg-surface-alt rounded-input px-4 py-3 inline-flex items-center gap-3">
          <Clock size={16} className="text-ink-3 shrink-0" />
          <p className="text-sm text-ink-2 font-medium">{String(liveStatus.desc)}</p>
        </div>
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Segment card */}
        <div
          className="bg-surface border border-line rounded-card shadow-card hover:shadow-hover transition-shadow duration-200 cursor-pointer group flex flex-col justify-between p-6 sm:p-8"
          onClick={() => { setCurrentModule("segment"); setActiveTab("record"); }}
        >
          <div>
            <div className="flex justify-between items-start mb-6">
              <div className="bg-sgreen-med/10 text-sgreen-dark p-3 rounded-input group-hover:scale-105 transition-transform duration-200">
                <Layers size={28} />
              </div>
              <div className="text-right">
                <div className="text-[10px] sm:text-xs font-semibold text-ink-3 uppercase tracking-widest">วงล่าสุดที่ติดตั้งเสร็จ</div>
                <div className="text-3xl sm:text-4xl font-mono font-semibold text-ink tracking-tight mt-1">{String(groutStatus.latestSeg)}</div>
              </div>
            </div>
            <p className="text-sm text-ink-2 mb-8 font-medium leading-relaxed">เข้าสู่หน้าบันทึกข้อมูลเวลาการขุดเจาะและการประกอบ Segment แบบละเอียด (ขุดเจาะ & ประกอบ)</p>
          </div>
          <button className="w-full py-3 border border-line rounded-input text-ink-2 group-hover:bg-cyan-tint group-hover:text-navy text-sm font-semibold transition-colors flex justify-center items-center gap-2">
            บันทึกข้อมูล Segment <ChevronRight size={16} />
          </button>
        </div>

        {/* Grout card */}
        <div
          className="bg-surface border border-line rounded-card shadow-card hover:shadow-hover transition-shadow duration-200 cursor-pointer group flex flex-col justify-between p-6 sm:p-8"
          onClick={() => { setCurrentModule("grout"); setActiveTab("record"); }}
        >
          <div>
            <div className="flex justify-between items-start mb-6">
              <div className="bg-cyan-tint text-navy p-3 rounded-input group-hover:scale-105 transition-transform duration-200">
                <Droplet size={28} />
              </div>
              <div className="text-right">
                <div className="text-[10px] sm:text-xs font-semibold text-ink-3 uppercase tracking-widest">ค้างฉีด Primary Grout</div>
                <div className="text-3xl sm:text-4xl font-mono font-semibold tracking-tight mt-1">
                  {Number(groutStatus.pending) > 0
                    ? <span className="text-code-d">{Number(groutStatus.pending)} วง</span>
                    : <span className="text-sgreen-dark">ครบถ้วน</span>
                  }
                </div>
              </div>
            </div>
            <p className="text-sm text-ink-2 mb-8 font-medium leading-relaxed">
              {Number(groutStatus.pending) > 0
                ? `วงล่าสุดที่ฉีดคือ ${groutStatus.latestGrout} (ตามหลังอยู่ ${groutStatus.pending} วง)`
                : `ฉีด Grout ตามติด Segment ล่าสุดเรียบร้อยแล้ว`
              }
            </p>
          </div>
          <button className="w-full py-3 border border-line rounded-input text-ink-2 group-hover:bg-cyan-tint group-hover:text-navy text-sm font-semibold transition-colors flex justify-center items-center gap-2">
            บันทึกข้อมูล Grout <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OverviewView;
