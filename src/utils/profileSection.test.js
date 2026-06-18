import { linScale, parseRingNo } from "./profileSection";

test("linScale: map ค่าเชิงเส้นระหว่างสองช่วง", () => {
  expect(linScale(5, [0, 10], [0, 100])).toBe(50);
  expect(linScale(0, [0, 10], [20, 120])).toBe(20);
  expect(linScale(10, [0, 10], [20, 120])).toBe(120);
  expect(linScale(8400, [8400, 8000], [54, 884])).toBe(54);
  expect(linScale(8000, [8400, 8000], [54, 884])).toBe(884);
});

test("parseRingNo: numeric → int, อื่นๆ → null", () => {
  expect(parseRingNo("572")).toBe(572);
  expect(parseRingNo(572)).toBe(572);
  expect(parseRingNo("T7")).toBeNull();
  expect(parseRingNo("")).toBeNull();
  expect(parseRingNo(null)).toBeNull();
});
