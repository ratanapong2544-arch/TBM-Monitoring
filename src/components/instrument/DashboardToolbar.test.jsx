// Task R4b — DashboardToolbar: filter pills + NEAREST/CHAINAGE sort toggle + search input.
// Render + interaction smoke test (react-dom/client + act; this repo has no @testing-library,
// matching ComplianceCards.test.jsx / SchedReportModal.test.jsx conventions). This is a controlled
// component with no state of its own — every interaction test asserts the right onChange callback
// fires with the right value, never a re-render of internal state.
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import DashboardToolbar from "./DashboardToolbar";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<DashboardToolbar {...props} />);
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
  return btn;
}

// Controlled <input>'s onChange only fires when React's internal value-tracker sees a real change
// — setting `.value` via the native setter (bypassing React's own setter) then dispatching a
// native "input" event is the standard jsdom trick for simulating real typing without
// @testing-library. First use of this pattern in the repo (no prior text-input interaction test).
function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const baseProps = {
  filter: "ALL",
  sortMode: "NEAREST",
  search: "",
  onFilterChange: () => {},
  onSortChange: () => {},
  onSearchChange: () => {},
};

test("renders all 5 filter pills with source-matching labels", () => {
  const { container, root } = mount(baseProps);
  ["All Locations", "Shaft", "Bridge", "Above Tunnel", "Settlement"].forEach((label) => {
    expect(container.textContent).toContain(label);
  });
  unmount(container, root);
});

test("active filter pill gets the navy/filled style, inactive pills stay neutral (surface-alt)", () => {
  const { container, root } = mount({ ...baseProps, filter: "BRIDGE" });
  const buttons = Array.from(container.querySelectorAll("button"));
  const activeBtn = buttons.find((b) => b.textContent === "Bridge");
  const inactiveBtn = buttons.find((b) => b.textContent === "Shaft");
  expect(activeBtn.className).toContain("bg-navy");
  expect(activeBtn.className).toContain("text-white");
  expect(inactiveBtn.className).not.toContain("bg-navy");
  unmount(container, root);
});

test("clicking a filter pill fires onFilterChange with that pill's value", () => {
  const onFilterChange = jest.fn();
  const { container, root } = mount({ ...baseProps, onFilterChange });
  clickButtonByText(container, "Above Tunnel");
  expect(onFilterChange).toHaveBeenCalledTimes(1);
  expect(onFilterChange).toHaveBeenCalledWith("ABOVE_TUNNEL");
  unmount(container, root);
});

test("clicking the currently-active pill still fires onFilterChange (toolbar holds no state to no-op against)", () => {
  const onFilterChange = jest.fn();
  const { container, root } = mount({ ...baseProps, filter: "ALL", onFilterChange });
  clickButtonByText(container, "All Locations");
  expect(onFilterChange).toHaveBeenCalledWith("ALL");
  unmount(container, root);
});

test("renders the NEAREST/CHAINAGE sort toggle with source's Thai labels", () => {
  const { container, root } = mount(baseProps);
  expect(container.textContent).toContain("ใกล้หัวเจาะที่สุด");
  expect(container.textContent).toContain("เรียงตามระยะทาง");
  unmount(container, root);
});

test("clicking the CHAINAGE sort option fires onSortChange('CHAINAGE')", () => {
  const onSortChange = jest.fn();
  const { container, root } = mount({ ...baseProps, onSortChange });
  clickButtonByText(container, "เรียงตามระยะทาง");
  expect(onSortChange).toHaveBeenCalledWith("CHAINAGE");
  unmount(container, root);
});

test("clicking the NEAREST sort option fires onSortChange('NEAREST')", () => {
  const onSortChange = jest.fn();
  const { container, root } = mount({ ...baseProps, sortMode: "CHAINAGE", onSortChange });
  clickButtonByText(container, "ใกล้หัวเจาะที่สุด");
  expect(onSortChange).toHaveBeenCalledWith("NEAREST");
  unmount(container, root);
});

test("search input reflects the controlled `search` prop value", () => {
  const { container, root } = mount({ ...baseProps, search: "IS02" });
  const input = container.querySelector('input[type="text"]');
  expect(input.value).toBe("IS02");
  unmount(container, root);
});

test("typing into the search box fires onSearchChange with the typed value", () => {
  const onSearchChange = jest.fn();
  const { container, root } = mount({ ...baseProps, onSearchChange });
  const input = container.querySelector('input[type="text"]');
  typeInto(input, "8+300");
  expect(onSearchChange).toHaveBeenCalledWith("8+300");
  unmount(container, root);
});

test("optional counts prop renders a result-count label when provided", () => {
  const { container, root } = mount({ ...baseProps, counts: 5 });
  expect(container.textContent).toContain("5 locations");
  unmount(container, root);
});

test("counts === 1 renders the singular label", () => {
  const { container, root } = mount({ ...baseProps, counts: 1 });
  expect(container.textContent).toContain("1 location");
  expect(container.textContent).not.toContain("1 locations");
  unmount(container, root);
});

test("counts prop absent -> no result-count label rendered", () => {
  const { container, root } = mount(baseProps);
  expect(container.textContent).not.toMatch(/\d+\s*location/);
  unmount(container, root);
});

test("does not crash when no onChange handlers are supplied — all three controls null-safe", () => {
  const { container, root } = mount({ filter: "ALL", sortMode: "NEAREST", search: "" });
  // Filter pill
  expect(() => clickButtonByText(container, "Shaft")).not.toThrow();
  // Sort toggle — SegmentedToggle calls onChange(o.value) unguarded, so this is the control that
  // would throw a TypeError without the onSortChange guard in DashboardToolbar.
  expect(() => clickButtonByText(container, "เรียงตามระยะทาง")).not.toThrow();
  // Search input
  const input = container.querySelector('input[type="text"]');
  expect(() => typeInto(input, "8+300")).not.toThrow();
  unmount(container, root);
});
