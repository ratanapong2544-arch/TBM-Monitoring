import { GAS_URL } from "./constants";
import { ApiFailure, classifyHttpFailure, parseGasResponse, toApiFailure } from "../offline/apiTransport";

export { ApiFailure, classifyHttpFailure, parseGasResponse };

// Retained for the existing online-only callers. Offline reads use apiTransport directly.
export const apiCall = async (action, data) => {
  if (GAS_URL === "YOUR_WEB_APP_URL_HERE" || !GAS_URL.startsWith("http")) throw new Error("URL ของ Google Apps Script ยังไม่ได้ถูกตั้งค่า");
  try {
    const response = await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({ action, data }),
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow",
    });
    if (!response.ok) throw classifyHttpFailure(response.status);
    return await parseGasResponse(response);
  } catch (error) {
    console.error("API Error:", error);
    throw toApiFailure(error);
  }
};

export const generateGeminiSummary = async (promptText, systemText) => {
  const res = await apiCall("generateSummary", { prompt: promptText, system: systemText });
  if (res && res.status === "success" && res.text) return res.text;
  throw new Error((res && res.message) || "AI summary ไม่สำเร็จ");
};
