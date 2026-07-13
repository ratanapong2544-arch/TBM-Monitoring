// Task R3b — render + interaction smoke test (react-dom/client + act; this repo has no
// @testing-library, matching ScheduleTimeline.test.jsx / SchedReportModal.test.jsx). Asserts the
// write-light display-only contract: status/date/photo/note are shown, but there is no edit
// affordance at all (no <input>, no "Save"/"บันทึก" action) — only a close path.
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import InstReportModal from "./InstReportModal";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<InstReportModal {...props} />);
  });
  return { container, root };
}

function unmount(container, root) {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
}

const baseInst = {
  id: "ins1",
  code: "P6379",
  type: "INCLINOMETER",
  installStatus: "PENDING",
  installedAt: null,
  installPhotoUrl: null,
  note: "",
};

test("renders nothing when inst is null", () => {
  const { container, root } = mount({ inst: null, onClose: jest.fn() });
  expect(container.textContent).toBe("");
  unmount(container, root);
});

test("renders code + type in the header", () => {
  const { container, root } = mount({ inst: baseInst, onClose: jest.fn() });
  expect(container.textContent).toContain("P6379");
  expect(container.textContent).toContain("INCLINOMETER");
  unmount(container, root);
});

test("PENDING: status grid highlights PENDING solid, others plain, and shows the Thai caption", () => {
  const { container, root } = mount({ inst: baseInst, onClose: jest.fn() });
  const cells = Array.from(container.querySelectorAll(".grid.grid-cols-3 > div"));
  expect(cells).toHaveLength(3);
  const pending = cells.find((c) => c.textContent === "PENDING");
  const installing = cells.find((c) => c.textContent === "INSTALLING");
  const installed = cells.find((c) => c.textContent === "INSTALLED");
  expect(pending.className).toContain("bg-ink-3");
  expect(installing.className).not.toContain("bg-cyan-med");
  expect(installed.className).not.toContain("bg-code-a text-white");
  expect(container.textContent).toContain("รอดำเนินการ");
  unmount(container, root);
});

test("INSTALLED: status grid highlights INSTALLED solid + shows Thai caption 'ติดตั้งเสร็จสิ้น'", () => {
  const inst = { ...baseInst, installStatus: "INSTALLED" };
  const { container, root } = mount({ inst, onClose: jest.fn() });
  const cells = Array.from(container.querySelectorAll(".grid.grid-cols-3 > div"));
  const installed = cells.find((c) => c.textContent === "INSTALLED");
  expect(installed.className).toContain("bg-code-a");
  expect(installed.className).toContain("text-white");
  expect(container.textContent).toContain("ติดตั้งเสร็จสิ้น");
  unmount(container, root);
});

test("unknown/garbage installStatus falls back to PENDING rather than crashing", () => {
  const inst = { ...baseInst, installStatus: "WHATEVER" };
  const { container, root } = mount({ inst, onClose: jest.fn() });
  const cells = Array.from(container.querySelectorAll(".grid.grid-cols-3 > div"));
  const pending = cells.find((c) => c.textContent === "PENDING");
  expect(pending.className).toContain("bg-ink-3");
  expect(container.textContent).toContain("รอดำเนินการ");
  unmount(container, root);
});

test("installedAt: shows formatted date when present, 'ยังไม่ระบุ' when absent", () => {
  const notYet = mount({ inst: baseInst, onClose: jest.fn() });
  expect(notYet.container.textContent).toContain("ยังไม่ระบุ");
  unmount(notYet.container, notYet.root);

  const withDate = mount({
    inst: { ...baseInst, installStatus: "INSTALLED", installedAt: "2026-01-05T12:00:00.000Z" },
    onClose: jest.fn(),
  });
  expect(withDate.container.textContent).toContain("05 Jan 2026");
  unmount(withDate.container, withDate.root);
});

test("installPhotoUrl: renders the photo when present, an empty-state placeholder when absent", () => {
  const noPhoto = mount({ inst: baseInst, onClose: jest.fn() });
  expect(noPhoto.container.querySelector("img")).toBeNull();
  expect(noPhoto.container.textContent).toContain("ยังไม่มีรูปถ่าย");
  unmount(noPhoto.container, noPhoto.root);

  const withPhoto = mount({
    inst: { ...baseInst, installPhotoUrl: "https://example.com/p6379.jpg" },
    onClose: jest.fn(),
  });
  const img = withPhoto.container.querySelector("img");
  expect(img).toBeTruthy();
  expect(img.src).toBe("https://example.com/p6379.jpg");
  unmount(withPhoto.container, withPhoto.root);
});

test("note: renders the note text when present, no note section when blank", () => {
  const noNote = mount({ inst: baseInst, onClose: jest.fn() });
  expect(noNote.container.textContent).not.toContain("หมายเหตุ");
  unmount(noNote.container, noNote.root);

  const withNote = mount({ inst: { ...baseInst, note: "ติดตั้งชั่วคราว รอย้ายจุด" }, onClose: jest.fn() });
  expect(withNote.container.textContent).toContain("หมายเหตุ");
  expect(withNote.container.textContent).toContain("ติดตั้งชั่วคราว รอย้ายจุด");
  unmount(withNote.container, withNote.root);
});

test("display-only: no <input> anywhere and no save/edit affordance — only a close path", () => {
  const inst = { ...baseInst, installStatus: "INSTALLED", installedAt: "2026-01-05T12:00:00.000Z", installPhotoUrl: "https://example.com/p.jpg" };
  const { container, root } = mount({ inst, onClose: jest.fn() });
  expect(container.querySelectorAll("input").length).toBe(0);
  expect(container.textContent).not.toContain("บันทึก");
  expect(container.textContent).not.toContain("Save");
  expect(container.textContent).not.toContain("Upload");
  unmount(container, root);
});

test("header X button calls onClose", () => {
  const onClose = jest.fn();
  const { container, root } = mount({ inst: baseInst, onClose });
  const headerCloseBtn = container.querySelector("button");
  act(() => {
    headerCloseBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

test("bottom 'ปิด' button calls onClose", () => {
  const onClose = jest.fn();
  const { container, root } = mount({ inst: baseInst, onClose });
  const closeBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "ปิด");
  expect(closeBtn).toBeTruthy();
  act(() => {
    closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount(container, root);
});
