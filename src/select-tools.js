// Mouse/pen camera, box select, face + edge picking, per-edge fillet/chamfer, face extrude.
// Loads after app.js, occt-ops.js and touch-lines.js.
(function () {
  const host = document.getElementById("view");
  const el = renderer.domElement;
  const COS_FACE = Math.cos((9 * Math.PI) / 180);
  const COS_FEAT = Math.cos((20 * Math.PI) / 180);
  let selMode = "auto";
  let selFaces = [],
    selEdges = [],
    selObjs = [];
  const hl = new THREE.Group();
  scene.add(hl);
  const say = (t) => {
    hint.textContent = t;
    if (window.cadToast && /fail|not ready|Enter a|Only flat|missing/i.test(t)) cadToast(t);
  };
  const vis = () => shapes.filter((s) => s.visible !== false);
  const toggle = (a, x) => {
    const i = a.indexOf(x);
    i < 0 ? a.push(x) : a.splice(i, 1);
  };

  // ---------- Faces and edges of a mesh, in world space ----------
  const cache = new WeakMap();
  const q = (v) =>
    Math.round(v.x * 1e3) + "," + Math.round(v.y * 1e3) + "," + Math.round(v.z * 1e3);
  const ekey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
  function topo(m) {
    m.updateMatrixWorld(true);
    const key = m.geometry.uuid + "|" + m.matrixWorld.elements.join();
    const c = cache.get(m);
    if (c && c.key === key) return c;
    const pos = m.geometry.attributes.position,
      idx = m.geometry.index;
    const n = (idx ? idx.count : pos.count) / 3;
    const vert = (i) =>
      new THREE.Vector3()
        .fromBufferAttribute(pos, idx ? idx.getX(i) : i)
        .applyMatrix4(m.matrixWorld);
    const tris = [],
      emap = new Map(),
      pt = new Map();
    for (let t = 0; t < n; t++) {
      const v = [vert(3 * t), vert(3 * t + 1), vert(3 * t + 2)];
      const k = v.map(q);
      k.forEach((kk, i) => pt.set(kk, v[i]));
      const nr = new THREE.Vector3()
        .subVectors(v[1], v[0])
        .cross(new THREE.Vector3().subVectors(v[2], v[0]));
      const area = nr.length() / 2;
      tris.push({ v, k, n: nr.normalize(), area, face: area < 1e-9 ? -2 : -1 });
      if (area < 1e-9) continue;
      for (let e = 0; e < 3; e++) {
        const a = k[e],
          b = k[(e + 1) % 3];
        if (a === b) continue;
        const ek = ekey(a, b);
        if (!emap.has(ek)) emap.set(ek, []);
        emap.get(ek).push(t);
      }
    }
    // Make every normal point outward, whichever way the mesh was wound
    let vol = 0;
    tris.forEach((t) => (vol += t.v[0].dot(new THREE.Vector3().crossVectors(t.v[1], t.v[2]))));
    if (vol < 0) tris.forEach((t) => t.n.negate());
    // Faces: flood-fill across shared edges while the surface stays flat-ish
    const faces = [];
    tris.forEach((t0, s) => {
      if (t0.face !== -1) return;
      const id = faces.length,
        list = [s],
        stack = [s];
      t0.face = id;
      while (stack.length) {
        const t = tris[stack.pop()];
        for (let e = 0; e < 3; e++) {
          (emap.get(ekey(t.k[e], t.k[(e + 1) % 3])) || []).forEach((j) => {
            const u = tris[j];
            if (u.face === -1 && u.n.dot(t.n) > COS_FACE) {
              u.face = id;
              list.push(j);
              stack.push(j);
            }
          });
        }
      }
      const c = new THREE.Vector3(),
        nm = new THREE.Vector3();
      let A = 0;
      list.forEach((j) => {
        const u = tris[j];
        c.addScaledVector(
          u.v[0].clone().add(u.v[1]).add(u.v[2]).divideScalar(3),
          u.area
        );
        nm.addScaledVector(u.n, u.area);
        A += u.area;
      });
      c.divideScalar(A);
      nm.normalize();
      faces.push({
        mesh: m,
        tris: list,
        c,
        n: nm,
        planar: list.every((j) => tris[j].n.dot(nm) > 0.9994)
      });
    });
    // Merge flat faces that touch at a corner and lie in the same plane (thin sliver triangles can
    // otherwise cut one flat face into pieces)
    {
      const par = faces.map((_, i) => i);
      const find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
      const dOf = (f) => f.n.dot(f.c);
      const byV = new Map();
      faces.forEach((f, i) =>
        f.tris.forEach((j) =>
          tris[j].k.forEach((kk) => {
            if (!byV.has(kk)) byV.set(kk, new Set());
            byV.get(kk).add(i);
          })
        )
      );
      byV.forEach((set) => {
        const ids = [...set];
        for (let a = 1; a < ids.length; a++) {
          const f0 = faces[ids[0]],
            f1 = faces[ids[a]];
          if (f0.n.dot(f1.n) > COS_FACE && Math.abs(dOf(f0) - dOf(f1)) < 1e-3)
            par[find(ids[a])] = find(ids[0]);
        }
      });
      const groups = new Map();
      faces.forEach((f, i) => {
        const r = find(i);
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r).push(f);
      });
      if (groups.size < faces.length) {
        const merged = [];
        groups.forEach((fs) => {
          if (fs.length === 1) return merged.push(fs[0]);
          const list = fs.flatMap((f) => f.tris),
            c = new THREE.Vector3(),
            nm = new THREE.Vector3();
          let A = 0;
          list.forEach((j) => {
            const u = tris[j];
            c.addScaledVector(u.v[0].clone().add(u.v[1]).add(u.v[2]).divideScalar(3), u.area);
            nm.addScaledVector(u.n, u.area);
            A += u.area;
          });
          c.divideScalar(A);
          nm.normalize();
          merged.push({
            mesh: m,
            tris: list,
            c,
            n: nm,
            planar: list.every((j) => tris[j].n.dot(nm) > 0.9994)
          });
        });
        faces.length = 0;
        merged.forEach((f, i) => {
          faces.push(f);
          f.tris.forEach((j) => (tris[j].face = i));
        });
      }
    }
    // Sharp edges, chained into whole edges (a circle is one edge)
    const segs = [];
    emap.forEach((ts, ek) => {
      if (
        ts.length === 1 ||
        (ts.length === 2 && tris[ts[0]].n.dot(tris[ts[1]].n) < COS_FEAT)
      )
        segs.push(ek.split("|"));
    });
    const vs = new Map();
    segs.forEach((s, i) =>
      s.forEach((k) => {
        if (!vs.has(k)) vs.set(k, []);
        vs.get(k).push(i);
      })
    );
    const dir = (a, b) => pt.get(b).clone().sub(pt.get(a)).normalize();
    const used = new Set(),
      chains = [];
    segs.forEach((s0, i0) => {
      if (used.has(i0)) return;
      used.add(i0);
      const keys = [s0[0], s0[1]];
      [1, 0].forEach((side) => {
        for (;;) {
          const end = side ? keys[keys.length - 1] : keys[0];
          const prev = side ? keys[keys.length - 2] : keys[1];
          let best = -1,
            bd = 0.9;
          (vs.get(end) || []).forEach((j) => {
            if (used.has(j)) return;
            const o = segs[j][0] === end ? segs[j][1] : segs[j][0];
            const d = dir(prev, end).dot(dir(end, o));
            if (d > bd) {
              bd = d;
              best = j;
            }
          });
          if (best < 0) break;
          used.add(best);
          const o = segs[best][0] === end ? segs[best][1] : segs[best][0];
          side ? keys.push(o) : keys.unshift(o);
        }
      });
      const pts = keys.map((k) => pt.get(k));
      const bb = new THREE.Box3().setFromPoints(pts);
      chains.push({ mesh: m, pts, bb, c: bb.getCenter(new THREE.Vector3()) });
    });
    const out = { key, tris, faces, chains, emap };
    cache.set(m, out);
    return out;
  }

  // ---------- Picking ----------
  function px(v) {
    const p = v.clone().project(camera);
    return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight, z: p.z };
  }
  function pickFace(e) {
    setRay(e);
    const h = raycaster.intersectObjects(vis(), false)[0];
    if (!h) return null;
    const T = topo(h.object);
    return T.faces[T.tris[h.faceIndex].face] || null;
  }
  function pickEdge(e, tol) {
    let best = null,
      bd = tol;
    vis().forEach((m) =>
      topo(m).chains.forEach((ch) => {
        for (let i = 0; i < ch.pts.length - 1; i++) {
          const a = px(ch.pts[i]),
            b = px(ch.pts[i + 1]);
          if (a.z > 1 || b.z > 1) continue;
          const dx = b.x - a.x,
            dy = b.y - a.y;
          let t =
            ((e.clientX - a.x) * dx + (e.clientY - a.y) * dy) / (dx * dx + dy * dy || 1);
          t = Math.max(0, Math.min(1, t));
          const d = Math.hypot(e.clientX - (a.x + t * dx), e.clientY - (a.y + t * dy));
          if (d < bd) {
            bd = d;
            best = ch;
          }
        }
      })
    );
    return best;
  }
  function marquee(r) {
    const inR = (p) => p.z <= 1 && p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
    vis().forEach((m) => {
      const T = topo(m);
      T.faces.forEach((f) => {
        if (inR(px(f.c)) && !selFaces.includes(f)) selFaces.push(f);
      });
      T.chains.forEach((ch) => {
        if (inR(px(ch.c)) && !selEdges.includes(ch)) selEdges.push(ch);
      });
    });
    changed();
  }

  // ---------- Highlights ----------
  function rebuild() {
    hl.children.slice().forEach((o) => {
      hl.remove(o);
      if (o.geometry) o.geometry.dispose();
    });
    selFaces.forEach((f) => {
      const T = topo(f.mesh),
        p = [];
      f.tris.forEach((j) =>
        T.tris[j].v.forEach((v) =>
          p.push(v.x + f.n.x * 0.01, v.y + f.n.y * 0.01, v.z + f.n.z * 0.01)
        )
      );
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
      hl.add(
        new THREE.Mesh(
          g,
          new THREE.MeshBasicMaterial({
            color: 0xffa500,
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
          })
        )
      );
    });
    selEdges.forEach((ch) => {
      for (let i = 0; i < ch.pts.length - 1; i++) {
        const a = ch.pts[i],
          b = ch.pts[i + 1],
          d = b.clone().sub(a),
          len = d.length();
        if (len < 1e-6) continue;
        const m = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.07, len, 6),
          new THREE.MeshBasicMaterial({ color: 0xffb020, depthTest: false })
        );
        m.renderOrder = 12;
        m.position.copy(a).add(b).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
        hl.add(m);
      }
    });
    selObjs.forEach((o) => {
      const b = new THREE.BoxHelper(o, 0xffa500);
      b.userData.target = o;
      hl.add(b);
    });
  }
  function changed() {
    rebuild();
    renderPanel();
    window.dispatchEvent(new Event("cadselchange"));
  }
  function clearSel() {
    selFaces = [];
    selEdges = [];
    selObjs = [];
    changed();
  }

  // ---------- Operations ----------
  function bevelEdges(k, m, chs, kind, size) {
    const O = window.occtOps;
    const owned =
      m.userData.occt &&
      m.position.x === 0 &&
      m.position.z === 0 &&
      m.scale.x === 1 &&
      m.scale.z === 1 &&
      m.rotation.y === 0;
    const { s, H } = owned ? m.userData.occt : O.build(k, m, true);
    const all = k.getSubShapes(s, "edge").map((e) => {
      const b = k.getBoundingBox(e); // OCCT is Z-up: app (x, y, z) = OCCT (x, z, -y)
      return {
        e,
        c: new THREE.Vector3(
          (b.min.x + b.max.x) / 2,
          (b.min.z + b.max.z) / 2,
          -(b.min.y + b.max.y) / 2
        )
      };
    });
    const chosen = chs.map((ch) => {
      let best = null,
        bd = 0.15;
      all.forEach((o) => {
        const d = o.c.distanceTo(ch.c);
        if (d < bd) {
          bd = d;
          best = o.e;
        }
      });
      if (!best) throw new Error("could not match an edge");
      return best;
    });
    const uniq = [...new Set(chosen)];
    const out = kind === "fillet" ? k.fillet(s, uniq, size) : k.chamfer(s, uniq, size);
    const g = O.toGeometry(k.tessellate(out, 0.05, 0.3), H);
    const before = {
      geo: m.geometry,
      edges: m.userData.edges,
      imp: m.userData.imported,
      occt: m.userData.occt,
      px: m.position.x,
      pz: m.position.z,
      sx: m.scale.x,
      sz: m.scale.z
    };
    const apply = () => {
      m.geometry = g;
      m.userData.imported = true;
      m.userData.occt = { s: out, H };
      m.position.x = 0;
      m.position.z = 0;
      m.scale.x = 1;
      m.scale.z = 1;
      setHeight(m, H);
      O.addEdges(m, g);
    };
    const revert = () => {
      m.geometry = before.geo;
      m.userData.imported = before.imp;
      m.userData.occt = before.occt;
      m.position.x = before.px;
      m.position.z = before.pz;
      m.scale.x = before.sx;
      m.scale.z = before.sz;
      setHeight(m, H);
      if (m.userData.edges) m.remove(m.userData.edges);
      m.userData.edges = before.edges;
      if (before.edges) m.add(before.edges);
    };
    apply();
    undoStack.push({ redo: apply, undo: revert });
    redoStack.length = 0;
  }
  function edgeOp(kind, size) {
    const k = window.cadKernelReady && window.occtKernel;
    if (!k || !window.occtOps || !window.occtOps.build)
      return say("CAD kernel not ready, or occt-ops.js is missing its export line.");
    if (!(size > 0.001)) return say("Enter a size above 0.");
    const by = new Map();
    selEdges.forEach((ch) => {
      if (!by.has(ch.mesh)) by.set(ch.mesh, []);
      by.get(ch.mesh).push(ch);
    });
    let ok = 0;
    by.forEach((chs, m) => {
      try {
        (window.cadBevelEdges || bevelEdges)(k, m, chs, kind, size);
        ok++;
      } catch (err) {
        say("OCCT " + kind + " failed (" + (err.message || err) + ").");
        console.warn(err);
      }
    });
    if (ok) {
      clearSel();
      say("OCCT " + kind + " applied to the selected edges.");
    }
  }
  // Is every wall around this face square to it? Then the face can slide and the whole object stays one solid.
  function slideable(T, face) {
    const inF = new Set(face.tris);
    // anything that only touches the face at a corner must also be square to it, or it would shear
    const kk2 = (v) => Math.round(v.x * 1e3) + "," + Math.round(v.y * 1e3) + "," + Math.round(v.z * 1e3);
    const corner = new Set();
    face.tris.forEach((j) => T.tris[j].v.forEach((v) => corner.add(kk2(v))));
    for (let k = 0; k < T.tris.length; k++) {
      if (inF.has(k)) continue;
      const u = T.tris[k];
      if (u.face === -2) continue;
      if (Math.abs(u.n.dot(face.n)) > 0.05 && u.v.some((v) => corner.has(kk2(v)))) return false;
    }
    for (const j of face.tris) {
      const t = T.tris[j];
      for (let e = 0; e < 3; e++) {
        const ns = T.emap.get(ekey(t.k[e], t.k[(e + 1) % 3])) || [];
        for (const k of ns) if (!inF.has(k) && Math.abs(T.tris[k].n.dot(face.n)) > 0.05) return false;
      }
    }
    return true;
  }
  // Slide a flat face along its normal by d (negative = inwards). The neighbouring walls stretch with it.
  function slideFace(face, d) {
    const A = face.mesh,
      T = topo(A);
    A.updateMatrixWorld(true);
    const kk = (v) => Math.round(v.x * 1e3) + "," + Math.round(v.y * 1e3) + "," + Math.round(v.z * 1e3),
      tgt = new Set();
    face.tris.forEach((j) => T.tris[j].v.forEach((v) => tgt.add(kk(v))));
    const g = A.geometry.clone().applyMatrix4(A.matrixWorld),
      pos = g.attributes.position,
      w = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      w.fromBufferAttribute(pos, i);
      if (tgt.has(kk(w))) pos.setXYZ(i, w.x + face.n.x * d, w.y + face.n.y * d, w.z + face.n.z * d);
    }
    g.computeVertexNormals();
    g.computeBoundingBox();
    const ctr = g.boundingBox.getCenter(new THREE.Vector3());
    g.translate(-ctr.x, -ctr.y, -ctr.z);
    const keep = {
      geo: A.geometry,
      pos: A.position.clone(),
      scl: A.scale.clone(),
      quat: A.quaternion.clone(),
      imp: A.userData.imported,
      h: A.userData.height,
      eg: A.userData.edges ? A.userData.edges.geometry : null
    };
    const eg = new THREE.EdgesGeometry(g, 20);
    perform({
      redo() {
        A.geometry = g;
        A.position.copy(ctr);
        A.scale.set(1, 1, 1);
        A.quaternion.set(0, 0, 0, 1);
        A.userData.imported = true;
        A.userData.height = 0;
        A.userData.loopPts = null;
        A.userData.occt = null;
        A.material.side = THREE.DoubleSide;
        if (A.userData.edges) A.userData.edges.geometry = eg;
        A.updateMatrixWorld(true);
      },
      undo() {
        A.geometry = keep.geo;
        A.position.copy(keep.pos);
        A.scale.copy(keep.scl);
        A.quaternion.copy(keep.quat);
        A.userData.imported = keep.imp;
        A.userData.height = keep.h;
        if (A.userData.edges && keep.eg) A.userData.edges.geometry = keep.eg;
        A.updateMatrixWorld(true);
      }
    });
    clearSel();
    say("Extruded. It is still one solid.");
  }
  // Used by the side arrow: slide a face when that keeps the object one clean solid. Returns false if it can't.
  window.cadSlide = function (f, d) {
    if (!f || !f.planar) return false;
    const T = topo(f.mesh);
    if (!slideable(T, f)) return false;
    if (d < 0) {
      let lo = Infinity,
        hi = -Infinity;
      T.tris.forEach((t) =>
        t.v.forEach((v) => {
          const p = v.dot(f.n);
          lo = Math.min(lo, p);
          hi = Math.max(hi, p);
        })
      );
      if (-d >= hi - lo - 0.01) return false;
    }
    slideFace(f, d);
    return true;
  };
  function faceExtrude(dist) {
    const f = selFaces[0];
    if (!f) return;
    if (!f.planar) return say("Only flat faces can be extruded.");
    if (!(Math.abs(dist) > 0.001)) return say("Enter a distance above 0.");
    const sg = dist < 0 ? -1 : 1; // negative = extrude the other way, into/through the face
    dist = Math.abs(dist);
    {
      const T0 = topo(f.mesh);
      let lo = Infinity,
        hi = -Infinity;
      T0.tris.forEach((t) =>
        t.v.forEach((v) => {
          const p = v.dot(f.n);
          lo = Math.min(lo, p);
          hi = Math.max(hi, p);
        })
      );
      const th = hi - lo;
      if (sg > 0 && slideable(T0, f)) return slideFace(f, dist);
      if (sg < 0) {
        if (th < 0.1) {
          // thin sheet: the other way means growing from its back face
          let back = null;
          T0.faces.forEach((g) => {
            if (g.planar && g.n.dot(f.n) < -0.99 && (!back || g.c.dot(f.n) < back.c.dot(f.n))) back = g;
          });
          if (back && slideable(T0, back)) return slideFace(back, dist);
        } else if (dist < th - 0.01 && slideable(T0, f)) return slideFace(f, -dist);
      }
    }
    const T = topo(f.mesh),
      n = f.n.clone().multiplyScalar(sg),
      P = [],
      cnt = new Map();
    const add = (a, b, c) => P.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const addo = sg > 0 ? add : (a, b, c) => add(a, c, b);
    const off = (v) => v.clone().addScaledVector(n, dist);
    f.tris.forEach((j) => {
      const t = T.tris[j];
      addo(off(t.v[0]), off(t.v[1]), off(t.v[2])); // top
      for (let e = 0; e < 3; e++) {
        const ek = ekey(t.k[e], t.k[(e + 1) % 3]),
          r = cnt.get(ek);
        if (r) r.n++;
        else cnt.set(ek, { n: 1, a: t.v[e], b: t.v[(e + 1) % 3] });
      }
    });
    cnt.forEach((r) => {
      if (r.n !== 1) return; // only the face's outline gets walls
      addo(r.a, r.b, off(r.b));
      addo(r.a, off(r.b), off(r.a));
    });
    // keep the rest of the original object, so the result is ONE solid
    const skip = new Set(f.tris);
    T.tris.forEach((t, k) => {
      if (!skip.has(k)) add(t.v[0], t.v[1], t.v[2]);
    });
    const A = f.mesh;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.computeVertexNormals();
    g.computeBoundingBox();
    const ctr = g.boundingBox.getCenter(new THREE.Vector3());
    g.translate(-ctr.x, -ctr.y, -ctr.z); // recentre on the whole object
    const keep = {
      geo: A.geometry,
      pos: A.position.clone(),
      scl: A.scale.clone(),
      quat: A.quaternion.clone(),
      imp: A.userData.imported,
      h: A.userData.height,
      eg: A.userData.edges ? A.userData.edges.geometry : null,
      mat: A.material.side
    };
    const eg = new THREE.EdgesGeometry(g, 20);
    perform({
      redo() {
        A.geometry = g;
        A.position.copy(ctr);
        A.scale.set(1, 1, 1);
        A.quaternion.set(0, 0, 0, 1);
        A.userData.imported = true;
        A.userData.height = 0;
        A.userData.loopPts = null;
        A.userData.occt = null;
        A.material.side = THREE.DoubleSide;
        if (A.userData.edges) A.userData.edges.geometry = eg;
        A.updateMatrixWorld(true);
      },
      undo() {
        A.geometry = keep.geo;
        A.position.copy(keep.pos);
        A.scale.copy(keep.scl);
        A.quaternion.copy(keep.quat);
        A.userData.imported = keep.imp;
        A.userData.height = keep.h;
        A.material.side = keep.mat;
        if (A.userData.edges && keep.eg) A.userData.edges.geometry = keep.eg;
        A.updateMatrixWorld(true);
      }
    });
    clearSel();
    say("Face extruded. It is now part of the whole object.");
  }

  // ---------- Panel and mode buttons ----------
  const panel = document.createElement("div");
  panel.style.cssText =
    "position:absolute;right:14px;bottom:14px;width:210px;background:rgba(28,31,38,.95);border:1px solid #3a4150;border-radius:16px;padding:10px;color:#fff;font:13px -apple-system,sans-serif;z-index:7;display:none";
  panel.dataset.dragkey = "selpanel";
  document.body.appendChild(panel);
  function renderPanel() {
    const nF = selFaces.length,
      nE = selEdges.length,
      nO = selObjs.length;
    if (!nF && !nE && !nO) {
      panel.style.display = "none";
      return;
    }
    panel.style.display = "block";
    panel.innerHTML = "";
    const hd = document.createElement("div");
    hd.dataset.handle = "1";
    hd.textContent = "\u2630  Drag to move";
    hd.style.cssText = "padding:2px 0 8px;color:#9aa4b5;font-size:12px;cursor:grab;touch-action:none";
    panel.appendChild(hd);
    if (typeof makeDraggable === "function") makeDraggable(panel, hd);
    const row = (...els) => {
      const d = document.createElement("div");
      d.style.cssText = "display:flex;gap:6px;margin:6px 0;align-items:center";
      d.append(...els);
      panel.appendChild(d);
    };
    const txt = (t) => {
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
    const num = (v) => {
      const i = document.createElement("input");
      i.type = "number";
      i.step = "any";
      i.value = Math.round(toDisplay(v) * 100) / 100;
      i.style.cssText =
        "width:70px;padding:6px;border-radius:8px;border:1px solid #4a5568;background:#2d3340;color:#fff;font-size:14px";
      return i;
    };
    const u = UNITS[unitIndex].name;
    if (nE) {
      const i = num(0.5);
      row(txt(nE + " edge" + (nE > 1 ? "s" : "") + " selected"));
      row(txt("Size"), i, txt(u));
      row(
        btn("Fillet", () => edgeOp("fillet", toScene(parseFloat(i.value)))),
        btn("Chamfer", () => edgeOp("chamfer", toScene(parseFloat(i.value))))
      );
    }
    if (nF) {
      row(txt(nF + " face" + (nF > 1 ? "s" : "") + " selected"));
      if (nF === 1) {
        const i = num(1);
        row(txt("Extrude"), i, txt(u));
        row(
          btn("Extrude out", () => faceExtrude(toScene(parseFloat(i.value)))),
          btn("Extrude other way", () => faceExtrude(-toScene(parseFloat(i.value))))
        );
      } else row(txt("Select one face to extrude"));
    }
    if (nO) {
      const objs = selObjs.slice();
      row(txt(nO + " object" + (nO > 1 ? "s" : "") + " selected"));
      row(
        btn("Hide", () => {
          objs.forEach((o) => (o.visible = false));
          refreshList();
        }),
        btn("Delete", () => {
          perform({
            redo() {
              objs.forEach(removeFromScene);
            },
            undo() {
              objs.forEach(addToScene);
            }
          });
        })
      );
    }
    row(btn("Clear selection", clearSel));
  }
  const bar = document.createElement("div");
  bar.style.cssText =
    "position:absolute;left:84px;bottom:46px;display:flex;gap:6px;z-index:6";
  const tips = {
    object: "Object mode: click a shape as before. Drag a box on empty space to pick several.",
    face: "Face mode: click faces to add or remove. Drag a box to add many. Click empty space to clear.",
    edge: "Edge mode: click edges to add or remove. Drag a box to add many. Click empty space to clear."
  };
  function setMode(m) {
    selMode = m;
    [...bar.children].forEach(
      (b) => (b.style.background = b.dataset.m === m ? "#2f8cff" : "rgba(255,255,255,.1)")
    );
    clearSel();
    say(tips[m]);
  }
  ["object", "face", "edge"].forEach((m) => {
    const b = document.createElement("button");
    b.textContent = m[0].toUpperCase() + m.slice(1);
    b.dataset.m = m;
    b.style.cssText =
      "padding:7px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.14);color:#fff;font-size:12px";
    b.onclick = () => setMode(m);
    bar.appendChild(b);
  });
  say("Click a face or an edge to select it. Drag a box on empty space to select many. Esc clears.");

  // ---------- Mouse and pen input ----------
  const marq = document.createElement("div");
  marq.style.cssText =
    "position:fixed;display:none;border:1px dashed #4aa3ff;background:rgba(74,163,255,.15);pointer-events:none;z-index:8";
  document.body.appendChild(marq);
  let orb = null,
    pend = null;
  const rectOf = (a, b) => ({
    x0: Math.min(a.x, b.clientX),
    y0: Math.min(a.y, b.clientY),
    x1: Math.max(a.x, b.clientX),
    y1: Math.max(a.y, b.clientY)
  });
  host.addEventListener("contextmenu", (e) => e.preventDefault());
  host.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      dist = Math.min(60, Math.max(4, dist * Math.exp(e.deltaY * 0.0015)));
      updateCamera();
    },
    { passive: false }
  );
  // A second finger cancels any pending click or box
  addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType !== "mouse" && pend && e.pointerId !== pend.id) {
        pend = null;
        marq.style.display = "none";
      }
    },
    true
  );
  host.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) {
        if (e.button === 1 || e.button === 2) {
          orb = { id: e.pointerId, x: e.clientX, y: e.clientY };
          el.setPointerCapture(e.pointerId);
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (tool !== "select") return;
      setRay(e);
      if (arrow.visible && raycaster.intersectObject(arrow, true)[0]) return;
      const touch = e.pointerType === "touch";
      let hit = null;
      const eh = pickEdge(e, touch ? 18 : 10);
      if (eh) hit = { kind: "edge", v: eh };
      else {
        const f = pickFace(e);
        if (f) hit = { kind: "face", v: f };
        else if (pickLine(e)) return; // sketch lines are handled by the app
      }
      if (touch && !hit) return; // finger on empty space: the app orbits
      pend = { id: e.pointerId, x: e.clientX, y: e.clientY, hit, moved: false };
      el.setPointerCapture(e.pointerId);
      e.stopImmediatePropagation();
    },
    true
  );
  host.addEventListener(
    "pointermove",
    (e) => {
      if (orb && e.pointerId === orb.id) {
        yaw -= (e.clientX - orb.x) * 0.008;
        pitch = Math.min(1.5, Math.max(-1.5, pitch + (e.clientY - orb.y) * 0.008));
        orb.x = e.clientX;
        orb.y = e.clientY;
        updateCamera();
        e.stopImmediatePropagation();
        return;
      }
      if (pend && e.pointerId === pend.id) {
        if (Math.hypot(e.clientX - pend.x, e.clientY - pend.y) > 5) pend.moved = true;
        if (pend.moved && !pend.hit) {
          const r = rectOf(pend, e);
          Object.assign(marq.style, {
            display: "block",
            left: r.x0 + "px",
            top: r.y0 + "px",
            width: r.x1 - r.x0 + "px",
            height: r.y1 - r.y0 + "px"
          });
        }
        e.stopImmediatePropagation();
      }
    },
    true
  );
  host.addEventListener(
    "pointerup",
    (e) => {
      if (orb && e.pointerId === orb.id) {
        orb = null;
        return;
      }
      if (!pend || e.pointerId !== pend.id) return;
      const p = pend;
      pend = null;
      marq.style.display = "none";
      if (!p.moved) {
        if (!p.hit) {
          selFaces = [];
          selEdges = [];
          selObjs = [];
          hideArrow();
        } else if (p.hit.kind === "edge") toggle(selEdges, p.hit.v);
        else {
          toggle(selFaces, p.hit.v);
          hideArrow(); // the arrow now sits on the selected face itself
        }
        changed();
      } else if (!p.hit) marquee(rectOf(p, e));
      e.stopImmediatePropagation();
    },
    true
  );
  host.addEventListener(
    "pointercancel",
    (e) => {
      if (pend && e.pointerId === pend.id) {
        pend = null;
        marq.style.display = "none";
      }
      if (orb && e.pointerId === orb.id) orb = null;
    },
    true
  );
  addEventListener("keydown", (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === "Escape") clearSel();
    if ((e.key === "Delete" || e.key === "Backspace") && selObjs.length) {
      const objs = selObjs.slice();
      perform({
        redo() {
          objs.forEach(removeFromScene);
        },
        undo() {
          objs.forEach(addToScene);
        }
      });
    }
  });

  window.cadTopo = topo;
  window.cadSelFaces = () => selFaces;
  window.cadFaceExtrude = (d) => faceExtrude(d);
  // select the flat face of a mesh that points most toward dir (used right after drawing a sheet)
  window.cadSelectFaceToward = function (mesh, dir) {
    const T = topo(mesh);
    let best = null,
      bd = 0.5;
    T.faces.forEach((f) => {
      const d = f.n.dot(dir);
      if (f.planar && d > bd) {
        bd = d;
        best = f;
      }
    });
    if (!best) return;
    selFaces = [best];
    selEdges = [];
    selObjs = [];
    changed();
  };

  // ---------- Keep highlights in sync ----------
  (function frame() {
    requestAnimationFrame(frame);
    const n0 = selFaces.length + selEdges.length + selObjs.length;
    selFaces = selFaces.filter((f) => shapes.includes(f.mesh) && topo(f.mesh).faces.includes(f));
    selEdges = selEdges.filter((c) => shapes.includes(c.mesh) && topo(c.mesh).chains.includes(c));
    selObjs = selObjs.filter((m) => shapes.includes(m) && m.visible !== false);
    if (n0 !== selFaces.length + selEdges.length + selObjs.length) changed();
    hl.children.forEach((o) => o.userData.target && o.update());
  })();
})();
