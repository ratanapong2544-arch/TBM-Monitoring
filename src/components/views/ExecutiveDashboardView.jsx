import React, { useState, useMemo } from "react";
import {
  TrendingUp, Layers, Activity, MapPin, Droplet, BarChart3, Clock, Settings, Plus, Save, Trash2, X, Ruler, Maximize2
} from "lucide-react";
import StatCard from "../common/StatCard";
import { formatDisplayDate, formatDisplayTime, parseCH } from "../../utils/formatters";
import { getRingNumeric, calculateSoilVolume, offsetRingNo } from "../../utils/helpers";
import { THEORETICAL_VOL, VOL_120, VOL_150, TOTAL_ROUTE_DISTANCE, ROUTE_SEGMENTS } from "../../utils/constants";
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Line,
  AreaChart, Area, ReferenceLine, PieChart, Pie, Cell, Legend
} from "recharts";

const ExecutiveDashboardView = ({ segmentRecords, groutRecords }) => {

  // ── Segment Filter State ──
  const [segFilterMode, setSegFilterMode] = useState("all");
  const [segFilterDate, setSegFilterDate] = useState(new Date().toISOString().split("T")[0]);
  const [segFilterMonth, setSegFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [segRangeStart, setSegRangeStart] = useState("");
  const [segRangeEnd, setSegRangeEnd] = useState("");
  const [segFilterShift, setSegFilterShift] = useState("All");

  // ── Grout Filter State ──
  const [groutFilterMode, setGroutFilterMode] = useState("all");
  const [groutChartWindow, setGroutChartWindow] = useState(20);
  const [groutRangeStart, setGroutRangeStart] = useState("");
  const [groutRangeEnd, setGroutRangeEnd] = useState("");
  const [groutFilterDate, setGroutFilterDate] = useState(new Date().toISOString().split("T")[0]);
  const [groutFilterMonth, setGroutFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [groutFilterShift, setGroutFilterShift] = useState("All");

  // ── Distance Filter State ──
  const [distFilterMode, setDistFilterMode] = useState("all");
  const [distRangeStart, setDistRangeStart] = useState("");
  const [distRangeEnd, setDistRangeEnd] = useState("");
  const [expandedChart, setExpandedChart] = useState(null);

  // ── Plan Config ──
  const [showPlanModal, setShowPlanModal] = useState(false);
  const defaultPlanConfig = { basePlanAcc: 0, baseActualAcc: 0, ranges: [] };
  const [planConfig, setPlanConfig] = useState(() => {
    try {
      const saved = localStorage.getItem("tbmPlanConfig");
      if (saved) { const parsed = JSON.parse(saved); return { ...defaultPlanConfig, ...parsed, ranges: parsed.ranges || [] }; }
    } catch (e) { }
    return defaultPlanConfig;
  });

  // ── Distance Plan Config ──
  const [showDistPlanModal, setShowDistPlanModal] = useState(false);
  const defaultDistPlanConfig = { ranges: [] };
  const [distPlanConfig, setDistPlanConfig] = useState(() => {
    try {
      const saved = localStorage.getItem("tbmDistancePlanConfig");
      if (saved) { const parsed = JSON.parse(saved); return { ...defaultDistPlanConfig, ...parsed, ranges: parsed.ranges || [] }; }
    } catch (e) { }
    return defaultDistPlanConfig;
  });

  const getPlanForDate = (dateStr, config) => {
    if (!config || !config.ranges || config.ranges.length === 0) return 0;
    for (let range of config.ranges) {
      if ((!range.start || dateStr >= range.start) && (!range.end || dateStr <= range.end)) {
        return parseFloat(range.dailyPlan) || 0;
      }
    }
    return 0;
  };

  // ══════════════════════════════════════════════
  // HELPER: Smart deduplicate — เลือก Completed ก่อน, ถ้าไม่มีใช้แถวสุดท้าย
  // ══════════════════════════════════════════════
  const deduplicateRecords = (records) => {
    const map = new Map();
    records.forEach(r => {
      const key = r.ringNo;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, r);
      } else {
        // ถ้าของเดิมยังเป็น In Progress แต่ตัวใหม่เป็น Completed → เอาตัวใหม่
        if (existing.status === "In Progress" && r.status !== "In Progress") {
          map.set(key, r);
        } else if (existing.status === r.status) {
          // status เหมือนกัน → เอาตัวที่ใหม่กว่า (ท้ายสุดใน array)
          map.set(key, r);
        }
      }
    });
    return Array.from(map.values());
  };

  // ══════════════════════════════════════════════
  // SECTION: Overall KPI Stats (all data)
  // ══════════════════════════════════════════════

  const overallStats = useMemo(() => {
    // Deduplicate ทุก records ก่อน (เลือก Completed ก่อน In Progress)
    const allDeduped = deduplicateRecords(segmentRecords);

    const permRings = allDeduped.filter(r => r.installType !== "Temporary");
    const tempRings = allDeduped.filter(r => r.installType === "Temporary");

    const totalDistance = permRings.reduce((sum, r) => sum + parseFloat(r.length || 0), 0);
    const totalSoilVol = permRings.reduce((sum, r) => sum + parseFloat(r.soilVolume || calculateSoilVolume(r.length)), 0);

    const dates = [...new Set(permRings.map(r => formatDisplayDate(r.date)))];
    const avgRings = dates.length > 0 ? (permRings.length / dates.length).toFixed(1) : 0;
    const avgDist = dates.length > 0 ? (totalDistance / dates.length).toFixed(1) : 0;

    let currentCH = "-";
    if (permRings.length > 0) {
      const withCH = permRings.filter(r => r.finishCH);
      if (withCH.length > 0) currentCH = withCH[withCH.length - 1].finishCH;
    }

    // Grout stats
    const groutAvgVol = groutRecords.length > 0
      ? (groutRecords.reduce((acc, r) => acc + Number(r.total || 0), 0) / groutRecords.length).toFixed(2)
      : "0.00";
    const groutAvgRatio = groutRecords.length > 0
      ? (groutRecords.reduce((acc, r) => acc + Number(r.ratio || 0), 0) / groutRecords.length).toFixed(1)
      : "0.0";
    const uniqueGroutedRings = new Set(groutRecords.map(r => r.ringNo)).size;
    const latestGroutRing = groutRecords.length > 0 ? String(groutRecords[groutRecords.length - 1].ringNo) : "-";

    return {
      permRings: permRings.length, tempRings: tempRings.length,
      totalRings: permRings.length + tempRings.length,
      totalDistance, totalSoilVol, avgRings, avgDist, currentCH,
      groutAvgVol, groutAvgRatio, uniqueGroutedRings, latestGroutRing
    };
  }, [segmentRecords, groutRecords]);

  // ══════════════════════════════════════════════
  // SECTION: Live Status
  // ══════════════════════════════════════════════

  const liveStatus = useMemo(() => {
    if (segmentRecords.length === 0) return { state: "IDLE", ring: "-", desc: "ยังไม่มีข้อมูล", color: "slate" };
    const map = new Map();
    segmentRecords.forEach(rec => map.set(rec.ringNo, rec));
    const deduped = Array.from(map.values());
    const lastSeg = deduped[deduped.length - 1];

    if (lastSeg.status === "In Progress") {
      if (lastSeg.excavStartTime && !lastSeg.excavEndTime) return { state: "EXCAVATING", ring: String(lastSeg.ringNo), desc: `เริ่มขุดเมื่อ ${formatDisplayTime(lastSeg.excavStartTime)} น.`, color: "amber" };
      if (lastSeg.excavEndTime && !lastSeg.installStartTime) return { state: "WAITING", ring: String(lastSeg.ringNo), desc: `รอประกอบ Segment`, color: "slate" };
      if (lastSeg.installStartTime && !lastSeg.installEndTime) return { state: "INSTALLING", ring: String(lastSeg.ringNo), desc: `เริ่มประกอบเมื่อ ${formatDisplayTime(lastSeg.installStartTime)} น.`, color: "emerald" };
      return { state: "IN_PROGRESS", ring: String(lastSeg.ringNo), desc: "กำลังทำงาน", color: "blue" };
    }
    return { state: "IDLE", ring: String(offsetRingNo(lastSeg.ringNo, 1)), desc: "รอเริ่มขุดวงถัดไป", color: "slate" };
  }, [segmentRecords]);

  // ══════════════════════════════════════════════
  // SECTION: Grout Pending
  // ══════════════════════════════════════════════

  const groutPending = useMemo(() => {
    const completedSegs = segmentRecords.filter(s => s.status === "Completed");
    const latestSeg = completedSegs.length > 0 ? String(completedSegs[completedSegs.length - 1].ringNo) : "-";
    const latestGrout = groutRecords.length > 0 ? String(groutRecords[groutRecords.length - 1].ringNo) : "-";
    let pending = 0;
    if (latestSeg !== "-" && latestGrout !== "-") {
      pending = Math.max(0, getRingNumeric(latestSeg) - getRingNumeric(latestGrout));
    }
    return { pending, latestSeg, latestGrout };
  }, [segmentRecords, groutRecords]);

  // ══════════════════════════════════════════════
  // SECTION: Day vs Night
  // ══════════════════════════════════════════════

  const shiftComparison = useMemo(() => {
    // Deduplicate ก่อนนับ เพื่อไม่ให้ ring ซ้ำนับ 2 รอบ
    const allDeduped = deduplicateRecords(segmentRecords);
    const permDeduped = allDeduped.filter(r => r.installType !== "Temporary");
    const dayCount = permDeduped.filter(r => (r.installShift || r.shift) === "Day").length;
    const nightCount = permDeduped.filter(r => (r.installShift || r.shift) === "Night").length;
    return [
      { name: "Day Shift", value: dayCount, color: "#fde047" },
      { name: "Night Shift", value: nightCount, color: "#3b82f6" }
    ];
  }, [segmentRecords]);

  // ══════════════════════════════════════════════
  // SECTION: Segment Chart Data
  // ══════════════════════════════════════════════

  const baseSegmentRecords = useMemo(() => {
    let recordsToFilter = segmentRecords;
    if (segFilterShift !== "All") {
      recordsToFilter = segmentRecords.filter(rec => rec.shift === segFilterShift || rec.installShift === segFilterShift || rec.excavShift === segFilterShift);
    }
    return recordsToFilter.filter(rec => {
      const dDate = formatDisplayDate(rec.date);
      if (segFilterMode === "all") return true;
      if (segFilterMode === "daily") return dDate === segFilterDate;
      if (segFilterMode === "monthly") return dDate.startsWith(segFilterMonth);
      if (segFilterMode === "range") {
        if (segRangeStart && dDate < segRangeStart) return false;
        if (segRangeEnd && dDate > segRangeEnd) return false;
        return true;
      }
      return true;
    }).sort((a, b) => {
      const numA = getRingNumeric(a.ringNo);
      const numB = getRingNumeric(b.ringNo);
      if (numA !== numB) return numA - numB;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }, [segmentRecords, segFilterMode, segFilterDate, segFilterMonth, segRangeStart, segRangeEnd, segFilterShift]);

  const segChartData = useMemo(() => {
    // Deduplicate records ก่อน เพื่อไม่ให้ ring ซ้ำนับ 2 ครั้ง
    const dedupedBase = deduplicateRecords(baseSegmentRecords);
    const datesMap = new Map();
    const completedPerms = dedupedBase.filter(r => r.installType !== "Temporary");
    const tempRecords = dedupedBase.filter(r => r.installType === "Temporary");

    completedPerms.forEach(rec => {
      const dDate = formatDisplayDate(rec.date);
      if (!datesMap.has(dDate)) datesMap.set(dDate, { date: dDate, dayRings: 0, nightRings: 0, tempRings: 0, totalRings: 0 });
      const d = datesMap.get(dDate);
      if (rec.shift === "Day" || rec.installShift === "Day") d.dayRings++; else d.nightRings++;
      d.totalRings++;
    });
    tempRecords.forEach(rec => {
      const dDate = formatDisplayDate(rec.date);
      if (!datesMap.has(dDate)) datesMap.set(dDate, { date: dDate, dayRings: 0, nightRings: 0, tempRings: 0, totalRings: 0 });
      datesMap.get(dDate).tempRings++;
    });

    const sorted = Array.from(datesMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    let runningActual = parseFloat(planConfig.baseActualAcc) || 0;
    let runningPlan = parseFloat(planConfig.basePlanAcc) || 0;
    let prevDate = null;

    if (segFilterMode === "daily") {
      let baselineAcc = parseFloat(planConfig.baseActualAcc) || 0;
      const dedupedAll = deduplicateRecords(baseSegmentRecords);
      const sortedDates = [...new Set(dedupedAll.map(r => formatDisplayDate(r.date)))].sort();
      for (const d of sortedDates) {
        if (d < segFilterDate) {
          baselineAcc += dedupedAll.filter(r => formatDisplayDate(r.date) === d && r.installType !== "Temporary").length;
        }
      }
      const dayDeduped = deduplicateRecords(baseSegmentRecords.filter(r => formatDisplayDate(r.date) === segFilterDate));
      const currentDayPlan = getPlanForDate(segFilterDate, planConfig);
      const hourlyData = Array.from({ length: 24 }, (_, i) => ({ displayDate: `${String(i).padStart(2, "0")}:00`, dayRings: 0, nightRings: 0, tempRings: 0, totalRings: 0, plan: currentDayPlan / 24 }));
      dayDeduped.forEach(rec => {
        const timeToUse = rec.installStartTime || rec.startTime;
        if (timeToUse) {
          const hour = parseInt(formatDisplayTime(timeToUse).split(":")[0], 10);
          if (!isNaN(hour) && hour >= 0 && hour <= 23) {
            if (rec.installType === "Temporary") hourlyData[hour].tempRings++;
            else {
              if (rec.shift === "Day" || rec.installShift === "Day") hourlyData[hour].dayRings++;
              else hourlyData[hour].nightRings++;
              hourlyData[hour].totalRings++;
            }
          }
        }
      });
      let curAcc = baselineAcc;
      return hourlyData.map(h => { curAcc += h.totalRings; return { ...h, actualAcc: curAcc }; });
    }

    return sorted.map(day => {
      runningActual += day.dayRings + day.nightRings;
      if (prevDate) {
        let tempD = new Date(prevDate); tempD.setDate(tempD.getDate() + 1);
        let endD = new Date(day.date);
        while (tempD <= endD) { runningPlan += getPlanForDate(tempD.toISOString().split("T")[0], planConfig); tempD.setDate(tempD.getDate() + 1); }
      } else { runningPlan += getPlanForDate(day.date, planConfig); }
      prevDate = day.date;
      return {
        ...day, plan: getPlanForDate(day.date, planConfig),
        displayDate: new Date(day.date).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" }),
        actualAcc: runningActual, planAcc: Math.round(runningPlan * 10) / 10
      };
    });
  }, [baseSegmentRecords, planConfig, segFilterMode, segFilterDate, getPlanForDate]);

  // ══════════════════════════════════════════════
  // SECTION: Distance Chart Data (รายเดือน) — เริ่มนับจาก P36
  // ══════════════════════════════════════════════

  const distanceChartData = useMemo(() => {
    const allDeduped = deduplicateRecords(segmentRecords);
    // เอาเฉพาะ ring ตั้งแต่ P36 เป็นต้นไป (ringNo P36, P37, ...) ที่ไม่ใช่ In Progress
    const fromP36 = allDeduped.filter(r => {
      if (r.status === "In Progress") return false;
      const prefix = String(r.ringNo).replace(/\d/g, '').toUpperCase();
      const num = getRingNumeric(r.ringNo);
      if (prefix === "P" && num >= 36) return true;
      if (prefix === "T" && num >= 36) return true;
      return false;
    });

    fromP36.sort((a, b) => {
      const prefA = String(a.ringNo).replace(/\d/g, '');
      const prefB = String(b.ringNo).replace(/\d/g, '');
      if (prefA !== prefB) return prefA.localeCompare(prefB);
      return getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo);
    });

    const monthsMap = new Map();
    // เพิ่มข้อมูล Actual
    fromP36.forEach(rec => {
      const dDate = formatDisplayDate(rec.date);
      if (!dDate) return;
      const monthKey = dDate.slice(0, 7);
      if (!monthsMap.has(monthKey)) monthsMap.set(monthKey, { month: monthKey, distance: 0, rings: 0, hasActual: true });
      const d = monthsMap.get(monthKey);
      d.distance += parseFloat(rec.length || 0);
      d.rings++;
    });

    // เริ่มสร้าง sequence เดือนตั้งแต่เดือนแรกที่มีข้อมูล
    let minMonth = "2024-11";
    if (monthsMap.size > 0) {
      minMonth = Array.from(monthsMap.keys()).sort()[0];
    }

    // หาเดือนปัจจุบัน (เวลาไทย)
    const now = new Date();
    const nowTH = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    const currentMonth = `${nowTH.getFullYear()}-${String(nowTH.getMonth() + 1).padStart(2, '0')}`;

    // เดือนสุดท้ายของโครงการ: ก.ย. 2028 (ก.ย. 71)
    const projectEndMonth = "2028-09";

    let currentActualAcc = 0;
    let currentPlanAcc = 0;
    let currentMonthStr = minMonth;
    const result = [];

    // สร้างข้อมูลจนถึง ก.ย. 71 เต็มโครงการ
    let loopCount = 0;
    while (currentMonthStr <= projectEndMonth && loopCount < 100) {
      let mData = monthsMap.get(currentMonthStr);
      let distThisMonth = mData ? mData.distance : 0;
      
      // Actual: นับเฉพาะเดือนที่มีข้อมูลจริงหรือเดือนที่ผ่านมาแล้ว
      if (currentMonthStr <= currentMonth) {
        currentActualAcc += distThisMonth;
      }

      // คำนวณ Plan สำหรับเดือนนี้
      let monthPlan = 0;
      if (distPlanConfig.ranges && distPlanConfig.ranges.length > 0) {
        for (const range of distPlanConfig.ranges) {
          if ((!range.startMonth || currentMonthStr >= range.startMonth) && (!range.endMonth || currentMonthStr <= range.endMonth)) {
            if (range.mode === "distance") {
              monthPlan = parseFloat(range.distancePerMonth) || 0;
            } else {
              const ringsPerDay = parseFloat(range.ringsPerDay) || 0;
              const avgLen = parseFloat(range.avgLength) || 1.2;
              monthPlan = ringsPerDay * avgLen * 30;
            }
            break;
          }
        }
      }
      currentPlanAcc += monthPlan;
      if (currentPlanAcc > TOTAL_ROUTE_DISTANCE) currentPlanAcc = TOTAL_ROUTE_DISTANCE;

      const [y, mo] = currentMonthStr.split("-");
      const thMonths = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
      const buddhistYear = (parseInt(y) + 543).toString().slice(-2);
      const displayMonth = `${thMonths[parseInt(mo) - 1]} ${buddhistYear}`;

      // Actual: เดือนอนาคตไม่แสดงจุด
      const isActualAvailable = currentMonthStr <= currentMonth;

      result.push({
        month: currentMonthStr,
        displayMonth,
        actualAcc: isActualAvailable ? (currentActualAcc > 0 ? Math.round(currentActualAcc * 10) / 10 : (mData ? 0 : 0)) : null,
        planAcc: Math.round(currentPlanAcc * 10) / 10,
        hasActual: !!mData,
        isFuture: currentMonthStr > currentMonth
      });

      // Next month
      let ny = parseInt(y);
      let nm = parseInt(mo) + 1;
      if (nm > 12) { nm = 1; ny++; }
      currentMonthStr = `${ny}-${String(nm).padStart(2, '0')}`;
      loopCount++;
    }

    return result;
  }, [segmentRecords, distPlanConfig]);

  // Filter ตามช่วงเดือน
  const filteredDistanceChartData = useMemo(() => {
    if (distFilterMode === "all" || !distRangeStart || !distRangeEnd) return distanceChartData;
    return distanceChartData.filter(d => d.month >= distRangeStart && d.month <= distRangeEnd);
  }, [distanceChartData, distFilterMode, distRangeStart, distRangeEnd]);

  // ระยะสะสมรวม (ทั้งหมด ไม่ filter) สำหรับ TBM position + summary
  const totalActualDistance = useMemo(() => {
    // หาค่า actualAcc ล่าสุดที่ไม่ใช่ null
    for (let i = distanceChartData.length - 1; i >= 0; i--) {
      if (distanceChartData[i].actualAcc !== null && distanceChartData[i].actualAcc > 0) {
        return distanceChartData[i].actualAcc;
      }
    }
    return 0;
  }, [distanceChartData]);

  const totalPlanDistance = useMemo(() => {
    // ใช้ planAcc ณ เดือนปัจจุบัน (ไม่ใช่เดือนสุดท้ายของโครงการ)
    const now = new Date();
    const nowTH = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    const currentMonth = `${nowTH.getFullYear()}-${String(nowTH.getMonth() + 1).padStart(2, '0')}`;
    
    const currentMonthData = distanceChartData.find(d => d.month === currentMonth);
    if (currentMonthData) return currentMonthData.planAcc;
    
    // fallback: หาเดือนที่ใกล้เคียงที่สุดที่ไม่เกินเดือนปัจจุบัน
    for (let i = distanceChartData.length - 1; i >= 0; i--) {
      if (distanceChartData[i].month <= currentMonth) {
        return distanceChartData[i].planAcc;
      }
    }
    return 0;
  }, [distanceChartData]);

  // Delay warning
  const distanceDelay = useMemo(() => {
    if (totalPlanDistance <= 0) return null;
    const diff = totalPlanDistance - totalActualDistance;
    if (diff <= 0) return null;
    const ratePerMonth = 300;
    const monthsDelay = diff / ratePerMonth;
    return { diff: Math.round(diff * 100) / 100, months: Math.round(monthsDelay * 100) / 100, rate: ratePerMonth };
  }, [totalActualDistance, totalPlanDistance]);

  // คำนวณตำแหน่ง X (%) ของสถานีบน Route Progress โดยใช้ระยะจริง
  const routeStationPlacements = useMemo(() => {
    return ROUTE_SEGMENTS.map(seg => {
      const xPercent = TOTAL_ROUTE_DISTANCE > 0 ? (seg.distance / TOTAL_ROUTE_DISTANCE) * 100 : 0;
      return { ...seg, xPercent: Math.min(100, Math.max(0, xPercent)) };
    });
  }, []);


  // ══════════════════════════════════════════════
  // SECTION: Grout Chart Data
  // ══════════════════════════════════════════════

  const groutChartData = useMemo(() => {
    let baseData = groutFilterShift === "All" ? groutRecords : groutRecords.filter(r => r.shift === groutFilterShift);
    baseData = baseData.map(r => ({ ...r, displayRing: r.groutPass === "Re-Grout" ? `${r.ringNo} (Re)` : r.ringNo }));

    if (groutFilterMode === "all") return baseData;
    if (groutFilterMode === "range" && groutRangeStart && groutRangeEnd) {
      const sn = getRingNumeric(groutRangeStart), en = getRingNumeric(groutRangeEnd);
      return baseData.filter(r => { const n = getRingNumeric(r.ringNo); return n >= sn && n <= en; }).sort((a, b) => getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo));
    }
    if (groutFilterMode === "daily") return baseData.filter(r => r.date && r.date.startsWith(groutFilterDate));
    if (groutFilterMode === "monthly") return baseData.filter(r => r.date && r.date.startsWith(groutFilterMonth));
    // lastN
    const start = Math.max(0, baseData.length - groutChartWindow);
    return baseData.slice(start);
  }, [groutRecords, groutFilterMode, groutChartWindow, groutRangeStart, groutRangeEnd, groutFilterDate, groutFilterMonth, groutFilterShift]);

  // ── Plan settings handlers ──
  const handleSavePlanSettings = () => { localStorage.setItem('tbmPlanConfig', JSON.stringify(planConfig)); setShowPlanModal(false); };
  const addPlanRange = () => setPlanConfig({ ...planConfig, ranges: [...(planConfig.ranges || []), { start: "", end: "", dailyPlan: 0 }] });
  const removePlanRange = (index) => { const r = [...(planConfig.ranges || [])]; r.splice(index, 1); setPlanConfig({ ...planConfig, ranges: r }); };

  // ── Distance Plan settings handlers ──
  const handleSaveDistPlanSettings = () => { localStorage.setItem('tbmDistancePlanConfig', JSON.stringify(distPlanConfig)); setShowDistPlanModal(false); };
  const addDistPlanRange = () => setDistPlanConfig({ ...distPlanConfig, ranges: [...(distPlanConfig.ranges || []), { startMonth: "", endMonth: "", mode: "rings", ringsPerDay: 0, avgLength: 1.2, distancePerMonth: 0 }] });
  const removeDistPlanRange = (index) => { const r = [...(distPlanConfig.ranges || [])]; r.splice(index, 1); setDistPlanConfig({ ...distPlanConfig, ranges: r }); };

  // ── Filter button helper ──
  const FilterBtn = ({ active, onClick, children, color = "emerald" }) => (
    <button onClick={onClick} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${active ? `bg-${color}-600 text-white shadow` : "text-slate-500 hover:bg-slate-50"}`}>{children}</button>
  );

  const SHIFT_COLORS = ["#fde047", "#3b82f6"];

  return (
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-fade-in pb-24">

      {/* ═══ SECTION 1: Project Header + Live Status ═══ */}
      <div className={`rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xl ${liveStatus.state === "EXCAVATING" ? "bg-gradient-to-br from-amber-500 to-orange-600" :
        liveStatus.state === "INSTALLING" ? "bg-gradient-to-br from-emerald-500 to-teal-600" :
          liveStatus.state === "WAITING" ? "bg-gradient-to-br from-slate-600 to-slate-800" :
            "bg-gradient-to-br from-blue-600 to-indigo-700"
        }`}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            {liveStatus.state !== "IDLE" && <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span></span>}
            <span className="text-xs font-extrabold uppercase tracking-widest opacity-90">TBM1 Executive Dashboard</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black mb-1 tracking-tight drop-shadow-sm">
            {liveStatus.state === "EXCAVATING" && "กำลังขุดเจาะดิน"}
            {liveStatus.state === "INSTALLING" && "กำลังประกอบ Ring"}
            {liveStatus.state === "WAITING" && "ขุดเจาะเสร็จ รอประกอบ"}
            {liveStatus.state === "IDLE" && "เครื่องจักรจอดพัก"}
            {liveStatus.state === "IN_PROGRESS" && "กำลังทำงาน"}
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-lg sm:text-xl font-bold opacity-90">
            <span>Ring: <span className="bg-white/20 px-3 py-0.5 rounded-xl backdrop-blur-sm">{liveStatus.ring}</span></span>
            <span className="hidden sm:inline opacity-60">|</span>
            <span className="flex items-center gap-1.5"><Clock size={16} className="opacity-80" /> {liveStatus.desc}</span>
          </div>
        </div>
      </div>

      {/* ═══ SECTION 2: KPI Summary Cards ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Permanent Rings" value={overallStats.permRings} subtext={`+ ${overallStats.tempRings} Temp. (Total: ${overallStats.totalRings})`} color="text-emerald-600" icon={Layers} />
        <StatCard label="Total Distance" value={`${Number(overallStats.totalDistance || 0).toFixed(2)} m`} subtext={`ดินขุดรวม: ${Number(overallStats.totalSoilVol || 0).toFixed(2)} m³`} color="text-blue-600" icon={TrendingUp} />
        <StatCard label="Daily Average" value={`${overallStats.avgRings} Rings`} subtext={`~ ${overallStats.avgDist} m / day`} color="text-orange-500" icon={Activity} />
        <StatCard label="Current Position" value={overallStats.currentCH} subtext="Latest Finish CH." color="text-indigo-600" icon={MapPin} />
        <StatCard label="Grout Avg Volume" value={`${overallStats.groutAvgVol} m³`} subtext={`ล่าสุด: ${overallStats.latestGroutRing} (${overallStats.uniqueGroutedRings} วง)`} color="text-cyan-600" icon={Droplet} />
        <div className={`bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden`}>
          <div className="flex items-start justify-between">
            <div className={`p-2.5 rounded-2xl bg-slate-50 shadow-sm border border-slate-100 ${Number(overallStats.groutAvgRatio) >= 100 ? "text-emerald-500" : "text-red-500"}`}><BarChart3 size={22} /></div>
          </div>
          <div className="mt-3">
            <div className={`text-2xl sm:text-3xl font-black tracking-tight ${Number(overallStats.groutAvgRatio) > 150 ? "text-purple-500" : Number(overallStats.groutAvgRatio) >= 100 ? "text-emerald-500" : "text-red-500"}`}>
              {overallStats.groutAvgRatio}%
            </div>
            <div className="text-[10px] sm:text-xs text-slate-500 font-bold mt-1">Grout Avg Ratio</div>
          </div>
        </div>
      </div>

      {/* ═══ SECTION 5: Grout Pending & Section 6: Shift Comparison ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Grout Pending */}
        <div className={`rounded-3xl p-6 shadow-sm border relative overflow-hidden ${groutPending.pending > 0 ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-slate-800 text-base flex items-center gap-2"><Droplet size={20} className={groutPending.pending > 0 ? "text-red-500" : "text-emerald-500"} /> Grout Status</h3>
            <span className={`text-3xl font-black ${groutPending.pending > 0 ? "text-red-500" : "text-emerald-500"}`}>
              {groutPending.pending > 0 ? `${groutPending.pending} วงค้าง` : "ครบถ้วน ✓"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-white/80 p-3 rounded-2xl border border-slate-100">
              <div className="text-xs font-bold text-slate-400 uppercase mb-1">Segment ล่าสุด</div>
              <div className="font-black text-slate-800 text-lg">{groutPending.latestSeg}</div>
            </div>
            <div className="bg-white/80 p-3 rounded-2xl border border-slate-100">
              <div className="text-xs font-bold text-slate-400 uppercase mb-1">Grout ล่าสุด</div>
              <div className="font-black text-slate-800 text-lg">{groutPending.latestGrout}</div>
            </div>
          </div>
        </div>

        {/* Day vs Night */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-black text-slate-800 text-base mb-2">Day vs Night Shift</h3>
          <div className="flex items-center gap-4">
            <div className="w-32 h-32 sm:w-36 sm:h-36 shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={shiftComparison} cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={4} dataKey="value" stroke="none">
                    {shiftComparison.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} itemStyle={{ fontSize: "12px", fontWeight: "bold" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-3">
              {shiftComparison.map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-4 h-4 rounded shrink-0" style={{ backgroundColor: s.color }}></span>
                  <div className="flex-1">
                    <div className="text-xs font-bold text-slate-500">{s.name}</div>
                    <div className="text-xl font-black text-slate-800">{s.value} <span className="text-xs font-bold text-slate-400">Rings</span></div>
                  </div>
                  <div className="text-sm font-bold text-slate-400">
                    {(shiftComparison[0].value + shiftComparison[1].value) > 0
                      ? ((s.value / (shiftComparison[0].value + shiftComparison[1].value)) * 100).toFixed(0) : 0}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ SECTION 3: Segment Installation Trend ═══ */}
      <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 flex items-center gap-2 tracking-tight">
            <TrendingUp className="text-emerald-600" size={28} /> Ring Progress
          </h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">TBM1 Segment Installation Tracking</p>
        </div>
        <div className="flex gap-4 text-xs font-bold bg-slate-50 p-3 rounded-2xl border border-slate-100 w-full md:w-auto justify-between sm:justify-start shadow-inner">
          <div className="flex flex-col items-center"><span className="w-4 h-4 rounded bg-yellow-300 mb-1.5 shadow-sm"></span>Day</div>
          <div className="flex flex-col items-center"><span className="w-4 h-4 rounded bg-blue-500 mb-1.5 shadow-sm"></span>Night</div>
          {segFilterMode !== "daily" && <>
            <div className="flex flex-col items-center"><span className="w-5 h-1 rounded-full bg-black mt-2 mb-1.5"></span>Plan</div>
            <div className="flex flex-col items-center"><span className="w-5 h-1 rounded-full bg-red-500 mt-2 mb-1.5"></span>Actual</div>
          </>}
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 sm:p-8 overflow-hidden">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-slate-800 text-lg">Installation Trend</h3>
            <div className="flex bg-slate-50 border border-slate-100 rounded-lg p-0.5 shadow-sm">
              <button onClick={() => setExpandedChart('segment')} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-white rounded-md transition-colors" title="Expand Chart"><Maximize2 size={16} /></button>
              <button onClick={() => setShowPlanModal(true)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-white rounded-md transition-colors" title="Plan Settings"><Settings size={16} /></button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center w-full lg:w-auto bg-slate-50 p-2 rounded-xl border border-slate-100">
            <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm w-full sm:w-auto overflow-x-auto">
              {["all", "daily", "monthly", "range"].map(m => (
                <button key={m} onClick={() => setSegFilterMode(m)} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${segFilterMode === m ? "bg-emerald-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>{m === "all" ? "All" : m === "daily" ? "Daily" : m === "monthly" ? "Monthly" : "Range"}</button>
              ))}
            </div>
            {segFilterMode === "daily" && <input type="date" value={segFilterDate} onChange={e => setSegFilterDate(e.target.value)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-700 w-full sm:w-auto" />}
            {segFilterMode === "monthly" && <input type="month" value={segFilterMonth} onChange={e => setSegFilterMonth(e.target.value)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-700 w-full sm:w-auto" />}
            {segFilterMode === "range" && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input type="date" value={segRangeStart} onChange={e => setSegRangeStart(e.target.value)} className="px-2 py-1.5 flex-1 sm:flex-none sm:w-[120px] text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-700" />
                <span className="text-slate-400">-</span>
                <input type="date" value={segRangeEnd} onChange={e => setSegRangeEnd(e.target.value)} className="px-2 py-1.5 flex-1 sm:flex-none sm:w-[120px] text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-700" />
              </div>
            )}
            <div className="w-px h-6 bg-slate-200 hidden sm:block"></div>
            <select value={segFilterShift} onChange={e => setSegFilterShift(e.target.value)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-700 bg-white cursor-pointer w-full sm:w-auto">
              <option value="All">All Shifts</option><option value="Day">Day Shift</option><option value="Night">Night Shift</option>
            </select>
          </div>
        </div>

        <div className="h-[350px] sm:h-[500px] w-full">
          <div className="w-full h-full">
            <ResponsiveContainer>
              <ComposedChart data={segChartData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="displayDate" tick={{ fontSize: 10, fill: "#64748b", fontWeight: 500 }} angle={-45} textAnchor="end" height={60} />
                <YAxis yAxisId="left" domain={[0, segFilterMode === "daily" ? "auto" : 10]} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                {segFilterMode !== "daily" && <YAxis yAxisId="right" orientation="right" domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />}
                <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} itemStyle={{ fontSize: "11px", fontWeight: "bold" }} />
                {segFilterMode !== "daily" && <Line yAxisId="left" type="monotone" dataKey="plan" stroke="#94a3b8" strokeWidth={2} dot={segChartData.length <= 24 ? { r: 0 } : { r: 2 }} name="Plan Daily" />}
                <Bar yAxisId="left" dataKey="dayRings" stackId="a" fill="#fde047" name="Perm. D/S" radius={[0, 0, 0, 0]} maxBarSize={40} />
                <Bar yAxisId="left" dataKey="nightRings" stackId="a" fill="#3b82f6" name="Perm. N/S" radius={[0, 0, 0, 0]} maxBarSize={40} />
                <Bar yAxisId="left" dataKey="tempRings" stackId="a" fill="#cbd5e1" name="Temporary" radius={[4, 4, 0, 0]} maxBarSize={40} />
                {segFilterMode !== "daily" && <Line yAxisId="right" type="monotone" dataKey="planAcc" stroke="#0f172a" strokeWidth={2} dot={segChartData.length === 1 ? { r: 3, fill: "#0f172a" } : { r: 2, fill: "#0f172a" }} name="Plan Acc." />}
                {segFilterMode !== "daily" && <Line yAxisId="right" type="monotone" dataKey="actualAcc" stroke="#ef4444" strokeWidth={3} dot={segChartData.length === 1 ? { r: 4, fill: "#ef4444" } : { r: 3, fill: "#ef4444" }} name="Actual Acc." label={{ position: "top", fill: "#ef4444", fontSize: 10, fontWeight: "900" }} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ═══ SECTION 3.5: รายงานความก้าวหน้างานขุดเจาะอุโมงค์ TBM1 — แบ่ง 3 ส่วน ═══ */}
      <div className="bg-white p-4 sm:p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-2">
        {/* Header แถวที่ 1 */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-[#2e266a] tracking-tight">
              รายงานความก้าวหน้างานขุดเจาะอุโมงค์ TBM1
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 italic">
              Route Line Tunnel: อาคารรับน้ำคลองประปาชาคร ตอนถนนรัชดาภิเษก IS4-1 → อาคารรับน้ำคลองประปาชาคร ตอนคลองบางเขน IS3
            </p>
          </div>
          <div className="text-right mt-4 md:mt-0 flex items-center gap-3">
            <button onClick={() => setExpandedChart('distance')} className="p-2 text-slate-400 hover:text-blue-600 bg-white hover:bg-blue-50 rounded-xl transition-colors border border-slate-200 shadow-sm" title="Expand Chart"><Maximize2 size={18} /></button>
            <span className="bg-[#2e266a] text-white text-xs font-bold px-4 py-2 rounded-xl shadow-md">
              อัปเดตล่าสุด: {formatDisplayDate(new Date())}
            </span>
          </div>
        </div>

        {/* Header แถวที่ 2: Legends และ Delay Warning */}
        <div className="flex flex-col lg:flex-row justify-between items-center bg-slate-50 p-3 rounded-2xl border border-slate-100">
          <div className="flex flex-wrap gap-6 items-center w-full lg:w-auto justify-center">
            <div className="flex items-center gap-2">
              <span className="w-8 h-1 bg-[#ec4899] rounded-full"></span>
              <span className="text-sm font-bold text-slate-700">Actual Acc. (ผลงานจริงสะสม)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-0.5"><span className="w-3 h-3 rounded-full bg-[#8b5cf6]"></span><span className="w-5 h-1 bg-[#8b5cf6] rounded-full"></span></span>
              <span className="text-sm font-bold text-slate-700">Plan Acc. (แผนงานสะสม)</span>
            </div>
            <button onClick={() => setShowDistPlanModal(true)} className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-100 rounded-lg transition-colors border border-transparent shadow-sm" title="Distance Plan Settings"><Settings size={18} /></button>
          </div>

          {/* Project Delay Warning Box */}
          {distanceDelay && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 px-4 py-2 rounded-xl shadow-sm mt-4 lg:mt-0 lg:ml-auto">
              <div className="w-8 h-8 rounded-full bg-red-100 flex justify-center items-center overflow-hidden border border-red-200">
                <span className="text-[#9b1c1c] font-black text-lg">!</span>
              </div>
              <div className="text-left">
                <p className="text-[10px] font-black text-red-600 mb-0.5 tracking-widest uppercase">Project Delay Warning</p>
                <p className="text-xs font-bold text-slate-700">
                  ล่าช้ากว่าแผน: <span className="text-[#ec4899]">{distanceDelay.diff.toLocaleString()} ม.</span>
                  <span className="text-[10px] text-slate-500 font-medium ml-1">({distanceDelay.months} เดือน)</span>
                  <span className="text-[10px] text-red-400 font-medium ml-1">(คิดที่ {distanceDelay.rate} ม./เดือน)</span>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ═══ ส่วนที่ 1: กราฟเส้น (Line Chart) — เปรียบเทียบแผนกับผลงานจริง ═══ */}
        <div className="h-[380px] sm:h-[460px] w-full relative z-10">
          <div className="w-full h-full pl-2 pr-4 sm:pr-8">
            <ResponsiveContainer>
              <ComposedChart data={filteredDistanceChartData} margin={{ top: 35, right: 30, left: 10, bottom: 15 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="displayMonth" 
                  tick={{ fontSize: 10, fill: "#475569", fontWeight: 700 }} 
                  angle={-45} 
                  textAnchor="end" 
                  height={80} 
                  tickMargin={15}
                  axisLine={{ stroke: "#000", strokeWidth: 1 }}
                  interval={0}
                  label={{ value: "เดือน/ปี", position: "insideBottomRight", offset: -5, style: { fontSize: 11, fill: "#475569", fontWeight: "bold" } }}
                />
                <YAxis 
                  domain={[0, 10000]} 
                  ticks={[0, 2500, 5000, 7500, 10000]}
                  tick={{ fontSize: 11, fill: "#475569", fontWeight: 700 }} 
                  axisLine={{ stroke: "#000", strokeWidth: 1 }}
                  tickLine={{ stroke: "#000" }} 
                  label={{ value: "ระยะทาง (เมตร)", angle: 0, position: "top", offset: 20, style: { fontSize: 11, fill: "#475569", fontWeight: "bold" } }} 
                  width={60}
                  tickFormatter={val => val.toLocaleString()}
                />
                <Tooltip
                  contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                  itemStyle={{ fontSize: "12px", fontWeight: "bold" }}
                  labelStyle={{ fontSize: "11px", color: "#64748b", fontWeight: "bold", marginBottom: "4px" }}
                  formatter={(val, name) => {
                    if (val === null || val === undefined) return ['-', name === "planAcc" ? "แผนงานสะสม" : "ผลงานจริงสะสม"];
                    return [`${Number(val).toLocaleString()} m`, name === "planAcc" ? "แผนงานสะสม" : "ผลงานจริงสะสม"];
                  }}
                />

                {/* เส้น Plan — แสดงเต็มจนถึง ก.ย. 71 */}
                <Line 
                  type="monotone" 
                  dataKey="planAcc" 
                  stroke="#8b5cf6" 
                  strokeWidth={3} 
                  connectNulls={false}
                  activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    if (cx === undefined || cy === undefined) return null;
                    return (
                      <g key={`dot-plan-${payload.month}`}>
                        <circle cx={cx} cy={cy} r={4} fill="#8b5cf6" />
                        {payload.planAcc > 0 && <text x={cx} y={cy - 12} fill="#8b5cf6" fontSize={9} fontWeight="black" textAnchor="middle">{payload.planAcc.toLocaleString(undefined, {maximumFractionDigits:0})}</text>}
                      </g>
                    );
                  }}
                />
                
                {/* เส้น Actual — หยุดที่เดือนปัจจุบัน */}
                <Line 
                  type="monotone" 
                  dataKey="actualAcc" 
                  stroke="#ec4899" 
                  strokeWidth={3} 
                  connectNulls={true}
                  activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    if (payload.actualAcc === null || payload.actualAcc === undefined || cx === undefined || cy === undefined) return null;
                    return (
                      <g key={`dot-act-${payload.month}`}>
                        <rect x={cx - 4} y={cy - 4} width={8} height={8} fill="#ec4899" rx={1} />
                        {payload.actualAcc > 0 && <text x={cx} y={cy + 18} fill="#ec4899" fontSize={9} fontWeight="black" textAnchor="middle">{payload.actualAcc.toLocaleString(undefined, {maximumFractionDigits:0})}</text>}
                      </g>
                    );
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ═══ ส่วนที่ 2: Progress Bar — เปรียบเทียบแผน vs ผลงาน ณ เดือนปัจจุบัน ═══ */}
        <div className="relative min-w-[700px] overflow-hidden bg-slate-50/80 border border-slate-200 rounded-2xl p-4 shadow-sm">
          {/* หัวข้อ + ระยะทางรวม */}
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-black text-slate-600 uppercase tracking-wider">เปรียบเทียบ ณ เดือนปัจจุบัน</span>
            <span className="text-[11px] font-bold text-slate-500">ระยะโครงการ: <span className="text-slate-800 font-black">{TOTAL_ROUTE_DISTANCE.toLocaleString()} ม.</span></span>
          </div>
          
          <div className="flex flex-col gap-3 relative z-20">
            {/* แผนงานสะสม ณ เดือนปัจจุบัน */}
            <div className="flex items-center h-[38px]">
              <span className="w-32 text-xs font-bold text-slate-800 shrink-0">แผนงานสะสม</span>
              <div className="flex-1 h-full rounded-md border border-slate-200 relative overflow-hidden bg-slate-100">
                {totalPlanDistance > 0 ? (
                  <>
                    <div 
                      className="h-full bg-[#9b1c1c] rounded-md flex items-center justify-end px-3 relative z-10 shadow-sm border border-red-900 transition-all duration-700" 
                      style={{ width: `${Math.max((totalPlanDistance / TOTAL_ROUTE_DISTANCE) * 100, 5)}%` }}
                    >
                      <span className="text-white text-xs font-black drop-shadow-md whitespace-nowrap">{totalPlanDistance.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                    </div>
                    {/* ส่วนเหลือของโครงการ (สีจาง) */}
                    <div className="absolute top-0 right-2 h-full flex items-center z-0">
                      <span className="text-[9px] font-bold text-slate-400">{TOTAL_ROUTE_DISTANCE.toLocaleString()}</span>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-slate-500 text-xs font-bold">ยังไม่ตั้งค่าแผน — กดปุ่ม ⚙️ เพื่อตั้งค่า</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* ผลงานจริง */}
            <div className="flex items-center h-[38px] relative">
              <span className="w-32 text-xs font-bold text-slate-800 shrink-0">ผลงานจริง</span>
              <div className="flex-1 h-full rounded-md border border-slate-200 relative overflow-hidden bg-slate-100">
                {(() => {
                  const planPercent = totalPlanDistance > 0 ? (totalPlanDistance / TOTAL_ROUTE_DISTANCE) * 100 : 0;
                  const actualPercent = (totalActualDistance / TOTAL_ROUTE_DISTANCE) * 100;
                  const gapWidth = planPercent - actualPercent;
                  
                  return (
                    <>
                      {/* ส่วนที่ทำได้ (สีเขียว) */}
                      {totalActualDistance > 0 && (
                        <div 
                          className="absolute top-0 left-0 h-full bg-emerald-500 flex items-center justify-center z-10 shadow-sm transition-all duration-700" 
                          style={{ width: `${Math.max(actualPercent, 3)}%`, borderRight: totalPlanDistance > 0 ? '2px solid #1e293b' : 'none' }}
                        >
                          <span className="text-white text-[10px] font-black whitespace-nowrap px-1 drop-shadow-md">
                            {totalActualDistance.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                          </span>
                        </div>
                      )}
                      {/* ส่วนที่ยังขาดจากแผน (ลายขวาง) */}
                      {totalPlanDistance > 0 && gapWidth > 0 && (
                        <div 
                          className="absolute top-0 h-full flex items-center justify-center z-5" 
                          style={{ 
                            left: `${actualPercent}%`, 
                            width: `${gapWidth}%`,
                            backgroundImage: "repeating-linear-gradient(45deg, #fecaca 0px, #fecaca 6px, #fff 6px, #fff 12px)" 
                          }}
                        >
                          <span className="text-red-700 text-[9px] font-black bg-white/90 px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap border border-red-200 z-10 relative">
                            -{(totalPlanDistance - totalActualDistance).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                          </span>
                        </div>
                      )}
                      {/* ส่วนเหลือของโครงการ */}
                      <div className="absolute top-0 right-2 h-full flex items-center z-0">
                        <span className="text-[9px] font-bold text-slate-400">{TOTAL_ROUTE_DISTANCE.toLocaleString()}</span>
                      </div>
                      {/* ไม่มีผลงานเลย */}
                      {totalActualDistance === 0 && (
                        <div className="w-full h-full flex items-center justify-center z-20 relative">
                          <span className="text-slate-400 text-[10px] font-bold">ยังไม่มีผลงาน</span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ ส่วนที่ 3: Route Progress — แสดงเต็มเส้นทาง ═══ */}
        <div className="relative min-w-[700px] overflow-hidden bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <style>{`
            .track-pattern {
              background-image: repeating-linear-gradient(90deg, transparent, transparent 15px, #94a3b8 15px, #94a3b8 18px);
            }
          `}</style>

          <div className="flex justify-between items-center mb-2">
            <span className="text-[#64748b] text-[11px] font-black tracking-[0.2em] uppercase">Route Progress</span>
          </div>

          <div className="relative mx-4 sm:mx-8" style={{ height: '85px' }}>
            {/* แถบราง */}
            <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[18px] bg-[#f1f5f9] border-y-[3px] border-[#64748b] track-pattern opacity-100 shadow-sm z-0"></div>
            
            {/* พื้นที่ของผลงานจริง */}
            <div 
              className="absolute top-1/2 -translate-y-1/2 left-0 h-[32px] bg-[#ec4899]/20 border border-[#ec4899]/40 rounded-l-full z-1 transition-all duration-1000"
              style={{ width: `${Math.min((totalActualDistance / TOTAL_ROUTE_DISTANCE) * 100, 100)}%` }}
            ></div>

            {/* หมุดสถานี */}
            {routeStationPlacements.map((seg, i) => {
              if (i === 0) return null;
              const prevSeg = routeStationPlacements[i - 1];
              return (
                <React.Fragment key={`route-${seg.id}`}>
                  {/* กรอบแสดงระยะระหว่างสถานี */}
                  <div 
                    className="absolute -top-6 -translate-x-1/2 bg-white border-2 border-slate-700 rounded-full px-2 py-0.5 text-[9px] font-black text-slate-700 shadow-sm whitespace-nowrap z-10"
                    style={{ left: `${(prevSeg.xPercent + seg.xPercent) / 2}%` }}
                  >
                    {((seg.distance - ROUTE_SEGMENTS[i - 1].distance)).toLocaleString(undefined, { minimumFractionDigits: 3 })} m
                  </div>
                  
                  {/* หมุดสถานี */}
                  <div 
                    className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center justify-center z-20"
                    style={{ left: `${seg.xPercent}%`, transform: 'translateX(-50%) translateY(-50%)' }}
                  >
                    <div className="relative w-9 h-9 rounded-full border-[4px] border-white shadow-lg bg-[#8b5cf6] text-white flex items-center justify-center text-[10px] font-black z-10 tracking-tighter">
                      {seg.label.replace("IS", "")}
                    </div>
                    <span className="absolute top-11 text-[10px] font-bold text-slate-700 whitespace-nowrap">{seg.label}</span>
                  </div>
                </React.Fragment>
              );
            })}
            
            {/* หมุดสถานีแรก (ซ้ายสุด) */}
            <div className="absolute top-1/2 -translate-y-1/2 left-0 -translate-x-1/2 flex flex-col items-center justify-center z-20">
              <div className="relative w-9 h-9 rounded-full border-[4px] border-white shadow-lg bg-[#8b5cf6] text-white flex items-center justify-center text-[10px] font-black z-10 tracking-tighter">
                {ROUTE_SEGMENTS[0].label.replace("IS", "")}
              </div>
              <span className="absolute top-11 text-[10px] font-bold text-slate-700 whitespace-nowrap">{ROUTE_SEGMENTS[0].label}</span>
            </div>

            {/* หมุดสถานีปัจจุบัน (TBM) */}
            <div 
              className="absolute top-1/2 -translate-y-1/2 z-30 transition-all duration-[1500ms] ease-out"
              style={{ left: `${Math.min((totalActualDistance / TOTAL_ROUTE_DISTANCE) * 100, 100)}%`, transform: 'translateX(-50%) translateY(-50%)' }}
            >
              <div className="relative drop-shadow-xl group cursor-pointer">
                <span className="absolute -inset-2 rounded-full bg-[#ec4899] opacity-40 animate-ping"></span>
                <div className="w-8 h-8 bg-[#0ea5e9] border-[3px] border-white flex items-center justify-center rounded-sm rotate-90 relative z-10 shadow-md overflow-hidden">
                  <div className="w-full h-[60%] bg-[#0284c7] absolute bottom-0 left-0"></div>
                  <div className="w-full h-[2px] bg-white opacity-50 absolute top-[40%] left-0"></div>
                  <span className="text-[8px] text-white font-black z-10 -rotate-90">TBM1</span>
                </div>
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-3 py-1.5 rounded-lg font-bold whitespace-nowrap shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-40">
                  TBM1: {totalActualDistance.toLocaleString()} m ({(totalActualDistance / TOTAL_ROUTE_DISTANCE * 100).toFixed(1)}%)
                </div>
              </div>
            </div>
          </div>
          {/* spacer below route */}
          <div className="h-8"></div>
        </div>
      </div>

      {/* ═══ SECTION 4: Grout Volume Trend ═══ */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 sm:p-8">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2"><Droplet className="text-blue-500" size={22} /> Grout Volume Trend</h3>
            <button onClick={() => setExpandedChart('grout')} className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 rounded-lg transition-colors border border-slate-100 shadow-sm" title="Expand Chart"><Maximize2 size={16} /></button>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center w-full lg:w-auto bg-slate-50 p-2 rounded-xl border border-slate-100">
            <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm w-full sm:w-auto overflow-x-auto">
              {["all", "lastN", "daily", "monthly", "range"].map(m => (
                <button key={m} onClick={() => setGroutFilterMode(m)} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-bold transition whitespace-nowrap ${groutFilterMode === m ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>{m === "all" ? "All" : m === "lastN" ? "Last N" : m === "daily" ? "Daily" : m === "monthly" ? "Monthly" : "Range"}</button>
              ))}
            </div>
            {groutFilterMode === "lastN" && (
              <div className="flex gap-1 w-full sm:w-auto overflow-x-auto">
                {[10, 20, 50, 100].map(val => (
                  <button key={val} onClick={() => setGroutChartWindow(val)} className={`px-3 py-1.5 text-xs rounded-md font-medium border transition whitespace-nowrap ${groutChartWindow === val ? "bg-blue-100 border-blue-200 text-blue-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>Last {val}</button>
                ))}
              </div>
            )}
            {groutFilterMode === "daily" && <input type="date" value={groutFilterDate} onChange={e => setGroutFilterDate(e.target.value)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 w-full sm:w-auto" />}
            {groutFilterMode === "monthly" && <input type="month" value={groutFilterMonth} onChange={e => setGroutFilterMonth(e.target.value)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 w-full sm:w-auto" />}
            {groutFilterMode === "range" && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input type="text" value={groutRangeStart} onChange={e => setGroutRangeStart(e.target.value)} placeholder="P1" className="px-2 py-1.5 w-full sm:w-16 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none uppercase text-slate-700 text-center" />
                <span className="text-slate-400">-</span>
                <input type="text" value={groutRangeEnd} onChange={e => setGroutRangeEnd(e.target.value)} placeholder="P10" className="px-2 py-1.5 w-full sm:w-16 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none uppercase text-slate-700 text-center" />
              </div>
            )}
            <div className="w-px h-6 bg-slate-200 hidden sm:block"></div>
            <select value={groutFilterShift} onChange={e => setGroutFilterShift(e.target.value)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 bg-white cursor-pointer w-full sm:w-auto">
              <option value="All">All Shifts</option><option value="Day">Day Shift</option><option value="Night">Night Shift</option>
            </select>
          </div>
        </div>

        <div className="h-[350px] sm:h-[400px] w-full">
          <ResponsiveContainer>
            <AreaChart data={groutChartData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="execColorTotal" x1="0" y1="0" x2="0" y2="1">
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
              <Area type="monotone" dataKey="total" stroke="#3B82F6" strokeWidth={3} fill="url(#execColorTotal)" dot={{ r: 4, fill: "#3B82F6", stroke: "#fff", strokeWidth: 2 }} label={{ position: "top", fill: "#475569", fontSize: 9, fontWeight: 600, formatter: val => Number(val || 0).toFixed(2) }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ═══ Plan Settings Modal ═══ */}
      {showPlanModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-slate-800 px-6 py-4 text-white flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg flex items-center gap-2"><Settings size={20} /> ตั้งค่าแผนงาน (Plan Settings)</h3>
              <button onClick={() => setShowPlanModal(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                <h4 className="font-bold text-blue-800 mb-3 text-sm">ตั้งค่าพื้นฐาน (Baseline)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">Baseline Actual (Rings)</label>
                    <input type="number" value={planConfig.baseActualAcc} onChange={e => setPlanConfig({ ...planConfig, baseActualAcc: Number(e.target.value) })} className="w-full bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500 font-mono text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">Baseline Plan (Rings)</label>
                    <input type="number" value={planConfig.basePlanAcc} onChange={e => setPlanConfig({ ...planConfig, basePlanAcc: Number(e.target.value) })} className="w-full bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500 font-mono text-sm" />
                  </div>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-bold text-slate-800 text-sm">ช่วงเวลาแผนงาน (Plan Ranges)</h4>
                  <button onClick={addPlanRange} className="text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 transition-colors"><Plus size={14} /> เพิ่มช่วง</button>
                </div>
                <div className="space-y-3">
                  {(planConfig.ranges || []).map((range, index) => (
                    <div key={index} className="flex items-center gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1">เริ่ม</label>
                          <input type="date" value={range.start} onChange={e => { const nr = [...(planConfig.ranges || [])]; nr[index].start = e.target.value; setPlanConfig({ ...planConfig, ranges: nr }); }} className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs outline-none focus:border-emerald-500" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1">สิ้นสุด</label>
                          <input type="date" value={range.end} onChange={e => { const nr = [...(planConfig.ranges || [])]; nr[index].end = e.target.value; setPlanConfig({ ...planConfig, ranges: nr }); }} className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs outline-none focus:border-emerald-500" />
                        </div>
                      </div>
                      <div className="w-20 shrink-0">
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">Plan/Day</label>
                        <input type="number" step="0.5" value={range.dailyPlan} onChange={e => { const nr = [...(planConfig.ranges || [])]; nr[index].dailyPlan = Number(e.target.value); setPlanConfig({ ...planConfig, ranges: nr }); }} className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs outline-none focus:border-emerald-500 font-mono text-center font-bold" />
                      </div>
                      <button onClick={() => removePlanRange(index)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded mt-4 transition-colors"><Trash2 size={16} /></button>
                    </div>
                  ))}
                  {(planConfig.ranges || []).length === 0 && <div className="text-center p-4 text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">ไม่พบช่วงเวลาแผนงาน (ใช้ Default 0 Ring/Day)</div>}
                </div>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 shrink-0">
              <button onClick={() => setShowPlanModal(false)} className="px-5 py-2.5 bg-white text-slate-600 rounded-xl text-sm font-bold border border-slate-200 hover:bg-slate-100 shadow-sm transition-colors">ยกเลิก</button>
              <button onClick={handleSavePlanSettings} className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-emerald-700 transition-colors flex items-center gap-2"><Save size={16} /> บันทึกการตั้งค่า</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Distance Plan Settings Modal ═══ */}
      {showDistPlanModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-purple-700 to-pink-600 px-6 py-4 text-white flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg flex items-center gap-2"><Ruler size={20} /> ตั้งค่าแผนระยะขุดเจาะ (Distance Plan)</h3>
              <button onClick={() => setShowDistPlanModal(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-bold text-slate-800 text-sm">ช่วงเวลาแผนระยะทาง</h4>
                  <button onClick={addDistPlanRange} className="text-purple-600 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 transition-colors"><Plus size={14} /> เพิ่มช่วง</button>
                </div>
                <div className="space-y-4">
                  {(distPlanConfig.ranges || []).map((range, index) => (
                    <div key={index} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 block mb-1">เดือนเริ่ม</label>
                            <input type="month" value={range.startMonth} onChange={e => { const nr = [...(distPlanConfig.ranges || [])]; nr[index].startMonth = e.target.value; setDistPlanConfig({ ...distPlanConfig, ranges: nr }); }} className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs outline-none focus:border-purple-500" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 block mb-1">เดือนสิ้นสุด</label>
                            <input type="month" value={range.endMonth} onChange={e => { const nr = [...(distPlanConfig.ranges || [])]; nr[index].endMonth = e.target.value; setDistPlanConfig({ ...distPlanConfig, ranges: nr }); }} className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs outline-none focus:border-purple-500" />
                          </div>
                        </div>
                        <button onClick={() => removeDistPlanRange(index)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded mt-4 transition-colors"><Trash2 size={16} /></button>
                      </div>
                      <div className="flex items-center gap-2">
                        <select value={range.mode || "rings"} onChange={e => { const nr = [...(distPlanConfig.ranges || [])]; nr[index].mode = e.target.value; setDistPlanConfig({ ...distPlanConfig, ranges: nr }); }} className="bg-white border border-slate-200 rounded p-1.5 text-xs outline-none focus:border-purple-500 font-bold">
                          <option value="rings">Rings/Day</option>
                          <option value="distance">Distance/Month</option>
                        </select>
                        {(range.mode || "rings") === "rings" ? (
                          <div className="flex items-center gap-2 flex-1">
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 block mb-1">Ring/วัน</label>
                              <input type="number" step="0.5" value={range.ringsPerDay} onChange={e => { const nr = [...(distPlanConfig.ranges || [])]; nr[index].ringsPerDay = Number(e.target.value); setDistPlanConfig({ ...distPlanConfig, ranges: nr }); }} className="w-20 bg-white border border-slate-200 rounded p-1.5 text-xs outline-none focus:border-purple-500 font-mono text-center font-bold" />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 block mb-1">ยาวเฉลี่ย (m)</label>
                              <input type="number" step="0.1" value={range.avgLength} onChange={e => { const nr = [...(distPlanConfig.ranges || [])]; nr[index].avgLength = Number(e.target.value); setDistPlanConfig({ ...distPlanConfig, ranges: nr }); }} className="w-20 bg-white border border-slate-200 rounded p-1.5 text-xs outline-none focus:border-purple-500 font-mono text-center font-bold" />
                            </div>
                            <div className="text-[10px] text-slate-400 font-bold mt-4">≈ {((parseFloat(range.ringsPerDay) || 0) * (parseFloat(range.avgLength) || 1.2) * 30).toFixed(0)} m/เดือน</div>
                          </div>
                        ) : (
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 block mb-1">ระยะ/เดือน (m)</label>
                            <input type="number" value={range.distancePerMonth} onChange={e => { const nr = [...(distPlanConfig.ranges || [])]; nr[index].distancePerMonth = Number(e.target.value); setDistPlanConfig({ ...distPlanConfig, ranges: nr }); }} className="w-28 bg-white border border-slate-200 rounded p-1.5 text-xs outline-none focus:border-purple-500 font-mono text-center font-bold" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {(distPlanConfig.ranges || []).length === 0 && <div className="text-center p-4 text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">ไม่พบช่วงเวลาแผน (ใช้ Default 0 m/เดือน)</div>}
                </div>
                <p className="text-[10px] text-slate-500 mt-2">หมายเหตุ* : หากมีช่วงเวลาทับซ้อนกัน จะใช้ข้อมูลจากลำดับแรกที่ตรงกัน</p>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 shrink-0">
              <button onClick={() => setShowDistPlanModal(false)} className="px-5 py-2.5 bg-white text-slate-600 rounded-xl text-sm font-bold border border-slate-200 hover:bg-slate-100 shadow-sm transition-colors">ยกเลิก</button>
              <button onClick={handleSaveDistPlanSettings} className="px-5 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-purple-700 transition-colors flex items-center gap-2"><Save size={16} /> บันทึกการตั้งค่า</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Chart Expansion Modal ═══ */}
      {expandedChart && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-8 bg-slate-900/80 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-white rounded-3xl w-full h-full max-w-[1400px] max-h-[90vh] shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-slate-800 px-6 py-4 text-white flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg flex items-center gap-2">
                {expandedChart === 'segment' && <><TrendingUp size={20} /> Installation Trend</>}
                {expandedChart === 'distance' && <><Activity size={20} /> รายงานความก้าวหน้างานขุดเจาะอุโมงค์ TBM1</>}
                {expandedChart === 'grout' && <><Droplet size={20} /> Grout Volume Trend</>}
              </h3>
              <button onClick={() => setExpandedChart(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-4 sm:p-6 flex-1 overflow-hidden flex flex-col bg-slate-50">
              <div className="flex-1 w-full h-full bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
                {expandedChart === 'segment' && (
                  <div className="w-full h-full flex flex-col">
                    <div className="flex flex-wrap gap-4 sm:gap-6 justify-center items-center text-[10px] sm:text-xs font-bold bg-slate-50 p-3 sm:px-6 rounded-2xl border border-slate-100 mb-4 shadow-sm w-fit mx-auto shrink-0">
                      <div className="flex items-center gap-1.5 sm:gap-2"><span className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-[#fde047] shadow-sm"></span>Perm. D/S</div>
                      <div className="flex items-center gap-1.5 sm:gap-2"><span className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-[#3b82f6] shadow-sm"></span>Perm. N/S</div>
                      <div className="flex items-center gap-1.5 sm:gap-2"><span className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-[#cbd5e1] shadow-sm"></span>Temporary</div>
                      {segFilterMode !== "daily" && <>
                        <div className="flex items-center gap-1.5 sm:gap-2 ml-0 sm:ml-4"><span className="w-5 h-1 md:w-6 md:h-1 rounded-full bg-[#94a3b8]"></span>Plan Daily</div>
                        <div className="flex items-center gap-1.5 sm:gap-2"><span className="w-5 h-1 md:w-6 md:h-1 rounded-full bg-[#0f172a]"></span>Plan Acc.</div>
                        <div className="flex items-center gap-1.5 sm:gap-2"><span className="w-5 h-1.5 md:w-6 md:h-1.5 rounded-full bg-[#ef4444]"></span>Actual Acc.</div>
                      </>}
                    </div>
                    <div className="flex-1 w-full min-h-[400px]">
                      <ResponsiveContainer>
                        <ComposedChart data={segChartData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                          <XAxis dataKey="displayDate" tick={{ fontSize: 10, fill: "#64748b", fontWeight: 500 }} angle={-45} textAnchor="end" height={60} />
                          <YAxis yAxisId="left" domain={[0, segFilterMode === "daily" ? "auto" : 10]} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                          {segFilterMode !== "daily" && <YAxis yAxisId="right" orientation="right" domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />}
                          <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} itemStyle={{ fontSize: "11px", fontWeight: "bold" }} />
                          {segFilterMode !== "daily" && <Line yAxisId="left" type="monotone" dataKey="plan" stroke="#94a3b8" strokeWidth={2} dot={segChartData.length <= 24 ? { r: 0 } : { r: 2 }} name="Plan Daily" />}
                          <Bar yAxisId="left" dataKey="dayRings" stackId="a" fill="#fde047" name="Perm. D/S" radius={[0, 0, 0, 0]} maxBarSize={40} />
                          <Bar yAxisId="left" dataKey="nightRings" stackId="a" fill="#3b82f6" name="Perm. N/S" radius={[0, 0, 0, 0]} maxBarSize={40} />
                          <Bar yAxisId="left" dataKey="tempRings" stackId="a" fill="#cbd5e1" name="Temporary" radius={[4, 4, 0, 0]} maxBarSize={40} />
                          {segFilterMode !== "daily" && <Line yAxisId="right" type="monotone" dataKey="planAcc" stroke="#0f172a" strokeWidth={2} dot={segChartData.length === 1 ? { r: 3, fill: "#0f172a" } : { r: 2, fill: "#0f172a" }} name="Plan Acc." />}
                          {segFilterMode !== "daily" && <Line yAxisId="right" type="monotone" dataKey="actualAcc" stroke="#ef4444" strokeWidth={3} dot={segChartData.length === 1 ? { r: 4, fill: "#ef4444" } : { r: 3, fill: "#ef4444" }} name="Actual Acc." label={{ position: "top", fill: "#ef4444", fontSize: 10, fontWeight: "900" }} />}
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
                {expandedChart === 'distance' && (
                  <div className="w-full h-full flex flex-col gap-4 overflow-y-auto pr-2 pb-4">
                    <div className="flex justify-center shrink-0">
                      <div className="flex flex-wrap gap-6 items-center bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-1 bg-[#ec4899] rounded-full"></span>
                          <span className="text-[11px] sm:text-sm font-bold text-slate-700">Actual Acc. (ผลงานจริงสะสม)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-0.5"><span className="w-3 h-3 rounded-full bg-[#8b5cf6]"></span><span className="w-5 h-1 bg-[#8b5cf6] rounded-full"></span></span>
                          <span className="text-[11px] sm:text-sm font-bold text-slate-700">Plan Acc. (แผนงานสะสม)</span>
                        </div>
                      </div>
                    </div>
                    {/* ═══ ส่วนที่ 1: กราฟเส้น (Line Chart) ═══ */}
                    <div className="flex-1 min-h-[400px] w-full relative z-10 shrink-0">
                      <div className="w-full h-full pl-2 pr-4 sm:pr-8">
                        <ResponsiveContainer>
                          <ComposedChart data={filteredDistanceChartData} margin={{ top: 35, right: 30, left: 10, bottom: 15 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} stroke="#e2e8f0" />
                            <XAxis 
                              dataKey="displayMonth" 
                              tick={{ fontSize: 10, fill: "#475569", fontWeight: 700 }} 
                              angle={-45} 
                              textAnchor="end" 
                              height={80} 
                              tickMargin={15}
                              axisLine={{ stroke: "#000", strokeWidth: 1 }}
                              interval={0}
                              label={{ value: "เดือน/ปี", position: "insideBottomRight", offset: -5, style: { fontSize: 11, fill: "#475569", fontWeight: "bold" } }}
                            />
                            <YAxis 
                              domain={[0, 10000]} 
                              ticks={[0, 2500, 5000, 7500, 10000]}
                              tick={{ fontSize: 11, fill: "#475569", fontWeight: 700 }} 
                              axisLine={{ stroke: "#000", strokeWidth: 1 }}
                              tickLine={{ stroke: "#000" }} 
                              label={{ value: "ระยะทาง (เมตร)", angle: 0, position: "top", offset: 20, style: { fontSize: 11, fill: "#475569", fontWeight: "bold" } }} 
                              width={60}
                              tickFormatter={val => val.toLocaleString()}
                            />
                            <Tooltip
                              contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                              itemStyle={{ fontSize: "12px", fontWeight: "bold" }}
                              labelStyle={{ fontSize: "11px", color: "#64748b", fontWeight: "bold", marginBottom: "4px" }}
                              formatter={(val, name) => {
                                if (val === null || val === undefined) return ['-', name === "planAcc" ? "แผนงานสะสม" : "ผลงานจริงสะสม"];
                                return [`${Number(val).toLocaleString()} m`, name === "planAcc" ? "แผนงานสะสม" : "ผลงานจริงสะสม"];
                              }}
                            />
                            <Line type="monotone" dataKey="planAcc" stroke="#8b5cf6" strokeWidth={3} connectNulls={false} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} dot={(props) => { const { cx, cy, payload } = props; if (cx === undefined || cy === undefined) return null; return ( <g key={`dot-plan-${payload.month}`}> <circle cx={cx} cy={cy} r={4} fill="#8b5cf6" /> {payload.planAcc > 0 && <text x={cx} y={cy - 12} fill="#8b5cf6" fontSize={9} fontWeight="black" textAnchor="middle">{payload.planAcc.toLocaleString(undefined, {maximumFractionDigits:0})}</text>} </g> ); }} />
                            <Line type="monotone" dataKey="actualAcc" stroke="#ec4899" strokeWidth={3} connectNulls={true} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} dot={(props) => { const { cx, cy, payload } = props; if (payload.actualAcc === null || payload.actualAcc === undefined || cx === undefined || cy === undefined) return null; return ( <g key={`dot-act-${payload.month}`}> <rect x={cx - 4} y={cy - 4} width={8} height={8} fill="#ec4899" rx={1} /> {payload.actualAcc > 0 && <text x={cx} y={cy + 18} fill="#ec4899" fontSize={9} fontWeight="black" textAnchor="middle">{payload.actualAcc.toLocaleString(undefined, {maximumFractionDigits:0})}</text>} </g> ); }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* ═══ ส่วนที่ 2: Progress Bar ═══ */}
                    <div className="relative min-w-[700px] overflow-hidden bg-slate-50/80 border border-slate-200 rounded-2xl p-4 shadow-sm shrink-0">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-black text-slate-600 uppercase tracking-wider">เปรียบเทียบ ณ เดือนปัจจุบัน</span>
                        <span className="text-[11px] font-bold text-slate-500">ระยะโครงการ: <span className="text-slate-800 font-black">{TOTAL_ROUTE_DISTANCE.toLocaleString()} ม.</span></span>
                      </div>
                      
                      <div className="flex flex-col gap-3 relative z-20">
                        {/* แผนงานสะสม ณ เดือนปัจจุบัน */}
                        <div className="flex items-center h-[38px]">
                          <span className="w-32 text-xs font-bold text-slate-800 shrink-0">แผนงานสะสม</span>
                          <div className="flex-1 h-full rounded-md border border-slate-200 relative overflow-hidden bg-slate-100">
                            {totalPlanDistance > 0 ? (
                              <>
                                <div className="h-full bg-[#9b1c1c] rounded-md flex items-center justify-end px-3 relative z-10 shadow-sm border border-red-900 transition-all duration-700" style={{ width: `${Math.max((totalPlanDistance / TOTAL_ROUTE_DISTANCE) * 100, 5)}%` }}>
                                  <span className="text-white text-xs font-black drop-shadow-md whitespace-nowrap">{totalPlanDistance.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                                </div>
                                <div className="absolute top-0 right-2 h-full flex items-center z-0"><span className="text-[9px] font-bold text-slate-400">{TOTAL_ROUTE_DISTANCE.toLocaleString()}</span></div>
                              </>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center"><span className="text-slate-500 text-xs font-bold">ยังไม่ตั้งค่าแผน — กดปุ่ม ⚙️ เพื่อตั้งค่า</span></div>
                            )}
                          </div>
                        </div>
                        
                        {/* ผลงานจริง */}
                        <div className="flex items-center h-[38px] relative">
                          <span className="w-32 text-xs font-bold text-slate-800 shrink-0">ผลงานจริง</span>
                          <div className="flex-1 h-full rounded-md border border-slate-200 relative overflow-hidden bg-slate-100">
                            {(() => {
                              const planPercent = totalPlanDistance > 0 ? (totalPlanDistance / TOTAL_ROUTE_DISTANCE) * 100 : 0;
                              const actualPercent = (totalActualDistance / TOTAL_ROUTE_DISTANCE) * 100;
                              const gapWidth = planPercent - actualPercent;
                              
                              return (
                                <>
                                  {totalActualDistance > 0 && (
                                    <div className="absolute top-0 left-0 h-full bg-emerald-500 flex items-center justify-center z-10 shadow-sm transition-all duration-700" style={{ width: `${Math.max(actualPercent, 3)}%`, borderRight: totalPlanDistance > 0 ? '2px solid #1e293b' : 'none' }}>
                                      <span className="text-white text-[10px] font-black whitespace-nowrap px-1 drop-shadow-md">{totalActualDistance.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                                    </div>
                                  )}
                                  {totalPlanDistance > 0 && gapWidth > 0 && (
                                    <div className="absolute top-0 h-full flex items-center justify-center z-5" style={{ left: `${actualPercent}%`, width: `${gapWidth}%`, backgroundImage: "repeating-linear-gradient(45deg, #fecaca 0px, #fecaca 6px, #fff 6px, #fff 12px)" }}>
                                      <span className="text-red-700 text-[9px] font-black bg-white/90 px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap border border-red-200 z-10 relative">
                                        -{(totalPlanDistance - totalActualDistance).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                      </span>
                                    </div>
                                  )}
                                  <div className="absolute top-0 right-2 h-full flex items-center z-0"><span className="text-[9px] font-bold text-slate-400">{TOTAL_ROUTE_DISTANCE.toLocaleString()}</span></div>
                                  {totalActualDistance === 0 && <div className="w-full h-full flex items-center justify-center z-20 relative"><span className="text-slate-400 text-[10px] font-bold">ยังไม่มีผลงาน</span></div>}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ═══ ส่วนที่ 3: Route Progress ═══ */}
                    <div className="relative min-w-[700px] overflow-hidden bg-white border border-slate-100 rounded-2xl p-4 shadow-sm shrink-0">
                      <style>{` .track-pattern { background-image: repeating-linear-gradient(90deg, transparent, transparent 15px, #94a3b8 15px, #94a3b8 18px); } `}</style>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[#64748b] text-[11px] font-black tracking-[0.2em] uppercase">Route Progress</span>
                      </div>
                      <div className="relative mx-4 sm:mx-8" style={{ height: '85px' }}>
                        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[18px] bg-[#f1f5f9] border-y-[3px] border-[#64748b] track-pattern opacity-100 shadow-sm z-0"></div>
                        <div className="absolute top-1/2 -translate-y-1/2 left-0 h-[32px] bg-[#ec4899]/20 border border-[#ec4899]/40 rounded-l-full z-1 transition-all duration-1000" style={{ width: `${Math.min((totalActualDistance / TOTAL_ROUTE_DISTANCE) * 100, 100)}%` }}></div>
                        {routeStationPlacements.map((seg, i) => {
                          if (i === 0) return null;
                          const prevSeg = routeStationPlacements[i - 1];
                          return (
                            <React.Fragment key={`route-modal-${seg.id}`}>
                              <div className="absolute -top-6 -translate-x-1/2 bg-white border-2 border-slate-700 rounded-full px-2 py-0.5 text-[9px] font-black text-slate-700 shadow-sm whitespace-nowrap z-10" style={{ left: `${(prevSeg.xPercent + seg.xPercent) / 2}%` }}>{((seg.distance - ROUTE_SEGMENTS[i - 1].distance)).toLocaleString(undefined, { minimumFractionDigits: 3 })} m</div>
                              <div className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center justify-center z-20" style={{ left: `${seg.xPercent}%`, transform: 'translateX(-50%) translateY(-50%)' }}>
                                <div className="relative w-9 h-9 rounded-full border-[4px] border-white shadow-lg bg-[#8b5cf6] text-white flex items-center justify-center text-[10px] font-black z-10 tracking-tighter">{seg.label.replace("IS", "")}</div>
                                <span className="absolute top-11 text-[10px] font-bold text-slate-700 whitespace-nowrap">{seg.label}</span>
                              </div>
                            </React.Fragment>
                          );
                        })}
                        <div className="absolute top-1/2 -translate-y-1/2 left-0 -translate-x-1/2 flex flex-col items-center justify-center z-20">
                          <div className="relative w-9 h-9 rounded-full border-[4px] border-white shadow-lg bg-[#8b5cf6] text-white flex items-center justify-center text-[10px] font-black z-10 tracking-tighter">{ROUTE_SEGMENTS[0].label.replace("IS", "")}</div>
                          <span className="absolute top-11 text-[10px] font-bold text-slate-700 whitespace-nowrap">{ROUTE_SEGMENTS[0].label}</span>
                        </div>
                        <div className="absolute top-1/2 -translate-y-1/2 z-30 transition-all duration-[1500ms] ease-out" style={{ left: `${Math.min((totalActualDistance / TOTAL_ROUTE_DISTANCE) * 100, 100)}%`, transform: 'translateX(-50%) translateY(-50%)' }}>
                          <div className="relative drop-shadow-xl group cursor-pointer">
                            <span className="absolute -inset-2 rounded-full bg-[#ec4899] opacity-40 animate-ping"></span>
                            <div className="w-8 h-8 bg-[#0ea5e9] border-[3px] border-white flex items-center justify-center rounded-sm rotate-90 relative z-10 shadow-md overflow-hidden">
                              <div className="w-full h-[60%] bg-[#0284c7] absolute bottom-0 left-0"></div><div className="w-full h-[2px] bg-white opacity-50 absolute top-[40%] left-0"></div><span className="text-[8px] text-white font-black z-10 -rotate-90">TBM1</span>
                            </div>
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-3 py-1.5 rounded-lg font-bold whitespace-nowrap shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-40">TBM1: {totalActualDistance.toLocaleString()} m ({(totalActualDistance / TOTAL_ROUTE_DISTANCE * 100).toFixed(1)}%)</div>
                          </div>
                        </div>
                      </div>
                      <div className="h-8"></div>
                    </div>
                  </div>
                )}
                {expandedChart === 'grout' && (
                  <div className="w-full h-full flex flex-col">
                    <div className="flex justify-center shrink-0 mb-4">
                      <div className="flex flex-wrap gap-4 sm:gap-6 items-center bg-slate-50 px-4 sm:px-6 py-3 rounded-2xl border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded-sm bg-blue-500 opacity-60"></span>
                          <span className="text-[10px] sm:text-xs font-bold text-slate-700">Grout Volume</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-0 border-t-2 border-dashed border-[#FB923C]"></span>
                          <span className="text-[10px] sm:text-xs font-bold text-slate-600">Theoretical (100%)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-0 border-t-2 border-dashed border-[#4ADE80]"></span>
                          <span className="text-[10px] sm:text-xs font-bold text-slate-600">120%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-0 border-t-2 border-dashed border-[#F472B6]"></span>
                          <span className="text-[10px] sm:text-xs font-bold text-slate-600">150%</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 w-full min-h-[400px]">
                      <ResponsiveContainer>
                        <AreaChart data={groutChartData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="execColorTotalPop" x1="0" y1="0" x2="0" y2="1">
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
                          <Area type="monotone" dataKey="total" stroke="#3B82F6" strokeWidth={3} fill="url(#execColorTotalPop)" dot={{ r: 4, fill: "#3B82F6", stroke: "#fff", strokeWidth: 2 }} label={{ position: "top", fill: "#475569", fontSize: 9, fontWeight: 600, formatter: val => Number(val || 0).toFixed(2) }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExecutiveDashboardView;
