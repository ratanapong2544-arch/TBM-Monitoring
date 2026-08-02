import fs from "fs";
import path from "path";

// The plan says "Ensure z-index is above BottomNav and MoreSheet" and nothing checked it: jsdom
// computes no stacking, so all three overlays could be pushed under the navigation with the whole
// suite green. Read the classes the components actually carry and compare the numbers.
const read = file => fs.readFileSync(path.join(__dirname, file), "utf8");
const layerOf = (source, matcher) => {
  const match = source.match(matcher);
  if (!match) throw new Error(`no z-index found for ${matcher}`);
  return Number(match[1]);
};

test("every offline overlay stacks above the bottom nav and the more sheet", () => {
  const bottomNav = layerOf(read("../../ui-ux-pro-max/components/BottomNav.jsx"), /z-(\d+)/);
  const moreSheet = layerOf(read("../../ui-ux-pro-max/components/MoreSheet.jsx"), /z-(\d+)/);
  const syncCenter = layerOf(read("./SyncCenter.jsx"), /z-\[(\d+)\]/);
  const resolver = layerOf(read("./ConflictResolver.jsx"), /z-\[(\d+)\]/);
  const banner = layerOf(read("./UpdateAvailableBanner.jsx"), /z-\[(\d+)\]/);

  const floor = Math.max(bottomNav, moreSheet);
  expect(syncCenter).toBeGreaterThan(floor);
  expect(resolver).toBeGreaterThan(syncCenter); // it opens over the centre
  expect(banner).toBeGreaterThan(floor);
});
