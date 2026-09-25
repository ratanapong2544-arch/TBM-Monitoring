// The daily text is composed for the machine on screen, on both ways out of the Stats Report: the
// "สรุปรายงานประจำวัน" prompt sent to Gemini and the "สร้าง Daily Report" draft. TBM2 2026-09-25:
// both printed TBM1's "เริ่มต้น CH 8+830.488 (Center Shaft IS4) … = 8854.288 m" off TBM2's
// unsurveyed ring CH. No @testing-library here → react-dom/client + act, like the other *.test.jsx.
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../utils/api", () => ({ generateGeminiSummary: jest.fn() }));

import { generateGeminiSummary } from "../../utils/api";
import ReportView from "./ReportView";

// CRA sets `resetMocks: true`, which strips the factory's implementation before every test
beforeEach(() => generateGeminiSummary.mockResolvedValue("สรุป"));

// TBM2 as the sheet holds it: P3 the steel ring at 0.90 m, P19 excavated 21/09 and its CH stepped
// down from 0+000.00 by the form, not surveyed
const RINGS = Array.from({ length: 19 }, (_, i) => ({
  id: `seg_p${i + 1}`, ringNo: `P${i + 1}`, typeRing: "C1", keyPos: 7,
  length: i === 2 ? 0.9 : 1.4, date: i === 18 ? "2026-09-21" : "2026-09-01", shift: "Day",
  status: "Completed", installType: "Permanent", finishCH: i === 18 ? "-0+023.80" : "",
}));

function render(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(element); });
  return { container, unmount: () => act(() => { root.unmount(); container.remove(); }) };
}

const button = (container, pattern) => [...container.querySelectorAll("button")].find((b) => pattern.test(b.textContent));
const click = (element) => act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

function pickDate(container, value) {
  act(() => {
    const field = container.querySelector('input[type="date"]');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

test("TBM2: the Gemini prompt and the Daily Report draft both give the ring-length distance", async () => {
  const onCreateDaily = jest.fn();
  const view = render(
    <ReportView segmentRecords={RINGS} groutRecords={[]} shiftReports={[]} machine="TBM2"
      projectInfo={{ tbmNo: "TBM2", location: "L" }} onCreateDaily={onCreateDaily} />
  );
  pickDate(view.container, "2026-09-21");

  await click(button(view.container, /สรุปรายงานประจำวัน/));
  expect(generateGeminiSummary.mock.calls[0][0]).toContain("-เริ่มต้น รัชดา ขุดเจาะถึง Ring P19 = 26.100 m");

  await click(button(view.container, /สร้าง Daily Report/));
  expect(onCreateDaily.mock.calls[0][0].workLogText).toContain("-เริ่มต้น รัชดา ขุดเจาะถึง Ring P19 = 26.100 m");
  view.unmount();
});
