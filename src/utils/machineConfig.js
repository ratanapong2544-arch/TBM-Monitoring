// SP-A: per-machine config (tbmNo + location). route/chainage values → SP-C.
export const MACHINE_CONFIG = {
  TBM1: { tbmNo: "TBM1", location: "อุโมงค์จากบ่อ IS4 ถึง บ่อ IS2" },
  TBM2: { tbmNo: "TBM2", location: "อุโมงค์ TBM2 (กำหนดภายหลัง)" },
};

export const getMachineConfig = (m) => MACHINE_CONFIG[m] || MACHINE_CONFIG.TBM1;
