// Task R3a — render + interaction smoke test (react-dom/client + act; this repo has no
// @testing-library, matching InstrumentReportTabs.test.jsx). Covers card status/caption derivation
// (Checked/Skipped/Due/Wait-for-trigger), the getEffectiveLongTermTargetDate(sched, schedules) call
// (schedules passed in are already location-scoped, so passing the same array through as
// `allSchedules` is correct — see the file header comment in LongTermMonitoring.jsx), clicking a
// card to open SchedReportModal, and the onMark wiring.
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import LongTermMonitoring from "./LongTermMonitoring";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<LongTermMonitoring {...props} />);
  });
  return { container, root };
}

function unmount(container, root) {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
}

function clickButtonByTitle(container, titleSubstring) {
  const btn = Array.from(container.querySelectorAll("button")).find((b) => (b.title || "").includes(titleSubstring));
  expect(btn).toBeTruthy();
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  return btn;
}

test("renders nothing when there are no LONG_TERM schedules", () => {
  const { container, root } = mount({
    schedules: [{ id: "d1", scheduleType: "DISTANCE", distanceOffset: 0 }],
    locationName: "IS02",
    onMark: jest.fn(),
  });
  expect(container.textContent).toBe("");
  unmount(container, root);
});

test("Checked card: measured + not N/A shows 'ตรวจแล้ว <date>' and a green Check button", () => {
  const schedules = [
    {
      id: "lt1",
      locationId: "L1",
      scheduleType: "LONG_TERM",
      longTermLabel: "INIT",
      isMeasured: true,
      measuredAt: "2026-01-10T12:00:00.000Z",
      notes: null,
      targetDate: "2026-01-08T12:00:00.000Z",
    },
  ];
  const { container, root } = mount({ schedules, locationName: "IS02", onMark: jest.fn() });
  expect(container.textContent).toContain("INIT");
  expect(container.textContent).toContain("ตรวจแล้ว 10 Jan 2026");
  const btn = container.querySelector("button");
  expect(btn.className).toContain("code-a");
  expect(btn.disabled).toBe(false); // measured → คลิกได้ (edit)
  unmount(container, root);
});

test("Skipped card: measured + N/A shows 'ข้าม' and a neutral Ban button", () => {
  const schedules = [
    { id: "lt2", locationId: "L1", scheduleType: "LONG_TERM", longTermLabel: "(L)", isMeasured: true, measuredAt: null, notes: "N/A", targetDate: null },
  ];
  const { container, root } = mount({ schedules, locationName: "IS02", onMark: jest.fn() });
  expect(container.textContent).toContain("ข้าม");
  const btn = container.querySelector("button");
  expect(btn.className).not.toContain("code-d");
  expect(btn.disabled).toBe(false);
  unmount(container, root);
});

test("Wait-for-trigger card: no targetDate and trigger DISTANCE not measured yet → 'รอจุดกระตุ้น', button disabled", () => {
  const schedules = [
    {
      id: "lt3",
      locationId: "L1",
      scheduleType: "LONG_TERM",
      longTermLabel: "FINAL",
      isMeasured: false,
      measuredAt: null,
      notes: null,
      targetDate: null,
      triggerOffset: -20,
      longTermDays: 7,
    },
    { id: "d1", locationId: "L1", scheduleType: "DISTANCE", distanceOffset: -20, isMeasured: false, measuredAt: null },
  ];
  const { container, root } = mount({ schedules, locationName: "IS02", onMark: jest.fn() });
  expect(container.textContent).toContain("รอจุดกระตุ้น");
  const btn = container.querySelector("button");
  expect(btn.disabled).toBe(true);
  unmount(container, root);
});

test("Due card: targetDate resolved via getEffectiveLongTermTargetDate fallback (trigger DISTANCE already measured, no pre-serialized targetDate)", () => {
  const schedules = [
    {
      id: "lt4",
      locationId: "L1",
      scheduleType: "LONG_TERM",
      longTermLabel: "FINAL",
      isMeasured: false,
      measuredAt: null,
      notes: null,
      targetDate: null,
      triggerOffset: -20,
      longTermDays: 7,
    },
    { id: "d1", locationId: "L1", scheduleType: "DISTANCE", distanceOffset: -20, isMeasured: true, measuredAt: "2026-01-01T12:00:00.000Z" },
  ];
  const { container, root } = mount({ schedules, locationName: "IS02", onMark: jest.fn() });
  // Jan1 + 7d = Jan8
  expect(container.textContent).toContain("กำหนด 08 Jan 2026");
  const btn = container.querySelector("button");
  expect(btn.disabled).toBe(false); // hasTargetDate (แม้ยังไม่ measured) → คลิกได้
  unmount(container, root);
});

test("clicking a due card's button opens SchedReportModal with the long-term label as caption; N/A fires onMark(sched, 'na')", () => {
  const onMark = jest.fn();
  const schedules = [
    {
      id: "lt5",
      locationId: "L1",
      scheduleType: "LONG_TERM",
      longTermLabel: "FINAL",
      isMeasured: false,
      measuredAt: null,
      notes: null,
      targetDate: "2026-01-08T12:00:00.000Z",
    },
  ];
  const { container, root } = mount({ schedules, locationName: "IS02", onMark });

  clickButtonByTitle(container, "บันทึกผลตรวจวัด");
  // modal เปิด: title ของ modal + caption (longTermLabel ปรากฏซ้ำทั้งการ์ดและ modal — เช็คว่า modal เปิดจริง
  // ผ่านปุ่ม action ของ modal ที่ยังไม่มีมาก่อน)
  const confirmBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("ยืนยันตรวจวัดเสร็จสิ้น"));
  expect(confirmBtn).toBeTruthy();

  const naBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("ไม่สามารถเข้าตรวจวัดได้ (N/A)"));
  act(() => {
    naBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(onMark).toHaveBeenCalledWith(schedules[0], "na");

  unmount(container, root);
});

test("readOnly is forwarded to the opened modal (action buttons hidden)", () => {
  const schedules = [
    {
      id: "lt6",
      locationId: "L1",
      scheduleType: "LONG_TERM",
      longTermLabel: "FINAL",
      isMeasured: false,
      measuredAt: null,
      notes: null,
      targetDate: "2026-01-08T12:00:00.000Z",
    },
  ];
  const { container, root } = mount({ schedules, locationName: "IS02", onMark: jest.fn(), readOnly: true });
  clickButtonByTitle(container, "บันทึกผลตรวจวัด");
  expect(container.textContent).toContain("สถานะ: ยังไม่ตรวจวัด");
  expect(container.textContent).not.toContain("ยืนยันตรวจวัดเสร็จสิ้น");
  unmount(container, root);
});
