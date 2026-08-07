import { currentBuildId } from "./buildId";

const docWith = (...srcs) => {
  const doc = document.implementation.createHTMLDocument("t");
  srcs.forEach(src => {
    const script = doc.createElement("script");
    script.setAttribute("src", src);
    doc.body.appendChild(script);
  });
  return doc;
};

test("names the hashed main bundle the page is running", () => {
  expect(currentBuildId(docWith("/static/js/main.f11b0f70.js"))).toBe("main.f11b0f70");
});

test("ignores the chunks and picks the main bundle whatever the order", () => {
  const doc = docWith("/static/js/942.8b675fac.chunk.js", "/static/js/main.abc12345.js");
  expect(currentBuildId(doc)).toBe("main.abc12345");
});

test("says nothing rather than something wrong when there is no hashed build", () => {
  // `npm start` serves /static/js/bundle.js. A dev session must not report a build id that no
  // deployment has, because the whole point is telling two devices apart.
  expect(currentBuildId(docWith("/static/js/bundle.js"))).toBeNull();
  expect(currentBuildId(docWith())).toBeNull();
  expect(currentBuildId(null)).toBeNull();
});
