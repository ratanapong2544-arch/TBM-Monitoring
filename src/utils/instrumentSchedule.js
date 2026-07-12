// วาระตรวจวัด instrument — pure functions ล้วน (ไม่มี DB/async/side-effect)
// Data model จริง (INST_SC_HEADERS บน Sheets):
//   id, locationId, scheduleType, instrumentGroup, distanceOffset, tbmChainage,
//   longTermLabel, longTermDays, triggerOffset, targetDate, isMeasured, measuredAt, measuredBy, photoUrl, notes
// scheduleType = "DISTANCE" | "LONG_TERM"; ไม่มี field triggerMeasuredAt / status —
// N/A แสดงผ่าน notes === "N/A" เท่านั้น

const MS_PER_DAY = 86400000;

function addDaysISO(baseMs, days) {
  return new Date(baseMs + Number(days) * MS_PER_DAY).toISOString();
}

// DISTANCE trigger ตามตำแหน่ง TBM (STA ลดลงเมื่อเจาะหน้า)
export function distanceDue(sched, curChainage) {
  if (!sched || sched.scheduleType !== "DISTANCE") return false;
  if (curChainage == null || sched.tbmChainage == null) return false;
  return Number(curChainage) <= Number(sched.tbmChainage); // TBM ผ่านจุด trigger แล้ว
}

// แก้ bug: เดิมอ่าน sched.triggerMeasuredAt ที่ไม่มีจริงใน data model → คืน null เสมอ
// ตอนนี้อ่าน targetDate ตรงๆ (ฟิลด์ที่มีจริง) — ตรรกะ fallback (คำนวณจาก trigger DISTANCE)
// ย้ายไปอยู่ที่ getEffectiveLongTermTargetDate แทน
export function longTermTargetDate(sched) {
  if (!sched || sched.scheduleType !== "LONG_TERM") return null;
  return sched.targetDate ?? null;
}

// Read-side fallback — port ตรงจาก tunnel-monitoring/src/app/page.tsx (getEffectiveLongTermTargetDate)
// ใช้ตอนยังไม่มี targetDate ถูก set จริง (cascade ยังไม่ทำงาน) เพื่อประมาณวันจาก DISTANCE ที่ trigger แล้ว
export function getEffectiveLongTermTargetDate(sched, allSchedules) {
  if (!sched) return null;
  if (sched.scheduleType !== "LONG_TERM") return sched.targetDate ?? null;
  if (sched.targetDate) return sched.targetDate;
  if (sched.triggerOffset == null || sched.longTermDays == null) return null;

  const triggerSchedules = (allSchedules || []).filter(
    (item) =>
      item.scheduleType === "DISTANCE" &&
      item.distanceOffset === sched.triggerOffset &&
      item.isMeasured
  );
  if (triggerSchedules.length === 0) return null;

  const measuredTimes = triggerSchedules
    .map((item) => (item.measuredAt ? new Date(item.measuredAt).getTime() : null))
    .filter((v) => v != null && !isNaN(v));
  if (measuredTimes.length === 0) return null;

  return addDaysISO(Math.max(...measuredTimes), sched.longTermDays);
}

// ลำดับ: notes==="N/A" ต้องเช็คก่อน isMeasured — markMeasurementNA ตั้ง isMeasured=true ด้วย
// (เหมือน markMeasurementDone) ดังนั้นถ้าเช็ค isMeasured ก่อนจะทำให้ "na" ไม่มีทาง reachable
export function scheduleStatus(sched, curChainage, today, allSchedules) {
  if (!sched) return "pending";
  if (sched.notes === "N/A") return "na";
  if (sched.isMeasured) return "done";
  if (sched.scheduleType === "LONG_TERM") {
    const target = allSchedules
      ? getEffectiveLongTermTargetDate(sched, allSchedules)
      : longTermTargetDate(sched);
    if (!target) return "pending";
    return new Date(today) > new Date(target) ? "overdue" : "due";
  }
  // DISTANCE
  return distanceDue(sched, curChainage) ? "due" : "pending";
}

export function summarizeSchedules(list, curChainage, today) {
  const acc = { due: 0, overdue: 0, done: 0, pending: 0 };
  (list || []).forEach((s) => {
    const st = scheduleStatus(s, curChainage, today);
    if (st === "na") return;
    if (acc[st] != null) acc[st] += 1;
  });
  return acc;
}

// --- mutations (cascade) — port จาก tunnel-monitoring/src/app/actions.ts ---
// คืน array ใหม่ทั้งชุด (immutable, ไม่แก้ input): { next, changed }
// next = schedules ใหม่ทั้งหมด, changed = เฉพาะ row ที่ค่าเปลี่ยน (ให้ผู้เรียก persist เท่าที่เปลี่ยน)

