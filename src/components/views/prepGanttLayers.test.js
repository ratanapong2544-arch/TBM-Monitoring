import fs from "fs";
import path from "path";

// jsdom computes no stacking, so the whole suite can be green while one panel paints over another.
// Read the classes the components actually carry and compare the numbers — the same trick
// `overlayStacking.test.jsx` uses for the offline panels.
const read = file => fs.readFileSync(path.join(__dirname, file), "utf8");
const layerOf = (source, matcher) => {
  const match = source.match(matcher);
  if (!match) throw new Error(`no z-index found for ${matcher}`);
  return Number(match[1]);
};

test("the Work Plan's frozen columns scroll UNDER the app header, not over it", () => {
  // `position: sticky` pins them horizontally; the page still scrolls them vertically, and at the
  // same z-index as the header the one further down the DOM wins. On a phone that put "# งาน %" and
  // the first task rows on top of the machine switcher, the sync status and the print button — the
  // controls a crew reaches for while reading the very plan that was covering them.
  const gantt = layerOf(read("./PrepGanttView.jsx"), /const stickyCls = "sticky z-\[?(\d+)\]?/);
  const topBar = layerOf(read("../../ui-ux-pro-max/components/TopBar.jsx"), /sticky top-0 z-(\d+)/);
  const bottomNav = layerOf(read("../../ui-ux-pro-max/components/BottomNav.jsx"), /z-(\d+)/);

  expect(gantt).toBeLessThan(topBar);
  expect(gantt).toBeLessThan(bottomNav);
});

test("but still above the chart drawn beside them", () => {
  // The frozen columns are the one thing that must stay readable while the chart scrolls under them:
  // dependency arrows, the today line and its label all pass beneath.
  const source = read("./PrepGanttView.jsx");
  const gantt = layerOf(source, /const stickyCls = "sticky z-\[?(\d+)\]?/);
  const todayLabel = layerOf(source, /absolute z-(\d+) bg-code-c text-white/);
  const todayLine = layerOf(source, /absolute w-px bg-code-c z-(\d+)/);

  expect(gantt).toBeGreaterThan(todayLabel);
  expect(gantt).toBeGreaterThan(todayLine);
});
