import { isViewerMode, VIEWER_TABS } from "./viewerMode";

describe("isViewerMode", () => {
  test("view=1 → true", () => { expect(isViewerMode("?view=1")).toBe(true); });
  test("view=0 → false", () => { expect(isViewerMode("?view=0")).toBe(false); });
  test("no param → false", () => { expect(isViewerMode("")).toBe(false); });
  test("other param → false", () => { expect(isViewerMode("?foo=1")).toBe(false); });
  test("view=1 with others → true", () => { expect(isViewerMode("?x=2&view=1")).toBe(true); });
});

describe("VIEWER_TABS", () => {
  test("covers dashboard group tabs", () => {
    expect(VIEWER_TABS).toEqual(expect.arrayContaining(["dashboard", "analysis", "prep_gantt", "performance"]));
  });
  test("excludes record/overview/issues tabs", () => {
    ["overview", "record", "datalog", "shift_report", "report", "record_daily", "daily_report"].forEach((t) =>
      expect(VIEWER_TABS).not.toContain(t));
  });
});
