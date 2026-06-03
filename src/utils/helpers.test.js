import { shiftEventMinutes } from "./helpers";

describe("shiftEventMinutes", () => {
  test("day shift normal", () => {
    expect(shiftEventMinutes("08:00", "10:00", "Day")).toBe(120);
  });
  test("night shift normal", () => {
    expect(shiftEventMinutes("20:00", "22:00", "Night")).toBe(120);
  });
  test("night shift crossing midnight", () => {
    expect(shiftEventMinutes("23:00", "01:00", "Night")).toBe(120);
  });
  test("clamps to 720 cap", () => {
    expect(shiftEventMinutes("18:00", "20:00", "Day")).toBe(60);
  });
  test("missing time returns 0", () => {
    expect(shiftEventMinutes("", "10:00", "Day")).toBe(0);
    expect(shiftEventMinutes("08:00", null, "Day")).toBe(0);
  });
  test("end before start returns 0 (not negative)", () => {
    expect(shiftEventMinutes("10:00", "08:00", "Day")).toBe(0);
  });
});
