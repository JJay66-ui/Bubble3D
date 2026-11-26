// Carving: when you extrude or resize one shape into another, the other shape loses the
// part that overlaps and follows the first shape's outline. Works on boxes, cylinders and
// sketch shapes, and on shapes that were already carved. No OCCT needed.
// Load after pushpull.js.
(function () {
  const toast = (t, ok) => (window.cadToast ? cadToast(t, ok) : (hint.textContent = t));

  // ---------- 2D boolean library (loaded on demand) ----------
  let pcPromise = null;
  function loadPC() {
    if (window.polygonClipping) return Promise.resolve(window.polygonClipping);
    if (pcPromise) return pcPromise;
    const urls = [
      "https://cdn.jsdelivr.net/npm/polygon-clipping@0.15.7/dist/polygon-clipping.umd.min.js",
      "https://cdn.jsdelivr.net/npm/polygon-clipping@0.15.7/dist/polygon-clipping.umd.js",
      "https://unpkg.com/polygon-clipping@0.15.7/dist/polygon-clipping.umd.min.js"
    ];
    pcPromise = (async () => {
      for (const u of urls) {
        try {
          await new Promise((res, rej) => {
            const s = document.createElement("script");
            s.src = u;
            s.onload = res;
            s.onerror = rej;
            document.head.appendChild(s);
          });
          if (window.polygonClipping) return window.polygonClipping;
        } catch (e) {}
      }
      pcPromise = null;
      throw new Error("could not download polygon-clipping");
    })();
    return pcPromise;
  }
  loadPC().catch(() => {});

  // ---------- Shapes as stacks of extruded outlines ----------
  // A layer is { mp, y0, y1 }: a MultiPolygon outline (world x/z) lifted from y0 to y1.
  function ringOf(m, local) {
    m.updateMatrixWorld(true);
    return local.map(([x, z]) => {
      const v = new THREE.Vector3(x, 0, z).applyMatrix4(m.matrixWorld);
      return [v.x, v.z];
    });
  }
  function layersOf(m) {
    const u = m.userData,
      p = m.geometry.parameters || {},
      h = u.height;
    if (!(h > 0.05)) throw new Error("it needs an upward height first");
    if (u.layers) {
      const r = h / u.layersH;
      return u.layers.map((L) => ({
        mp: L.polys.map((poly) => poly.map((ring) => ringOf(m, ring))),
        y0: L.y0 * r,
        y1: L.y1 * r
      }));
    }
    if (u.bevel > 0) throw new Error("beveled shapes aren't supported yet");
    let ring;
    if (u.loopPts) ring = ringOf(m, u.loopPts.map((q) => [q.x, q.z]));
    else if (p.width !== undefined && !p.loop) {
      const hw = p.width / 2,
        hd = p.depth / 2;
      ring = ringOf(m, [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]);
    } else if (p.radiusTop !== undefined) {
      if (p.thetaLength !== undefined && Math.abs(p.thetaLength - Math.PI * 2) > 1e-6)
        throw new Error("half cylinders aren't supported yet");
      const n = p.radialSegments || 48,
        pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push([Math.sin(a) * p.radiusTop, Math.cos(a) * p.radiusTop]);
      }
      ring = ringOf(m, pts);
    } else throw new Error("STL imports and older cut results aren't supported");
    return [{ mp: [[ring]], y0: 0, y1: h }];
  }

  function ringArea(r) {
    let a = 0;
    for (let i = 0; i < r.length; i++) {
      const p = r[i],
        q = r[(i + 1) % r.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2;
  }
  function area(mp) {
    let t = 0;
    mp.forEach((poly) =>
      poly.forEach((ring, i) => {
        t += i === 0 ? ringArea(ring) : -ringArea(ring);
      })
    );
    return t;
  }

  // A minus B, layer by layer. Returns the new layers, or null if nothing overlaps.
  function subtractLayers(pc, LA, LB) {
    const out = [];
    let changed = false;
    LA.forEach((a) => {
      const ys = new Set([a.y0, a.y1]);
      LB.forEach((b) => {
        if (b.y0 > a.y0 && b.y0 < a.y1) ys.add(b.y0);
        if (b.y1 > a.y0 && b.y1 < a.y1) ys.add(b.y1);
      });
      const Y = [...ys].sort((x, y) => x - y);
      for (let i = 0; i < Y.length - 1; i++) {
        const lo = Y[i],
          hi = Y[i + 1];
        if (hi - lo < 1e-6) continue;
        const mid = (lo + hi) / 2;
        const cov = LB.filter((b) => b.y0 <= mid && mid <= b.y1).map((b) => b.mp);
        let mp = a.mp;
        if (cov.length) {
          const cut = cov.length === 1 ? cov[0] : pc.union(...cov);
          const diff = pc.difference(a.mp, cut);
          if (area(a.mp) - area(diff) > 1e-4) {
            mp = diff;
            changed = true;
          }
        }
        if (mp.length) out.push({ mp, y0: lo, y1: hi });
      }
    });
    if (!changed) return null;
    const merged = [];
    out.forEach((l) => {
      const p = merged[merged.length - 1];
      if (p && p.mp === l.mp && Math.abs(p.y1 - l.y0) < 1e-9) p.y1 = l.y1;
      else merged.push({ mp: l.mp, y0: l.y0, y1: l.y1 });
    });
    return merged;
  }

  // ---------- Layers back into a mesh ----------
  function buildGeometry(layers, H) {
    const chunks = [];
    layers.forEach((L) =>
      L.mp.forEach((poly) => {
        const rings = poly.map((r) => {
          const a = r.slice(),
            f = a[0],
            l = a[a.length - 1];
          if (a.length > 1 && f[0] === l[0] && f[1] === l[1]) a.pop();
          return a;
        });
        if (rings[0].length < 3) return;
        const v2 = (r) => r.map((p) => new THREE.Vector2(p[0], -p[1]));
        const shape = new THREE.Shape(v2(rings[0]));
        rings.slice(1).forEach((h) => {
          if (h.length >= 3) shape.holes.push(new THREE.Path(v2(h)));
        });
        const g = new THREE.ExtrudeGeometry(shape, { depth: L.y1 - L.y0, bevelEnabled: false });
        g.rotateX(-Math.PI / 2);
        g.translate(0, L.y0, 0);
        chunks.push(g.attributes.position.array.slice());
        g.dispose();
      })
    );
    let len = 0;
    chunks.forEach((c) => (len += c.length));
    const arr = new Float32Array(len);
    let o = 0;
    chunks.forEach((c) => {
      arr.set(c, o);
      o += c.length;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    g.scale(1, 1 / H, 1);
    g.translate(0, -0.5, 0);
    g.computeVertexNormals();
    return g;
  }
  const snapshot = (A) => ({
    geo: A.geometry,
    edges: A.userData.edges,
    imported: A.userData.imported,
    occt: A.userData.occt,
    layers: A.userData.layers,
    layersH: A.userData.layersH,
    loopPts: A.userData.loopPts,
    px: A.position.x,
    pz: A.position.z,
    sx: A.scale.x,
    sz: A.scale.z,
    ry: A.rotation.y,
    height: A.userData.height
  });
  function restore(A, s) {
    A.geometry = s.geo;
    if (A.userData.edges !== s.edges) {
      if (A.userData.edges) A.remove(A.userData.edges);
      A.userData.edges = s.edges;
      if (s.edges) A.add(s.edges);
    }
    A.userData.imported = s.imported;
    A.userData.occt = s.occt;
    A.userData.layers = s.layers;
    A.userData.layersH = s.layersH;
    A.userData.loopPts = s.loopPts;
    A.position.x = s.px;
    A.position.z = s.pz;
    A.scale.x = s.sx;
    A.scale.z = s.sz;
    A.rotation.y = s.ry;
    setHeight(A, s.height);
  }
  function makeOp(A, layers) {
    if (!layers.length) return { A, remove: true };
    const H = Math.max(...layers.map((l) => l.y1));
    const g = buildGeometry(layers, H);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(g, 20),
      new THREE.LineBasicMaterial({ color: 0xffffff })
    );
    return {
      A,
      before: snapshot(A),
      after: {
        geo: g,
        edges,
        imported: true,
        occt: undefined,
        layers: layers.map((l) => ({ y0: l.y0, y1: l.y1, polys: l.mp })),
        layersH: H,
        loopPts: undefined,
        px: 0,
        pz: 0,
        sx: 1,
        sz: 1,
        ry: 0,
        height: H
      }
    };
  }

  // ---------- Entry point: B was just extruded or resized ----------
  window.cadCarve = function (B) {
    if (!B || B.visible === false || B.userData.isLine) return;
    if (!(B.userData.height > 0.05)) return;
    const bb = new THREE.Box3().setFromObject(B).expandByScalar(-0.01);
    const near = shapes.filter(
      (o) =>
        o !== B &&
        o.visible !== false &&
        o.userData.height > 0.05 &&
        new THREE.Box3().setFromObject(o).intersectsBox(bb)
    );
    if (!near.length) return;
    loadPC()
      .then((pc) => {
        let LB;
        try {
          LB = layersOf(B);
        } catch (e) {
          return toast("Carve not applied (" + (e.message || e) + ")");
        }
        const ops = [];
        near.forEach((A) => {
          try {
            const res = subtractLayers(pc, layersOf(A), LB);
            if (res) ops.push(makeOp(A, res));
          } catch (e) {
            toast("Couldn't carve " + (A.userData.name || "an object") + " (" + (e.message || e) + ")");
          }
        });
        if (!ops.length) return;
        const apply = (o, to) => {
          if (o.remove) to === "after" ? removeFromScene(o.A) : addToScene(o.A);
          else restore(o.A, o[to]);
        };
        perform({
          redo() {
            ops.forEach((o) => apply(o, "after"));
          },
          undo() {
            ops.forEach((o) => apply(o, "before"));
          }
        });
        toast(
          "Carved " + ops.map((o) => o.A.userData.name || "object").join(", ") + " to follow the new shape",
          true
        );
      })
      .catch((e) => toast("Carve needs the polygon-clipping library (" + (e.message || e) + ")"));
  };

  // Typing a new size or height into the panel carves too
  ["fw", "fd", "fh"].forEach((id) => {
    const el = document.getElementById(id);
    if (el)
      el.addEventListener("change", () => {
        const m = selected;
        if (m) setTimeout(() => window.cadCarve(m), 0);
      });
  });

  window.cadCarveInternals = { subtractLayers, area, layersOf };
})();
