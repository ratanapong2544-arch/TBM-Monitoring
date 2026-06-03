import { formatDisplayDate } from './formatters';

export const loadHtml2Canvas = async () => {
  if (window.html2canvas) return window.html2canvas;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    script.onload = () => resolve(window.html2canvas);
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

export const getLogicalShiftDate = (timeStr, activityShift, recordDate, recordShift) => {
  if (!timeStr || !recordDate) return formatDisplayDate(recordDate);
  const [h] = timeStr.split(':').map(Number);
  let ad = new Date(recordDate);

  if (recordShift === "Day" && activityShift === "Night" && h < 7) {
    ad.setDate(ad.getDate() - 1);
  }

  return formatDisplayDate(ad);
};

export const offsetRingNo = (currentRingStr, offset) => {
  if (!currentRingStr) return "";
  const match = String(currentRingStr).match(/^(\D+)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const numStr = match[2];
    const nextNum = Math.max(0, parseInt(numStr, 10) + offset);
    return `${prefix}${String(nextNum).padStart(numStr.length, "0")}`;
  }
  return String(currentRingStr);
};

export const getRingByOffsetFromHistory = (baseRingNo, offset, history) => {
  if (!baseRingNo || !history || history.length === 0) return offsetRingNo(baseRingNo, offset);
  const index = history.findIndex((r) => String(r.ringNo).toUpperCase() === String(baseRingNo).toUpperCase());
  if (index !== -1) {
    const targetIndex = index + offset;
    if (targetIndex >= 0 && targetIndex < history.length) {
      return history[targetIndex].ringNo;
    }
  }
  return offsetRingNo(baseRingNo, offset);
};

export const getRingNumeric = (ringStr) => {
  if (!ringStr) return 0;
  const match = String(ringStr).match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
};

export const calculateSoilVolume = (length) => {
  const l = parseFloat(length) || 0;
  const radius = 6.3 / 2;
  const volume = Math.PI * Math.pow(radius, 2) * l;
  return Number(volume || 0).toFixed(2);
};

export const handleFileUpload = (e, setFormData) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({ ...prev, imageBase64: reader.result, imageName: `${Date.now()}_${file.name}` }));
    };
    reader.readAsDataURL(file);
  }
};

export const safeParseJSON = (jsonString, fallback) => {
  try {
    return typeof jsonString === 'string' ? JSON.parse(jsonString) : (jsonString || fallback);
  } catch (e) {
    return fallback;
  }
};

// นาทีของ event ใน shift หนึ่ง (อ้างอิงจุดเริ่มกะ: Day 07:00 / Night 19:00),
// รองรับคร่อมเที่ยงคืน + clamp 0..720 (12 ชม./กะ) — mirror ตรรกะใน ShiftReportView
export const shiftEventMinutes = (start, end, shift) => {
  const startH = shift === "Night" ? 19 : 7;
  const toMin = (t) => {
    if (!t) return null;
    const parts = String(t).split(":");
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (isNaN(h) || isNaN(m)) return null;
    let hh = h;
    if (shift === "Night") { if (hh < 19) hh += 24; } else { if (hh < 7) hh += 24; }
    return hh * 60 + m - startH * 60;
  };
  let s = toMin(start);
  let e = toMin(end);
  if (s === null || e === null) return 0;
  s = Math.max(0, Math.min(s, 720));
  e = Math.max(0, Math.min(e, 720));
  if (e < s) e = s;
  return e - s;
};
