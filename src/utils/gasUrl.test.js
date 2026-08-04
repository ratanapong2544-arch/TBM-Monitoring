import { resolveGasUrl, DEFAULT_GAS_URL } from "./gasUrl";

test("the built-in deployment is what production has always used", () => {
  // Changing this constant repoints every device that has no override — including the ten phones in
  // the field — so it is asserted, not assumed.
  expect(DEFAULT_GAS_URL).toContain("AKfycbyRUl5BVmZYDhw_Z0Uo2LWBLmaQAaOjJZR4jLGw-MuxHIFcKEhu7FBF9tV33JAnKz1aTw");
  expect(resolveGasUrl({})).toBe(DEFAULT_GAS_URL);
});

test("a build can be pointed at another deployment without touching the source", () => {
  // The pilot's whole shape: the test phone talks to the new Apps Script deployment while production
  // keeps talking to the one it has been using. A code change would have to be reverted before
  // promotion; an environment variable is set on the preview and nowhere else.
  const pilot = "https://script.google.com/macros/s/AKfycbPILOT/exec";
  expect(resolveGasUrl({ REACT_APP_GAS_URL: pilot })).toBe(pilot);
});

test("an empty or blank variable is not an override", () => {
  // Vercel returns "" for a variable that exists but was never given a value, and an empty GAS URL
  // means every request goes nowhere — on a build that looks configured.
  expect(resolveGasUrl({ REACT_APP_GAS_URL: "" })).toBe(DEFAULT_GAS_URL);
  expect(resolveGasUrl({ REACT_APP_GAS_URL: "   " })).toBe(DEFAULT_GAS_URL);
});

test("the override has to be an Apps Script exec URL", () => {
  // A typo in a Vercel variable would otherwise send every ring the crew records to whatever host
  // was typed. Refusing it falls back to the deployment that is known to work.
  expect(resolveGasUrl({ REACT_APP_GAS_URL: "https://example.com/collect" })).toBe(DEFAULT_GAS_URL);
  expect(resolveGasUrl({ REACT_APP_GAS_URL: "not a url" })).toBe(DEFAULT_GAS_URL);
});

test("the app's own GAS_URL is the resolved one, not a second copy of the constant", () => {
  // The resolver being right is no use if `constants.js` still holds its own literal — which is what
  // it held until now, and what every module in the app imports.
  const original = process.env.REACT_APP_GAS_URL;
  try {
    jest.resetModules();
    process.env.REACT_APP_GAS_URL = "https://script.google.com/macros/s/AKfycbPILOT/exec";
    // eslint-disable-next-line global-require
    expect(require("./constants").GAS_URL).toBe("https://script.google.com/macros/s/AKfycbPILOT/exec");

    jest.resetModules();
    delete process.env.REACT_APP_GAS_URL;
    // eslint-disable-next-line global-require
    expect(require("./constants").GAS_URL).toBe(DEFAULT_GAS_URL);
  } finally {
    jest.resetModules();
    if (original === undefined) delete process.env.REACT_APP_GAS_URL;
    else process.env.REACT_APP_GAS_URL = original;
  }
});
