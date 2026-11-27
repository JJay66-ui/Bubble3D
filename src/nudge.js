// Move pad: with the Move tool, arrow buttons slide the selected shape by an exact distance.
// Type the distance in the middle box (mm, cm or in, whatever the ruler button is set to).
(function () {
  const wrap = document.createElement("div");
  wrap.style.cssText =
    "position:fixed;left:14px;top:46%;z-index:9;width:172px;border-radius:16px;background:rgba(28,31,38,.78);border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#fff;font:12px -apple-system,sans-serif;user-select:none;touch-action:none;display:none";
  const head = document.createElement("div");
  head.textContent = "☰ Move by";
  head.style.cssText = "padding:5px 10px;color:#9aa4b5;cursor:grab;touch-action:none";
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:5px;padding:4px 8px 6px";
  const note = document.createElement("div");
  note.style.cssText = "padding:0 10px 8px;color:#9aa4b5;font-size:11px;min-height:14px";
  wrap.append(head, grid, note);
  wrap.dataset.dragkey = "nudge";
  document.body.appendChild(wrap);
  if (typeof makeDraggable === "function") makeDraggable(wrap, head);

  const bs = "height:38px;border:none;border-radius:10px;background:#2f8cff;color:#fff;font-size:18px;padding:0";
  const btn = (t, fn, extra) => {
    const b = document.createElement("button");
    b.textContent = t;
    b.style.cssText = bs + (extra || "");
    b.onclick = fn;
    return b;
  };
  const input = document.createElement("input");
  input.type = "number";
  input.value = "10";
  input.min = "0";
  input.step = "any";
  input.style.cssText =
    "width:100%;height:38px;box-sizing:border-box;text-align:center;border:1px solid #3a4150;border-radius:10px;background:#1b1f27;color:#fff;font-size:15px;padding:0";
  const unit = document.createElement("div");
  unit.style.cssText = "text-align:center;color:#9aa4b5;font-size:11px";

  function target() {
    if (typeof selected !== "undefined" && selected && !selected.userData.isLine && selected.parent) return selected;
    if (typeof moveObj !== "undefined" && moveObj && !moveObj.userData.isLine && moveObj.parent) return moveObj;
    const f = window.cadSelFaces ? window.cadSelFaces()[0] : null;
    return f ? f.mesh : null;
  }
  // arrows follow the camera: up = away from you, snapped to the grid axes
  function dirs() {
    const fx = -Math.sin(yaw),
      fz = -Math.cos(yaw);
    const f = Math.abs(fx) > Math.abs(fz) ? [Math.sign(fx), 0] : [0, Math.sign(fz)];
    return { f, r: [-f[1], f[0]] };
  }
  function move(dx, dy, dz) {
    const m = target();
    if (!m) {
      note.textContent = "Tap a shape first.";
      return;
    }
    const d = parseFloat(input.value);
    if (!(d > 0)) {
      note.textContent = "Type a distance above 0.";
      return;
    }
    const s = toScene(d);
    const from = m.position.clone(),
      to = from.clone().add(new THREE.Vector3(dx * s, dy * s, dz * s));
    const lo = new THREE.Box3().setFromObject(m).min.y + (to.y - from.y);
    if (lo < -0.005) to.y -= lo; // the plate is zero
    perform({
      redo() {
        m.position.copy(to);
        m.updateMatrixWorld(true);
      },
      undo() {
        m.position.copy(from);
        m.updateMatrixWorld(true);
      }
    });
    note.textContent = "Moved " + d + " " + UNITS[unitIndex].name;
    if (typeof showArrow === "function") showArrow(m);
  }
  const mv = (sx, sz) => () => {
    const { f, r } = dirs();
    move(f[0] * sx + r[0] * sz, 0, f[1] * sx + r[1] * sz);
  };
  const blank = () => document.createElement("div");
  const mid = document.createElement("div");
  mid.append(input, unit);
  grid.append(
    btn("⬆", () => move(0, 1, 0), ";background:#3a4150;font-size:13px"),
    btn("▲", mv(1, 0)),
    btn("⬇", () => move(0, -1, 0), ";background:#3a4150;font-size:13px"),
    btn("◀", mv(0, -1)),
    mid,
    btn("▶", mv(0, 1)),
    blank(),
    btn("▼", mv(-1, 0)),
    blank()
  );
  const lift = document.createElement("div");
  lift.style.cssText = "padding:0 10px 4px;color:#9aa4b5;font-size:11px";
  lift.textContent = "⬆ up  ⬇ down  (height)";
  wrap.insertBefore(lift, note);


  // ---------- Drag arrows: grab one and slide the shape along that direction ----------
  const el = renderer.domElement;
  const gz = new THREE.Group();
  const AX = [
    { v: new THREE.Vector3(1, 0, 0), name: "left / right" },
    { v: new THREE.Vector3(0, 0, 1), name: "up / down" },
    { v: new THREE.Vector3(0, 1, 0), name: "height" }
  ];
  const gmat = new THREE.MeshBasicMaterial({ color: 0x3ddc84, depthTest: false });
  const gsh = new THREE.MeshBasicMaterial({ color: 0xcfd6e3, depthTest: false });
  AX.forEach((a, i) => {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5, 10), gsh);
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 16), gmat);
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 16), gmat);
    c1.position.y = 2.95;
    c2.position.y = -2.95;
    c2.rotation.x = Math.PI;
    g.add(shaft, c1, c2);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.v);
    g.children.forEach((c) => (c.renderOrder = 22));
    g.userData.ax = i;
    gz.add(g);
  });
  gz.visible = false;
  scene.add(gz);
  let gd = null;
  const scr = (v) => {
    const p = v.clone().project(camera);
    return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
  };
  addEventListener(
    "pointerdown",
    (e) => {
      if (!gz.visible || e.target !== el || (e.pointerType === "mouse" && e.button !== 0)) return;
      setRay(e);
      const hit = raycaster.intersectObjects(gz.children, true)[0];
      if (!hit) return;
      let o = hit.object;
      while (o.parent && o.parent !== gz) o = o.parent;
      const m = target();
      if (!m) return;
      const ax = AX[o.userData.ax].v,
        a = scr(gz.position),
        b = scr(gz.position.clone().add(ax));
      gd = { id: e.pointerId, m, ax, from: m.position.clone(), x: e.clientX, y: e.clientY, sx: b.x - a.x, sy: b.y - a.y, d: 0 };
      el.setPointerCapture(e.pointerId);
      e.stopImmediatePropagation();
    },
    true
  );
  addEventListener(
    "pointermove",
    (e) => {
      if (!gd || e.pointerId !== gd.id) return;
      const len2 = gd.sx * gd.sx + gd.sy * gd.sy || 1;
      let d = ((e.clientX - gd.x) * gd.sx + (e.clientY - gd.y) * gd.sy) / len2;
      d = Math.round(d * 4) / 4;
      const to = gd.from.clone().addScaledVector(gd.ax, d);
      const lo = new THREE.Box3().setFromObject(gd.m).min.y + (to.y - gd.m.position.y);
      if (lo < -0.005) to.y -= lo; // the plate is zero
      gd.m.position.copy(to);
      gd.m.updateMatrixWorld(true);
      gd.d = d;
      if (typeof showMeasure === "function") showMeasure("Moved: " + fmt(d));
      e.stopImmediatePropagation();
    },
    true
  );
  const gend = (e) => {
    if (!gd || e.pointerId !== gd.id) return;
    const m = gd.m,
      from = gd.from,
      to = m.position.clone();
    gd = null;
    if (typeof hideMeasure === "function") hideMeasure();
    e.stopImmediatePropagation();
    if (from.distanceTo(to) < 1e-6) return;
    undoStack.push({
      redo() {
        m.position.copy(to);
        m.updateMatrixWorld(true);
      },
      undo() {
        m.position.copy(from);
        m.updateMatrixWorld(true);
      }
    });
    redoStack.length = 0;
  };
  addEventListener("pointerup", gend, true);
  addEventListener("pointercancel", gend, true);

  (function frame() {
    requestAnimationFrame(frame);
    const show = typeof tool !== "undefined" && tool === "move";
    wrap.style.display = show ? "block" : "none";
    const tm = show ? target() : null;
    gz.visible = !!tm;
    if (tm && !gd) {
      const bb = new THREE.Box3().setFromObject(tm);
      gz.position.copy(bb.getCenter(new THREE.Vector3()));
    }
    if (typeof arrow !== "undefined" && show) arrow.visible = false; // the big up arrow is replaced by these
    if (show) {
      unit.textContent = UNITS[unitIndex].name;
      if (!target() && !note.textContent.startsWith("Moved")) note.textContent = "Tap a shape first.";
      else if (target() && note.textContent === "Tap a shape first.") note.textContent = "";
    }
  })();
})();
