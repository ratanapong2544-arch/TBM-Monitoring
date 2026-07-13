// Task R3a — render + interaction smoke test (react-dom/client + act; this repo has no
// @testing-library, matching InstrumentReportTabs.test.jsx). Guards the onMark(sched, kind,
// isoDate) contract consumed by App.jsx:handleMarkInstSchedule (R1) and reused by ScheduleTimeline /
// LongTermMonitoring / (later) R4 dashboard.
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import SchedReportModal from "./SchedReportModal";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<SchedReportModal {...props} />);
  });
  return { container, root };
}

function unmount(container, root) {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
}

function clickButtonByText(container, text) {
  const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes(text));
  expect(btn).toBeTruthy();
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const distSched = {
  id: "d1",
  scheduleType: "DISTANCE",
  distanceOffset: -20,
  tbmChainage: 8300,
  isMeasured: false,
  measuredAt: null,
  notes: null,
};
const measuredSched = {
  id: "d2",
  scheduleType: "DISTANCE",
  distanceOffset: 0,
  tbmChainage: 8200,
  isMeasured: true,
  measuredAt: "2026-01-05T12:00:00.000Z",
  notes: null,
};
const naSched = {
  id: "d3",
  scheduleType: "DISTANCE",
  distanceOffset: 20,
  tbmChainage: 8100,
  isMeasured: true,
  measuredAt: null,
  notes: "N/A",
};
const ltSched = { id: "lt1", scheduleType: "LONG_TERM", longTermLabel: "FINAL", isMeasured: false, measuredAt: null, notes: null };

test("returns null (renders nothing) when sched is not supplied", () => {
  const { container, root } = mount({ sched: null, onMark: jest.fn(), onClose: jest.fn() });
  expect(container.textContent).toBe("");
  unmount(container, root);
});

test("unmeasured schedule shows the create-report title and Confirm + N/A buttons (no Cancel)", () => {
  const { container, root } = mount({ sched: distSched, locationName: "IS02", onMark: jest.fn(), onClose: jest.fn() });
  expect(container.textContent).toContain("บันทึกผลตรวจวัด");
  expect(container.textContent).toContain("ยืนยันตรวจวัดเสร็จสิ้น");
  expect(container.textContent).toContain("ไม่สามารถเข้าตรวจวัดได้ (N/A)");
  expect(container.textContent).not.toContain("ยกเลิกการบันทึก");
  unmount(container, root);
});

test("measured schedule shows the edit title and Update + Cancel buttons (no N/A)", () => {
  const { container, root } = mount({ sched: measuredSched, locationName: "IS02", onMark: jest.fn(), onClose: jest.fn() });
  expect(container.textContent).toContain("แก้ไขผลตรวจวัด");
  expect(container.textContent).toContain("อัปเดตวันที่");
  expect(container.textContent).toContain("ยกเลิกการบันทึก (Cancel)");
  expect(container.textContent).not.toContain("ไม่สามารถเข้าตรวจวัดได้");
  unmount(container, root);
});

test("N/A schedule shows the N/A warning banner", () => {
  const { container, root } = mount({ sched: naSched, locationName: "IS02", onMark: jest.fn(), onClose: jest.fn() });
  expect(container.textContent).toContain("ปัจจุบันบันทึกเป็นเข้าไม่ได้ (N/A)");
  unmount(container, root);
});

test("Confirm calls onMark(sched, 'done', isoDateString) then onClose", () => {
  const onMark = jest.fn();
  const onClose = jest.fn();
  const { container, root } = mount({ sched: distSched, locationName: "IS02", onMark, onClose });
  clickButtonByText(container, "ยืนยันตรวจวัดเสร็จสิ้น");
  expect(onMark).toHaveBeenCalledTimes(1);
  const [sched, kind, iso] = onMark.mock.calls[0];
  expect(sched).toBe(distSched);
  expect(kind).toBe("done");
  expect(typeof iso).toBe("string");
  expect(new Date(iso).toISOString()).toBe(iso); // ต้องเป็น ISO string ที่ valid
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

test("N/A button calls onMark(sched, 'na') (no 3rd arg) then onClose", () => {
  const onMark = jest.fn();
  const onClose = jest.fn();
  const { container, root } = mount({ sched: distSched, locationName: "IS02", onMark, onClose });
  clickButtonByText(container, "ไม่สามารถเข้าตรวจวัดได้ (N/A)");
  expect(onMark).toHaveBeenCalledWith(distSched, "na");
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

test("Cancel button calls onMark(sched, 'cancel') then onClose", () => {
  const onMark = jest.fn();
  const onClose = jest.fn();
  const { container, root } = mount({ sched: measuredSched, locationName: "IS02", onMark, onClose });
  clickButtonByText(container, "ยกเลิกการบันทึก (Cancel)");
  expect(onMark).toHaveBeenCalledWith(measuredSched, "cancel");
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

test("readOnly hides all action buttons (only the close X remains) and shows a read-only status line", () => {
  const { container, root } = mount({
    sched: measuredSched,
    locationName: "IS02",
    onMark: jest.fn(),
    onClose: jest.fn(),
    readOnly: true,
  });
  expect(container.querySelectorAll("button").length).toBe(1); // แค่ปุ่มปิด (X)
  expect(container.textContent).toContain("สถานะ: ตรวจวัดแล้ว");
  expect(container.textContent).toContain("05 Jan 2026"); // แสดงวันที่แบบอ่านอย่างเดียว ไม่ใช่ input
  unmount(container, root);
});

test("readOnly + N/A shows the skipped status line", () => {
  const { container, root } = mount({
    sched: naSched,
    locationName: "IS02",
    onMark: jest.fn(),
    onClose: jest.fn(),
    readOnly: true,
  });
  expect(container.textContent).toContain("สถานะ: ข้าม (N/A)");
  unmount(container, root);
});

test("LONG_TERM schedule shows longTermLabel as the caption instead of an offset", () => {
  const { container, root } = mount({ sched: ltSched, locationName: "IS02", onMark: jest.fn(), onClose: jest.fn() });
  expect(container.textContent).toContain("FINAL");
  expect(container.textContent).not.toContain("ระยะ:");
  unmount(container, root);
});

test("close (X) button calls onClose without calling onMark", () => {
  const onMark = jest.fn();
  const onClose = jest.fn();
  const { container, root } = mount({ sched: distSched, locationName: "IS02", onMark, onClose });
  const closeBtn = container.querySelector("button");
  act(() => {
    closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onMark).not.toHaveBeenCalled();
  unmount(container, root);
});
