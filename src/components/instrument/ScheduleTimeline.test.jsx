// Task R3a — render + interaction smoke test (react-dom/client + act; this repo has no
// @testing-library, matching InstrumentReportTabs.test.jsx). Fixture below deliberately covers all
// node states in one small dataset (tbmChainage=8300, chainage decreases as the TBM advances, per
// utils/chainageAdapter.js):
//   -20m  tbmChainage=8320  1 schedule, already measured        → all-measured (done) node
//     0m  tbmChainage=8300  2 schedules (SURFACE done, DEEP not) → pending (mixed) node + TBM-here
//   +20m  tbmChainage=8280  1 schedule, not yet reached          → approaching node (20m ahead, ≤50m)
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import ScheduleTimeline from "./ScheduleTimeline";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const locationName = "IS02";
const tbmChainage = 8300;
const operationalChainage = 8300;

const schedules = [
  {
    id: "s-20",
    locationId: "L1",
    scheduleType: "DISTANCE",
    instrumentGroup: "SURFACE",
    distanceOffset: -20,
    tbmChainage: 8320,
    isMeasured: true,
    measuredAt: "2026-01-01T12:00:00.000Z",
    notes: null,
  },
  {
    id: "s0-srf",
    locationId: "L1",
    scheduleType: "DISTANCE",
    instrumentGroup: "SURFACE",
    distanceOffset: 0,
    tbmChainage: 8300,
    isMeasured: true,
    measuredAt: "2026-01-05T12:00:00.000Z",
    notes: null,
  },
  {
    id: "s0-dep",
    locationId: "L1",
    scheduleType: "DISTANCE",
    instrumentGroup: "DEEP",
    distanceOffset: 0,
    tbmChainage: 8300,
    isMeasured: false,
    measuredAt: null,
    notes: null,
  },
  {
    id: "s20-dep",
    locationId: "L1",
    scheduleType: "DISTANCE",
    instrumentGroup: "DEEP",
    distanceOffset: 20,
    tbmChainage: 8280,
    isMeasured: false,
    measuredAt: null,
    notes: null,
  },
];

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ScheduleTimeline {...props} />);
  });
  return { container, root };
}

function unmount(container, root) {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
}

function findNodeWrapperByOffsetLabel(container, label) {
  const spans = Array.from(container.querySelectorAll(".font-mono.font-black"));
  const span = spans.find((s) => s.textContent === label);
  expect(span).toBeTruthy();
  return span.closest(".w-28");
}

test("renders the section header", () => {
  const { container, root } = mount({ schedules, locationName, tbmChainage, operationalChainage, onMark: jest.fn() });
  expect(container.textContent).toContain("วาระตรวจวัดตามระยะ");
  unmount(container, root);
});

test("node status: all-measured / pending(mixed) / approaching are rendered with the right ring, and the TBM marker sits on the pending node", () => {
  const { container, root } = mount({ schedules, locationName, tbmChainage, operationalChainage, onMark: jest.fn() });

  const doneNode = findNodeWrapperByOffsetLabel(container, "-20m");
  const pendingNode = findNodeWrapperByOffsetLabel(container, "0m");
  const approachingNode = findNodeWrapperByOffsetLabel(container, "+20m");

  // ring div เป็น child ตัวแรกของ node wrapper เสมอ (ก่อน TBM marker ที่ conditional และก่อนบล็อก label)
  expect(doneNode.firstElementChild.className).toContain("border-code-a");
  expect(pendingNode.firstElementChild.className).toContain("border-code-d");
  expect(approachingNode.firstElementChild.className).toContain("border-code-b");

  expect(doneNode.textContent).not.toContain("TBM");
  expect(pendingNode.textContent).toContain("TBM"); // isTbmHere: distance(0) อยู่ในช่วง [0, +20)
  expect(approachingNode.textContent).not.toContain("TBM");

  unmount(container, root);
});

test("sub-buttons: measured SURFACE is green + clickable, pending DEEP (TBM passed, not measured) is red/pulsing + clickable", () => {
  const { container, root } = mount({ schedules, locationName, tbmChainage, operationalChainage, onMark: jest.fn() });
  const pendingNode = findNodeWrapperByOffsetLabel(container, "0m");
  const buttons = Array.from(pendingNode.querySelectorAll("button"));
  const srfBtn = buttons.find((b) => b.title.includes("SURFACE"));
  const depBtn = buttons.find((b) => b.title.includes("DEEP"));

  expect(srfBtn.className).toContain("code-a");
  expect(srfBtn.disabled).toBe(false);
  expect(depBtn.className).toContain("code-d");
  expect(depBtn.disabled).toBe(false);
  expect(depBtn.textContent).toBe("DEP"); // ยังไม่วัด → แสดง label ไม่ใช่ icon

  unmount(container, root);
});

