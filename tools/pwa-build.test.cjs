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

test("the production bundle does not carry the whole environment", () => {
  // CRA replaces a bare `process.env` with a literal of every variable the deployment sets. One
  // reference in constants.js put Vercel's injected git metadata — commit message, author, repo
  // owner and slug — into the file every visitor downloads, including whoever is sent a viewer
  // link. Named member access folds to a string; this fails if anyone passes the object again.
  const js = fs.readdirSync(path.join(root, "build/static/js")).filter(f => /^main\.[^.]+\.js$/.test(f));
  assert.equal(js.length, 1, "expected exactly one main bundle");
  const bundle = fs.readFileSync(path.join(root, "build/static/js", js[0]), "utf8");
  // CRA puts these four in the environment of EVERY build, so they are the marker that says the
  // whole object got inlined — and unlike the Vercel names they are present on a laptop too, which
  // is where this has to fail. Asserting the Vercel names alone would have passed locally with the
  // bug still in place.
  for (const marker of ["FAST_REFRESH", "WDS_SOCKET_PATH", "WDS_SOCKET_PORT", "WDS_SOCKET_HOST"]) {
    assert.doesNotMatch(bundle, new RegExp(marker), `${marker} in the bundle means process.env was inlined whole`);
  }
  assert.doesNotMatch(bundle, /REACT_APP_VERCEL_GIT_COMMIT_MESSAGE/);
  assert.doesNotMatch(bundle, /REACT_APP_VERCEL_GIT_REPO_OWNER/);
});
