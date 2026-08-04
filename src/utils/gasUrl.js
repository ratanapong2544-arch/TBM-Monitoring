/**
 * Which Apps Script deployment this build talks to.
 *
 * Production has one deployment and has always had it. The pilot needs a second one — the new
 * backend, with the queue's idempotency and conflict detection — reachable by the test phone and by
 * nothing else, so the ten crews keep the backend they have been using until the pilot's gates pass.
 *
 * An environment variable rather than a code change, because a code change would have to be reverted
 * before promotion and the revert is what gets forgotten. `REACT_APP_GAS_URL` is set on the Vercel
 * preview and nowhere else; every build without it, including production, resolves to the constant
 * below.
 *
 * Both deployments write to the SAME spreadsheet — this separates the code a device runs against,
 * not the data. That is the point: the sync columns are additive and the old backend ignores them.
 */
export const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbyRUl5BVmZYDhw_Z0Uo2LWBLmaQAaOjJZR4jLGw-MuxHIFcKEhu7FBF9tV33JAnKz1aTw/exec";

const APPS_SCRIPT_EXEC = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

export function resolveGasUrl(env) {
  const candidate = env && typeof env.REACT_APP_GAS_URL === "string" ? env.REACT_APP_GAS_URL.trim() : "";
  // Blank is not an override: Vercel hands back "" for a variable that exists with no value, and an
  // empty URL would send every ring the crew records nowhere, on a build that looks configured.
  // A malformed one is not either — a typo in a dashboard field must not become the address this app
  // posts engineering records to.
  if (!candidate || !APPS_SCRIPT_EXEC.test(candidate)) return DEFAULT_GAS_URL;
  return candidate;
}
