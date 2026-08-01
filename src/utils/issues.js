// MIGRATION ONLY for loadIssues/persistIssues: no active React path calls them. App holds these collections from
// the snapshot (Task 9 Step 5); they remain for legacy staging and for pre-change devices.
// Issue domain logic + localStorage persistence (Phase 1)
export const STORAGE_KEY = "tbmIssues";

export const SEVERITY = {
  delay:   { label: "ล่าช้า",       badge: "d",    accent: "border-l-code-d" },
  blocker: { label: "Blocker",       badge: "c",    accent: "border-l-code-c" },
  info:    { label: "แจ้งเพื่อทราบ", badge: "info", accent: "border-l-cyan-med" },
};
export const SEVERITY_ORDER = ["delay", "blocker", "info"];

export const ISSUE_MACHINES = ["TBM1", "TBM2", "all"];
export const MACHINE_LABEL = { TBM1: "TBM1", TBM2: "TBM2", all: "ทั้งโครงการ" };

export function makeIssueId() {
  return `iss_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

export function progressPct(current, target) {
  const c = Number(current), t = Number(target);
  if (!t || t <= 0 || isNaN(c) || isNaN(t)) return 0;
  return Math.max(0, Math.min(100, Math.round((c / t) * 100)));
}

export function effectiveCurrent(issue, currentRingNum) {
  if (issue && issue.qtyAuto) {
    return Math.max(0, (Number(currentRingNum) || 0) + (Number(issue.qtyOffset) || 0));
  }
  return Number(issue ? issue.qtyCurrent : 0) || 0;
}

export function openCount(issues) {
  return issues.filter((i) => i.status === "open").length;
}

export function forMachine(issues, machine) {
  return (Array.isArray(issues) ? issues : []).filter((i) => {
    const m = i.machine || "TBM1";
    return m === "all" || m === machine;
  });
}

export function splitAndSort(issues) {
  const open = issues
    .filter((i) => i.status === "open")
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const closed = issues
    .filter((i) => i.status === "closed")
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return { open, closed };
}

export function validateForm(form) {
  const errors = {};
  if (!form.title || !form.title.trim()) errors.title = "กรุณากรอกหัวข้อ";
  if (!form.severity || !SEVERITY[form.severity]) errors.severity = "กรุณาเลือกระดับ";
  if (form.qtyEnabled) {
    if (form.qtyTarget === "" || isNaN(Number(form.qtyTarget))) errors.qtyTarget = "ตัวเลขไม่ถูกต้อง";
    if (!form.qtyAuto && (form.qtyCurrent === "" || isNaN(Number(form.qtyCurrent)))) errors.qtyCurrent = "ตัวเลขไม่ถูกต้อง";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

function normalize(form) {
  return {
    machine: ISSUE_MACHINES.includes(form.machine) ? form.machine : "TBM1",
    title: form.title.trim(),
    severity: form.severity,
    qtyEnabled: !!form.qtyEnabled,
    qtyAuto: !!(form.qtyEnabled && form.qtyAuto),
    qtyOffset: form.qtyEnabled && form.qtyAuto ? (Number(form.qtyOffset) || 0) : 0,
    qtyCurrent: form.qtyEnabled && !form.qtyAuto ? Number(form.qtyCurrent) : null,
    qtyTarget: form.qtyEnabled ? Number(form.qtyTarget) : null,
    qtyUnit: form.qtyEnabled ? (form.qtyUnit || "").trim() : "",
    date: form.date || "",
    detail: (form.detail || "").trim(),
    ringCH: (form.ringCH || "").trim(),
  };
}

export function upsertIssue(issues, form, now = new Date().toISOString()) {
  const base = normalize(form);
  if (form.id) {
    return issues.map((i) => (i.id === form.id ? { ...i, ...base, updatedAt: now } : i));
  }
  return [{ id: makeIssueId(), ...base, status: "open", createdAt: now, updatedAt: now }, ...issues];
}

export function setIssueStatus(issues, id, status, now = new Date().toISOString()) {
  return issues.map((i) => (i.id === id ? { ...i, status, updatedAt: now } : i));
}

export function removeIssue(issues, id) {
  return issues.filter((i) => i.id !== id);
}

export function loadIssues() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export function persistIssues(issues) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(issues));
  } catch (e) {
    /* ignore quota / serialization errors */
  }
}
