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
    return JSON.parse(trimmedData);
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
};

export const generateGeminiSummary = async (promptText, systemText) => {
  const apiKey = "AIzaSyCjGoPy_Ci-LgJTp9yLVDKg5ya0_gdY5gU";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.trim()}`;
  const payload = {
    contents: [{ parts: [{ text: promptText }] }],
    systemInstruction: { parts: [{ text: systemText || "คุณคือผู้ช่วยวิศวกรควบคุมงานก่อสร้างอุโมงค์ TBM หน้าที่ของคุณคือการนำข้อมูลดิบไปจัดเรียงและสรุปใส่ใน Template รายงานที่กำหนดให้อย่างถูกต้องและเป๊ะที่สุด" }] }
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
        const errDetails = await response.text();
        throw new Error(`HTTP ${response.status} - ${errDetails}`);
      }
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
      throw new Error("No text in response");
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(res => setTimeout(res, delays[i]));
    }
  }
};
