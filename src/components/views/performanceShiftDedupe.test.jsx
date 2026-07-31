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
      // the crew's own copy, refused by the server and still on screen — the same shift, re-entered
      { id: "sr_local", date: "2026-07-30", shift: "Night", events: muckFull("21:00"), syncStatus: "conflict" },
    ]}
    filterState={{}}
  />);

  expect(container.textContent).toContain("จาก 1 กะ");
  // and its one hour of delay is counted once rather than twice. The card's own label is part of
  // the assertion: a bare "1.0 ชม." also renders on cards this test says nothing about.
  expect(container.textContent).toContain("Delay รวม" + "1.0 ชม.");
  expect(container.textContent).not.toContain("Delay รวม" + "2.0 ชม.");
});

test("the live sheet's duplicated shift does not print more delay than the shift is long", () => {
  // Copied verbatim from the captured production payload (`data.json`, 2026-04-08T17:00Z Day = the
  // 2026-04-09 Day shift). Two transcriptions of one shift: both carry Clean Area 08:00-17:00 with
  // labels differing by ONE SPACE, both carry the same Other 1 hour with a trailing space on one,
  // and only the second carries the rail work. Counting each bar printed 18.0 ชม. of delay inside a
  // 12 hour shift, and 150% — a number that cannot happen.
  const container = render(<PerformanceView
    segmentRecords={[]}
    shiftReports={[
      {
        id: "shift_1775728474520", date: "2026-04-08T17:00:00.000Z", shift: "Day",
        events: {
          "Clean Area": [{ start: "08:00", end: "17:00", label: "ทำความสะอาดภายในอุโมงค์" }],
          "Other 1": [{ start: "15:00", end: "16:00", label: "ลำเลียง Segment " }],
        },
      },
      {
        id: "shift_1775730657169", date: "2026-04-08T17:00:00.000Z", shift: "Day",
        events: {
          "Locomotive / Rail System": [{ start: "14:00", end: "15:00", label: "ต่อรางรถไฟ" }],
          "Other 1": [{ start: "15:00", end: "16:00", label: "ลำเลียง Segment" }],
          "Clean Area": [{ start: "08:00", end: "17:00", label: "ทำความสะอาด ภายในอุโมงค์" }],
        },
      },
    ]}
    filterState={{}}
  />);

  expect(container.textContent).toContain("จาก 1 กะ");
  // Clean Area's nine hours, counted once, and three quarters of a twelve hour shift
  expect(container.textContent).toContain("Delay รวม" + "9.0 ชม." + "75.0% ของเวลาทั้งหมด");
  expect(container.textContent).not.toContain("18.0 ชม.");
  expect(container.textContent).not.toContain("150.0%");
});

test("one stoppage transcribed with two different end times is counted once", () => {
  // Also from the payload (2026-03-01T17:00Z Night): the two rows record the rail work as 19:00-20:00
  // and 19:00-20:30, and the muck stoppage as 20:00-21:30 and 20:30-21:00. Identity by category,
  // window and label sees four bars; the shift stood still for 90 minutes and 175 more.
  const container = render(<PerformanceView
    segmentRecords={[]}
    shiftReports={[
      {
        id: "shift_1772458034916", date: "2026-03-01T17:00:00.000Z", shift: "Night",
        events: {
          "Locomotive / Rail System": [{ start: "19:00", end: "20:00", label: "ต่อรางรถไฟ" }],
          "Muck Full": [{ start: "20:00", end: "21:30", label: "เคลียร์ถังดินและเตรียม Segment" }, { start: "04:05", end: "07:00", label: "ดินเต็ม Muck pit" }],
        },
      },
      {
        id: "shift_1772458064342", date: "2026-03-01T17:00:00.000Z", shift: "Night",
        events: {
          "Locomotive / Rail System": [{ start: "19:00", end: "20:30", label: "ต่อรางรถไฟ" }],
          // wholly inside the 20:00-21:30 bar above
          "Muck Full": [{ start: "20:30", end: "21:00", label: "เคลียร์ดินในถัง" }],
        },
      },
    ]}
    filterState={{}}
  />);

  // Muck Full 20:00-21:30 and 04:05-07:00 = 90 + 175 = 265 min; the 20:30-21:00 bar adds nothing
  expect(container.textContent).toContain("Delay รวม" + "4.4 ชม.");
  expect(container.textContent).not.toContain("Delay รวม" + "4.9 ชม."); // every bar counted
  expect(container.textContent).not.toContain("Delay รวม" + "5.4 ชม."); // the shorter rail bar counted as delay
});

test("a shift's time bars are unioned across the rows that describe it", () => {
  // Two rows for one shift are usually a re-save — the same bars entered twice — but not always.
  // On the live sheet the later row of 2026-04-09 Day carries an hour the kept row does not, with
  // its own event id. Counting both rows inflates the shift; keeping only one loses that hour.
  const container = render(<PerformanceView
    segmentRecords={[]}
    shiftReports={[
      // one category, two separate stoppages — a shift really can wait for muck removal twice
      { id: "a", date: "2026-07-30", shift: "Night", events: { "Muck Full": [{ start: "20:00", end: "21:00", label: "รอรถขนดิน" }, { start: "23:00", end: "23:30", label: "รอรถขนดิน" }] } },
      // a third stoppage of that same category, recorded only on the later row
      { id: "b0", date: "2026-07-30", shift: "Night", events: { "Muck Full": [{ start: "01:00", end: "02:00", label: "รอรถขนดิน" }] } },
      {
        id: "b",
        date: "2026-07-30",
        shift: "Night",
        events: {
          // the same bar again — one shift cannot hold the same activity twice over the same minutes
          "Muck Full": [{ start: "20:00", end: "21:00", label: "รอรถขนดิน" }],
          // and one only this row recorded
          "Power Supply": [{ start: "22:00", end: "23:00", label: "ไฟดับ" }],
        },
      },
    ]}
    filterState={{}}
  />);

  expect(container.textContent).toContain("จาก 1 กะ");
  // Muck Full 60 + 30 + 60, Power Supply 60 — the repeated 20:00-21:00 adding nothing
  expect(container.textContent).toContain("Delay รวม" + "3.5 ชม.");
  expect(container.textContent).not.toContain("Delay รวม" + "4.5 ชม."); // the repeated bar counted again
  expect(container.textContent).not.toContain("Delay รวม" + "2.5 ชม."); // a later row's bar of a category the first row already used
});

test("a bar spanning two earlier ones is not charged for their shared minutes twice", () => {
  // 08:00-10:00 and 09:00-11:00 overlap, so the minutes claimed so far are one 08:00-11:00 block.
  // Keeping them as two entries makes the third bar subtract 09:30-10:00 once as part of the first
  // and again as part of the second, and it reports 30 new minutes where 60 are new. The machine
  // stood still from 08:00 to 12:00: four hours.
  const container = render(<PerformanceView
    segmentRecords={[]}
    shiftReports={[{
      id: "a", date: "2026-07-30", shift: "Day",
      events: {
        "Clean Area": [
          { start: "08:00", end: "10:00", label: "ทำความสะอาด" },
          { start: "09:00", end: "11:00", label: "ทำความสะอาด (แก้)" },
          { start: "09:30", end: "12:00", label: "ทำความสะอาด (แก้อีกรอบ)" },
        ],
      },
    }]}
    filterState={{}}
  />);

  expect(container.textContent).toContain("Delay รวม" + "4.0 ชม.");
  expect(container.textContent).not.toContain("Delay รวม" + "3.5 ชม.");
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
