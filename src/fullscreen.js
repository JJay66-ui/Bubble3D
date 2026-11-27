// Full screen: a button (top, next to the View cube) plus the first tap goes full screen.
// On iPad Safari, real full screen needs "Add to Home Screen" (Share button); this file sets that up too.
(function () {
  const head = document.head;
  const meta = (n, c) => {
    if (document.querySelector('meta[name="' + n + '"]')) return;
    const m = document.createElement("meta");
    m.name = n;
    m.content = c;
    head.appendChild(m);
  };
  meta("apple-mobile-web-app-capable", "yes");
  meta("mobile-web-app-capable", "yes");
  meta("apple-mobile-web-app-status-bar-style", "black-translucent");
  meta("apple-mobile-web-app-title", "Bubble 3D");
  const vp = document.querySelector('meta[name="viewport"]');
  const want = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
  if (vp) vp.setAttribute("content", want);
  else meta("viewport", want);
  try {
    const man = {
      name: "Bubble 3D Modeler",
      short_name: "Bubble 3D",
      start_url: location.pathname,
      display: "fullscreen",
      display_override: ["fullscreen", "standalone"],
      background_color: "#0f1218",
      theme_color: "#0f1218"
    };
    const l = document.createElement("link");
    l.rel = "manifest";
    l.href = URL.createObjectURL(new Blob([JSON.stringify(man)], { type: "application/manifest+json" }));
    head.appendChild(l);
  } catch (e) {}
  document.documentElement.style.overscrollBehavior = "none";
  document.body.style.overscrollBehavior = "none";

  const root = document.documentElement;
  const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  // installed home-screen app (no browser bars at all); ordinary full screen does not count
  const standalone = () => !isFull() && (navigator.standalone === true || matchMedia("(display-mode: standalone)").matches);
  let warned = false;
  function enter() {
    const f = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!f) return false;
    try {
      const r = f.call(root);
      if (r && r.catch) r.catch(() => {});
      return true;
    } catch (e) {
      return false;
    }
  }
  function leave() {
    const f = document.exitFullscreen || document.webkitExitFullscreen;
    if (f) {
      try {
        f.call(document);
      } catch (e) {}
    }
  }
  function toggle() {
    if (isFull()) return leave();
    if (!enter() && !standalone() && window.cadToast)
      window.cadToast("For full screen on iPad: tap the Share button, then Add to Home Screen, then open Bubble 3D from your home screen.", true);
  }

  const b = document.createElement("button");
  b.textContent = "⛶";
  b.title = "Full screen";
  b.style.cssText =
    "position:fixed;right:130px;top:10px;z-index:9;width:40px;height:40px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(28,31,38,.6);color:#fff;font-size:20px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)";
  b.onclick = toggle;
  document.body.appendChild(b);
  const sync = () => {
    b.style.display = standalone() ? "none" : "block";
    b.textContent = isFull() ? "\u2715" : "\u26F6"; // exit sits in the same spot as enter
    b.title = isFull() ? "Exit full screen" : "Full screen";
  };
  sync();
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("webkitfullscreenchange", sync);

  // first tap anywhere also tries full screen once
  addEventListener(
    "pointerup",
    () => {
      if (warned || isFull() || standalone()) return;
      warned = true;
      enter();
    },
    { once: true, capture: true }
  );
})();
