import { GAS_URL } from './constants';

export const apiCall = async (action, data) => {
  if (GAS_URL === "YOUR_WEB_APP_URL_HERE" || !GAS_URL.startsWith("http")) throw new Error("URL ของ Google Apps Script ยังไม่ได้ถูกตั้งค่า");
  try {
    const response = await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({ action, data }),
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow",
    });
    const textData = await response.text();
    const trimmedData = textData.trim();
    if (trimmedData.startsWith("<")) throw new Error("ระบบติด Permission HTML กรุณาตั้งค่า GAS เป็น 'ทุกคน (Anyone)'");
    const parsed = JSON.parse(trimmedData);
    // S4: surface backend error (กัน typo action / busy lock save เงียบ) — caller ต้อง catch + toast
    if (parsed && parsed.status === "error") throw new Error(parsed.message || "บันทึกไม่สำเร็จ");
    return parsed;
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
};

// AI summary ผ่าน GAS proxy — ไม่มี API key ใน client bundle (key เก็บใน Script Properties ฝั่ง GAS)
export const generateGeminiSummary = async (promptText, systemText) => {
  const res = await apiCall('generateSummary', { prompt: promptText, system: systemText });
  if (res && res.status === 'success' && res.text) return res.text;
  throw new Error((res && res.message) || 'AI summary ไม่สำเร็จ');
};
