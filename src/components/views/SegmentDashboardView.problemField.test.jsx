// The segment sheet's column for the crew's note is `problem` (SEG_HEADERS in gas/Code.js). The app
// called it `remark`, and GAS builds each row as headers.map(h => obj[h] ?? '') — so a note typed
// here was written to a key no header claimed, the `problem` cell was blanked, and the save reported
// success. 925 rings on production, not one of them with a note. These two assertions are the seam.
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import SegmentDashboardView from "./SegmentDashboardView";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const REC = {
  id: "seg_1", ringNo: "P600", typeRing: "C1", keyPos: "16",
  // as the server hands it back — a full ISO instant, not a date-only string
  date: "2026-08-20T17:00:00.000Z", shift: "Night",
  startCH: "8+013.000", finishCH: "8+011.600", length: "1.40", soilVolume: "43.64",
  status: "Completed", installType: "Permanent", soilType: "ทราย",
  excavShift: "Night", installShift: "Night",
  excavStartTime: "21:30", excavEndTime: "00:14", installStartTime: "00:33", installEndTime: "01:00",
  problem: "",
};

function setValue(el, value) {
  const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype
    : el.tagName === "SELECT" ? window.HTMLSelectElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}

function mount() {
  const onMutate = jest.fn(() => Promise.resolve({}));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<SegmentDashboardView segmentRecords={[REC]} machine="TBM1" onMutate={onMutate} syncMeta={{}} />); });
  const click = (el) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  click(container.querySelector("tbody tr"));
  click(container.querySelector('button[title="Edit"]'));
  return {
    container, onMutate, click,
    cleanup: () => { act(() => { root.unmount(); }); document.body.removeChild(container); },
  };
}

test("the note the crew types travels under the column the sheet actually has", async () => {
  const h = mount();
  const box = h.container.querySelector('textarea[name="problem"]');
  expect(box).not.toBeNull();
  setValue(box, "ขนดินติดขัด รอรถ");

  const button = [...h.container.querySelectorAll("button")].find((b) => b.textContent.includes("Save Changes"));
  await act(async () => { button.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const payload = h.onMutate.mock.calls[0][0].payload;

  expect(payload.problem).toBe("ขนดินติดขัด รอรถ");
  expect(payload.remark).toBeUndefined();   // the key GAS drops on the floor
  h.cleanup();
});

test("the date field opens on the record's own date, not blank", () => {
  // <input type="date"> refuses anything but yyyy-MM-dd, so an ISO instant renders as an empty box:
  // the field looked broken and the day it belonged to was invisible while editing.
  const h = mount();
  const field = h.container.querySelector('input[type="date"][name="date"]');
  expect(field.value).toBe("2026-08-21");   // 2026-08-20T17:00Z is 21 Aug in Asia/Bangkok
  h.cleanup();
});
