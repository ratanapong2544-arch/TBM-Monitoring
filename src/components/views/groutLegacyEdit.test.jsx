import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import GroutDashboardView from "./GroutDashboardView";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Grout rows P1–P651 keep their volumes in primaryPartA/B and leave partA/partB blank. Editing such
// a row — even only its pressure — saved total 0 and ratio 0%, because the save summed partA+partB.
const legacy = { id: "grout_p170", ringNo: "P170", date: "2026-02-26T17:00:00.000Z", shift: "Day", partA: "", partB: "",
  primaryPartA: 3.07, primaryPartB: 0.38, total: 3.46, ratio: 111.6, pressure: 3, groutPass: "1st Pass" };

test("editing an old grout row keeps its volume", async () => {
  const onMutate = jest.fn(async () => ({}));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<GroutDashboardView groutRecords={[legacy]} segmentRecords={[]} machine="TBM1" onMutate={onMutate} syncMeta={{}} />));
  act(() => container.querySelector("tbody tr").dispatchEvent(new MouseEvent("click", { bubbles: true })));
  const btn = (re) => [...container.querySelectorAll("button")].find((b) => re.test(b.textContent));
  act(() => container.querySelector('button[title="Edit"]').dispatchEvent(new MouseEvent("click", { bubbles: true })));
  const a = container.querySelector('input[name="primaryPartA"], input[name="partA"]');
  expect(a.value).toBe("3.07");
  const p = container.querySelector('input[name="pressure"]');
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(p, "3.5"); p.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => btn(/Save Changes/).dispatchEvent(new MouseEvent("click", { bubbles: true })));

  expect(onMutate).toHaveBeenCalledTimes(1);
  const sent = onMutate.mock.calls[0][0].payload;
  expect(sent.total).toBeCloseTo(3.45, 6);
  expect(sent.ratio).toBeGreaterThan(100);
  act(() => root.unmount());
});
