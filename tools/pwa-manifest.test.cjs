const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "public/manifest.json"), "utf8"));
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");

test("manifest is a standalone root-scoped installable app", () => {
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((x) => x.sizes === "192x192"));
  assert.ok(manifest.icons.some((x) => x.sizes === "512x512" && x.purpose === "maskable"));
});

test("production html has no runtime Tailwind CDN dependency", () => {
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com/);
  assert.match(html, /apple-touch-icon/);
  for (const name of ["icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
    assert.ok(fs.existsSync(path.join(root, "public/icons", name)), name);
  }
});
