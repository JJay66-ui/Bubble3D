// Screws and bolts: pick a type and size, tap a surface to place one, adjust it, then press
// "Set" to cut a matching hole (with your fit gap) in whatever it passes through.
// Holes work for screws that point straight up or down. Load after carve.js.
(function () {
  const TYPES = {
    pan: "Pan head",
    socket: "Socket cap",
    flat: "Flat (countersunk)",
    hex: "Hex bolt",
    set: "Set screw (no head)",
    wood: "Wood screw"
  };
  const SIZES = { M2: 2, M3: 3, M4: 4, M5: 5, M6: 6, M8: 8, M10: 10, M12: 12 }; // millimetres
  const mm2s = (mm) => mm / 10; // one scene unit is 10 mm
  const P = { type: "socket", size: "M4", d: mm2s(4), L: mm2s(16), headD: 0, fit: mm2s(0.2) };
  let cur = null,
    placing = false;

  // ---------- Geometry ----------
  function part(g, x, y, z) {
    const m = g.index ? g.toNonIndexed() : g;
    if (x || y || z) m.translate(x || 0, y || 0, z || 0);
    return m;
  }
  function merge(list) {
    let n = 0;
    list.forEach((g) => (n += g.attributes.position.count));
    const arr = new Float32Array(n * 3);
    let o = 0;
    list.forEach((g) => {
      arr.set(g.attributes.position.array, o);
      o += g.attributes.position.count * 3;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    g.computeVertexNormals();
    return g;
  }
  // local frame: head sits on +Y side of the surface (y 0 to headH), the shank goes down to y = -L
  function buildGeo(p) {
    const r = p.d / 2,
      L = Math.max(p.L, p.d),
      parts = [];
    const cyl = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg || 28);
    let headD = p.headD > 0 ? p.headD : p.d * (p.type === "hex" ? 1.8 : p.type === "socket" ? 1.5 : 2);
    let headH = p.d * (p.type === "pan" || p.type === "wood" ? 0.7 : p.type === "hex" ? 0.65 : p.type === "flat" ? 0.5 : 1);
    const tip = Math.min(L * 0.25, p.d * 0.9);
    const shank = L - tip;
    if (p.type === "set") headH = 0;
    // shank and tip
    if (p.type === "flat") {
      parts.push(part(cyl(headD / 2, r, headH, 28), 0, -headH / 2));
      parts.push(part(cyl(r, r, shank - headH), 0, -headH - (shank - headH) / 2));
    } else {
      parts.push(part(cyl(r, r, shank), 0, -shank / 2));
    }
    parts.push(part(cyl(r, r * 0.15, tip), 0, -shank - tip / 2));
    // thread rings
    const pitch = Math.max(p.d * 0.22, 0.02),
      start = p.type === "flat" ? headH : 0.1 * p.d,
      end = shank + tip * 0.6;
    if (p.type !== "wood") {
      for (let y = start + pitch; y < end; y += pitch) parts.push(part(cyl(r * 1.1, r * 1.1, pitch * 0.4, 20), 0, -y));
    } else {
      for (let y = start + pitch; y < end; y += pitch) {
        const k = 1 - Math.max(0, (y - shank) / tip) * 0.8;
        parts.push(part(cyl(r * 1.25 * k, r * 1.25 * k, pitch * 0.45, 20), 0, -y));
      }
    }
    // head
    if (p.type === "pan" || p.type === "wood") {
      parts.push(part(cyl(headD / 2, headD / 2, headH * 0.65, 32), 0, headH * 0.325));
      parts.push(part(cyl(headD / 2 * 0.6, headD / 2, headH * 0.35, 32), 0, headH * 0.825));
    } else if (p.type === "socket") {
      parts.push(part(cyl(headD / 2, headD / 2, headH, 32), 0, headH / 2));
    } else if (p.type === "hex") {
      parts.push(part(cyl(headD / 2, headD / 2, headH, 6), 0, headH / 2));
    }
    return { geo: merge(parts), headH, headD };
  }

  // ---------- The screw object ----------
  function make(point, n) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    mesh.userData.screw = { n: n.clone() };
    mesh.userData.imported = true;
    mesh.userData.height = 0;
    mesh.userData.name = "Screw";
    mesh.position.copy(point);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    rebuild(mesh);
    return mesh;
  }
  function rebuild(m) {
    const { geo } = buildGeo(P);
    if (m.geometry) m.geometry.dispose();
    m.geometry = geo;
    m.userData.screw.p = Object.assign({}, P);
    if (m.userData.edges) m.remove(m.userData.edges);
    m.userData.edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: 0x555a66 }));
    m.add(m.userData.edges);
    m.updateMatrixWorld(true);
  }

  // ---------- Panel ----------
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;left:14px;top:80px;z-index:9;width:212px;border-radius:16px;background:rgba(28,31,38,.86);border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#fff;font:12px -apple-system,sans-serif;user-select:none;display:none";
  const head = document.createElement("div");
  head.textContent = "☰ Screws";
  head.style.cssText = "padding:6px 10px;color:#9aa4b5;cursor:grab;touch-action:none";
  box.appendChild(head);
  const body = document.createElement("div");
  body.style.cssText = "padding:0 10px 10px";
  box.appendChild(body);
  document.body.appendChild(box);
  if (typeof makeDraggable === "function") makeDraggable(box, head);

  // ---- Toolbar category "Screws" under Shape, with a flyout of screw types ----
  const ico = {
    pan: '<path d="M6 8a6 4 0 0 1 12 0z"/><path d="M10 8v12l2 2 2-2V8"/><path d="M10 12h4M10 16h4"/>',
    socket: '<path d="M6 3h12v5H6z"/><path d="M10 5.5h4"/><path d="M10 8v12l2 2 2-2V8"/><path d="M10 12h4M10 16h4"/>',
    flat: '<path d="M4 4h16L14 9v11l-2 2-2-2V9z"/><path d="M10 13h4M10 17h4"/>',
    hex: '<path d="M8 3h8l3 3v3H5V6z"/><path d="M10 9v11l2 2 2-2V9"/><path d="M10 13h4M10 17h4"/>',
    set: '<path d="M9 3v17l3 2 3-2V3z"/><path d="M9 8h6M9 12h6M9 16h6"/>',
    wood: '<path d="M6 8a6 4 0 0 1 12 0z"/><path d="M9 8l3 14 3-14"/><path d="M9.5 12l5 1M10 16l4 1"/>'
  };
  const svg = (k) => '<svg viewBox="0 0 24 24">' + ico[k] + "</svg>";
  const grp = document.createElement("div");
  grp.className = "grp";
  const open = document.createElement("button");
  open.className = "bubble";
  open.innerHTML = svg("socket") + "<span>Screws</span>";
  const fly = document.createElement("div");
  fly.className = "flyout";
  document.body.appendChild(fly);
  if (typeof flyouts !== "undefined") flyouts.push(fly);
  grp.appendChild(open);
  if (typeof bar !== "undefined") bar.appendChild(grp);
  else document.body.appendChild(grp);
  const typeBtns = {};
  Object.keys(TYPES).forEach((k) => {
    const b = document.createElement("button");
    b.className = "bubble";
    b.innerHTML = svg(k) + "<span>" + TYPES[k].split(" (")[0].replace(" head", "").replace("Set screw", "Set") + "</span>";
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      P.type = k;
      typeSel.value = k;
      open.innerHTML = svg(k) + "<span>Screws</span>";
      open.classList.add("active");
      fly.classList.remove("open");
      box.style.display = "none";
      startPlacing();
    });
    typeBtns[k] = b;
    fly.appendChild(b);
  });
  open.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const was = fly.classList.contains("open");
    if (typeof closeFlyouts === "function") closeFlyouts();
    if (!was) {
      const r = open.getBoundingClientRect();
      fly.style.left = r.right + 10 + "px";
      fly.style.top = Math.max(8, r.top - 4) + "px";
      fly.classList.add("open");
    }
  });
  const closePanel = () => {
    box.style.display = "none";
    open.classList.remove("active");
    stopPlacing();
  };
  const xb = document.createElement("span");
  xb.textContent = "\u2715";
  xb.style.cssText = "position:absolute;right:6px;top:4px;width:30px;height:26px;line-height:26px;text-align:center;cursor:pointer;font-size:15px;z-index:2";
  box.style.position = "fixed";
  ["pointerdown", "pointerup", "touchstart", "mousedown"].forEach((t) => xb.addEventListener(t, (e) => e.stopPropagation()));
  xb.addEventListener("click", (e) => { e.stopPropagation(); closePanel(); });
  box.appendChild(xb);

  const row = (label, el) => {
    const r = document.createElement("div");
    r.style.cssText = "display:flex;align-items:center;gap:6px;margin:6px 0";
    const l = document.createElement("span");
    l.textContent = label;
    l.style.cssText = "width:70px;color:#9aa4b5";
    r.append(l, el);
    body.appendChild(r);
    return r;
  };
  const field = "flex:1;min-width:0;height:30px;box-sizing:border-box;border:1px solid #3a4150;border-radius:8px;background:#1b1f27;color:#fff;padding:0 6px;font-size:13px";
  const sel = (opts, val, fn) => {
    const s = document.createElement("select");
    Object.keys(opts).forEach((k) => {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = opts[k];
      s.appendChild(o);
    });
    s.value = val;
    s.style.cssText = field;
    s.onchange = () => fn(s.value);
    return s;
  };
  const num = (fn) => {
    const i = document.createElement("input");
    i.type = "number";
    i.step = "any";
    i.min = "0";
    i.style.cssText = field;
    i.onchange = fn;
    return i;
  };
  const sizeNames = {};
  Object.keys(SIZES).forEach((k) => (sizeNames[k] = k + " (" + SIZES[k] + " mm)"));
  sizeNames.custom = "Custom";
  const typeSel = sel(TYPES, P.type, (v) => ((P.type = v), apply()));
  const sizeSel = sel(sizeNames, P.size, (v) => {
    P.size = v;
    if (SIZES[v]) P.d = mm2s(SIZES[v]);
    sync();
    apply();
  });
  const dIn = num(() => ((P.d = toScene(parseFloat(dIn.value) || 0.1)), (P.size = "custom"), (sizeSel.value = "custom"), apply()));
  const lIn = num(() => ((P.L = toScene(parseFloat(lIn.value) || 1)), apply()));
  const hIn = num(() => ((P.headD = toScene(parseFloat(hIn.value) || 0)), apply()));
  const fIn = num(() => (P.fit = toScene(parseFloat(fIn.value) || 0)));
  const unitName = document.createElement("div");
  unitName.style.cssText = "color:#9aa4b5;font-size:11px;margin:2px 0";
  row("Type", typeSel);
  row("Size", sizeSel);
  row("Diameter", dIn);
  row("Length", lIn);
  row("Head width", hIn);
  row("Hole gap", fIn);
  body.appendChild(unitName);
  const note = document.createElement("div");
  note.style.cssText = "color:#9aa4b5;font-size:11px;margin:6px 0;min-height:28px";
  const btn = (t, fn, bg) => {
    const b = document.createElement("button");
    b.textContent = t;
    b.onclick = fn;
    b.style.cssText = "flex:1;height:34px;border:none;border-radius:10px;background:" + (bg || "#2f8cff") + ";color:#fff;font-size:12px;padding:0 4px";
    return b;
  };
  const placeBtn = btn("Place on surface", () => (placing ? stopPlacing() : startPlacing()));
  const r1 = document.createElement("div");
  r1.style.cssText = "display:flex;gap:6px;margin:6px 0";
  r1.append(placeBtn, btn("Flip", flip, "#3a4150"));
  const r2 = document.createElement("div");
  r2.style.cssText = "display:flex;gap:6px;margin:6px 0";
  r2.append(btn("Set (cut hole)", setScrew, "#1f9d63"), btn("Delete", del, "#8a2f2f"));
  body.append(r1, r2, note);

  function sync() {
    dIn.value = Math.round(toDisplay(P.d) * 100) / 100;
    lIn.value = Math.round(toDisplay(P.L) * 100) / 100;
    hIn.value = Math.round(toDisplay(P.headD) * 100) / 100;
    fIn.value = Math.round(toDisplay(P.fit) * 1000) / 1000;
    unitName.textContent = "Sizes in " + UNITS[unitIndex].name + ". Head width 0 = automatic.";
  }
  sync();
  setInterval(() => box.style.display !== "none" && document.activeElement.tagName !== "INPUT" && sync(), 800);

  function apply() {
    if (cur && cur.parent) rebuild(cur);
  }
  function say(t, ok) {
    note.textContent = t;
    if (window.cadToast) window.cadToast(t, ok !== false);
  }

  // ---------- Placing ----------
  function startPlacing() {
    placing = true;
    placeBtn.textContent = "Tap a surface… (tap to stop)";
    placeBtn.style.background = "#d98a1f";
    note.textContent = "Tap the surface where the screw goes. It points into the object.";
  }
  function stopPlacing() {
    placing = false;
    placeBtn.textContent = "Place on surface";
    placeBtn.style.background = "#2f8cff";
  }
  const hostEl = document.getElementById("view");
  hostEl.addEventListener(
    "pointerdown",
    (e) => {
      if (!placing || (e.pointerType === "mouse" && e.button !== 0)) return;
      setRay(e);
      const targets = shapes.filter((s) => s.visible !== false && !s.userData.screw && !s.userData.isLine);
      const hit = raycaster.intersectObjects(targets, false)[0];
      e.stopImmediatePropagation();
      if (!hit || !hit.face) return say("Tap on an object's surface.", false);
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
      if (n.dot(raycaster.ray.direction) > 0) n.negate();
      const s = make(hit.point, n);
      perform({
        redo() {
          addToScene(s);
        },
        undo() {
          removeFromScene(s);
        }
      });
      cur = s;
      stopPlacing();
      box.style.display = "block";
      open.classList.add("active");
      say(
        Math.abs(n.y) > 0.99
          ? "Screw placed. Change size or length, then press Set to cut the hole."
          : "Screw placed. Holes can only be cut for screws pointing straight up or down for now.",
        true
      );
    },
    true
  );
  hostEl.addEventListener(
    "pointerup",
    (e) => {
      if (placing) e.stopImmediatePropagation();
    },
    true
  );

  function flip() {
    if (!cur) return say("Place a screw first.", false);
    const old = { q: cur.quaternion.clone(), n: cur.userData.screw.n.clone() };
    const n = old.n.clone().negate();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    const m = cur;
    perform({
      redo() {
        m.quaternion.copy(q);
        m.userData.screw.n.copy(n);
        m.updateMatrixWorld(true);
      },
      undo() {
        m.quaternion.copy(old.q);
        m.userData.screw.n.copy(old.n);
        m.updateMatrixWorld(true);
      }
    });
  }
  function del() {
    if (!cur) return;
    const m = cur;
    perform({
      redo() {
        removeFromScene(m);
      },
      undo() {
        addToScene(m);
      }
    });
    cur = null;
  }

  // ---------- Set: cut a clearance hole in everything the shank passes through ----------
  async function setScrew() {
    if (!cur || !cur.parent) return say("Place a screw first.", false);
    const m = cur,
      n = m.userData.screw.n,
      p = m.userData.screw.p;
    if (Math.abs(n.y) < 0.99) return say("Holes can only be cut for screws pointing straight up or down for now. The screw stays where it is.", false);
    if (!window.cadCutHoles) return say("carve.js is missing, so holes can't be cut.", false);
    const top = m.position.y,
      L = Math.max(p.L, p.d);
    const y0 = n.y > 0 ? top - L : top,
      y1 = n.y > 0 ? top : top + L;
    const rh = p.d / 2 + Math.max(0, P.fit) / 2;
    const ring = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      ring.push([m.position.x + Math.cos(a) * rh, m.position.z + Math.sin(a) * rh]);
    }
    const sb = new THREE.Box3(
      new THREE.Vector3(m.position.x - rh, y0, m.position.z - rh),
      new THREE.Vector3(m.position.x + rh, y1, m.position.z + rh)
    );
    const hosts = shapes.filter(
      (s) =>
        s !== m &&
        !s.userData.screw &&
        s.visible !== false &&
        !s.userData.isLine &&
        s.userData.height > 0.05 &&
        new THREE.Box3().setFromObject(s).intersectsBox(sb)
    );
    if (!hosts.length) return say("The screw isn't passing through anything yet, so there is nothing to cut. Move it into an object.", false);
    const ok = await window.cadCutHoles(hosts, ring, y0 - 0.001, y1 + 0.001, null, "Hole cut for the screw (gap " + fmt(P.fit) + ")");
    if (ok) {
      m.userData.screw.set = true;
      say("Hole cut in " + hosts.length + " object" + (hosts.length > 1 ? "s" : "") + ". The screw can be removed or turned in from either side.", true);
    } else say("Couldn't cut a hole in that object (STL imports and filleted shapes aren't supported yet).", false);
  }
})();
