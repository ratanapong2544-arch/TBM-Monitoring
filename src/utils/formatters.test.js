import { formatDisplayDate, formatDisplayTime } from "./formatters";

// Every stamp in this app is Bangkok's, and nothing pinned it. Removing the time zone from either
// helper left the whole suite green while every date and time in the app silently shifted to the
// device's own zone — seven hours out for a crew reading a UTC-set phone.
test("a date is the Bangkok calendar date, not the browser's", () => {
  // 17:30Z on the 29th is already the 30th in Bangkok
  expect(formatDisplayDate("2026-07-29T17:30:00.000Z")).toBe("2026-07-30");
});

test("a time is the Bangkok clock time", () => {
  expect(formatDisplayTime("2026-07-29T17:30:00.000Z")).toBe("00:30");
});
