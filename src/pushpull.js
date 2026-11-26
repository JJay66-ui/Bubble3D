// Visible error banner, sturdier per-edge fillet/chamfer, centered arrows drawn on top,
// side push/pull arrows on boxes, and carving where one object is pushed into another.
// Load after select-tools.js.
(function () {
  const el = renderer.domElement;
  const O = () => window.occtOps;
  const K = () => (window.cadKernelReady ? window.occtKernel : null);
  const TWO_PI = Math.PI * 2;
  const UP = new THREE.Vector3(0, 1, 0);

  // ---------- Banner so messages can't be missed ----------
  const toast = document.createElement("div");
  toast.style.cssText =
    "position:fixed;left:50%;top:70px;transform:translateX(-50%);max-width:80vw;padding:8px 14px;border-radius:14px;color:#fff;font:13px -apple-system,sans-serif;z-index:30;display:none";
  document.body.appendChild(toast);
  let tt;
  window.cadToast = (t, ok) => {
    toast.textContent = t;
    toast.style.background = ok ? "rgba(31,157,85,.95)" : "rgba(192,57,43,.95)";
    toast.style.display = "block";
    clearTimeout(tt);
    tt = setTimeout(() => (toast.style.display = "none"), 9000);
  };

  // ---------- Kernel helpers (tolerant of small API differences) ----------
  const step = (name, fn) => {
    try {
      return fn();
    } catch (e) {
      throw new Error(name + ": " + (e.message || e));
    }
  };
  const vec = (v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]);
  const bbox = (k, s) => {
    const b = k.getBoundingBox(s);
    return { min: vec(b.min), max: vec(b.max) };
  };
  function put(k, s, x, y, z) {
    const b = bbox(k, s);
    const d = [x - b.min[0], y - b.min[1], z - b.min[2]];
    const off = (r) => {
      const n = bbox(k, r).min;
      return Math.abs(n[0] - x) + Math.abs(n[1] - y) + Math.abs(n[2] - z);
    };
    let r = k.translate(s, d[0], d[1], d[2]);
    if (r === undefined) r = s;
    if (off(r) > 0.01) {
      r = k.translate(s, d);
      if (r === undefined) r = s;
      if (off(r) > 0.01) throw new Error("translate gave an unexpected position");
    }
    return r;
  }
  // OCCT is Z-up: app (x, y, z) = OCCT (x, z, -y)
  function solidOf(k, m) {
    const own =
      m.userData.occt &&
      m.position.x === 0 &&
      m.position.z === 0 &&
      m.scale.x === 1 &&
      m.scale.z === 1 &&
      m.rotation.y === 0;
    if (own) return m.userData.occt;
    const p = m.geometry.parameters || {},
      H = Math.abs(m.userData.height);
    if (m.userData.height < 0.05) throw new Error("extrude the shape first");
    if (Math.abs(m.rotation.y) > 1e-6) throw new Error("rotated shapes aren't supported yet");
    if (m.userData.loopPts) {
      // Sketch shape (triangle, polygon...): rebuild it in OCCT from its corner points
      const sx = m.scale.x,
        sz = m.scale.z,
        ox = m.position.x,
        oz = m.position.z;
      const pts = m.userData.loopPts.map((q) => [q.x * sx + ox, q.z * sz + oz]);
      const n = pts.length;
      const edges = step("sketch edges", () =>
        pts.map((a, i) => {
          const b = pts[(i + 1) % n];
          return k.makeLineEdge(a[0], -a[1], 0, b[0], -b[1], 0);
        })
      );
      const wire = step("sketch wire", () => k.makeWire(edges));
      const face = step("sketch face", () => k.makeFace(wire));
      return { s: step("sketch solid", () => k.extrude(face, 0, 0, H)), H };
    }
    if (m.userData.imported || p.loop)
      throw new Error("STL imports, cut results and moved filleted shapes aren't supported yet");
    const cx = m.position.x,
      cz = m.position.z;
    if (p.radiusTop !== undefined) {
      if (Math.abs((p.thetaLength || TWO_PI) - TWO_PI) > 1e-6) throw new Error("half cylinder");
      const r = p.radiusTop * m.scale.x;
      return { s: step("place cylinder", () => put(k, k.makeCylinder(r, H), cx - r, -cz - r, 0)), H };
    }
    if (p.width !== undefined) {
      const W = p.width * m.scale.x,
        D = p.depth * m.scale.z;
      return { s: step("place box", () => put(k, k.makeBox(W, D, H), cx - W / 2, -cz - D / 2, 0)), H };
    }
    throw new Error("unsupported shape");
  }
  function swapGeometry(m, g, H, shape) {
    const b = {
      geo: m.geometry,
      edges: m.userData.edges,
      imp: m.userData.imported,
      occt: m.userData.occt,
      p: m.position.clone(),
      s: m.scale.clone()
    };
    const apply = () => {
      m.geometry = g;
      m.userData.imported = true;
      m.userData.occt = { s: shape, H };
      m.position.x = 0;
      m.position.z = 0;
      m.scale.x = 1;
      m.scale.z = 1;
      setHeight(m, H);
      O().addEdges(m, g);
    };
    const revert = () => {
      m.geometry = b.geo;
      m.userData.imported = b.imp;
      m.userData.occt = b.occt;
      m.position.x = b.p.x;
      m.position.z = b.p.z;
      m.scale.x = b.s.x;
      m.scale.z = b.s.z;
      setHeight(m, H);
      if (m.userData.edges) m.remove(m.userData.edges);
      m.userData.edges = b.edges;
      if (b.edges) m.add(b.edges);
    };
    apply();
    undoStack.push({ redo: apply, undo: revert });
    redoStack.length = 0;
  }

  // ---------- Per-edge fillet / chamfer (used by select-tools.js) ----------
  window.cadBevelEdges = function (k, m, chs, kind, size) {
    const { s, H } = solidOf(k, m);
    const all = step("list edges", () => k.getSubShapes(s, "edge")).map((e) => {
      const b = step("edge bounds", () => bbox(k, e));
      return {
        e,
        c: new THREE.Vector3(
          (b.min[0] + b.max[0]) / 2,
          (b.min[2] + b.max[2]) / 2,
          -(b.min[1] + b.max[1]) / 2
        )
      };
    });
    const chosen = chs.map((ch) => {
      let best = null,
        bd = 0.2;
      all.forEach((o) => {
        const d = o.c.distanceTo(ch.c);
        if (d < bd) {
          bd = d;
          best = o.e;
        }
      });
      if (!best) throw new Error("match edge: no kernel edge near the one you picked");
      return best;
    });
    const edges = [...new Set(chosen)];
    const out = step(kind, () => (kind === "fillet" ? k.fillet(s, edges, size) : k.chamfer(s, edges, size)));
    const g = step("mesh result", () => O().toGeometry(k.tessellate(out, 0.05, 0.3), H));
    swapGeometry(m, g, H, out);
    cadToast("OCCT " + kind + " applied to " + edges.length + " edge(s)", true);
  };

  // ---------- Carve: whatever overlaps the pushed object is removed from the others ----------
  function carve(tool) {
    const k = K();
    if (!k || !O() || !O().toGeometry) return;
    const tb = new THREE.Box3().setFromObject(tool).expandByScalar(-0.01);
    shapes.forEach((o) => {
      if (o === tool || o.visible === false) return;
      if (!new THREE.Box3().setFromObject(o).intersectsBox(tb)) return;
      try {
        const a = solidOf(k, o),
          b = solidOf(k, tool);
        const out = step("cut", () => k.cut(a.s, b.s));
        if (Math.abs(k.getVolume(a.s) - k.getVolume(out)) < 1e-4) return;
        const g = O().toGeometry(k.tessellate(out, 0.05, 0.3), a.H);
        swapGeometry(o, g, a.H, out);
        cadToast("Carved " + (o.userData.name || "object") + " where it overlaps", true);
      } catch (e) {
        cadToast("Carve not applied (" + (e.message || e) + ")");
      }
    });
  }

  // Remember the corner points of sketch shapes so OCCT can rebuild them
  const _lts = loopToShape;
  loopToShape = function (loop) {
    const mesh = _lts(loop);
    mesh.userData.loopPts = loop.pts.map((p) => p.clone());
    return mesh;
  };

  // Middle of a shape's footprint (area centroid), so a triangle's arrow sits in its middle
  const cenCache = new WeakMap();
  window.cadCentroid = function (m) {
    m.updateMatrixWorld(true);
    const g = m.geometry;
    let c = cenCache.get(g);
    if (!c) {
      const pos = g.attributes.position,
        idx = g.index,
        n = (idx ? idx.count : pos.count) / 3;
      let A = 0,
        sx = 0,
        sz = 0;
      const at = (i) => (idx ? idx.getX(i) : i);
      for (let t = 0; t < n; t++) {
        const i = at(3 * t),
          j = at(3 * t + 1),
          l = at(3 * t + 2);
        const ax = pos.getX(i),
          az = pos.getZ(i),
          bx = pos.getX(j),
          bz = pos.getZ(j),
          cx = pos.getX(l),
          cz = pos.getZ(l);
        const area = Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
        A += area;
        sx += (area * (ax + bx + cx)) / 3;
        sz += (area * (az + bz + cz)) / 3;
      }
      if (A > 1e-9) {
        c = { x: sx / A, z: sz / A };
        cenCache.set(g, c);
      }
    }
    if (!c) {
      const bb = new THREE.Box3().setFromObject(m);
      return { x: (bb.min.x + bb.max.x) / 2, z: (bb.min.z + bb.max.z) / 2 };
    }
    const v = new THREE.Vector3(c.x, 0, c.z).applyMatrix4(m.matrixWorld);
    return { x: v.x, z: v.z };
  };

  // ---------- Arrow: centered on the object and drawn over everything ----------
  [shaft, head, downHead].forEach((a) => {
    a.material.depthTest = false;
    a.renderOrder = 20;
  });
  const _show = showArrow;
  showArrow = function (mesh) {
    _show(mesh);
    const bb = new THREE.Box3().setFromObject(mesh);
    const c = window.cadCentroid(mesh);
    arrow.position.set(c.x, bb.max.y, c.z);
  };

  // ---------- Side arrows on boxes ----------
  const mat = new THREE.MeshBasicMaterial({ color: 0x4aa3ff, depthTest: false });
  const sides = [["x", 1], ["x", -1], ["z", 1], ["z", -1]].map(([ax, sign]) => {
    const g = new THREE.Group();
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.1, 10), mat);
    sh.position.y = 0.55;
    const hd = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.8, 16), mat);
    hd.position.y = 1.5;
    g.add(sh, hd);
    g.children.forEach((c) => (c.renderOrder = 20));
    g.userData = { ax, sign };
    g.visible = false;
    scene.add(g);
    return g;
  });
  function sideInfo(m) {
    const p = m.geometry.parameters || {};
    if (m.userData.imported || p.loop || p.width === undefined || p.radiusTop !== undefined) return null;
    if (!(m.userData.height > 0.05)) return null;
    const r = m.rotation.y;
    return {
      W: p.width * m.scale.x,
      D: p.depth * m.scale.z,
      p,
      ex: new THREE.Vector3(Math.cos(r), 0, -Math.sin(r)),
      ez: new THREE.Vector3(Math.sin(r), 0, Math.cos(r))
    };
  }
  const dirOf = (a, inf) => (a.userData.ax === "x" ? inf.ex : inf.ez).clone().multiplyScalar(a.userData.sign);
  const scr = (v) => {
    const p = v.clone().project(camera);
    return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
  };

  let drag = null;
  addEventListener(
    "pointerdown",
    (e) => {
      if (e.target !== el || !selected || !sides[0].visible) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      setRay(e);
      const hit = raycaster.intersectObjects(sides, true)[0];
      if (!hit) return;
      let a = hit.object;
      while (a && !a.userData.ax) a = a.parent;
      const m = selected,
        inf = sideInfo(m);
      if (!inf) return;
      const dir = dirOf(a, inf),
        c = m.position.clone();
      const s0 = scr(c),
        s1 = scr(c.clone().add(dir));
      drag = {
        id: e.pointerId,
        m,
        inf,
        a,
        dir,
        x: e.clientX,
        y: e.clientY,
        sx: s1.x - s0.x,
        sy: s1.y - s0.y,
        size0: a.userData.ax === "x" ? inf.W : inf.D,
        from: { sx: m.scale.x, sz: m.scale.z, px: m.position.x, pz: m.position.z }
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
      const d0 = ((e.clientX - drag.x) * drag.sx + (e.clientY - drag.y) * drag.sy) / (drag.sx * drag.sx + drag.sy * drag.sy || 1);
      const size = Math.max(0.5, Math.round((drag.size0 + d0) * 4) / 4),
        d = size - drag.size0,
        m = drag.m,
        f = drag.from;
      if (drag.a.userData.ax === "x") m.scale.x = size / drag.inf.p.width;
      else m.scale.z = size / drag.inf.p.depth;
      m.position.x = f.px + (drag.dir.x * d) / 2;
      m.position.z = f.pz + (drag.dir.z * d) / 2;
      arrow.position.x = m.position.x;
      arrow.position.z = m.position.z;
      showMeasure((drag.a.userData.ax === "x" ? "Width: " : "Depth: ") + fmt(size));
      e.stopImmediatePropagation();
    },
    true
  );
  addEventListener(
    "pointerup",
    (e) => {
      if (drag && e.pointerId === drag.id) {
        const m = drag.m,
          from = drag.from,
          to = { sx: m.scale.x, sz: m.scale.z, px: m.position.x, pz: m.position.z };
        drag = null;
        hideMeasure();
        const set = (s) => {
          m.scale.x = s.sx;
          m.scale.z = s.sz;
          m.position.x = s.px;
          m.position.z = s.pz;
        };
        if (from.sx !== to.sx || from.sz !== to.sz) {
          undoStack.push({ redo: () => set(to), undo: () => set(from) });
          redoStack.length = 0;
          carve(m);
        }
        e.stopImmediatePropagation();
        return;
      }
      // Top arrow released: carve after the app has finished its own handling
      if (typeof mode !== "undefined" && mode === "arrow" && selected) {
        const m = selected;
        setTimeout(() => carve(m), 0);
      }
    },
    true
  );

  (function frame() {
    requestAnimationFrame(frame);
    const m = selected,
      inf = m && m.visible !== false && sideInfo(m);
    sides.forEach((a) => (a.visible = !!inf));
    if (!inf) return;
    sides.forEach((a) => {
      const dir = dirOf(a, inf),
        half = a.userData.ax === "x" ? inf.W / 2 : inf.D / 2;
      a.position.set(m.position.x, m.position.y, m.position.z).addScaledVector(dir, half + 0.05);
      a.quaternion.setFromUnitVectors(UP, dir);
    });
  })();
})();
