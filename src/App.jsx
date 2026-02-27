import React, { useState, useMemo, useEffect } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import {
  Save,
  Activity,
  Droplet,
  Clock,
  FileText,
  LayoutDashboard,
  PlusCircle,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Info,
  Check,
  MapPin,
  Search,
  RefreshCw,
  X,
  Calendar,
  Edit,
  Trash2,
  Layers,
  TrendingUp,
  Printer,
  Settings,
  Image as ImageIcon,
  Loader2,
  PlayCircle,
  CheckCircle2,
  AlertCircle,
  Home,
  Users,
  Plus,
  CloudUpload
} from "lucide-react";

// ============================================================================
// การตั้งค่า Google Apps Script (Web App URL)
// ============================================================================
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbyRUl5BVmZYDhw_Z0Uo2LWBLmaQAaOjJZR4jLGw-MuxHIFcKEhu7FBF9tV33JAnKz1aTw/exec";

// --- Global Constants ---
const THEORETICAL_VOL = 3.1;
const VOL_120 = 3.72;
const VOL_150 = 4.65;

// --- Global Utilities & Formatters ---
const formatDisplayDate = (d) => {
  if (!d) return "";
  if (typeof d === "string" && d.includes("T")) {
    const dateObj = new Date(d);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    }
    return d.split("T")[0];
  }
  return d;
};

// แก้ปัญหาเวลาเพี้ยน (Timezone UTC to GMT+7)
const formatDisplayTime = (t) => {
  if (!t) return "";
  if (typeof t === "string" && t.includes("T")) {
    const d = new Date(t);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
    }
    const match = t.match(/T(\d{2}:\d{2})/);
    return match ? match[1] : t;
  }
  return t;
};

const offsetRingNo = (currentRingStr, offset) => {
  if (!currentRingStr) return "";
  const match = currentRingStr.match(/^(\D+)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const numStr = match[2];
    const nextNum = Math.max(0, parseInt(numStr, 10) + offset);
    return `${prefix}${String(nextNum).padStart(numStr.length, "0")}`;
  }
  return currentRingStr;
};

const getRingByOffsetFromHistory = (baseRingNo, offset, history) => {
  if (!baseRingNo || !history || history.length === 0)
    return offsetRingNo(baseRingNo, offset);
  const index = history.findIndex(
    (r) => r.ringNo.toUpperCase() === baseRingNo.toUpperCase()
  );
  if (index !== -1) {
    const targetIndex = index + offset;
    if (targetIndex >= 0 && targetIndex < history.length) {
      return history[targetIndex].ringNo;
    }
  }
  return offsetRingNo(baseRingNo, offset);
};

const parseCH = (val) => {
  if (typeof val === "string") {
    return parseFloat(val.replace(/\+/g, "").replace(/,/g, "")) || 0;
  }
  return parseFloat(val) || 0;
};

const formatCH = (val) => {
  if (val === null || val === undefined || val === "") return "";
  let num = parseFloat(String(val).replace(/\+/g, "").replace(/,/g, ""));
  if (isNaN(num)) return val;
  let isNegative = num < 0;
  num = Math.abs(num);
  let intPart = Math.floor(num);
  let decPart = (num - intPart).toFixed(2).substring(1);
  let intStr = intPart.toString();

  let km = "0";
  let m = intStr;
  if (intStr.length > 3) {
    km = intStr.slice(0, -3);
    m = intStr.slice(-3);
  } else {
    m = intStr.padStart(3, "0");
  }
  return `${isNegative ? "-" : ""}${km}+${m}${decPart}`;
};

const getRingNumeric = (ringStr) => {
  if (!ringStr) return 0;
  const match = String(ringStr).match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
};

const calculateSoilVolume = (length) => {
  const l = parseFloat(length) || 0;
  const radius = 5.7 / 2;
  const volume = Math.PI * Math.pow(radius, 2) * l;
  return volume.toFixed(2);
};

const handleFileUpload = (e, setFormData) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({
        ...prev,
        imageBase64: reader.result,
        imageName: `${Date.now()}_${file.name}`,
      }));
    };
    reader.readAsDataURL(file);
  }
};

const safeParseJSON = (jsonString, fallback) => {
  try {
    return typeof jsonString === 'string' ? JSON.parse(jsonString) : (jsonString || fallback);
  } catch (e) {
    return fallback;
  }
};

const apiCall = async (action, data) => {
  if (GAS_URL === "YOUR_WEB_APP_URL_HERE" || !GAS_URL.startsWith("http")) {
    throw new Error("URL ของ Google Apps Script ยังไม่ได้ถูกตั้งค่า");
  }
  try {
    const response = await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({ action, data }),
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow",
    });

    const textData = await response.text();
    const trimmedData = textData.trim();
    if (trimmedData.startsWith("<")) {
      throw new Error(
        "ระบบติด Permission HTML กรุณาตั้งค่า GAS เป็น 'ทุกคน (Anyone)'"
      );
    }
    return JSON.parse(trimmedData);
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
};

// --- Shared Components ---
const StatCard = ({ label, value, subtext, color, icon: Icon }) => (
  <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden flex flex-col justify-between">
    <div className={`absolute -right-2 -top-2 p-3 opacity-[0.07] ${color}`}>
      <Icon size={64} />
    </div>
    <div className="relative z-10">
      <div className="text-[10px] sm:text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">
        {label}
      </div>
      <div className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
        {value}
      </div>
    </div>
    {subtext && (
      <div
        className={`text-[9px] sm:text-[10px] font-bold mt-2 pt-2 border-t border-slate-100 ${color.replace(
          "text",
          "text-opacity-80"
        )} relative z-10`}
      >
        {subtext}
      </div>
    )}
  </div>
);

const RingSegment = ({ cx, cy, r, startAngle, endAngle, label, isSelected, onClick }) => {
  const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    };
  };
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  const d = [
    "M", cx, cy, "L", start.x, start.y, "A", r, r, 0, largeArcFlag, 0, end.x, end.y, "Z",
  ].join(" ");
  const midAngle = startAngle + (endAngle - startAngle) / 2;
  const labelPos = polarToCartesian(cx, cy, r * 0.72, midAngle);

  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      <path
        d={d}
        fill={isSelected ? "url(#diagonalHatch)" : "white"}
        stroke={isSelected ? "#2563EB" : "#E2E8F0"}
        strokeWidth={isSelected ? "2" : "1"}
        className="transition-all duration-300 ease-out hover:opacity-90 active:scale-95 origin-center"
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />
      <circle cx={labelPos.x} cy={labelPos.y} r="14" fill="white" className="shadow-sm" />
      <text
        x={labelPos.x} y={labelPos.y} dy="4" textAnchor="middle" fontSize="11" fontWeight="800" fill={isSelected ? "#2563EB" : "#94A3B8"} className="select-none pointer-events-none"
        transform={`rotate(${-midAngle + midAngle}, ${labelPos.x}, ${labelPos.y})`}
      >
        {label}
      </text>
    </g>
  );
};

const RingVisualizer = ({ selectedPositions, onTogglePosition, ringKey }) => {
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const r = 130;
  const segments = [
    { id: "K", label: "K", start: -12.5, end: 12.5 },
    { id: "B2", label: "B2", start: 12.5, end: 79.5 },
    { id: "C2", label: "C2", start: 79.5, end: 146.5 },
    { id: "A", label: "A", start: 146.5, end: 213.5 },
    { id: "C1", label: "C1", start: 213.5, end: 280.5 },
    { id: "B1", label: "B1", start: 280.5, end: 347.5 },
  ];
  const rotation = (parseInt(ringKey) % 16) * 22.5;

  return (
    <div className="relative flex flex-col items-center justify-center p-4">
      <div className="absolute inset-0 bg-blue-50 rounded-full blur-3xl opacity-30"></div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="relative z-10 drop-shadow-xl">
        <defs>
          <pattern id="diagonalHatch" patternUnits="userSpaceOnUse" width="8" height="8">
            <rect width="8" height="8" fill="#EFF6FF" />
            <path d="M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
          </pattern>
        </defs>
        <circle cx={cx} cy={cy} r={r + 8} fill="none" stroke="#CBD5E1" strokeWidth="1" strokeDasharray="4,4" />
        <g transform={`rotate(${rotation}, ${cx}, ${cy})`} className="transition-transform duration-700 cubic-bezier(0.34, 1.56, 0.64, 1)">
          {segments.map((seg) => (
            <RingSegment key={seg.id} cx={cx} cy={cy} r={r} startAngle={seg.start} endAngle={seg.end} label={seg.label} isSelected={selectedPositions[seg.id]} onClick={() => onTogglePosition(seg.id)} />
          ))}
          <circle cx={cx} cy={cy} r="6" fill="#3B82F6" className="shadow-md" />
          <path d={`M${cx},${cy - r + 25} L${cx},${cy - r + 45}`} stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" />
        </g>
      </svg>
      <div className="absolute bottom-0 bg-white/80 backdrop-blur px-3 py-1 rounded-full border border-slate-200 text-[10px] font-bold text-slate-500 shadow-sm">
        Rotation: {rotation}° (Key {ringKey})
      </div>
    </div>
  );
};

// ============================================================================
// Module Views
// ============================================================================

