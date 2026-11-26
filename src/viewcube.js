// View cube (top right): click a face for Top / Bottom / Front / Back / Left / Right in an
// orthographic view, drag the cube to rotate. In those views, Line and Square draw on the
// first surface facing you, with a grid on that surface. Load last, after touch-lines.js.
(function () {
  const PI = Math.PI;
  const host = document.getElementById("view");
  const el = renderer.domElement;

  // ---------- Orthographic camera (a very narrow lens, pulled far back) ----------
  let ortho = false;
  const kOrtho = Math.tan((25 * PI) / 180) / Math.tan((1 * PI) / 180);
  updateCamera = function () {
    const d = ortho ? dist * kOrtho : dist;
    camera.position.set(
      d * Math.cos(pitch) * Math.sin(yaw),
      d * Math.sin(pitch),
      d * Math.cos(pitch) * Math.cos(yaw)
    );
    camera.lookAt(0, 0, 0);
  };
  function setOrtho(on) {
    ortho = on;
    camera.fov = on ? 2 : 50;
    camera.near = on ? 10 : 0.1;
    camera.far = on ? 8000 : 1000;
    camera.updateProjectionMatrix();
    updateCamera();
    if (btn) btn.textContent = on ? "Orthographic: on" : "Orthographic: off";
  }

  // ---------- Standard views ----------
  const E = 1e-3;
  const VIEWS = {
    Top: { axis: "y", sign: 1, yaw: 0, pitch: PI / 2 - E },
    Bottom: { axis: "y", sign: -1, yaw: 0, pitch: -(PI / 2 - E) },
    Front: { axis: "z", sign: 1, yaw: 0, pitch: 0 },
    Back: { axis: "z", sign: -1, yaw: PI, pitch: 0 },
    Right: { axis: "x", sign: 1, yaw: PI / 2, pitch: 0 },
    Left: { axis: "x", sign: -1, yaw: -PI / 2, pitch: 0 }
  };
  let view = null;
  function setView(name) {
    const v = VIEWS[name];
    yaw = v.yaw;
    pitch = v.pitch;
    view = Object.assign({ name }, v);
    lock = null;
    setOrtho(true);
    hint.textContent =
      name +
      " view. Pick Line or Square and draw on the first surface facing you. Drag the cube to rotate.";
  }
  window.cadSetView = setView;

  // ---------- The cube widget ----------
  const SIZE = 104;
  const wrap = document.createElement("div");
  wrap.style.cssText =
    "position:fixed;right:14px;top:10px;width:" +
    SIZE +
    "px;z-index:9;border-radius:14px;background:rgba(28,31,38,.6);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);user-select:none;touch-action:none";
  const head = document.createElement("div");
  head.textContent = "☰ View";
  head.style.cssText = "font:11px -apple-system,sans-serif;color:#9aa4b5;padding:3px 8px;cursor:grab;touch-action:none";
  const cvs = document.createElement("canvas");
  cvs.style.cssText = "display:block;width:" + SIZE + "px;height:" + SIZE + "px;cursor:pointer;touch-action:none";
  const btn = document.createElement("button");
  btn.style.cssText =
    "display:block;width:100%;padding:4px 0;border:none;border-top:1px solid rgba(255,255,255,.12);background:none;color:#cfd6e3;font:11px -apple-system,sans-serif;border-radius:0 0 14px 14px";
  const btn2 = document.createElement("button");
  btn2.textContent = "Make solid from lines";
  btn2.style.cssText = btn.style.cssText;
  btn2.onclick = () => makeSolidFromLines();
  wrap.append(head, cvs, btn, btn2);
  document.body.appendChild(wrap);
  makeDraggable(wrap, head);
  btn.onclick = () => setOrtho(!ortho);

  // keep the side panels out from under the cube
  ["panel", "linepanel"].forEach((id) => {
    const p = document.getElementById(id);
    if (p) p.style.top = "200px";
  });

  const mr = new THREE.WebGLRenderer({ canvas: cvs, alpha: true, antialias: true });
  mr.setPixelRatio(devicePixelRatio);
  mr.setSize(SIZE, SIZE, false);
  const ms = new THREE.Scene();
  const mc = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
  const label = (t) => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d");
    x.fillStyle = "#2f3542";
    x.fillRect(0, 0, 128, 128);
    x.strokeStyle = "#7c879b";
    x.lineWidth = 6;
    x.strokeRect(3, 3, 122, 122);
    x.fillStyle = "#eef2f8";
    x.font = "bold 30px sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(t, 64, 64);
    return new THREE.CanvasTexture(c);
  };
  // three.js box face order: +x, -x, +y, -y, +z, -z
  const FACES = ["Right", "Left", "Top", "Bottom", "Front", "Back"];
  const mats = FACES.map((t) => new THREE.MeshBasicMaterial({ map: label(t) }));
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), mats);
  ms.add(cube);
  ms.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(cube.geometry),
      new THREE.LineBasicMaterial({ color: 0x9aa4b5 })
    )
  );

  const mray = new THREE.Raycaster();
  function faceAt(e) {
    const r = cvs.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    mray.setFromCamera(v, mc);
    const h = mray.intersectObject(cube, false)[0];
    return h ? h.face.materialIndex : -1;
  }
  let cdrag = null;
  cvs.addEventListener("pointerdown", (e) => {
    cvs.setPointerCapture(e.pointerId);
    cdrag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  });
  cvs.addEventListener("pointermove", (e) => {
    if (cdrag && e.pointerId === cdrag.id) {
      if (!cdrag.moved && Math.hypot(e.clientX - cdrag.x, e.clientY - cdrag.y) < 5) return;
      cdrag.moved = true;
      yaw -= (e.clientX - cdrag.x) * 0.012;
      pitch = Math.min(1.5, Math.max(-1.5, pitch + (e.clientY - cdrag.y) * 0.012));
      cdrag.x = e.clientX;
      cdrag.y = e.clientY;
      updateCamera();
      return;
    }
    const i = faceAt(e);
    mats.forEach((m, k) => m.color.set(k === i ? 0x9cc8ff : 0xffffff));
  });
  cvs.addEventListener("pointerleave", () => mats.forEach((m) => m.color.set(0xffffff)));
  const cup = (e) => {
    if (!cdrag || e.pointerId !== cdrag.id) return;
    const d = cdrag;
    cdrag = null;
    if (!d.moved) {
      const i = faceAt(e);
      if (i >= 0) setView(FACES[i]);
    }
  };
  cvs.addEventListener("pointerup", cup);
  cvs.addEventListener("pointercancel", () => (cdrag = null));

  // ---------- Sketching on the first surface facing you ----------
  const others = (a) => ["x", "y", "z"].filter((k) => k !== a);
  const r3 = (v) => Math.round(v * 1e3) / 1e3;
  const DRAW = ["line", "rect"];
  let sk = null,
    prev = null;

  function nearestDepth() {
    let best = null;
    shapes.forEach((s) => {
      if (s.visible === false) return;
      const b = new THREE.Box3().setFromObject(s);
      const v = view.sign > 0 ? b.max[view.axis] : b.min[view.axis];
      if (best === null || (view.sign > 0 ? v > best : v < best)) best = v;
    });
    return best === null ? 0 : r3(best);
  }
  let lock = null; // the surface you started sketching on stays the same for the whole shape
  function endpointNear(q, d) {
    const [A, B] = others(view.axis);
    let best = null,
      bd = 0.6;
    scene.children.forEach((o) => {
      const P = o.userData && o.userData.plane;
      if (!P || P.axis !== view.axis || Math.abs(P.d - d) > 1e-3) return;
      [o.userData.a, o.userData.b].forEach((v2) => {
        const dd = Math.hypot(v2[A] - q[A], v2[B] - q[B]);
        if (dd < bd) {
          bd = dd;
          best = v2;
        }
      });
    });
    return best;
  }
  function planePoint(e, d) {
    setRay(e);
    const n = new THREE.Vector3();
    n[view.axis] = 1;
    const t = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(new THREE.Plane(n, -d), t)) return null;
    const [A, B] = others(view.axis);
    t[A] = Math.round(t[A] * 2) / 2;
    t[B] = Math.round(t[B] * 2) / 2;
    if (view.axis !== "y" && t.y < 0) t.y = 0; // the plate is zero: never draw below it
    t[view.axis] = d;
    const nb = endpointNear(t, d);
    if (nb) {
      t[A] = nb[A];
      t[B] = nb[B];
    }
    return t;
  }
  function corners(a, p) {
    const [A, B] = others(view.axis);
    const mk = (u, v) => {
      const q = new THREE.Vector3();
      q[A] = u;
      q[B] = v;
      q[view.axis] = a[view.axis];
      return q;
    };
    return [mk(a[A], a[B]), mk(p[A], a[B]), mk(p[A], p[B]), mk(a[A], p[B])];
  }
  function makeLine3D(a, b) {
    const l = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]),
      new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false })
    );
    l.renderOrder = 5;
    l.userData.isLine = true;
    l.userData.used = true; // keep these out of the ground "closed loop" detection
    l.userData.a = a.clone();
    l.userData.b = b.clone();
    l.userData.plane = { axis: view.axis, d: a[view.axis], sign: view.sign };
    return l;
  }
  const key2 = (v, A, B) => Math.round(v[A] * 100) + "," + Math.round(v[B] * 100);
  // find a closed loop of plane lines that includes the new segment
  function findLoop(nl) {
    const P = nl.userData.plane,
      [A, B] = others(P.axis);
    const pool = shapes.concat(scene.children).filter(
      (o, i, arr) =>
        arr.indexOf(o) === i &&
        o.userData &&
        o.userData.isLine &&
        o.userData.plane &&
        o.userData.plane.axis === P.axis &&
        Math.abs(o.userData.plane.d - P.d) < 1e-3 &&
        o.parent === scene
    );
    pool.push(nl);
    const ends = (l) => [key2(l.userData.a, A, B), key2(l.userData.b, A, B)];
    const target = ends(nl)[0];
    const path = [];
    const used = new Set([nl]);
    function dfs(at) {
      if (at === target && path.length >= 2) return true;
      for (const l of pool) {
        if (used.has(l)) continue;
        const [x, y] = ends(l);
        if (x !== at && y !== at) continue;
        used.add(l);
        path.push({ l, from: x === at ? "a" : "b" });
        if (dfs(x === at ? y : x)) return true;
        path.pop();
        used.delete(l);
      }
      return false;
    }
    if (!dfs(ends(nl)[1])) return null;
    const pts = [nl.userData.a];
    path.forEach((st) => pts.push(st.from === "a" ? st.l.userData.b : st.l.userData.a));
    pts.pop(); // last point equals the first
    return { lines: path.map((st) => st.l), pts, A, B, P };
  }
  function sheetFromPoly(pts, A, B, axis, d, sign) {
    const T = 0.02;
    const shp = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[A], p[B])));
    const g = new THREE.ExtrudeGeometry(shp, { depth: T, bevelEnabled: false }).toNonIndexed();
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i),
        v = pos.getY(i),
        w = pos.getZ(i),
        o = new THREE.Vector3();
      o[A] = u;
      o[B] = v;
      o[axis] = d - sign * w;
      pos.setXYZ(i, o.x, o.y, o.z);
    }
    const parity = axis === "y" ? -1 : 1;
    if (parity * -sign < 0)
      for (let i = 0; i < pos.count; i += 3) {
        const x = pos.getX(i + 1),
          y = pos.getY(i + 1),
          z = pos.getZ(i + 1);
        pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
        pos.setXYZ(i + 2, x, y, z);
      }
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    g.computeVertexNormals();
    const m = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({ color: 0x6aa9ff, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide })
    );
    m.userData.imported = true;
    m.userData.height = 0;
    m.userData.edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), new THREE.LineBasicMaterial({ color: 0xffffff }));
    m.add(m.userData.edges);
    return m;
  }
  function selectSheet(m) {
    setTimeout(() => {
      const dir = new THREE.Vector3();
      dir[view.axis] = view.sign;
      if (window.cadSelectFaceToward) window.cadSelectFaceToward(m, dir);
    }, 0);
  }
  // Turn a closed loop of lines on one plane into a solid sheet you can extrude
  function closeWith(nl, already) {
    let loop;
    try {
      loop = findLoop(nl);
    } catch (e) {
      toast("Close shape error: " + (e.message || e));
      return false;
    }
    if (!loop || loop.pts.length < 3) return false;
    try {
      const sheet = sheetFromPoly(loop.pts, loop.A, loop.B, loop.P.axis, loop.P.d, loop.P.sign);
      const gone = loop.lines.concat(already ? [nl] : []);
      perform({
        redo() {
          gone.forEach(removeFromScene);
          addToScene(sheet);
        },
        undo() {
          removeFromScene(sheet);
          gone.forEach(addToScene);
        }
      });
      lock = null;
      chooseTool("select");
      hint.textContent = "Closed shape. Use Extrude out or Extrude other way at the bottom right.";
      selectSheet(sheet);
      return true;
    } catch (e) {
      toast("Couldn't build the solid: " + (e.message || e));
      return false;
    }
  }
  const toast = (t) => (window.cadToast ? window.cadToast(t, false) : (hint.textContent = t));
  function makeSolidFromLines() {
    if (!view) return toast("Pick a view on the cube first (Front, Back, Left, Right).");
    const ls = scene.children.filter(
      (o) => o.userData && o.userData.plane && o.userData.plane.axis === view.axis && o.userData.isLine
    );
    if (!ls.length) return toast("No lines drawn on this view yet.");
    for (const l of ls) if (closeWith(l, true)) return;
    toast("No closed shape found. End the last line on the first line's start point so the corners meet.");
  }
  function clearPrev() {
    if (prev) {
      scene.remove(prev);
      prev.geometry.dispose();
      prev = null;
    }
  }
  function cancelSketch() {
    sk = null;
    clearPrev();
    hideMeasure();
  }
  function showPrev(a, p) {
    clearPrev();
    const mat = new THREE.LineBasicMaterial({ color: 0x2f8cff, depthTest: false });
    if (sk.tool === "line") prev = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, p]), mat);
    else prev = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners(a, p)), mat);
    prev.renderOrder = 6;
    scene.add(prev);
  }

  addEventListener(
    "pointerdown",
    (e) => {
      if (sk && e.pointerType === "touch" && e.pointerId !== sk.id) cancelSketch(); // second finger = navigating
    },
    true
  );
  host.addEventListener(
    "pointerdown",
    (e) => {
      if (!view || e.button !== 0) return;
      if (!DRAW.includes(tool) && tool !== "circle") return;
      setRay(e);
      const hit = raycaster.intersectObjects(shapes.filter((s) => s.visible !== false), false)[0];
      if (view.name === "Top" && !hit) return; // drawing on the ground stays as before
      if (tool === "circle") {
        hint.textContent = "Circles on a surface aren't available yet. Use Line or Square here.";
        e.stopImmediatePropagation();
        return;
      }
      if (lock && (lock.name !== view.name || tool !== lock.tool)) lock = null;
      const d = lock ? lock.d : hit ? r3(hit.point[view.axis]) : nearestDepth();
      lock = { name: view.name, d, tool };
      const p = planePoint(e, d);
      if (!p) return;
      sk = { id: e.pointerId, d, a: p, tool };
      el.setPointerCapture(e.pointerId);
      e.stopImmediatePropagation();
    },
    true
  );
  host.addEventListener(
    "pointermove",
    (e) => {
      if (!sk || e.pointerId !== sk.id) return;
      const p = planePoint(e, sk.d);
      if (p) {
        showPrev(sk.a, p);
        if (sk.tool === "line") showMeasure("Length: " + fmt(sk.a.distanceTo(p)));
        else {
          const c = corners(sk.a, p);
          showMeasure("Width: " + fmt(c[0].distanceTo(c[1])) + "   Height: " + fmt(c[1].distanceTo(c[2])));
        }
      }
      e.stopImmediatePropagation();
    },
    true
  );
  const finish = (commit) => (e) => {
    if (!sk || e.pointerId !== sk.id) return;
    const s = sk,
      p = commit ? planePoint(e, s.d) : null;
    cancelSketch();
    e.stopImmediatePropagation();
    if (!p) return;
    let segs = [];
    if (s.tool === "line") {
      if (s.a.distanceTo(p) > 0.1) segs = [[s.a, p]];
    } else {
      const c = corners(s.a, p);
      if (c[0].distanceTo(c[1]) > 0.1 && c[1].distanceTo(c[2]) > 0.1)
        segs = c.map((q, i) => [q, c[(i + 1) % 4]]);
    }
    if (!segs.length) return;
    let made;
    if (s.tool === "rect") {
      // a thin sheet on the plane: tap its face, then Extrude pulls it out along that face's normal
      const c = corners(s.a, p),
        [A, B] = others(view.axis),
        T = 0.02;
      const size = new THREE.Vector3();
      size[A] = Math.abs(c[2][A] - c[0][A]);
      size[B] = Math.abs(c[2][B] - c[0][B]);
      size[view.axis] = T;
      const g = new THREE.BoxGeometry(size.x, size.y, size.z);
      const m = new THREE.Mesh(
        g,
        new THREE.MeshStandardMaterial({ color: 0x6aa9ff, metalness: 0.1, roughness: 0.6 })
      );
      m.position.set(0, 0, 0);
      m.position[A] = (c[0][A] + c[2][A]) / 2;
      m.position[B] = (c[0][B] + c[2][B]) / 2;
      m.position[view.axis] = s.d - view.sign * (T / 2);
      m.userData.imported = true;
      m.userData.height = 0;
      m.userData.edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(g),
        new THREE.LineBasicMaterial({ color: 0xffffff })
      );
      m.add(m.userData.edges);
      made = [m];
    } else made = segs.map(([a, b]) => makeLine3D(a, b));
    if (s.tool === "line" && closeWith(made[0], false)) return;
    perform({
      redo() {
        made.forEach(addToScene);
      },
      undo() {
        made.forEach(removeFromScene);
      }
    });
    if (s.tool === "rect") {
      lock = null;
      chooseTool("select");
      hint.textContent = "Use Extrude out or Extrude other way at the bottom right.";
      selectSheet(made[0]);
    }
  };
  host.addEventListener("pointerup", finish(true), true);
  host.addEventListener("pointercancel", finish(false), true);

  // ---------- Grid on the sketch surface, cube spin, leaving a view ----------
  const grid = new THREE.GridHelper(40, 40, 0x7c8aa8, 0x3f485c);
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  grid.material.depthTest = false;
  grid.renderOrder = 4;
  grid.visible = false;
  scene.add(grid);

  (function frame() {
    requestAnimationFrame(frame);
    if (view && (Math.abs(yaw - view.yaw) > 0.02 || Math.abs(pitch - view.pitch) > 0.02)) view = null;
    let show = false;
    if (view && (DRAW.includes(tool) || tool === "circle") && !(view.name === "Top" && !sk)) {
      const d = sk ? sk.d : nearestDepth();
      grid.rotation.set(0, 0, 0);
      if (view.axis === "x") grid.rotation.z = PI / 2;
      if (view.axis === "z") grid.rotation.x = PI / 2;
      grid.position.set(0, 0, 0);
      grid.position[view.axis] = d;
      show = true;
    }
    grid.visible = show;
    mc.position.copy(camera.position).normalize().multiplyScalar(4);
    mc.lookAt(0, 0, 0);
    mr.render(ms, mc);
  })();

  setOrtho(false);
})();
