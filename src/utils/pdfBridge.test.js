import { HELPER_URL, checkHelper, buildPdf, downloadBundle } from "./pdfBridge";

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => { jest.resetAllMocks(); });

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