// --- 1. OVERVIEW VIEW ---
const OverviewView = ({ segmentRecords, groutRecords, setCurrentModule, setActiveTab }) => {
  const liveStatus = useMemo(() => {
    if (segmentRecords.length === 0) return { state: "IDLE", ring: "-", desc: "ยังไม่มีข้อมูล" };
    
    // หากลุ่มข้อมูล Ring เพื่อหาอันล่าสุด (กรณีมีขยะซ้ำซ้อน)
    const map = new Map();
    segmentRecords.forEach(rec => map.set(rec.ringNo, rec));
    const deduped = Array.from(map.values());
    const lastSeg = deduped[deduped.length - 1];
    
    if (lastSeg.status === "In Progress") {
      if (lastSeg.excavStartTime && !lastSeg.excavEndTime) {
        return { state: "EXCAVATING", ring: lastSeg.ringNo, desc: `เริ่มขุดเมื่อ ${formatDisplayTime(lastSeg.excavStartTime)} น.`, color: "amber" };
      } else if (lastSeg.excavEndTime && !lastSeg.installStartTime) {
        return { state: "WAITING_INSTALL", ring: lastSeg.ringNo, desc: `รอติดตั้ง Segment (ขุดเสร็จ ${formatDisplayTime(lastSeg.excavEndTime)} น.)`, color: "slate" };
      } else if (lastSeg.installStartTime && !lastSeg.installEndTime) {
        return { state: "INSTALLING", ring: lastSeg.ringNo, desc: `เริ่มประกอบเมื่อ ${formatDisplayTime(lastSeg.installStartTime)} น.`, color: "emerald" };
      }
      return { state: "IN_PROGRESS", ring: lastSeg.ringNo, desc: "กำลังดำเนินการบันทึกข้อมูล...", color: "blue" };
    } else {
      return { state: "IDLE", ring: offsetRingNo(lastSeg.ringNo, 1), desc: "รอเริ่มขุดวงถัดไป", color: "slate" };
    }
  }, [segmentRecords]);

  const groutStatus = useMemo(() => {
    if (segmentRecords.length === 0) return { pending: 0, latestGrout: "-" };
    
    const completedSegs = segmentRecords.filter(s => s.status === "Completed");
    const latestSeg = completedSegs.length > 0 ? completedSegs[completedSegs.length - 1].ringNo : "-";
    
    const latestGrout = groutRecords.length > 0 ? groutRecords[groutRecords.length - 1].ringNo : "-";
    
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
      <div className={`rounded-[2rem] p-6 sm:p-8 text-white relative overflow-hidden shadow-xl ${
        liveStatus.state === "EXCAVATING" ? "bg-gradient-to-br from-amber-500 to-orange-600 shadow-orange-500/30" :
        liveStatus.state === "INSTALLING" ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/30" :
        liveStatus.state === "WAITING_INSTALL" ? "bg-gradient-to-br from-slate-600 to-slate-800 shadow-slate-500/30" :
        "bg-gradient-to-br from-blue-600 to-indigo-700 shadow-blue-500/30"
      }`}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            {liveStatus.state !== "IDLE" && <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
            </span>}
            <span className="text-xs sm:text-sm font-bold uppercase tracking-widest opacity-90">Live Activity Status</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black mb-2 tracking-tight">
            {liveStatus.state === "EXCAVATING" && "กำลังขุดเจาะดิน"}
            {liveStatus.state === "INSTALLING" && "กำลังประกอบ Ring"}
            {liveStatus.state === "WAITING_INSTALL" && "ขุดเจาะเสร็จ รอประกอบ"}
            {liveStatus.state === "IDLE" && "เครื่องจักรจอดพัก"}
            {liveStatus.state === "IN_PROGRESS" && "กำลังทำงาน"}
          </h2>
          <div className="text-lg sm:text-2xl font-bold opacity-90 mb-6">
            Ring Target: {liveStatus.ring}
          </div>
          
          <div className="bg-black/20 backdrop-blur-sm rounded-xl p-3 sm:p-4 inline-block border border-white/10">
            <p className="text-sm sm:text-base font-medium flex items-center gap-2">
              <Clock size={16} /> {liveStatus.desc}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
             onClick={() => { setCurrentModule("segment"); setActiveTab("record"); }}>
          <div className="flex justify-between items-start mb-4">
            <div className="bg-emerald-100 text-emerald-700 p-3 rounded-2xl group-hover:scale-110 transition-transform">
              <Layers size={24} />
            </div>
            <div className="text-right">
              <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest">วงล่าสุดที่ติดตั้งเสร็จ</div>
              <div className="text-xl sm:text-2xl font-black text-slate-800">{groutStatus.latestSeg}</div>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mb-4">เข้าสู่หน้าบันทึกข้อมูลเวลาการขุดเจาะและการประกอบ Segment แบบละเอียด</p>
          <button className="w-full py-3 bg-slate-50 hover:bg-emerald-50 text-emerald-600 text-xs sm:text-sm font-bold rounded-xl border border-slate-200 transition-colors flex justify-center items-center gap-2">
            บันทึกข้อมูล Segment <ChevronRight size={16}/>
          </button>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
             onClick={() => { setCurrentModule("grout"); setActiveTab("record"); }}>
          <div className="flex justify-between items-start mb-4">
            <div className="bg-blue-100 text-blue-700 p-3 rounded-2xl group-hover:scale-110 transition-transform">
              <Droplet size={24} />
            </div>
            <div className="text-right">
              <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest">ค้างฉีด Primary Grout</div>
              <div className="text-xl sm:text-2xl font-black text-slate-800">
                {groutStatus.pending > 0 ? (
                  <span className="text-red-500">{groutStatus.pending} วง</span>
                ) : (
                  <span className="text-emerald-500">ครบถ้วน</span>
                )}
              </div>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mb-4">
            {groutStatus.pending > 0 
              ? `วงล่าสุดที่ฉีดคือ ${groutStatus.latestGrout} (ตามหลังอยู่ ${groutStatus.pending} วง)`
              : `ฉีด Grout ตามติด Segment ล่าสุดเรียบร้อยแล้ว`
            }
          </p>
          <button className="w-full py-3 bg-slate-50 hover:bg-blue-50 text-blue-600 text-xs sm:text-sm font-bold rounded-xl border border-slate-200 transition-colors flex justify-center items-center gap-2">
            บันทึกข้อมูล Grout <ChevronRight size={16}/>
          </button>
        </div>
      </div>
    </div>
  );
};


// --- 2. GROUT RECORD VIEW ---
const GroutRecordView = ({
  projectInfo,
  handleProjectInfoChange,
  groutRecords,
  setGroutRecords,
  segmentRecords,
  setCurrentModule,
  setActiveTab,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    ringNo: "",
    excavRing: "",
    pressure: "",
    partA: "",
    partB: "",
    keyType: "16",
    positions: { A: false, B1: false, B2: false, C1: false, C2: false, K: false },
    remark: "",
    imageBase64: "",
    imageName: "",
  });

  const [isKeyLinked, setIsKeyLinked] = useState(false);

  const isReGrout = useMemo(() => {
    if (!formData.ringNo) return false;
    return groutRecords.some((r) => r.ringNo.toUpperCase() === formData.ringNo.toUpperCase());
  }, [formData.ringNo, groutRecords]);

  useEffect(() => {
    if (groutRecords.length > 0 && segmentRecords.length > 0 && !formData.ringNo) {
      const lastRecord = groutRecords[groutRecords.length - 1];
      const nextGroutRing = getRingByOffsetFromHistory(lastRecord.ringNo, 2, segmentRecords);
      const latestSegmentRing = segmentRecords.length > 0 ? segmentRecords[segmentRecords.length - 1].ringNo : "";
      setFormData((prev) => ({ ...prev, ringNo: nextGroutRing, excavRing: latestSegmentRing }));
    }
  }, [groutRecords, segmentRecords]);

  useEffect(() => {
    if (formData.ringNo) {
      const segment = segmentRecords.find((s) => s.ringNo.toUpperCase() === formData.ringNo.toUpperCase());
      if (segment) {
        setFormData((prev) => prev.keyType !== segment.keyPos ? { ...prev, keyType: segment.keyPos } : prev);
        setIsKeyLinked(true);
      } else {
        setIsKeyLinked(false);
      }
    }
  }, [formData.ringNo, segmentRecords]);

  const currentTotal = (parseFloat(formData.partA || 0) + parseFloat(formData.partB || 0)).toFixed(2);
  const currentRatio = ((currentTotal / THEORETICAL_VOL) * 100).toFixed(1);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let newFormData = { ...formData, [name]: value };
    if (name === "ringNo") {
      newFormData.excavRing = getRingByOffsetFromHistory(value, 3, segmentRecords);
    }
    setFormData(newFormData);
  };

  const togglePosition = (pos) => setFormData((prev) => ({ ...prev, positions: { ...prev.positions, [pos]: !prev.positions[pos] } }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.ringNo || !formData.partA) return;
    setIsSaving(true);

    const existingRecord = groutRecords.find((r) => r.ringNo.toUpperCase() === formData.ringNo.toUpperCase());

    if (existingRecord) {
      let currentRemark = existingRecord.remark || "";
      if (!currentRemark.includes("ครั้งที่ 1")) {
        currentRemark = `ครั้งที่ 1 วันที่ ${formatDisplayDate(existingRecord.date)} ปริมาณ ${parseFloat(existingRecord.total).toFixed(2)}\n${currentRemark}`.trim();
      }
      const passMatches = currentRemark.match(/ครั้งที่ \d+/g);
      const nextPass = passMatches ? passMatches.length + 1 : 2;

      let appendedRemark = `ครั้งที่ ${nextPass} วันที่ ${formatDisplayDate(projectInfo.date)} ปริมาณ ${currentTotal}`;
      if (formData.remark) {
        appendedRemark += ` (${formData.remark})`;
      }
      const newRemark = `${currentRemark}\n${appendedRemark}`;

      const newPartA = parseFloat(existingRecord.partA || 0) + parseFloat(formData.partA || 0);
      const newPartB = parseFloat(existingRecord.partB || 0) + parseFloat(formData.partB || 0);
      const newTotal = newPartA + newPartB;
      const newRatio = (newTotal / THEORETICAL_VOL) * 100;

      const newPositions = { ...existingRecord.positions };
      for (const pos in formData.positions) {
        if (formData.positions[pos]) newPositions[pos] = true;
      }

      const updatedRecord = {
        ...existingRecord, 
        partA: newPartA.toFixed(2), partB: newPartB.toFixed(2), total: parseFloat(newTotal.toFixed(2)), ratio: parseFloat(newRatio.toFixed(1)),
        pressure: formData.pressure || existingRecord.pressure, remark: newRemark, positions: newPositions, groutPass: "Re-Grout", 
      };

      if (formData.imageBase64) {
        updatedRecord.imageBase64 = formData.imageBase64;
        updatedRecord.imageName = formData.imageName;
      }

      try {
        await apiCall("updateGrout", updatedRecord); 
        if (updatedRecord.imageBase64) updatedRecord.imageUrl = "Attached";
        setGroutRecords((prev) => prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r)));
        resetFormAfterSave(true);
      } catch (err) { alert("อัปเดตข้อมูลไม่สำเร็จ กรุณาลองใหม่: " + err.message); }
    } else {
      const newRecord = {
        id: `grout_${Date.now()}`, ...projectInfo, ...formData, key: formData.keyType, total: parseFloat(currentTotal), ratio: parseFloat(currentRatio), groutPass: "1st Pass",
      };
      try {
        await apiCall("addGrout", newRecord); 
        if (newRecord.imageBase64) newRecord.imageUrl = "Attached";
        setGroutRecords((prev) => [...prev, newRecord]);
        resetFormAfterSave(false);
      } catch (err) { alert("บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่: " + err.message); }
    }
    setIsSaving(false);
  };

  const resetFormAfterSave = (wasReGrout) => {
    setFormData((prev) => {
      const nextGroutRing = !wasReGrout ? getRingByOffsetFromHistory(prev.ringNo, 2, segmentRecords) : prev.ringNo;
      const latestSegmentRing = !wasReGrout ? (segmentRecords.length > 0 ? segmentRecords[segmentRecords.length - 1].ringNo : "") : prev.excavRing;
      return {
        ...prev, ringNo: nextGroutRing, excavRing: latestSegmentRing, pressure: "", partA: "", partB: "",
        positions: { A: false, B1: false, B2: false, C1: false, C2: false, K: false }, remark: "", imageBase64: "", imageName: "",
      };
    });
  };

  return (
    <div className="max-w-xl mx-auto pb-24 animate-slide-up">
      <form onSubmit={handleSubmit} className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-6 sm:px-8 py-5 sm:py-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
          <div className="relative z-10 flex justify-between items-center">
            <div>
              <h2 className="font-extrabold text-xl sm:text-2xl flex items-center gap-2">Grout Record</h2>
              <p className="text-blue-100 text-xs sm:text-sm mt-1 opacity-90">Enter details for the primary grout</p>
            </div>
            <div className="text-right">
              <div className="text-[10px] sm:text-xs bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 font-medium">
                Last: <span className="font-bold">{groutRecords.length > 0 ? groutRecords[groutRecords.length - 1].ringNo : "-"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-100 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50 transition-all duration-300 relative">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Working Date</label>
              <input type="date" name="date" value={projectInfo.date} onChange={handleProjectInfoChange} className="w-full bg-transparent text-base sm:text-lg font-black text-slate-800 outline-none cursor-pointer" />
            </div>
            <div className="bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-100 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50 transition-all duration-300 relative">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Working Shift</label>
              <select name="shift" value={projectInfo.shift} onChange={handleProjectInfoChange} className="w-full bg-transparent text-base sm:text-lg font-black text-slate-800 outline-none cursor-pointer">
                <option value="Day">☀️ Day Shift</option>
                <option value="Night">🌙 Night Shift</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-100 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50 transition-all duration-300 relative">
              <div className="flex justify-between items-center mb-1">
                <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Grouting Ring</label>
                <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${isReGrout ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                  {isReGrout ? "Re-Grout" : "1st Pass"}
                </span>
              </div>
              <input type="text" name="ringNo" required value={formData.ringNo} onChange={handleInputChange} className="w-full bg-transparent text-xl sm:text-2xl font-black text-slate-800 placeholder-slate-300 outline-none uppercase mt-1" placeholder="P-XXXX" />
              {isReGrout && <p className="text-[8px] sm:text-[9px] text-purple-600 font-bold mt-1">⚠️ เคย Grout แล้ว: บันทึกปริมาณเฉพาะส่วนที่ฉีดเพิ่ม</p>}
            </div>
            <div className="bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-100 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50 transition-all duration-300 relative flex flex-col justify-end">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex justify-between items-center">
                <span>Excavation Ring</span>
                <Activity size={12} className="text-blue-500" title="Auto filled from latest segment" />
              </label>
              <input type="text" name="excavRing" value={formData.excavRing} onChange={handleInputChange} className="w-full bg-transparent text-xl sm:text-2xl font-black text-slate-800 placeholder-slate-300 outline-none uppercase mt-1" placeholder="P-XXXX" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-[1.5rem] p-4 sm:p-5 shadow-sm relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  Key Segment
                  {isKeyLinked && <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-[4px] text-[8px] sm:text-[9px] flex items-center gap-1"><Check size={10} /> Synced</span>}
                </span>
                <span className={`text-base sm:text-lg font-black px-3 py-1 rounded-lg border ${isKeyLinked ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-blue-600 bg-blue-50 border-blue-100"}`}>
                  Key {formData.keyType}
                </span>
              </div>
              <input type="range" min="1" max="16" step="1" name="keyType" value={formData.keyType} onChange={handleInputChange} disabled={isKeyLinked} className={`w-full h-3 rounded-full appearance-none accent-blue-600 ${isKeyLinked ? "bg-emerald-200 cursor-not-allowed opacity-70" : "bg-slate-200 cursor-pointer"}`} />
            </div>
          </div>

          <div className="flex flex-col items-center py-2">
            <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-3 w-full">
              <div className="h-px bg-slate-200 flex-1"></div>
              <span>Tap Segments to Select</span>
              <div className="h-px bg-slate-200 flex-1"></div>
            </div>
            <div className="scale-90 sm:scale-100 transform origin-top">
              <RingVisualizer ringKey={formData.keyType} selectedPositions={formData.positions} onTogglePosition={togglePosition} />
            </div>
          </div>

          <div className="bg-slate-900 rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 text-white shadow-2xl relative overflow-hidden">
            <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-blue-500/20 rounded-full blur-[3rem] pointer-events-none"></div>
            <div className="relative z-10 grid grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
              <div className="bg-white/5 hover:bg-white/10 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-white/10 transition-colors focus-within:bg-white/10 focus-within:border-white/30">
                <label className="text-slate-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest block mb-1">Part A</label>
                <div className="flex items-baseline gap-1">
                  <input type="number" step="0.01" name="partA" value={formData.partA} onChange={handleInputChange} className="w-full bg-transparent text-lg sm:text-xl font-bold text-white placeholder-white/20 outline-none p-0 border-none focus:ring-0" placeholder="0.00" />
                  <span className="text-[10px] sm:text-xs text-slate-500 font-medium">m³</span>
                </div>
              </div>
              <div className="bg-white/5 hover:bg-white/10 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-white/10 transition-colors focus-within:bg-white/10 focus-within:border-white/30">
                <label className="text-slate-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest block mb-1">Part B</label>
                <div className="flex items-baseline gap-1">
                  <input type="number" step="0.01" name="partB" value={formData.partB} onChange={handleInputChange} className="w-full bg-transparent text-lg sm:text-xl font-bold text-white placeholder-white/20 outline-none p-0 border-none focus:ring-0" placeholder="0.00" />
                  <span className="text-[10px] sm:text-xs text-slate-500 font-medium">m³</span>
                </div>
              </div>
              <div className="bg-white/5 hover:bg-white/10 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-white/10 transition-colors focus-within:bg-white/10 focus-within:border-white/30">
                <label className="text-slate-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest block mb-1">Pressure</label>
                <div className="flex items-baseline gap-1">
                  <input type="number" step="0.1" name="pressure" value={formData.pressure} onChange={handleInputChange} className="w-full bg-transparent text-lg sm:text-xl font-bold text-white placeholder-white/20 outline-none p-0 border-none focus:ring-0" placeholder="0.0" />
                  <span className="text-[10px] sm:text-xs text-slate-500 font-medium">bar</span>
                </div>
              </div>
            </div>

            <div className="relative z-10 flex items-end justify-between bg-black/20 p-4 sm:p-5 rounded-2xl border border-white/5">
              <div>
                <span className="text-slate-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest block mb-1">Total Volume</span>
                <div className="text-3xl sm:text-4xl font-black text-white">{currentTotal} <span className="text-sm sm:text-lg font-medium text-slate-400">m³</span></div>
              </div>
              <div className="text-right">
                <span className="text-slate-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest block mb-1">Ratio</span>
                <div className={`text-3xl sm:text-4xl font-black ${currentRatio > 150 ? "text-purple-400 drop-shadow-[0_0_12px_rgba(168,85,247,0.3)]" : currentRatio >= 100 ? "text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.3)]" : "text-red-400 drop-shadow-[0_0_12px_rgba(248,113,113,0.3)]"}`}>
                  {currentRatio}<span className="text-lg sm:text-xl font-bold">%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 border border-slate-200 rounded-2xl shadow-sm">
            <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Problem / Remark (ปัญหา/อุปสรรค)</label>
            <textarea name="remark" value={formData.remark} onChange={handleInputChange} rows="2" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition-all mb-3" placeholder="ไม่มี..."></textarea>
            <div className="border-t border-slate-100 pt-3">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><ImageIcon size={12} /> Attach Photo (บันทึกรูปลง Drive)</label>
              <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, setFormData)} className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all cursor-pointer w-full" />
            </div>
          </div>

          <button type="submit" disabled={isSaving} className={`w-full text-white font-bold text-base sm:text-lg py-4 sm:py-5 rounded-2xl shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${isSaving ? "bg-slate-400 cursor-not-allowed shadow-none" : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 shadow-blue-500/30"}`}>
            {isSaving ? <><Loader2 size={24} className="animate-spin" /> Saving...</> : <><Save size={24} /> Confirm & Save Record</>}
          </button>
        </div>
      </form>
    </div>
  );
};