// หา LONG_TERM ที่ trigger บน offset เดียวกัน แล้ว set targetDate ถ้า DISTANCE ที่ offset+location
// เดียวกันวัดครบหมดแล้ว (pendingAtOffset === 0) — ใช้ schedules หลังอัปเดตแถวหลักแล้ว
function cascadeLongTerm(schedulesAfterPrimary, updatedTarget, completionTimeISO) {
  if (updatedTarget.scheduleType !== "DISTANCE" || updatedTarget.distanceOffset == null) return [];

  const { locationId, distanceOffset: currentOffset } = updatedTarget;
  const pendingAtOffset = schedulesAfterPrimary.filter(
    (s) =>
      s.locationId === locationId &&
      s.scheduleType === "DISTANCE" &&
      s.distanceOffset === currentOffset &&
      !s.isMeasured
  ).length;
  if (pendingAtOffset !== 0) return [];

  const completionMs = new Date(completionTimeISO).getTime();
  return schedulesAfterPrimary
    .filter((s) => s.scheduleType === "LONG_TERM" && s.locationId === locationId && s.triggerOffset === currentOffset)
    .map((s) => ({
      ...s,
      targetDate: s.longTermDays ? addDaysISO(completionMs, s.longTermDays) : new Date(completionMs).toISOString(),
    }));
}

function applyChanged(list, changedRows) {
  if (changedRows.length === 0) return list;
  const byId = new Map(changedRows.map((r) => [r.id, r]));
  return list.map((s) => (byId.has(s.id) ? byId.get(s.id) : s));
}

export function markMeasurementDone(schedules, scheduleId, measuredAtISO) {
  const list = schedules || [];
  const target = list.find((s) => s.id === scheduleId);
  if (!target) return { next: list.slice(), changed: [] };

  const measuredAt = measuredAtISO || new Date().toISOString();
  const updatedTarget = { ...target, isMeasured: true, measuredAt, measuredBy: "Field Engineer" };
  const afterPrimary = list.map((s) => (s.id === scheduleId ? updatedTarget : s));

  const cascadeChanged = cascadeLongTerm(afterPrimary, updatedTarget, measuredAt);
  const next = applyChanged(afterPrimary, cascadeChanged);

  return { next, changed: [updatedTarget, ...cascadeChanged] };
}

export function markMeasurementNA(schedules, scheduleId) {
  const list = schedules || [];
  const target = list.find((s) => s.id === scheduleId);
  if (!target) return { next: list.slice(), changed: [] };

  const updatedTarget = { ...target, isMeasured: true, measuredAt: null, notes: "N/A", measuredBy: "System (N/A)" };
  const afterPrimary = list.map((s) => (s.id === scheduleId ? updatedTarget : s));

  // measuredAt เป็น null เสมอสำหรับ N/A จึงใช้วันนี้เป็น completionTime (ตาม source)
  const completionTimeISO = new Date().toISOString();
  const cascadeChanged = cascadeLongTerm(afterPrimary, updatedTarget, completionTimeISO);
  const next = applyChanged(afterPrimary, cascadeChanged);

  return { next, changed: [updatedTarget, ...cascadeChanged] };
}

// ไม่มี cascade reverse — ตาม source (LONG_TERM ที่เคย set targetDate ไปแล้วไม่ถูกแตะ)
export function cancelMeasurement(schedules, scheduleId) {
  const list = schedules || [];
  const target = list.find((s) => s.id === scheduleId);
  if (!target) return { next: list.slice(), changed: [] };

  const updatedTarget = { ...target, isMeasured: false, measuredAt: null, notes: null, measuredBy: null };
  const next = list.map((s) => (s.id === scheduleId ? updatedTarget : s));

  return { next, changed: [updatedTarget] };
}

// --- grouping / location helpers — port จาก LocationDetailClient.tsx (R3/R4 ใช้ต่อ) ---

function shouldKeepDuplicateZeroNodes(locationName) {
  return (locationName || "").trim().toUpperCase() === "SHAFT IS04";
}

function shouldUsePositiveOnlyOffsetLabels(locationName) {
  return (locationName || "").trim().toUpperCase() === "SHAFT IS04";
}

// DISTANCE เท่านั้น → negatives (offset<0) sort asc ตามด้วย positives (offset>=0) sort asc;
// รวม node ที่ offset เดียวกันเป็น group เดียว ยกเว้น SHAFT IS04 ที่คง node offset 0 แยกกัน
export function groupDistanceSchedules(schedules, locationName) {
  const distSchedules = (schedules || []).filter(
    (s) => s.scheduleType === "DISTANCE" && s.distanceOffset != null
  );
  const keepDuplicateZeroNodes = shouldKeepDuplicateZeroNodes(locationName);

  const negatives = distSchedules.filter((s) => s.distanceOffset < 0).sort((a, b) => a.distanceOffset - b.distanceOffset);
  const positives = distSchedules.filter((s) => s.distanceOffset >= 0).sort((a, b) => a.distanceOffset - b.distanceOffset);
  const sorted = [...negatives, ...positives];

  const groups = [];
  for (const sched of sorted) {
    const lastGroup = groups[groups.length - 1];
    const isSameOffset = lastGroup && lastGroup[0].distanceOffset === sched.distanceOffset;
    const shouldSplitZeroNode = keepDuplicateZeroNodes && sched.distanceOffset === 0;
    if (isSameOffset && !shouldSplitZeroNode) {
      lastGroup.push(sched);
    } else {
      groups.push([sched]);
    }
  }
  return groups;
}

