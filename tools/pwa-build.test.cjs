const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("production build includes an injected service worker", () => {
  const sw = fs.readFileSync(path.join(root, "build/service-worker.js"), "utf8");
  assert.doesNotMatch(sw, /self\.__WB_MANIFEST/);
  assert.match(sw, /tbm-precache-/);
  assert.match(sw, /SKIP_WAITING/);
  assert.ok(fs.existsSync(path.join(root, "build/index.html")));
});
