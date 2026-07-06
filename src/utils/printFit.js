// Centralized print scaling — one source of truth for every "Print / ปริ้น PDF" button.
//
// Problem it fixes: the app used to rely on a fixed `transform: scale(0.88)` in globals.css
// (tuned once for a portrait layout). As layouts changed (landscape charts, wider tables) that
// magic number drifted — content either spilled onto page 2 or printed tiny with wide margins.
//
// Approach (generalized from the one page that already printed correctly, RouteScheduleView):
// measure the element that will actually be printed, then shrink it with CSS `zoom` so it fills
// exactly the printable page box. `zoom` (not `transform`) is used on purpose — it shrinks the
// real layout box, so a scaled-down block does not leave empty space that pushes a blank page 2.

// A4 printable area @96dpi, minus @page margins and slack for the browser's print header/footer.
// Landscape values are the ones proven in production by RouteScheduleView (1020×680).
export const PAGE_PX = {
  portrait: { w: 715, h: 1000 },
  landscape: { w: 1020, h: 680 },
};

// Pure: the zoom factor that fits a W×H box onto the page.
//   onePage=true  → fit BOTH width and height on a single page (charts, forms).
//   onePage=false → fit WIDTH only; height flows to more pages (long reports / tables).
// Never upscales (capped at 1); ×0.99 guards against rounding spilling over the edge.
export function fitScale(W, H, orientation = "portrait", onePage = true) {
  const page = PAGE_PX[orientation] || PAGE_PX.portrait;
  if (!(W > 0)) return 1;
  const byWidth = page.w / W;
  const raw = onePage && H > 0 ? Math.min(byWidth, page.h / H, 1) : Math.min(byWidth, 1);
  return Math.max(0.1, raw * 0.99);
}

// Fit `el` to the printed page, print, then restore. Mirrors RouteScheduleView's proven flow,
// centralized so every print button behaves the same.
export function fitAndPrint(el, { orientation = "portrait", onePage = true, margin = 8 } = {}) {
  const pageStyle = document.createElement("style");
  pageStyle.setAttribute("data-print-fit", "");
  pageStyle.textContent = `@media print { @page { size: A4 ${orientation}; margin: ${margin}mm; } }`;
  document.head.appendChild(pageStyle);

  let undo = () => {};
  if (el) {
    // Measure the box as it will actually PRINT: temporarily hide print-only-hidden content so
    // scrollHeight excludes sections marked print:hidden / no-print (e.g. the 3D map, filter bars).
    // Reading scrollWidth/Height below forces a synchronous reflow with this style applied.
    const measureStyle = document.createElement("style");
    measureStyle.textContent = `.print\\:hidden, .no-print { display: none !important; }`;
    document.head.appendChild(measureStyle);
    const W = el.scrollWidth, H = el.scrollHeight;
    measureStyle.remove();

    if (W > 0 && H > 0) {
      el.style.setProperty("width", `${W}px`, "important"); // freeze width so recharts SVG doesn't reflow at print
      el.style.zoom = String(fitScale(W, H, orientation, onePage));
      undo = () => {
        el.style.removeProperty("width");
        el.style.zoom = "";
      };
    }
  }

  window.print(); // blocks until the print dialog closes, so restoring right after is safe
  undo();
  pageStyle.remove();
}
