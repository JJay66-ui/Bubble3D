// Connects the OCCT kernel to Cut, Fillet and Chamfer.
// Every function returns true if OCCT handled it, false to use the built-in version.
// Works on unrotated boxes and cylinders. Anything else falls back.
(function () {
  const TWO_PI = Math.PI * 2;
  let logged = false;

  function kernel() {
    return window.cadKernelReady ? window.occtKernel : null;
  }
  function fail(label, err) {
    hint.textContent =
      "OCCT " + label + " not used (" + (err.message || err) + "). Built-in version used.";
    console.warn("OCCT " + label + " failed:", err);
    if (!logged) {
      logged = true;
      const k = kernel();
      console.log(
        "Kernel methods:",
        Object.getOwnPropertyNames(Object.getPrototypeOf(k)).join(", ")
      );
    }
    return false;
  }

  // Move an OCCT shape so its bounding-box minimum sits at (x, y, z).
  // getBoundingBox may return {min,max}, a flat array of 6 numbers, or xmin/xmax-style fields
  function boxOf(k, s) {
    const b = k.getBoundingBox(s);
    const pick = (v) => (Array.isArray(v) || ArrayBuffer.isView(v) ? [v[0], v[1], v[2]] : [v.x, v.y, v.z]);
    if ((Array.isArray(b) || ArrayBuffer.isView(b)) && b.length >= 6)
      return { min: [b[0], b[1], b[2]], max: [b[3], b[4], b[5]] };
    if (b && b.min && b.max) return { min: pick(b.min), max: pick(b.max) };
    const f = (names) => {
      for (const n of names) if (b && typeof b[n] === "number") return b[n];
    };
    const mn = ["x", "y", "z"].map((a) => f([a + "min", a + "Min", "min" + a.toUpperCase(), a + "_min"]));
    const mx = ["x", "y", "z"].map((a) => f([a + "max", a + "Max", "max" + a.toUpperCase(), a + "_max"]));
    if (mn.concat(mx).every((v) => typeof v === "number")) return { min: mn, max: mx };
    throw new Error("unknown bounding box format " + JSON.stringify(// Connects the OCCT kernel to Cut, Fillet and Chamfer.
// Every function returns true if OCCT handled it, false to use the built-in version.
// Works on unrotated boxes and cylinders. Anything else falls back.
(function () {
  const TWO_PI = Math.PI * 2;
  let logged = false;

  function kernel() {
    return window.cadKernelReady ? window.occtKernel : null;
  }
  function fail(label, err) {
    hint.textContent =
      "OCCT " + label + " not used (" + (err.message || err) + "). Built-in version used.";
    console.warn("OCCT " + label + " failed:", err);
    if (!logged) {
      logged = true;
      const k = kernel();
      console.log(
        "Kernel methods:",
        Object.getOwnPropertyNames(Object.getPrototypeOf(k)).join(", ")
      );
    }
    return false;
  }

  // Move an OCCT shape so its bounding-box minimum sits at (x, y, z).
  // getBoundingBox may return {min,max}, a flat array of 6 numbers, or xmin/xmax-style fields
  function boxOf(k, s) {
    const b = k.getBoundingBox(s);
    const pick = (v) => (Array.isArray(v) || ArrayBuffer.isView(v) ? [v[0], v[1], v[2]] : [v.x, v.y, v.z]);
    if ((Array.isArray(b) || ArrayBuffer.isView(b)) && b.length >= 6)
      return { min: [b[0], b[1], b[2]], max: [b[3], b[4], b[5]] };
    if (b && b.min && b.max) return { min: pick(b.min), max: pick(b.max) };
    const f = (names) => {
      for (const n of names) if (b && typeof b[n] === "number") return b[n];
    };
    const mn = ["x", "y", "z"].map((a) => f([a + "min", a + "Min", "min" + a.toUpperCase(), a + "_min"]));
    const mx = ["x", "y", "z"].map((a) => f([a + "max", a + "Max", "max" + a.toUpperCase(), a + "_max"]));
    if (mn.concat(mx).every((v) => typeof v === "number")) return { min: mn, max: mx };
    throw new Error("unknown bounding box format " + JSON.stringify(b).slice(0, 120));
  }
  function place(k, s, x, y, z) {
    const bb = boxOf(k, s);
    return k.translate(s, x - bb.min[0], y - bb.min[1], z - bb.min[2]);
  }

  // OCCT is Z-up, the app is Y-up: OCCT (x, y, z) = app (x, -z, y).
  function build(k, m, ignoreBevel) {
    const p = m.geometry.parameters || {};
    const H = Math.abs(m.userData.height);
    if (m.userData.imported || p.loop) throw new Error("sketch or imported shape");
    if (m.userData.height < 0.05) throw new Error("extrude it first");
    if (Math.abs(m.rotation.y) > 1e-6) throw new Error("rotated shape");
    if (!ignoreBevel && m.userData.bevel > 0) throw new Error("already beveled");
    const cx = m.position.x,
      cz = m.position.z;
    if (p.radiusTop !== undefined) {
      if (Math.abs((p.thetaLength || TWO_PI) - TWO_PI) > 1e-6)
        throw new Error("half cylinder");
      const r = p.radiusTop * m.scale.x;
      return { s: place(k, k.makeCylinder(r, H), cx - r, -cz - r, 0), H };
    }
    if (p.width !== undefined) {
      const W = p.width * m.scale.x,
        D = p.depth * m.scale.z;
      return { s: place(k, k.makeBox(W, D, H), cx - W / 2, -cz - D / 2, 0), H };
    }
    throw new Error("unsupported shape");
  }

  // OCCT mesh -> Three geometry in the app's convention (height normalized to 1, centered).
  function toGeometry(t, H) {
    const p = t.positions,
      pos = new Float32Array(p.length);
    for (let i = 0; i < p.length; i += 3) {
      pos[i] = p[i];
      pos[i + 1] = p[i + 2] / H - 0.5;
      pos[i + 2] = -p[i + 1];
    }
    let g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(t.indices), 1));
    g = g.toNonIndexed();
    g.computeVertexNormals();
    return g;
  }
  function addEdges(m, g) {
    if (m.userData.edges) m.remove(m.userData.edges);
    m.userData.edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(g, 20),
      new THREE.LineBasicMaterial({ color: 0xffffff })
    );
    m.add(m.userData.edges);
  }

  function cut(tool, solid) {
    const k = kernel();
    if (!k) return false;
    try {
      const a = build(k, solid, false),
        b = build(k, tool, false);
      const g = toGeometry(k.tessellate(k.cut(a.s, b.s), 0.05, 0.3), a.H);
      const mesh = new THREE.Mesh(
        g,
        new THREE.MeshStandardMaterial({
          color: solid.material.color.getHex(),
          metalness: 0.1,
          roughness: 0.6,
          side: THREE.DoubleSide
        })
      );
      mesh.userData.imported = true;
      mesh.userData.cutResult = true;
      mesh.userData.name = undefined;
      setHeight(mesh, a.H);
      addEdges(mesh, g);
      perform({
        redo() {
          removeFromScene(solid);
          removeFromScene(tool);
          addToScene(mesh);
        },
        undo() {
          removeFromScene(mesh);
          addToScene(solid);
          addToScene(tool);
        }
      });
      hideArrow();
      hint.textContent = "Cut with OCCT. Undo brings the original shapes back.";
      return true;
    } catch (err) {
      return fail("cut", err);
    }
  }

  function bevel(m, kind, size) {
    const k = kernel();
    if (!k || !(size > 0.001)) return false;
    try {
      const { s, H } = build(k, m, true);
      const edges = k.getSubShapes(s, "edge").filter((e) => {
        const bb = boxOf(k, e);
        return bb.min[2] > H - 1e-3 && bb.max[2] > H - 1e-3;
      });
      if (!edges.length) throw new Error("no top edges found");
      const r = Math.min(size, H * 0.49);
      const out = kind === "fillet" ? k.fillet(s, edges, r) : k.chamfer(s, edges, r);
      const g = toGeometry(k.tessellate(out, 0.05, 0.3), H);
      const snap = () => ({
        geo: m.geometry,
        edges: m.userData.edges,
        imp: m.userData.imported,
        px: m.position.x,
        pz: m.position.z,
        sx: m.scale.x,
        sz: m.scale.z
      });
      const before = snap();
      const apply = () => {
        m.geometry = g;
        m.userData.imported = true;
        m.position.x = 0;
        m.position.z = 0;
        m.scale.x = 1;
        m.scale.z = 1;
        setHeight(m, H);
        addEdges(m, g);
      };
      const revert = () => {
        m.geometry = before.geo;
        m.userData.imported = before.imp;
        m.position.x = before.px;
        m.position.z = before.pz;
        m.scale.x = before.sx;
        m.scale.z = before.sz;
        setHeight(m, H);
        if (m.userData.edges) m.remove(m.userData.edges);
        m.userData.edges = before.edges;
        if (before.edges) m.add(before.edges);
        applyBevel(m, kind, 0);
      };
      apply();
      undoStack.push({ redo: apply, undo: revert });
      redoStack.length = 0;
      hint.textContent = "OCCT " + kind + " applied.";
      return true;
    } catch (err) {
      return fail(kind, err);
    }
  }

  window.occtOps = { cut, bevel, build, toGeometry, addEdges };
})();
