// Red/blue line endpoint handles, two-finger camera, accidental-touch guard, fuller undo/redo.
// Loads after app.js and needs no edits to it.
(function () {
  const host = document.getElementById("view");
  const el = renderer.domElement;
  const touches = new Map();
  let locked = false; // true once a 2nd finger lands, until every finger lifts
  let nav = null;
  let drag = null;
  let snap = null;

  // ---------- Red (start) and blue (end) handles ----------
  const mk = (color) => {
    const h = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 20, 14),
      new THREE.MeshBasicMaterial({ color, depthTest: false })
    );
    h.renderOrder = 11;
    h.visible = false;
    scene.add(h);
    return h;
  };
  const hA = mk(0xff4d4d),
    hB = mk(0x3b82f6);
  // keep the grab areas for dragging the ends, but don't show them: the regular blue dots stay as they are
  hA.material.visible = false;
  hB.material.visible = false;
  placeHandle = function () {}; // retire the old single green handle
  const _constrain = constrainLine;
  constrainLine = function (kind) {
    const l = selLine;
    if (kind === "lock" && l) {
      const was = !!l.userData.locked;
      _constrain(kind);
      const now = !!l.userData.locked;
      if (now !== was) {
        const set = (v) => {
          l.userData.locked = v;
          if (selLine === l) {
            ll.disabled = v;
            document.getElementById("cLock").classList.toggle("on", v);
          }
        };
        undoStack.push({ redo: () => set(now), undo: () => set(was) });
        redoStack.length = 0;
      }
      return;
    }
    _constrain(kind);
  };

  // ---------- Gesture snapshot so a 2nd finger can cancel cleanly ----------
  function snapshot() {
    snap = {
      shapes: shapes.map((m) => ({
        m,
        p: m.position.clone(),
        ry: m.rotation.y,
        s: m.scale.clone(),
        h: m.userData.height,
        b: m.userData.bevel || 0
      })),
      lines: lines.map((l) => ({
        l,
        a: l.userData.a.clone(),
        b: l.userData.b.clone()
      }))
    };
  }
  function cancelGesture() {
    if (preview) {
      scene.remove(preview);
      preview = null;
    }
    if (snap) {
      snap.shapes.forEach((s) => {
        const m = s.m;
        m.position.copy(s.p);
        m.rotation.y = s.ry;
        m.scale.copy(s.s);
        m.userData.height = s.h;
        if (!m.userData.imported && (m.userData.bevel || 0) !== s.b)
          applyBevel(m, tool, s.b);
      });
      snap.lines.forEach((s) => setLineEnds(s.l, s.a, s.b));
    }
    mode = null;
    moveObj = null;
    bevelObj = null;
    stretchLine = null;
    drag = null;
    hideMeasure();
    if (selected && arrow.visible) showArrow(selected);
  }

  // ---------- Handle dragging ----------
  function tryHandle(e) {
    if (!selLine) return false;
    if (tool === "line" || tool === "rect" || tool === "circle") return false; // drawing: never grab a handle
    setRay(e);
    const hit = raycaster.intersectObjects([hA, hB], false)[0];
    if (!hit) return false;
    const l = selLine;
    drag = {
      id: e.pointerId,
      line: l,
      end: hit.object === hA ? "a" : "b",
      a0: l.userData.a.clone(),
      b0: l.userData.b.clone()
    };
    el.setPointerCapture(e.pointerId);
    showMeasure("Length: " + fmt(lineLen(l)));
    return true;
  }
  function moveHandle(e) {
    const gp = groundRaw(e);
    if (!gp) return;
    const l = drag.line;
    const fixed = (drag.end === "a" ? l.userData.b : l.userData.a).clone();
    let p = new THREE.Vector3(
      Math.round(gp.x * 2) / 2,
      0.02,
      Math.round(gp.z * 2) / 2
    );
    if (l.userData.locked) {
      // Locked length: the free end swings around the fixed end
      const dir = p.clone().sub(fixed).setY(0);
      if (dir.length() < 1e-6) return;
      p = fixed.clone().add(dir.normalize().multiplyScalar(lineLen(l)));
      p.y = 0.02;
    } else if (p.distanceTo(fixed) < 0.2) return;
    if (drag.end === "a") setLineEnds(l, p, fixed);
    else setLineEnds(l, fixed, p);
    ll.value = Math.round(toDisplay(lineLen(l)) * 100) / 100;
    showMeasure("Length: " + fmt(lineLen(l)));
  }
  function endDrag() {
    const d = drag;
    drag = null;
    hideMeasure();
    const l = d.line,
      na = l.userData.a.clone(),
      nb = l.userData.b.clone();
    if (na.equals(d.a0) && nb.equals(d.b0)) return;
    undoStack.push({
      redo: () => setLineEnds(l, na, nb),
      undo: () => setLineEnds(l, d.a0, d.b0)
    });
    redoStack.length = 0;
  }

  // ---------- Two-finger camera ----------
  function pair() {
    const [p, q] = [...touches.values()];
    return {
      mx: (p.x + q.x) / 2,
      my: (p.y + q.y) / 2,
      d: Math.hypot(p.x - q.x, p.y - q.y) || 1
    };
  }
  function navMove() {
    const n = pair();
    if (nav) {
      yaw -= (n.mx - nav.mx) * 0.008;
      pitch = Math.min(1.5, Math.max(-1.5, pitch + (n.my - nav.my) * 0.008));
      dist = Math.min(60, Math.max(4, (dist * nav.d) / n.d));
      updateCamera();
    }
    nav = n;
  }

  // ---------- Pointer interception (runs before app.js) ----------
  host.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType !== "mouse") {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 1) {
          locked = false;
          snapshot();
        }
        if (touches.size >= 2) {
          if (!locked) {
            cancelGesture();
            locked = true;
          }
          nav = pair();
          e.stopImmediatePropagation();
          return;
        }
      }
      if (!locked && tryHandle(e)) e.stopImmediatePropagation();
    },
    true
  );
  host.addEventListener(
    "pointermove",
    (e) => {
      if (touches.has(e.pointerId))
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (drag && e.pointerId === drag.id) {
        moveHandle(e);
        e.stopImmediatePropagation();
        return;
      }
      if (locked) {
        if (touches.size >= 2) navMove();
        e.stopImmediatePropagation();
      }
    },
    true
  );
  const up = (e) => {
    touches.delete(e.pointerId);
    if (drag && e.pointerId === drag.id) endDrag();
    if (touches.size < 2) nav = null;
    if (touches.size === 0) locked = false;
  };
  host.addEventListener("pointerup", up, true);
  host.addEventListener("pointercancel", up, true);

  // ---------- Undo for hide/show and rename, plus keyboard shortcuts ----------
  const seen = new WeakMap();
  const setState = (o, s) => {
    o.visible = s.v;
    o.userData.name = s.n;
    seen.set(o, { v: s.v, n: s.n });
    if (!s.v && selected === o) hideArrow();
    refreshList();
  };
  function frame() {
    requestAnimationFrame(frame);
    endHandle.visible = false;
    if (selLine) {
      hA.position.copy(selLine.userData.a);
      hB.position.copy(selLine.userData.b);
      hA.visible = hB.visible = true;
    } else hA.visible = hB.visible = false;
    const changes = [];
    [...shapes, ...lines].forEach((o) => {
      const cur = { v: o.visible !== false, n: o.userData.name };
      const old = seen.get(o);
      if (old && (old.v !== cur.v || old.n !== cur.n))
        changes.push({ o, before: old, after: cur });
      seen.set(o, cur);
    });
    if (changes.length) {
      undoStack.push({
        redo: () => changes.forEach((c) => setState(c.o, c.after)),
        undo: () => changes.forEach((c) => setState(c.o, c.before))
      });
      redoStack.length = 0;
    }
  }
  frame();
  addEventListener("keydown", (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    } else if (k === "y") {
      e.preventDefault();
      redo();
    }
  });
})();
