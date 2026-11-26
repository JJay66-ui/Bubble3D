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

  function applyOps(ops, msg, extra) {
    const apply = (o, to) => {
      if (o.remove) to === "after" ? removeFromScene(o.A) : addToScene(o.A);
      else restore(o.A, o[to]);
    };
    perform({
      redo() {
        ops.forEach((o) => apply(o, "after"));
        if (extra) extra.redo();
      },
      undo() {
        if (extra) extra.undo();
        ops.forEach((o) => apply(o, "before"));
      }
    });
    toast(msg, true);
  }

  // Overlapping layers merged into clean, non-overlapping ones
  function normalize(pc, layers) {
    const ys = new Set();
    layers.forEach((l) => {
      ys.add(l.y0);
      ys.add(l.y1);
    });
    const Y = [...ys].sort((a, b) => a - b),
      out = [];
    for (let i = 0; i < Y.length - 1; i++) {
      const lo = Y[i],
        hi = Y[i + 1];
      if (hi - lo < 1e-6) continue;
      const mid = (lo + hi) / 2;
      const cov = layers.filter((l) => l.y0 <= mid && mid <= l.y1).map((l) => l.mp);
      if (!cov.length) continue;
      const mp = cov.length === 1 ? cov[0] : pc.union(...cov);
      const key = JSON.stringify(mp),
        p = out[out.length - 1];
      if (p && p.key === key && Math.abs(p.y1 - lo) < 1e-9) p.y1 = hi;
      else out.push({ mp, y0: lo, y1: hi, key });
    }
    return out.map(({ mp, y0, y1 }) => ({ mp, y0, y1 }));
  }

  // Should the shape you pushed in disappear after it carves?
  let removePusher = true;
  const tg = document.createElement("button");
  tg.style.cssText =
    "position:absolute;left:84px;bottom:46px;z-index:6;padding:6px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.14);color:#fff;font-size:12px;background:rgba(255,255,255,.1)";
  const tgLabel = () =>
    (tg.textContent = removePusher
      ? "Cut object: pushed shape disappears (tap to keep it)"
      : "Cut object: pushed shape stays (tap to make it disappear)");
  tg.onclick = () => {
    removePusher = !removePusher;
    tgLabel();
  };
  tgLabel();
  document.body.appendChild(tg);

  // ---------- Entry point: B was just extruded or resized ----------
  const nearOf = (B) => {
    const bb = new THREE.Box3().setFromObject(B).expandByScalar(-0.01);
    return shapes.filter(
      (o) =>
        o !== B &&
        o.visible !== false &&
        o.userData.height > 0.05 &&
        new THREE.Box3().setFromObject(o).intersectsBox(bb)
    );
  };

  // Small pop-up: nothing is deleted unless you tap "Cut object"
  const pop = document.createElement("div");
  pop.style.cssText =
    "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:30;display:none;gap:8px;align-items:center;padding:8px 10px;border-radius:16px;background:rgba(28,31,38,.92);border:1px solid rgba(255,255,255,.18);color:#fff;font:13px -apple-system,sans-serif";
  const popTxt = document.createElement("span");
  const popCut = document.createElement("button");
  popCut.textContent = "Cut object";
  popCut.style.cssText = "padding:6px 14px;border:none;border-radius:12px;background:#d64545;color:#fff;font-size:13px";
  const popX = document.createElement("button");
  popX.textContent = "\u2715";
  popX.style.cssText = "padding:6px 9px;border:none;border-radius:12px;background:rgba(255,255,255,.12);color:#fff;font-size:13px";
  pop.append(popTxt, popCut, popX);
  document.body.appendChild(pop);
  let popB = null;
  const hidePop = () => {
    pop.style.display = "none";
    popB = null;
  };
  popX.onclick = hidePop;
  popCut.onclick = () => {
    const B = popB;
    hidePop();
    if (B && B.parent) doCarve(B);
  };
  addEventListener("pointerdown", (e) => {
    if (popB && !pop.contains(e.target) && !renderer.domElement.contains(e.target)) hidePop();
  });

  window.cadCarve = function (B) {
    if (!B || B.visible === false || B.userData.isLine) return;
    if (!(B.userData.height > 0.05)) return hidePop();
    const near = nearOf(B);
    if (!near.length) return hidePop();
    popB = B;
    popTxt.textContent = "Overlaps " + near.length + " object" + (near.length > 1 ? "s" : "");
    pop.style.display = "flex";
  };

  function doCarve(B) {
    const near = nearOf(B);
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
        // The pushed shape is used up: it disappears, leaving a clean cut (undo brings it back)
        const extra = removePusher
          ? {
              redo() {
                removeFromScene(B);
                hideArrow();
              },
              undo() {
                addToScene(B);
              }
            }
          : null;
        applyOps(
          ops,
          "Carved " +
            ops.map((o) => o.A.userData.name || "object").join(", ") +
            (removePusher ? " and removed the pushed shape" : " to follow the new shape"),
          extra
        );
      })
      .catch((e) => toast("Carve needs the polygon-clipping library (" + (e.message || e) + ")"));
  }

  // Typing a new size or height into the panel carves too
  ["fw", "fd", "fh"].forEach((id) => {
    const el = document.getElementById(id);
    if (el)
      el.addEventListener("change", () => {
        const m = selected;
        if (m) setTimeout(() => window.cadCarve(m), 0);
      });
  });

  // ---------- Push / pull any selected side face ----------
  const el = renderer.domElement;
  const UPV = new THREE.Vector3(0, 1, 0);
  window.cadFaceArrows = true; // tells pushpull.js to hide its box-only side arrows

  const shaftM = new THREE.MeshBasicMaterial({ color: 0xcfd6e3, depthTest: false });
  const farrow = new THREE.Group();
  const fshaft = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.4, 10), shaftM);
  const fout = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 0.9, 16),
    new THREE.MeshBasicMaterial({ color: 0x3ddc84, depthTest: false })
  );
  fout.position.y = 1.65;
  const fin = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 0.9, 16),
    new THREE.MeshBasicMaterial({ color: 0x3ddc84, depthTest: false })
  );
  fin.position.y = -1.65;
  fin.rotation.x = Math.PI;
  farrow.add(fshaft, fout, fin);
  farrow.children.forEach((c) => (c.renderOrder = 21));
  farrow.visible = false;
  scene.add(farrow);

  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  // The wall a vertical face stands on: two ends on the ground plan, plus its height range
  function faceSeg(f, T) {
    const hl = Math.hypot(f.n.x, f.n.z) || 1,
      nx = f.n.x / hl,
      nz = f.n.z / hl,
      tx = -nz,
      tz = nx;
    let tmin = Infinity,
      tmax = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    f.tris.forEach((j) =>
      T.tris[j].v.forEach((v) => {
        const s = (v.x - f.c.x) * tx + (v.z - f.c.z) * tz;
        if (s < tmin) tmin = s;
        if (s > tmax) tmax = s;
        if (v.y < y0) y0 = v.y;
        if (v.y > y1) y1 = v.y;
      })
    );
    return {
      P: [f.c.x + tx * tmin, f.c.z + tz * tmin],
      Q: [f.c.x + tx * tmax, f.c.z + tz * tmax],
      nx,
      nz,
      y0: r4(y0),
      y1: r4(y1)
    };
  }
  function quadRing(s, d) {
    const a = s.P,
      b = s.Q;
    return [a, b, [b[0] + s.nx * d, b[1] + s.nz * d], [a[0] + s.nx * d, a[1] + s.nz * d], a];
  }

  let cur = null,
    fdrag = null,
    prev = null;
  const scr = (v) => {
    const p = v.clone().project(camera);
    return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
  };
  function clearPreview() {
    if (prev) {
      scene.remove(prev);
      prev.geometry.dispose();
      prev = null;
    }
  }
  function refreshFaceArrow() {
    farrow.visible = false;
    cur = null;
    clearPreview();
    const fs = window.cadSelFaces ? window.cadSelFaces() : [];
    if (fs.length !== 1) return;
    const f = fs[0];
    if (!f.planar) {
      hint.textContent = "Curved faces can't be pushed or pulled yet. Tap a flat face.";
      return;
    }
    if (Math.abs(f.n.y) > 0.95) return; // top and bottom use the up/down arrow
    cur = { f, n: new THREE.Vector3(f.n.x, f.n.y, f.n.z).normalize(), c: f.c.clone() };
    farrow.position.copy(cur.c);
    farrow.quaternion.setFromUnitVectors(UPV, cur.n);
    farrow.visible = true;
    hint.textContent = "Drag the green arrow out to add, or the red side in to cut.";
  }
  addEventListener("cadselchange", refreshFaceArrow);

  function showPreview(d) {
    clearPreview();
    if (!cur || Math.abs(d) < 0.01) return;
    // the preview follows the face's real outline (a triangle stays a triangle)
    const T = window.cadTopo(cur.f.mesh),
      n = cur.f.n,
      P = [],
      cnt = new Map(),
      kk = (v) => Math.round(v.x * 1e3) + "," + Math.round(v.y * 1e3) + "," + Math.round(v.z * 1e3),
      ek = (a, b) => (kk(a) < kk(b) ? kk(a) + "|" + kk(b) : kk(b) + "|" + kk(a)),
      push = (v) => P.push(v.x, v.y, v.z),
      off = (v) => v.clone().addScaledVector(n, d);
    cur.f.tris.forEach((j) => {
      const t = T.tris[j];
      t.v.forEach((v) => push(off(v)));
      for (let e = 0; e < 3; e++) {
        const a = t.v[e],
          b = t.v[(e + 1) % 3],
          key = ek(a, b),
          r = cnt.get(key);
        if (r) r.n++;
        else cnt.set(key, { n: 1, a, b });
      }
    });
    cnt.forEach((r) => {
      if (r.n !== 1) return;
      const a2 = off(r.a),
        b2 = off(r.b);
      [r.a, r.b, b2, r.a, b2, a2].forEach(push);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    prev = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        color: 0x3ddc84,
        transparent: true,
        opacity: 0.45,
        depthTest: false,
        side: THREE.DoubleSide
      })
    );
    prev.renderOrder = 19;
    scene.add(prev);
  }

  async function commitFace(f, d) {
    if (Math.abs(d) < 0.05) return;
    const A = f.mesh;
    // Clean path: slide the whole wall, so the object stays one solid at full height
    if (window.cadSlide && window.cadSlide(f, d)) return;
    if (Math.abs(f.n.y) < 0.05) {
      let LA = null;
      try {
        LA = layersOf(A);
      } catch (e) {}
      if (LA) {
        try {
          const pc = await loadPC();
          const s = faceSeg(f, window.cadTopo(A));
          const cutter = [{ mp: [[quadRing(s, d)]], y0: s.y0, y1: s.y1 }];
          const res = d > 0 ? normalize(pc, LA.concat(cutter)) : subtractLayers(pc, LA, cutter);
          if (!res) return toast("Nothing changed");
          applyOps([makeOp(A, res)], d > 0 ? "Pushed the face out" : "Pushed the face in", null);
          return;
        } catch (e) {
          return toast("Push/pull not applied (" + (e.message || e) + ")");
        }
      }
    }
    // Plain boxes (like sheets drawn on a view plane): pushing in shortens the box
    if (d < 0 && A.geometry && A.geometry.type === "BoxGeometry") {
      const P = A.geometry.parameters,
        q = A.getWorldQuaternion(new THREE.Quaternion()).invert(),
        ln = f.n.clone().applyQuaternion(q);
      const ax = ["x", "y", "z"].sort((a, b) => Math.abs(ln[b]) - Math.abs(ln[a]))[0];
      const key = { x: "width", y: "height", z: "depth" }[ax];
      const sc = A.scale[ax] || 1,
        old = P[key],
        nw = old + d / sc;
      if (nw < 0.01 && old < 0.1) {
        // thin sheet: pushing in builds a solid going the other way from this face
        const T = -d,
          oldG2 = A.geometry,
          dims2 = { width: P.width, height: P.height, depth: P.depth };
        dims2[key] = T;
        const g2 = new THREE.BoxGeometry(dims2.width, dims2.height, dims2.depth),
          e0 = A.userData.edges ? A.userData.edges.geometry : null,
          e2 = e0 ? new THREE.EdgesGeometry(g2) : null,
          p0 = A.position.clone(),
          p2 = A.position.clone().addScaledVector(f.n, old / 2 + d / 2);
        perform({
          redo() {
            A.geometry = g2;
            A.position.copy(p2);
            if (e2) A.userData.edges.geometry = e2;
          },
          undo() {
            A.geometry = oldG2;
            A.position.copy(p0);
            if (e0) A.userData.edges.geometry = e0;
          }
        });
        return;
      }
      if (nw < 0.01) return toast("That would push all the way through. Use a smaller distance.");
      const dims = { width: P.width, height: P.height, depth: P.depth };
      dims[key] = nw;
      const oldG = A.geometry,
        newG = new THREE.BoxGeometry(dims.width, dims.height, dims.depth),
        oldE = A.userData.edges ? A.userData.edges.geometry : null,
        newE = oldE ? new THREE.EdgesGeometry(newG) : null,
        oldPos = A.position.clone(),
        newPos = A.position.clone().addScaledVector(f.n, d / 2);
      perform({
        redo() {
          A.geometry = newG;
          A.position.copy(newPos);
          if (newE) A.userData.edges.geometry = newE;
        },
        undo() {
          A.geometry = oldG;
          A.position.copy(oldPos);
          if (oldE) A.userData.edges.geometry = oldE;
        }
      });
      return;
    }
    // Free-form solids: slide the whole face along its normal (the neighbouring walls stretch)
    if (A.userData.imported && A.geometry.attributes && A.geometry.attributes.position) {
      const T = window.cadTopo(A),
        tgt = new Map(),
        kk = (v) => Math.round(v.x * 1e3) + "," + Math.round(v.y * 1e3) + "," + Math.round(v.z * 1e3);
      f.tris.forEach((j) => T.tris[j].v.forEach((v) => tgt.set(kk(v), true)));
      const bb0 = new THREE.Box3().setFromObject(A),
        thick = Math.abs(bb0.getSize(new THREE.Vector3()).dot(new THREE.Vector3(Math.abs(f.n.x), Math.abs(f.n.y), Math.abs(f.n.z))));
      if (d < 0 && thick < 0.1 && window.cadFaceExtrude) return window.cadFaceExtrude(d); // thin sheet: build the other way
      if (d < 0 && -d >= thick - 0.01) return toast("That would push all the way through. Use a smaller distance.");
      const pos = A.geometry.attributes.position,
        before = pos.array.slice(),
        after = pos.array.slice(),
        inv = new THREE.Matrix4().copy(A.matrixWorld).invert(),
        ln = f.n.clone().transformDirection(inv).multiplyScalar(d / (A.scale.x || 1)),
        w = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        w.set(before[3 * i], before[3 * i + 1], before[3 * i + 2]).applyMatrix4(A.matrixWorld);
        if (tgt.has(kk(w))) {
          after[3 * i] += ln.x;
          after[3 * i + 1] += ln.y;
          after[3 * i + 2] += ln.z;
        }
      }
      const e0 = A.userData.edges ? A.userData.edges.geometry : null,
        apply = (arr, edges) => {
          pos.array.set(arr);
          pos.needsUpdate = true;
          A.geometry.computeVertexNormals();
          A.geometry.computeBoundingBox();
          A.geometry.computeBoundingSphere();
          if (A.userData.edges) {
            if (edges) A.userData.edges.geometry = edges;
            else {
              const ng = new THREE.EdgesGeometry(A.geometry, 20);
              A.userData.edges.geometry = ng;
            }
          }
        };
      perform({
        redo() {
          apply(after, null);
        },
        undo() {
          apply(before, e0);
        }
      });
      return;
    }
    // Other flat faces: pulling out adds a new solid on the face
    if (d > 0 && window.cadFaceExtrude) return window.cadFaceExtrude(d);
    toast("Pushing in works on boxes, sheets, sketch shapes and carved shapes. Other shapes can only be pulled out.");
  }

  addEventListener(
    "pointerdown",
    (e) => {
      if (!cur || e.target !== el || (e.pointerType === "mouse" && e.button !== 0)) return;
      setRay(e);
      if (!raycaster.intersectObjects(farrow.children, true)[0]) return;
      const a = scr(cur.c),
        b = scr(cur.c.clone().add(cur.n));
      fdrag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: b.x - a.x, sy: b.y - a.y, d: 0 };
      el.setPointerCapture(e.pointerId);
      e.stopImmediatePropagation();
    },
    true
  );
  addEventListener(
    "pointermove",
    (e) => {
      if (!fdrag || e.pointerId !== fdrag.id) return;
      const len2 = fdrag.sx * fdrag.sx + fdrag.sy * fdrag.sy || 1;
      const d0 = ((e.clientX - fdrag.x) * fdrag.sx + (e.clientY - fdrag.y) * fdrag.sy) / len2;
      fdrag.d = Math.round(d0 * 4) / 4;
      showPreview(fdrag.d);
      showMeasure((fdrag.d >= 0 ? "Push out: " : "Push in: ") + fmt(Math.abs(fdrag.d)));
      e.stopImmediatePropagation();
    },
    true
  );
  const endFace = (commit) => (e) => {
    if (!fdrag || e.pointerId !== fdrag.id) return;
    const d = fdrag.d,
      f = cur && cur.f;
    fdrag = null;
    clearPreview();
    hideMeasure();
    e.stopImmediatePropagation();
    if (commit && f) commitFace(f, d);
  };
  addEventListener("pointerup", endFace(true), true);
  addEventListener("pointercancel", endFace(false), true);

  window.cadCarveInternals = { subtractLayers, area, layersOf, normalize, faceSeg, quadRing };
})();
