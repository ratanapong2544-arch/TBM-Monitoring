import { fitScale, PAGE_PX, installPrintFit, setPrintTarget, fitAndPrint } from "./printFit";

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

describe("installPrintFit — ดัก Ctrl+P", () => {
  let el, cleanup, printSpy;

  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    el = document.createElement("div");
    document.body.appendChild(el);
    // jsdom ไม่คำนวณ layout — ปลอมขนาดกล่องที่จะปริ้น
    Object.defineProperty(el, "scrollWidth", { value: 2000, configurable: true });
    Object.defineProperty(el, "scrollHeight", { value: 700, configurable: true });
    printSpy = jest.fn();
    window.print = printSpy;
  });

  afterEach(() => { if (cleanup) cleanup(); cleanup = null; });

  const fire = (name) => window.dispatchEvent(new Event(name));

  test("beforeprint ย่อกล่องของหน้าปัจจุบันให้พอดีกระดาษ", () => {
    cleanup = installPrintFit(() => ({ el, orientation: "landscape", onePage: true }));
    fire("beforeprint");
    expect(Number(el.style.zoom)).toBeCloseTo(fitScale(2000, 700, "landscape", true), 5);
  });

  test("beforeprint ตั้ง @page ตามแนวที่หน้านั้นกำหนด", () => {
    cleanup = installPrintFit(() => ({ el, orientation: "landscape", onePage: true }));
    fire("beforeprint");
    const style = document.head.querySelector("style[data-print-fit]");
    expect(style.textContent).toContain("size: A4 landscape");
  });

  test("afterprint คืนสภาพหน้าจอกลับหมด ไม่เหลือ zoom ค้าง", () => {
    cleanup = installPrintFit(() => ({ el, orientation: "landscape", onePage: true }));
    fire("beforeprint");
    fire("afterprint");
    expect(el.style.zoom).toBe("");
    expect(el.style.width).toBe("");
    expect(document.head.querySelector("style[data-print-fit]")).toBeNull();
  });

  test("ปุ่มปริ้นเฉพาะส่วนชนะค่า default ของหน้า", () => {
    const chart = document.createElement("div");
    document.body.appendChild(chart);
    Object.defineProperty(chart, "scrollWidth", { value: 1000, configurable: true });
    Object.defineProperty(chart, "scrollHeight", { value: 500, configurable: true });

    cleanup = installPrintFit(() => ({ el, orientation: "landscape", onePage: true }));
    setPrintTarget(chart, { orientation: "portrait", onePage: true });
    fire("beforeprint");

    expect(Number(chart.style.zoom)).toBeGreaterThan(0); // ตัวที่เลือกถูกย่อ
    expect(el.style.zoom).toBeFalsy();                   // ทั้งหน้าไม่ถูกแตะ (jsdom: zoom ที่ไม่เคย set = undefined)
    expect(document.head.querySelector("style[data-print-fit]").textContent).toContain("portrait");
  });

  test("afterprint ล้าง override — ปริ้นครั้งถัดไปกลับไปใช้ทั้งหน้า", () => {
    const chart = document.createElement("div");
    document.body.appendChild(chart);
    Object.defineProperty(chart, "scrollWidth", { value: 1000, configurable: true });
    Object.defineProperty(chart, "scrollHeight", { value: 500, configurable: true });

    cleanup = installPrintFit(() => ({ el, orientation: "landscape", onePage: true }));
    setPrintTarget(chart, { orientation: "portrait", onePage: true });
    fire("beforeprint");
    fire("afterprint");

    fire("beforeprint");                          // Ctrl+P รอบสอง
    expect(el.style.zoom).not.toBe("");           // คราวนี้ต้องเป็นทั้งหน้า
  });

  test("fitAndPrint ไม่ย่อซ้อน — ปุ่มเดิมต้องได้ zoom ชั้นเดียว", () => {
    cleanup = installPrintFit(() => ({ el, orientation: "landscape", onePage: true }));
    // ปุ่มเดิมเรียกแบบนี้ -> ต้องปลุก handler ให้ fit ให้ ไม่ใช่ fit เองแล้วโดน fit ทับ
    printSpy.mockImplementation(() => fire("beforeprint"));
    fitAndPrint(el, { orientation: "landscape", onePage: true });

    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(Number(el.style.zoom)).toBeCloseTo(fitScale(2000, 700, "landscape", true), 5);
  });

  test("ไม่มีกล่องให้ปริ้น (หน้ายังโหลดไม่เสร็จ) ต้องไม่ throw", () => {
    cleanup = installPrintFit(() => ({ el: null, orientation: "portrait", onePage: true }));
    expect(() => fire("beforeprint")).not.toThrow();
    expect(() => fire("afterprint")).not.toThrow();
  });

  test("cleanup ถอด listener ออกจริง", () => {
    cleanup = installPrintFit(() => ({ el, orientation: "landscape", onePage: true }));
    cleanup();
    cleanup = null;
    fire("beforeprint");
    expect(el.style.zoom).toBeFalsy(); // handler ถูกถอดแล้ว -> ไม่มีใครแตะ zoom
  });
});