test("future sub-button (TBM not reached yet) is disabled and shows the plain label, not measured/pending colors", () => {
  const { container, root } = mount({ schedules, locationName, tbmChainage, operationalChainage, onMark: jest.fn() });
  const approachingNode = findNodeWrapperByOffsetLabel(container, "+20m");
  const futureBtn = approachingNode.querySelector("button");

  expect(futureBtn.disabled).toBe(true);
  expect(futureBtn.textContent).toBe("DEP");
  expect(futureBtn.className).not.toContain("code-d");
  expect(futureBtn.className).not.toContain("code-a");

  unmount(container, root);
});

test("clicking a disabled (future) sub-button does not open the modal", () => {
  const { container, root } = mount({ schedules, locationName, tbmChainage, operationalChainage, onMark: jest.fn() });
  const approachingNode = findNodeWrapperByOffsetLabel(container, "+20m");
  const futureBtn = approachingNode.querySelector("button");
  act(() => {
    futureBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  // ใช้ text ของ "ปุ่มยืนยันในโมดัล" เป็นตัวชี้ว่าโมดัลเปิดหรือไม่ — ห้ามใช้ "บันทึกผลตรวจวัด"
  // เพราะซ้ำกับ subtitle ใน section header ("คลิกปุ่ม ACTION เพื่อบันทึกผลตรวจวัด") จึง contain เสมอ
  expect(container.textContent).not.toContain("ยืนยันตรวจวัดเสร็จสิ้น");
  unmount(container, root);
});

test("clicking the pending DEEP sub-button opens SchedReportModal; Confirm fires onMark with that exact schedule and kind 'done'", () => {
  const onMark = jest.fn();
  const { container, root } = mount({ schedules, locationName, tbmChainage, operationalChainage, onMark });

  const pendingNode = findNodeWrapperByOffsetLabel(container, "0m");
  const depBtn = Array.from(pendingNode.querySelectorAll("button")).find((b) => b.title.includes("DEEP"));
  act(() => {
    depBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const confirmBtn = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent.includes("ยืนยันตรวจวัดเสร็จสิ้น")
  );
  expect(confirmBtn).toBeTruthy(); // modal เปิด (ปุ่มยืนยันนี้มีเฉพาะในโมดัล ไม่ชนกับ header)
  act(() => {
    confirmBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(onMark).toHaveBeenCalledTimes(1);
  const [sched, kind, iso] = onMark.mock.calls[0];
  expect(sched.id).toBe("s0-dep");
  expect(kind).toBe("done");
  expect(typeof iso).toBe("string");

  expect(container.textContent).not.toContain("ยืนยันตรวจวัดเสร็จสิ้น"); // modal ปิดหลัง confirm

  unmount(container, root);
});

test("clicking the already-measured SURFACE sub-button opens the modal in edit mode", () => {
  const { container, root } = mount({ schedules, locationName, tbmChainage, operationalChainage, onMark: jest.fn() });
  const pendingNode = findNodeWrapperByOffsetLabel(container, "0m");
  const srfBtn = Array.from(pendingNode.querySelectorAll("button")).find((b) => b.title.includes("SURFACE"));
  act(() => {
    srfBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(container.textContent).toContain("แก้ไขผลตรวจวัด");
  unmount(container, root);
});

test("readOnly is forwarded to the opened modal (action buttons hidden)", () => {
  const { container, root } = mount({
    schedules,
    locationName,
    tbmChainage,
    operationalChainage,
    onMark: jest.fn(),
    readOnly: true,
  });
  const pendingNode = findNodeWrapperByOffsetLabel(container, "0m");
  const srfBtn = Array.from(pendingNode.querySelectorAll("button")).find((b) => b.title.includes("SURFACE"));
  act(() => {
    srfBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(container.textContent).toContain("แก้ไขผลตรวจวัด");
  expect(container.textContent).not.toContain("อัปเดตวันที่");
  expect(container.textContent).not.toContain("ยกเลิกการบันทึก");
  unmount(container, root);
});

test("does not crash and shows no false-positive node states when tbmChainage/operationalChainage have not loaded yet (null)", () => {
  const { container, root } = mount({ schedules, locationName, tbmChainage: null, operationalChainage: null, onMark: jest.fn() });
  // ไม่ควรมี node ไหนขึ้น TBM marker หรือ pending(แดง)/approaching(เหลือง) เมื่อยังไม่มีตำแหน่ง TBM จริง
  expect(container.textContent).not.toContain("TBM");
  const rings = Array.from(container.querySelectorAll(".w-28")).map((w) => w.firstElementChild);
  expect(rings.some((r) => r.className.includes("border-code-d") || r.className.includes("border-code-b"))).toBe(false);
  unmount(container, root);
});
