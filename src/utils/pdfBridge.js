// SP3: bridge ไป dr-helper local server (Flask). แยกจาก api.js (api.js = GAS).
// HELPER_URL = config (ไม่ใช่ secret) — local helper บนเครื่องเดียวกับ Word
export const HELPER_URL = "http://127.0.0.1:8765";

function toBundle(report, photos, screenshot) {
  const clean = { ...(report || {}) };
  delete clean._photos;
  delete clean._screenshot;
  return { report: clean, photos: photos || [], screenshot: screenshot || null };
}

// What to tell the crew when the helper is not there. The old sentence told whoever was holding the
// phone to run `python build_report.py` — advice for the office PC. The bundle download still
// happens; on a phone, the browser's own print is the way to a PDF, and this app puts a print on
// every page.
export const HELPER_UNAVAILABLE_MESSAGE = "ไม่พบ helper (โปรแกรมบนเครื่อง PC) — ดาวน์โหลดไฟล์ bundle ให้แล้ว · บนมือถือให้ใช้ปุ่มพิมพ์/Print ของเบราว์เซอร์แทน · บน PC: รัน python server.py แล้วลองใหม่ หรือ python build_report.py --bundle <ไฟล์> --out report.pdf";

// NO `navigator.onLine` guard here, deliberately. `onLine === false` means no network INTERFACE is
// up, and loopback is not affected by it: a laptop running `python server.py` with its wifi off has a
// working helper, and refusing to ask would hand the crew the bundle-and-print message instead of the
// PDF the helper was about to make. The saving was imaginary too — a closed port refuses in
// milliseconds; the 2s abort only elapses if something is listening and hangs.
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
