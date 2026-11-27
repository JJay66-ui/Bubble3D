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
  // getBoundingBox may return {min,max}, a flat array of 6 numbers, or xmin/xmax-style fields
  const normBox = (b) => {
    if (b === undefined || b === null) throw new Error("getBoundingBox returned nothing");
    const pick = (v) => (Array.isArray(v) || ArrayBuffer.isView(v) ? [v[0], v[1], v[2]] : [v.x, v.y, v.z]);
    if ((Array.isArray(b) || ArrayBuffer.isView(b)) && b.length >= 6 && typeof b[0] === "number")
      return { min: [b[0], b[1], b[2]], max: [b[3], b[4], b[5]] };
    if (b.min && b.max) return { min: pick(b.min), max: pick(b.max) };
    const f = (names) => {
      for (const n of names) if (typeof b[n] === "number") return b[n];
    };
    const mn = ["x", "y", "z"].map((a) => f([a + "min", a + "Min", "min" + a.toUpperCase(), a + "_min"]));
    const mx = ["x", "y", "z"].map((a) => f([a + "max", a + "Max", "max" + a.toUpperCase(), a + "_max"]));
    if (mn.concat(mx).every((v) => typeof v === "number")) return { min: mn, max: mx };
    throw new Error("unknown bounding box format " + JSON.stringify(Array.from ? b : b).slice(0, 120));
  };
  const bbox = (k, s) => normBox(k.getBoundingBox(s));
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
  // Builds a straight-sided solid from a polygon. Tries several OCCT routes and checks the
  // volume of each result, so one wrong guess about the API doesn't stop the feature.
  function prismFromPoints(k, pts, H) {
    const P = pts.map((a) => [a[0], -a[1]]); // app (x, z) -> OCCT (x, y)
    const n = P.length;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const a = P[i],
        b = P[(i + 1) % n];
      area += a[0] * b[1] - b[0] * a[1];
    }
    const want = (Math.abs(area) / 2) * H;
    const has = (name) => typeof k[name] === "function";
    const good = (s) => {
      if (s === undefined || s === null) return false;
      if (!has("getVolume")) return true;
      const v = Math.abs(k.getVolume(s));
      return v > 0 && Math.abs(v - want) / want < 0.02;
    };
    const tries = [
      [
        "lines",
        () => {
          const e = P.map((a, i) => {
            const b = P[(i + 1) % n];
            return k.makeLineEdge(a[0], a[1], 0, b[0], b[1], 0);
          });
          return k.extrude(k.makeFace(k.makeWire(e)), 0, 0, H);
        }
      ],
      [
        "vertices",
        () => {
          const v = P.map((a) => k.makeVertex(a[0], a[1], 0));
          const e = v.map((a, i) => k.makeEdge(a, v[(i + 1) % n]));
          return k.extrude(k.makeFace(k.makeWire(e)), 0, 0, H);
        }
      ],
      [
        "polygon",
        () => k.extrude(k.makeFace(k.makePolygon(P.map((a) => [a[0], a[1], 0]))), 0, 0, H)
      ],
      [
        "triangles",
        () => {
          const idx = THREE.ShapeUtils.triangulateShape(
            P.map((a) => new THREE.Vector2(a[0], a[1])),
            []
          );
          const F = [];
          const tri = (a, b, c) =>
            F.push(k.buildTriFace(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]));
          idx.forEach(([i, j, l]) => {
            const a = P[i],
              b = P[j],
              c = P[l];
            tri([a[0], a[1], 0], [c[0], c[1], 0], [b[0], b[1], 0]);
            tri([a[0], a[1], H], [b[0], b[1], H], [c[0], c[1], H]);
          });
          for (let i = 0; i < n; i++) {
            const a = P[i],
              b = P[(i + 1) % n];
            tri([a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], H]);
            tri([a[0], a[1], 0], [b[0], b[1], H], [a[0], a[1], H]);
          }
          return has("sewAndSolidify") ? k.sewAndSolidify(F, 1e-6) : k.buildSolidFromFaces(F);
        }
      ]
    ];
    const errs = [];
    for (const [name, fn] of tries) {
      try {
        const s = fn();
        if (good(s)) return s;
        errs.push(name + ": wrong volume");
      } catch (e) {
        errs.push(name + ": " + (e.message || e));
      }
    }
    const names = new Set();
    for (let o = k; o && o !== Object.prototype; o = Object.getPrototypeOf(o))
      Object.getOwnPropertyNames(o).forEach((x) => names.add(x));
    const m = [...names].filter((x) => /polygon|wire|face|solid|sew|extrude|prism|edge|vertex/i.test(x));
    console.warn("Sketch solid failed", errs, "points", pts, "methods", m);
    throw new Error("could not build sketch solid [" + errs.join("; ") + "] methods: " + m.join(", "));
  }

  // Is this mesh an upright prism (flat top and bottom, straight walls) sitting on the plate? Returns its outline.
  function prismOfMesh(m) {
    if (!window.cadTopo) return null;
    const T = window.cadTopo(m);
    let lo = Infinity,
      hi = -Infinity;
    T.tris.forEach((t) =>
      t.v.forEach((v) => {
        lo = Math.min(lo, v.y);
        hi = Math.max(hi, v.y);
      })
    );
    const H = hi - lo;
    if (H < 0.05) return null;
    if (Math.abs(lo) > 0.02) throw new Error("the shape needs to sit on the plate first");
    const key = (v) => Math.round(v.x * 1e3) + "," + Math.round(v.z * 1e3);
    const edges = new Map();
    let tops = 0;
    for (const t of T.tris) {
      if (t.face === -2) continue;
      if (t.n.y > 0.999) {
        if (Math.abs(t.v[0].y - hi) > 1e-3 || Math.abs(t.v[1].y - hi) > 1e-3 || Math.abs(t.v[2].y - hi) > 1e-3) return null;
        tops++;
        for (let e = 0; e < 3; e++) {
          const a = t.v[e],
            b = t.v[(e + 1) % 3],
            ka = key(a),
            kb = key(b),
            ek = ka < kb ? ka + "|" + kb : kb + "|" + ka,
            r = edges.get(ek);
          if (r) r.n++;
          else edges.set(ek, { n: 1, a, b, ka, kb });
        }
      } else if (t.n.y < -0.999) {
        if (Math.abs(t.v[0].y - lo) > 1e-3 || Math.abs(t.v[1].y - lo) > 1e-3 || Math.abs(t.v[2].y - lo) > 1e-3) return null;
      } else if (Math.abs(t.n.y) > 0.01) return null;
    }
    if (!tops) return null;
    const next = new Map();
    let count = 0;
    edges.forEach((r) => {
      if (r.n !== 1) return;
      count++;
      if (!next.has(r.ka)) next.set(r.ka, []);
      if (!next.has(r.kb)) next.set(r.kb, []);
      next.get(r.ka).push(r);
      next.get(r.kb).push(r);
    });
    if (count < 3) return null;
    // walk the outline
    const first = [...edges.values()].find((r) => r.n === 1);
    const pts = [[first.a.x, first.a.z]];
    let cur = first.kb,
      prev = first,
      guard = 0;
    while (cur !== first.ka && guard++ < count + 2) {
      const r = next.get(cur).find((q) => q !== prev);
      if (!r) return null;
      const v = r.ka === cur ? r.a : r.b;
      pts.push([v.x, v.z]);
      cur = r.ka === cur ? r.kb : r.ka;
      prev = r;
    }
    if (cur !== first.ka || pts.length < 3 || pts.length !== count) return null; // holes or several outlines: not handled
    return { pts, H };
  }

  // Straight prism along any axis (shapes built on Front/Back/Left/Right views are along X or Z).
  // The shape is turned into a "virtual" frame where its axis is up, built in OCCT, then turned back.
  const AXES = {
    y: { to: (v) => ({ x: v.x, y: v.y, z: v.z }), from: (x, y, z) => [x, y, z] },
    x: { to: (v) => ({ x: v.z, y: v.x, z: v.y }), from: (x, y, z) => [y, z, x] },
    z: { to: (v) => ({ x: v.y, y: v.z, z: v.x }), from: (x, y, z) => [z, x, y] }
  };
  function prismAnyAxis(m, only) {
    const T = window.cadTopo(m);
    for (const ax of only ? [only] : ["y", "x", "z"]) {
      const A = AXES[ax];
      let lo = Infinity,
        hi = -Infinity;
      const V = T.tris.map((t) => t.v.map(A.to));
      V.forEach((tv) => tv.forEach((v) => ((lo = Math.min(lo, v.y)), (hi = Math.max(hi, v.y)))));
      const H = hi - lo;
      if (H < 0.05) continue;
      const key = (v) => Math.round(v.x * 1e3) + "," + Math.round(v.z * 1e3);
      const edges = new Map();
      let tops = 0,
        ok = true;
      T.tris.forEach((t, i) => {
        if (!ok || t.face === -2) return;
        const tv = V[i],
          ny = t.n.clone();
        const n = A.to(ny); // virtual normal
        if (n.y > 0.999) {
          if (tv.some((v) => Math.abs(v.y - hi) > 1e-3)) return (ok = false);
          tops++;
          for (let e = 0; e < 3; e++) {
            const a = tv[e],
              b = tv[(e + 1) % 3],
              ka = key(a),
              kb = key(b),
              ek = ka < kb ? ka + "|" + kb : kb + "|" + ka,
              r = edges.get(ek);
            if (r) r.n++;
            else edges.set(ek, { n: 1, a, b, ka, kb });
          }
        } else if (n.y < -0.999) {
          if (tv.some((v) => Math.abs(v.y - lo) > 1e-3)) ok = false;
        } else if (Math.abs(n.y) > 0.01) ok = false;
      });
      if (!ok || !tops) continue;
      const next = new Map();
      let count = 0;
      edges.forEach((r) => {
        if (r.n !== 1) return;
        count++;
        [r.ka, r.kb].forEach((q) => {
          if (!next.has(q)) next.set(q, []);
          next.get(q).push(r);
        });
      });
      if (count < 3) continue;
      const first = [...edges.values()].find((r) => r.n === 1);
      const pts = [[first.a.x, first.a.z]];
      let cur = first.kb,
        prev = first,
        guard = 0;
      while (cur !== first.ka && guard++ < count + 2) {
        const r = next.get(cur).find((q) => q !== prev);
        if (!r) break;
        const v = r.ka === cur ? r.a : r.b;
        pts.push([v.x, v.z]);
        cur = r.ka === cur ? r.kb : r.ka;
        prev = r;
      }
      if (cur !== first.ka || pts.length !== count) continue;
      return { ax, pts, H, lo };
    }
    return null;
  }
  function bevelPrism(k, m, chs, kind, size) {
    let info = m.userData.occtG && m.userData.occtG.geo === m.geometry ? m.userData.occtG : null;
    if (!info) {
      const pr = prismAnyAxis(m);
      if (!pr) return false;
      info = { ax: pr.ax, lo: pr.lo, H: pr.H, s: prismFromPoints(k, pr.pts, pr.H) };
    }
    const A = AXES[info.ax],
      s = info.s;
    const all = step("list edges", () => k.getSubShapes(s, "edge")).map((e) => {
      const b = step("edge bounds", () => bbox(k, e));
      return {
        e,
        c: new THREE.Vector3(
          (b.min[0] + b.max[0]) / 2,
          (b.min[2] + b.max[2]) / 2 + info.lo,
          -(b.min[1] + b.max[1]) / 2
        )
      };
    });
    const chosen = chs.map((ch) => {
      const q = A.to(ch.c);
      const cv = new THREE.Vector3(q.x, q.y, q.z);
      let best = null,
        bd = 0.25;
      all.forEach((o) => {
        const d = o.c.distanceTo(cv);
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
    const t = step("mesh result", () => k.tessellate(out, 0.05, 0.3));
    const P = new Float32Array(t.indices.length * 3);
    for (let i = 0; i < t.indices.length; i++) {
      const j = t.indices[i] * 3;
      const r = A.from(t.positions[j], t.positions[j + 2] + info.lo, -t.positions[j + 1]);
      P[3 * i] = r[0];
      P[3 * i + 1] = r[1];
      P[3 * i + 2] = r[2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(P, 3));
    g.computeVertexNormals();
    const eg = new THREE.EdgesGeometry(g, 30);
    const b = {
      geo: m.geometry,
      pos: m.position.clone(),
      scl: m.scale.clone(),
      quat: m.quaternion.clone(),
      imp: m.userData.imported,
      h: m.userData.height,
      og: m.userData.occtG,
      eg: m.userData.edges ? m.userData.edges.geometry : null
    };
    const apply = () => {
      m.geometry = g;
      m.position.set(0, 0, 0);
      m.scale.set(1, 1, 1);
      m.quaternion.set(0, 0, 0, 1);
      m.userData.imported = true;
      m.userData.height = 0;
      m.userData.loopPts = null;
      m.userData.occt = null;
      m.userData.occtG = { geo: g, s: out, ax: info.ax, lo: info.lo, H: info.H };
      m.material.side = THREE.DoubleSide;
      if (m.userData.edges) m.userData.edges.geometry = eg;
      m.updateMatrixWorld(true);
    };
    const revert = () => {
      m.geometry = b.geo;
      m.position.copy(b.pos);
      m.scale.copy(b.scl);
      m.quaternion.copy(b.quat);
      m.userData.imported = b.imp;
      m.userData.height = b.h;
      m.userData.occtG = b.og;
      if (m.userData.edges && b.eg) m.userData.edges.geometry = b.eg;
      m.updateMatrixWorld(true);
    };
    apply();
    undoStack.push({ redo: apply, undo: revert });
    redoStack.length = 0;
    cadToast("OCCT " + kind + " applied to " + edges.length + " edge(s)", true);
    return true;
  }

  // Round hole along the app X or Z axis (side faces) through straight prisms and boxes.
  // center = app point on the hole axis, r = hole radius, a0..a1 = range along the axis.
  window.cadSideHole = function (hosts, axis, center, r, a0, a1, msg) {
    const k = K();
    window.cadSideHoleWhy = "";
    if (!k) {
      window.cadSideHoleWhy = "the shape engine isn't loaded yet";
      return 0;
    }
    const A = AXES[axis];
    const q = A.to(center);
    const ring = [];
    for (let i = 0; i < 48; i++) {
      const t = (i / 48) * TWO_PI;
      ring.push([q.x + Math.cos(t) * r, q.z + Math.sin(t) * r]);
    }
    let done = 0;
    hosts.forEach((m) => {
      try {
        const pr = prismAnyAxis(m, axis);
        if (!pr) {
          window.cadSideHoleWhy = (m.userData.name || "object") + " isn't a straight prism in that direction";
          return;
        }
        const lo = Math.max(pr.lo, a0),
          hi = Math.min(pr.lo + pr.H, a1);
        if (hi - lo < 0.01) {
          window.cadSideHoleWhy = "the screw doesn't reach into " + (m.userData.name || "the object") + " (it spans " + pr.lo.toFixed(2) + " to " + (pr.lo + pr.H).toFixed(2) + ", screw " + a0.toFixed(2) + " to " + a1.toFixed(2) + ")";
          return;
        }
        const host = step("host solid", () => prismFromPoints(k, pr.pts, pr.H));
        let tool = step("hole solid", () => prismFromPoints(k, ring, hi - lo));
        tool = step("hole place", () => k.translate(tool, 0, 0, lo - pr.lo));
        const out = step("cut", () => k.cut(host, tool));
        const t = step("mesh result", () => k.tessellate(out, 0.05, 0.3));
        const P = new Float32Array(t.indices.length * 3);
        for (let i = 0; i < t.indices.length; i++) {
          const j = t.indices[i] * 3;
          const rr = A.from(t.positions[j], t.positions[j + 2] + pr.lo, -t.positions[j + 1]);
          P[3 * i] = rr[0];
          P[3 * i + 1] = rr[1];
          P[3 * i + 2] = rr[2];
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(P, 3));
        g.computeVertexNormals();
        const eg = new THREE.EdgesGeometry(g, 30);
        const b = {
          geo: m.geometry,
          pos: m.position.clone(),
          scl: m.scale.clone(),
          quat: m.quaternion.clone(),
          imp: m.userData.imported,
          h: m.userData.height,
          og: m.userData.occtG,
          eg: m.userData.edges ? m.userData.edges.geometry : null
        };
        const apply = () => {
          m.geometry = g;
          m.position.set(0, 0, 0);
          m.scale.set(1, 1, 1);
          m.quaternion.set(0, 0, 0, 1);
          m.userData.imported = true;
          m.userData.height = 0;
          m.userData.loopPts = null;
          m.userData.occt = null;
          m.userData.occtG = { geo: g, s: out, ax: axis, lo: pr.lo, H: pr.H };
          m.material.side = THREE.DoubleSide;
          if (m.userData.edges) m.userData.edges.geometry = eg;
          m.updateMatrixWorld(true);
        };
        const revert = () => {
          m.geometry = b.geo;
          m.position.copy(b.pos);
          m.scale.copy(b.scl);
          m.quaternion.copy(b.quat);
          m.userData.imported = b.imp;
          m.userData.height = b.h;
          m.userData.occtG = b.og;
          if (m.userData.edges && b.eg) m.userData.edges.geometry = b.eg;
          m.updateMatrixWorld(true);
        };
        apply();
        undoStack.push({ redo: apply, undo: revert });
        redoStack.length = 0;
        done++;
      } catch (e) {
        window.cadSideHoleWhy = e.message || String(e);
        console.warn("side hole failed", e);
      }
    });
    if (done) cadToast(msg || "Hole cut", true);
    return done;
  };

  // Closed triangle mesh -> kernel solid (for shapes that aren't a simple prism)
  function meshSolid(k, m) {
    const T = window.cadTopo(m);
    const F = [];
    const tmp1 = new THREE.Vector3(),
      tmp2 = new THREE.Vector3();
    let hi = -Infinity,
      lo = Infinity;
    T.tris.forEach((t) => {
      if (t.face === -2) return;
      let [a, b, c] = t.v;
      tmp1.subVectors(b, a);
      tmp2.subVectors(c, a);
      if (tmp1.cross(tmp2).dot(t.n) < 0) [b, c] = [c, b];
      [a, b, c].forEach((p) => ((hi = Math.max(hi, p.y)), (lo = Math.min(lo, p.y))));
      const A = [a.x, -a.z, a.y],
        B = [b.x, -b.z, b.y],
        C = [c.x, -c.z, c.y];
      F.push(k.buildTriFace(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]));
    });
    const sew = typeof k.sewAndSolidify === "function" ? k.sewAndSolidify(F, 1e-5) : k.buildSolidFromFaces(F);
    if (!sew) throw new Error("couldn't rebuild the solid from the mesh");
    if (k.getVolume && Math.abs(k.getVolume(sew)) < 1e-6) throw new Error("rebuilt solid is empty");
    return { s: sew, H: hi - lo };
  }

  // Round hole in ANY direction (with optional thread grooves) through upright prisms and boxes.
  // center = where the screw touches the surface, dirIn = unit vector pointing into the object,
  // r = core radius, depth = hole length, grooves = [{s0, s1, r}] distances along dirIn.
  window.cadAxisHole = function (hosts, center, dirIn, r, depth, grooves, msg) {
    const k = K();
    window.cadAxisHoleWhy = "";
    if (!k) {
      window.cadAxisHoleWhy = "the shape engine isn't loaded yet";
      return 0;
    }
    const d = dirIn.clone().normalize();
    const ref = Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(d, ref).normalize();
    const v = new THREE.Vector3().crossVectors(d, u).normalize();
    let done = 0;
    hosts.forEach((m) => {
      try {
        let pr = prismAnyAxis(m, "y"),
          host;
        if (pr) host = step("host solid", () => prismFromPoints(k, pr.pts, pr.H));
        else {
          // shapes that already have holes or odd outlines: rebuild the solid from the mesh itself
          const ms = step("solid from mesh", () => meshSolid(k, m));
          host = ms.s;
          pr = { lo: 0, H: ms.H };
        }
        const O = (p) => [p.x, -p.z, p.y - pr.lo]; // app point -> kernel point (base of the prism at 0)
        const cyl = (rad, s0, s1) =>
          step("hole solid", () => {
            if (Math.abs(d.y) > 0.999) {
              // straight up/down: build it exactly like the other prisms (tries several kernel routes)
              const ring = [];
              for (let i = 0; i < 36; i++) {
                const a = (i / 36) * TWO_PI;
                ring.push([center.x + Math.cos(a) * rad, center.z + Math.sin(a) * rad]);
              }
              const yA = center.y + d.y * s0,
                yB = center.y + d.y * s1,
                yLo = Math.min(yA, yB),
                len = Math.abs(yB - yA);
              const pr0 = prismFromPoints(k, ring, len);
              return k.translate(pr0, 0, 0, yLo - pr.lo);
            }
            // any direction: build the cylinder from triangles (works in any orientation)
            const N = 32,
              len = s1 - s0,
              c0 = center.clone().addScaledVector(d, s0),
              c1 = c0.clone().addScaledVector(d, len);
            const B = [],
              T = [];
            for (let i = 0; i < N; i++) {
              const a = (i / N) * TWO_PI,
                off = u.clone().multiplyScalar(Math.cos(a) * rad).addScaledVector(v, Math.sin(a) * rad);
              B.push(O(c0.clone().add(off)));
              T.push(O(c1.clone().add(off)));
            }
            const C0 = O(c0),
              C1 = O(c1);
            const want = 0.5 * N * rad * rad * Math.sin(TWO_PI / N) * len;
            const make = (flip) => {
              const F = [];
              const tri = (p, q, r2) =>
                flip
                  ? F.push(k.buildTriFace(p[0], p[1], p[2], r2[0], r2[1], r2[2], q[0], q[1], q[2]))
                  : F.push(k.buildTriFace(p[0], p[1], p[2], q[0], q[1], q[2], r2[0], r2[1], r2[2]));
              for (let i = 0; i < N; i++) {
                const j = (i + 1) % N;
                tri(C0, B[j], B[i]);
                tri(C1, T[i], T[j]);
                tri(B[i], B[j], T[j]);
                tri(B[i], T[j], T[i]);
              }
              return typeof k.sewAndSolidify === "function" ? k.sewAndSolidify(F, 1e-6) : k.buildSolidFromFaces(F);
            };
            let sol = null,
              why = "";
            for (const flip of [false, true]) {
              try {
                const c = make(flip);
                if (!c) continue;
                const sv = k.getVolume ? k.getVolume(c) : want;
                const vol = Math.abs(sv);
                if (sv > 0 && Math.abs(vol - want) / want < 0.05) {
                  sol = c;
                  break;
                }
                why = "cutter volume " + vol.toFixed(4) + " vs " + want.toFixed(4);
              } catch (e) {
                why = e.message || String(e);
              }
            }
            if (!sol) throw new Error("cutter solid failed (" + why + ")");
            return sol;
          });
        let out = step("cut core", () => k.cut(host, cyl(r, -0.03, depth)));
        const vol0 = k.getVolume ? Math.abs(k.getVolume(host)) : 1,
          vol1 = k.getVolume ? Math.abs(k.getVolume(out)) : 0;
        if (k.getVolume && Math.abs(vol0 - vol1) < 1e-5) {
          window.cadAxisHoleWhy = "the screw doesn't reach into " + (m.userData.name || "the object");
          return;
        }
        (grooves || []).forEach((g) => {
          out = step("cut thread", () => k.cut(out, cyl(g.r, g.s0, g.s1)));
        });
        const t = step("mesh result", () => k.tessellate(out, 0.05, 0.3));
        const P = new Float32Array(t.indices.length * 3);
        for (let i = 0; i < t.indices.length; i++) {
          const j = t.indices[i] * 3;
          P[3 * i] = t.positions[j];
          P[3 * i + 1] = t.positions[j + 2] + pr.lo;
          P[3 * i + 2] = -t.positions[j + 1];
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(P, 3));
        g.computeVertexNormals();
        const eg = new THREE.EdgesGeometry(g, 30);
        const b = {
          geo: m.geometry,
          pos: m.position.clone(),
          scl: m.scale.clone(),
          quat: m.quaternion.clone(),
          imp: m.userData.imported,
          h: m.userData.height,
          og: m.userData.occtG,
          eg: m.userData.edges ? m.userData.edges.geometry : null
        };
        const apply = () => {
          m.geometry = g;
          m.position.set(0, 0, 0);
          m.scale.set(1, 1, 1);
          m.quaternion.set(0, 0, 0, 1);
          m.userData.imported = true;
          m.userData.height = 0;
          m.userData.loopPts = null;
          m.userData.occt = null;
          m.userData.occtG = { geo: g, s: out, ax: "y", lo: pr.lo, H: pr.H };
          m.material.side = THREE.DoubleSide;
          if (m.userData.edges) m.userData.edges.geometry = eg;
          m.updateMatrixWorld(true);
        };
        const revert = () => {
          m.geometry = b.geo;
          m.position.copy(b.pos);
          m.scale.copy(b.scl);
          m.quaternion.copy(b.quat);
          m.userData.imported = b.imp;
          m.userData.height = b.h;
          m.userData.occtG = b.og;
          if (m.userData.edges && b.eg) m.userData.edges.geometry = b.eg;
          m.updateMatrixWorld(true);
        };
        apply();
        undoStack.push({ redo: apply, undo: revert });
        redoStack.length = 0;
        done++;
      } catch (e) {
        window.cadAxisHoleWhy = e.message || String(e);
        console.warn("axis hole failed", e);
      }
    });
    if (done) cadToast(msg || "Hole cut", true);
    return done;
  };

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
    if (m.userData.imported && !m.userData.loopPts) {
      // Shapes made by sliding faces / sheets: if it is a straight upright prism, rebuild it in OCCT
      const pr = prismOfMesh(m);
      if (pr) return { s: prismFromPoints(k, pr.pts, pr.H), H: pr.H };
      throw new Error(
        "this shape isn't a straight upright solid on the plate (flat top, straight walls), so OCCT can't rebuild it. Shapes built on a side view or with slanted faces aren't supported yet"
      );
    }
    if (m.userData.height < 0.05) throw new Error("this shape is still flat. Extrude it up first (drag its arrow or use Extrude out), then chamfer or fillet");
    if (Math.abs(m.rotation.y) > 1e-6) throw new Error("rotated shapes aren't supported yet");
    if (m.userData.loopPts) {
      // Sketch shape (triangle, polygon...): rebuild it in OCCT from its corner points
      const sx = m.scale.x,
        sz = m.scale.z,
        ox = m.position.x,
        oz = m.position.z;
      const pts = m.userData.loopPts.map((q) => [q.x * sx + ox, q.z * sz + oz]);
      return { s: prismFromPoints(k, pts, H), H };
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
    if (m.userData.imported && !m.userData.loopPts && !(m.userData.occt && m.position.x === 0 && m.position.z === 0)) {
      if (bevelPrism(k, m, chs, kind, size)) return;
    }
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
    if (window.cadCarve) return window.cadCarve(tool); // carve.js does this without OCCT
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
      inf = m && m.visible !== false && !window.cadFaceArrows && sideInfo(m);
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
