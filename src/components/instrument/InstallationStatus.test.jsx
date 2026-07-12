// Task R3b — render + interaction smoke test (react-dom/client + act; this repo has no
// @testing-library, matching ScheduleTimeline.test.jsx / LongTermMonitoring.test.jsx). Covers
// instCounts/progress-bar correctness (incl. the all-PENDING seed state and the 0-instrument empty
// state), the type-icon + status-badge + photo-indicator list row, click-to-open-modal, and the
// write-light cut (no Settings/manage-instruments button rendered at all).
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import InstallationStatus from "./InstallationStatus";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<InstallationStatus {...props} />);
  });
  return { container, root };
}

function unmount(container, root) {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
}

function findRowByCode(container, code) {
  const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes(code));
  expect(btn).toBeTruthy();
  return btn;
}

const mixedInstruments = [
  { id: "i1", code: "P6379", type: "INCLINOMETER", installStatus: "INSTALLED", installedAt: "2026-01-05T12:00:00.000Z", installPhotoUrl: "https://example.com/p1.jpg", note: "" },
  { id: "i2", code: "P6377", type: "EXTENSOMETER", installStatus: "INSTALLING", installedAt: null, installPhotoUrl: null, note: "" },
  { id: "i3", code: "P6374", type: "PIEZOMETER", installStatus: "PENDING", installedAt: null, installPhotoUrl: null, note: "" },
  { id: "i4", code: "P6352", type: "SETTLEMENT_POINT", installStatus: "PENDING", installedAt: null, installPhotoUrl: null, note: "" },
];

test("renders the section header", () => {
  const { container, root } = mount({ instruments: mixedInstruments });
  expect(container.textContent).toContain("สถานะการติดตั้ง");
  unmount(container, root);
});

test("instCounts + progress bar: 1 installed / 1 installing / 2 pending out of 4 total", () => {
  const { container, root } = mount({ instruments: mixedInstruments });
  expect(container.textContent).toContain("1/4 ติดตั้งแล้ว");
  expect(container.textContent).toContain("ติดตั้งแล้ว (1)");
  expect(container.textContent).toContain("กำลังติดตั้ง (1)");
  expect(container.textContent).toContain("รอดำเนินการ (2)");

  const bar = container.querySelector(".bg-code-a.rounded-full");
  expect(bar.style.width).toBe("25%");
  unmount(container, root);
});

test("seed state (all instruments PENDING): counts are 0 installed / 0 installing / all pending, 0% bar, every row badged PENDING", () => {
  const allPending = [
    { id: "s1", code: "S1", type: "INCLINOMETER", installStatus: "PENDING", installedAt: null, installPhotoUrl: null, note: "" },
    { id: "s2", code: "S2", type: "EXTENSOMETER", installStatus: "PENDING", installedAt: null, installPhotoUrl: null, note: "" },
    { id: "s3", code: "S3", type: "PIEZOMETER", installStatus: "PENDING", installedAt: null, installPhotoUrl: null, note: "" },
  ];
  const { container, root } = mount({ instruments: allPending });
  expect(container.textContent).toContain("0/3 ติดตั้งแล้ว");
  expect(container.textContent).toContain("ติดตั้งแล้ว (0)");
  expect(container.textContent).toContain("กำลังติดตั้ง (0)");
  expect(container.textContent).toContain("รอดำเนินการ (3)");

  const bar = container.querySelector(".bg-code-a.rounded-full");
  expect(bar.style.width).toBe("0%");

  ["S1", "S2", "S3"].forEach((code) => {
    const row = findRowByCode(container, code);
    expect(row.textContent).toContain("PENDING");
  });
  unmount(container, root);
});

test("empty state: no instruments shows the empty message and a 0% bar with no NaN", () => {
  const { container, root } = mount({ instruments: [] });
  expect(container.textContent).toContain("ไม่มีเครื่องมือวัดที่จุดนี้");
  expect(container.textContent).toContain("0/0 ติดตั้งแล้ว");
  const bar = container.querySelector(".bg-code-a.rounded-full");
  expect(bar.style.width).toBe("0%");
  unmount(container, root);
});

test("each row shows a type icon + status badge, and a photo indicator only when installPhotoUrl is set", () => {
  const { container, root } = mount({ instruments: mixedInstruments });

  const installedRow = findRowByCode(container, "P6379"); // has photo
  const pendingRow = findRowByCode(container, "P6374"); // no photo

  expect(installedRow.textContent).toContain("INSTALLED");
  expect(pendingRow.textContent).toContain("PENDING");

  // photo indicator adds a 2nd svg (type icon + image icon) vs just the type icon alone
  expect(installedRow.querySelectorAll("svg").length).toBe(2);
  expect(pendingRow.querySelectorAll("svg").length).toBe(1);
  unmount(container, root);
});

test("clicking an instrument row opens InstReportModal for that exact instrument", () => {
  const { container, root } = mount({ instruments: mixedInstruments });
  const row = findRowByCode(container, "P6377");
  act(() => {
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(container.textContent).toContain("รายงานการติดตั้ง"); // modal title
  expect(container.textContent).toContain("P6377 — EXTENSOMETER");
  unmount(container, root);
});

test("closing the modal (bottom 'ปิด' button) returns to the plain panel", () => {
  const { container, root } = mount({ instruments: mixedInstruments });
  const row = findRowByCode(container, "P6379");
  act(() => {
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(container.textContent).toContain("รายงานการติดตั้ง");

  const closeBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "ปิด");
  act(() => {
    closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(container.textContent).not.toContain("รายงานการติดตั้ง");
  unmount(container, root);
});

test("write-light cut: no Settings/manage-instruments button is rendered — only one button per instrument row", () => {
  const { container, root } = mount({ instruments: mixedInstruments });
  expect(container.querySelectorAll("button").length).toBe(mixedInstruments.length);
  unmount(container, root);
});

test("unknown/garbage installStatus on a row falls back to PENDING styling rather than crashing", () => {
  const weird = [{ id: "w1", code: "W1", type: "INCLINOMETER", installStatus: "???", installedAt: null, installPhotoUrl: null, note: "" }];
  const { container, root } = mount({ instruments: weird });
  const row = findRowByCode(container, "W1");
  expect(row.textContent).toContain("PENDING");
  unmount(container, root);
});
