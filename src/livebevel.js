// Live fillet/chamfer (drag an arrow or type a size), outline-only selection glow,
// and the red arrow moved to the bottom of the object. Load after pushpull.js.
(function () {
  const el = renderer.domElement;
  const base = window.cadBevelEdges; // one-shot version from pushpull.js
  let sess = null,
    drag = null,
    busy = false,
    latest = 0;

  // ---------- Selection glow follows the real outline, not a bounding box ----------
  let tinted = null;
  const holder = new THREE.Object3D();
  holder.update = () => {};
  setGlow = function (mesh) {
    if (tinted) {
      tinted.color.set(0xffffff);
      tinted = null;
    }
    glowBox = null;
    const e = mesh && mesh.userData.edges;
    if (e) {
      e.material.color.set(0x3ddc84);
      tinted = e.material;
      glowBox = holder;
    }
  };

  // ---------- Orange drag arrow for the fillet/chamfer size ----------
  const mat = new THREE.MeshBasicMaterial({ color: 0xffa500, depthTest: false });
  const arr = new THREE.Group();
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.3, 10), mat);
  sh.position.y = 0.65;
  const hd = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.7, 16), mat);
  hd.position.y = 1.65;
  arr.add(sh, hd);
  arr.children.forEach((c) => (c.renderOrder = 22));
  arr.visible = false;
  scene.add(arr);

  const panel = document.createElement("div");
  panel.style.cssText =
    "position:absolute;right:254px;bottom:14px;width:230px;background:rgba(28,31,38,.95);border:1px solid #3a4150;border-radius:16px;padding:10px;color:#fff;font:13px -apple-system,sans-serif;z-index:8;display:none";
  panel.dataset.dragkey = "bevelpanel";
  panel.dataset.dragbody = "1";
  document.body.appendChild(panel);

  const scr = (v) => {
    const p = v.clone().project(camera);
    return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
  };
  function queue(v) {
    latest = v;
    if (busy) return;
    busy = true;
    requestAnimationFrame(() => {
      busy = false;
      run(latest);
    });
  }
  // Each size change swaps the one undo entry, so undo still removes the whole fillet.
  function run(size) {
    const s = sess;
    if (!s) return;
    if (undoStack[undoStack.length - 1] !== s.entry) {
      finish();
      cadToast("Size editing ended because other changes were made", true);
      return;
    }
    undoStack.pop().undo();
    try {
      base(s.k, s.m, s.chs, s.kind, size);
      s.size = size;
    } catch (e) {
      cadToast("That size doesn't fit (" + (e.message || e) + ")");
      try {
        base(s.k, s.m, s.chs, s.kind, s.size);
      } catch (e2) {}
    }
    s.entry = undoStack[undoStack.length - 1];
    if (s.input && document.activeElement !== s.input)
      s.input.value = Math.round(toDisplay(s.size) * 100) / 100;
  }
  function finish() {
    sess = null;
    drag = null;
    panel.style.display = "none";
    arr.visible = false;
  }
  function cancel() {
    const s = sess;
    if (!s) return;
    if (undoStack[undoStack.length - 1] === s.entry) undoStack.pop().undo();
    finish();
  }
  function openPanel() {
    panel.innerHTML = "";
    const row = (...els) => {
      const d = document.createElement("div");
      d.style.cssText = "display:flex;gap:6px;margin:6px 0;align-items:center";
      d.append(...els);
      panel.appendChild(d);
    };
    const span = (t) => {
      const s = document.createElement("span");
      s.textContent = t;
      return s;
    };
    const btn = (t, fn) => {
      const b = document.createElement("button");
      b.textContent = t;
      b.onclick = fn;
      b.style.cssText =
        "flex:1;padding:8px;border:none;border-radius:10px;background:#2f8cff;color:#fff;font-size:13px";
      return b;
    };
    const i = document.createElement("input");
    i.type = "number";
    i.step = "any";
    i.value = Math.round(toDisplay(sess.size) * 100) / 100;
    i.style.cssText =
      "width:80px;padding:6px;border-radius:8px;border:1px solid #4a5568;background:#2d3340;color:#fff;font-size:14px";
    i.oninput = () => {
      const v = toScene(parseFloat(i.value));
      if (v > 0.01) queue(v);
    };
    sess.input = i;
    row(span((sess.kind === "fillet" ? "Fillet radius" : "Chamfer size") + ": drag the orange arrow or type"));
    row(i, span(UNITS[unitIndex].name));
    row(btn("Done", finish), btn("Cancel", cancel));
    panel.style.display = "block";
  }

  // Replaces the one-shot version: apply once, then keep the size editable
  window.cadBevelEdges = function (k, m, chs, kind, size) {
    finish();
    const ctr = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
    base(k, m, chs, kind, size);
    const anchor = chs
      .reduce((a, c) => a.add(c.c), new THREE.Vector3())
      .divideScalar(chs.length);
    const out = anchor.clone().sub(ctr);
    if (out.length() < 1e-3) out.set(0, 1, 0);
    out.normalize();
    sess = { k, m, chs, kind, size, anchor, out, entry: undoStack[undoStack.length - 1] };
    openPanel();
    arr.visible = true;
  };

  addEventListener(
    "pointerdown",
    (e) => {
      if (!sess || e.target !== el || (e.pointerType === "mouse" && e.button !== 0)) return;
      setRay(e);
      if (!raycaster.intersectObjects(arr.children, true)[0]) return;
      const a = scr(sess.anchor),
        b = scr(sess.anchor.clone().sub(sess.out));
      drag = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        sx: b.x - a.x,
        sy: b.y - a.y,
        size0: sess.size
      };
      el.setPointerCapture(e.pointerId);
      e.stopImmediatePropagation();
    },
    true
  );
  addEventListener(
    "pointermove",
    (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d =
        ((e.clientX - drag.x) * drag.sx + (e.clientY - drag.y) * drag.sy) /
        (drag.sx * drag.sx + drag.sy * drag.sy || 1);
      const size = Math.max(0.05, Math.round((drag.size0 + d * 0.7) * 20) / 20);
      showMeasure((sess.kind === "fillet" ? "Radius: " : "Size: ") + fmt(size));
      queue(size);
      e.stopImmediatePropagation();
    },
    true
  );
  addEventListener(
    "pointerup",
    (e) => {
      if (drag && e.pointerId === drag.id) {
        drag = null;
        hideMeasure();
        e.stopImmediatePropagation();
      }
    },
    true
  );
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") cancel();
  });

  // ---------- Per-frame: arrow centered on the object, red arrow under it ----------
  (function frame() {
    requestAnimationFrame(frame);
    if (arrow.visible && selected) {
      const bb = new THREE.Box3().setFromObject(selected);
      const c = window.cadCentroid(selected);
      arrow.position.set(c.x, bb.max.y, c.z);
      downHead.visible = bb.min.y < 0.02; // red arrow only for the face sitting on the plate
      downHead.position.y = bb.min.y - bb.max.y - 0.45;
    }
    if (sess) {
      arr.position.copy(sess.anchor).addScaledVector(sess.out, 2);
      arr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sess.out.clone().negate());
    }
  })();
})();
