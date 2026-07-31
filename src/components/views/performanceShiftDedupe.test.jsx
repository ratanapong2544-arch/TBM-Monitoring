import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import PerformanceView from "./PerformanceView";

// Two rows can describe ONE shift, and this page counted each of them as a shift of its own.
// Nothing dedupes shift reports — not the sheet, not the merge — and since Task 8 the queue can
// supply the second row on its own: a shift report created with no link is refused when the link
// returns (GAS answers `conflict` against the row already on the sheet for that date and shift),
// and the refused copy stays in the list so the crew can see it. From then on this device reported
// 24 hours of availability for a 12 hour shift — utilization halved — and counted every delay bar
// present in both rows twice, with nothing on the page saying the number was wrong. It is a page
// that gets printed for the owner.
function render(element) {
  let container;
  act(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    createRoot(container).render(element);
  });
  return container;
}

const muckFull = end => ({ "Muck Full": [{ start: "20:00", end, label: "รอรถขนดิน" }] });

test("one shift counts once however many rows describe it", () => {
  const container = render(<PerformanceView
    segmentRecords={[]}
    shiftReports={[
      // the row the sheet holds
      { id: "sr_server", date: "2026-07-30", shift: "Night", events: muckFull("21:00"), syncStatus: "synced" },
      // the crew's own copy, refused by the server and still on screen
      { id: "sr_local", date: "2026-07-30", shift: "Night", events: muckFull("22:00"), syncStatus: "conflict" },
    ]}
    filterState={{}}
  />);

  expect(container.textContent).toContain("จาก 1 กะ");
  // and the delay is counted once, from the row the sheet actually holds — the local copy carries
  // two hours. Preferring the first is what makes that the sheet's row without reading a sync
  // status: the merge appends local-only rows after the server's, and a relaunch replays that same
  // order from the stored key list.
  expect(container.textContent).toContain("1.0 ชม.");
  expect(container.textContent).not.toContain("2.0 ชม.");
});

test("two different shifts are still two shifts", () => {
  const container = render(<PerformanceView
    segmentRecords={[]}
    shiftReports={[
      { id: "a", date: "2026-07-30", shift: "Night", events: muckFull("21:00") },
      { id: "b", date: "2026-07-30", shift: "Day", events: {} },
      { id: "c", date: "2026-07-29", shift: "Night", events: {} },
    ]}
    filterState={{}}
  />);

  expect(container.textContent).toContain("จาก 3 กะ");
});

test("one shift stored under two date formats is still one shift", () => {
  // GAS reads the sheet's date cell as a Date and serializes it as UTC ISO; a report composed on
  // the device carries the Asia/Bangkok calendar date. Comparing the raw fields would let the same
  // shift through twice, which is exactly the case this dedupe exists for.
  const container = render(<PerformanceView
    segmentRecords={[]}
    shiftReports={[
      { id: "sr_server", date: "2026-07-29T17:00:00.000Z", shift: "Night", events: muckFull("21:00") },
      { id: "sr_local", date: "2026-07-30", shift: "Night", events: muckFull("22:00") },
    ]}
    filterState={{}}
  />);

  expect(container.textContent).toContain("จาก 1 กะ");
});