// --- 3. SEGMENT RECORD VIEW ---
const SegmentRecordView = ({
  projectInfo,
  handleProjectInfoChange,
  segmentRecords,
  setSegmentRecords,
  setCurrentModule,
  setActiveTab,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    id: null, 
    ringNo: "",
    typeRing: "C1",
    keyPos: "16",
    startCH: "",
    finishCH: "",
    length: "1.40",
    remark: "",
    excavStartTime: "",
    excavEndTime: "",
    soilType: "",
    excavImageBase64: "",
    excavImageName: "",
    installStartTime: "",
    installEndTime: "",
    imageBase64: "",
    imageName: "",
    status: "Completed",
    installType: "Permanent",
  });

  useEffect(() => {
    if (segmentRecords.length > 0 && !formData.ringNo) {
      const map = new Map();
      segmentRecords.forEach(rec => map.set(rec.ringNo, rec));
      const deduped = Array.from(map.values());
      const lastRecord = deduped[deduped.length - 1];

      if (lastRecord.status === "In Progress") {
        setFormData((prev) => ({
          ...prev,
          id: lastRecord.id, 
          ringNo: lastRecord.ringNo,
          typeRing: lastRecord.typeRing || "C1",
          keyPos: lastRecord.keyPos || "16",
          startCH: lastRecord.startCH,
          finishCH: lastRecord.finishCH,
          length: lastRecord.length || "1.40",
          status: "In Progress", 
          installType: lastRecord.installType || "Permanent",
          excavStartTime: lastRecord.excavStartTime || "",
          excavEndTime: lastRecord.excavEndTime || "",
          soilType: lastRecord.soilType || "",
          installStartTime: lastRecord.installStartTime || lastRecord.startTime || "",
          installEndTime: lastRecord.installEndTime || lastRecord.endTime || "",
        }));
      } else {
        const lastFinishRaw = parseCH(lastRecord.finishCH);
        setFormData((prev) => ({
          ...prev,
          id: null, 
          ringNo: offsetRingNo(lastRecord.ringNo, 1),
          startCH: formatCH(lastFinishRaw),
          finishCH: formatCH(lastFinishRaw - parseFloat(prev.length || 0)),
          status: "In Progress",
          installType: "Permanent", 
          soilType: "",
          excavImageBase64: "",
          excavImageName: "",
        }));
      }
    }
  }, [segmentRecords]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let newFormData = { ...formData, [name]: value };

    if (name === "ringNo") {
      const upperVal = value.toUpperCase();
      if (upperVal.startsWith("T")) {
        newFormData.installType = "Temporary";
      } else if (upperVal.startsWith("P")) {
        newFormData.installType = "Permanent";
      }
    }

    if (name === "startCH" || name === "length") {
      const start = parseCH(newFormData.startCH);
      const len = parseFloat(newFormData.length) || 0;
      if (start !== 0) newFormData.finishCH = formatCH(start - len);
    }

    if (name === "installEndTime") {
      newFormData.status = value ? "Completed" : "In Progress";
    }

    setFormData(newFormData);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.ringNo) return; 
    setIsSaving(true);

    const recordData = {
      ...projectInfo,
      ...formData,
      soilVolume: calculateSoilVolume(formData.length), 
    };

    try {
      if (formData.id) {
        recordData.id = formData.id;
        await apiCall("updateSegment", recordData);
        if (recordData.imageBase64) recordData.imageUrl = "Attached";
        setSegmentRecords((prev) => prev.map((r) => (r.id === recordData.id ? recordData : r)));
      } else {
        recordData.id = `seg_${Date.now()}`;
        await apiCall("addSegment", recordData);
        if (recordData.imageBase64) recordData.imageUrl = "Attached";
        setSegmentRecords((prev) => [...prev, recordData]);
      }

      setFormData((prev) => {
        const isCompleted = prev.status === "Completed";
        return {
          ...prev,
          id: isCompleted ? null : recordData.id, 
          ringNo: isCompleted ? offsetRingNo(prev.ringNo, 1) : prev.ringNo,
          startCH: isCompleted ? prev.finishCH : prev.startCH,
          finishCH: isCompleted ? formatCH(parseCH(prev.finishCH) - parseFloat(prev.length)) : prev.finishCH,
          remark: "",
          excavStartTime: isCompleted ? "" : prev.excavStartTime,
          excavEndTime: isCompleted ? "" : prev.excavEndTime,
          soilType: isCompleted ? "" : prev.soilType,
          excavImageBase64: isCompleted ? "" : prev.excavImageBase64,
          excavImageName: isCompleted ? "" : prev.excavImageName,
          installStartTime: isCompleted ? "" : prev.installStartTime,
          installEndTime: isCompleted ? "" : prev.installEndTime,
          imageBase64: "",
          imageName: "",
          status: isCompleted ? "In Progress" : prev.status,
          installType: isCompleted ? "Permanent" : prev.installType,
        };
      });
    } catch (err) {
      alert("บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่: " + err.message);
    }
    setIsSaving(false);
  };

  return (
    <div className="max-w-2xl mx-auto pb-24 animate-slide-up">
      <form onSubmit={handleSubmit} className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <div className="bg-gradient-to-br from-teal-600 to-emerald-700 px-6 sm:px-8 py-5 sm:py-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
          <div className="relative z-10 flex justify-between items-center">
            <div>
              <h2 className="font-extrabold text-xl sm:text-2xl flex items-center gap-2"><Layers size={24} /> Segment Install</h2>
              <p className="text-emerald-100 text-xs sm:text-sm mt-1 opacity-90">Record daily segment installation (Save partially allowed)</p>
            </div>
            <div className="text-right">
              <div className="text-[10px] sm:text-xs bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 font-medium">
                Last: <span className="font-bold">{segmentRecords.length > 0 ? segmentRecords[segmentRecords.length - 1].ringNo : "-"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-100 focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-50 transition-all">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Working Date</label>
              <input type="date" name="date" value={projectInfo.date} onChange={handleProjectInfoChange} className="w-full bg-transparent text-base sm:text-lg font-black text-slate-800 outline-none cursor-pointer" />
            </div>
            <div className="bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-100 focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-50 transition-all">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Working Shift</label>
              <select name="shift" value={projectInfo.shift} onChange={handleProjectInfoChange} className="w-full bg-transparent text-base sm:text-lg font-black text-slate-800 outline-none cursor-pointer">
                <option value="Day">☀️ Day Shift</option>
                <option value="Night">🌙 Night Shift</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-100 focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-50 transition-all">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Ring No.</label>
              <input type="text" name="ringNo" required value={formData.ringNo} onChange={handleInputChange} className="w-full bg-transparent text-xl sm:text-2xl font-black text-slate-800 outline-none uppercase" placeholder="P-XXXX" />
            </div>
            <div className="bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-100 focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-50 transition-all">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Install Type</label>
              <select name="installType" value={formData.installType} onChange={handleInputChange} className={`w-full bg-transparent text-lg sm:text-xl font-black outline-none cursor-pointer ${formData.installType === "Temporary" ? "text-amber-600" : "text-emerald-700"}`}>
                <option value="Permanent" className="text-slate-800">ถาวร (Permanent)</option>
                <option value="Temporary" className="text-slate-800">ชั่วคราว (Temporary)</option>
              </select>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-[1.5rem] p-4 sm:p-5 shadow-sm space-y-4 sm:space-y-5 relative overflow-hidden">
            <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest border-l-2 border-amber-500 pl-2">Excavation Phase (ขุดเจาะ)</div>
            <div className="grid grid-cols-2 gap-4 sm:gap-6 relative z-10 mt-2">
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-slate-500 flex items-center gap-1.5 mb-2"><PlayCircle size={12} className="text-amber-500" /> Start</label>
                <input type="time" name="excavStartTime" value={formData.excavStartTime} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base text-slate-800 font-bold outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-50 transition-all" />
              </div>
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-slate-500 flex items-center gap-1.5 mb-2"><CheckCircle2 size={12} className="text-amber-500" /> Finish</label>
                <input type="time" name="excavEndTime" value={formData.excavEndTime} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base text-slate-800 font-bold outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-50 transition-all" />
              </div>
            </div>

            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-4 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-50 transition-all relative z-10">
              <label className="text-[10px] sm:text-xs font-bold text-slate-500 mb-1.5 block">ลักษณะของดิน (Soil Type)</label>
              <input type="text" name="soilType" value={formData.soilType} onChange={handleInputChange} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none mb-3" placeholder="เช่น ดินเหนียวปนทราย, Soft Clay..." />
              
              <div className="border-t border-slate-100 pt-3">
                <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><ImageIcon size={12} /> ภาพถ่ายดินขุด (ไม่บังคับ)</label>
                <input type="file" accept="image/*" onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setFormData((prev) => ({
                        ...prev,
                        excavImageBase64: reader.result,
                        excavImageName: `excav_${Date.now()}_${file.name}`,
                      }));
                    };
                    reader.readAsDataURL(file);
                  }
                }} className="text-xs text-slate-500 file:mr-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 transition-all cursor-pointer w-full" />
              </div>
            </div>

            <div className="border-t border-slate-100 relative z-10 my-2"></div>
            <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest border-l-2 border-emerald-500 pl-2">Installation Phase (ประกอบ)</div>

            <div className="grid grid-cols-2 gap-4 sm:gap-6 relative z-10 mt-2">
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-slate-500 flex items-center gap-1.5 mb-2"><PlayCircle size={12} className="text-emerald-500" /> Start</label>
                <input type="time" name="installStartTime" value={formData.installStartTime} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base text-slate-800 font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50 transition-all" />
              </div>
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-slate-500 flex items-center gap-1.5 mb-2"><CheckCircle2 size={12} className="text-emerald-500" /> Finish</label>
                <input type="time" name="installEndTime" value={formData.installEndTime} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base text-slate-800 font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50 transition-all" />
              </div>
            </div>

            <div className="pt-3 sm:pt-4 border-t border-slate-100 relative z-10 grid grid-cols-2 gap-4 sm:gap-6">
              <div className="flex flex-col justify-center">
                <div className="flex justify-between items-center mb-1 sm:mb-2">
                  <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Status & Length</label>
                  <select name="status" value={formData.status} onChange={handleInputChange} className={`text-[9px] font-bold rounded px-1 outline-none cursor-pointer ${formData.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                    <option value="Completed">✔ Completed</option>
                    <option value="In Progress">⏳ In Progress</option>
                  </select>
                </div>
                <input type="number" step="0.01" name="length" value={formData.length} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 sm:px-4 py-2 sm:py-3 text-base sm:text-lg font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50 transition-all text-center" />
                
                <div className="mt-2 bg-emerald-50 rounded-lg p-1.5 text-center border border-emerald-100">
                  <span className="text-[9px] sm:text-[10px] text-emerald-600 font-bold uppercase tracking-widest block">Soil Vol. (ดินขุด)</span>
                  <span className="text-sm sm:text-base font-black text-emerald-700">{calculateSoilVolume(formData.length)} m³</span>
                </div>
              </div>
              <div className="flex flex-col justify-center">
                <div className="flex justify-between items-center mb-2 sm:mb-3">
                  <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Key Pos</span>
                  <span className="text-base sm:text-lg font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 sm:px-3 sm:py-1 rounded-lg">K{formData.keyPos}</span>
                </div>
                <input type="range" min="1" max="16" step="1" name="keyPos" value={formData.keyPos} onChange={handleInputChange} className="w-full h-2 sm:h-3 bg-slate-200 rounded-full appearance-none cursor-pointer accent-emerald-600" />
                <div className="flex justify-between text-[9px] sm:text-[10px] font-bold text-slate-300 mt-2 px-1">
                  <span>1</span><span>4</span><span>8</span><span>12</span><span>16</span>
                </div>
                <select name="typeRing" value={formData.typeRing} onChange={handleInputChange} className="mt-3 w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-slate-700 outline-none">
                   <option value="C1">C1</option>
                   <option value="ST1">ST1</option>
                   <option value="ST2">ST2</option>
                   <option value="SX">SX</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-emerald-500/20 rounded-full blur-[3rem] pointer-events-none"></div>
            <div className="relative z-10 flex items-center justify-between gap-2 sm:gap-4">
              <div className="flex-1">
                <label className="text-emerald-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest block mb-1">Start (CH.)</label>
                <input type="text" name="startCH" value={formData.startCH} onChange={handleInputChange} onBlur={(e) => setFormData((prev) => ({ ...prev, startCH: formatCH(prev.startCH) }))} className="w-full bg-white/10 border border-white/10 rounded-xl px-2 sm:px-4 py-2 sm:py-3 text-lg sm:text-2xl font-black text-white outline-none focus:bg-white/20 transition-all text-center" placeholder="8+815.68" />
              </div>
              <div className="text-slate-500 pt-5 text-sm sm:text-base">➡</div>
              <div className="flex-1">
                <label className="text-emerald-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest block mb-1">Finish (CH.)</label>
                <input type="text" name="finishCH" value={formData.finishCH} onChange={handleInputChange} onBlur={(e) => setFormData((prev) => ({ ...prev, finishCH: formatCH(prev.finishCH) }))} className="w-full bg-white/10 border border-white/10 rounded-xl px-2 sm:px-4 py-2 sm:py-3 text-lg sm:text-2xl font-black text-white outline-none focus:bg-white/20 transition-all text-center" placeholder="8+814.28" />
              </div>
            </div>
          </div>

          <div className="bg-white p-4 border border-slate-200 rounded-2xl shadow-sm">
            <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Problem / Remark</label>
            <textarea name="remark" value={formData.remark} onChange={handleInputChange} rows="2" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50 transition-all mb-3" placeholder="ไม่มี..."></textarea>
          </div>

          <button type="submit" disabled={isSaving} className={`w-full text-white font-bold text-base sm:text-lg py-4 sm:py-5 rounded-2xl shadow-xl transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 ${isSaving ? "bg-slate-400 cursor-not-allowed shadow-none" : "bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 shadow-emerald-500/30"}`}>
            {isSaving ? <><Loader2 size={24} className="animate-spin" /> Saving...</> : <><Save size={24} /> {formData.status === "In Progress" ? "Save Partial Status" : "Save Completed Ring"}</>}
          </button>
        </div>
      </form>
    </div>
  );
};

// --- 4. GROUT DASHBOARD VIEW ---
const GroutDashboardView = ({ groutRecords, segmentRecords, setGroutRecords }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const [filterMode, setFilterMode] = useState("all");
  const [chartWindow, setChartWindow] = useState(20);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filterShift, setFilterShift] = useState("All");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditKeyLinked, setIsEditKeyLinked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const chartData = useMemo(() => {
    let baseData = filterShift === "All" ? groutRecords : groutRecords.filter((r) => r.shift === filterShift);
    baseData = baseData.map((r) => ({
      ...r,
      displayRing: r.groutPass === "Re-Grout" ? `${r.ringNo} (Re)` : r.ringNo,
    }));

    if (filterMode === "all") {
      return baseData;
    } else if (filterMode === "range" && rangeStart && rangeEnd) {
      const startNum = getRingNumeric(rangeStart);
      const endNum = getRingNumeric(rangeEnd);
      return baseData.filter((r) => {
        const rNum = getRingNumeric(r.ringNo);
        return rNum >= startNum && rNum <= endNum;
      }).sort((a, b) => getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo));
    } else if (filterMode === "daily") {
      return baseData.filter((r) => formatDisplayDate(r.date) === filterDate);
    } else if (filterMode === "monthly") {
      return baseData.filter((r) => formatDisplayDate(r.date).startsWith(filterMonth));
    } else {
      const start = Math.max(0, baseData.length - chartWindow);
      return baseData.slice(start, baseData.length);
    }
  }, [groutRecords, filterMode, chartWindow, rangeStart, rangeEnd, filterDate, filterMonth, filterShift]);

  const filteredRecords = useMemo(() => [...chartData].reverse(), [chartData]);
  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
  const tableData = useMemo(() => filteredRecords.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredRecords, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [filterMode, chartWindow, rangeStart, rangeEnd, filterDate, filterMonth, filterShift]);

  useEffect(() => {
    if (isEditing && editFormData?.ringNo) {
      const segment = segmentRecords.find((s) => s.ringNo.toUpperCase() === editFormData.ringNo.toUpperCase());
      if (segment) {
        setEditFormData((prev) => prev.key !== segment.keyPos ? { ...prev, key: segment.keyPos } : prev);
        setIsEditKeyLinked(true);
      } else {
        setIsEditKeyLinked(false);
      }
    }
  }, [isEditing, editFormData?.ringNo, segmentRecords]);

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData((prev) => {
      let updated = { ...prev, [name]: value };
      if (name === "ringNo") {
        updated.excavRing = getRingByOffsetFromHistory(value, 3, segmentRecords);
      }
      return updated;
    });
  };

  const handleEditPosition = (pos) => setEditFormData((prev) => ({ ...prev, positions: { ...prev.positions, [pos]: !prev.positions[pos] } }));

  const handleSaveEdit = async () => {
    setIsSaving(true);
    const total = parseFloat(editFormData.partA || 0) + parseFloat(editFormData.partB || 0);
    const ratio = (total / THEORETICAL_VOL) * 100;
    const updatedRecord = { ...editFormData, total: parseFloat(total.toFixed(2)), ratio: parseFloat(ratio.toFixed(2)) };

    try {
      await apiCall("updateGrout", updatedRecord);
      setGroutRecords((prev) => prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r)));
      setSelectedRecord(updatedRecord);
      setIsEditing(false);
    } catch (e) {
      alert("อัปเดตข้อมูลล้มเหลว");
    }
    setIsSaving(false);
  };

  const handleDeleteRecord = async () => {
    setIsSaving(true);
    try {
      await apiCall("deleteGrout", { id: selectedRecord.id });
      setGroutRecords((prev) => prev.filter((r) => r.id !== selectedRecord.id));
      setSelectedRecord(null);
      setIsEditing(false);
      setShowDeleteConfirm(false);
    } catch (e) {
      alert("ลบข้อมูลล้มเหลว");
    }
    setIsSaving(false);
  };

  const editTotal = isEditing ? (parseFloat(editFormData.partA || 0) + parseFloat(editFormData.partB || 0)).toFixed(2) : 0;
  const editRatio = isEditing ? ((editTotal / THEORETICAL_VOL) * 100).toFixed(1) : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-fade-in pb-24">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Unique Rings" value={new Set(groutRecords.map((r) => r.ringNo)).size} subtext="Records found" color="text-blue-600" icon={FileText} />
        <StatCard label="Avg. Volume" value={(groutRecords.reduce((acc, r) => acc + r.total, 0) / (groutRecords.length || 1)).toFixed(2)} subtext="Cubic Meters" color="text-emerald-600" icon={Droplet} />
        <StatCard label="Avg. Ratio" value={`${(groutRecords.reduce((acc, r) => acc + r.ratio, 0) / (groutRecords.length || 1)).toFixed(1)}%`} subtext="Efficiency" color="text-orange-500" icon={Activity} />
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-4 sm:p-5 rounded-2xl shadow-lg text-white relative overflow-hidden">
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex items-center gap-2 font-bold text-sm sm:text-base"><BarChart3 size={18} /> Status</div>
            <div className="text-xs sm:text-sm opacity-90">Data Synced</div>
          </div>
          <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white/20 rounded-full blur-xl"></div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-4 sm:mb-6 gap-4">
          <h3 className="font-bold text-slate-800 text-base sm:text-lg">Grout Volume Trend</h3>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-start sm:items-center w-full lg:w-auto bg-slate-50 p-2 rounded-xl border border-slate-100">
            <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm w-full sm:w-auto overflow-x-auto">
              <button onClick={() => setFilterMode("all")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${filterMode === "all" ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>All</button>
              <button onClick={() => setFilterMode("lastN")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${filterMode === "lastN" ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>Last N</button>
              <button onClick={() => setFilterMode("daily")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${filterMode === "daily" ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>Daily</button>
              <button onClick={() => setFilterMode("monthly")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${filterMode === "monthly" ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>Monthly</button>
              <button onClick={() => setFilterMode("range")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${filterMode === "range" ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>Range</button>
            </div>

            {filterMode === "lastN" && (
              <div className="flex gap-1 w-full sm:w-auto overflow-x-auto">
                {[10, 20, 50, 100].map((val) => (
                  <button key={val} onClick={() => setChartWindow(val)} className={`px-3 py-1.5 text-xs rounded-md font-medium border transition whitespace-nowrap ${chartWindow === val ? "bg-blue-100 border-blue-200 text-blue-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>Last {val}</button>
                ))}
              </div>
            )}
            {filterMode === "daily" && <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 w-full sm:w-auto" />}
            {filterMode === "monthly" && <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 w-full sm:w-auto" />}
            {filterMode === "range" && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <span className="absolute left-2 top-1.5 text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase">From</span>
                  <input type="text" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} placeholder="P1" className="pl-2 pt-4 pb-1 w-full sm:w-20 text-xs font-bold border rounded-lg focus:ring-1 focus:ring-blue-500 outline-none uppercase text-slate-700" />
                </div>
                <span className="text-slate-400">-</span>
                <div className="relative flex-1 sm:flex-none">
                  <span className="absolute left-2 top-1.5 text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase">To</span>
                  <input type="text" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} placeholder="P10" className="pl-2 pt-4 pb-1 w-full sm:w-20 text-xs font-bold border rounded-lg focus:ring-1 focus:ring-blue-500 outline-none uppercase text-slate-700" />
                </div>
              </div>
            )}
            <div className="w-px h-6 bg-slate-200 hidden sm:block"></div>
            <select value={filterShift} onChange={(e) => setFilterShift(e.target.value)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 bg-white cursor-pointer w-full sm:w-auto">
              <option value="All">All Shifts</option>
              <option value="Day">Day Shift</option>
              <option value="Night">Night Shift</option>
            </select>
          </div>
        </div>

        <div className="h-[300px] sm:h-[400px] w-full">
          <ResponsiveContainer>
            <AreaChart data={chartData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis dataKey="displayRing" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 6]} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: "12px" }} itemStyle={{ fontSize: "12px", fontWeight: "bold" }} />
              <ReferenceLine y={THEORETICAL_VOL} stroke="#FB923C" strokeDasharray="5 5" label={{ position: "insideTopRight", value: "100% (3.1)", fill: "#FB923C", fontSize: 9 }} />
              <ReferenceLine y={VOL_120} stroke="#4ADE80" strokeDasharray="5 5" label={{ position: "insideTopRight", value: "120%", fill: "#4ADE80", fontSize: 9 }} />
              <ReferenceLine y={VOL_150} stroke="#F472B6" strokeDasharray="5 5" label={{ position: "insideTopRight", value: "150%", fill: "#F472B6", fontSize: 9 }} />
              <Area type="monotone" dataKey="total" stroke="#3B82F6" strokeWidth={2} fill="url(#colorTotal)" dot={{ r: 3, fill: "#3B82F6", stroke: "#fff", strokeWidth: 2 }} label={{ position: "top", fill: "#475569", fontSize: 9, fontWeight: 600, formatter: (val) => val.toFixed(2) }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center bg-slate-50/50 gap-2">
          <h3 className="font-bold text-slate-700 text-sm sm:text-base">Detailed Grout Logs</h3>
          <div className="flex gap-2 self-end sm:self-auto">
            <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} className="p-1.5 border rounded-md bg-white hover:bg-slate-50"><ChevronLeft size={14} /></button>
            <span className="px-3 py-1.5 text-[10px] sm:text-xs border rounded-md bg-white">Page {currentPage} of {totalPages || 1}</span>
            <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} className="p-1.5 border rounded-md bg-white hover:bg-slate-50"><ChevronRight size={14} /></button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm text-left whitespace-nowrap">
            <thead className="text-[10px] sm:text-xs text-slate-400 uppercase bg-slate-50 border-b">
              <tr>
                <th className="px-4 sm:px-6 py-3 sm:py-4">Ring / Timeline</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4">Config (Key & Pos)</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-right">Volume</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {tableData.map((record, index) => (
                <tr key={`${record.id}-${index}`} onClick={() => { setSelectedRecord(record); setIsEditing(false); }} className="hover:bg-blue-50/50 transition-colors group cursor-pointer">
                  <td className="px-4 sm:px-6 py-3 sm:py-4">
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-slate-800 text-sm sm:text-base">{record.ringNo}</div>
                      {record.groutPass === "Re-Grout" && <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-[4px] text-[8px] sm:text-[9px] font-bold">Re-Grout</span>}
                    </div>
                    <div className="text-[10px] sm:text-xs text-slate-500 mt-1">Ex: {record.excavRing}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`w-2 h-2 rounded-full ${record.shift === "Day" ? "bg-orange-400" : "bg-indigo-500"}`}></span>
                      <span className="text-[10px] sm:text-xs text-slate-500 font-medium">{formatDisplayDate(record.date)} ({record.shift})</span>
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4">
                    <div className="text-[10px] sm:text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600 inline-block mb-1">Key {record.key}</div>
                    <div className="flex gap-1 flex-wrap">
                      {Object.entries(record.positions || {}).map(([pos, active]) => active && <span key={pos} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[9px] sm:text-[10px] rounded border border-blue-100 font-bold">{pos}</span>)}
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4 text-right">
                    <div className="font-bold text-slate-800 text-sm sm:text-base">{record.total.toFixed(2)} m³</div>
                    <div className="text-[10px] sm:text-xs text-slate-400 mt-1">{record.pressure} bar</div>
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4 text-right">
                    <span className={`inline-flex px-2 py-1 rounded-full text-[10px] sm:text-xs font-bold border ${record.ratio > 150 ? "bg-purple-50 text-purple-700 border-purple-200" : record.ratio >= 100 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                      {record.ratio.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- Edit Modal Grout --- */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh] transform transition-all">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-4 sm:px-6 py-3 sm:py-4 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-base sm:text-lg flex items-center gap-2"><FileText size={16} className="sm:w-[18px] sm:h-[18px]" /> {isEditing ? "Edit Ring Data" : "Ring Details"}</h3>
                <p className="text-blue-100 text-[10px] sm:text-xs mt-0.5">Record ID: {selectedRecord.id}</p>
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                {!isEditing && (
                  <>
                    {selectedRecord.imageUrl && selectedRecord.imageUrl !== "Attached" && (
                      <a href={selectedRecord.imageUrl} target="_blank" rel="noreferrer" className="p-1.5 sm:p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors" title="View Photo"><ImageIcon size={16} className="sm:w-[18px] sm:h-[18px]" /></a>
                    )}
                    <button onClick={() => { setEditFormData({ ...selectedRecord }); setIsEditing(true); }} className="p-1.5 sm:p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors" title="Edit"><Edit size={16} className="sm:w-[18px] sm:h-[18px]" /></button>
                    <button onClick={() => setShowDeleteConfirm(true)} className="p-1.5 sm:p-2 bg-white/10 hover:bg-red-500 rounded-full transition-colors" title="Delete"><Trash2 size={16} className="sm:w-[18px] sm:h-[18px]" /></button>
                  </>
                )}
                <button onClick={() => { setSelectedRecord(null); setIsEditing(false); }} className="p-1.5 sm:p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors ml-1 sm:ml-2"><X size={18} className="sm:w-[20px] sm:h-[20px]" /></button>
              </div>
            </div>

            {showDeleteConfirm && (
              <div className="bg-red-50 p-3 sm:p-4 flex justify-between items-center border-b border-red-100 shrink-0 animate-fade-in">
                <span className="text-red-700 text-xs sm:text-sm font-bold flex items-center gap-2"><Trash2 size={14} className="sm:w-[16px] sm:h-[16px]" /> ยืนยันการลบข้อมูล Ring {selectedRecord.ringNo} ใช่หรือไม่?</span>
                <div className="flex gap-2">
                  <button onClick={() => setShowDeleteConfirm(false)} className="px-3 sm:px-4 py-1.5 bg-white text-slate-600 rounded-lg shadow-sm text-[10px] sm:text-xs font-bold border border-slate-200 hover:bg-slate-100">ยกเลิก</button>
                  <button onClick={handleDeleteRecord} disabled={isSaving} className="px-3 sm:px-4 py-1.5 bg-red-600 text-white rounded-lg shadow-sm text-[10px] sm:text-xs font-bold hover:bg-red-700 flex items-center gap-1">
                    {isSaving && <Loader2 size={12} className="animate-spin" />} ลบ
                  </button>
                </div>
              </div>
            )}

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6">
              <div className="flex flex-wrap justify-between items-center bg-slate-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-100 gap-2">
                <div>
                  <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Grouting Ring</div>
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input name="ringNo" value={editFormData.ringNo} onChange={handleEditChange} className="text-xl sm:text-2xl font-black text-blue-600 bg-white border border-blue-200 rounded-lg px-2 py-1 w-24 sm:w-32 outline-none focus:ring-2 focus:ring-blue-500 uppercase" />
                      <select name="groutPass" value={editFormData.groutPass || "1st Pass"} onChange={handleEditChange} className="border border-slate-300 rounded px-1 py-1 outline-none focus:border-blue-500 text-[10px] sm:text-xs font-bold text-slate-600">
                        <option value="1st Pass">1st Pass</option>
                        <option value="Re-Grout">Re-Grout</option>
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="text-xl sm:text-2xl font-black text-slate-800">{selectedRecord.ringNo}</div>
                      {selectedRecord.groutPass === "Re-Grout" && <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-[4px] text-[8px] sm:text-[9px] font-bold">Re-Grout</span>}
                    </div>
                  )}
                  <div className="text-[10px] sm:text-xs text-slate-500 mt-1 flex items-center gap-1">
                    Excavation:
                    {isEditing ? <input name="excavRing" value={editFormData.excavRing} onChange={handleEditChange} className="border border-slate-300 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-16 uppercase" /> : selectedRecord.excavRing}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Working Date & Shift</div>
                  {isEditing ? (
                    <div className="flex flex-col items-end gap-1 mt-1">
                      <input type="date" name="date" value={formatDisplayDate(editFormData.date)} onChange={handleEditChange} className="border rounded px-2 py-1 text-xs sm:text-sm outline-none" />
                      <select name="shift" value={editFormData.shift} onChange={handleEditChange} className="border rounded px-2 py-1 text-xs sm:text-sm outline-none">
                        <option value="Day">Day Shift</option><option value="Night">Night Shift</option>
                      </select>
                    </div>
                  ) : (
                    <>
                      <div className="text-xs sm:text-sm font-bold text-slate-700 flex items-center justify-end gap-1"><Calendar size={12} className="sm:w-[14px] sm:h-[14px]" /> {formatDisplayDate(selectedRecord.date)}</div>
                      <div className="text-[10px] sm:text-xs text-slate-500 mt-1 flex items-center justify-end gap-1"><span className="ml-1 font-bold text-slate-600">({selectedRecord.shift})</span></div>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className={`bg-slate-50 rounded-xl sm:rounded-2xl border ${isEditing ? "border-blue-300 shadow-inner" : "border-slate-100"} p-3 sm:p-4 flex flex-col items-center justify-center relative`}>
                  <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 text-center">Injection Configuration</span>
                  {isEditing && <span className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-blue-100 text-blue-700 text-[9px] sm:text-[10px] font-bold px-2 py-1 rounded">EDIT MODE</span>}
                  <div className="scale-75 sm:scale-90 transform origin-top -mt-2 sm:-mt-4">
                    <RingVisualizer ringKey={isEditing ? editFormData.key : selectedRecord.key} selectedPositions={isEditing ? editFormData.positions : selectedRecord.positions} onTogglePosition={isEditing ? handleEditPosition : () => {}} />
                  </div>
                  {isEditing && (
                    <div className="w-full mt-0 sm:mt-2 px-2">
                      <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 flex justify-between items-center mb-1">
                        <span className="flex items-center gap-1 sm:gap-2">KEY (1-16) {isEditKeyLinked && <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-[4px] text-[7px] sm:text-[8px] flex items-center gap-1"><Check size={8} /> Synced</span>}</span>
                        <span className={`text-xs sm:text-sm font-black px-2 py-0.5 rounded border ${isEditKeyLinked ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-blue-600 bg-blue-50 border-blue-100"}`}>Key {editFormData.key}</span>
                      </label>
                      <input type="range" min="1" max="16" step="1" name="key" value={editFormData.key} onChange={handleEditChange} disabled={isEditKeyLinked} className={`w-full h-2 rounded-lg appearance-none accent-blue-600 ${isEditKeyLinked ? "bg-emerald-200 cursor-not-allowed opacity-70" : "bg-slate-300 cursor-pointer"}`} />
                    </div>
                  )}
                </div>

                <div className="space-y-3 sm:space-y-4 flex flex-col justify-center">
                  <div className="bg-blue-50 rounded-xl p-3 sm:p-4 border border-blue-100">
                    <div className="text-[10px] sm:text-xs font-bold text-blue-500 uppercase tracking-widest mb-3">Volume Data</div>
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
                      <div>
                        <div className="text-[10px] sm:text-xs text-slate-500 mb-1">Part A</div>
                        {isEditing ? <input type="number" step="0.01" name="partA" value={editFormData.partA} onChange={handleEditChange} className="w-full bg-white border border-blue-300 rounded-lg px-2 py-1 text-center font-mono text-base sm:text-lg font-bold text-blue-700 outline-none focus:ring-2 focus:ring-blue-500 shadow-inner" /> : <div className="font-mono text-base sm:text-lg font-bold text-slate-700">{selectedRecord.partA} <span className="text-[10px] sm:text-xs font-sans text-slate-400">m³</span></div>}
                      </div>
                      <div>
                        <div className="text-[10px] sm:text-xs text-slate-500 mb-1">Part B</div>
                        {isEditing ? <input type="number" step="0.01" name="partB" value={editFormData.partB} onChange={handleEditChange} className="w-full bg-white border border-blue-300 rounded-lg px-2 py-1 text-center font-mono text-base sm:text-lg font-bold text-blue-700 outline-none focus:ring-2 focus:ring-blue-500 shadow-inner" /> : <div className="font-mono text-base sm:text-lg font-bold text-slate-700">{selectedRecord.partB} <span className="text-[10px] sm:text-xs font-sans text-slate-400">m³</span></div>}
                      </div>
                    </div>
                    <div className="border-t border-blue-200/50 pt-2 sm:pt-3 flex justify-between items-end">
                      <div>
                        <div className="text-[10px] sm:text-xs text-slate-500 mb-1">Total Volume</div>
                        <div className="text-xl sm:text-2xl font-black text-blue-700">{isEditing ? editTotal : selectedRecord.total.toFixed(2)} <span className="text-xs sm:text-sm font-sans font-normal text-blue-500">m³</span></div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] sm:text-xs text-slate-500 mb-1">Ratio</div>
                        <div className={`text-lg sm:text-xl font-black ${(isEditing ? editRatio : selectedRecord.ratio) > 150 ? "text-purple-500" : (isEditing ? editRatio : selectedRecord.ratio) >= 100 ? "text-emerald-500" : "text-red-500"}`}>
                          {isEditing ? editRatio : selectedRecord.ratio.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div className="bg-white rounded-xl p-3 sm:p-4 border border-slate-200 shadow-sm">
                      <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Pressure</div>
                      {isEditing ? <input type="number" step="0.1" name="pressure" value={editFormData.pressure} onChange={handleEditChange} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-left font-mono text-base sm:text-lg font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" /> : <div className="font-mono text-lg sm:text-xl font-bold text-slate-700">{selectedRecord.pressure} <span className="text-xs sm:text-sm font-sans text-slate-400 font-normal">bar</span></div>}
                    </div>
                    <div className="bg-white rounded-xl p-3 sm:p-4 border border-slate-200 shadow-sm flex flex-col justify-center">
                      <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Status</div>
                      <div className="mt-1">
                        <span className={`inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold border ${(isEditing ? editRatio : selectedRecord.ratio) > 150 ? "bg-purple-50 text-purple-700 border-purple-200" : (isEditing ? editRatio : selectedRecord.ratio) >= 100 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                          {(isEditing ? editRatio : selectedRecord.ratio) > 150 ? "over design" : (isEditing ? editRatio : selectedRecord.ratio) >= 100 ? "Pass" : "below design"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {(selectedRecord.remark || isEditing) && (
                <div className="bg-orange-50/50 rounded-xl p-3 sm:p-4 border border-orange-100">
                  <div className="text-[10px] sm:text-xs font-bold text-orange-500 uppercase tracking-widest mb-2 flex items-center gap-1"><Info size={12} className="sm:w-[14px] sm:h-[14px]" /> Remarks (ปัญหา)</div>
                  {isEditing ? <textarea name="remark" value={editFormData.remark} onChange={handleEditChange} className="w-full bg-white border border-orange-200 rounded-lg p-2 text-xs sm:text-sm text-slate-700 outline-none focus:ring-2 focus:ring-orange-400" rows="2" placeholder="เพิ่มหมายเหตุ..." /> : <p className="text-xs sm:text-sm text-slate-700">{selectedRecord.remark}</p>}
                </div>
              )}
            </div>

            {isEditing && (
              <div className="bg-slate-50 p-3 sm:p-4 border-t border-slate-100 flex justify-end gap-2 sm:gap-3 shrink-0">
                <button onClick={() => setIsEditing(false)} className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm text-slate-500 hover:bg-slate-200 transition-colors">Cancel</button>
                <button onClick={handleSaveEdit} disabled={isSaving} className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center gap-1 sm:gap-2">
                  {isSaving ? <Loader2 size={14} className="sm:w-[18px] sm:h-[18px] animate-spin" /> : <Save size={14} className="sm:w-[18px] sm:h-[18px]" />} Save Changes
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};


// --- 5. SEGMENT DASHBOARD VIEW ---
const SegmentDashboardView = ({ segmentRecords, setSegmentRecords }) => {
  const [filterMode, setFilterMode] = useState("all");
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [filterShift, setFilterShift] = useState("All");

  const defaultPlanConfig = { defaultDailyPlan: 4, basePlanAcc: 0, baseActualAcc: 0, planOverrides: [] };
  
  const [planConfig, setPlanConfig] = useState(() => {
    try {
      const saved = localStorage.getItem("tbmPlanConfig");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.dailyPlan !== undefined) {
          return { defaultDailyPlan: parsed.dailyPlan, basePlanAcc: parsed.basePlanAcc || 0, baseActualAcc: parsed.baseActualAcc || 0, planOverrides: [] };
        }
        return parsed;
      }
    } catch (e) {}
    return defaultPlanConfig;
  });

  const [showPlanModal, setShowPlanModal] = useState(false);
  const [tempPlan, setTempPlan] = useState({ ...planConfig });
  const [newOverride, setNewOverride] = useState({ date: "", plan: 4 });

  const handleSavePlan = () => {
    setPlanConfig(tempPlan);
    localStorage.setItem("tbmPlanConfig", JSON.stringify(tempPlan));
    setShowPlanModal(false);
  };

  const getPlanForDate = (dateStr, config) => {
    if (!config.planOverrides || config.planOverrides.length === 0) return parseFloat(config.defaultDailyPlan) || 0;
    const sorted = [...config.planOverrides].sort((a, b) => new Date(b.date) - new Date(a.date));
    for (let ov of sorted) {
      if (dateStr >= ov.date) return parseFloat(ov.plan) || 0;
    }
    return parseFloat(config.defaultDailyPlan) || 0;
  };

  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // === Deduplicate Segments to show only the latest state of each ring in Dashboard ===
  const deduplicatedSegments = useMemo(() => {
    const map = new Map();
    segmentRecords.forEach(rec => map.set(rec.ringNo, rec));
    return Array.from(map.values());
  }, [segmentRecords]);

  const baseSegmentRecords = useMemo(() => {
    return filterShift === "All" ? deduplicatedSegments : deduplicatedSegments.filter((r) => r.shift === filterShift);
  }, [deduplicatedSegments, filterShift]);

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData((prev) => {
      let updated = { ...prev, [name]: value };
      if (name === "startCH" || name === "length") {
        const start = parseCH(updated.startCH);
        const len = parseFloat(updated.length) || 0;
        if (start !== 0) updated.finishCH = formatCH(start - len);
      }
      return updated;
    });
  };

  const handleSaveEdit = async () => {
    setIsSaving(true);
    const updatedRecord = { ...editFormData, soilVolume: calculateSoilVolume(editFormData.length) };
    try {
      await apiCall("updateSegment", updatedRecord);
      setSegmentRecords((prev) => prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r)));
      setSelectedRecord(updatedRecord);
      setIsEditing(false);
    } catch (e) {
      alert("อัปเดตข้อมูลล้มเหลว");
    }
    setIsSaving(false);
  };

  const handleDeleteRecord = async () => {
    setIsSaving(true);
    try {
      await apiCall("deleteSegment", { id: selectedRecord.id });
      setSegmentRecords((prev) => prev.filter((r) => r.id !== selectedRecord.id));
      setSelectedRecord(null);
      setIsEditing(false);
      setShowDeleteConfirm(false);
    } catch (e) {
      alert("ลบข้อมูลล้มเหลว");
    }
    setIsSaving(false);
  };

  const stats = useMemo(() => {
    const completedSegments = baseSegmentRecords.filter((s) => s.status !== "In Progress");
    const permSegments = completedSegments.filter((s) => s.installType !== "Temporary");
    const tempSegments = completedSegments.filter((s) => s.installType === "Temporary");

    const permRings = new Set(permSegments.map((r) => r.ringNo)).size;
    const tempRings = new Set(tempSegments.map((r) => r.ringNo)).size;
    const totalRings = permRings + tempRings;
    
    const totalDistance = permSegments.reduce((acc, rec) => acc + parseFloat(rec.length || 0), 0);
    const totalSoilVol = permSegments.reduce((acc, rec) => acc + parseFloat(rec.soilVolume || calculateSoilVolume(rec.length)), 0);

    const uniqueDays = new Set(baseSegmentRecords.map((r) => formatDisplayDate(r.date))).size || 1;
    const avgRings = (permRings / uniqueDays).toFixed(1);
    const avgDist = (totalDistance / uniqueDays).toFixed(2);
    const currentCH = baseSegmentRecords.length > 0 ? baseSegmentRecords[baseSegmentRecords.length - 1].finishCH : "-";

    return { permRings, tempRings, totalRings, totalDistance, totalSoilVol, avgRings, avgDist, currentCH };
  }, [baseSegmentRecords]);

  const fullDailyProgress = useMemo(() => {
    const dateMap = {};

    baseSegmentRecords.forEach((rec) => {
      const dDate = formatDisplayDate(rec.date);
      if (!dateMap[dDate]) {
        dateMap[dDate] = { date: dDate, dayRings: 0, nightRings: 0, tempRings: 0, totalRings: 0, actualAcc: 0, planAcc: 0 };
      }
      if (rec.status !== "In Progress") {
        if (rec.installType === "Temporary") {
          dateMap[dDate].tempRings++;
        } else {
          if (rec.shift === "Day") dateMap[dDate].dayRings++;
          else dateMap[dDate].nightRings++;
          dateMap[dDate].totalRings++;
        }
      }
    });

    let sortedArray = Object.values(dateMap).sort((a, b) => new Date(a.date) - new Date(b.date));

    let runningActual = parseFloat(planConfig.baseActualAcc) || 0;
    let runningPlan = parseFloat(planConfig.basePlanAcc) || 0;
    let prevDate = null;

    sortedArray = sortedArray.map((day) => {
      runningActual += day.totalRings;
      if (prevDate) {
        let tempDate = new Date(prevDate);
        let targetDate = new Date(day.date);
        tempDate.setDate(tempDate.getDate() + 1);
        while (tempDate <= targetDate) {
          runningPlan += getPlanForDate(tempDate.toISOString().split("T")[0], planConfig);
          tempDate.setDate(tempDate.getDate() + 1);
        }
      } else {
        runningPlan += getPlanForDate(day.date, planConfig);
      }
      prevDate = day.date;

      return {
        ...day,
        plan: getPlanForDate(day.date, planConfig),
        displayDate: new Date(day.date).toLocaleDateString("th-TH", { day: "numeric", month: "short" }),
        actualAcc: runningActual,
        planAcc: Math.round(runningPlan * 10) / 10,
      };
    });

    return sortedArray;
  }, [baseSegmentRecords, planConfig]);

  const chartData = useMemo(() => {
    if (filterMode === "daily") {
      const dayRecords = baseSegmentRecords.filter((r) => formatDisplayDate(r.date) === filterDate);

      let baselineAcc = parseFloat(planConfig.baseActualAcc) || 0;
      const sortedDates = [...new Set(baseSegmentRecords.map((r) => formatDisplayDate(r.date)))].sort();
      for (const d of sortedDates) {
        if (d < filterDate) {
          baselineAcc += baseSegmentRecords.filter((r) => formatDisplayDate(r.date) === d && r.status !== "In Progress" && r.installType !== "Temporary").length;
        }
      }

      let baselinePlan = parseFloat(planConfig.basePlanAcc) || 0;
      if (sortedDates.length > 0 && filterDate > sortedDates[0]) {
        let tempD = new Date(sortedDates[0]);
        let endD = new Date(filterDate);
        while (tempD < endD) {
          baselinePlan += getPlanForDate(tempD.toISOString().split("T")[0], planConfig);
          tempD.setDate(tempD.getDate() + 1);
        }
      }

      const currentDayPlan = getPlanForDate(filterDate, planConfig);
      const hourlyData = Array.from({ length: 24 }, (_, i) => ({ displayDate: `${String(i).padStart(2, "0")}:00`, dayRings: 0, nightRings: 0, tempRings: 0, totalRings: 0, plan: currentDayPlan / 24 }));

      dayRecords.forEach((rec) => {
        const timeToUse = rec.installStartTime || rec.startTime; 
        if (timeToUse && rec.status !== "In Progress") {
          const hour = parseInt(formatDisplayTime(timeToUse).split(":")[0], 10);
          if (!isNaN(hour) && hour >= 0 && hour <= 23) {
            if (rec.installType === "Temporary") hourlyData[hour].tempRings++;
            else {
              if (rec.shift === "Day") hourlyData[hour].dayRings++;
              else hourlyData[hour].nightRings++;
              hourlyData[hour].totalRings++;
            }
          }
        }
      });

      let currentAcc = baselineAcc;
      let currentPlan = baselinePlan;
      return hourlyData.map((h) => {
        currentAcc += h.totalRings;
        currentPlan += currentDayPlan / 24;
        return { ...h, actualAcc: currentAcc, planAcc: Math.round(currentPlan * 10) / 10 };
      });
    }

    return fullDailyProgress.filter((day) => {
      if (filterMode === "all") return true;
      if (filterMode === "monthly") return day.date.startsWith(filterMonth);
      if (filterMode === "range") {
        if (rangeStart && day.date < rangeStart) return false;
        if (rangeEnd && day.date > rangeEnd) return false;
        return true;
      }
      return true;
    });
  }, [fullDailyProgress, filterMode, filterDate, filterMonth, rangeStart, rangeEnd, baseSegmentRecords, planConfig]);

  const filteredTableRecords = useMemo(() => {
    return baseSegmentRecords.filter((rec) => {
      const dDate = formatDisplayDate(rec.date);
      if (filterMode === "all") return true;
      if (filterMode === "daily") return dDate === filterDate;
      if (filterMode === "monthly") return dDate.startsWith(filterMonth);
      if (filterMode === "range") {
        if (rangeStart && dDate < rangeStart) return false;
        if (rangeEnd && dDate > rangeEnd) return false;
        return true;
      }
      return true;
    });
  }, [baseSegmentRecords, filterMode, filterDate, filterMonth, rangeStart, rangeEnd]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-fade-in pb-24">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Permanent Rings" value={stats.permRings} subtext={`+ ${stats.tempRings} Temp. (Total: ${stats.totalRings})`} color="text-blue-600" icon={Layers} />
        <StatCard label="Perm. Distance" value={`${stats.totalDistance.toFixed(2)} m`} subtext={`ดินขุดรวม: ${stats.totalSoilVol.toFixed(2)} m³`} color="text-emerald-600" icon={TrendingUp} />
        <StatCard label="Daily Average" value={`${stats.avgRings} Rings`} subtext={`~ ${stats.avgDist} m / day`} color="text-orange-500" icon={Activity} />
        <StatCard label="Current Position" value={stats.currentCH} subtext="Latest Finish CH." color="text-indigo-600" icon={MapPin} />
      </div>

      <div className="bg-white p-4 sm:p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-800 flex items-center gap-2">
            <TrendingUp className="text-emerald-600 sm:w-6 sm:h-6 w-5 h-5" /> Ring Progress Monthly Report
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">TBM1 Segment Installation Tracking</p>
        </div>
        <div className="flex gap-2 sm:gap-4 text-[10px] sm:text-xs font-bold bg-slate-50 p-2 sm:p-3 rounded-xl border border-slate-100 w-full md:w-auto justify-between sm:justify-start">
          <div className="flex flex-col items-center"><span className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-yellow-300 mb-1"></span>Day Shift</div>
          <div className="flex flex-col items-center"><span className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-blue-500 mb-1"></span>Night Shift</div>
          {filterMode !== "daily" && (
            <>
              <div className="flex flex-col items-center"><span className="w-3 sm:w-4 h-0.5 bg-black mt-1.5 sm:mt-2 mb-1 sm:mb-1.5"></span>Plan Acc.</div>
              <div className="flex flex-col items-center"><span className="w-3 sm:w-4 h-0.5 bg-red-500 mt-1.5 sm:mt-2 mb-1 sm:mb-1.5"></span>Actual Acc.</div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 sm:p-6 overflow-hidden">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-4 sm:mb-6 gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-800 text-base sm:text-lg">Installation Trend</h3>
            <button onClick={() => setShowPlanModal(true)} className="p-1.5 text-slate-400 hover:text-emerald-600 bg-slate-50 hover:bg-emerald-50 rounded-lg transition-colors border border-slate-100" title="ตั้งค่าแผนงาน (Plan Settings)">
              <Settings size={14} className="sm:w-4 sm:h-4" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-start sm:items-center w-full lg:w-auto bg-slate-50 p-2 rounded-xl border border-slate-100">
            <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm w-full sm:w-auto overflow-x-auto">
              <button onClick={() => setFilterMode("all")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${filterMode === "all" ? "bg-emerald-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>All</button>
              <button onClick={() => setFilterMode("daily")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${filterMode === "daily" ? "bg-emerald-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>Daily</button>
              <button onClick={() => setFilterMode("monthly")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${filterMode === "monthly" ? "bg-emerald-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>Monthly</button>
              <button onClick={() => setFilterMode("range")} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${filterMode === "range" ? "bg-emerald-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>Range</button>
            </div>

            {filterMode === "daily" && <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-700 w-full sm:w-auto" />}
            {filterMode === "monthly" && <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-700 w-full sm:w-auto" />}
            {filterMode === "range" && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="px-2 py-1.5 flex-1 sm:flex-none sm:w-[110px] text-[10px] sm:text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-700" />
                <span className="text-slate-400">-</span>
                <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="px-2 py-1.5 flex-1 sm:flex-none sm:w-[110px] text-[10px] sm:text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-700" />
              </div>
            )}
            <div className="w-px h-6 bg-slate-200 hidden sm:block"></div>
            <select value={filterShift} onChange={(e) => setFilterShift(e.target.value)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-700 bg-white cursor-pointer w-full sm:w-auto">
              <option value="All">All Shifts</option>
              <option value="Day">Day Shift</option>
              <option value="Night">Night Shift</option>
            </select>
          </div>
        </div>

        <div className="h-[300px] sm:h-[500px] w-full min-w-full overflow-x-auto">
          <div className="min-w-[700px] h-full">
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="displayDate" tick={{ fontSize: 9, fill: "#64748b" }} angle={-45} textAnchor="end" height={60} />
                <YAxis yAxisId="left" domain={[0, filterMode === "daily" ? "auto" : 10]} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                {filterMode !== "daily" && <YAxis yAxisId="right" orientation="right" domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />}
                <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} itemStyle={{ fontSize: "11px", fontWeight: "bold" }} />

                {filterMode !== "daily" && <Line yAxisId="left" type="monotone" dataKey="plan" stroke="#94a3b8" strokeWidth={2} dot={chartData.length <= 24 ? { r: 0 } : { r: 2 }} name="Plan Daily" />}
                <Bar yAxisId="left" dataKey="dayRings" stackId="a" fill="#fde047" name="Perm. D/S" radius={[0, 0, 0, 0]} maxBarSize={40} />
                <Bar yAxisId="left" dataKey="nightRings" stackId="a" fill="#3b82f6" name="Perm. N/S" radius={[0, 0, 0, 0]} maxBarSize={40} />
                <Bar yAxisId="left" dataKey="tempRings" stackId="a" fill="#cbd5e1" name="Temporary" radius={[4, 4, 0, 0]} maxBarSize={40} />

                {filterMode !== "daily" && (
                  <>
                    <Line yAxisId="right" type="monotone" dataKey="planAcc" stroke="#0f172a" strokeWidth={2} dot={chartData.length === 1 ? { r: 3, fill: "#0f172a" } : { r: 2, fill: "#0f172a" }} name="Plan Acc." />
                    <Line yAxisId="right" type="monotone" dataKey="actualAcc" stroke="#ef4444" strokeWidth={2} dot={chartData.length === 1 ? { r: 3, fill: "#ef4444" } : { r: 2, fill: "#ef4444" }} name="Actual Acc." label={{ position: "top", fill: "#ef4444", fontSize: 9, fontWeight: "bold" }} />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-700 text-sm sm:text-base">Segment Logs</h3>
        </div>
        <div className="overflow-x-auto max-h-[400px]">
          <table className="w-full text-xs sm:text-sm text-left relative whitespace-nowrap">
            <thead className="text-[10px] sm:text-xs text-slate-400 uppercase bg-slate-50 border-b sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 sm:px-6 py-3 sm:py-4">Date / Shift</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4">Ring No.</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-center">Type / Key</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-right">Start CH.</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-right">Finish CH.</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-right">Length / Soil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredTableRecords.length > 0 ? (
                [...filteredTableRecords].reverse().map((rec, index) => (
                  <tr key={`${rec.id}-${index}`} onClick={() => { setSelectedRecord(rec); setIsEditing(false); }} className="hover:bg-emerald-50/30 transition-colors cursor-pointer">
                    <td className="px-4 sm:px-6 py-3 sm:py-4">
                      <div className="font-bold text-slate-800 text-sm sm:text-base">{formatDisplayDate(rec.date)}</div>
                      <div className="text-[9px] sm:text-[10px] text-slate-500 mt-1 font-mono"><span className="font-bold">Excav:</span> {formatDisplayTime(rec.excavStartTime)} - {formatDisplayTime(rec.excavEndTime)}</div>
                      <div className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5 font-mono"><span className="font-bold">Inst:</span> {formatDisplayTime(rec.installStartTime || rec.startTime)} - {formatDisplayTime(rec.installEndTime || rec.endTime)}</div>
                      <div className="text-[10px] sm:text-xs text-slate-500 mt-1">{rec.shift} Shift</div>
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4">
                      <div className={`font-black text-sm sm:text-base ${rec.installType === "Temporary" ? "text-amber-600" : "text-emerald-700"}`}>{rec.ringNo}</div>
                      {rec.installType === "Temporary" && <div className="text-[9px] sm:text-[10px] text-amber-500 font-bold mt-0.5">Temporary</div>}
                      {rec.status === "In Progress" && <div className="text-[9px] sm:text-[10px] text-orange-500 font-bold mt-0.5">In Progress</div>}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-center">
                      <span className="bg-slate-100 px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-bold text-slate-600 mr-1 sm:mr-2">{rec.typeRing}</span>
                      <span className="text-[10px] sm:text-xs text-slate-500">K{rec.keyPos}</span>
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-right font-mono text-slate-600">{rec.startCH}</td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-right font-mono text-slate-800 font-bold">{rec.finishCH}</td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-right">
                      <div className="text-emerald-600 font-bold">{rec.length} m</div>
                      <div className="text-[9px] sm:text-[10px] text-amber-600 font-bold mt-0.5">{rec.soilVolume || calculateSoilVolume(rec.length)} m³</div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="6" className="px-6 py-12 text-center text-slate-400">ไม่พบข้อมูล หรือกำลังรอเชื่อมต่อฐานข้อมูล...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col transform transition-all max-h-[90vh]">
            <div className="bg-slate-100 px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm sm:text-base"><Settings size={16} className="text-slate-500" /> Plan Settings</h3>
              <button onClick={() => setShowPlanModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-4 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto">
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">Default Rings/Day</label>
                <input type="number" step="0.1" value={tempPlan.defaultDailyPlan} onChange={(e) => setTempPlan({ ...tempPlan, defaultDailyPlan: e.target.value })} className="w-full border border-slate-300 rounded-xl px-3 sm:px-4 py-2 font-bold text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50" />
              </div>
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">Initial Plan Accumulation</label>
                <input type="number" value={tempPlan.basePlanAcc} onChange={(e) => setTempPlan({ ...tempPlan, basePlanAcc: e.target.value })} className="w-full border border-slate-300 rounded-xl px-3 sm:px-4 py-2 font-bold text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50" />
                <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1">ตั้งค่าเริ่มต้นของเส้น Plan สะสม</p>
              </div>
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">Initial Actual Accumulation</label>
                <input type="number" value={tempPlan.baseActualAcc} onChange={(e) => setTempPlan({ ...tempPlan, baseActualAcc: e.target.value })} className="w-full border border-slate-300 rounded-xl px-3 sm:px-4 py-2 font-bold text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50" />
                <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1">ตั้งค่ายกมาของยอดติดตั้งจริง</p>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <label className="text-[10px] sm:text-xs font-bold text-slate-800 uppercase tracking-widest block mb-2">Plan Overrides (ปรับแผนตามช่วงเวลา)</label>
                {tempPlan.planOverrides && tempPlan.planOverrides.map((ov, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                    <span className="text-xs font-bold text-slate-700 flex-1">{ov.date}</span>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">{ov.plan} / Day</span>
                    <button onClick={() => setTempPlan((prev) => ({ ...prev, planOverrides: prev.planOverrides.filter((_, i) => i !== idx) }))} className="p-1 text-red-400 hover:text-red-600 bg-white rounded shadow-sm border border-slate-200"><Trash2 size={12} /></button>
                  </div>
                ))}
                <div className="flex gap-2 items-end mt-2">
                  <div className="flex-1">
                    <label className="text-[9px] text-slate-400 mb-1 block">Start Date</label>
                    <input type="date" value={newOverride.date} onChange={(e) => setNewOverride({ ...newOverride, date: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-emerald-500" />
                  </div>
                  <div className="w-20">
                    <label className="text-[9px] text-slate-400 mb-1 block">Rings/Day</label>
                    <input type="number" step="0.1" value={newOverride.plan} onChange={(e) => setNewOverride({ ...newOverride, plan: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-emerald-500" />
                  </div>
                  <button onClick={() => { if (newOverride.date && newOverride.plan) { setTempPlan((prev) => ({ ...prev, planOverrides: [ ...(prev.planOverrides || []), newOverride ] })); setNewOverride({ date: "", plan: 4 }); } }} className="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold mb-0.5 hover:bg-slate-700 transition-colors">Add</button>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 p-3 sm:p-4 border-t border-slate-100 flex justify-end gap-2 shrink-0">
              <button onClick={() => setShowPlanModal(false)} className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold text-xs sm:text-sm text-slate-500 hover:bg-slate-200 transition-colors">Cancel</button>
              <button onClick={handleSavePlan} className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold text-xs sm:text-sm bg-emerald-600 hover:bg-emerald-700 text-white transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* --- Edit Segment Modal --- */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh] transform transition-all">
            <div className="bg-gradient-to-r from-teal-600 to-emerald-700 px-4 sm:px-6 py-3 sm:py-4 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-base sm:text-lg flex items-center gap-2"><Layers size={16} className="sm:w-[18px] sm:h-[18px]" /> {isEditing ? "Edit Segment Data" : "Segment Details"}</h3>
                <p className="text-emerald-100 text-[10px] sm:text-xs mt-0.5">Record ID: {selectedRecord.id}</p>
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                {!isEditing && (
                  <>
                    {selectedRecord.imageUrl && selectedRecord.imageUrl !== "Attached" && (
                      <a href={selectedRecord.imageUrl} target="_blank" rel="noreferrer" className="p-1.5 sm:p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors" title="View Photo"><ImageIcon size={16} className="sm:w-[18px] sm:h-[18px]" /></a>
                    )}
                    <button onClick={() => { setEditFormData({ ...selectedRecord }); setIsEditing(true); }} className="p-1.5 sm:p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors" title="Edit"><Edit size={16} className="sm:w-[18px] sm:h-[18px]" /></button>
                    <button onClick={() => setShowDeleteConfirm(true)} className="p-1.5 sm:p-2 bg-white/10 hover:bg-red-500 rounded-full transition-colors" title="Delete"><Trash2 size={16} className="sm:w-[18px] sm:h-[18px]" /></button>
                  </>
                )}
                <button onClick={() => { setSelectedRecord(null); setIsEditing(false); setShowDeleteConfirm(false); }} className="p-1.5 sm:p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors ml-1 sm:ml-2"><X size={18} className="sm:w-[20px] sm:h-[20px]" /></button>
              </div>
            </div>

            {showDeleteConfirm && (
              <div className="bg-red-50 p-3 sm:p-4 flex justify-between items-center border-b border-red-100 shrink-0 animate-fade-in">
                <span className="text-red-700 text-xs sm:text-sm font-bold flex items-center gap-2"><Trash2 size={14} className="sm:w-[16px] sm:h-[16px]" /> ยืนยันการลบข้อมูล Ring {selectedRecord.ringNo} ใช่หรือไม่?</span>
                <div className="flex gap-2">
                  <button onClick={() => setShowDeleteConfirm(false)} className="px-3 sm:px-4 py-1.5 bg-white text-slate-600 rounded-lg shadow-sm text-[10px] sm:text-xs font-bold border border-slate-200 hover:bg-slate-100">ยกเลิก</button>
                  <button onClick={handleDeleteRecord} disabled={isSaving} className="px-3 sm:px-4 py-1.5 bg-red-600 text-white rounded-lg shadow-sm text-[10px] sm:text-xs font-bold hover:bg-red-700 flex items-center gap-1">
                    {isSaving && <Loader2 size={12} className="animate-spin" />} ลบ
                  </button>
                </div>
              </div>
            )}

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6">
              <div className="flex flex-wrap justify-between items-center bg-slate-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-100 gap-2">
                <div>
                  <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Ring No. & Type</div>
                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <input name="ringNo" value={editFormData.ringNo} onChange={handleEditChange} className="text-xl sm:text-2xl font-black text-emerald-600 bg-white border border-emerald-200 rounded-lg px-2 py-1 w-24 sm:w-32 outline-none focus:ring-2 focus:ring-emerald-500 uppercase" />
                        <select name="typeRing" value={editFormData.typeRing} onChange={handleEditChange} className="border border-slate-300 rounded-lg px-2 py-1 outline-none focus:border-emerald-500 font-bold text-slate-700 text-sm sm:text-base">
                          <option value="C1">C1</option><option value="ST1">ST1</option><option value="ST2">ST2</option><option value="SX">SX</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <select name="installType" value={editFormData.installType || "Permanent"} onChange={handleEditChange} className={`border border-slate-300 rounded px-2 py-1 outline-none text-[10px] sm:text-xs font-bold ${editFormData.installType === "Temporary" ? "text-amber-600" : "text-emerald-700"}`}>
                          <option value="Permanent">Permanent (ถาวร)</option><option value="Temporary">Temporary (ชั่วคราว)</option>
                        </select>
                        <select name="status" value={editFormData.status || "Completed"} onChange={handleEditChange} className="border border-slate-300 rounded px-2 py-1 outline-none focus:border-emerald-500 text-[10px] sm:text-xs font-bold text-slate-600">
                          <option value="Completed">Completed</option><option value="In Progress">In Progress</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <div className={`text-xl sm:text-2xl font-black ${selectedRecord.installType === "Temporary" ? "text-amber-600" : "text-slate-800"}`}>{selectedRecord.ringNo}</div>
                        <span className="bg-slate-200 px-2 py-1 rounded text-xs sm:text-sm font-bold text-slate-600">{selectedRecord.typeRing}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {selectedRecord.installType === "Temporary" && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-[4px] text-[8px] sm:text-[9px] font-bold">Temporary Ring</span>}
                        {selectedRecord.status === "In Progress" && <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-[4px] text-[8px] sm:text-[9px] font-bold">In Progress</span>}
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Working Date & Shift</div>
                  {isEditing ? (
                    <div className="flex flex-col items-end gap-1 mt-1">
                      <input type="date" name="date" value={formatDisplayDate(editFormData.date)} onChange={handleEditChange} className="border rounded px-2 py-1 text-xs sm:text-sm outline-none focus:border-emerald-500" />
                      <select name="shift" value={editFormData.shift} onChange={handleEditChange} className="border rounded px-2 py-1 text-xs sm:text-sm outline-none focus:border-emerald-500">
                        <option value="Day">Day Shift</option><option value="Night">Night Shift</option>
                      </select>
                    </div>
                  ) : (
                    <>
                      <div className="text-xs sm:text-sm font-bold text-slate-700 flex items-center justify-end gap-1"><Calendar size={12} className="sm:w-[14px] sm:h-[14px]" /> {formatDisplayDate(selectedRecord.date)}</div>
                      <div className="text-[10px] sm:text-xs text-slate-500 mt-1 flex items-center justify-end gap-1"><span className="ml-1 font-bold text-slate-600">({selectedRecord.shift})</span></div>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className={`bg-slate-50 rounded-xl sm:rounded-2xl border ${isEditing ? "border-emerald-300 shadow-inner" : "border-slate-100"} p-3 sm:p-4 flex flex-col items-center justify-center relative`}>
                  <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 text-center">Ring Orientation</span>
                  {isEditing && <span className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-emerald-100 text-emerald-700 text-[9px] sm:text-[10px] font-bold px-2 py-1 rounded">EDIT MODE</span>}
                  <div className="scale-75 sm:scale-90 transform origin-top -mt-2 sm:-mt-4">
                    <RingVisualizer ringKey={isEditing ? editFormData.keyPos : selectedRecord.keyPos} selectedPositions={{ K: true }} onTogglePosition={() => {}} />
                  </div>
                  {isEditing && (
                    <div className="w-full mt-0 sm:mt-2 px-2">
                      <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 flex justify-between items-center mb-1">
                        <span>KEY POSITION (1-16)</span>
                        <span className={`text-xs sm:text-sm font-black px-2 py-0.5 rounded border text-emerald-600 bg-emerald-50 border-emerald-100`}>K{editFormData.keyPos}</span>
                      </label>
                      <input type="range" min="1" max="16" step="1" name="keyPos" value={editFormData.keyPos} onChange={handleEditChange} className="w-full h-2 rounded-lg appearance-none accent-emerald-600 bg-slate-300 cursor-pointer" />
                    </div>
                  )}
                </div>

                <div className="space-y-3 sm:space-y-4 flex flex-col justify-center">
                  <div className="bg-emerald-50 rounded-xl p-3 sm:p-4 border border-emerald-100">
                    <div className="text-[10px] sm:text-xs font-bold text-emerald-600 uppercase tracking-widest mb-3">Chainage Data</div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-[10px] sm:text-xs text-slate-500 mb-1">Start CH.</div>
                        {isEditing ? <input type="text" name="startCH" value={editFormData.startCH} onChange={handleEditChange} onBlur={(e) => setEditFormData((prev) => ({ ...prev, startCH: formatCH(prev.startCH) }))} className="w-full bg-white border border-emerald-300 rounded-lg px-2 py-1 text-left font-mono text-xs sm:text-sm font-bold text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner" /> : <div className="font-mono text-sm sm:text-base font-bold text-slate-700">{selectedRecord.startCH}</div>}
                      </div>
                      <div>
                        <div className="text-[10px] sm:text-xs text-slate-500 mb-1">Finish CH.</div>
                        {isEditing ? <input type="text" name="finishCH" value={editFormData.finishCH} onChange={handleEditChange} onBlur={(e) => setEditFormData((prev) => ({ ...prev, finishCH: formatCH(prev.finishCH) }))} className="w-full bg-white border border-emerald-300 rounded-lg px-2 py-1 text-left font-mono text-xs sm:text-sm font-bold text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner" /> : <div className="font-mono text-sm sm:text-base font-bold text-slate-700">{selectedRecord.finishCH}</div>}
                      </div>
                    </div>
                    <div className="border-t border-emerald-200/50 pt-3 flex justify-between items-center">
                      <span className="text-[10px] sm:text-xs text-slate-500">Length</span>
                      {isEditing ? (
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1">
                            <input type="number" step="0.01" name="length" value={editFormData.length} onChange={handleEditChange} className="w-16 sm:w-20 bg-white border border-emerald-300 rounded-lg px-2 py-1 text-right font-mono text-base sm:text-lg font-black text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner" />
                            <span className="text-[10px] sm:text-xs font-bold text-emerald-600">m</span>
                          </div>
                          {editFormData.status === "In Progress" && <span className="text-[8px] sm:text-[9px] text-orange-500 font-bold">ระบุเฉพาะระยะที่ทำได้</span>}
                        </div>
                      ) : (
                        <div className="text-lg sm:text-xl font-black text-emerald-600">{selectedRecord.length} <span className="text-[10px] sm:text-sm font-normal">m</span></div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-3 sm:p-4 border border-slate-200 shadow-sm flex flex-col gap-3">
                    <div className="flex justify-between items-center gap-2">
                      <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest w-16">Excavate</div>
                      <div className="flex-1 flex items-center justify-end gap-2">
                        {isEditing ? (
                          <>
                            <input type="time" name="excavStartTime" value={editFormData.excavStartTime || ''} onChange={handleEditChange} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-center font-mono text-xs sm:text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-1" />
                            <span className="text-slate-300">-</span>
                            <input type="time" name="excavEndTime" value={editFormData.excavEndTime || ''} onChange={handleEditChange} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-center font-mono text-xs sm:text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-1" />
                          </>
                        ) : (
                          <div className="font-mono text-xs sm:text-sm font-bold text-slate-700">{formatDisplayTime(selectedRecord.excavStartTime)} - {formatDisplayTime(selectedRecord.excavEndTime)}</div>
                        )}
                      </div>
                    </div>
                    <div className="border-t border-slate-100"></div>
                    <div className="flex justify-between items-center gap-2">
                      <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest w-16">Install</div>
                      <div className="flex-1 flex items-center justify-end gap-2">
                        {isEditing ? (
                          <>
                            <input type="time" name="installStartTime" value={editFormData.installStartTime || editFormData.startTime || ''} onChange={handleEditChange} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-center font-mono text-xs sm:text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-1" />
                            <span className="text-slate-300">-</span>
                            <input type="time" name="installEndTime" value={editFormData.installEndTime || editFormData.endTime || ''} onChange={handleEditChange} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-center font-mono text-xs sm:text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-1" />
                          </>
                        ) : (
                          <div className="font-mono text-xs sm:text-sm font-bold text-slate-700">{formatDisplayTime(selectedRecord.installStartTime || selectedRecord.startTime)} - {formatDisplayTime(selectedRecord.installEndTime || selectedRecord.endTime)}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {(selectedRecord.remark || isEditing) && (
                <div className="bg-orange-50/50 rounded-xl p-3 sm:p-4 border border-orange-100">
                  <div className="text-[10px] sm:text-xs font-bold text-orange-500 uppercase tracking-widest mb-2 flex items-center gap-1"><Info size={12} className="sm:w-[14px] sm:h-[14px]" /> Remarks (ปัญหา)</div>
                  {isEditing ? <textarea name="remark" value={editFormData.remark} onChange={handleEditChange} className="w-full bg-white border border-orange-200 rounded-lg p-2 text-xs sm:text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500" rows="2" placeholder="เพิ่มหมายเหตุ..." /> : <p className="text-xs sm:text-sm text-slate-700">{selectedRecord.remark}</p>}
                </div>
              )}
            </div>

            {isEditing && (
              <div className="bg-slate-50 p-3 sm:p-4 border-t border-slate-100 flex justify-end gap-2 sm:gap-3 shrink-0">
                <button onClick={() => setIsEditing(false)} className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm text-slate-500 hover:bg-slate-200 transition-colors">Cancel</button>
                <button onClick={handleSaveEdit} disabled={isSaving} className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200 transition-all active:scale-95 flex items-center gap-1 sm:gap-2">
                  {isSaving ? <Loader2 size={14} className="sm:w-[18px] sm:h-[18px] animate-spin" /> : <Save size={14} className="sm:w-[18px] sm:h-[18px]" />} Save Changes
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- 6. REPORT VIEW ---
const ReportView = ({ segmentRecords, groutRecords, projectInfo }) => {
  const [reportType, setReportType] = useState("daily");
  const [reportDate, setReportDate] = useState(new Date().toISOString().split("T")[0]);
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportShift, setReportShift] = useState("All");

  // === Deduplicate Segments for Reports ===
  const deduplicatedSegments = useMemo(() => {
    const map = new Map();
    segmentRecords.forEach(rec => map.set(rec.ringNo, rec));
    return Array.from(map.values());
  }, [segmentRecords]);

  const filteredSegments = useMemo(() => {
    return deduplicatedSegments.filter((r) => {
      const dDate = formatDisplayDate(r.date);
      if (reportShift !== "All" && r.shift !== reportShift) return false;
      if (reportType === "daily" && dDate !== reportDate) return false;
      if (reportType === "monthly" && !dDate.startsWith(reportMonth)) return false;
      return true;
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

  const summary = useMemo(() => {
    const completedSegments = filteredSegments.filter((s) => s.status !== "In Progress");
    const permSegments = completedSegments.filter(s => s.installType !== "Temporary");
    const tempSegments = completedSegments.filter(s => s.installType === "Temporary");

    const segDay = permSegments.filter((s) => s.shift === "Day").length;
    const segNight = permSegments.filter((s) => s.shift === "Night").length;
    
    const totalLength = permSegments.reduce((sum, s) => sum + parseFloat(s.length || 0), 0).toFixed(2);
    const totalSoilVol = permSegments.reduce((sum, s) => sum + parseFloat(s.soilVolume || calculateSoilVolume(s.length)), 0).toFixed(2);
    const totalGroutVol = filteredGrouts.reduce((sum, g) => sum + parseFloat(g.total || 0), 0).toFixed(2);
    
    const avgGroutRatio = filteredGrouts.length > 0
        ? (filteredGrouts.reduce((sum, g) => sum + parseFloat(g.ratio || 0), 0) / filteredGrouts.length).toFixed(1)
        : "0.0";
    const uniqueGroutedRings = new Set(filteredGrouts.map((g) => g.ringNo)).size;

    const allRemarks = [
      ...filteredSegments.filter((s) => s.remark).map((s) => ({ ring: s.ringNo, module: "Segment", text: s.remark })),
      ...filteredGrouts.filter((g) => g.remark).map((g) => ({ ring: g.ringNo, module: "Grout", text: g.remark })),
    ];

    return {
      permCount: permSegments.length,
      tempCount: tempSegments.length,
      totalSegments: completedSegments.length,
      segDay,
      segNight,
      totalLength,
      totalSoilVol,
      totalGroutVol,
      avgGroutRatio,
      uniqueGroutedRings,
      allRemarks,
    };
  }, [filteredSegments, filteredGrouts]);

  const displayDateStr = reportType === "daily"
      ? new Date(reportDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : new Date(reportMonth + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      <div className="no-print bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 w-full md:w-auto">
          <button onClick={() => setReportType("daily")} className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-bold transition-all ${reportType === "daily" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Daily Report</button>
          <button onClick={() => setReportType("monthly")} className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-bold transition-all ${reportType === "monthly" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Monthly Report</button>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 w-full md:w-auto">
          <select value={reportShift} onChange={(e) => setReportShift(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-blue-500 bg-white cursor-pointer w-full sm:w-auto">
            <option value="All">All Shifts</option><option value="Day">Day Shift</option><option value="Night">Night Shift</option>
          </select>
          {reportType === "daily" ? (
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-blue-500 w-full sm:w-auto" />
          ) : (
            <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-blue-500 w-full sm:w-auto" />
          )}
          <button onClick={() => window.print()} className="w-full sm:w-auto bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 font-bold shadow-md transition-colors whitespace-nowrap"><Printer size={18} /> Print PDF</button>
        </div>
      </div>

      <div className="bg-white p-4 sm:p-8 md:p-12 rounded-2xl md:rounded-2xl shadow-sm md:shadow-lg border border-slate-200 text-slate-800 print:p-0 print:m-0 print:shadow-none print:border-none">
        <div className="border-b-2 border-slate-800 pb-4 sm:pb-6 mb-6 sm:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-black text-slate-900 uppercase tracking-tight">TBM Construction Report</h1>
            <p className="text-slate-500 font-medium mt-1 uppercase tracking-widest text-xs sm:text-sm">{reportType === "daily" ? "Daily Progress" : "Monthly Summary"}</p>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-sm sm:text-lg font-bold text-slate-800 bg-slate-100 px-3 py-1 rounded inline-block">{displayDateStr} {reportShift !== "All" && <span className="text-blue-600 ml-1">({reportShift})</span>}</div>
            <div className="text-[10px] sm:text-xs text-slate-500 font-medium mt-2">{projectInfo.tbmNo} | {projectInfo.location}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mb-6 sm:mb-8">
          <div className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200">
            <div className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-500 mb-1">Rings Installed</div>
            <div className="text-lg sm:text-2xl font-black text-emerald-600">{summary.permCount} <span className="text-[10px] sm:text-xs text-slate-400 font-bold ml-1">Perm.</span></div>
            <div className="text-[9px] sm:text-xs font-medium text-slate-500 mt-1">+ {summary.tempCount} Temp (Total: {summary.totalSegments})</div>
          </div>
          <div className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200">
            <div className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-500 mb-1">Total Perm. Distance</div>
            <div className="text-lg sm:text-2xl font-black text-blue-600">{summary.totalLength} <span className="text-[10px] sm:text-xs text-slate-400 font-bold ml-1">m</span></div>
            <div className="text-[9px] sm:text-xs font-bold text-slate-500 mt-1">ดินขุดรวม: {summary.totalSoilVol} m³</div>
          </div>
          <div className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200">
            <div className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-500 mb-1">Total Grout Vol</div>
            <div className="text-lg sm:text-2xl font-black text-indigo-600">{summary.totalGroutVol} <span className="text-[10px] sm:text-xs text-slate-400 font-bold ml-1">m³</span></div>
            <div className="text-[9px] sm:text-xs font-medium text-slate-500 mt-1">{summary.uniqueGroutedRings} Rings Grouted</div>
          </div>
          <div className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200">
            <div className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-500 mb-1">Avg Grout Ratio</div>
            <div className={`text-lg sm:text-2xl font-black ${parseFloat(summary.avgGroutRatio) > 150 ? "text-purple-500" : parseFloat(summary.avgGroutRatio) >= 100 ? "text-emerald-500" : "text-red-500"}`}>{summary.avgGroutRatio} <span className="text-[10px] sm:text-xs font-bold ml-1">%</span></div>
            <div className="text-[9px] sm:text-xs font-medium text-slate-500 mt-1">Efficiency</div>
          </div>
        </div>

        <div className="mb-6 sm:mb-8 overflow-x-auto">
          <h3 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-widest border-l-4 border-emerald-500 pl-2 mb-3 sm:mb-4">Segment Installation Logs</h3>
          <table className="w-full text-[10px] sm:text-xs text-left border-collapse whitespace-nowrap">
            <thead className="bg-slate-100 text-slate-600 border-y border-slate-300">
              <tr>
                <th className="py-2 px-2 sm:px-3">Date/Shift</th>
                <th className="py-2 px-2 sm:px-3">Ring No.</th>
                <th className="py-2 px-2 sm:px-3">Type/Key</th>
                <th className="py-2 px-2 sm:px-3">Start CH.</th>
                <th className="py-2 px-2 sm:px-3">Finish CH.</th>
                <th className="py-2 px-2 sm:px-3 text-right">Length / Soil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSegments.length > 0 ? (
                [...filteredSegments].reverse().map((r, i) => (
                  <tr key={`${r.id}-${i}`} className="hover:bg-slate-50">
                    <td className="py-2 px-2 sm:px-3">
                      <div className="font-bold text-slate-800">{formatDisplayDate(r.date)} <span className="text-slate-400 font-normal">({r.shift})</span></div>
                      <div className="text-[9px] sm:text-[10px] text-slate-500 mt-1 font-mono"><span className="font-bold">Excav:</span> {formatDisplayTime(r.excavStartTime)} - {formatDisplayTime(r.excavEndTime)}</div>
                      <div className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5 font-mono"><span className="font-bold">Inst:</span> {formatDisplayTime(r.installStartTime || r.startTime)} - {formatDisplayTime(r.installEndTime || r.endTime)}</div>
                    </td>
                    <td className="py-2 px-2 sm:px-3 font-bold text-slate-800">
                      <span className={r.installType === "Temporary" ? "text-amber-600" : ""}>{r.ringNo}</span>
                      {r.installType === "Temporary" && <span className="text-amber-500 ml-2 font-bold text-[8px] sm:text-[9px]">(Temp)</span>}
                      {r.status === "In Progress" && <span className="text-orange-500 ml-2 font-bold text-[8px] sm:text-[9px]">(In Progress)</span>}
                    </td>
                    <td className="py-2 px-2 sm:px-3">{r.typeRing} - K{r.keyPos}</td>
                    <td className="py-2 px-2 sm:px-3 text-slate-500 font-mono">{r.startCH}</td>
                    <td className="py-2 px-2 sm:px-3 text-slate-800 font-bold font-mono">{r.finishCH}</td>
                    <td className="py-2 px-2 sm:px-3 text-right">
                      <div className="font-bold text-emerald-600">{r.length} m</div>
                      <div className="text-[9px] sm:text-[10px] text-amber-600 font-bold mt-0.5">{r.soilVolume || calculateSoilVolume(r.length)} m³</div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="6" className="py-4 text-center text-slate-400 italic">No segment data for this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mb-6 sm:mb-8 overflow-x-auto">
          <h3 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-widest border-l-4 border-blue-500 pl-2 mb-3 sm:mb-4">Primary Grout Logs</h3>
          <table className="w-full text-[10px] sm:text-xs text-left border-collapse whitespace-nowrap">
            <thead className="bg-slate-100 text-slate-600 border-y border-slate-300">
              <tr>
                <th className="py-2 px-2 sm:px-3">Ring No.</th>
                <th className="py-2 px-2 sm:px-3">Excav. Ring</th>
                <th className="py-2 px-2 sm:px-3">Key & Pos</th>
                <th className="py-2 px-2 sm:px-3 text-right">Vol A</th>
                <th className="py-2 px-2 sm:px-3 text-right">Vol B</th>
                <th className="py-2 px-2 sm:px-3 text-right">Total (m³)</th>
                <th className="py-2 px-2 sm:px-3 text-right">Ratio (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredGrouts.length > 0 ? (
                [...filteredGrouts].reverse().map((r, i) => (
                  <tr key={`${r.id}-${i}`} className="hover:bg-slate-50">
                    <td className="py-2 px-2 sm:px-3 font-bold text-slate-800">
                      {r.ringNo}
                      {r.groutPass === "Re-Grout" && <span className="text-purple-600 ml-2 font-bold text-[8px] sm:text-[9px]">(Re-Grout)</span>}
                    </td>
                    <td className="py-2 px-2 sm:px-3 text-slate-500">{r.excavRing}</td>
                    <td className="py-2 px-2 sm:px-3">
                      <div>K{r.key}</div>
                      <div className="flex gap-0.5 flex-wrap mt-0.5">
                        {Object.entries(r.positions || {}).map(([pos, active]) => active && <span key={pos} className="px-1 py-0.5 bg-blue-50 text-blue-700 text-[8px] sm:text-[9px] rounded border border-blue-100 font-bold leading-none">{pos}</span>)}
                      </div>
                    </td>
                    <td className="py-2 px-2 sm:px-3 text-right text-slate-500">{r.partA}</td>
                    <td className="py-2 px-2 sm:px-3 text-right text-slate-500">{r.partB}</td>
                    <td className="py-2 px-2 sm:px-3 text-right font-bold text-slate-700">{r.total.toFixed(2)}</td>
                    <td className="py-2 px-2 sm:px-3 text-right font-bold">
                      <span className={r.ratio > 150 ? "text-purple-600" : r.ratio >= 100 ? "text-emerald-600" : "text-red-600"}>{r.ratio.toFixed(1)}%</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="7" className="py-4 text-center text-slate-400 italic">No grout data for this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {summary.allRemarks.length > 0 && (
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-widest border-l-4 border-orange-500 pl-2 mb-3 sm:mb-4">Issues & Remarks</h3>
            <ul className="space-y-2 text-xs sm:text-sm text-slate-700">
              {summary.allRemarks.map((rem, i) => (
                <li key={i} className="bg-orange-50/50 p-2 sm:p-3 rounded-lg border border-orange-100 flex flex-col sm:flex-row gap-1 sm:gap-3">
                  <span className="font-bold text-orange-600 whitespace-nowrap">[{rem.module} - {rem.ring}]</span>
                  <span>{rem.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

// --- 7. SHIFT REPORT VIEW (NEW & INTEGRATED) ---
const ShiftReportView = ({ projectInfo, segmentRecords, shiftReports, setShiftReports }) => {
  const [isSaving, setIsSaving] = useState(false);

  const defaultManpower = { Engineer: '', Operator: '', Surveyor: '', Machanic: '', Electrician: '', Foreman: '', Worker: '', CraneOp: '' };
  const defaultResult = { startSta: '', finishSta: '', numberRing: '', totalDistance: '', progressRate: '' };

  const [meta, setMeta] = useState({
    date: projectInfo.date || new Date().toISOString().split('T')[0],
    tbmNo: projectInfo.tbmNo || 'TBM1',
    location: projectInfo.location || 'อุโมงค์จากบ่อ IS4 ถึง บ่อ IS2',
    shift: projectInfo.shift || 'Day',
  });

  const [events, setEvents] = useState({});
  const [activeModal, setActiveModal] = useState(null);
  const [manpower, setManpower] = useState(defaultManpower);
  const [result, setResult] = useState(defaultResult);
  
  // เพิ่ม State สำหรับจัดการการแก้ไข Event
  const [editingEventId, setEditingEventId] = useState(null);

  const existingReport = useMemo(() => {
    return shiftReports.find(r => formatDisplayDate(r.date) === meta.date && r.shift === meta.shift);
  }, [shiftReports, meta.date, meta.shift]);

  // Deduplicate segments
  const deduplicatedSegments = useMemo(() => {
    const map = new Map();
    segmentRecords.forEach(rec => map.set(rec.ringNo, rec));
    return Array.from(map.values());
  }, [segmentRecords]);

  // Auto Result calculation
  const autoResult = useMemo(() => {
    const shiftSegs = deduplicatedSegments.filter(r => 
      formatDisplayDate(r.date) === meta.date && 
      r.shift === meta.shift && 
      r.status !== "In Progress" && 
      r.installType !== "Temporary"
    );

    if (shiftSegs.length > 0) {
      const sorted = [...shiftSegs].sort((a, b) => getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo));
      const startSta = sorted[0].startCH;
      const finishSta = sorted[sorted.length - 1].finishCH;
      const numRings = sorted.length;
      const totalDist = sorted.reduce((sum, r) => sum + parseFloat(r.length || 0), 0).toFixed(2);
      
      return {
        startSta: startSta || '',
        finishSta: finishSta || '',
        numberRing: numRings.toString(),
        totalDistance: totalDist,
        progressRate: totalDist
      };
    }
    return defaultResult;
  }, [deduplicatedSegments, meta.date, meta.shift]);

  // Sync with project info updates from parent and existing data from cloud
  useEffect(() => {
    setMeta({
      date: projectInfo.date,
      tbmNo: projectInfo.tbmNo,
      location: projectInfo.location,
      shift: projectInfo.shift,
    });
  }, [projectInfo.date, projectInfo.shift, projectInfo.tbmNo, projectInfo.location]);

  useEffect(() => {
    if (existingReport) {
      setEvents(existingReport.events || {});
      setManpower(existingReport.manpower || defaultManpower);
      
      const savedRes = existingReport.result || {};
      setResult({
        startSta: autoResult.startSta || savedRes.startSta || '',
        finishSta: autoResult.finishSta || savedRes.finishSta || '',
        numberRing: autoResult.numberRing || savedRes.numberRing || '',
        totalDistance: autoResult.totalDistance || savedRes.totalDistance || '',
        progressRate: autoResult.progressRate || savedRes.progressRate || ''
      });
    } else {
      setEvents({});
      setManpower(defaultManpower);
      setResult(autoResult);
    }
  }, [existingReport, meta.date, meta.shift, autoResult]); 

  const handleMetaChange = (e) => {
    const { name, value } = e.target;
    setMeta({ ...meta, [name]: value });
  };

  const handleSaveToCloud = async () => {
    setIsSaving(true);
    const payload = {
      id: existingReport ? existingReport.id : `shift_${Date.now()}`,
      date: meta.date,
      shift: meta.shift,
      tbmNo: meta.tbmNo,
      location: meta.location,
      events: JSON.stringify(events),
      manpower: JSON.stringify(manpower),
      result: JSON.stringify(result)
    };

    try {
      await apiCall(existingReport ? "updateShiftReport" : "addShiftReport", payload);
      
      const savedRecord = {
        ...payload,
        events: events,
        manpower: manpower,
        result: result
      };

      if (existingReport) {
        setShiftReports(prev => prev.map(r => r.id === payload.id ? savedRecord : r));
      } else {
        setShiftReports(prev => [...prev, savedRecord]);
      }
      alert("บันทึก Shift Report ขึ้นระบบ Cloud สำเร็จ");
    } catch (e) {
      alert("บันทึกไม่สำเร็จ: " + e.message);
    }
    setIsSaving(false);
  };

  // --- ฟังก์ชัน Auto-Save สำหรับหน้าต่างเพิ่ม/แก้ไข/ลบเวลา ---
  const triggerAutoSaveEvents = async (updatedEvents) => {
    const payload = {
      id: existingReport ? existingReport.id : `shift_${Date.now()}`,
      date: meta.date,
      shift: meta.shift,
      tbmNo: meta.tbmNo,
      location: meta.location,
      events: JSON.stringify(updatedEvents),
      manpower: JSON.stringify(manpower),
      result: JSON.stringify(result)
    };

    try {
      await apiCall(existingReport ? "updateShiftReport" : "addShiftReport", payload);
      const savedRecord = { ...payload, events: updatedEvents, manpower, result };
      if (existingReport) {
        setShiftReports(prev => prev.map(r => r.id === payload.id ? savedRecord : r));
      } else {
        setShiftReports(prev => [...prev, savedRecord]);
      }
    } catch (e) {
      console.error("Auto-save events failed", e);
    }
  };

  // --- Auto-Sync Events from Segment Records ---
  const displayEvents = useMemo(() => {
    const merged = { ...events };
    
    // กรองข้อมูลให้ตรงกับ วันที่ และ กะ ที่เปิด Report อยู่
    const filteredSegs = deduplicatedSegments.filter(r => 
      formatDisplayDate(r.date) === meta.date && r.shift === meta.shift
    );

    const autoExcav = [];
    const autoInst = [];

    filteredSegs.forEach(rec => {
      const extStart = formatDisplayTime(rec.excavStartTime);
      const extEnd = formatDisplayTime(rec.excavEndTime);
      const instStart = formatDisplayTime(rec.installStartTime || rec.startTime);
      const instEnd = formatDisplayTime(rec.installEndTime || rec.endTime);

      // สร้าง Event ขุดเจาะ
      if (extStart && extEnd) {
        autoExcav.push({ id: `auto_ex_${rec.id}`, start: extStart, end: extEnd, label: rec.ringNo, isAuto: true });
      }
      // สร้าง Event ประกอบ Ring
      if (instStart && instEnd) {
        autoInst.push({ id: `auto_in_${rec.id}`, start: instStart, end: instEnd, label: rec.ringNo, isAuto: true });
      }
    });

    merged['Excavation'] = [...(merged['Excavation'] || []), ...autoExcav];
    merged['Segment Erection'] = [...(merged['Segment Erection'] || []), ...autoInst];

    return merged;
  }, [events, deduplicatedSegments, meta.date, meta.shift]);

  // --- CONFIGURATION ---
  const hoursDay = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const hoursNight = [19, 20, 21, 22, 23, 24, 1, 2, 3, 4, 5, 6];
  const currentHours = meta.shift === 'Day' ? hoursDay : hoursNight;

  const activityCategories = [
    { group: 'Main Activities', items: ['Excavation', 'Segment Erection'] }, 
    { group: 'Delay Activities', items: ['Locomotive / Rail System', 'Survey', 'Power Supply', 'TBM Equipment', 'Clean Area', 'Muck Full', 'Other 1', 'Other 2'] }, 
    { group: 'TBM Service / Maintenance', items: ['Cleaning Belt conveyor', 'Service / Maintenance', 'Other 3'] } 
  ];

  // --- TIME CALCULATIONS ---
  const getMinutesFromShiftStart = (timeStr, shift) => {
    if (!timeStr) return 0;
    let [h, m] = timeStr.split(':').map(Number);
    let shiftStartH = shift === 'Day' ? 7 : 19;
    
    if (shift === 'Day') {
      if (h < 7) h += 24; 
    } else {
      if (h < 19) h += 24; 
    }
    
    return (h * 60 + m) - (shiftStartH * 60);
  };

  const calculateBarStyles = (start, end, shift) => {
    let startMins = getMinutesFromShiftStart(start, shift);
    let endMins = getMinutesFromShiftStart(end, shift);
    
    startMins = Math.max(0, Math.min(startMins, 720));
    endMins = Math.max(0, Math.min(endMins, 720));
    if (endMins < startMins) endMins = startMins;

    let left = (startMins / 720) * 100;
    let width = ((endMins - startMins) / 720) * 100;
    
    return { left: `${left}%`, width: `${width}%`, duration: endMins - startMins };
  };

  const getTotalMinutes = (activityName) => {
    if (!Array.isArray(displayEvents[activityName])) return 0; // ป้องกันแครชหากข้อมูลไม่ใช่ Array
    return displayEvents[activityName].reduce((total, ev) => {
      if (!ev || !ev.start || !ev.end) return total; // ป้องกันแครชหากข้อมูลใน Array ชำรุดหรือเป็น null
      const { duration } = calculateBarStyles(ev.start, ev.end, meta.shift);
      return total + duration;
    }, 0);
  };

  const getBarColorClasses = (groupIndex) => {
    switch(groupIndex) {
      case 0: return 'bg-stripe-blue border-blue-500 text-blue-900';
      case 1: return 'bg-stripe-red border-red-500 text-red-900';
      case 2: return 'bg-stripe-green border-green-500 text-green-900';
      default: return 'bg-gray-100 border-gray-400 text-gray-800';
    }
  };

  const handleManpowerChange = (e) => setManpower({ ...manpower, [e.target.name]: e.target.value });
  const handleResultChange = (e) => setResult({ ...result, [e.target.name]: e.target.value });
  const handlePrint = () => window.print();

  const [newEvent, setNewEvent] = useState({ start: '', end: '', label: '' });

  const addEvent = (activityName) => {
    if (!newEvent.start || !newEvent.end) return alert('กรุณาระบุเวลาเริ่มและสิ้นสุด');
    const updatedEvents = { ...events };
    if (!updatedEvents[activityName]) updatedEvents[activityName] = [];
    
    if (editingEventId) {
      updatedEvents[activityName] = updatedEvents[activityName].map(ev => 
        ev.id === editingEventId ? { ...ev, start: newEvent.start, end: newEvent.end, label: newEvent.label } : ev
      );
    } else {
      updatedEvents[activityName].push({ ...newEvent, id: Date.now() });
    }
    
    setEvents(updatedEvents);
    setNewEvent({ start: '', end: '', label: '' });
    setEditingEventId(null);
    triggerAutoSaveEvents(updatedEvents);
  };

  const deleteEvent = (activityName, id) => {
    const updatedEvents = { ...events };
    updatedEvents[activityName] = updatedEvents[activityName].filter(ev => ev.id !== id);
    
    if (updatedEvents[activityName].length === 0) {
      delete updatedEvents[activityName];
    }
    
    setEvents(updatedEvents);
    triggerAutoSaveEvents(updatedEvents);
  };

  const handleEditEventClick = (ev) => {
    if (ev.isAuto) return;
    setNewEvent({ start: ev.start, end: ev.end, label: ev.label });
    setEditingEventId(ev.id);
  };

  const cancelEdit = () => {
    setNewEvent({ start: '', end: '', label: '' });
    setEditingEventId(null);
  };

  const closeModal = () => {
    setActiveModal(null);
    cancelEdit();
  };

  const renderInput = (value, onChange, name, placeholder = "", type = "text", className = "") => (
    <input
      type={type} name={name} value={value} onChange={onChange} placeholder={placeholder}
      className={`w-full bg-transparent outline-none border-b border-gray-300 focus:border-blue-500 print:border-b print:border-black print:text-black ${className}`}
    />
  );

  return (
    <div className="max-w-6xl mx-auto font-sans text-sm pb-24 animate-fade-in">
      <div className="mb-4 bg-white p-4 rounded-xl shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4 no-print border border-slate-200">
        <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <FileText className="text-blue-600" />
          ระบบบันทึก TBM Shift Report
        </h1>
        <div className="flex w-full sm:w-auto gap-2">
          <button onClick={handleSaveToCloud} disabled={isSaving} className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm font-bold justify-center">
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <CloudUpload size={18} />}
            {isSaving ? "Saving..." : "Save to Cloud"}
          </button>
          <button onClick={handlePrint} className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm font-bold justify-center">
            <Printer size={18} /> Print PDF
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-300 shadow-sm print:shadow-none print:border-none rounded-xl overflow-hidden print:rounded-none">
        
        <div className="p-6 border-b-2 border-black print:p-2 text-center bg-white">
          <h2 className="text-xl print:text-lg font-bold mb-1">บันทึกการทำงานการขุดเจาะอุโมงค์</h2>
          <p className="font-semibold text-gray-700 print:text-black text-sm mb-1">โครงการงานก่อสร้างอุโมงค์ระบายน้ำคลองเปรมประชากรจากคลองบางบัวลงสู่แม่น้ำเจ้าพระยา</p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-6 text-xs sm:text-sm mt-3 text-gray-800 print:text-black items-center">
            <p><strong>ผู้ว่าจ้าง :</strong> สำนักการระบายน้ำ กรุงเทพมหานคร</p>
            <div className="flex items-center gap-2">
              <strong>ผู้ให้บริการควบคุมงานก่อสร้าง :</strong>
              <div className="flex items-center bg-white px-2 py-0.5 rounded border border-gray-300 shadow-sm print:shadow-none print:border-gray-400">
                <span className="text-[#004a80] font-black tracking-tighter border-r border-gray-300 pr-2 text-xs">TEAM GROUP</span>
                <span className="text-[#1a85b6] font-black pl-2 text-xs flex items-center gap-1">
                  <div className="w-3 h-3 bg-gray-200 rounded-sm flex items-center justify-center relative overflow-hidden">
                    <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-transparent border-b-[#1a85b6] absolute bottom-0.5"></div>
                  </div>
                  GFE
                </span>
              </div>
            </div>
            <p><strong>ผู้รับจ้าง :</strong> กิจการร่วมค้า ไอทีดี-เอ็นดับเบิลยูอาร์</p>
          </div>
        </div>

        <div className="p-4 print:p-2 border-b-2 border-black flex flex-wrap gap-4 items-center bg-gray-50 print:bg-white text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <strong>วันที่:</strong>
            <input type="date" name="date" value={meta.date} onChange={handleMetaChange} className="border border-slate-300 p-1.5 rounded-md print:border-none print:bg-transparent text-gray-700 outline-none" />
          </div>
          <div className="flex items-center gap-2">
            <strong>หัวเจาะหมายเลข:</strong>
            <input type="text" name="tbmNo" value={meta.tbmNo} onChange={handleMetaChange} className="border border-slate-300 p-1.5 rounded-md w-24 print:border-none print:bg-transparent outline-none" />
          </div>
          <div className="flex items-center gap-2 flex-grow">
            <strong>ตำแหน่ง:</strong>
            <input type="text" name="location" value={meta.location} onChange={handleMetaChange} className="border border-slate-300 p-1.5 rounded-md w-full print:border-none print:bg-transparent outline-none" />
          </div>
          <div className="flex items-center gap-4 font-bold bg-white p-2 rounded-lg border shadow-sm print:shadow-none print:border-none">
            <label className="flex items-center gap-1 cursor-pointer text-orange-600">
              <input type="radio" name="shift" value="Day" checked={meta.shift === 'Day'} onChange={handleMetaChange} /> Day (07-19)
            </label>
            <label className="flex items-center gap-1 cursor-pointer text-indigo-600">
              <input type="radio" name="shift" value="Night" checked={meta.shift === 'Night'} onChange={handleMetaChange} /> Night (19-07)
            </label>
          </div>
        </div>

        <div className="overflow-x-auto border-b border-black">
          <table className="w-full text-xs print:text-[11px] border-collapse table-fixed min-w-[800px]">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-black p-2 text-left" style={{ width: '22%' }}>Time / Activities</th>
                {currentHours.map((hour, idx) => (
                  <th key={idx} className="border border-black p-1 text-center" style={{ width: '6%' }}>{hour}</th>
                ))}
                <th className="border border-black p-1 text-center" style={{ width: '6%' }}>Total Time<br/>(min)</th>
              </tr>
            </thead>
            <tbody>
              {activityCategories.map((cat, cIdx) => (
                <React.Fragment key={cIdx}>
                  <tr className="bg-gray-200">
                    <td colSpan={14} className="border border-black p-1.5 font-bold pl-2">{cat.group}</td>
                  </tr>
                  {cat.items.map((item, iIdx) => {
                    const totalMins = getTotalMinutes(item);
                    return (
                      <tr key={`${cIdx}-${iIdx}`} className="group h-[34px]">
                        <td className="border border-black p-1 pl-4 relative bg-white">
                          {item}
                          <button 
                            onClick={() => setActiveModal(item)}
                            className="absolute right-1 top-1 text-blue-500 hover:bg-blue-100 p-1 rounded no-print opacity-0 group-hover:opacity-100 transition-opacity"
                            title="เพิ่มเวลาการทำงาน"
                          >
                            <Plus size={14} />
                          </button>
                        </td>
                        
                        <td colSpan={12} className="border border-black p-0 relative">
                          <div className="absolute inset-0 flex pointer-events-none">
                            {currentHours.map((h, idx) => (
                              <div key={idx} className={`h-full w-[8.333%] ${idx < 11 ? 'border-r border-gray-200 print:border-gray-300' : ''}`} />
                            ))}
                          </div>

                          <div className="absolute inset-y-[4px] inset-x-0">
                            {(Array.isArray(displayEvents[item]) ? displayEvents[item] : [])
                              .filter((ev) => ev != null)
                              .map((ev, index) => {
                                const { left, width } = calculateBarStyles(ev.start, ev.end, meta.shift);
                                const colorClasses = getBarColorClasses(cIdx);
                                return (
                                  <div 
                                    key={`${ev.id || index}-${index}`} 
                                    className={`absolute h-full border-[1.5px] rounded-[3px] flex items-center justify-center text-[11px] font-extrabold overflow-visible whitespace-nowrap px-1 cursor-pointer z-10 hover:brightness-95 ${colorClasses}`}
                                    style={{ left, width }}
                                    onClick={() => !ev?.isAuto && setActiveModal(item)}
                                    title={`${ev.start} - ${ev.end}`}
                                  >
                                    <span className="bg-white/90 px-1 rounded-sm shadow-sm">{ev.label || ""}</span>
                                  </div>
                                );
                            })}
                          </div>
                        </td>

                        <td className="border border-black p-1 text-center bg-gray-50 print:bg-white font-bold text-blue-800 print:text-blue-800">
                          {totalMins > 0 ? totalMins : ''}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 border-b border-black">
          <div className="p-4 print:p-2 border-r border-black bg-white">
            <h3 className="font-bold flex items-center gap-2 mb-3 bg-gray-100 print:bg-transparent p-1.5 rounded">
              <Users size={16} /> Man Power (People)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs print:text-[11px]">
              {Object.keys(manpower).map(role => (
                <div key={role} className="flex flex-col">
                  <span className="text-gray-600 font-semibold mb-1">{role}</span>
                  {renderInput(manpower[role], handleManpowerChange, role, "0", "number", "text-center bg-gray-50 p-1.5 rounded")}
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 print:p-2 bg-white">
            <h3 className="font-bold flex items-center gap-2 mb-3 bg-gray-100 print:bg-transparent p-1.5 rounded">
              <Activity size={16} /> Result
            </h3>
            <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-xs print:text-[11px]">
              <div className="flex items-center justify-between border-b border-dashed border-gray-300 pb-1">
                <span>Start: Sta.</span>
                <div className="w-24">{renderInput(result.startSta, handleResultChange, 'startSta', '', 'text', 'text-right font-bold')}</div>
              </div>
              <div className="flex items-center justify-between border-b border-dashed border-gray-300 pb-1">
                <span>Finish: Sta.</span>
                <div className="w-24">{renderInput(result.finishSta, handleResultChange, 'finishSta', '', 'text', 'text-right font-bold')}</div>
              </div>
              <div className="flex items-center justify-between border-b border-dashed border-gray-300 pb-1">
                <span>Number of ring:</span>
                <div className="w-24">{renderInput(result.numberRing, handleResultChange, 'numberRing', '', 'number', 'text-right font-bold text-blue-800')}</div>
              </div>
              <div className="flex items-center justify-between border-b border-dashed border-gray-300 pb-1">
                <span>Total Distance (m.):</span>
                <div className="w-24">{renderInput(result.totalDistance, handleResultChange, 'totalDistance', '', 'text', 'text-right font-bold')}</div>
              </div>
              <div className="flex items-center justify-between col-span-2 sm:col-span-1 border-b border-dashed border-gray-300 pb-1">
                <span>Progress Rate (m./shift):</span>
                <div className="w-24">{renderInput(result.progressRate, handleResultChange, 'progressRate', '', 'text', 'text-right font-bold')}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 print:p-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-center text-xs print:text-[11px] min-h-[140px] bg-white">
          {['ผู้บันทึก (ผู้รับจ้าง)', 'วิศวกร (ผู้รับจ้าง)', 'วิศวกร (กลุ่มบริษัทที่ปรึกษา)', 'ผู้ควบคุมงาน สำนักการระบายน้ำ'].map((role, idx) => (
            <div key={idx} className="flex flex-col justify-end space-y-4">
              <p className="text-gray-500 font-medium">{idx === 0 ? 'บันทึกโดย' : idx === 1 ? 'ตรวจสอบโดย' : ''}</p>
              <div className="border-b border-black w-3/4 mx-auto pb-6 relative mt-4">
                 <input type="text" className="absolute bottom-0 left-0 w-full text-center bg-transparent outline-none grid-input font-bold" placeholder="(ชื่อ-สกุล)" />
              </div>
              <p className="font-bold">{role}</p>
            </div>
          ))}
        </div>

      </div>

      {/* --- ADD EVENT MODAL --- */}
      {activeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 no-print">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-[450px] max-w-[90%] transform transition-all">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2 text-slate-800">
                <Clock className="text-blue-500" />
                {editingEventId ? 'แก้ไขเวลา:' : 'เพิ่มเวลา:'} {activeModal}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-red-500 bg-slate-100 hover:bg-red-50 rounded-full p-1 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-widest">เวลาเริ่ม (Start)</label>
                <input type="time" value={newEvent.start} onChange={e => setNewEvent({...newEvent, start: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-widest">เวลาสิ้นสุด (End)</label>
                <input type="time" value={newEvent.end} onChange={e => setNewEvent({...newEvent, end: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-widest">ข้อความในกราฟ</label>
              <input type="text" value={newEvent.label} onChange={e => setNewEvent({...newEvent, label: e.target.value})} placeholder="เช่น 108 หรือ K-14" className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="flex flex-col gap-2 mb-6">
              <button
                onClick={() => addEvent(activeModal)}
                className={`w-full text-white rounded-lg p-3 font-bold transition-colors shadow-lg flex items-center justify-center gap-2 ${
                  editingEventId
                    ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
                    : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
                }`}
              >
                {editingEventId ? <Save size={18} /> : <Plus size={18} />}
                {editingEventId ? "บันทึกการแก้ไข" : "เพิ่มช่วงเวลาลงกราฟ"}
              </button>
              {editingEventId && (
                <button
                  onClick={cancelEdit}
                  className="w-full text-slate-500 hover:text-slate-700 text-xs font-bold py-1 underline"
                >
                  ยกเลิกการแก้ไข
                </button>
              )}
            </div>

            {/* List of existing events */}
            {Array.isArray(displayEvents[activeModal]) &&
              displayEvents[activeModal].length > 0 && (
              <div>
                <h4 className="font-bold text-xs uppercase tracking-widest mb-2 text-slate-500 border-t border-slate-100 pt-4">รายการที่บันทึกไว้แล้ว</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {displayEvents[activeModal]
                    .filter((ev) => ev != null)
                    .map((ev, index) => (
                    <div key={`${ev.id || index}-${index}`} className={`flex justify-between items-center bg-slate-50 p-2.5 rounded-lg text-sm border ${editingEventId === ev?.id ? 'border-emerald-500 ring-1 ring-emerald-500 bg-emerald-50/30' : 'border-slate-200'}`}>
                      <span>{ev.start} - {ev.end} <strong className="ml-2 text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">[{ev.label || ""}]</strong></span>
                      {ev.isAuto ? (
                        <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-1 rounded font-bold border border-emerald-100">Auto (System)</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleEditEventClick(ev)} className="text-blue-500 hover:bg-blue-100 p-1.5 rounded transition-colors" title="แก้ไข">
                            <Edit size={16} />
                          </button>
                          <button onClick={() => deleteEvent(activeModal, ev.id)} className="text-red-500 hover:bg-red-100 p-1.5 rounded transition-colors" title="ลบ">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN APPLICATION COMPONENT
// ============================================================================
const PrimaryGroutApp = () => {
  const [currentModule, setCurrentModule] = useState("segment");
  const [activeTab, setActiveTab] = useState("overview"); 
  const [isLoadingMain, setIsLoadingMain] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [projectInfo, setProjectInfo] = useState({
    date: new Date().toISOString().split("T")[0],
    shift: "Day",
    location: "อุโมงค์จากบ่อ IS4 ถึง บ่อ IS2",
    tbmNo: "TBM1",
  });

  const [groutRecords, setGroutRecords] = useState([]);
  const [segmentRecords, setSegmentRecords] = useState([]);
  const [shiftReports, setShiftReports] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      if (GAS_URL !== "YOUR_WEB_APP_URL_HERE" && GAS_URL.startsWith("http")) {
        try {
          const response = await fetch(`${GAS_URL}?action=getData`, { redirect: "follow" });
          const textData = await response.text();
          if (textData.trim().startsWith("<")) throw new Error("Received HTML error.");
          const result = JSON.parse(textData);
          if (result.status === "success") {
            const formattedSegments = (result.segments || []).map(r => ({
              ...r,
              excavStartTime: formatDisplayTime(r.excavStartTime),
              excavEndTime: formatDisplayTime(r.excavEndTime),
              installStartTime: formatDisplayTime(r.installStartTime),
              installEndTime: formatDisplayTime(r.installEndTime),
              startTime: formatDisplayTime(r.startTime),
              endTime: formatDisplayTime(r.endTime),
            }));
            setSegmentRecords(formattedSegments);

            const parsedGrouts = (result.grouts || []).map((g) => {
              let parsedPos = {};
              try { parsedPos = typeof g.positions === "string" ? JSON.parse(g.positions) : g.positions; } catch(e){}
              return { ...g, positions: parsedPos || {}, total: parseFloat(g.total) || 0, ratio: parseFloat(g.ratio) || 0 };
            });
            setGroutRecords(parsedGrouts);

            const defaultManpower = { Engineer: '', Operator: '', Surveyor: '', Machanic: '', Electrician: '', Foreman: '', Worker: '', CraneOp: '' };
            const defaultResult = { startSta: '', finishSta: '', numberRing: '', totalDistance: '', progressRate: '' };
            const parsedShiftReports = (result.shiftReports || []).map(sr => ({
              ...sr,
              events: safeParseJSON(sr.events, {}),
              manpower: safeParseJSON(sr.manpower, defaultManpower),
              result: safeParseJSON(sr.result, defaultResult)
            }));
            setShiftReports(parsedShiftReports);
          }
        } catch (error) {
          setLoadError("ไม่สามารถดึงข้อมูลได้: " + error.message);
        }
      }
      setIsLoadingMain(false);
    };
    fetchData();
  }, []);

  const handleProjectInfoChange = (e) => setProjectInfo({ ...projectInfo, [e.target.name]: e.target.value });

  const liveHeaderStatus = useMemo(() => {
    if (segmentRecords.length === 0) return null;
    
    const map = new Map();
    segmentRecords.forEach(rec => map.set(rec.ringNo, rec));
    const deduped = Array.from(map.values());
    const lastSeg = deduped[deduped.length - 1];
    
    if (lastSeg.status === "In Progress") {
      if (lastSeg.excavStartTime && !lastSeg.excavEndTime) return { text: `กำลังขุดเจาะ ${lastSeg.ringNo}`, color: "bg-amber-500", icon: <AlertCircle size={12}/> };
      if (lastSeg.excavEndTime && !lastSeg.installStartTime) return { text: `ขุดเสร็จ รอประกอบ ${lastSeg.ringNo}`, color: "bg-slate-500", icon: <Clock size={12}/> };
      if (lastSeg.installStartTime && !lastSeg.installEndTime) return { text: `กำลังประกอบ ${lastSeg.ringNo}`, color: "bg-emerald-500", icon: <Activity size={12}/> };
      return { text: `กำลังทำงาน ${lastSeg.ringNo}`, color: "bg-blue-500", icon: <Activity size={12}/> };
    }
    return null; 
  }, [segmentRecords]);

  if (isLoadingMain) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin w-10 h-10 mb-4 text-blue-500" />
        <div className="font-bold text-slate-700">Connecting to Server...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans text-slate-800 selection:bg-blue-100 overflow-x-hidden print:overflow-visible print:bg-white print:min-h-0 print:block">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/60 shadow-sm transition-all no-print">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className={`p-2 sm:p-2.5 rounded-xl text-white shadow-lg transition-colors bg-slate-800`}>
              <Layers size={18} className="sm:w-5 sm:h-5" strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight">TBM1 System</h1>
                {/* 🔴 LIVE BLINKING INDICATOR 🔴 */}
                {liveHeaderStatus && (
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold text-white shadow-sm animate-pulse ${liveHeaderStatus.color}`}>
                    {liveHeaderStatus.icon} {liveHeaderStatus.text}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 text-[9px] sm:text-[10px] text-slate-500 font-medium mt-0.5">
                <MapPin size={10} />
                <input type="text" name="location" value={projectInfo.location} onChange={handleProjectInfoChange} list="locations-list" className="bg-transparent border-none p-0 focus:ring-0 w-48 sm:w-64 outline-none cursor-pointer placeholder-slate-400" placeholder="สถานที่..." />
                <datalist id="locations-list">
                  <option value="อุโมงค์จากบ่อ IS4 ถึง บ่อ IS2" />
                </datalist>
              </div>
            </div>
          </div>

          {activeTab !== "overview" && activeTab !== "shift_report" && (
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-full md:w-auto">
              <button onClick={() => { setCurrentModule("segment"); setActiveTab("record"); }} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${currentModule === "segment" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Segment</button>
              <button onClick={() => { setCurrentModule("grout"); setActiveTab("record"); }} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${currentModule === "grout" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Grout</button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="px-2 sm:px-4 py-4 sm:py-8 max-w-7xl mx-auto print:p-0 print:m-0">
        {loadError && <div className="mb-4 bg-red-50 text-red-700 p-4 rounded-xl text-center no-print">{loadError}</div>}

        {activeTab === "overview" && (
          <OverviewView segmentRecords={segmentRecords} groutRecords={groutRecords} setCurrentModule={setCurrentModule} setActiveTab={setActiveTab}/>
        )}
        
        {activeTab === "record" && currentModule === "grout" && (
          <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={handleProjectInfoChange} groutRecords={groutRecords} setGroutRecords={setGroutRecords} segmentRecords={segmentRecords} setCurrentModule={setCurrentModule} setActiveTab={setActiveTab} />
        )}
        {activeTab === "record" && currentModule === "segment" && (
          <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={handleProjectInfoChange} segmentRecords={segmentRecords} setSegmentRecords={setSegmentRecords} setCurrentModule={setCurrentModule} setActiveTab={setActiveTab} />
        )}
        
        {activeTab === "dashboard" && currentModule === "grout" && (
          <GroutDashboardView groutRecords={groutRecords} setGroutRecords={setGroutRecords} segmentRecords={segmentRecords} />
        )}
        {activeTab === "dashboard" && currentModule === "segment" && (
          <SegmentDashboardView segmentRecords={segmentRecords} setSegmentRecords={setSegmentRecords} />
        )}
        {activeTab === "report" && (
          <ReportView segmentRecords={segmentRecords} groutRecords={groutRecords} projectInfo={projectInfo} />
        )}
        
        {/* SHIFT REPORT VIEW */}
        {activeTab === "shift_report" && (
          <ShiftReportView projectInfo={projectInfo} segmentRecords={segmentRecords} shiftReports={shiftReports} setShiftReports={setShiftReports} />
        )}

      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-4 sm:bottom-6 left-1/2 transform -translate-x-1/2 z-40 no-print w-[95%] sm:w-auto max-w-2xl">
        <div className="flex items-center justify-between sm:justify-center gap-1 bg-slate-900/95 backdrop-blur-xl border border-white/10 shadow-2xl p-1.5 rounded-full overflow-x-auto hide-scrollbar">
          
          <button onClick={() => setActiveTab("overview")} className={`flex-none flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-full text-[10px] sm:text-xs font-bold transition-all ${activeTab === "overview" ? "bg-white text-slate-900 shadow-lg" : "text-slate-300 hover:bg-white/10"}`}>
            <Home size={16} /> <span className="hidden sm:inline">Home</span>
          </button>
          
          <div className="w-px h-6 bg-white/20 mx-0.5"></div>

          <button onClick={() => setActiveTab("record")} className={`flex-none flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-full text-[10px] sm:text-xs font-bold transition-all ${activeTab === "record" ? "bg-white text-slate-900 shadow-lg" : "text-slate-300 hover:bg-white/10"}`}>
            <PlusCircle size={16} /> <span className="hidden sm:inline">Record</span><span className="sm:hidden">Rec</span>
          </button>
          
          <button onClick={() => setActiveTab("dashboard")} className={`flex-none flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-full text-[10px] sm:text-xs font-bold transition-all ${activeTab === "dashboard" ? "bg-white text-slate-900 shadow-lg" : "text-slate-300 hover:bg-white/10"}`}>
            <LayoutDashboard size={16} /> <span className="hidden sm:inline">Dash</span>
          </button>
          
          <div className="w-px h-6 bg-white/20 mx-0.5"></div>

          <button onClick={() => setActiveTab("shift_report")} className={`flex-none flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-full text-[10px] sm:text-xs font-bold transition-all ${activeTab === "shift_report" ? "bg-white text-slate-900 shadow-lg" : "text-slate-300 hover:bg-white/10"}`}>
            <Clock size={16} /> <span className="hidden sm:inline">Shift Report</span><span className="sm:hidden">Shift</span>
          </button>

          <button onClick={() => setActiveTab("report")} className={`flex-none flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-full text-[10px] sm:text-xs font-bold transition-all ${activeTab === "report" ? "bg-white text-slate-900 shadow-lg" : "text-slate-300 hover:bg-white/10"}`}>
            <FileText size={16} /> <span className="hidden sm:inline">Stats</span><span className="sm:hidden">Stats</span>
          </button>

        </div>
      </nav>
      
      <style dangerouslySetInnerHTML={{__html: `
        body { font-family: 'Inter', -apple-system, sans-serif; background-color: #F8FAFC; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        /* ซ่อนปุ่ม Open Sandbox ของ CodeSandbox ที่บังหน้าจอ */
        #csb-display-layer, 
        #csb-open-sandbox, 
        [class*="csb-"], 
        div[style*="z-index: 9999999"] { 
          display: none !important; 
          opacity: 0 !important; 
          visibility: hidden !important; 
          pointer-events: none !important; 
        }

        /* --- Global Print Styles for all PDF Exports --- */
        @media print {
          @page { 
            size: A4 portrait; 
            margin: 5mm; 
          }
          
          html, body, #root { 
            background-color: white !important; 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important; 
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important; 
            min-height: auto !important;
            overflow: visible !important;
            display: block !important;
          }
          
          .no-print { display: none !important; }
          
          main { 
            padding: 0 !important; 
            margin: 0 auto !important; 
            width: 100% !important;
            max-width: 100% !important;
            display: flex !important;
            justify-content: center !important; 
          }
          
          main > div {
            width: 100% !important;
            transform: scale(0.85); 
            transform-origin: top center; 
            page-break-inside: avoid !important;
          }
          
          table, tr, td, th { page-break-inside: avoid !important; }

          /* Custom Print inputs for Shift Report */
          input { border: none !important; border-bottom: 1px dotted black !important; padding: 0 !important; background: transparent !important; color: black !important; }
          input:focus { border-bottom: 1px dotted black !important; outline: none; }
          .grid-input { border-bottom: none !important; text-align: center; }
        }

        /* --- Custom Striped Backgrounds for Shift Report --- */
        .bg-stripe-blue { background-color: #eff6ff; background-image: repeating-linear-gradient(60deg, transparent, transparent 4px, rgba(59, 130, 246, 0.25) 4px, rgba(59, 130, 246, 0.25) 8px); }
        .bg-stripe-red { background-color: #fef2f2; background-image: repeating-linear-gradient(60deg, transparent, transparent 4px, rgba(239, 68, 68, 0.25) 4px, rgba(239, 68, 68, 0.25) 8px); }
        .bg-stripe-green { background-color: #f0fdf4; background-image: repeating-linear-gradient(60deg, transparent, transparent 4px, rgba(34, 197, 94, 0.25) 4px, rgba(34, 197, 94, 0.25) 8px); }
      `}}/>
    </div>
  );
};

export default PrimaryGroutApp;
