// Home page, new project, save project (unlimited, stored on this device in IndexedDB).
(function () {
  const V3 = THREE.Vector3;
  const toast = (t, ok) => (window.cadToast ? window.cadToast(t, ok !== false) : (hint.textContent = t));

  // ------------------------------------------------------------ storage
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open("bubble3d", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("projects", { keyPath: "id" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const tx = (mode, fn) =>
    db().then(
      (d) =>
        new Promise((res, rej) => {
          const t = d.transaction("projects", mode),
            s = t.objectStore("projects"),
            q = fn(s);
          t.oncomplete = () => res(q && q.result);
          t.onerror = () => rej(t.error);
        })
    );
  const dbAll = () => tx("readonly", (s) => s.getAll()).then((a) => (a || []).sort((x, y) => y.updated - x.updated));
  const dbGet = (id) => tx("readonly", (s) => s.get(id));
  const dbPut = (rec) => tx("readwrite", (s) => s.put(rec));
  const dbDel = (id) => tx("readwrite", (s) => s.delete(id));

  // ------------------------------------------------------------ scene <-> data
  const SKIP = new Set(["edges", "occt", "occtG", "glow", "name", "screw"]);
  const rep = (k, v) => {
    if (v && v.isVector3) return { __v3: [v.x, v.y, v.z] };
    if (v && (v.isObject3D || v.isBufferGeometry || v.isMaterial)) return undefined;
    return v;
  };
  const revive = (v) => {
    if (Array.isArray(v)) return v.map(revive);
    if (v && typeof v === "object") {
      if (v.__v3) return new V3(v.__v3[0], v.__v3[1], v.__v3[2]);
      const o = {};
      Object.keys(v).forEach((k) => (o[k] = revive(v[k])));
      return o;
    }
    return v;
  };
  const udOf = (o) => {
    const out = {};
    Object.keys(o.userData).forEach((k) => {
      if (SKIP.has(k)) return;
      try {
        const s = JSON.stringify(o.userData[k], rep);
        if (s !== undefined) out[k] = JSON.parse(s);
      } catch (e) {}
    });
    return out;
  };
  const b64 = (f32) => {
    const u = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
    let s = "";
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const unb64 = (s) => {
    const bin = atob(s),
      u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Float32Array(u.buffer);
  };

  function ser1(o) {
    if (o.userData.screw) {
      const sc = o.userData.screw;
      return {
        k: "screw",
        name: o.userData.name,
        vis: o.visible !== false,
        p: sc.p,
        n: sc.n.toArray(),
        pos: o.position.toArray(),
        quat: o.quaternion.toArray(),
        set: !!sc.set,
        home: sc.home ? { p: sc.home.p.toArray(), q: sc.home.q.toArray() } : null
      };
    }
    const base = {
      name: o.userData.name,
      vis: o.visible !== false,
      pos: o.position.toArray(),
      quat: o.quaternion.toArray(),
      scl: o.scale.toArray(),
      ud: udOf(o)
    };
    const geo = o.geometry;
    if (o.isLine || o.isLineSegments) {
      return Object.assign(base, {
        k: o.isLineSegments ? "segs" : "line",
        pts: b64(new Float32Array(geo.attributes.position.array)),
        color: o.material.color ? o.material.color.getHex() : 0xffffff
      });
    }
    const m = o.material;
    const rec = Object.assign(base, {
      k: "mesh",
      color: m.color ? m.color.getHex() : 0x4f9dff,
      metal: m.metalness,
      rough: m.roughness,
      double: m.side === THREE.DoubleSide
    });
    if (geo.type === "BoxGeometry") {
      rec.g = "box";
      rec.gp = geo.parameters;
    } else if (geo.type === "CylinderGeometry") {
      rec.g = "cyl";
      rec.gp = geo.parameters;
    } else {
      const g = geo.index ? geo.toNonIndexed() : geo;
      rec.g = "buf";
      rec.pts = b64(new Float32Array(g.attributes.position.array));
      try {
        rec.gp = JSON.parse(JSON.stringify(geo.parameters || null));
      } catch (e) {}
    }
    return rec;
  }
  function serialize() {
    return {
      v: 1,
      objs: [...shapes, ...lines].map(ser1).filter(Boolean),
      cam: { yaw, pitch, dist },
      counter: objCounter
    };
  }

  function restore1(r) {
    let o;
    if (r.k === "screw") {
      if (!window.cadRestoreScrew) return null;
      o = window.cadRestoreScrew(r);
      o.userData.name = r.name;
      o.visible = r.vis !== false;
      addToScene(o);
      return o;
    }
    if (r.k === "line" || r.k === "segs") {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(unb64(r.pts), 3));
      o = new (r.k === "segs" ? THREE.LineSegments : THREE.Line)(g, new THREE.LineBasicMaterial({ color: r.color }));
    } else {
      let geo;
      const p = r.gp || {};
      if (r.g === "box") geo = new THREE.BoxGeometry(p.width, p.height, p.depth);
      else if (r.g === "cyl")
        geo = new THREE.CylinderGeometry(
          p.radiusTop,
          p.radiusBottom,
          p.height,
          p.radialSegments,
          p.heightSegments,
          p.openEnded,
          p.thetaStart,
          p.thetaLength
        );
      else {
        geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(unb64(r.pts), 3));
        geo.computeVertexNormals();
        if (r.gp) geo.parameters = r.gp;
      }
      o = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: r.color,
          metalness: r.metal,
          roughness: r.rough,
          side: r.double ? THREE.DoubleSide : THREE.FrontSide
        })
      );
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, r.g === "buf" ? 20 : 1),
        new THREE.LineBasicMaterial({ color: 0xffffff })
      );
      o.add(edges);
      o.userData.edges = edges;
    }
    Object.assign(o.userData, revive(r.ud || {}));
    o.userData.name = r.name;
    o.position.fromArray(r.pos);
    o.quaternion.fromArray(r.quat);
    o.scale.fromArray(r.scl);
    o.visible = r.vis !== false;
    addToScene(o);
    return o;
  }

  function clearScene() {
    [...shapes, ...lines].forEach((o) => removeFromScene(o));
    undoStack.length = 0;
    redoStack.length = 0;
    if (typeof hideArrow === "function") hideArrow();
    if (typeof hideLinePanel === "function") hideLinePanel();
    objCounter = 0;
  }
  function load(data) {
    clearScene();
    (data.objs || []).forEach((r) => {
      try {
        restore1(r);
      } catch (e) {
        console.warn("restore failed", r.k, e);
      }
    });
    if (data.counter) objCounter = Math.max(objCounter, data.counter);
    if (data.cam) {
      yaw = data.cam.yaw;
      pitch = data.cam.pitch;
      dist = data.cam.dist;
      updateCamera();
    }
    refreshList();
  }

  // Clean, high-resolution picture of only the project's objects (no grid or plate), framed to fit
  function thumb() {
    const objs = [...shapes, ...lines].filter((o) => o.visible !== false);
    if (!objs.length) return "";
    const set = new Set([...shapes, ...lines]);
    const hidden = [];
    const old = {
      pos: camera.position.clone(),
      aspect: camera.aspect,
      pr: renderer.getPixelRatio(),
      size: renderer.getSize(new THREE.Vector2()),
      bg: scene.background,
      clearA: renderer.getClearAlpha(),
      clearC: renderer.getClearColor(new THREE.Color())
    };
    try {
      const box = new THREE.Box3();
      objs.forEach((o) => box.union(new THREE.Box3().setFromObject(o)));
      if (box.isEmpty()) return "";
      scene.children.forEach((c) => {
        if (!set.has(c) && !c.isLight && c.visible) {
          c.visible = false;
          hidden.push(c);
        }
      });
      const W = 1200,
        H = 750;
      renderer.setPixelRatio(1);
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      const ctr = box.getCenter(new THREE.Vector3()),
        r = box.getSize(new THREE.Vector3()).length() / 2 || 1;
      const dir = new V3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
      const fv = (camera.fov * Math.PI) / 180,
        fh = 2 * Math.atan(Math.tan(fv / 2) * camera.aspect);
      const d = (r / Math.sin(Math.min(fv, fh) / 2)) * 1.12;
      camera.position.copy(ctr).addScaledVector(dir, d);
      camera.lookAt(ctr);
      scene.background = null;
      renderer.setClearColor(0x000000, 0);
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL("image/png");
    } catch (e) {
      return "";
    } finally {
      hidden.forEach((c) => (c.visible = true));
      renderer.setPixelRatio(old.pr);
      renderer.setSize(old.size.x, old.size.y);
      camera.aspect = old.aspect;
      camera.updateProjectionMatrix();
      updateCamera();
      scene.background = old.bg;
      renderer.setClearColor(old.clearC, old.clearA);
      renderer.render(scene, camera);
    }
  }

  // ------------------------------------------------------------ current project
  let cur = null; // {id, name, created}
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  async function save(quiet) {
    if (!cur) return false;
    const rec = { id: cur.id, name: cur.name, created: cur.created, updated: Date.now(), thumb: thumb(), data: serialize() };
    try {
      await dbPut(rec);
      try {
        localStorage.setItem("bubble3d.last", cur.id);
      } catch (e) {}
      if (!quiet) toast('Saved "' + cur.name + '"', true);
      return true;
    } catch (e) {
      toast("Couldn't save: " + (e.message || e), false);
      return false;
    }
  }
  const hasWork = () => shapes.length + lines.length > 0;

  async function newProject() {
    const name = await ask("New project", "Untitled project");
    if (name === null) return;
    if (cur) await save(true);
    else if (hasWork()) {
      cur = { id: newId(), name: "Untitled " + new Date().toLocaleString(), created: Date.now() };
      await save(true);
    }
    clearScene();
    cur = { id: newId(), name: name || "Untitled project", created: Date.now() };
    await save(true);
    hideHome();
    toast('New project "' + cur.name + '"', true);
  }
  async function openProject(id) {
    const rec = await dbGet(id);
    if (!rec) return toast("That project is gone.", false);
    if (cur && cur.id !== id) await save(true);
    else if (!cur && hasWork()) {
      cur = { id: newId(), name: "Untitled " + new Date().toLocaleString(), created: Date.now() };
      await save(true);
    }
    load(rec.data);
    cur = { id: rec.id, name: rec.name, created: rec.created };
    try {
      localStorage.setItem("bubble3d.last", rec.id);
    } catch (e) {}
    hideHome();
    toast('Opened "' + rec.name + '"', true);
  }
  async function saveAs() {
    const name = await ask("Save a copy as", (cur ? cur.name : "Untitled project") + " copy");
    if (name === null) return;
    cur = { id: newId(), name: name || "Untitled project", created: Date.now() };
    await save();
  }
  async function saveNow() {
    if (!cur) {
      const name = await ask("Save project", "Untitled project");
      if (name === null) return;
      cur = { id: newId(), name: name || "Untitled project", created: Date.now() };
    }
    await save();
  }

  // ------------------------------------------------------------ little name dialog
  function ask(title, value) {
    return new Promise((res) => {
      const w = document.createElement("div");
      w.style.cssText = "position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px";
      const b = document.createElement("div");
      b.style.cssText =
        "width:min(360px,100%);background:#1c2029;border:1px solid #3a4150;border-radius:18px;padding:16px;color:#fff;font:15px -apple-system,sans-serif";
      const h = document.createElement("div");
      h.textContent = title;
      h.style.cssText = "font-weight:600;margin-bottom:10px";
      const i = document.createElement("input");
      i.value = value || "";
      i.style.cssText = "width:100%;box-sizing:border-box;height:42px;border-radius:10px;border:1px solid #3a4150;background:#12151b;color:#fff;padding:0 12px;font-size:16px";
      const r = document.createElement("div");
      r.style.cssText = "display:flex;gap:8px;margin-top:12px";
      const mk = (t, bg, fn) => {
        const x = document.createElement("button");
        x.textContent = t;
        x.onclick = fn;
        x.style.cssText = "flex:1;height:40px;border:none;border-radius:10px;color:#fff;font-size:14px;background:" + bg;
        return x;
      };
      const done = (v) => {
        w.remove();
        res(v);
      };
      r.append(mk("Cancel", "#3a4150", () => done(null)), mk("OK", "#2f8cff", () => done(i.value.trim())));
      i.addEventListener("keydown", (e) => {
        if (e.key === "Enter") done(i.value.trim());
        if (e.key === "Escape") done(null);
      });
      b.append(h, i, r);
      w.appendChild(b);
      document.body.appendChild(w);
      setTimeout(() => (i.focus(), i.select()), 30);
    });
  }

  function confirmBox(message) {
    return new Promise((res) => {
      const w = document.createElement("div");
      w.style.cssText = "position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px";
      const b = document.createElement("div");
      b.style.cssText =
        "width:min(360px,100%);background:#1c2029;border:1px solid #3a4150;border-radius:18px;padding:18px;color:#fff;font:15px -apple-system,sans-serif;text-align:center";
      const t = document.createElement("div");
      t.textContent = message;
      t.style.cssText = "font-weight:600;line-height:1.4;margin-bottom:16px";
      const r = document.createElement("div");
      r.style.cssText = "display:flex;gap:10px";
      const mk = (label, bg, v) => {
        const x = document.createElement("button");
        x.textContent = label;
        x.style.cssText = "flex:1;height:44px;border:none;border-radius:12px;color:#fff;font-size:16px;font-weight:600;background:" + bg;
        x.onclick = () => {
          w.remove();
          res(v);
        };
        return x;
      };
      r.append(mk("No", "#3a4150", false), mk("Yes", "#d64545", true));
      b.append(t, r);
      w.appendChild(b);
      document.body.appendChild(w);
    });
  }

  // ------------------------------------------------------------ home page
  const css = document.createElement("style");
  css.textContent = `
#b3home{position:fixed;inset:0;z-index:200;overflow-x:hidden;overflow-y:auto;scrollbar-width:none;-ms-overflow-style:none;color:#fff;font-family:-apple-system,"SF Pro Text","Segoe UI",system-ui,sans-serif;
  background:radial-gradient(ellipse at 25% 15%,#18395c 0%,#0d1a2c 45%,#070b13 100%);-webkit-overflow-scrolling:touch}
#b3home::-webkit-scrollbar{display:none;width:0;height:0}
#b3home .bub{position:absolute;border-radius:50%;pointer-events:none;
  background:radial-gradient(circle at 30% 28%,rgba(255,255,255,.75) 0,rgba(255,255,255,.12) 18%,rgba(120,200,255,.06) 55%,rgba(120,200,255,.16) 100%);
  border:1px solid rgba(190,235,255,.35);animation:b3float linear infinite}
@keyframes b3float{0%{transform:translate3d(0,0,0)}50%{transform:translate3d(var(--dx),-48px,0)}100%{transform:translate3d(0,0,0)}}
#b3home .wrap{position:relative;max-width:980px;margin:0 auto;padding:max(34px,6vh) 20px 60px;text-align:center}
#b3home h1{margin:0;display:flex;justify-content:center;align-items:flex-end;gap:.18em;line-height:1;flex-wrap:wrap;font-size:clamp(54px,15vw,150px)}
#b3home .bw{display:inline-block;font-family:"Arial Rounded MT Bold","Trebuchet MS","Nunito",ui-rounded,"SF Pro Rounded",system-ui,sans-serif;font-weight:900;letter-spacing:-.02em}
#b3home .bw span{display:inline-block;animation:b3bob 3.2s ease-in-out infinite;
  background:linear-gradient(180deg,#f2fdff 0%,#9fe6ff 42%,#3ea8ff 100%);-webkit-background-clip:text;background-clip:text;color:transparent;
  -webkit-text-stroke:.025em rgba(255,255,255,.92);filter:drop-shadow(0 0 .12em rgba(90,200,255,.7)) drop-shadow(0 .05em .1em rgba(0,40,90,.5))}
@keyframes b3bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-.06em)}}
#b3home .tw{display:inline-block;font-family:Impact,"Arial Black","Helvetica Neue",Haettenschweiler,sans-serif;font-weight:900;font-style:italic;
  color:#fff3c9;transform:skewX(-8deg) translateY(.02em);margin-left:.04em;letter-spacing:.02em}
#b3home .tag{margin:.9em 0 0;color:#9fc3e6;letter-spacing:.32em;text-transform:uppercase;font-size:clamp(11px,2.4vw,15px)}
#b3home .row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:34px 0 8px}
#b3home .pb{height:52px;padding:0 28px;border-radius:26px;font-size:17px;font-weight:600;color:#fff;border:1px solid rgba(255,255,255,.22);
  background:rgba(255,255,255,.08);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);cursor:pointer}
#b3home .pb.main{background:linear-gradient(180deg,#4db2ff,#1f7be6);border-color:rgba(255,255,255,.4);box-shadow:0 8px 28px rgba(40,140,255,.45)}
#b3home .pb.cont{display:flex;align-items:center;gap:14px;height:auto;padding:10px 22px 10px 10px;border-radius:30px;border:2px solid rgba(255,255,255,.45);
  background:rgba(255,255,255,.1);min-width:min(430px,100%);text-align:left;box-shadow:0 10px 34px rgba(0,0,0,.35)}
#b3home .pb.cont .ct{width:128px;height:80px;border-radius:20px;flex:none;background:#0a1220 center/cover no-repeat;border:1px solid rgba(255,255,255,.25)}
#b3home .pb.cont .tx{display:flex;flex-direction:column;gap:3px;min-width:0}
#b3home .pb.cont .lb{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#8fc8ff;font-weight:600}
#b3home .pb.cont .pn{font-size:20px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px}
#b3home h2{font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:#7f9fc2;margin:44px 0 14px;text-align:left;font-weight:600}
#b3home .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px;text-align:left}
#b3home .card{border-radius:18px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);overflow:hidden;
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
#b3home .card .im{aspect-ratio:16/10;background:radial-gradient(ellipse at 50% 30%,#16314f,#0a1220) center/contain no-repeat;background-color:#0b1626;cursor:pointer}
#b3home .card .nm{padding:10px 12px 2px;font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#b3home .card .dt{padding:0 12px;color:#8ba5c4;font-size:12px}
#b3home .card .ac{display:flex;gap:6px;padding:8px 10px 10px}
#b3home .card .ac button{flex:1;height:30px;border-radius:9px;border:none;background:rgba(255,255,255,.1);color:#dfeaf7;font-size:12px;cursor:pointer}
#b3home .card .ac button.del{color:#ff9b9b}
#b3home .empty{color:#7f9fc2;text-align:center;padding:30px 0}
`;
  document.head.appendChild(css);

  const home = document.createElement("div");
  home.id = "b3home";
  for (let i = 0; i < 22; i++) {
    const b = document.createElement("div");
    const s = 18 + Math.random() * 90;
    b.className = "bub";
    b.style.cssText =
      "width:" + s + "px;height:" + s + "px;left:" + Math.random() * 100 + "%;top:" + Math.random() * 100 + "%;--dx:" +
      (Math.random() * 40 - 20) + "px;animation-duration:" + (7 + Math.random() * 9) + "s;animation-delay:-" + Math.random() * 9 + "s;opacity:" +
      (0.45 + Math.random() * 0.5);
    home.appendChild(b);
  }
  const wrap = document.createElement("div");
  wrap.className = "wrap";
  const h1 = document.createElement("h1");
  const bw = document.createElement("span");
  bw.className = "bw";
  "Bubble".split("").forEach((ch, i) => {
    const s = document.createElement("span");
    s.textContent = ch;
    s.style.animationDelay = i * 0.18 + "s";
    bw.appendChild(s);
  });
  const tw = document.createElement("span");
  tw.className = "tw";
  // layered shadows give the 3D letters their depth
  const layers = [];
  for (let i = 1; i <= 16; i++) layers.push(i * 0.035 + "em " + i * 0.035 + "em 0 hsl(" + (28 - i) + ",88%," + (52 - i * 1.9) + "%)");
  layers.push("0.7em 0.8em 0.35em rgba(0,0,0,.45)");
  tw.style.textShadow = layers.join(",");
  tw.textContent = "3D";
  h1.append(bw, tw);
  const tag = document.createElement("p");
  tag.className = "tag";
  tag.textContent = "Sketch · Extrude · Build";
  const row = document.createElement("div");
  row.className = "row";
  const bNew = document.createElement("button");
  bNew.className = "pb main";
  bNew.textContent = "+ New project";
  bNew.onclick = newProject;
  const bBack = document.createElement("button");
  bBack.className = "pb";
  bBack.onclick = () => hideHome();
  const bLast = document.createElement("button");
  bLast.className = "pb cont";
  row.append(bNew, bBack);
  const h2 = document.createElement("h2");
  h2.textContent = "Your projects";
  const grid = document.createElement("div");
  grid.className = "grid";
  wrap.append(h1, tag, row, h2, grid);
  home.appendChild(wrap);
  document.body.appendChild(home);

  const fmtDate = (t) => new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  async function renderList() {
    let list = [];
    try {
      list = await dbAll();
    } catch (e) {
      grid.innerHTML = '<div class="empty">Saving isn\'t available in this browser.</div>';
      return;
    }
    grid.innerHTML = "";
    if (!list.length) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1">No projects yet. Tap New project to start.</div>';
    }
    list.forEach((p) => {
      const c = document.createElement("div");
      c.className = "card";
      const im = document.createElement("div");
      im.className = "im";
      if (p.thumb) im.style.backgroundImage = "url(" + p.thumb + ")";
      im.onclick = () => openProject(p.id);
      const nm = document.createElement("div");
      nm.className = "nm";
      nm.textContent = p.name;
      const dt = document.createElement("div");
      dt.className = "dt";
      dt.textContent = fmtDate(p.updated);
      const ac = document.createElement("div");
      ac.className = "ac";
      const mk = (t, cls, fn) => {
        const b = document.createElement("button");
        b.textContent = t;
        if (cls) b.className = cls;
        b.onclick = fn;
        return b;
      };
      ac.append(
        mk("Open", "", () => openProject(p.id)),
        mk("Rename", "", async () => {
          const n = await ask("Rename project", p.name);
          if (!n) return;
          const rec = await dbGet(p.id);
          rec.name = n;
          await dbPut(rec);
          if (cur && cur.id === p.id) cur.name = n;
          renderList();
        }),
        mk("Copy", "", async () => {
          const rec = await dbGet(p.id);
          rec.id = newId();
          rec.name = p.name + " copy";
          rec.created = rec.updated = Date.now();
          await dbPut(rec);
          renderList();
        }),
        mk("Delete", "del", async () => {
          const ok = await confirmBox('Are you sure you want to delete "' + p.name + '"? This can\'t be undone.');
          if (!ok) return;
          await dbDel(p.id);
          if (cur && cur.id === p.id) {
            cur = null;
            clearScene();
            try {
              localStorage.removeItem("bubble3d.rescue");
            } catch (e) {}
          }
          renderList();
        })
      );
      c.append(im, nm, dt, ac);
      grid.appendChild(c);
    });
    // buttons
    bBack.style.display = hasWork() && !cur ? "" : "none";
    bBack.textContent = "\u21a9 Back to canvas";
  }
  function showHome() {
    home.style.display = "block";
    renderList();
  }
  function hideHome() {
    home.style.display = "none";
  }
  window.cadHome = { show: showHome, hide: hideHome, save: saveNow };

  // ------------------------------------------------------------ top bar buttons
  const topbar = document.getElementById("topbar");
  const mkBub = (label, svg, fn) => {
    const b = document.createElement("button");
    b.className = "bubble";
    b.innerHTML = '<svg viewBox="0 0 24 24">' + svg + "</svg><span>" + label + "</span>";
    b.addEventListener("click", fn);
    topbar.insertBefore(b, topbar.firstChild);
    return b;
  };
  // inserted in reverse so the order reads Home, Save, Save as
  mkBub("Save as", '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4"/><path d="M12 13v5M9.5 15.5h5"/>', saveAs);
  mkBub("Save", '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4"/><path d="M8 20v-6h8v6"/>', saveNow);
  mkBub("Home", '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>', async () => {
    if (cur) await save(true);
    showHome();
  });
  addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveNow();
    }
  });

  // ------------------------------------------------------------ never lose work
  // 1) save a moment after every change, 2) save when leaving / hiding / refreshing / crashing,
  // 3) keep a second copy in localStorage that survives even if the page dies mid-save.
  const RESCUE = "bubble3d.rescue";
  function ensureCur() {
    if (!cur && hasWork()) cur = { id: newId(), name: "Untitled " + new Date().toLocaleString(), created: Date.now() };
  }
  function rescueSave() {
    if (home.style.display !== "none" && !hasWork()) return;
    try {
      ensureCur();
      if (!cur) return;
      localStorage.setItem(RESCUE, JSON.stringify({ id: cur.id, name: cur.name, created: cur.created, t: Date.now(), data: serialize() }));
    } catch (e) {
      /* too big for localStorage: the IndexedDB save below still runs */
    }
  }
  let lastSig = "",
    timer = null;
  const sig = () => shapes.length + "|" + lines.length + "|" + undoStack.length + "|" + redoStack.length + "|" + (undoStack[undoStack.length - 1] ? 1 : 0);
  function flush() {
    rescueSave();
    ensureCur();
    if (cur) save(true);
  }
  setInterval(() => {
    if (home.style.display !== "none") return;
    const g = sig();
    if (g !== lastSig) {
      lastSig = g;
      clearTimeout(timer);
      timer = setTimeout(flush, 1200);
    }
  }, 800);
  setInterval(() => {
    if (home.style.display === "none") flush();
  }, 20000);
  addEventListener("pagehide", flush);
  addEventListener("beforeunload", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flush();
  });
  let errAt = 0;
  const onCrash = () => {
    if (Date.now() - errAt < 3000) return;
    errAt = Date.now();
    flush();
  };
  addEventListener("error", onCrash);
  addEventListener("unhandledrejection", onCrash);

  // after a refresh or crash: bring back anything newer than the saved copy
  async function recover() {
    let r = null;
    try {
      r = JSON.parse(localStorage.getItem(RESCUE) || "null");
    } catch (e) {}
    if (!r || !r.data || !(r.data.objs || []).length) return;
    try {
      const old = await dbGet(r.id);
      if (!old || (old.updated || 0) < r.t - 500) {
        await dbPut({ id: r.id, name: r.name, created: r.created, updated: r.t, thumb: old ? old.thumb : "", data: r.data });
        window.cadRecovered = r.name;
      }
      localStorage.removeItem(RESCUE);
    } catch (e) {}
  }

  recover().then(() => {
    showHome();
    if (window.cadRecovered) {
      const n = document.createElement("div");
      n.textContent = "Recovered \u201c" + window.cadRecovered + "\u201d from your last session";
      n.style.cssText = "display:inline-block;margin-top:18px;padding:8px 16px;border-radius:16px;background:rgba(61,220,132,.16);border:1px solid rgba(61,220,132,.5);color:#bff5d6;font-size:14px";
      tag.after(n);
    }
  });
})();
