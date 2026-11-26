// On-screen status for people who can't open the browser console.
// Shows whether the CAD kernel loaded and prints any script errors on the page.
(function () {
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;left:84px;top:10px;z-index:40;max-width:min(70vw,640px);padding:6px 12px;border-radius:14px;font:12px/1.4 -apple-system,sans-serif;color:#fff;background:#555;white-space:pre-wrap;word-break:break-word";
  document.body.appendChild(box);

  const notes = [];
  const add = (t) => {
    notes.push(String(t).slice(0, 400));
    if (notes.length > 6) notes.shift();
    draw();
  };
  const ow = console.warn,
    oe = console.error;
  console.warn = function (...a) {
    if (/CAD kernel|Sketch solid|OCCT/i.test(String(a[0]))) add(a.map((x) => (x && x.message) || x).join(" "));
    ow.apply(console, a);
  };
  console.error = function (...a) {
    add("Error: " + a.map((x) => (x && x.message) || x).join(" "));
    oe.apply(console, a);
  };
  addEventListener("error", (e) => add("Error: " + e.message + (e.filename ? " (" + e.filename.split("/").pop() + ":" + e.lineno + ")" : "")));
  addEventListener("unhandledrejection", (e) => add("Error: " + ((e.reason && e.reason.message) || e.reason)));

  function draw() {
    const ready = !!window.cadKernelReady;
    box.style.background = ready ? "#1f7a4d" : notes.length ? "#a93226" : "#555";
    box.textContent =
      (ready ? "CAD kernel: ready" : "CAD kernel: not loaded yet") +
      "  |  build r12" +
      (notes.length ? "\n" + notes.join("\n") : "") +
      "\n(tap to hide)";
  }
  box.addEventListener("click", () => (box.style.display = "none"));
  addEventListener("cadkernelready", draw);
  draw();
  setTimeout(draw, 3000);
  setTimeout(draw, 10000);
})();
