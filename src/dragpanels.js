// Remembers where you drag every movable pop-up, and puts it back there whenever it reappears.
(function () {
  const KEY = "bubble3d.panelpos";
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch (e) {}
  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch (e) {}
  };
  const SEL = "#actions,#objs,#linepanel,#panel,[data-dragkey]";
  const keyOf = (el) => el.dataset.dragkey || el.id;
  const all = () => Array.from(document.querySelectorAll(SEL));
  const shown = (el) => getComputedStyle(el).display !== "none";
  const put = (el, p) => {
    const l = Math.min(Math.max(0, p.left), innerWidth - 60),
      t = Math.min(Math.max(0, p.top), innerHeight - 40);
    el.style.left = l + "px";
    el.style.top = t + "px";
    el.style.right = "auto";
    el.style.bottom = "auto";
  };
  // put a panel back when it reappears
  const was = new WeakMap();
  (function loop() {
    all().forEach((el) => {
      const v = shown(el);
      if (v && !was.get(el)) {
        const k = keyOf(el);
        if (k && saved[k]) put(el, saved[k]);
      }
      was.set(el, v);
    });
    requestAnimationFrame(loop);
  })();

  let g = null; // current gesture
  const interactive = (t) => t.closest("input,select,textarea,button,a,label");
  addEventListener(
    "pointerdown",
    (e) => {
      const el = e.target.closest && e.target.closest(SEL);
      if (!el || !shown(el)) return (g = null);
      const r = el.getBoundingClientRect();
      g = { el, l0: r.left, t0: r.top, x: e.clientX, y: e.clientY, body: false };
      // panels marked data-dragbody can be dragged by any empty spot
      if (el.dataset.dragbody && !interactive(e.target) && !e.target.closest("[data-handle]")) {
        g.body = true;
        el.style.left = r.left + "px";
        el.style.top = r.top + "px";
        el.style.right = "auto";
        el.style.bottom = "auto";
        el.style.touchAction = "none";
      }
    },
    true
  );
  addEventListener(
    "pointermove",
    (e) => {
      if (!g || !g.body) return;
      e.preventDefault();
      put(g.el, { left: g.l0 + e.clientX - g.x, top: g.t0 + e.clientY - g.y });
    },
    true
  );
  const up = () => {
    const d = g;
    g = null;
    if (!d || !shown(d.el)) return;
    const r = d.el.getBoundingClientRect();
    if (Math.abs(r.left - d.l0) < 2 && Math.abs(r.top - d.t0) < 2) return;
    const k = keyOf(d.el);
    if (!k) return;
    saved[k] = { left: r.left, top: r.top };
    persist();
  };
  addEventListener("pointerup", up, true);
  addEventListener("pointercancel", up, true);
})();
