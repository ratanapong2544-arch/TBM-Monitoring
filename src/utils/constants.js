export const GAS_URL = "https://script.google.com/macros/s/AKfycbyRUl5BVmZYDhw_Z0Uo2LWBLmaQAaOjJZR4jLGw-MuxHIFcKEhu7FBF9tV33JAnKz1aTw/exec";
export const THEORETICAL_VOL = 3.1;
export const VOL_120 = 3.72;
export const VOL_150 = 4.65;
export const VOL_80 = 2.48;
export const VOL_50 = 1.55;

// Tunnel route constants
export const CH_START_P36 = 8769.960; // CH เริ่มต้นของ P36
export const CH_EXCAV_START = 8830.488; // CH เริ่มต้นขุดเจาะ (Center Shaft IS4)
export const TOTAL_ROUTE_DISTANCE = 8874.683; // ระยะทางรวมทั้งหมด (เมตร)

// Route segments: IS4-1 → IS3 → IS2 → IS1
export const ROUTE_SEGMENTS = [
  { id: "IS4-1", label: "IS4-1", distance: 0, color: "#6366f1" },
  { id: "IS3", label: "IS3", distance: 3065.962, color: "#8b5cf6" },
  { id: "IS2", label: "IS2", distance: 7159.586, color: "#a855f7" },
  { id: "IS1", label: "IS1", distance: 8874.683, color: "#c084fc" },
];

// Google Drive folder สำหรับสไลด์รูปภาพหน้างานบน Dashboard (per-machine)
// ⚠ โฟลเดอร์ต้องแชร์ให้บัญชีเจ้าของ GAS เข้าถึงได้ (Anyone with the link)
export const DRIVE_PHOTOS_FOLDER = {
  TBM1: "1gLXcr1A1xuzVbDxVyCsdGA7s_T91H2XU",
  TBM2: "1gS059DzH6mjbVPKG2kLE_KwBe2ADXvr9",
};
export const drivePhotosFolder = (machine) => DRIVE_PHOTOS_FOLDER[machine] || DRIVE_PHOTOS_FOLDER.TBM1;
export const DRIVE_PHOTOS_FOLDER_ID = DRIVE_PHOTOS_FOLDER.TBM1; // default (backward compat)
