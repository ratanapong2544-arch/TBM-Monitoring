// SP3: bridge ไป dr-helper local server (Flask). แยกจาก api.js (api.js = GAS).
// HELPER_URL = config (ไม่ใช่ secret) — local helper บนเครื่องเดียวกับ Word
export const HELPER_URL = "http://127.0.0.1:8765";

function toBundle(report, photos, screenshot) {
  const clean = { ...(report || {}) };
  delete clean._photos;
  delete clean._screenshot;
  return { report: clean, photos: photos || [], screenshot: screenshot || null };
}

export async function checkHelper() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${HELPER_URL}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    return !!(res && res.ok);
  } catch (e) {
    return false;
  }
}

export async function buildPdf(report, photos, screenshot) {
  const res = await fetch(`${HELPER_URL}/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toBundle(report, photos, screenshot)),
  });
  if (!res.ok) {
    let msg = `helper error ${res.status}`;
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) { /* ignore */ }
    throw new Error(msg);
  }
  return await res.blob();
}

export function downloadBundle(report, photos, screenshot, filename = "daily-report-bundle.json") {
  const blob = new Blob([JSON.stringify(toBundle(report, photos, screenshot))], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function openPdfBlob(blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