function getLongTermSidePriority(label) {
  const upper = (label ?? "").toUpperCase();
  if (upper.includes("(L)")) return 0;
  if (upper.includes("FINAL")) return 0;
  if (upper.includes("INIT")) return 1;
  return 2;
}

// เรียง LONG_TERM: side priority (FINAL/(L) ก่อน, INIT รอง, อื่นๆ ท้าย) แล้ว longTermDays แล้ว label
export function sortLongTerm(schedules) {
  return (schedules || [])
    .filter((s) => s.scheduleType === "LONG_TERM")
    .sort((a, b) => {
      const sidePriorityDiff = getLongTermSidePriority(a.longTermLabel) - getLongTermSidePriority(b.longTermLabel);
      if (sidePriorityDiff !== 0) return sidePriorityDiff;
      const dayDiff = (a.longTermDays ?? Number.MAX_SAFE_INTEGER) - (b.longTermDays ?? Number.MAX_SAFE_INTEGER);
      if (dayDiff !== 0) return dayDiff;
      return (a.longTermLabel ?? "").localeCompare(b.longTermLabel ?? "");
    });
}

// TBM ผ่าน group นี้ไปแล้วหรือยัง (มี sched ตัวไหนใน group ที่ tbmChainage ปัจจุบัน <= tbmChainage ของมัน)
export function isPassed(group, tbmChainage) {
  return (group || []).some((s) => s.tbmChainage != null && tbmChainage <= s.tbmChainage);
}

// index ของ group แรกที่ TBM ยังไปไม่ถึง แต่อยู่ในระยะ 50m (ไม่งั้นคืน -1)
export function approachingIndex(groups, tbmChainage) {
  const list = groups || [];
  const idx = list.findIndex((g) => !isPassed(g, tbmChainage));
  if (idx === -1) return -1;

  const nodeTbmChainage = list[idx][0].tbmChainage || 0;
  const distToNode = tbmChainage - nodeTbmChainage;
  if (distToNode > 50) return -1;

  return idx;
}

// TBM อยู่ระหว่าง node นี้กับ node ถัดไปหรือไม่ (node สุดท้ายใช้ window +15)
export function isTbmHere(groups, idx, distance) {
  const arr = groups || [];
  const group = arr[idx];
  if (!group) return false;

  const distanceOffset = group[0].distanceOffset || 0;
  const isLast = idx === arr.length - 1;
  if (distance < distanceOffset) return false;
  if (isLast) return distance <= distanceOffset + 15;

  const nextOffset = arr[idx + 1][0].distanceOffset || 0;
  return distance < nextOffset;
}

// offset null→"N/A", 0→"0", SHAFT IS04→+|offset| เสมอ, ไม่งั้น +/- ตามเครื่องหมาย
export function formatOffsetLabel(distanceOffset, locationName) {
  if (distanceOffset == null) return "N/A";
  if (distanceOffset === 0) return "0";
  if (shouldUsePositiveOnlyOffsetLabels(locationName)) {
    return `+${Math.abs(distanceOffset)}`;
  }
  return distanceOffset > 0 ? `+${distanceOffset}` : `${distanceOffset}`;
}

// --- display-format helpers — port ตรงจาก LocationDetailClient.tsx:47-71 (R3a) ---

// ตำแหน่งจริงของจุดตรวจวัด (อาจต่างจาก chainage ที่ออกแบบไว้ ถ้ามีการสำรวจติดตั้งภายหลัง)
export function getOperationalChainage(location) {
  if (!location) return null;
  return location.actualChainage ?? location.chainage;
}

// มีตำแหน่งติดตั้งจริงที่ต่างจาก chainage ออกแบบหรือไม่ — คุมบรรทัด "Install STA" แบบมีเงื่อนไข
// (R3-source-map.md §6: port ตรงจาก LocationDetailClient.tsx:51-53; R3b เว้นไว้เพราะยังไม่มีผู้ใช้,
// R3c ใช้ตรงกับ BlueprintPlot banner จึงเพิ่มที่นี่ — helper บริสุทธิ์ ไม่แตะ component ใดๆ)
export function hasActualInstallChainage(location) {
  if (!location) return false;
  return location.actualChainage != null && location.actualChainage !== location.chainage;
}

// ป้ายวันที่ใต้ sub-button บน timeline: "N/A" ถ้าถูก mark ข้าม (isMeasured=true แต่ไม่มี measuredAt),
// ว่างถ้ายังไม่วัด, ไม่งั้น "dd Mon"
export function formatMeasuredAtLabel(measuredAt, isMeasured) {
  if (isMeasured && !measuredAt) return "N/A";
  if (!measuredAt) return "";
  return new Date(measuredAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

// ป้ายวันที่การ์ด Long Term: "dd Mon yyyy"
export function formatLongTermDate(date) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
