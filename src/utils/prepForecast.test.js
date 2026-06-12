import {
  dayDiff, loadForecastMode, saveForecastMode,
} from "./prepForecast";

beforeEach(() => localStorage.clear());

test("dayDiff: นับวันแบบมีเครื่องหมาย", () => {
  expect(dayDiff("2026-06-01", "2026-06-11")).toBe(10);
  expect(dayDiff("2026-06-11", "2026-06-01")).toBe(-10);
  expect(dayDiff("2026-06-30", "2026-07-01")).toBe(1);
});

test("forecast mode: default remaining, save/load rate, ค่าขยะ → remaining", () => {
  expect(loadForecastMode()).toBe("remaining");
  saveForecastMode("rate");
  expect(loadForecastMode()).toBe("rate");
  localStorage.setItem("tbmPrepForecastMode", "junk");
  expect(loadForecastMode()).toBe("remaining");
});
