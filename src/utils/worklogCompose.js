// SP4: ประกอบ work-log text (งานขุดเจาะ) จากข้อมูล dashboard แบบ deterministic
// pure function — รับค่าที่ ReportView คำนวณไว้แล้ว (single source of truth, ไม่มี AI)
import { getRingNumeric } from "./helpers";
import { parseCH } from "./formatters";
import { CH_EXCAV_START } from "./constants";

// ชื่อ activity ที่ไม่นับเป็น Delay (กิจกรรมงานปกติ) — ตรงกับ ReportView เดิม
const NON_DELAY_ACTIVITIES = ["Excavation", "Segment Erection", "Locomotive / Rail System", "Survey", "Other 1", "Other 2"];

function ringRange(list) {
  if (list.length === 0) return "-";
  if (list.length === 1) return String(list[0].ringNo);
  return `${list[0].ringNo}-${list[list.length - 1].ringNo}`;
}

// ดึง Delay activities จาก shift reports → list (deterministic, dedupe ด้วย Set)
function collectDelays(filteredShiftReports, allRemarks) {
  const delays = [];
  (filteredShiftReports || []).forEach((sr) => {
    Object.entries(sr.events || {}).forEach(([activityName, evs]) => {
      if (NON_DELAY_ACTIVITIES.includes(activityName)) return;
      (evs || []).forEach((ev) => {
        let desc = activityName;
        if (ev.label && String(ev.label).trim() !== "") {
          desc = activityName.toLowerCase().startsWith("other") ? ev.label : `${activityName} (${ev.label})`;
        }
        delays.push(desc);
      });
    });
  });
  const unique = [...new Set(delays)];
  const combined = [];
  if (allRemarks && allRemarks.length > 0) combined.push(...allRemarks.map((r) => `${String(r.text)} (พบในวง ${r.ring})`));
  if (unique.length > 0) combined.push(...unique);
  return combined.length > 0 ? "-" + combined.join("\n-") : "-ไม่มี";
}

// คืน "body" ของรายงาน (หัวข้อ 1–8) — ตรงกับ dr-helper workLogText (ไม่มี header/วันที่/อากาศ)
export function composeExcavationWorkLog({
  filteredSegments = [],
  filteredGrouts = [],
  filteredShiftReports = [],
  summary = {},
  accumulation = {},
  projectInfo = {},
  reportShift = "All",
}) {
  const tbmNo = projectInfo.tbmNo || "TBM";

  const installedInShift = filteredSegments
    .filter((s) => s.status !== "In Progress" && s.installType !== "Temporary" &&
      (reportShift === "All" || (s.installShift || s.shift) === reportShift))
    .sort((a, b) => getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo));

  const excavatedInShift = filteredSegments
    .filter((s) => reportShift === "All" || (s.excavShift || s.shift) === reportShift)
    .sort((a, b) => getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo));

  const segmentDetails = installedInShift.map((s) => `${s.ringNo} (K${s.keyPos})`).join(", ") || "-";
  const excavRings = ringRange(excavatedInShift);
  const finishCH = excavatedInShift.length > 0 ? excavatedInShift[excavatedInShift.length - 1].finishCH : "-";
  const calculatedExcavateDist = finishCH !== "-" ? (CH_EXCAV_START - parseCH(finishCH)).toFixed(3) : "0.000";

  const sortedGrouts = [...filteredGrouts].sort((a, b) => getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo));
  const groutDetails = sortedGrouts.map((g) => `${g.ringNo} = ${Number(g.total || 0).toFixed(3)} m3 (${Number(g.ratio || 0).toFixed(2)}%)`).join(", ") || "-";
  const groutRingRange = ringRange(sortedGrouts);
  const latestGroutRing = sortedGrouts.length > 0 ? sortedGrouts[sortedGrouts.length - 1].ringNo : "-";
  const soilTypes = [...new Set(excavatedInShift.map((s) => s.soilType).filter(Boolean))].join(", ") || "-";

  const delaysText = collectDelays(filteredShiftReports, summary.allRemarks);

  return `1. ${tbmNo}
-เริ่มต้น CH 8+830.488 (Center Shaft IS4) ขุดเจาะถึง CH ${finishCH} = ${calculatedExcavateDist} m
-ขุดเจาะ ${excavRings} แล้วเสร็จ

2.งานติดตั้งผนังอุโมงค์ (Segment)
-ประกอบ ${segmentDetails} = ${summary.permCount ?? 0} Ring/Shift
-จำนวน Ring สะสม = Permanent ${accumulation.permRings ?? 0} Ring, Tempo ${accumulation.tempRings ?? 0} Ring
-ระยะติดตั้ง ${summary.totalLength ?? "0.00"} m./Shift
-ระยะติดตั้งสะสม ${accumulation.totalAccumDist ?? "0.000"} m

3.Primary Grout
-Ring ${groutRingRange} = ${summary.uniqueGroutedRings ?? 0} Ring/Shift
-Grout สะสมถึง = ${latestGroutRing}
-Grout Volumn ${groutDetails}

4.สภาพดินที่ขุดเจาะ
-${soilTypes}

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
${delaysText}`;
}

// map manpower (shift report) → labor key (เฉพาะที่ตรงชัด; CraneOp เว้นว่าง — Zero Hallucination)
const MANPOWER_TO_LABOR = {
  Engineer: "lb_engineer",
  Operator: "lb_operator",
  Surveyor: "lb_surveyor",
  Machanic: "lb_mechanic",      // หมายเหตุ: ต้นทางสะกด "Machanic"
  Electrician: "lb_electrician",
  Foreman: "lb_foreman",
  Worker: "lb_worker",
  // CraneOp: ไม่ map (ไม่มี labor key ตรง)
};

function parseManpower(mp) {
  if (!mp) return {};
  if (typeof mp === "string") { try { return JSON.parse(mp) || {}; } catch (e) { return {}; } }
  return typeof mp === "object" ? mp : {};
}

// คืน labor object (form-ready strings) เฉพาะ key ที่ map ได้และ > 0; ใช้ค่ามากสุดต่อ key ในชุด report
export function mapManpowerToLabor(shiftReports) {
  const maxByKey = {};
  (Array.isArray(shiftReports) ? shiftReports : []).forEach((sr) => {
    const mp = parseManpower(sr.manpower);
    Object.entries(mp).forEach(([k, v]) => {
      const n = Number(v);
      if (!isNaN(n) && n > 0) maxByKey[k] = Math.max(maxByKey[k] || 0, n);
    });
  });
  const labor = {};
  Object.entries(MANPOWER_TO_LABOR).forEach(([mpKey, lbKey]) => {
    if (maxByKey[mpKey] != null) labor[lbKey] = String(maxByKey[mpKey]);
  });
  return labor;
}
