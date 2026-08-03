import { HELPER_URL, HELPER_UNAVAILABLE_MESSAGE, checkHelper, buildPdf, downloadBundle } from "./pdfBridge";

const setOnLine = value => Object.defineProperty(window.navigator, "onLine", { value, configurable: true });

beforeEach(() => { global.fetch = jest.fn(); setOnLine(true); });
afterEach(() => { jest.resetAllMocks(); setOnLine(true); });

test("a laptop with its wifi off still gets its PDF from the helper on the same machine", async () => {
  // The first version of this guard refused to ask whenever `navigator.onLine` was false — but that
  // means no network INTERFACE is up, and the helper is on loopback. This very test, written to
  // defend the guard, mocked a live answering helper and asserted the app would ignore it: on a
  // laptop running `python server.py` with the wifi off, the crew got the bundle-and-print message
  // instead of the PDF that was one request away.
  setOnLine(false);
  global.fetch.mockResolvedValue({ ok: true });

  await expect(checkHelper()).resolves.toBe(true);
  expect(global.fetch).toHaveBeenCalled();
});

test("the fallback message points at something a phone can actually do", () => {
  // It used to say "run python build_report.py" — advice for the office PC, given to whoever is
  // holding the phone. The bundle download stays; the browser's own print is what a phone has.
  expect(HELPER_UNAVAILABLE_MESSAGE).toMatch(/มือถือ|โทรศัพท์/);
  expect(HELPER_UNAVAILABLE_MESSAGE).toMatch(/พิมพ์|print/i);
  expect(HELPER_UNAVAILABLE_MESSAGE).toContain("bundle");
});

test("HELPER_URL is loopback", () => {
  expect(HELPER_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
});

test("checkHelper true when /health ok, false on error", async () => {
  global.fetch.mockResolvedValueOnce({ ok: true });
  expect(await checkHelper()).toBe(true);
  global.fetch.mockRejectedValueOnce(new Error("refused"));
  expect(await checkHelper()).toBe(false);
});

test("buildPdf strips _photos/_screenshot from report and posts bundle", async () => {
  const blob = new Blob(["%PDF"], { type: "application/pdf" });
  global.fetch.mockResolvedValueOnce({ ok: true, blob: async () => blob });
  const report = { date: "d", area: "a", _photos: ["x"], _screenshot: "y" };
  const res = await buildPdf(report, ["p1"], "shot");
  expect(res).toBe(blob);
  const [url, opts] = global.fetch.mock.calls[0];
  expect(url).toBe(`${HELPER_URL}/build`);
  const body = JSON.parse(opts.body);
  expect(body.report._photos).toBeUndefined();
  expect(body.report._screenshot).toBeUndefined();
  expect(body.photos).toEqual(["p1"]);
  expect(body.screenshot).toBe("shot");
});

test("buildPdf throws on non-ok", async () => {
  global.fetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "boom" }) });
  await expect(buildPdf({}, [], null)).rejects.toThrow("boom");
});

test("downloadBundle creates an anchor + object url", () => {
  const click = jest.fn();
  const a = { click, href: "", download: "", remove: jest.fn() };
  jest.spyOn(document, "createElement").mockReturnValue(a);
  jest.spyOn(document.body, "appendChild").mockImplementation(() => {});
  global.URL.createObjectURL = jest.fn(() => "blob:x");
  global.URL.revokeObjectURL = jest.fn();
  downloadBundle({ date: "d", _photos: [] }, ["p"], null);
  expect(click).toHaveBeenCalled();
  expect(a.download).toMatch(/\.json$/);
});
