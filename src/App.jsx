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
  CloudUpload,
  Sparkles,
  Copy,
  Download
} from "lucide-react";

// ============================================================================
// การตั้งค่า Google Apps Script (Web App URL)
// ============================================================================
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbyRUl5BVmZYDhw_Z0Uo2LWBLmaQAaOjJZR4jLGw-MuxHIFcKEhu7FBF9tV33JAnKz1aTw/exec";

// --- ฟังก์ชันโหลดไลบรารีถ่ายภาพหน้าจอ (ทำให้อัตโนมัติ ไม่ต้อง npm install) ---
const loadHtml2Canvas = async () => {
  if (window.html2canvas) return window.html2canvas;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    script.onload = () => resolve(window.html2canvas);
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

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
  const radius = 6.3 / 2; // เปลี่ยน dia. จาก 5.7 เป็น 6.3
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

// --- ฟังก์ชันเรียกใช้งาน Gemini AI ---
const generateGeminiSummary = async (promptText, systemText) => {
  // ⚠️ สำคัญสำหรับการนำไปใช้งานจริง (Deploy ขึ้น Vercel/GitHub):
  // 1. ไปที่ https://aistudio.google.com/app/apikey เพื่อสร้าง API Key (ฟรี)
  // 2. นำ API Key ที่ได้มาใส่ในเครื่องหมายคำพูดด้านล่าง (เช่น "AIzaSy...")
  const apiKey = "AIzaSyChH_yehIRl2giFQIzcSVy-t8ZpDwEbh_k"; 
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.trim()}`;

  const payload = {
    contents: [{ parts: [{ text: promptText }] }],
    systemInstruction: {
      parts: [{ text: systemText || "คุณคือผู้ช่วยวิศวกรควบคุมงานก่อสร้างอุโมงค์ TBM หน้าที่ของคุณคือการนำข้อมูลดิบไปจัดเรียงและสรุปใส่ใน Template รายงานที่กำหนดให้อย่างถูกต้องและเป๊ะที่สุด" }]
    }
  };

  const retries = 3;
  const delays = [1000, 2000, 4000];

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        // ดึงรายละเอียด Error จริงๆ จาก Google ออกมาโชว์
        const errDetails = await response.text();
        console.error("Gemini API Error Details:", errDetails);
        throw new Error(`HTTP ${response.status} - ${errDetails}`);
      }
      
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
      throw new Error("No text in response");
    } catch (error) {
      console.error(`Gemini Call Attempt ${i + 1} Failed:`, error);
      if (i === retries - 1) throw error;
      await new Promise(res => setTimeout(res, delays[i]));
    }
  }
};

// --- Shared Components ---
const StatCard = ({ label, value, subtext, color, icon: Icon }) => (
  <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between group">
    <div className={`absolute -right-4 -top-4 p-4 opacity-[0.05] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-12 ${color}`}>
      <Icon size={80} />
    </div>
    <div className="relative z-10">
      <div className="text-[10px] sm:text-xs text-slate-500 uppercase font-extrabold tracking-wider mb-2">
        {label}
      </div>
      <div className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">
        {value}
      </div>
    </div>
    {subtext && (
      <div
        className={`text-[10px] font-bold mt-4 pt-3 border-t border-slate-100 ${color.replace(
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
    { id: "C1", label: "C1", start: 12.5, end: 79.5 },
    { id: "B1", label: "B1", start: 79.5, end: 146.5 },
    { id: "A", label: "A", start: 146.5, end: 213.5 },
    { id: "B2", label: "B2", start: 213.5, end: 280.5 },
    { id: "C2", label: "C2", start: 280.5, end: 347.5 },
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
      <div className="absolute bottom-0 bg-white/80 backdrop-blur px-4 py-1.5 rounded-full border border-slate-200 text-[10px] font-bold text-slate-600 shadow-sm">
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
      <div className={`rounded-3xl p-8 sm:p-10 text-white relative overflow-hidden shadow-2xl ${
        liveStatus.state === "EXCAVATING" ? "bg-gradient-to-br from-amber-500 to-orange-600 shadow-orange-500/20" :
        liveStatus.state === "INSTALLING" ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20" :
        liveStatus.state === "WAITING_INSTALL" ? "bg-gradient-to-br from-slate-600 to-slate-800 shadow-slate-500/20" :
        "bg-gradient-to-br from-blue-600 to-indigo-700 shadow-blue-500/20"
      }`}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            {liveStatus.state !== "IDLE" && <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
            </span>}
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
            Target Ring: <span className="bg-white/20 px-4 py-1 rounded-xl backdrop-blur-sm">{liveStatus.ring}</span>
          </div>
          
          <div className="bg-black/20 backdrop-blur-md rounded-2xl p-4 sm:p-5 inline-flex items-center gap-3 border border-white/10 shadow-inner">
            <Clock size={20} className="opacity-80" />
            <p className="text-sm sm:text-base font-medium">{liveStatus.desc}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer group flex flex-col justify-between"
             onClick={() => { setCurrentModule("segment"); setActiveTab("record"); }}>
          <div>
            <div className="flex justify-between items-start mb-6">
              <div className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">
                <Layers size={32} />
              </div>
              <div className="text-right">
                <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest">วงล่าสุดที่ติดตั้งเสร็จ</div>
                <div className="text-3xl sm:text-4xl font-black text-slate-800 tracking-tight mt-1">{groutStatus.latestSeg}</div>
              </div>
            </div>
            <p className="text-sm text-slate-500 mb-8 font-medium leading-relaxed">เข้าสู่หน้าบันทึกข้อมูลเวลาการขุดเจาะและการประกอบ Segment แบบละเอียด (ขุดเจาะ & ประกอบ)</p>
          </div>
          <button className="w-full py-4 bg-slate-50 group-hover:bg-emerald-50 text-slate-600 group-hover:text-emerald-700 text-sm font-bold rounded-2xl border border-slate-200 transition-colors flex justify-center items-center gap-2">
            บันทึกข้อมูล Segment <ChevronRight size={18}/>
          </button>
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer group flex flex-col justify-between"
             onClick={() => { setCurrentModule("grout"); setActiveTab("record"); }}>
          <div>
            <div className="flex justify-between items-start mb-6">
              <div className="bg-blue-50 text-blue-600 p-4 rounded-2xl group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-300">
                <Droplet size={32} />
              </div>
              <div className="text-right">
                <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest">ค้างฉีด Primary Grout</div>
                <div className="text-3xl sm:text-4xl font-black tracking-tight mt-1">
                  {groutStatus.pending > 0 ? (
                    <span className="text-red-500">{groutStatus.pending} วง</span>
                  ) : (
                    <span className="text-emerald-500">ครบถ้วน</span>
                  )}
                </div>
              </div>
            </div>
            <p className="text-sm text-slate-500 mb-8 font-medium leading-relaxed">
              {groutStatus.pending > 0 
                ? `วงล่าสุดที่ฉีดคือ ${groutStatus.latestGrout} (ตามหลังอยู่ ${groutStatus.pending} วง)`
                : `ฉีด Grout ตามติด Segment ล่าสุดเรียบร้อยแล้ว`
              }
            </p>
          </div>
          <button className="w-full py-4 bg-slate-50 group-hover:bg-blue-50 text-slate-600 group-hover:text-blue-700 text-sm font-bold rounded-2xl border border-slate-200 transition-colors flex justify-center items-center gap-2">
            บันทึกข้อมูล Grout <ChevronRight size={18}/>
          </button>
        </div>
      </div>
    </div>
  );
};


// --- 2. GROUT RECORD VIEW ---
const GroutRecordView = ({ projectInfo, handleProjectInfoChange, groutRecords, setGroutRecords, segmentRecords, setCurrentModule, setActiveTab }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({ ringNo: "", excavRing: "", pressure: "", partA: "", partB: "", keyType: "16", positions: { A: false, B1: false, B2: false, C1: false, C2: false, K: false }, remark: "", imageBase64: "", imageName: "" });
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
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-6 sm:px-8 py-6 sm:py-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
          <div className="relative z-10 flex justify-between items-center">
            <div>
              <h2 className="font-extrabold text-2xl sm:text-3xl flex items-center gap-2">Grout Record</h2>
              <p className="text-blue-100 text-xs sm:text-sm mt-1 opacity-90">Enter details for the primary grout</p>
            </div>
            <div className="text-right">
              <div className="text-[10px] sm:text-xs bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20 font-medium">
                Last: <span className="font-bold text-base">{groutRecords.length > 0 ? groutRecords[groutRecords.length - 1].ringNo : "-"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-8 space-y-5 sm:space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50 transition-all duration-300 relative">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Working Date</label>
              <input type="date" name="date" value={projectInfo.date} onChange={handleProjectInfoChange} className="w-full bg-transparent text-base sm:text-lg font-black text-slate-800 outline-none cursor-pointer" />
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50 transition-all duration-300 relative">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Working Shift</label>
              <select name="shift" value={projectInfo.shift} onChange={handleProjectInfoChange} className="w-full bg-transparent text-base sm:text-lg font-black text-slate-800 outline-none cursor-pointer">
                <option value="Day">☀️ Day Shift</option>
                <option value="Night">🌙 Night Shift</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50 transition-all duration-300 relative">
              <div className="flex justify-between items-center mb-1">
                <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Grouting Ring</label>
                <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${isReGrout ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                  {isReGrout ? "Re-Grout" : "1st Pass"}
                </span>
              </div>
              <input type="text" name="ringNo" required value={formData.ringNo} onChange={handleInputChange} className="w-full bg-transparent text-2xl sm:text-3xl font-black text-slate-800 placeholder-slate-300 outline-none uppercase mt-1" placeholder="P-XXXX" />
              {isReGrout && <p className="text-[8px] sm:text-[9px] text-purple-600 font-bold mt-1">⚠️ เคย Grout แล้ว: บันทึกปริมาณเฉพาะส่วนที่ฉีดเพิ่ม</p>}
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50 transition-all duration-300 relative flex flex-col justify-end">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex justify-between items-center">
                <span>Excavation Ring</span>
                <Activity size={12} className="text-blue-500" title="Auto filled from latest segment" />
              </label>
              <input type="text" name="excavRing" value={formData.excavRing} onChange={handleInputChange} className="w-full bg-transparent text-2xl sm:text-3xl font-black text-slate-800 placeholder-slate-300 outline-none uppercase mt-1" placeholder="P-XXXX" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  Key Segment
                  {isKeyLinked && <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-[4px] text-[9px] flex items-center gap-1"><Check size={10} /> Synced</span>}
                </span>
                <span className={`text-lg font-black px-4 py-1.5 rounded-lg border ${isKeyLinked ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-blue-600 bg-blue-50 border-blue-100"}`}>
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

          <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-2xl relative overflow-hidden">
            <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-blue-500/20 rounded-full blur-[3rem] pointer-events-none"></div>
            <div className="relative z-10 grid grid-cols-3 gap-3 mb-6">
              <div className="bg-white/5 hover:bg-white/10 p-4 rounded-2xl border border-white/10 transition-colors focus-within:bg-white/10 focus-within:border-white/30">
                <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest block mb-1">Part A</label>
                <div className="flex items-baseline gap-1">
                  <input type="number" step="0.01" name="partA" value={formData.partA} onChange={handleInputChange} className="w-full bg-transparent text-xl sm:text-2xl font-bold text-white placeholder-white/20 outline-none p-0 border-none focus:ring-0" placeholder="0.00" />
                  <span className="text-xs text-slate-500 font-medium">m³</span>
                </div>
              </div>
              <div className="bg-white/5 hover:bg-white/10 p-4 rounded-2xl border border-white/10 transition-colors focus-within:bg-white/10 focus-within:border-white/30">
                <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest block mb-1">Part B</label>
                <div className="flex items-baseline gap-1">
                  <input type="number" step="0.01" name="partB" value={formData.partB} onChange={handleInputChange} className="w-full bg-transparent text-xl sm:text-2xl font-bold text-white placeholder-white/20 outline-none p-0 border-none focus:ring-0" placeholder="0.00" />
                  <span className="text-xs text-slate-500 font-medium">m³</span>
                </div>
              </div>
              <div className="bg-white/5 hover:bg-white/10 p-4 rounded-2xl border border-white/10 transition-colors focus-within:bg-white/10 focus-within:border-white/30">
                <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest block mb-1">Pressure</label>
                <div className="flex items-baseline gap-1">
                  <input type="number" step="0.1" name="pressure" value={formData.pressure} onChange={handleInputChange} className="w-full bg-transparent text-xl sm:text-2xl font-bold text-white placeholder-white/20 outline-none p-0 border-none focus:ring-0" placeholder="0.0" />
                  <span className="text-xs text-slate-500 font-medium">bar</span>
                </div>
              </div>
            </div>

            <div className="relative z-10 flex items-end justify-between bg-black/20 p-5 rounded-2xl border border-white/5">
              <div>
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest block mb-1">Total Volume</span>
                <div className="text-4xl font-black text-white">{currentTotal} <span className="text-lg font-medium text-slate-400">m³</span></div>
              </div>
              <div className="text-right">
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest block mb-1">Ratio</span>
                <div className={`text-4xl font-black ${currentRatio > 150 ? "text-purple-400 drop-shadow-[0_0_12px_rgba(168,85,247,0.3)]" : currentRatio >= 100 ? "text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.3)]" : "text-red-400 drop-shadow-[0_0_12px_rgba(248,113,113,0.3)]"}`}>
                  {currentRatio}<span className="text-xl font-bold">%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Problem / Remark (ปัญหา/อุปสรรค)</label>
            <textarea name="remark" value={formData.remark} onChange={handleInputChange} rows="2" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition-all mb-3" placeholder="ไม่มี..."></textarea>
            <div className="border-t border-slate-100 pt-3 mt-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><ImageIcon size={14} /> Attach Photo (บันทึกรูปลง Drive)</label>
              <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, setFormData)} className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all cursor-pointer w-full" />
            </div>
          </div>

          <button type="submit" disabled={isSaving} className={`w-full text-white font-bold text-lg py-5 rounded-2xl shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${isSaving ? "bg-slate-400 cursor-not-allowed shadow-none" : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 shadow-blue-500/30"}`}>
            {isSaving ? <><Loader2 size={24} className="animate-spin" /> Saving...</> : <><Save size={24} /> Confirm & Save Record</>}
          </button>
        </div>
      </form>
    </div>
  );
};


// --- 3. SEGMENT RECORD VIEW ---
const SegmentRecordView = ({ projectInfo, handleProjectInfoChange, segmentRecords, setSegmentRecords, setCurrentModule, setActiveTab }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    id: null, ringNo: "", typeRing: "C1", keyPos: "16", startCH: "", finishCH: "", length: "1.40", remark: "",
    excavStartTime: "", excavEndTime: "", soilType: "", excavImageBase64: "", excavImageName: "",
    installStartTime: "", installEndTime: "", imageBase64: "", imageName: "", status: "Completed", installType: "Permanent",
  });

  useEffect(() => {
    if (segmentRecords.length > 0 && !formData.ringNo) {
      const map = new Map();
      segmentRecords.forEach(rec => map.set(rec.ringNo, rec));
      const deduped = Array.from(map.values());
      const lastRecord = deduped[deduped.length - 1];

      if (lastRecord.status === "In Progress") {
        setFormData((prev) => ({
          ...prev, id: lastRecord.id, ringNo: lastRecord.ringNo, typeRing: lastRecord.typeRing || "C1", keyPos: lastRecord.keyPos || "16", startCH: lastRecord.startCH, finishCH: lastRecord.finishCH, length: lastRecord.length || "1.40", status: "In Progress", installType: lastRecord.installType || "Permanent", excavStartTime: lastRecord.excavStartTime || "", excavEndTime: lastRecord.excavEndTime || "", soilType: lastRecord.soilType || "", installStartTime: lastRecord.installStartTime || lastRecord.startTime || "", installEndTime: lastRecord.installEndTime || lastRecord.endTime || "",
        }));
      } else {
        const lastFinishRaw = parseCH(lastRecord.finishCH);
        setFormData((prev) => ({
          ...prev, id: null, ringNo: offsetRingNo(lastRecord.ringNo, 1), startCH: formatCH(lastFinishRaw), finishCH: formatCH(lastFinishRaw - parseFloat(prev.length || 0)), status: "In Progress", installType: "Permanent", soilType: "", excavImageBase64: "", excavImageName: "",
        }));
      }
    }
  }, [segmentRecords]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let newFormData = { ...formData, [name]: value };

    if (name === "ringNo") {
      const upperVal = value.toUpperCase();
      if (upperVal.startsWith("T")) newFormData.installType = "Temporary";
      else if (upperVal.startsWith("P")) newFormData.installType = "Permanent";
    }

    // เพิ่มเงื่อนไขเช็คประเภท Ring อัตโนมัติ
    if (name === "typeRing") {
      newFormData.length = value === "C1" ? "1.40" : "0.90";
    }

    if (name === "startCH" || name === "length" || name === "typeRing") {
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
    const recordData = { ...projectInfo, ...formData, soilVolume: calculateSoilVolume(formData.length) };

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
          ...prev, id: isCompleted ? null : recordData.id, ringNo: isCompleted ? offsetRingNo(prev.ringNo, 1) : prev.ringNo, startCH: isCompleted ? prev.finishCH : prev.startCH, finishCH: isCompleted ? formatCH(parseCH(prev.finishCH) - parseFloat(prev.length)) : prev.finishCH, remark: "", excavStartTime: isCompleted ? "" : prev.excavStartTime, excavEndTime: isCompleted ? "" : prev.excavEndTime, soilType: isCompleted ? "" : prev.soilType, excavImageBase64: isCompleted ? "" : prev.excavImageBase64, excavImageName: isCompleted ? "" : prev.excavImageName, installStartTime: isCompleted ? "" : prev.installStartTime, installEndTime: isCompleted ? "" : prev.installEndTime, imageBase64: "", imageName: "", status: isCompleted ? "In Progress" : prev.status, installType: isCompleted ? "Permanent" : prev.installType,
        };
      });
    } catch (err) { alert("บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่: " + err.message); }
    setIsSaving(false);
  };

  return (
    <div className="max-w-2xl mx-auto pb-24 animate-slide-up">
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <div className="bg-gradient-to-br from-teal-600 to-emerald-700 px-6 sm:px-8 py-6 sm:py-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
          <div className="relative z-10 flex justify-between items-center">
            <div>
              <h2 className="font-extrabold text-2xl sm:text-3xl flex items-center gap-2"><Layers size={28} /> Segment Install</h2>
              <p className="text-emerald-100 text-xs sm:text-sm mt-1 opacity-90">Record daily segment installation</p>
            </div>
            <div className="text-right">
              <div className="text-[10px] sm:text-xs bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20 font-medium">
                Last: <span className="font-bold text-base">{segmentRecords.length > 0 ? segmentRecords[segmentRecords.length - 1].ringNo : "-"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-8 space-y-5 sm:space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-50 transition-all">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Working Date</label>
              <input type="date" name="date" value={projectInfo.date} onChange={handleProjectInfoChange} className="w-full bg-transparent text-base sm:text-lg font-black text-slate-800 outline-none cursor-pointer" />
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-50 transition-all">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Working Shift</label>
              <select name="shift" value={projectInfo.shift} onChange={handleProjectInfoChange} className="w-full bg-transparent text-base sm:text-lg font-black text-slate-800 outline-none cursor-pointer">
                <option value="Day">☀️ Day Shift</option>
                <option value="Night">🌙 Night Shift</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-50 transition-all">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Ring No.</label>
              <input type="text" name="ringNo" required value={formData.ringNo} onChange={handleInputChange} className="w-full bg-transparent text-2xl sm:text-3xl font-black text-slate-800 outline-none uppercase" placeholder="P-XXXX" />
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-50 transition-all">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Install Type</label>
              <select name="installType" value={formData.installType} onChange={handleInputChange} className={`w-full bg-transparent text-lg sm:text-xl font-black outline-none cursor-pointer ${formData.installType === "Temporary" ? "text-amber-600" : "text-emerald-700"}`}>
                <option value="Permanent" className="text-slate-800">ถาวร (Permanent)</option>
                <option value="Temporary" className="text-slate-800">ชั่วคราว (Temporary)</option>
              </select>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-[1.5rem] p-5 shadow-sm space-y-5 relative overflow-hidden">
            <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest border-l-4 border-amber-500 pl-2">Excavation Phase (ขุดเจาะ)</div>
            <div className="grid grid-cols-2 gap-4 relative z-10 mt-2">
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-slate-500 flex items-center gap-1.5 mb-2"><PlayCircle size={14} className="text-amber-500" /> Start</label>
                <input type="time" name="excavStartTime" value={formData.excavStartTime} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm sm:text-base text-slate-800 font-bold outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-50 transition-all" />
              </div>
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-slate-500 flex items-center gap-1.5 mb-2"><CheckCircle2 size={14} className="text-amber-500" /> Finish</label>
                <input type="time" name="excavEndTime" value={formData.excavEndTime} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm sm:text-base text-slate-800 font-bold outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-50 transition-all" />
              </div>
            </div>

            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-4 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-50 transition-all relative z-10">
              <label className="text-[10px] sm:text-xs font-bold text-slate-500 mb-2 block">ลักษณะของดิน (Soil Type)</label>
              <input type="text" name="soilType" value={formData.soilType} onChange={handleInputChange} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none mb-3 focus:border-amber-400" placeholder="เช่น ดินเหนียวปนทราย, Soft Clay..." />
              
              <div className="border-t border-slate-100 pt-3">
                <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><ImageIcon size={12} /> ภาพถ่ายดินขุด (ไม่บังคับ)</label>
                <input type="file" accept="image/*" onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => { setFormData((prev) => ({ ...prev, excavImageBase64: reader.result, excavImageName: `excav_${Date.now()}_${file.name}` })); };
                    reader.readAsDataURL(file);
                  }
                }} className="text-xs text-slate-500 file:mr-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 transition-all cursor-pointer w-full" />
              </div>
            </div>

            <div className="border-t border-slate-100 relative z-10 my-3"></div>
            <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest border-l-4 border-emerald-500 pl-2">Installation Phase (ประกอบ)</div>

            <div className="grid grid-cols-2 gap-4 relative z-10 mt-2">
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-slate-500 flex items-center gap-1.5 mb-2"><PlayCircle size={14} className="text-emerald-500" /> Start</label>
                <input type="time" name="installStartTime" value={formData.installStartTime} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm sm:text-base text-slate-800 font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50 transition-all" />
              </div>
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-slate-500 flex items-center gap-1.5 mb-2"><CheckCircle2 size={14} className="text-emerald-500" /> Finish</label>
                <input type="time" name="installEndTime" value={formData.installEndTime} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm sm:text-base text-slate-800 font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50 transition-all" />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 relative z-10 grid grid-cols-2 gap-6">
              <div className="flex flex-col justify-center">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Status & Length</label>
                  <select name="status" value={formData.status} onChange={handleInputChange} className={`text-[10px] font-bold rounded px-1.5 py-0.5 outline-none cursor-pointer ${formData.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                    <option value="Completed">✔ Completed</option>
                    <option value="In Progress">⏳ In Progress</option>
                  </select>
                </div>
                <input type="number" step="0.01" name="length" value={formData.length} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-lg font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50 transition-all text-center" />
                
                <div className="mt-3 bg-emerald-50 rounded-lg p-2 text-center border border-emerald-100">
                  <span className="text-[9px] sm:text-[10px] text-emerald-600 font-bold uppercase tracking-widest block">Soil Vol. (ดินขุด)</span>
                  <span className="text-base font-black text-emerald-700">{calculateSoilVolume(formData.length)} m³</span>
                </div>
              </div>
              <div className="flex flex-col justify-center">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Key Pos</span>
                  <span className="text-lg font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-lg">K{formData.keyPos}</span>
                </div>
                <input type="range" min="1" max="16" step="1" name="keyPos" value={formData.keyPos} onChange={handleInputChange} className="w-full h-3 bg-slate-200 rounded-full appearance-none cursor-pointer accent-emerald-600" />
                <div className="flex justify-between text-[9px] sm:text-[10px] font-bold text-slate-400 mt-2 px-1">
                  <span>1</span><span>4</span><span>8</span><span>12</span><span>16</span>
                </div>
                <select name="typeRing" value={formData.typeRing} onChange={handleInputChange} className="mt-4 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-emerald-400">
                   <option value="C1">C1</option>
                   <option value="ST1">ST1</option>
                   <option value="ST2">ST2</option>
                   <option value="SX">SX</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-emerald-500/20 rounded-full blur-[3rem] pointer-events-none"></div>
            <div className="relative z-10 flex items-center justify-between gap-4">
              <div className="flex-1">
                <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest block mb-1">Start (CH.)</label>
                <input type="text" name="startCH" value={formData.startCH} onChange={handleInputChange} onBlur={(e) => setFormData((prev) => ({ ...prev, startCH: formatCH(prev.startCH) }))} className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-xl sm:text-2xl font-black text-white outline-none focus:bg-white/20 transition-all text-center" placeholder="8+815.68" />
              </div>
              <div className="text-slate-500 pt-5 text-lg">➡</div>
              <div className="flex-1">
                <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest block mb-1">Finish (CH.)</label>
                <input type="text" name="finishCH" value={formData.finishCH} onChange={handleInputChange} onBlur={(e) => setFormData((prev) => ({ ...prev, finishCH: formatCH(prev.finishCH) }))} className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-xl sm:text-2xl font-black text-white outline-none focus:bg-white/20 transition-all text-center" placeholder="8+814.28" />
              </div>
            </div>
          </div>

          <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Problem / Remark</label>
            <textarea name="remark" value={formData.remark} onChange={handleInputChange} rows="2" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50 transition-all" placeholder="ไม่มี..."></textarea>
          </div>

          <button type="submit" disabled={isSaving} className={`w-full text-white font-bold text-lg py-5 rounded-2xl shadow-xl transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 ${isSaving ? "bg-slate-400 cursor-not-allowed shadow-none" : "bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 shadow-emerald-500/30"}`}>
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
    baseData = baseData.map((r) => ({ ...r, displayRing: r.groutPass === "Re-Grout" ? `${r.ringNo} (Re)` : r.ringNo }));

    if (filterMode === "all") return baseData;
    else if (filterMode === "range" && rangeStart && rangeEnd) {
      const startNum = getRingNumeric(rangeStart);
      const endNum = getRingNumeric(rangeEnd);
      return baseData.filter((r) => { const rNum = getRingNumeric(r.ringNo); return rNum >= startNum && rNum <= endNum; }).sort((a, b) => getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo));
    } else if (filterMode === "daily") return baseData.filter((r) => formatDisplayDate(r.date) === filterDate);
    else if (filterMode === "monthly") return baseData.filter((r) => formatDisplayDate(r.date).startsWith(filterMonth));
    else { const start = Math.max(0, baseData.length - chartWindow); return baseData.slice(start, baseData.length); }
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
      } else setIsEditKeyLinked(false);
    }
  }, [isEditing, editFormData?.ringNo, segmentRecords]);

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData((prev) => {
      let updated = { ...prev, [name]: value };
      if (name === "ringNo") updated.excavRing = getRingByOffsetFromHistory(value, 3, segmentRecords);
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
    } catch (e) { alert("อัปเดตข้อมูลล้มเหลว"); }
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
    } catch (e) { alert("ลบข้อมูลล้มเหลว"); }
    setIsSaving(false);
  };

  const editTotal = isEditing ? (parseFloat(editFormData.partA || 0) + parseFloat(editFormData.partB || 0)).toFixed(2) : 0;
  const editRatio = isEditing ? ((editTotal / THEORETICAL_VOL) * 100).toFixed(1) : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-fade-in pb-24">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Unique Rings" value={new Set(groutRecords.map((r) => r.ringNo)).size} subtext="Records found" color="text-blue-600" icon={FileText} />
        <StatCard label="Avg. Volume" value={(groutRecords.reduce((acc, r) => acc + r.total, 0) / (groutRecords.length || 1)).toFixed(2)} subtext="Cubic Meters" color="text-emerald-600" icon={Droplet} />
        <StatCard label="Avg. Ratio" value={`${(groutRecords.reduce((acc, r) => acc + r.ratio, 0) / (groutRecords.length || 1)).toFixed(1)}%`} subtext="Efficiency" color="text-orange-500" icon={Activity} />
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-5 rounded-3xl shadow-lg text-white relative overflow-hidden flex flex-col justify-between">
          <div className="relative z-10 flex flex-col h-full justify-center">
            <div className="flex items-center gap-2 font-black text-xl mb-1"><BarChart3 size={24} /> Status</div>
            <div className="text-sm opacity-90 font-medium">Data Synced Successfully</div>
          </div>
          <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-white/20 rounded-full blur-2xl"></div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 sm:p-8">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
          <h3 className="font-bold text-slate-800 text-lg">Grout Volume Trend</h3>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center w-full lg:w-auto bg-slate-50 p-2 rounded-xl border border-slate-100">
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
                <input type="text" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} placeholder="P1" className="px-2 py-1.5 w-full sm:w-16 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none uppercase text-slate-700 text-center" />
                <span className="text-slate-400">-</span>
                <input type="text" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} placeholder="P10" className="px-2 py-1.5 w-full sm:w-16 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none uppercase text-slate-700 text-center" />
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

        <div className="h-[350px] sm:h-[400px] w-full">
          <ResponsiveContainer>
            <AreaChart data={chartData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis dataKey="displayRing" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 6]} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} itemStyle={{ fontSize: "12px", fontWeight: "bold" }} />
              <ReferenceLine y={THEORETICAL_VOL} stroke="#FB923C" strokeDasharray="5 5" label={{ position: "insideTopRight", value: "100% (3.1)", fill: "#FB923C", fontSize: 9 }} />
              <ReferenceLine y={VOL_120} stroke="#4ADE80" strokeDasharray="5 5" label={{ position: "insideTopRight", value: "120%", fill: "#4ADE80", fontSize: 9 }} />
              <ReferenceLine y={VOL_150} stroke="#F472B6" strokeDasharray="5 5" label={{ position: "insideTopRight", value: "150%", fill: "#F472B6", fontSize: 9 }} />
              <Area type="monotone" dataKey="total" stroke="#3B82F6" strokeWidth={3} fill="url(#colorTotal)" dot={{ r: 4, fill: "#3B82F6", stroke: "#fff", strokeWidth: 2 }} label={{ position: "top", fill: "#475569", fontSize: 9, fontWeight: 600, formatter: (val) => val.toFixed(2) }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center bg-slate-50/50 gap-3">
          <h3 className="font-bold text-slate-700 text-base">Detailed Grout Logs</h3>
          <div className="flex gap-2 self-end sm:self-auto">
            <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} className="p-1.5 border border-slate-200 rounded-md bg-white hover:bg-slate-50 text-slate-500"><ChevronLeft size={16} /></button>
            <span className="px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white font-medium text-slate-600">Page {currentPage} of {totalPages || 1}</span>
            <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} className="p-1.5 border border-slate-200 rounded-md bg-white hover:bg-slate-50 text-slate-500"><ChevronRight size={16} /></button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-slate-400 uppercase bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Ring / Timeline</th>
                <th className="px-6 py-4">Config (Key & Pos)</th>
                <th className="px-6 py-4 text-right">Volume</th>
                <th className="px-6 py-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {tableData.map((record, index) => (
                <tr key={`${record.id}-${index}`} onClick={() => { setSelectedRecord(record); setIsEditing(false); }} className="hover:bg-blue-50/40 transition-colors group cursor-pointer">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-slate-800 text-base">{record.ringNo}</div>
                      {record.groutPass === "Re-Grout" && <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[9px] font-bold">Re-Grout</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Ex: {record.excavRing}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`w-2 h-2 rounded-full ${record.shift === "Day" ? "bg-amber-400" : "bg-indigo-500"}`}></span>
                      <span className="text-xs text-slate-500 font-medium">{formatDisplayDate(record.date)} ({record.shift})</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600 inline-block mb-1">Key {record.key}</div>
                    <div className="flex gap-1 flex-wrap">
                      {Object.entries(record.positions || {}).map(([pos, active]) => active && <span key={pos} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded border border-blue-100 font-bold">{pos}</span>)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="font-bold text-slate-800 text-base">{record.total.toFixed(2)} m³</div>
                    <div className="text-xs text-slate-400 mt-1">{record.pressure} bar</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold border ${record.ratio > 150 ? "bg-purple-50 text-purple-700 border-purple-200" : record.ratio >= 100 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transform transition-all">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2"><FileText size={18} /> {isEditing ? "Edit Ring Data" : "Ring Details"}</h3>
                <p className="text-blue-100 text-xs mt-0.5">Record ID: {selectedRecord.id}</p>
              </div>
              <div className="flex items-center gap-2">
                {!isEditing && (
                  <>
                    {selectedRecord.imageUrl && selectedRecord.imageUrl !== "Attached" && (
                      <a href={selectedRecord.imageUrl} target="_blank" rel="noreferrer" className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors" title="View Photo"><ImageIcon size={18} /></a>
                    )}
                    <button onClick={() => { setEditFormData({ ...selectedRecord }); setIsEditing(true); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors" title="Edit"><Edit size={18} /></button>
                    <button onClick={() => setShowDeleteConfirm(true)} className="p-2 bg-white/10 hover:bg-red-500 rounded-full transition-colors" title="Delete"><Trash2 size={18} /></button>
                  </>
                )}
                <button onClick={() => { setSelectedRecord(null); setIsEditing(false); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors ml-2"><X size={20} /></button>
              </div>
            </div>

            {showDeleteConfirm && (
              <div className="bg-red-50 p-4 flex justify-between items-center border-b border-red-100 shrink-0 animate-fade-in">
                <span className="text-red-700 text-sm font-bold flex items-center gap-2"><Trash2 size={16} /> ยืนยันการลบข้อมูล Ring {selectedRecord.ringNo} ใช่หรือไม่?</span>
                <div className="flex gap-2">
                  <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-1.5 bg-white text-slate-600 rounded-lg shadow-sm text-xs font-bold border border-slate-200 hover:bg-slate-100">ยกเลิก</button>
                  <button onClick={handleDeleteRecord} disabled={isSaving} className="px-4 py-1.5 bg-red-600 text-white rounded-lg shadow-sm text-xs font-bold hover:bg-red-700 flex items-center gap-1">
                    {isSaving && <Loader2 size={12} className="animate-spin" />} ลบ
                  </button>
                </div>
              </div>
            )}

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              <div className="flex flex-wrap justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100 gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Grouting Ring</div>
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input name="ringNo" value={editFormData.ringNo} onChange={handleEditChange} className="text-2xl font-black text-blue-600 bg-white border border-blue-200 rounded-lg px-3 py-1 w-32 outline-none focus:ring-2 focus:ring-blue-500 uppercase" />
                      <select name="groutPass" value={editFormData.groutPass || "1st Pass"} onChange={handleEditChange} className="border border-slate-300 rounded-lg px-2 py-1.5 outline-none focus:border-blue-500 text-xs font-bold text-slate-600">
                        <option value="1st Pass">1st Pass</option>
                        <option value="Re-Grout">Re-Grout</option>
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="text-2xl font-black text-slate-800">{selectedRecord.ringNo}</div>
                      {selectedRecord.groutPass === "Re-Grout" && <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold">Re-Grout</span>}
                    </div>
                  )}
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    Excavation:
                    {isEditing ? <input name="excavRing" value={editFormData.excavRing} onChange={handleEditChange} className="border border-slate-300 rounded px-2 py-0.5 outline-none focus:border-blue-500 w-20 uppercase" /> : selectedRecord.excavRing}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Working Date & Shift</div>
                  {isEditing ? (
                    <div className="flex flex-col items-end gap-1.5 mt-1">
                      <input type="date" name="date" value={formatDisplayDate(editFormData.date)} onChange={handleEditChange} className="border border-slate-300 rounded-lg px-2 py-1 text-sm outline-none focus:border-blue-500" />
                      <select name="shift" value={editFormData.shift} onChange={handleEditChange} className="border border-slate-300 rounded-lg px-2 py-1 text-sm outline-none focus:border-blue-500">
                        <option value="Day">Day Shift</option><option value="Night">Night Shift</option>
                      </select>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-bold text-slate-700 flex items-center justify-end gap-1.5"><Calendar size={14} /> {formatDisplayDate(selectedRecord.date)}</div>
                      <div className="text-xs text-slate-500 mt-1 flex items-center justify-end gap-1"><span className="font-bold text-slate-600">({selectedRecord.shift})</span></div>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className={`bg-slate-50 rounded-2xl border ${isEditing ? "border-blue-300 shadow-inner" : "border-slate-100"} p-4 flex flex-col items-center justify-center relative`}>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 text-center">Injection Configuration</span>
                  {isEditing && <span className="absolute top-3 left-3 bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-1 rounded">EDIT MODE</span>}
                  <div className="scale-90 transform origin-top -mt-2">
                    <RingVisualizer ringKey={isEditing ? editFormData.key : selectedRecord.key} selectedPositions={isEditing ? editFormData.positions : selectedRecord.positions} onTogglePosition={isEditing ? handleEditPosition : () => {}} />
                  </div>
                  {isEditing && (
                    <div className="w-full mt-2 px-2">
                      <label className="text-[10px] font-bold text-slate-400 flex justify-between items-center mb-1">
                        <span className="flex items-center gap-2">KEY (1-16) {isEditKeyLinked && <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[8px] flex items-center gap-1"><Check size={8} /> Synced</span>}</span>
                        <span className={`text-sm font-black px-2 py-0.5 rounded border ${isEditKeyLinked ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-blue-600 bg-blue-50 border-blue-100"}`}>Key {editFormData.key}</span>
                      </label>
                      <input type="range" min="1" max="16" step="1" name="key" value={editFormData.key} onChange={handleEditChange} disabled={isEditKeyLinked} className={`w-full h-2 rounded-lg appearance-none accent-blue-600 ${isEditKeyLinked ? "bg-emerald-200 cursor-not-allowed opacity-70" : "bg-slate-300 cursor-pointer"}`} />
                    </div>
                  )}
                </div>

                <div className="space-y-4 flex flex-col justify-center">
                  <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                    <div className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-3">Volume Data</div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Part A</div>
                        {isEditing ? <input type="number" step="0.01" name="partA" value={editFormData.partA} onChange={handleEditChange} className="w-full bg-white border border-blue-300 rounded-lg px-2 py-1.5 text-center font-mono text-lg font-bold text-blue-700 outline-none focus:ring-2 focus:ring-blue-500 shadow-inner" /> : <div className="font-mono text-lg font-bold text-slate-700">{selectedRecord.partA} <span className="text-xs font-sans text-slate-400">m³</span></div>}
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Part B</div>
                        {isEditing ? <input type="number" step="0.01" name="partB" value={editFormData.partB} onChange={handleEditChange} className="w-full bg-white border border-blue-300 rounded-lg px-2 py-1.5 text-center font-mono text-lg font-bold text-blue-700 outline-none focus:ring-2 focus:ring-blue-500 shadow-inner" /> : <div className="font-mono text-lg font-bold text-slate-700">{selectedRecord.partB} <span className="text-xs font-sans text-slate-400">m³</span></div>}
                      </div>
                    </div>
                    <div className="border-t border-blue-200/50 pt-3 flex justify-between items-end">
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Total Volume</div>
                        <div className="text-2xl font-black text-blue-700">{isEditing ? editTotal : selectedRecord.total.toFixed(2)} <span className="text-sm font-sans font-normal text-blue-500">m³</span></div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500 mb-1">Ratio</div>
                        <div className={`text-xl font-black ${(isEditing ? editRatio : selectedRecord.ratio) > 150 ? "text-purple-500" : (isEditing ? editRatio : selectedRecord.ratio) >= 100 ? "text-emerald-500" : "text-red-500"}`}>
                          {isEditing ? editRatio : selectedRecord.ratio.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Pressure</div>
                      {isEditing ? <input type="number" step="0.1" name="pressure" value={editFormData.pressure} onChange={handleEditChange} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-left font-mono text-lg font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" /> : <div className="font-mono text-xl font-bold text-slate-700">{selectedRecord.pressure} <span className="text-sm font-sans text-slate-400 font-normal">bar</span></div>}
                    </div>
                    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-center">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Status</div>
                      <div className="mt-1">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${(isEditing ? editRatio : selectedRecord.ratio) > 150 ? "bg-purple-50 text-purple-700 border-purple-200" : (isEditing ? editRatio : selectedRecord.ratio) >= 100 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                          {(isEditing ? editRatio : selectedRecord.ratio) > 150 ? "over design" : (isEditing ? editRatio : selectedRecord.ratio) >= 100 ? "Pass" : "below design"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {(selectedRecord.remark || isEditing) && (
                <div className="bg-orange-50/50 rounded-2xl p-4 border border-orange-100">
                  <div className="text-xs font-bold text-orange-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Info size={14} /> Remarks (ปัญหา)</div>
                  {isEditing ? <textarea name="remark" value={editFormData.remark} onChange={handleEditChange} className="w-full bg-white border border-orange-200 rounded-xl p-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-orange-400" rows="2" placeholder="เพิ่มหมายเหตุ..." /> : <p className="text-sm text-slate-700">{selectedRecord.remark}</p>}
                </div>
              )}
            </div>

            {isEditing && (
              <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                <button onClick={() => setIsEditing(false)} className="px-6 py-2.5 rounded-xl font-bold text-sm text-slate-500 hover:bg-slate-200 transition-colors">Cancel</button>
                <button onClick={handleSaveEdit} disabled={isSaving} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center gap-2">
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Changes
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
      
      // เพิ่มเงื่อนไขเช็คประเภท Ring ตอนแก้ไขอัตโนมัติ
      if (name === "typeRing") {
        updated.length = value === "C1" ? "1.40" : "0.90";
      }

      if (name === "startCH" || name === "length" || name === "typeRing") {
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Permanent Rings" value={stats.permRings} subtext={`+ ${stats.tempRings} Temp. (Total: ${stats.totalRings})`} color="text-emerald-600" icon={Layers} />
        <StatCard label="Perm. Distance" value={`${stats.totalDistance.toFixed(2)} m`} subtext={`ดินขุดรวม: ${stats.totalSoilVol.toFixed(2)} m³`} color="text-blue-600" icon={TrendingUp} />
        <StatCard label="Daily Average" value={`${stats.avgRings} Rings`} subtext={`~ ${stats.avgDist} m / day`} color="text-orange-500" icon={Activity} />
        <StatCard label="Current Position" value={stats.currentCH} subtext="Latest Finish CH." color="text-indigo-600" icon={MapPin} />
      </div>

      <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 flex items-center gap-2 tracking-tight">
            <TrendingUp className="text-emerald-600" size={28} /> Ring Progress Monthly Report
          </h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">TBM1 Segment Installation Tracking</p>
        </div>
        <div className="flex gap-4 text-xs font-bold bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-100 w-full md:w-auto justify-between sm:justify-start shadow-inner">
          <div className="flex flex-col items-center"><span className="w-4 h-4 rounded bg-yellow-300 mb-1.5 shadow-sm"></span>Day Shift</div>
          <div className="flex flex-col items-center"><span className="w-4 h-4 rounded bg-blue-500 mb-1.5 shadow-sm"></span>Night Shift</div>
          {filterMode !== "daily" && (
            <>
              <div className="flex flex-col items-center"><span className="w-5 h-1 rounded-full bg-black mt-2 mb-1.5"></span>Plan Acc.</div>
              <div className="flex flex-col items-center"><span className="w-5 h-1 rounded-full bg-red-500 mt-2 mb-1.5"></span>Actual Acc.</div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 sm:p-8 overflow-hidden">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-slate-800 text-lg">Installation Trend</h3>
            <button onClick={() => setShowPlanModal(true)} className="p-2 text-slate-400 hover:text-emerald-600 bg-slate-50 hover:bg-emerald-50 rounded-xl transition-colors border border-slate-100 shadow-sm" title="ตั้งค่าแผนงาน (Plan Settings)">
              <Settings size={16} />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center w-full lg:w-auto bg-slate-50 p-2 rounded-xl border border-slate-100">
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
                <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="px-2 py-1.5 flex-1 sm:flex-none sm:w-[120px] text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-700" />
                <span className="text-slate-400">-</span>
                <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="px-2 py-1.5 flex-1 sm:flex-none sm:w-[120px] text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-700" />
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

        <div className="h-[350px] sm:h-[500px] w-full min-w-full overflow-x-auto">
          <div className="min-w-[700px] h-full">
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="displayDate" tick={{ fontSize: 10, fill: "#64748b", fontWeight: 500 }} angle={-45} textAnchor="end" height={60} />
                <YAxis yAxisId="left" domain={[0, filterMode === "daily" ? "auto" : 10]} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                {filterMode !== "daily" && <YAxis yAxisId="right" orientation="right" domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />}
                <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} itemStyle={{ fontSize: "12px", fontWeight: "bold" }} />

                {filterMode !== "daily" && <Line yAxisId="left" type="monotone" dataKey="plan" stroke="#94a3b8" strokeWidth={2} dot={chartData.length <= 24 ? { r: 0 } : { r: 2 }} name="Plan Daily" />}
                <Bar yAxisId="left" dataKey="dayRings" stackId="a" fill="#fde047" name="Perm. D/S" radius={[0, 0, 0, 0]} maxBarSize={40} />
                <Bar yAxisId="left" dataKey="nightRings" stackId="a" fill="#3b82f6" name="Perm. N/S" radius={[0, 0, 0, 0]} maxBarSize={40} />
                <Bar yAxisId="left" dataKey="tempRings" stackId="a" fill="#cbd5e1" name="Temporary" radius={[4, 4, 0, 0]} maxBarSize={40} />

                {filterMode !== "daily" && (
                  <>
                    <Line yAxisId="right" type="monotone" dataKey="planAcc" stroke="#0f172a" strokeWidth={2} dot={chartData.length === 1 ? { r: 3, fill: "#0f172a" } : { r: 2, fill: "#0f172a" }} name="Plan Acc." />
                    <Line yAxisId="right" type="monotone" dataKey="actualAcc" stroke="#ef4444" strokeWidth={3} dot={chartData.length === 1 ? { r: 4, fill: "#ef4444" } : { r: 3, fill: "#ef4444" }} name="Actual Acc." label={{ position: "top", fill: "#ef4444", fontSize: 10, fontWeight: "900" }} />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-700 text-base">Segment Logs</h3>
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-sm text-left relative whitespace-nowrap">
            <thead className="text-xs text-slate-400 uppercase bg-slate-50 border-b border-slate-100 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-4">Date / Shift</th>
                <th className="px-6 py-4">Ring No.</th>
                <th className="px-6 py-4 text-center">Type / Key</th>
                <th className="px-6 py-4 text-right">Start CH.</th>
                <th className="px-6 py-4 text-right">Finish CH.</th>
                <th className="px-6 py-4 text-right">Length / Soil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredTableRecords.length > 0 ? (
                [...filteredTableRecords].reverse().map((rec, index) => (
                  <tr key={`${rec.id}-${index}`} onClick={() => { setSelectedRecord(rec); setIsEditing(false); }} className="hover:bg-emerald-50/40 transition-colors cursor-pointer group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800 text-base">{formatDisplayDate(rec.date)}</div>
                      <div className="text-xs text-slate-500 mt-1.5 font-mono"><span className="font-bold text-slate-400">Excav:</span> {formatDisplayTime(rec.excavStartTime)} - {formatDisplayTime(rec.excavEndTime)}</div>
                      <div className="text-xs text-slate-500 mt-0.5 font-mono"><span className="font-bold text-slate-400">Inst:</span> {formatDisplayTime(rec.installStartTime || rec.startTime)} - {formatDisplayTime(rec.installEndTime || rec.endTime)}</div>
                      <div className="text-xs text-slate-400 font-bold mt-1.5">{rec.shift} Shift</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`font-black text-lg ${rec.installType === "Temporary" ? "text-amber-600" : "text-emerald-700"}`}>{rec.ringNo}</div>
                      {rec.installType === "Temporary" && <div className="text-[10px] text-amber-500 font-bold mt-1 px-2 py-0.5 bg-amber-50 rounded inline-block">Temporary</div>}
                      {rec.status === "In Progress" && <div className="text-[10px] text-orange-500 font-bold mt-1 px-2 py-0.5 bg-orange-50 rounded inline-block">In Progress</div>}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-slate-100 px-3 py-1 rounded-lg text-xs font-bold text-slate-600 mr-2">{rec.typeRing}</span>
                      <span className="text-xs font-bold text-slate-400">K{rec.keyPos}</span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-slate-500 text-base">{rec.startCH}</td>
                    <td className="px-6 py-4 text-right font-mono text-slate-800 font-bold text-base">{rec.finishCH}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-emerald-600 font-black text-base">{rec.length} m</div>
                      <div className="text-[10px] text-amber-600 font-bold mt-1 bg-amber-50 px-2 py-0.5 rounded inline-block">{rec.soilVolume || calculateSoilVolume(rec.length)} m³</div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col transform transition-all max-h-[90vh]">
            <div className="bg-slate-50 px-6 py-5 border-b border-slate-200 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-lg"><Settings size={20} className="text-slate-500" /> Plan Settings</h3>
              <button onClick={() => setShowPlanModal(false)} className="text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 p-2 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-5 overflow-y-auto">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Default Rings/Day</label>
                <input type="number" step="0.1" value={tempPlan.defaultDailyPlan} onChange={(e) => setTempPlan({ ...tempPlan, defaultDailyPlan: e.target.value })} className="w-full border border-slate-300 rounded-xl px-4 py-3 font-bold text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Initial Plan Accumulation</label>
                <input type="number" value={tempPlan.basePlanAcc} onChange={(e) => setTempPlan({ ...tempPlan, basePlanAcc: e.target.value })} className="w-full border border-slate-300 rounded-xl px-4 py-3 font-bold text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50" />
                <p className="text-xs text-slate-400 mt-2 font-medium">ตั้งค่าเริ่มต้นของเส้น Plan สะสม</p>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Initial Actual Accumulation</label>
                <input type="number" value={tempPlan.baseActualAcc} onChange={(e) => setTempPlan({ ...tempPlan, baseActualAcc: e.target.value })} className="w-full border border-slate-300 rounded-xl px-4 py-3 font-bold text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50" />
                <p className="text-xs text-slate-400 mt-2 font-medium">ตั้งค่ายกมาของยอดติดตั้งจริง</p>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-widest block mb-3">Plan Overrides (ปรับแผนตามช่วงเวลา)</label>
                {tempPlan.planOverrides && tempPlan.planOverrides.map((ov, idx) => (
                  <div key={idx} className="flex items-center gap-3 mb-2 bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-sm">
                    <span className="text-sm font-bold text-slate-700 flex-1">{ov.date}</span>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-3 py-1.5 rounded-lg">{ov.plan} / Day</span>
                    <button onClick={() => setTempPlan((prev) => ({ ...prev, planOverrides: prev.planOverrides.filter((_, i) => i !== idx) }))} className="p-2 text-red-400 hover:text-red-600 bg-white rounded-lg shadow-sm border border-slate-200 transition-colors"><Trash2 size={14} /></button>
                  </div>
                ))}
                <div className="flex gap-3 items-end mt-4">
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-500 font-bold mb-1.5 block">Start Date</label>
                    <input type="date" value={newOverride.date} onChange={(e) => setNewOverride({ ...newOverride, date: e.target.value })} className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-50 focus:border-emerald-500 font-medium" />
                  </div>
                  <div className="w-24">
                    <label className="text-[10px] text-slate-500 font-bold mb-1.5 block">Rings/Day</label>
                    <input type="number" step="0.1" value={newOverride.plan} onChange={(e) => setNewOverride({ ...newOverride, plan: e.target.value })} className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-50 focus:border-emerald-500 font-medium text-center" />
                  </div>
                  <button onClick={() => { if (newOverride.date && newOverride.plan) { setTempPlan((prev) => ({ ...prev, planOverrides: [ ...(prev.planOverrides || []), newOverride ] })); setNewOverride({ date: "", plan: 4 }); } }} className="bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-700 transition-colors shadow-md">Add</button>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 p-5 border-t border-slate-200 flex justify-end gap-3 shrink-0">
              <button onClick={() => setShowPlanModal(false)} className="px-6 py-2.5 rounded-xl font-bold text-sm text-slate-500 hover:bg-slate-200 transition-colors">Cancel</button>
              <button onClick={handleSavePlan} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-md shadow-emerald-200">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* --- Edit Segment Modal --- */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transform transition-all">
            <div className="bg-gradient-to-r from-teal-600 to-emerald-700 px-6 py-4 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2"><Layers size={20} /> {isEditing ? "Edit Segment Data" : "Segment Details"}</h3>
                <p className="text-emerald-100 text-xs mt-1">Record ID: {selectedRecord.id}</p>
              </div>
              <div className="flex items-center gap-2">
                {!isEditing && (
                  <>
                    {selectedRecord.imageUrl && selectedRecord.imageUrl !== "Attached" && (
                      <a href={selectedRecord.imageUrl} target="_blank" rel="noreferrer" className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors" title="View Photo"><ImageIcon size={18} /></a>
                    )}
                    <button onClick={() => { setEditFormData({ ...selectedRecord }); setIsEditing(true); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors" title="Edit"><Edit size={18} /></button>
                    <button onClick={() => setShowDeleteConfirm(true)} className="p-2 bg-white/10 hover:bg-red-500 rounded-full transition-colors" title="Delete"><Trash2 size={18} /></button>
                  </>
                )}
                <button onClick={() => { setSelectedRecord(null); setIsEditing(false); setShowDeleteConfirm(false); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors ml-2"><X size={20} /></button>
              </div>
            </div>

            {showDeleteConfirm && (
              <div className="bg-red-50 p-4 flex justify-between items-center border-b border-red-100 shrink-0 animate-fade-in">
                <span className="text-red-700 text-sm font-bold flex items-center gap-2"><Trash2 size={16} /> ยืนยันการลบข้อมูล Ring {selectedRecord.ringNo} ใช่หรือไม่?</span>
                <div className="flex gap-2">
                  <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-1.5 bg-white text-slate-600 rounded-lg shadow-sm text-xs font-bold border border-slate-200 hover:bg-slate-100">ยกเลิก</button>
                  <button onClick={handleDeleteRecord} disabled={isSaving} className="px-4 py-1.5 bg-red-600 text-white rounded-lg shadow-sm text-xs font-bold hover:bg-red-700 flex items-center gap-1">
                    {isSaving && <Loader2 size={12} className="animate-spin" />} ลบ
                  </button>
                </div>
              </div>
            )}

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              <div className="flex flex-wrap justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100 gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Ring No. & Type</div>
                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <input name="ringNo" value={editFormData.ringNo} onChange={handleEditChange} className="text-2xl font-black text-emerald-600 bg-white border border-emerald-200 rounded-lg px-3 py-1 w-32 outline-none focus:ring-2 focus:ring-emerald-500 uppercase" />
                        <select name="typeRing" value={editFormData.typeRing} onChange={handleEditChange} className="border border-slate-300 rounded-lg px-2 py-1.5 outline-none focus:border-emerald-500 font-bold text-slate-700 text-sm">
                          <option value="C1">C1</option><option value="ST1">ST1</option><option value="ST2">ST2</option><option value="SX">SX</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <select name="installType" value={editFormData.installType || "Permanent"} onChange={handleEditChange} className={`border border-slate-300 rounded-lg px-2 py-1.5 outline-none text-xs font-bold ${editFormData.installType === "Temporary" ? "text-amber-600" : "text-emerald-700"}`}>
                          <option value="Permanent">Permanent (ถาวร)</option><option value="Temporary">Temporary (ชั่วคราว)</option>
                        </select>
                        <select name="status" value={editFormData.status || "Completed"} onChange={handleEditChange} className="border border-slate-300 rounded-lg px-2 py-1.5 outline-none focus:border-emerald-500 text-xs font-bold text-slate-600">
                          <option value="Completed">Completed</option><option value="In Progress">In Progress</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <div className={`text-2xl font-black ${selectedRecord.installType === "Temporary" ? "text-amber-600" : "text-slate-800"}`}>{selectedRecord.ringNo}</div>
                        <span className="bg-slate-200 px-3 py-1 rounded-lg text-sm font-bold text-slate-600">{selectedRecord.typeRing}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        {selectedRecord.installType === "Temporary" && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold">Temporary Ring</span>}
                        {selectedRecord.status === "In Progress" && <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-bold">In Progress</span>}
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Working Date & Shift</div>
                  {isEditing ? (
                    <div className="flex flex-col items-end gap-1.5 mt-1">
                      <input type="date" name="date" value={formatDisplayDate(editFormData.date)} onChange={handleEditChange} className="border border-slate-300 rounded-lg px-2 py-1 text-sm outline-none focus:border-emerald-500" />
                      <select name="shift" value={editFormData.shift} onChange={handleEditChange} className="border border-slate-300 rounded-lg px-2 py-1 text-sm outline-none focus:border-emerald-500">
                        <option value="Day">Day Shift</option><option value="Night">Night Shift</option>
                      </select>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-bold text-slate-700 flex items-center justify-end gap-1.5"><Calendar size={14} /> {formatDisplayDate(selectedRecord.date)}</div>
                      <div className="text-xs text-slate-500 mt-1 flex items-center justify-end gap-1"><span className="font-bold text-slate-600">({selectedRecord.shift})</span></div>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className={`bg-slate-50 rounded-2xl border ${isEditing ? "border-emerald-300 shadow-inner" : "border-slate-100"} p-4 flex flex-col items-center justify-center relative`}>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 text-center">Ring Orientation</span>
                  {isEditing && <span className="absolute top-3 left-3 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded">EDIT MODE</span>}
                  <div className="scale-90 transform origin-top -mt-2">
                    <RingVisualizer ringKey={isEditing ? editFormData.keyPos : selectedRecord.keyPos} selectedPositions={{ K: true }} onTogglePosition={() => {}} />
                  </div>
                  {isEditing && (
                    <div className="w-full mt-2 px-2">
                      <label className="text-[10px] font-bold text-slate-400 flex justify-between items-center mb-1">
                        <span>KEY POSITION (1-16)</span>
                        <span className={`text-sm font-black px-2 py-0.5 rounded border text-emerald-600 bg-emerald-50 border-emerald-100`}>K{editFormData.keyPos}</span>
                      </label>
                      <input type="range" min="1" max="16" step="1" name="keyPos" value={editFormData.keyPos} onChange={handleEditChange} className="w-full h-2 rounded-lg appearance-none accent-emerald-600 bg-slate-300 cursor-pointer" />
                    </div>
                  )}
                </div>

                <div className="space-y-4 flex flex-col justify-center">
                  <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                    <div className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-3">Chainage Data</div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Start CH.</div>
                        {isEditing ? <input type="text" name="startCH" value={editFormData.startCH} onChange={handleEditChange} onBlur={(e) => setEditFormData((prev) => ({ ...prev, startCH: formatCH(prev.startCH) }))} className="w-full bg-white border border-emerald-300 rounded-lg px-2 py-1.5 text-left font-mono text-sm font-bold text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner" /> : <div className="font-mono text-base font-bold text-slate-700">{selectedRecord.startCH}</div>}
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Finish CH.</div>
                        {isEditing ? <input type="text" name="finishCH" value={editFormData.finishCH} onChange={handleEditChange} onBlur={(e) => setEditFormData((prev) => ({ ...prev, finishCH: formatCH(prev.finishCH) }))} className="w-full bg-white border border-emerald-300 rounded-lg px-2 py-1.5 text-left font-mono text-sm font-bold text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner" /> : <div className="font-mono text-base font-bold text-slate-700">{selectedRecord.finishCH}</div>}
                      </div>
                    </div>
                    <div className="border-t border-emerald-200/50 pt-4 flex justify-between items-center">
                      <span className="text-xs text-slate-500">Length</span>
                      {isEditing ? (
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-2">
                            <input type="number" step="0.01" name="length" value={editFormData.length} onChange={handleEditChange} className="w-20 bg-white border border-emerald-300 rounded-lg px-2 py-1.5 text-right font-mono text-lg font-black text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner" />
                            <span className="text-xs font-bold text-emerald-600">m</span>
                          </div>
                          {editFormData.status === "In Progress" && <span className="text-[9px] text-orange-500 font-bold mt-1">ระบุเฉพาะระยะที่ทำได้</span>}
                        </div>
                      ) : (
                        <div className="text-xl font-black text-emerald-600">{selectedRecord.length} <span className="text-sm font-normal">m</span></div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col gap-4">
                    <div className="flex justify-between items-center gap-2">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-16">Excavate</div>
                      <div className="flex-1 flex items-center justify-end gap-2">
                        {isEditing ? (
                          <>
                            <input type="time" name="excavStartTime" value={editFormData.excavStartTime || ''} onChange={handleEditChange} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-center font-mono text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50" />
                            <span className="text-slate-300">-</span>
                            <input type="time" name="excavEndTime" value={editFormData.excavEndTime || ''} onChange={handleEditChange} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-center font-mono text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50" />
                          </>
                        ) : (
                          <div className="font-mono text-sm font-bold text-slate-700">{formatDisplayTime(selectedRecord.excavStartTime)} - {formatDisplayTime(selectedRecord.excavEndTime)}</div>
                        )}
                      </div>
                    </div>
                    <div className="border-t border-slate-100"></div>
                    <div className="flex justify-between items-center gap-2">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-16">Install</div>
                      <div className="flex-1 flex items-center justify-end gap-2">
                        {isEditing ? (
                          <>
                            <input type="time" name="installStartTime" value={editFormData.installStartTime || editFormData.startTime || ''} onChange={handleEditChange} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-center font-mono text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50" />
                            <span className="text-slate-300">-</span>
                            <input type="time" name="installEndTime" value={editFormData.installEndTime || editFormData.endTime || ''} onChange={handleEditChange} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-center font-mono text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50" />
                          </>
                        ) : (
                          <div className="font-mono text-sm font-bold text-slate-700">{formatDisplayTime(selectedRecord.installStartTime || selectedRecord.startTime)} - {formatDisplayTime(selectedRecord.installEndTime || selectedRecord.endTime)}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {(selectedRecord.remark || isEditing) && (
                <div className="bg-orange-50/50 rounded-2xl p-4 border border-orange-100">
                  <div className="text-xs font-bold text-orange-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Info size={14} /> Remarks (ปัญหา)</div>
                  {isEditing ? <textarea name="remark" value={editFormData.remark} onChange={handleEditChange} className="w-full bg-white border border-orange-200 rounded-xl p-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500" rows="2" placeholder="เพิ่มหมายเหตุ..." /> : <p className="text-sm text-slate-700">{selectedRecord.remark}</p>}
                </div>
              )}
            </div>

            {isEditing && (
              <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                <button onClick={() => setIsEditing(false)} className="px-6 py-2.5 rounded-xl font-bold text-sm text-slate-500 hover:bg-slate-200 transition-colors">Cancel</button>
                <button onClick={handleSaveEdit} disabled={isSaving} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200 transition-all active:scale-95 flex items-center gap-2">
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Changes
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
const ReportView = ({ segmentRecords, groutRecords, projectInfo, shiftReports }) => {
  const [reportType, setReportType] = useState("daily");
  const [reportDate, setReportDate] = useState(new Date().toISOString().split("T")[0]);
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportShift, setReportShift] = useState("All");

  // AI States
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiModalType, setAiModalType] = useState("executive"); // 'executive' | 'delay'
  const [aiSummaryText, setAiSummaryText] = useState("");
  const [copied, setCopied] = useState(false);

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

  // ดึงข้อมูล Shift Reports ให้ตรงกับ Filter
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

  const handleDownloadImage = async () => {
    const element = document.getElementById("stats-report-container");
    if (!element) return;

    // --- เทคนิคดึงค่า Input ของแท้ ก่อนถ่ายรูป ---
    const inputs = element.querySelectorAll("input:not([type='radio']):not([type='checkbox']), textarea");
    const valuesMap = new Map();
    inputs.forEach((inp, i) => {
      inp.setAttribute('data-html2canvas-id', i);
      valuesMap.set(i.toString(), inp.value);
    });

    try {
      setIsExportingImage(true);
      const html2canvas = await loadHtml2Canvas();
      const canvas = await html2canvas(element, { 
        scale: 2, 
        backgroundColor: "#ffffff", 
        useCORS: true,
        windowWidth: 1024,
        onclone: (clonedDoc) => {
          const clonedContainer = clonedDoc.getElementById("stats-report-container");
          if (!clonedContainer) return;

          // บังคับขนาด Desktop เพื่อไม่ให้ layout พังเมื่อกดเซฟจากมือถือ
          clonedContainer.style.width = "1024px";
          clonedContainer.style.maxWidth = "none";
          clonedContainer.querySelectorAll('.overflow-x-auto').forEach(el => el.style.overflow = 'visible');

          const clonedInputs = clonedContainer.querySelectorAll("input[data-html2canvas-id], textarea[data-html2canvas-id]");
          clonedInputs.forEach((input) => {
            const id = input.getAttribute('data-html2canvas-id');
            const val = valuesMap.get(id);

            const div = clonedDoc.createElement("div");
            div.innerText = val || "\u00A0"; 
            div.className = input.className;
            div.style.border = "none";
            div.style.background = "transparent";
            div.style.color = "black";
            div.style.fontWeight = "bold";
            div.style.display = "inline-flex";
            div.style.alignItems = "center";
            div.style.minHeight = "24px"; 
            
            if (input.classList.contains("text-right")) div.style.justifyContent = "flex-end";
            else if (input.classList.contains("text-center")) div.style.justifyContent = "center";
            else div.style.justifyContent = "flex-start";

            input.parentNode.replaceChild(div, input);
          });
        }
      });

      inputs.forEach(inp => inp.removeAttribute('data-html2canvas-id'));

      const link = document.createElement("a");
      link.download = `Stats_Report_${displayDateStr}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.9);
      link.click();
    } catch (error) {
      alert("เกิดข้อผิดพลาดในการสร้างรูปภาพ: " + error.message);
    } finally {
      setIsExportingImage(false);
    }
  };

  const handleGenerateAISummary = async () => {
    setIsGeneratingAI(true);
    setAiModalType("executive");
    setShowAIModal(true);
    setAiSummaryText("");
    setCopied(false);

    // คำนวณข้อมูลเฉพาะสำหรับ Template
    const sortedSegs = [...filteredSegments].filter(s => s.status !== "In Progress" && s.installType !== "Temporary").sort((a,b) => getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo));
    const segmentDetails = sortedSegs.map(s => `${s.ringNo} (K${s.keyPos})`).join(', ') || '-';
    const excavRings = sortedSegs.length > 0 ? (sortedSegs.length === 1 ? sortedSegs[0].ringNo : `${sortedSegs[0].ringNo}-${sortedSegs[sortedSegs.length-1].ringNo}`) : '-';

    let startCH = sortedSegs.length > 0 ? sortedSegs[0].startCH : '-';
    let finishCH = sortedSegs.length > 0 ? sortedSegs[sortedSegs.length-1].finishCH : '-';

    const sortedGrouts = [...filteredGrouts].sort((a,b) => getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo));
    const groutDetails = sortedGrouts.map(g => `${g.ringNo} = ${g.total.toFixed(3)} m3 (${g.ratio.toFixed(2)}%)`).join(', ') || '-';
    const groutRingRange = sortedGrouts.length > 0 ? (sortedGrouts.length === 1 ? sortedGrouts[0].ringNo : `${sortedGrouts[0].ringNo}-${sortedGrouts[sortedGrouts.length-1].ringNo}`) : '-';
    const latestGroutRing = sortedGrouts.length > 0 ? sortedGrouts[sortedGrouts.length-1].ringNo : '-';

    const soilTypes = [...new Set(sortedSegs.map(s => s.soilType).filter(Boolean))].join(', ') || '-';

    // คำนวณยอดสะสมทั้งหมดจนถึงวันที่เลือก (แยก Perm และ Temp)
    const targetDate = reportType === 'daily' ? reportDate : `${reportMonth}-31`;
    const allAccumSegments = deduplicatedSegments.filter(s => s.status !== "In Progress" && formatDisplayDate(s.date) <= targetDate);
    const accumPermSegments = allAccumSegments.filter(s => s.installType !== "Temporary");
    const accumTempSegments = allAccumSegments.filter(s => s.installType === "Temporary");

    const totalAccumPermRings = accumPermSegments.length;
    const totalAccumTempRings = accumTempSegments.length;
    const totalAccumDist = accumPermSegments.reduce((sum, s) => sum + parseFloat(s.length || 0), 0).toFixed(3);

    // ดึงปัญหาและอุปสรรค (รวม Remarks จากการกรอก และ Delay Activities จาก Shift Report)
    let shiftDelays = [];
    filteredShiftReports.forEach(sr => {
      Object.entries(sr.events || {}).forEach(([activityName, evs]) => {
        // ดึงเฉพาะหมวดหมู่ที่ไม่ใช่งานหลัก
        if (activityName !== 'Excavation' && activityName !== 'Segment Erection') {
          evs.forEach(ev => {
            let desc = activityName;
            if (ev.label && ev.label.trim() !== '') desc += ` (${ev.label})`;
            shiftDelays.push(desc);
          });
        }
      });
    });

    const uniqueDelays = [...new Set(shiftDelays)];
    let combinedRemarks = [];
    
    // รวม Remarks ที่พิมพ์กรอกเข้าไป
    if (summary.allRemarks.length > 0) {
      combinedRemarks.push(...summary.allRemarks.map(r => `${r.text} (พบในวง ${r.ring})`));
    }
    // รวม Delay จากตาราง Shift Report
    if (uniqueDelays.length > 0) {
      combinedRemarks.push(...uniqueDelays);
    }

    const remarksText = combinedRemarks.length > 0 ? '-' + combinedRemarks.join('\n-') : '-ไม่มี';

    // จัดเรียง Template ชนิดสำเร็จรูป
    const promptText = `
=== TEMPLATE ที่ต้องใช้ (ส่งกลับมาเฉพาะข้อความตาม Template นี้เท่านั้น ห้ามอธิบายเพิ่ม) ===
รายงานประจำวันที่ ${displayDateStr} ${reportShift} Shift
อาคารรับน้ำตอนถนนรัชดาภิเษก (IS4)
🪏🪏งานขุดเจาะอุโมงค์ ${projectInfo.tbmNo}
Drive Shaft : ${projectInfo.location}
สภาพอากาศ : แจ่มใส

1. ${projectInfo.tbmNo}
-เริ่มต้น CH ${startCH} (Center Shaft IS4) ขุดเจาะถึง CH ${finishCH}
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

8. ปัญหาและอุปสรรค
${remarksText}
=== สิ้นสุด TEMPLATE ===
    `;

    const sysPrompt = "คุณคือวิศวกรควบคุมงาน หน้าที่ของคุณคือ Print ข้อความตามรูปแบบ TEMPLATE ที่ส่งไปให้ออกมาเป๊ะๆ ห้ามเปลี่ยนแปลงตัวเลข หรือเพิ่มข้อความบรรยายใดๆ ทั้งสิ้น";

    try {
      const resultText = await generateGeminiSummary(promptText, sysPrompt);
      setAiSummaryText(resultText);
    } catch (error) {
      setAiSummaryText("ขออภัย เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI กรุณาลองใหม่อีกครั้ง: " + error.message);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const getDuration = (start, end) => {
    if (!start || !end) return 0;
    let [h1, m1] = start.split(':').map(Number);
    let [h2, m2] = end.split(':').map(Number);
    let mins1 = h1 * 60 + m1;
    let mins2 = h2 * 60 + m2;
    if (mins2 < mins1) mins2 += 24 * 60; // Crossed midnight
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
        if (activity !== 'Excavation' && activity !== 'Segment Erection') {
          let duration = sr.events[activity].reduce((acc, ev) => acc + getDuration(ev.start, ev.end), 0);
          if (duration > 0) {
            delaySummary[activity] = (delaySummary[activity] || 0) + duration;
            totalDelayMins += duration;
          }
        }
      });
    });

    const delayDetails = Object.entries(delaySummary).length > 0
      ? Object.entries(delaySummary).map(([k,v]) => `- ${k}: ${v} นาที`).join('\n')
      : '- ไม่มีบันทึกเวลาหยุดชะงัก (Delay)';

    const remarksText = summary.allRemarks.length > 0
      ? summary.allRemarks.map(r => `- [${r.module} วงที่ ${r.ring}] ${r.text}`).join('\n')
      : '- ไม่มีปัญหาอุปสรรคที่ถูกบันทึก';

    const promptText = `
ข้อมูลอ้างอิงสำหรับวิเคราะห์ความล่าช้า/อุปสรรค:
- วันที่/เดือน: ${displayDateStr} ${reportShift !== 'All' ? reportShift + ' Shift' : ''}
- เวลาสูญเสียรวม (Total Downtime): ${totalDelayMins} นาที

รายละเอียดเวลาที่สูญเสียแยกตามหมวดหมู่:
${delayDetails}

ปัญหาและอุปสรรคที่พบจากหน้างาน (Remarks):
${remarksText}

คำสั่ง:
คุณคือวิศวกรที่ปรึกษาด้านการขุดเจาะอุโมงค์ TBM
ห้ามเขียนเป็นเรียงความยาวๆ เด็ดขาด! ให้สรุปรายงานให้อ่านง่ายที่สุด เข้าใจได้ใน 1 นาที โดยใช้รูปแบบหัวข้อย่อยและ Emoji นำสายตา
กรุณาจัดรูปแบบผลลัพธ์ตามโครงสร้างนี้เท่านั้น:

📊 สรุปข้อมูลความล่าช้า (Downtime Summary)
- รวมเวลาล่าช้าทั้งหมด: [ใส่ตัวเลข] นาที
- งานที่ทำให้เสียเวลามากที่สุด: [ระบุชื่อและเวลา]

⚠️ วิเคราะห์สาเหตุหลัก (Root Cause Analysis)
- [สรุปสาเหตุจากข้อมูล Remarks และ Delay เป็นข้อๆ สั้นและกระชับ]

📉 ผลกระทบต่องาน (Impact)
- [สรุปสั้นๆ ว่าส่งผลกระทบต่อระยะทางหรือเวลาอย่างไร]

💡 ข้อเสนอแนะและแผนป้องกัน (Action Plan)
- [ข้อเสนอแนะสั้นๆ 1-2 ข้อ]
    `;

    const sysPrompt = "คุณคือวิศวกรผู้เชี่ยวชาญด้านการขุดเจาะอุโมงค์ TBM ห้ามตอบเป็นเรียงความ ให้ตอบในรูปแบบหัวข้อย่อย (Bullet points) ที่กระชับ ตรงประเด็น สั้นที่สุด และอ่านง่ายที่สุด";

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
    try {
      document.execCommand("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
    document.body.removeChild(textArea);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-32">
      
      {/* --- แถบเมนูด้านบนที่ถูกปรับปรุงการจัดวางใหม่ --- */}
      <div className="no-print bg-white p-4 sm:p-5 rounded-3xl shadow-sm border border-slate-200 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 sm:gap-5">
        
        {/* กลุ่มที่ 1: ปุ่มสลับประเภทรายงาน */}
        <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200 w-full xl:w-auto shrink-0">
          <button onClick={() => setReportType("daily")} className={`flex-1 xl:flex-none px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${reportType === "daily" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Daily Report</button>
          <button onClick={() => setReportType("monthly")} className={`flex-1 xl:flex-none px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${reportType === "monthly" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Monthly Report</button>
        </div>

        {/* กลุ่มที่ 2 & 3: ตัวกรอง และ ปุ่ม Action */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 sm:gap-4 w-full xl:w-auto justify-end">
          
          {/* กลุ่มที่ 2: ตัวกรอง (กะ และ วันที่) */}
          <div className="flex flex-row items-center gap-2 sm:gap-3 w-full lg:w-auto shrink-0">
            <select value={reportShift} onChange={(e) => setReportShift(e.target.value)} className="px-3 sm:px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500 bg-white cursor-pointer flex-1 lg:flex-none min-w-[110px]">
              <option value="All">All Shifts</option><option value="Day">Day Shift</option><option value="Night">Night Shift</option>
            </select>
            {reportType === "daily" ? (
              <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="px-3 sm:px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500 flex-1 lg:flex-none" />
            ) : (
              <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} className="px-3 sm:px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500 flex-1 lg:flex-none" />
            )}
          </div>

          {/* กลุ่มที่ 3: ปุ่มกดการกระทำต่างๆ */}
          <div className="grid grid-cols-2 sm:flex sm:flex-row items-center gap-2 sm:gap-3 w-full lg:w-auto">
            <button onClick={handleDownloadImage} disabled={isExportingImage} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 font-bold shadow-md shadow-blue-200 transition-colors whitespace-nowrap text-xs sm:text-sm">
              {isExportingImage ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} 
              <span className="hidden sm:inline">เซฟรูปภาพ</span><span className="sm:hidden">เซฟรูป</span>
            </button>
            <button onClick={() => window.print()} className="w-full sm:w-auto bg-slate-800 hover:bg-slate-900 text-white px-3 sm:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 font-bold shadow-md transition-colors whitespace-nowrap text-xs sm:text-sm">
              <Printer size={16} /> <span className="hidden sm:inline">Print PDF</span><span className="sm:hidden">Print</span>
            </button>
            <button onClick={handleGenerateAISummary} className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-3 sm:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 font-bold shadow-md shadow-indigo-200 transition-all active:scale-95 whitespace-nowrap text-xs sm:text-sm">
              <Sparkles size={16} /> สรุปรายงาน
            </button>
            <button onClick={handleGenerateDelaySummary} className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white px-3 sm:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 font-bold shadow-md shadow-orange-200 transition-all active:scale-95 whitespace-nowrap text-xs sm:text-sm">
              <AlertCircle size={16} /> วิเคราะห์ปัญหา
            </button>
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
            <div className={`text-2xl sm:text-3xl font-black ${parseFloat(summary.avgGroutRatio) > 150 ? "text-purple-500" : parseFloat(summary.avgGroutRatio) >= 100 ? "text-emerald-500" : "text-red-500"}`}>{summary.avgGroutRatio} <span className="text-xs sm:text-sm font-bold ml-1">%</span></div>
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
                      <div className="font-bold text-slate-800">{formatDisplayDate(r.date)} <span className="text-slate-400 font-medium ml-1">({r.shift})</span></div>
                      <div className="text-[10px] sm:text-xs text-slate-500 mt-1 font-mono"><span className="font-bold">EX:</span> {formatDisplayTime(r.excavStartTime)} - {formatDisplayTime(r.excavEndTime)}</div>
                      <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5 font-mono"><span className="font-bold">IN:</span> {formatDisplayTime(r.installStartTime || r.startTime)} - {formatDisplayTime(r.installEndTime || r.endTime)}</div>
                    </td>
                    <td className="py-3 px-4 sm:px-5 font-black text-slate-800 text-base">
                      <span className={r.installType === "Temporary" ? "text-amber-600" : ""}>{r.ringNo}</span>
                      {r.installType === "Temporary" && <span className="text-amber-600 ml-2 font-bold text-[9px] bg-amber-50 px-1.5 py-0.5 rounded">(Temp)</span>}
                      {r.status === "In Progress" && <span className="text-orange-500 ml-2 font-bold text-[9px] bg-orange-50 px-1.5 py-0.5 rounded">(In Prog)</span>}
                    </td>
                    <td className="py-3 px-4 sm:px-5 text-center">
                      <span className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-700">{r.typeRing}</span>
                      <span className="text-xs text-slate-500 font-bold ml-1">K{r.keyPos}</span>
                    </td>
                    <td className="py-3 px-4 sm:px-5 text-right text-slate-500 font-mono font-medium">{r.startCH}</td>
                    <td className="py-3 px-4 sm:px-5 text-right text-slate-800 font-bold font-mono">{r.finishCH}</td>
                    <td className="py-3 px-4 sm:px-5 text-right">
                      <div className="font-black text-emerald-600 text-base">{r.length} <span className="text-xs font-bold">m</span></div>
                      <div className="text-[10px] text-slate-500 font-medium mt-0.5">{r.soilVolume || calculateSoilVolume(r.length)} m³</div>
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
                      {r.ringNo}
                      {r.groutPass === "Re-Grout" && <span className="text-purple-600 ml-2 font-bold text-[9px] bg-purple-50 px-1.5 py-0.5 rounded">(Re-Grout)</span>}
                    </td>
                    <td className="py-3 px-4 sm:px-5 text-slate-500 font-medium">{r.excavRing}</td>
                    <td className="py-3 px-4 sm:px-5">
                      <div className="font-bold text-slate-700 text-xs mb-1">K{r.key}</div>
                      <div className="flex gap-1 flex-wrap">
                        {Object.entries(r.positions || {}).map(([pos, active]) => active && <span key={pos} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[9px] rounded border border-blue-100 font-bold leading-none">{pos}</span>)}
                      </div>
                    </td>
                    <td className="py-3 px-4 sm:px-5 text-right text-slate-500 font-mono">{r.partA}</td>
                    <td className="py-3 px-4 sm:px-5 text-right text-slate-500 font-mono">{r.partB}</td>
                    <td className="py-3 px-4 sm:px-5 text-right font-black text-slate-800 text-base">{r.total.toFixed(2)}</td>
                    <td className="py-3 px-4 sm:px-5 text-right font-black">
                      <span className={`px-2 py-1 rounded-md ${r.ratio > 150 ? "bg-purple-50 text-purple-600" : r.ratio >= 100 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>{r.ratio.toFixed(1)}%</span>
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
                  <span className="font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded whitespace-nowrap text-xs">[{rem.module} - {rem.ring}]</span>
                  <span className="font-medium text-slate-600">{rem.text}</span>
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
              <button onClick={() => setShowAIModal(false)} className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 sm:p-8 bg-slate-50 relative min-h-[200px] overflow-y-auto flex-1 hide-scrollbar">
              {isGeneratingAI ? (
                <div className="flex flex-col items-center justify-center py-12 text-indigo-500 h-full gap-4">
                  <Loader2 size={48} className="animate-spin" />
                  <p className="font-bold animate-pulse text-base sm:text-lg">กำลังวิเคราะห์ข้อมูลและร่างรายงาน...</p>
                </div>
              ) : (
                <div className="prose prose-sm sm:prose-base max-w-none text-slate-700 whitespace-pre-wrap leading-relaxed font-medium">
                  {aiSummaryText}
                </div>
              )}
            </div>

            {!isGeneratingAI && aiSummaryText && (
              <div className="bg-white px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center shrink-0 gap-4">
                <p className="text-[10px] sm:text-xs text-slate-400 font-bold flex items-center gap-1.5 text-center sm:text-left"><Sparkles size={12}/> เนื้อหาสร้างโดย AI โปรดตรวจสอบความถูกต้อง</p>
                <button 
                  onClick={copyToClipboard}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm transition-colors shadow-lg active:scale-95 w-full sm:w-auto"
                >
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

// --- 7. SHIFT REPORT VIEW (NEW & INTEGRATED) ---
const ShiftReportView = ({ projectInfo, segmentRecords, shiftReports, setShiftReports }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingImage, setIsExportingImage] = useState(false);

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
      const savedRecord = { ...payload, events: events, manpower: manpower, result: result };
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

  const displayEvents = useMemo(() => {
    const merged = { ...events };
    const filteredSegs = deduplicatedSegments.filter(r => formatDisplayDate(r.date) === meta.date && r.shift === meta.shift);
    const autoExcav = [];
    const autoInst = [];

    filteredSegs.forEach(rec => {
      const extStart = formatDisplayTime(rec.excavStartTime);
      const extEnd = formatDisplayTime(rec.excavEndTime);
      const instStart = formatDisplayTime(rec.installStartTime || rec.startTime);
      const instEnd = formatDisplayTime(rec.installEndTime || rec.endTime);

      if (extStart && extEnd) autoExcav.push({ id: `auto_ex_${rec.id}`, start: extStart, end: extEnd, label: rec.ringNo, isAuto: true });
      if (instStart && instEnd) autoInst.push({ id: `auto_in_${rec.id}`, start: instStart, end: instEnd, label: rec.ringNo, isAuto: true });
    });

    merged['Excavation'] = [...(merged['Excavation'] || []), ...autoExcav];
    merged['Segment Erection'] = [...(merged['Segment Erection'] || []), ...autoInst];

    return merged;
  }, [events, deduplicatedSegments, meta.date, meta.shift]);

  const hoursDay = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const hoursNight = [19, 20, 21, 22, 23, 24, 1, 2, 3, 4, 5, 6];
  const currentHours = meta.shift === 'Day' ? hoursDay : hoursNight;

  const activityCategories = [
    { group: 'Main Activities', items: ['Excavation', 'Segment Erection'] }, 
    { group: 'Delay Activities', items: ['Locomotive / Rail System', 'Survey', 'Power Supply', 'TBM Equipment', 'Clean Area', 'Muck Full', 'Other 1', 'Other 2'] }, 
    { group: 'TBM Service / Maintenance', items: ['Cleaning Belt conveyor', 'Service / Maintenance', 'Other 3'] } 
  ];

  const getMinutesFromShiftStart = (timeStr, shift) => {
    if (!timeStr) return 0;
    let [h, m] = timeStr.split(':').map(Number);
    let shiftStartH = shift === 'Day' ? 7 : 19;
    if (shift === 'Day') { if (h < 7) h += 24; } 
    else { if (h < 19) h += 24; }
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
    if (!Array.isArray(displayEvents[activityName])) return 0;
    return displayEvents[activityName].reduce((total, ev) => {
      if (!ev || !ev.start || !ev.end) return total;
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

  const handleDownloadImage = async () => {
    const element = document.getElementById("shift-report-container");
    if (!element) return;

    const inputs = element.querySelectorAll("input:not([type='radio']):not([type='checkbox']), textarea");
    const valuesMap = new Map();
    inputs.forEach((inp, i) => {
      inp.setAttribute('data-html2canvas-id', i);
      valuesMap.set(i.toString(), inp.value);
    });

    try {
      setIsExportingImage(true);
      const html2canvas = await loadHtml2Canvas();
      const canvas = await html2canvas(element, { 
        scale: 2, 
        backgroundColor: "#ffffff", 
        useCORS: true,
        windowWidth: 1152,
        onclone: (clonedDoc) => {
          const clonedContainer = clonedDoc.getElementById("shift-report-container");
          if (!clonedContainer) return;

          // บังคับขนาด Desktop เพื่อไม่ให้ layout พังเมื่อกดเซฟจากมือถือ
          clonedContainer.style.width = "1152px";
          clonedContainer.style.maxWidth = "none";
          clonedContainer.querySelectorAll('.overflow-x-auto').forEach(el => el.style.overflow = 'visible');

          const clonedInputs = clonedContainer.querySelectorAll("input[data-html2canvas-id], textarea[data-html2canvas-id]");
          clonedInputs.forEach((input) => {
            const id = input.getAttribute('data-html2canvas-id');
            const val = valuesMap.get(id);

            const div = clonedDoc.createElement("div");
            div.innerText = val || "\u00A0"; 
            div.className = input.className;
            div.style.border = "none";
            div.style.borderBottom = input.classList.contains('grid-input') ? "none" : "1px dotted #94a3b8";
            div.style.background = "transparent";
            div.style.color = "black";
            div.style.fontWeight = "bold";
            div.style.display = "inline-flex";
            div.style.alignItems = "center";
            div.style.minHeight = "24px"; 
            
            if (input.classList.contains("text-right")) div.style.justifyContent = "flex-end";
            else if (input.classList.contains("text-center") || input.classList.contains("grid-input")) div.style.justifyContent = "center";
            else div.style.justifyContent = "flex-start";

            input.parentNode.replaceChild(div, input);
          });
        }
      });

      inputs.forEach(inp => inp.removeAttribute('data-html2canvas-id'));

      const link = document.createElement("a");
      link.download = `Shift_Report_${meta.date}_${meta.shift}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.9);
      link.click();
    } catch (error) {
      alert("เกิดข้อผิดพลาดในการสร้างรูปภาพ: " + error.message);
    } finally {
      setIsExportingImage(false);
    }
  };

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
    if (updatedEvents[activityName].length === 0) delete updatedEvents[activityName];
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
      className={`w-full bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all print:bg-transparent print:border-b print:border-black print:border-x-0 print:border-t-0 print:rounded-none print:text-black ${className}`}
    />
  );

  return (
    <div className="max-w-6xl mx-auto font-sans text-sm pb-32 animate-fade-in">
      <div className="mb-6 bg-white p-5 rounded-3xl shadow-sm border border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 no-print">
        <h1 className="text-xl font-black text-slate-800 flex items-center gap-3">
          <FileText className="text-blue-600" size={24} />
          ระบบบันทึก TBM Shift Report
        </h1>
        <div className="flex w-full sm:w-auto gap-3">
          <button onClick={handleDownloadImage} disabled={isExportingImage} className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-md font-bold">
            {isExportingImage ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />} 
            {isExportingImage ? "Saving..." : "เซฟรูปภาพ"}
          </button>
          <button onClick={handleSaveToCloud} disabled={isSaving} className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-md font-bold">
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <CloudUpload size={18} />}
            {isSaving ? "Saving..." : "Save to Cloud"}
          </button>
          <button onClick={handlePrint} className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-md font-bold">
            <Printer size={18} /> Print PDF
          </button>
        </div>
      </div>

      <div id="shift-report-container" className="bg-white border border-slate-200 shadow-xl print:shadow-none print:border-none rounded-[2rem] overflow-hidden print:rounded-none">
        
        <div className="p-8 border-b border-slate-200 print:border-black print:p-2 text-center bg-slate-50/50 print:bg-white">
          <h2 className="text-2xl print:text-lg font-black mb-2 tracking-tight text-slate-900">บันทึกการทำงานการขุดเจาะอุโมงค์</h2>
          <p className="font-bold text-slate-600 print:text-black text-sm mb-3">โครงการงานก่อสร้างอุโมงค์ระบายน้ำคลองเปรมประชากรจากคลองบางบัวลงสู่แม่น้ำเจ้าพระยา</p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-8 text-xs sm:text-sm mt-4 text-slate-700 print:text-black items-center font-medium">
            <p><strong className="text-slate-900">ผู้ว่าจ้าง :</strong> สำนักการระบายน้ำ กรุงเทพมหานคร</p>
            <div className="flex items-center gap-2">
              <strong className="text-slate-900">ผู้ให้บริการควบคุมงานก่อสร้าง :</strong>
              <div className="flex items-center bg-white px-3 py-1 rounded-md border border-slate-200 shadow-sm print:shadow-none print:border-gray-400">
                <span className="text-[#004a80] font-black tracking-tighter border-r border-gray-300 pr-2 text-xs">TEAM GROUP</span>
                <span className="text-[#1a85b6] font-black pl-2 text-xs flex items-center gap-1">
                  <div className="w-3 h-3 bg-gray-200 rounded-sm flex items-center justify-center relative overflow-hidden">
                    <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-transparent border-b-[#1a85b6] absolute bottom-0.5"></div>
                  </div>
                  GFE
                </span>
              </div>
            </div>
            <p><strong className="text-slate-900">ผู้รับจ้าง :</strong> กิจการร่วมค้า ไอทีดี-เอ็นดับเบิลยูอาร์</p>
          </div>
        </div>

        <div className="p-5 sm:p-6 print:p-2 border-b border-slate-200 print:border-black flex flex-wrap gap-4 items-center bg-white text-sm font-medium">
          <div className="flex items-center gap-2">
            <strong className="text-slate-800">วันที่:</strong>
            <input type="date" name="date" value={meta.date} onChange={handleMetaChange} className="border border-slate-200 p-2 rounded-lg bg-slate-50 print:border-none print:bg-transparent text-slate-800 font-bold outline-none focus:ring-2 focus:ring-blue-100 transition-all" />
          </div>
          <div className="flex items-center gap-2">
            <strong className="text-slate-800">หัวเจาะหมายเลข:</strong>
            <input type="text" name="tbmNo" value={meta.tbmNo} onChange={handleMetaChange} className="border border-slate-200 p-2 rounded-lg bg-slate-50 w-24 print:border-none print:bg-transparent font-bold outline-none focus:ring-2 focus:ring-blue-100 transition-all text-center" />
          </div>
          <div className="flex items-center gap-2 flex-grow">
            <strong className="text-slate-800">ตำแหน่ง:</strong>
            <input type="text" name="location" value={meta.location} onChange={handleMetaChange} className="border border-slate-200 p-2 rounded-lg bg-slate-50 w-full print:border-none print:bg-transparent font-bold outline-none focus:ring-2 focus:ring-blue-100 transition-all" />
          </div>
          <div className="flex items-center gap-5 font-bold bg-slate-50 p-2.5 rounded-xl border border-slate-200 shadow-inner print:shadow-none print:border-none print:bg-transparent">
            <label className="flex items-center gap-1.5 cursor-pointer text-orange-600 hover:text-orange-700 transition-colors">
              <input type="radio" name="shift" value="Day" checked={meta.shift === 'Day'} onChange={handleMetaChange} className="accent-orange-500 w-4 h-4" /> Day (07-19)
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-indigo-600 hover:text-indigo-700 transition-colors">
              <input type="radio" name="shift" value="Night" checked={meta.shift === 'Night'} onChange={handleMetaChange} className="accent-indigo-500 w-4 h-4" /> Night (19-07)
            </label>
          </div>
        </div>

        <div className="overflow-x-auto border-b border-slate-200 print:border-black">
          <table className="w-full text-xs print:text-[11px] border-collapse table-fixed min-w-[800px]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 print:border-black p-2.5 text-left text-slate-700" style={{ width: '22%' }}>Time / Activities</th>
                {currentHours.map((hour, idx) => (
                  <th key={idx} className="border border-slate-300 print:border-black p-1 text-center font-bold text-slate-700" style={{ width: '6%' }}>{hour}</th>
                ))}
                <th className="border border-slate-300 print:border-black p-1 text-center text-slate-700" style={{ width: '6%' }}>Total Time<br/>(min)</th>
              </tr>
            </thead>
            <tbody>
              {activityCategories.map((cat, cIdx) => (
                <React.Fragment key={cIdx}>
                  <tr className="bg-slate-200/60">
                    <td colSpan={14} className="border border-slate-300 print:border-black p-2 font-black pl-3 text-slate-800">{cat.group}</td>
                  </tr>
                  {cat.items.map((item, iIdx) => {
                    const totalMins = getTotalMinutes(item);
                    return (
                      <tr key={`${cIdx}-${iIdx}`} className="group h-[38px] hover:bg-slate-50 transition-colors">
                        <td className="border border-slate-300 print:border-black p-1.5 pl-5 relative bg-white font-medium text-slate-700">
                          {item}
                          <button 
                            onClick={() => setActiveModal(item)}
                            className="absolute right-1.5 top-1.5 text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 p-1 rounded-md no-print opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                            title="เพิ่มเวลาการทำงาน"
                          >
                            <Plus size={14} />
                          </button>
                        </td>
                        
                        <td colSpan={12} className="border border-slate-300 print:border-black p-0 relative">
                          <div className="absolute inset-0 flex pointer-events-none">
                            {currentHours.map((h, idx) => (
                              <div key={idx} className={`h-full w-[8.333%] ${idx < 11 ? 'border-r border-slate-200 print:border-gray-300' : ''}`} />
                            ))}
                          </div>

                          <div className="absolute inset-y-[4px] inset-x-0 px-0.5">
                            {(Array.isArray(displayEvents[item]) ? displayEvents[item] : [])
                              .filter((ev) => ev != null)
                              .map((ev, index) => {
                                const { left, width } = calculateBarStyles(ev.start, ev.end, meta.shift);
                                const colorClasses = getBarColorClasses(cIdx);
                                return (
                                  <div 
                                    key={`${ev.id || index}-${index}`} 
                                    className={`absolute h-[90%] top-[5%] border-[1.5px] rounded-[4px] flex items-center justify-center text-[10px] sm:text-[11px] font-black overflow-visible whitespace-nowrap cursor-pointer z-10 hover:brightness-95 transition-all shadow-sm ${colorClasses}`}
                                    style={{ left, width }}
                                    onClick={() => !ev?.isAuto && setActiveModal(item)}
                                    title={`${ev.start} - ${ev.end}`}
                                  >
                                    {/* ลบ class truncate และ max-w-full ออก เพื่อให้ข้อความล้นกรอบได้ไม่อั้น */}
                                    <span className="bg-white/90 px-1.5 py-0.5 rounded-[2px] shadow-sm tracking-tight">{ev.label || ""}</span>
                                  </div>
                                );
                            })}
                          </div>
                        </td>

                        <td className="border border-slate-300 print:border-black p-1 text-center bg-slate-50 print:bg-white font-black text-blue-700 print:text-blue-800 text-sm">
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

        <div className="grid grid-cols-1 lg:grid-cols-2 border-b border-slate-200 print:border-black bg-slate-50">
          <div className="p-6 print:p-3 lg:border-r border-slate-200 print:border-black bg-white m-3 sm:m-4 rounded-2xl shadow-sm print:shadow-none print:m-0 print:rounded-none">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4 bg-slate-100 print:bg-transparent p-2 rounded-lg print:p-0">
              <Users size={18} className="text-slate-500" /> Man Power (People)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs sm:text-sm print:text-[11px]">
              {Object.keys(manpower).map(role => (
                <div key={role} className="flex flex-col">
                  <span className="text-slate-500 font-bold mb-1.5">{role}</span>
                  {renderInput(manpower[role], handleManpowerChange, role, "0", "number", "text-center p-2 font-black")}
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 print:p-3 bg-white m-3 sm:m-4 rounded-2xl shadow-sm print:shadow-none print:m-0 print:rounded-none">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4 bg-slate-100 print:bg-transparent p-2 rounded-lg print:p-0">
              <Activity size={18} className="text-slate-500" /> Result
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 text-xs sm:text-sm print:text-[11px]">
              <div className="flex items-center justify-between border-b border-dashed border-slate-300 pb-2">
                <span className="font-medium text-slate-600">Start: Sta.</span>
                <div className="w-28">{renderInput(result.startSta, handleResultChange, 'startSta', '', 'text', 'text-right font-black p-1')}</div>
              </div>
              <div className="flex items-center justify-between border-b border-dashed border-slate-300 pb-2">
                <span className="font-medium text-slate-600">Finish: Sta.</span>
                <div className="w-28">{renderInput(result.finishSta, handleResultChange, 'finishSta', '', 'text', 'text-right font-black p-1')}</div>
              </div>
              <div className="flex items-center justify-between border-b border-dashed border-slate-300 pb-2">
                <span className="font-medium text-slate-600">Number of ring:</span>
                <div className="w-28">{renderInput(result.numberRing, handleResultChange, 'numberRing', '', 'number', 'text-right font-black text-blue-700 p-1')}</div>
              </div>
              <div className="flex items-center justify-between border-b border-dashed border-slate-300 pb-2">
                <span className="font-medium text-slate-600">Total Distance (m.):</span>
                <div className="w-28">{renderInput(result.totalDistance, handleResultChange, 'totalDistance', '', 'text', 'text-right font-black p-1')}</div>
              </div>
              <div className="flex items-center justify-between col-span-1 sm:col-span-2 border-b border-dashed border-slate-300 pb-2">
                <span className="font-medium text-slate-600">Progress Rate (m./shift):</span>
                <div className="w-28">{renderInput(result.progressRate, handleResultChange, 'progressRate', '', 'text', 'text-right font-black p-1')}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-10 print:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-center text-xs print:text-[11px] bg-white">
          {['ผู้บันทึก (ผู้รับจ้าง)', 'วิศวกร (ผู้รับจ้าง)', 'วิศวกร (กลุ่มบริษัทที่ปรึกษา)', 'ผู้ควบคุมงาน สำนักการระบายน้ำ'].map((role, idx) => (
            <div key={idx} className="flex flex-col justify-end h-28 sm:h-32">
              <p className="text-slate-400 font-bold mb-auto">
                {idx === 0 ? 'บันทึกโดย' : idx === 1 ? 'ตรวจสอบโดย' : ''}
              </p>
              <div className="border-b-[1.5px] border-dotted border-slate-400 print:border-black w-[80%] mx-auto pb-2 relative">
                 <input type="text" className="absolute bottom-0 left-0 w-full text-center bg-transparent outline-none grid-input font-bold text-slate-700 print:text-black border-none" placeholder="(ชื่อ-สกุล)" />
              </div>
              <p className="font-bold text-slate-800 mt-3">{role}</p>
            </div>
          ))}
        </div>

      </div>

      {/* --- ADD EVENT MODAL --- */}
      {activeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 no-print p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-md transform transition-all border border-slate-100">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-5">
              <h3 className="text-lg font-black flex items-center gap-2 text-slate-800">
                <Clock className="text-blue-500" size={20} />
                {editingEventId ? 'แก้ไขเวลา:' : 'เพิ่มเวลา:'} <span className="text-blue-600">{activeModal}</span>
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-red-500 bg-slate-100 hover:bg-red-50 rounded-full p-1.5 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="flex gap-4 mb-5">
              <div className="flex-1">
                <label className="block text-[10px] sm:text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-widest">เวลาเริ่ม (Start)</label>
                <input type="time" value={newEvent.start} onChange={e => setNewEvent({...newEvent, start: e.target.value})} className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all" />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] sm:text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-widest">เวลาสิ้นสุด (End)</label>
                <input type="time" value={newEvent.end} onChange={e => setNewEvent({...newEvent, end: e.target.value})} className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all" />
              </div>
            </div>
            
            <div className="mb-8">
              <label className="block text-[10px] sm:text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-widest">ข้อความในกราฟ</label>
              <input type="text" value={newEvent.label} onChange={e => setNewEvent({...newEvent, label: e.target.value})} placeholder="เช่น 108 หรือ K-14" className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all" />
            </div>

            <div className="flex flex-col gap-3 mb-6">
              <button
                onClick={() => addEvent(activeModal)}
                className={`w-full text-white rounded-xl p-3.5 font-bold transition-all shadow-md flex items-center justify-center gap-2 active:scale-[0.98] ${
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
                  className="w-full text-slate-500 hover:text-slate-800 text-xs font-bold py-2 underline transition-colors"
                >
                  ยกเลิกการแก้ไข
                </button>
              )}
            </div>

            {/* List of existing events */}
            {Array.isArray(displayEvents[activeModal]) && displayEvents[activeModal].length > 0 && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <h4 className="font-bold text-[10px] uppercase tracking-widest mb-3 text-slate-400">รายการที่บันทึกไว้แล้ว</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-2 hide-scrollbar">
                  {displayEvents[activeModal].filter((ev) => ev != null).map((ev, index) => (
                    <div key={`${ev.id || index}-${index}`} className={`flex justify-between items-center bg-white p-3 rounded-xl text-sm border shadow-sm transition-all ${editingEventId === ev?.id ? 'border-emerald-500 ring-2 ring-emerald-100 bg-emerald-50/10' : 'border-slate-200 hover:border-slate-300'}`}>
                      <span className="font-medium text-slate-700 font-mono">
                        {ev.start} - {ev.end} <strong className="ml-2 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 font-sans tracking-tight">[{ev.label || ""}]</strong>
                      </span>
                      {ev.isAuto ? (
                        <span className="text-[9px] text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md font-bold border border-emerald-100">Auto (System)</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleEditEventClick(ev)} className="text-blue-500 hover:bg-blue-100 p-1.5 rounded-lg transition-colors" title="แก้ไข">
                            <Edit size={16} />
                          </button>
                          <button onClick={() => deleteEvent(activeModal, ev.id)} className="text-red-500 hover:bg-red-100 p-1.5 rounded-lg transition-colors" title="ลบ">
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
        <Loader2 className="animate-spin w-12 h-12 mb-5 text-blue-600" />
        <div className="font-black text-slate-800 text-lg tracking-tight">Connecting to Server...</div>
        <p className="text-slate-400 text-sm mt-2 font-medium">กำลังเตรียมข้อมูล TBM System</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/80 font-sans text-slate-800 selection:bg-blue-100 overflow-x-hidden print:overflow-visible print:bg-white print:min-h-0 print:block">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm transition-all no-print">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className={`p-2.5 sm:p-3 rounded-2xl text-white shadow-lg transition-colors bg-gradient-to-br from-slate-800 to-slate-900`}>
              <Layers size={20} className="sm:w-6 sm:h-6" strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">TBM1 System</h1>
                {/* 🔴 LIVE BLINKING INDICATOR 🔴 */}
                {liveHeaderStatus && (
                  <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[9px] sm:text-[10px] font-bold text-white shadow-sm animate-pulse ${liveHeaderStatus.color}`}>
                    {liveHeaderStatus.icon} {liveHeaderStatus.text}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-slate-500 font-semibold mt-0.5">
                <MapPin size={12} />
                <input type="text" name="location" value={projectInfo.location} onChange={handleProjectInfoChange} list="locations-list" className="bg-transparent border-none p-0 focus:ring-0 w-48 sm:w-72 outline-none cursor-pointer placeholder-slate-400 font-medium" placeholder="สถานที่..." />
                <datalist id="locations-list">
                  <option value="อุโมงค์จากบ่อ IS4 ถึง บ่อ IS2" />
                </datalist>
              </div>
            </div>
          </div>

          {activeTab !== "overview" && activeTab !== "shift_report" && (
            <div className="flex bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200 w-full md:w-auto">
              <button onClick={() => { setCurrentModule("segment"); setActiveTab("record"); }} className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-xs font-black transition-all ${currentModule === "segment" ? "bg-white text-emerald-600 shadow-md shadow-slate-200" : "text-slate-500 hover:text-slate-800"}`}>Segment</button>
              <button onClick={() => { setCurrentModule("grout"); setActiveTab("record"); }} className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-xs font-black transition-all ${currentModule === "grout" ? "bg-white text-blue-600 shadow-md shadow-slate-200" : "text-slate-500 hover:text-slate-800"}`}>Grout</button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="px-3 sm:px-6 py-6 sm:py-10 max-w-7xl mx-auto print:p-0 print:m-0">
        {loadError && <div className="mb-6 bg-red-50 border border-red-200 text-red-700 p-5 rounded-2xl text-center no-print font-bold shadow-sm">{loadError}</div>}

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
          <ReportView segmentRecords={segmentRecords} groutRecords={groutRecords} projectInfo={projectInfo} shiftReports={shiftReports} />
        )}
        
        {/* SHIFT REPORT VIEW */}
        {activeTab === "shift_report" && (
          <ShiftReportView projectInfo={projectInfo} segmentRecords={segmentRecords} shiftReports={shiftReports} setShiftReports={setShiftReports} />
        )}

      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-6 sm:bottom-8 left-1/2 transform -translate-x-1/2 z-40 no-print w-[95%] sm:w-auto max-w-2xl">
        <div className="flex items-center justify-between sm:justify-center gap-1 sm:gap-2 bg-slate-900/95 backdrop-blur-2xl border border-white/10 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] p-2 rounded-full overflow-x-auto hide-scrollbar">
          
          <button onClick={() => setActiveTab("overview")} className={`flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-full text-xs font-bold transition-all ${activeTab === "overview" ? "bg-white text-slate-900 shadow-lg" : "text-slate-300 hover:text-white hover:bg-white/10"}`}>
            <Home size={18} /> <span className="hidden sm:inline tracking-wide">Home</span>
          </button>
          
          <div className="w-px h-8 bg-white/20 mx-1"></div>

          <button onClick={() => setActiveTab("record")} className={`flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-full text-xs font-bold transition-all ${activeTab === "record" ? "bg-white text-slate-900 shadow-lg" : "text-slate-300 hover:text-white hover:bg-white/10"}`}>
            <PlusCircle size={18} /> <span className="hidden sm:inline tracking-wide">Record</span><span className="sm:hidden">Rec</span>
          </button>
          
          <button onClick={() => setActiveTab("dashboard")} className={`flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-full text-xs font-bold transition-all ${activeTab === "dashboard" ? "bg-white text-slate-900 shadow-lg" : "text-slate-300 hover:text-white hover:bg-white/10"}`}>
            <LayoutDashboard size={18} /> <span className="hidden sm:inline tracking-wide">Dash</span>
          </button>
          
          <div className="w-px h-8 bg-white/20 mx-1"></div>

          <button onClick={() => setActiveTab("shift_report")} className={`flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-full text-xs font-bold transition-all ${activeTab === "shift_report" ? "bg-white text-slate-900 shadow-lg" : "text-slate-300 hover:text-white hover:bg-white/10"}`}>
            <Clock size={18} /> <span className="hidden sm:inline tracking-wide">Shift Report</span><span className="sm:hidden">Shift</span>
          </button>

          <button onClick={() => setActiveTab("report")} className={`flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-full text-xs font-bold transition-all ${activeTab === "report" ? "bg-white text-slate-900 shadow-lg" : "text-slate-300 hover:text-white hover:bg-white/10"}`}>
            <FileText size={18} /> <span className="hidden sm:inline tracking-wide">Stats</span><span className="sm:hidden">Stats</span>
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

          /* บังคับให้เนื้อหาหลักถูกบีบขนาดให้พอดี 1 หน้ากระดาษ (Fit to 1 page) */
          main > div {
            width: 100% !important;
            transform: scale(0.88); /* ย่อขนาดลง 12% ให้พอดี 1 หน้า */
            transform-origin: top center; /* ยึดขอบบนและตรงกลาง */
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
      `}} />
    </div>
  );
};

export default PrimaryGroutApp;
