// Pick an object in the list on the right: it turns see-through (even inside other objects)
// and three drag pads appear to move it freely: up/down, left/right, front/back.
(function () {
  let listSel = null,
    saved = null;
  const V3 = THREE.Vector3;

  function xray(m, on) {
    const mat = m.material;
    if (!mat) return;
    if (on) {
      saved = {
        m,
        transparent: mat.transparent,
        opacity: mat.opacity,
        depthTest: mat.depthTest,
        depthWrite: mat.depthWrite,
        ro: m.renderOrder
      };
      mat.transparent = true;
      mat.opacity = 0.5;
      mat.depthTest = false;
      mat.depthWrite = false;
      m.renderOrder = 15;
      mat.needsUpdate = true;
    } else if (saved && saved.m === m) {
      mat.transparent = saved.transparent;
      mat.opacity = saved.opacity;
      mat.depthTest = saved.depthTest;
      mat.depthWrite = saved.depthWrite;
      m.renderOrder = saved.ro;
      mat.needsUpdate = true;
      saved = null;
    }
  }

  // ---- panel with the three pads ----
  const wrap = document.createElement("div");
  wrap.dataset.dragkey = "objmove";
  wrap.style.cssText =
    "position:fixed;right:14px;top:300px;z-index:8;width:176px;box-sizing:border-box;padding:8px;border-radius:16px;background:rgba(28,31,38,.94);border:1px solid #3a4150;color:#fff;font:12px -apple-system,sans-serif;user-select:none;display:none";
  const head = document.createElement("div");
  head.textContent = "☰  Move object";
  head.style.cssText = "padding:2px 2px 8px;color:#9aa4b5;cursor:grab;touch-action:none";
  wrap.appendChild(head);
  document.body.appendChild(wrap);
  if (typeof makeDraggable === "function") makeDraggable(wrap, head);

  const ground = (v) => {
    v.y = 0;
    return v.lengthSq() < 1e-6 ? v.set(1, 0, 0) : v.normalize();
  };
  const dirs = {
    up: () => new V3(0, 1, 0),
    right: () => ground(new V3().setFromMatrixColumn(camera.matrixWorld, 0)),
    depth: () => ground(new V3().setFromMatrixColumn(camera.matrixWorld, 2).negate())
  };
  const SPEED = 0.02; // scene units per pixel
  function pad(label, w, h, axis, vertical) {
    const p = document.createElement("div");
    p.style.cssText =
      "margin:6px auto;border-radius:14px;background:#1b1f27;border:1px solid #3a4150;display:flex;align-items:center;justify-content:center;color:#9aa4b5;touch-action:none;cursor:" +
      (vertical ? "ns-resize" : "ew-resize") +
      ";width:" + w + "px;height:" + h + "px;text-align:center;line-height:1.3";
    p.textContent = label;
    let g = null;
    p.addEventListener("pointerdown", (e) => {
      if (!listSel || !listSel.parent) return;
      g = { x: e.clientX, y: e.clientY, p0: listSel.position.clone(), d: dirs[axis](), moved: 0 };
      p.setPointerCapture(e.pointerId);
      p.style.background = "#2a3140";
      e.preventDefault();
      e.stopPropagation();
    });
    p.addEventListener("pointermove", (e) => {
      if (!g || !listSel) return;
      const px = vertical ? -(e.clientY - g.y) : e.clientX - g.x;
      g.moved = px * SPEED;
      const np = g.p0.clone().addScaledVector(g.d, g.moved);
      listSel.position.copy(np);
      lift(listSel);
      listSel.updateMatrixWorld(true);
      if (window.showMeasure) showMeasure(label.replace(/\n/g, " ") + ": " + fmt(Math.abs(g.moved)));
      e.stopPropagation();
    });
    const end = (e) => {
      if (!g) return;
      const d = g,
        m = listSel;
      g = null;
      p.style.background = "#1b1f27";
      if (window.hideMeasure) hideMeasure();
      if (!m) return;
      const p1 = m.position.clone(),
        p0 = d.p0;
      if (p1.distanceTo(p0) < 1e-4) return;
      undoStack.push({
        redo() {
          m.position.copy(p1);
          m.updateMatrixWorld(true);
        },
        undo() {
          m.position.copy(p0);
          m.updateMatrixWorld(true);
        }
      });
      redoStack.length = 0;
    };
    p.addEventListener("pointerup", end);
    p.addEventListener("pointercancel", end);
    wrap.appendChild(p);
  }
  // nothing may sink below the plate
  function lift(m) {
    const lo = new THREE.Box3().setFromObject(m).min.y;
    if (lo < 0 && !m.userData.isLine) m.position.y -= lo;
  }
  pad("↕\nUp / Down", 70, 130, "up", true);
  pad("↔  Left / Right", 150, 56, "right", false);
  pad("⤢  Front / Back", 150, 56, "depth", false);

  // ---- hook the object list ----
  const _sel = selectFromList;
  selectFromList = function (o) {
    const before = listSel;
    _sel(o);
    if (before && before !== o) xray(before, false);
    if (o.userData.isLine || o.visible === false) {
      listSel = null;
      return;
    }
    listSel = o;
    xray(o, true);
  };
  // when something else becomes selected, or it goes away, put it back
  (function loop() {
    if (listSel) {
      const gone = !listSel.parent || listSel.visible === false || selected !== listSel;
      if (gone) {
        xray(listSel, false);
        listSel = null;
      }
    }
    wrap.style.display = listSel ? "block" : "none";
    requestAnimationFrame(loop);
  })();
})();
