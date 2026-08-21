import { hasLitreVolume, secondaryLitre, secondaryTotalM3 } from "./secondaryGrout";

// The rule these three carry: a secondary row is measured in litres, the shared `total` column is
// m³, and the rows written before the litre field existed have only Part A / Part B.

test("a litre volume converts to the m³ column exactly", () => {
  expect(secondaryTotalM3({ volumeLitre: 1 })).toBe(0.001);
  expect(secondaryTotalM3({ volumeLitre: 0 })).toBe(0);
  expect(secondaryTotalM3({ volumeLitre: 250 })).toBe(0.25);
});

test("zero litres is a volume, not a missing one", () => {
  // the paper sheet has rows of 0 litre; treating that as absent would send them down the legacy
  // Part A + Part B branch and report whatever those columns happen to hold
  expect(hasLitreVolume({ volumeLitre: 0 })).toBe(true);
  expect(hasLitreVolume({ volumeLitre: "" })).toBe(false);
  expect(hasLitreVolume({ partA: 1 })).toBe(false);
});

test("a row from before the litre field keeps reporting its Part A + Part B volume", () => {
  expect(secondaryTotalM3({ partA: "3.0", partB: "1.5" })).toBe(4.5);
  expect(secondaryLitre({ total: 4.5 })).toBe(4500);
});

test("litres are read back as entered", () => {
  expect(secondaryLitre({ volumeLitre: 1, total: 0.001 })).toBe(1);
  expect(secondaryLitre({ volumeLitre: "2" })).toBe(2);
});
