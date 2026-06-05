import { MACHINE_CONFIG, getMachineConfig } from "./machineConfig";

test("has TBM1 + TBM2 config with tbmNo + location", () => {
  expect(MACHINE_CONFIG.TBM1.tbmNo).toBe("TBM1");
  expect(MACHINE_CONFIG.TBM2.tbmNo).toBe("TBM2");
  expect(typeof MACHINE_CONFIG.TBM1.location).toBe("string");
});
test("getMachineConfig returns config; unknown falls back to TBM1", () => {
  expect(getMachineConfig("TBM2").tbmNo).toBe("TBM2");
  expect(getMachineConfig("???")).toBe(MACHINE_CONFIG.TBM1);
  expect(getMachineConfig(undefined)).toBe(MACHINE_CONFIG.TBM1);
});
