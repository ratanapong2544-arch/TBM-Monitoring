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
