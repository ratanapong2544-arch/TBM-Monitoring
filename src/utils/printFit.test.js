import { fitScale, PAGE_PX } from "./printFit";

describe("fitScale", () => {
  test("shrinks an oversized box to fit one landscape page", () => {
    // 2000px-wide chart onto a 1020px landscape page → ~0.5, never upscaled
    const s = fitScale(2000, 700, "landscape", true);
    expect(s).toBeLessThan(1);
    expect(2000 * s).toBeLessThanOrEqual(PAGE_PX.landscape.w);
    expect(700 * s).toBeLessThanOrEqual(PAGE_PX.landscape.h);
  });

  test("never upscales content already smaller than the page", () => {
    expect(fitScale(400, 300, "landscape", true)).toBeLessThanOrEqual(1);
    expect(fitScale(400, 300, "portrait", true)).toBeLessThanOrEqual(1);
  });

  test("onePage=false fits width only and ignores height (multi-page report)", () => {
    // very tall report: height must NOT drive the scale down
    const wide = fitScale(1400, 6000, "portrait", false);
    const onePage = fitScale(1400, 6000, "portrait", true);
    expect(wide).toBeGreaterThan(onePage);
    expect(1400 * wide).toBeLessThanOrEqual(PAGE_PX.portrait.w);
  });

  test("guards against zero / missing dimensions", () => {
    expect(fitScale(0, 500, "portrait", true)).toBe(1);
    expect(fitScale(1000, 0, "portrait", true)).toBeGreaterThan(0); // width-only fallback, no divide-by-zero
  });

  test("result fits within the page on the limiting axis", () => {
    const s = fitScale(1500, 1200, "landscape", true);
    expect(1500 * s).toBeLessThanOrEqual(PAGE_PX.landscape.w + 0.01);
  });
});
