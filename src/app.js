const view = document.getElementById("view");
const hint = document.getElementById("hint");
const fileInput = document.getElementById("file");
const measure = document.getElementById("measure");
function showMeasure(t) {
  measure.textContent = t;
  measure.style.display = "block";
}
function hideMeasure() {
  measure.style.display = "none";
}
// One scene unit equals 10 mm. Units cycle mm, cm, in.
const UNITS = [
  { name: "mm", perUnit: 10 },
  { name: "cm", perUnit: 1 },
  { name: "in", perUnit: 0.3937008 }
];
let unitIndex = 0; // start in millimeters
function toDisplay(sceneVal) {
  return (
    sceneVal *
    1 *
    (UNITS[unitIndex].name === "mm"
      ? 10
      : UNITS[unitIndex].name === "cm"
        ? 1
        : 0.3937008)
  );
}
function toScene(displayVal) {
  return (
    displayVal /
    (UNITS[unitIndex].name === "mm"
      ? 10
      : UNITS[unitIndex].name === "cm"
        ? 1
        : 0.3937008)
  );
}
function fmt(n) {
  const v = toDisplay(n);
  return (Math.round(v * 100) / 100).toString() + " " + UNITS[unitIndex].name;
}
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c1f26);
const camera = new THREE.PerspectiveCamera(
  50,
  innerWidth / innerHeight,
  0.1,
  1000
);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
view.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(5, 10, 7);
scene.add(sun);
scene.add(new THREE.GridHelper(40, 40, 0x4a5568, 0x2d3340));

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshBasicMaterial({ visible: false })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

let yaw = 0.7,
  pitch = 0.6,
  dist = 18;
function updateCamera() {
  camera.position.set(
    dist * Math.cos(pitch) * Math.sin(yaw),
    dist * Math.sin(pitch),
    dist * Math.cos(pitch) * Math.cos(yaw)
  );
  camera.lookAt(0, 0, 0);
}
updateCamera();

const ICONS = {
  select: '<svg viewBox="0 0 24 24"><path d="M5 3l14 7-6 2-2 6z"/></svg>',
  line: '<svg viewBox="0 0 24 24"><path d="M5 19L19 5"/><circle cx="5" cy="19" r="1.6"/><circle cx="19" cy="5" r="1.6"/></svg>',
  rect: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="1.5"/></svg>',
  circle: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>',
  move: '<svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg>',
  rotate:
    '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v5h-5"/></svg>',
  chamfer: '<svg viewBox="0 0 24 24"><path d="M5 19V9l4-4h10v14z"/></svg>',
  fillet:
    '<svg viewBox="0 0 24 24"><path d="M5 19V11a6 6 0 0 1 6-6h8v14z"/></svg>',
  cut: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="4.5" stroke-dasharray="2.5 2"/></svg>',
  split:
    '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="1.5"/><path d="M12 3v18" stroke-dasharray="2 2.5"/></svg>',
  align:
    '<svg viewBox="0 0 24 24"><path d="M4 4v16"/><rect x="7" y="6" width="12" height="4" rx="1"/><rect x="7" y="14" width="7" height="4" rx="1"/></svg>',
  under:
    '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  snap: '<svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="3.5"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12" transform="translate(0 -5)"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 0 0 0 12" transform="translate(0 -5)"/></svg>',
  units:
    '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/></svg>',
  export:
    '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 11l5 5 5-5"/><path d="M5 20h14"/></svg>',
  import:
    '<svg viewBox="0 0 24 24"><path d="M12 16V5M7 9l5-5 5 5"/><path d="M5 20h14"/></svg>',
  clear:
    '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>'
};
const tools = [
  ["select", "\u261d\ufe0f", "Select"],
  ["line", "\u2571", "Line"],
  ["rect", "\u25ad", "Square"],
  ["circle", "\u25ef", "Circle"],
  ["move", "\u2725", "Move"],
  ["rotate", "\u21bb", "Rotate"],
  ["chamfer", "\u25e3", "Chamfer"],
  ["fillet", "\u25e0", "Fillet"],
  ["split", "\u2702\ufe0f", "Split"],
  ["cut", "\u2296", "Cut"],
  ["align", "\u2630", "Align"],
  ["undo", "\u21a9", "Undo"],
  ["redo", "\u21aa", "Redo"],
  ["under", "👁", "Below"],
  ["snap", "🧲", "Snap"],
  ["units", "📏", "mm"],
  ["export", "\u2b07\ufe0f", "STL Out"],
  ["import", "\u2b06\ufe0f", "STL In"],
  ["clear", "\ud83d\uddd1", "Clear"]
];
let tool = "select";
const bar = document.getElementById("bar");
const topbar = document.getElementById("topbar");
const buttons = {};
tools.forEach(([id, icon, label]) => {
  const b = document.createElement("button");
  b.className = "bubble";
  b.innerHTML = (ICONS[id] || "") + "<span>" + label + "</span>";
  b.addEventListener("click", () => chooseTool(id));
  buttons[id] = b;
});

// ---- Grouped toolbar: tap a group bubble and its tools fly out to the right ----
const GROUPS = [
  { id: "g_pick", label: "Select", ids: ["select"] },
  { id: "g_draw", label: "Draw", ids: ["line", "rect", "circle"] },
  { id: "g_move", label: "Place", ids: ["move", "rotate", "align"] },
  {
    id: "g_shape",
    label: "Shape",
    ids: ["chamfer", "fillet", "split", "cut"]
  }
];
const flyouts = [];
function closeFlyouts() {
  flyouts.forEach((f) => f.classList.remove("open"));
}
GROUPS.forEach((g) => {
  if (g.ids.length === 1) {
    bar.appendChild(buttons[g.ids[0]]);
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "grp";
  const head = document.createElement("button");
  head.className = "bubble";
  const setHead = (toolId) => {
    head.innerHTML = (ICONS[toolId] || "") + "<span>" + g.label + "</span>";
    head.dataset.cur = toolId;
  };
  setHead(g.ids[0]);
  const fly = document.createElement("div");
  fly.className = "flyout";
  document.body.appendChild(fly);
  flyouts.push(fly);
  g.ids.forEach((tid) => {
    const b = buttons[tid];
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setHead(tid);
      head.classList.add("active");
      closeFlyouts();
    });
    fly.appendChild(b);
  });
  head.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const wasOpen = fly.classList.contains("open");
    closeFlyouts();
    if (!wasOpen) {
      const r = head.getBoundingClientRect();
      fly.style.left = r.right + 10 + "px";
      fly.style.top = Math.max(8, r.top - 4) + "px";
      fly.classList.add("open");
    }
  });
  g.head = head;
  wrap.appendChild(head);
  bar.appendChild(wrap);
});
document.addEventListener("pointerdown", (ev) => {
  if (!ev.target.closest(".flyout") && !ev.target.closest(".grp"))
    closeFlyouts();
});
["undo", "redo", "units", "export", "import", "clear"].forEach((id) => {
  if (buttons[id]) topbar.appendChild(buttons[id]);
});
function syncGroupHeads(activeTool) {
  GROUPS.forEach((g) => {
    if (!g.head) return;
    const inGroup = g.ids.indexOf(activeTool) >= 0;
    g.head.classList.toggle("active", inGroup);
  });
}
function chooseTool(id) {
  if (id === "undo") {
    undo();
    return;
  }
  if (id === "redo") {
    redo();
    return;
  }
  if (id === "clear") {
    clearAll();
    return;
  }
  if (id === "under") {
    pitch = pitch > 0 ? -0.6 : 0.6;
    updateCamera();
    hint.textContent =
      pitch < 0
        ? "Looking from underneath. Drag up to come back."
        : "Back on top";
    return;
  }
  if (id === "snap") {
    snapOn = !snapOn;
    buttons.snap.classList.toggle("active", snapOn);
    hint.textContent = snapOn
      ? "Snap on: lines lock to horizontal or vertical when nearly straight."
      : "Snap off";
    return;
  }
  if (id === "units") {
    unitIndex = (unitIndex + 1) % UNITS.length;
    buttons.units.lastChild.textContent = UNITS[unitIndex].name;
    hint.textContent = "Units: " + UNITS[unitIndex].name;
    fillPanel();
    return;
  }
  if (id === "export") {
    exportSTL();
    return;
  }
  if (id === "import") {
    fileInput.click();
    return;
  }
  tool = id;
  Object.keys(buttons).forEach((k) =>
    buttons[k].classList.toggle("active", k === id)
  );
  syncGroupHeads(id);
  closeFlyouts();
  const tips = {
    select:
      "Tap a shape to get the arrow and exact sizes. Tap a line to set its length and units. Drag empty space to rotate.",
    line: "Drag on the grid to draw a line.",
    rect: "Drag on the grid to draw a square or rectangle.",
    circle: "Drag from the center outward to draw a circle.",
    move: "Drag a shape to slide it across the grid.",
    rotate: "Drag left or right on a shape to spin it.",
    chamfer:
      "Tap a shape to cut its top edge at an angle. Drag up or down for size.",
    fillet: "Tap a shape to round its top edge. Drag up or down for size.",
    split: "Tap a shape to cut it in half across the middle.",
    cut: "Tap the shape that makes the hole, then tap the solid to cut it. Works on boxes, cylinders and sketch shapes.",
    align: "Tap one shape, then tap a second shape to line the first up with it."
  };
  hint.textContent = tips[id];
  hideArrow();
}
let snapOn = false;
let cutTool = null;
let equalFrom = null;
const shapes = [];
const lines = [];
const undoStack = [];
const redoStack = [];
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function setRay(e) {
  ndc.x = (e.clientX / innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
}
function snapEnd(a, p) {
  if (!snapOn || !a) return p;
  const dx = Math.abs(p.x - a.x),
    dz = Math.abs(p.z - a.z);
  const len = Math.hypot(dx, dz) || 1;
  const out = p.clone();
  if (dz / len < 0.2) out.z = a.z;
  else if (dx / len < 0.2) out.x = a.x;
  return out;
}
function groundPoint(e) {
  setRay(e);
  const hit = raycaster.intersectObject(ground)[0];
  if (!hit) return null;
  const p = hit.point;
  return new THREE.Vector3(
    Math.round(p.x * 2) / 2,
    0,
    Math.round(p.z * 2) / 2
  );
}

const colors = [0x4f9dff, 0xff7a59, 0x59d98e, 0xffd166, 0xb38bff];
let colorIndex = 0;
function nextColor() {
  return colors[colorIndex++ % colors.length];
}

// ---- history: every action is a small object with do/undo ----
let objCounter = 0;
function addToScene(obj) {
  scene.add(obj);
  if (!obj.userData.name) {
    objCounter++;
    obj.userData.name =
      (obj.userData.isLine
        ? "Line "
        : obj.userData.fromLines
          ? "Sketch shape "
          : obj.userData.imported
            ? "Imported "
            : obj.userData.cutResult
              ? "Cut result "
              : "Shape ") + objCounter;
  }
  if (obj.userData.isLine) {
    if (lines.indexOf(obj) < 0) lines.push(obj);
  } else if (shapes.indexOf(obj) < 0) shapes.push(obj);
  refreshList();
}
function removeFromScene(obj) {
  scene.remove(obj);
  let i = shapes.indexOf(obj);
  if (i >= 0) shapes.splice(i, 1);
  i = lines.indexOf(obj);
  if (i >= 0) lines.splice(i, 1);
  if (selected === obj) hideArrow();
  if (selLine === obj) hideLinePanel();
  refreshList();
}

// ---- Objects list: tap a row to select, rename, hide or delete ----
const objlist = document.getElementById("objlist");
let renaming = null;
function refreshList() {
  if (!objlist) return;
  objlist.innerHTML = "";
  [...shapes, ...lines].forEach((o) => {
    const row = document.createElement("div");
    row.className =
      "item" +
      (selected === o || selLine === o ? " sel" : "") +
      (o.visible === false ? " hidden" : "");
    if (renaming === o) {
      const inp = document.createElement("input");
      inp.value = o.userData.name;
      const done = () => {
        o.userData.name = inp.value || o.userData.name;
        renaming = null;
        refreshList();
      };
      inp.addEventListener("blur", done);
      inp.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") inp.blur();
      });
      row.appendChild(inp);
      setTimeout(() => inp.focus(), 0);
    } else {
      const nm = document.createElement("div");
      nm.className = "name";
      nm.textContent = o.userData.name;
      nm.addEventListener("click", () => selectFromList(o));
      nm.addEventListener("dblclick", () => {
        renaming = o;
        refreshList();
      });
      row.appendChild(nm);
    }
    const ren = document.createElement("button");
    ren.textContent = "Name";
    ren.addEventListener("click", () => {
      renaming = o;
      refreshList();
    });
    const hid = document.createElement("button");
    hid.textContent = o.visible === false ? "Show" : "Hide";
    hid.addEventListener("click", () => {
      o.visible = o.visible === false;
      if (o.visible === false && selected === o) hideArrow();
      refreshList();
    });
    const del = document.createElement("button");
    del.textContent = "Del";
    del.addEventListener("click", () => {
      perform({
        redo() {
          removeFromScene(o);
        },
        undo() {
          addToScene(o);
        }
      });
    });
    row.append(ren, hid, del);
    objlist.appendChild(row);
  });
}
function selectFromList(o) {
  if (o.visible === false) return;
  hideArrow();
  if (o.userData.isLine) {
    showLinePanel(o);
  } else {
    showArrow(o);
  }
  refreshList();
}
document.getElementById("showall").addEventListener("click", () => {
  [...shapes, ...lines].forEach((o) => (o.visible = true));
  refreshList();
});
function perform(action) {
  action.redo();
  undoStack.push(action);
  redoStack.length = 0;
}
function undo() {
  const a = undoStack.pop();
  if (!a) return;
  a.undo();
  redoStack.push(a);
  hideArrow();
}
function redo() {
  const a = redoStack.pop();
  if (!a) return;
  a.redo();
  undoStack.push(a);
  hideArrow();
}
function clearAll() {
  const items = [...shapes, ...lines];
  if (!items.length) return;
  perform({
    redo() {
      items.forEach(removeFromScene);
    },
    undo() {
      items.forEach(addToScene);
    }
  });
  hideArrow();
}

function setHeight(mesh, h) {
  mesh.userData.height = h;
  const s = Math.max(0.01, Math.abs(h));
  mesh.scale.y = s;
  mesh.position.y = h / 2;
}

function makeShape(kind, a, b) {
  let geo;
  if (kind === "rect") {
    const w = Math.max(0.5, Math.abs(b.x - a.x)),
      d = Math.max(0.5, Math.abs(b.z - a.z));
    geo = new THREE.BoxGeometry(w, 1, d);
  } else {
    const r = Math.max(0.5, a.distanceTo(b));
    geo = new THREE.CylinderGeometry(r, r, 1, 48);
  }
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: nextColor(),
      metalness: 0.1,
      roughness: 0.6
    })
  );
  const cx = kind === "rect" ? (a.x + b.x) / 2 : a.x;
  const cz = kind === "rect" ? (a.z + b.z) / 2 : a.z;
  mesh.position.set(cx, 0.005, cz);
  mesh.scale.y = 0.01;
  mesh.userData.height = 0;
  mesh.userData.edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0xffffff })
  );
  mesh.add(mesh.userData.edges);
  perform({
    redo() {
      addToScene(mesh);
    },
    undo() {
      removeFromScene(mesh);
    }
  });
}
function makeLine(a, b) {
  const g = new THREE.BufferGeometry().setFromPoints([
    a.clone().setY(0.02),
    b.clone().setY(0.02)
  ]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff }));
  l.userData.isLine = true;
  l.userData.a = a.clone().setY(0.02);
  l.userData.b = b.clone().setY(0.02);
  perform({
    redo() {
      addToScene(l);
    },
    undo() {
      removeFromScene(l);
    }
  });
}

let preview = null;
const arrow = new THREE.Group();
const shaft = new THREE.Mesh(
  new THREE.CylinderGeometry(0.18, 0.18, 1.6, 12),
  new THREE.MeshBasicMaterial({ color: 0x3ddc84 })
);
const head = new THREE.Mesh(
  new THREE.ConeGeometry(0.55, 0.9, 16),
  new THREE.MeshBasicMaterial({ color: 0x3ddc84 })
);
const downHead = new THREE.Mesh(
  new THREE.ConeGeometry(0.55, 0.9, 16),
  new THREE.MeshBasicMaterial({ color: 0xff6b6b })
);
shaft.position.y = 0.8;
head.position.y = 2.05;
downHead.position.y = -0.45;
downHead.rotation.x = Math.PI;
arrow.add(shaft, head, downHead);
arrow.visible = false;
scene.add(arrow);
let selected = null;
const panel = document.getElementById("panel");
const fw = document.getElementById("fw"),
  fd = document.getElementById("fd"),
  fh = document.getElementById("fh");
function baseSize(mesh) {
  const p = mesh.geometry.parameters || {};
  if (mesh.userData.imported) {
    mesh.geometry.computeBoundingBox();
    const s = new THREE.Vector3();
    mesh.geometry.boundingBox.getSize(s);
    return { w: s.x, d: s.z, h: s.y };
  }
  if (p.width !== undefined) return { w: p.width, d: p.depth, h: 1 };
  return { w: p.radiusTop * 2, d: p.radiusTop * 2, h: 1 };
}
function fillPanel() {
  document.getElementById("pu").textContent = UNITS[unitIndex].name;
  if (!selected) return;
  const b = baseSize(selected);
  const r = (v) => Math.round(toDisplay(v) * 100) / 100;
  fw.value = r(b.w * selected.scale.x);
  fd.value = r(b.d * selected.scale.z);
  fh.value = r(Math.abs(selected.userData.height));
}
// Live editing: the shape resizes as you type. One undo step per editing session.
let sizeEditStart = null;
function applySize(m, s) {
  m.scale.x = s.sx;
  m.scale.z = s.sz;
  setHeight(m, s.h);
  if (selected === m)
    arrow.position.set(
      m.position.x,
      Math.max(m.userData.height, 0),
      m.position.z
    );
}
function liveSize() {
  if (!selected) return;
  const m = selected,
    b = baseSize(m);
  if (!sizeEditStart || sizeEditStart.m !== m)
    sizeEditStart = {
      m: m,
      sx: m.scale.x,
      sz: m.scale.z,
      h: m.userData.height
    };
  const w = toScene(parseFloat(fw.value)),
    d = toScene(parseFloat(fd.value)),
    h = toScene(parseFloat(fh.value));
  applySize(m, {
    sx: w > 0 ? w / b.w : m.scale.x,
    sz: d > 0 ? d / b.d : m.scale.z,
    h: isNaN(h) ? m.userData.height : m.userData.height < 0 ? -h : h
  });
}
[fw, fd, fh].forEach((inp) => {
  inp.addEventListener("input", liveSize);
  inp.addEventListener("change", () => {
    if (!sizeEditStart) return;
    const m = sizeEditStart.m,
      from = {
        sx: sizeEditStart.sx,
        sz: sizeEditStart.sz,
        h: sizeEditStart.h
      };
    const to = { sx: m.scale.x, sz: m.scale.z, h: m.userData.height };
    undoStack.push({
      redo() {
        applySize(m, to);
      },
      undo() {
        applySize(m, from);
      }
    });
    redoStack.length = 0;
    sizeEditStart = null;
  });
});
// ---- Highlight and action menu for the selected shape ----
const actions = document.getElementById("actions");
const actname = document.getElementById("actname");
let glowBox = null;
function setGlow(mesh) {
  if (glowBox) {
    scene.remove(glowBox);
    glowBox = null;
  }
  if (!mesh) return;
  glowBox = new THREE.BoxHelper(mesh, 0x3ddc84);
  glowBox.material.linewidth = 2;
  scene.add(glowBox);
}
function showActions(mesh) {
  actname.textContent = mesh.userData.name || "Shape";
  actions.style.display = "block";
  actions.querySelector('[data-act="hide"]').textContent =
    mesh.visible === false ? "Show" : "Hide";
}
function hideActions() {
  actions.style.display = "none";
  setGlow(null);
}
actions.querySelectorAll("button").forEach((b) =>
  b.addEventListener("click", () => {
    const m = selected;
    if (!m) return;
    const act = b.getAttribute("data-act");
    if (act === "size") {
      panel.style.display = "block";
      fillPanel();
      hint.textContent =
        "Type new width, depth or height on the right. It updates as you type.";
      return;
    }
    if (
      act === "move" ||
      act === "rotate" ||
      act === "chamfer" ||
      act === "fillet" ||
      act === "split"
    ) {
      const keep = m;
      chooseTool(act);
      selected = keep;
      showArrow(keep);
      if (act === "split") {
        splitShape(keep);
      }
      return;
    }
    if (act === "cut") {
      const keep = m;
      chooseTool("cut");
      cutTool = keep;
      showMeasure("Now tap the solid to cut");
      return;
    }
    if (act === "rename") {
      renaming = m;
      refreshList();
      hint.textContent =
        "Type a new name in the Objects list, then press Enter.";
      return;
    }
    if (act === "hide") {
      m.visible = false;
      hideArrow();
      refreshList();
      return;
    }
    if (act === "delete") {
      perform({
        redo() {
          removeFromScene(m);
        },
        undo() {
          addToScene(m);
        }
      });
      return;
    }
  })
);
function showArrow(mesh) {
  selected = mesh;
  setGlow(mesh);
  showActions(mesh);
  setTimeout(refreshList, 0);
  fillPanel();
  arrow.visible = true;
  arrow.position.set(
    mesh.position.x,
    Math.max(mesh.userData.height, 0),
    mesh.position.z
  );
}
function hideArrow() {
  arrow.visible = false;
  selected = null;
  panel.style.display = "none";
  hideLinePanel();
  hideActions();
}

// ---- Line editing: tap a line, pick a unit, type an exact length ----
const linePanel = document.getElementById("linepanel");
const ll = document.getElementById("ll"),
  lu = document.getElementById("lu");
let selLine = null;
let lineHilite = null;
function lineLen(l) {
  return l.userData.a.distanceTo(l.userData.b);
}
function showLinePanel(l) {
  selLine = l;
  lu.value = String(unitIndex);
  ll.value = Math.round(toDisplay(lineLen(l)) * 100) / 100;
  linePanel.style.display = "block";
  setTimeout(placeHandle, 0);
  if (lineHilite) lineHilite.material.color.set(0xffffff);
  lineHilite = l;
  l.material.color.set(0x3ddc84);
  ll.disabled = !!l.userData.locked;
  document.getElementById("cLock").classList.toggle("on", !!l.userData.locked);
}
function hideLinePanel() {
  linePanel.style.display = "none";
  if (lineHilite) lineHilite.material.color.set(0xffffff);
  lineHilite = null;
  selLine = null;
}
lu.addEventListener("change", () => {
  unitIndex = parseInt(lu.value, 10);
  if (buttons.units)
    buttons.units.lastChild.textContent = UNITS[unitIndex].name;
  if (selLine) ll.value = Math.round(toDisplay(lineLen(selLine)) * 100) / 100;
  hint.textContent = "Units: " + UNITS[unitIndex].name;
});
// Live editing: the line changes as you type. One undo step per editing session.
let lineEditStart = null;
function setLineEnds(l, A, B) {
  l.userData.a = A.clone();
  l.userData.b = B.clone();
  l.geometry.setFromPoints([A, B]);
  l.geometry.computeBoundingSphere();
}
ll.addEventListener("input", () => {
  if (!selLine || selLine.userData.locked) return;
  const target = toScene(parseFloat(ll.value));
  if (!(target > 0)) return;
  const l = selLine;
  if (!lineEditStart || lineEditStart.line !== l)
    lineEditStart = {
      line: l,
      a: l.userData.a.clone(),
      b: l.userData.b.clone()
    };
  const dir = lineEditStart.b.clone().sub(lineEditStart.a).normalize();
  setLineEnds(
    l,
    lineEditStart.a,
    lineEditStart.a.clone().add(dir.multiplyScalar(target))
  );
});
ll.addEventListener("change", () => {
  if (!lineEditStart || !selLine) return;
  const l = lineEditStart.line,
    oa = lineEditStart.a,
    ob = lineEditStart.b;
  const na = l.userData.a.clone(),
    nb = l.userData.b.clone();
  undoStack.push({
    redo() {
      setLineEnds(l, na, nb);
    },
    undo() {
      setLineEnds(l, oa, ob);
    }
  });
  redoStack.length = 0;
  lineEditStart = null;
});
function pickLine(e) {
  setRay(e);
  raycaster.params.Line = { threshold: 0.35 };
  const hit = raycaster.intersectObjects(lines, false)[0];
  return hit ? hit.object : null;
}

let moveObj = null,
  moveFrom = null,
  moveGrab = null,
  bevelObj = null,
  bevelStartY = 0,
  bevelSize = 0,
  alignFirst = null;
let mode = null,
  start = null,
  last = null,
  dragStartH = 0,
  dragStartY = 0;
const pointers = new Map();
let pinchStart = 0,
  pinchDist = 0;

// ---- End handle: a circle at the end of the selected line you can drag to stretch it ----
const endHandle = new THREE.Mesh(
  new THREE.SphereGeometry(0.28, 20, 14),
  new THREE.MeshBasicMaterial({ color: 0x3ddc84, depthTest: false })
);
endHandle.renderOrder = 10;
endHandle.visible = false;
scene.add(endHandle);
let stretchLine = null,
  stretchStart = null;
function placeHandle() {
  if (selLine) {
    endHandle.position.copy(selLine.userData.b);
    endHandle.visible = true;
  } else endHandle.visible = false;
}
function groundRaw(e) {
  setRay(e);
  const hit = raycaster.intersectObject(ground)[0];
  return hit ? hit.point.clone() : null;
}

renderer.domElement.addEventListener("pointerdown", (e) => {
  renderer.domElement.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [p, q] = [...pointers.values()];
    pinchStart = Math.hypot(p.x - q.x, p.y - q.y);
    pinchDist = dist;
    mode = "pinch";
    return;
  }
  setRay(e);
  if (
    endHandle.visible &&
    selLine &&
    !selLine.userData.locked &&
    raycaster.intersectObject(endHandle, false)[0]
  ) {
    stretchLine = selLine;
    stretchStart = {
      a: selLine.userData.a.clone(),
      b: selLine.userData.b.clone()
    };
    mode = "stretch";
    showMeasure("Length: " + fmt(lineLen(selLine)));
    return;
  }
  if (arrow.visible) {
    const hit = raycaster.intersectObject(arrow, true)[0];
    if (hit && selected) {
      mode = "arrow";
      dragStartY = e.clientY;
      dragStartH = selected.userData.height;
      showMeasure("Height: " + fmt(dragStartH));
      return;
    }
  }
  if (tool === "line" || tool === "rect" || tool === "circle") {
    start = groundPoint(e);
    if (start) {
      mode = "draw";
      return;
    }
  }
  if (tool === "select") {
    const hit = raycaster.intersectObjects(
      shapes.filter((s) => s.visible !== false),
      false
    )[0];
    if (hit) {
      showArrow(hit.object);
      mode = "tap";
      return;
    }
    const ln = pickLine(e);
    if (ln && equalFrom && ln !== equalFrom) {
      applyEqual(equalFrom, ln);
      equalFrom = null;
      document.getElementById("cEqual").classList.remove("on");
      showLinePanel(ln);
      mode = "tap";
      return;
    }
    if (ln) {
      hideArrow();
      showLinePanel(ln);
      mode = "tap";
      return;
    }
    hideArrow();
  }
  if (tool === "move" || tool === "rotate") {
    const hit = raycaster.intersectObjects(
      shapes.filter((s) => s.visible !== false),
      false
    )[0];
    if (hit) {
      const m = hit.object;
      showArrow(m);
      mode = tool === "move" ? "move" : "spin";
      moveObj = m;
      moveFrom = { x: m.position.x, z: m.position.z, ry: m.rotation.y };
      last = { x: e.clientX, y: e.clientY };
      if (tool === "move") {
        const gp = groundPoint(e);
        moveGrab = gp
          ? { x: gp.x - m.position.x, z: gp.z - m.position.z }
          : { x: 0, z: 0 };
      }
      return;
    }
  }
  if (tool === "chamfer" || tool === "fillet") {
    const hit = raycaster.intersectObjects(shapes, false)[0];
    if (hit) {
      showArrow(hit.object);
      bevelObj = hit.object;
      bevelStartY = e.clientY;
      bevelSize = bevelObj.userData.bevel || 0;
      mode = "bevel";
      return;
    }
  }
  if (tool === "split") {
    const hit = raycaster.intersectObjects(shapes, false)[0];
    if (hit) {
      splitShape(hit.object);
      return;
    }
  }
  if (tool === "cut") {
    const hit = raycaster.intersectObjects(shapes, false)[0];
    if (hit) {
      if (!cutTool) {
        cutTool = hit.object;
        showMeasure("Now tap the solid to cut");
      } else if (hit.object !== cutTool) {
        cutShapes(cutTool, hit.object);
        cutTool = null;
        hideMeasure();
      }
      return;
    }
  }
  if (tool === "align") {
    const hit = raycaster.intersectObjects(shapes, false)[0];
    if (hit) {
      if (!alignFirst) {
        alignFirst = hit.object;
        showMeasure("Now tap the shape to align to");
      } else if (hit.object !== alignFirst) {
        alignShapes(alignFirst, hit.object);
        alignFirst = null;
        hideMeasure();
      }
      return;
    }
  }
  // Any other tool: tapping a shape still highlights it and opens the edit menu.
  if (tool !== "line" && tool !== "rect" && tool !== "circle") {
    const anyHit = raycaster.intersectObjects(
      shapes.filter((s) => s.visible !== false),
      false
    )[0];
    if (
      anyHit &&
      (tool === "chamfer" ||
        tool === "fillet" ||
        tool === "split" ||
        tool === "cut" ||
        tool === "align")
    ) {
      showArrow(anyHit.object);
    }
  }
  mode = "orbit";
  last = { x: e.clientX, y: e.clientY };
});

// ---- Drag any floating panel by its title ----
function makeDraggable(el, handle) {
  let sx = 0,
    sy = 0,
    ox = 0,
    oy = 0,
    dragging = false;
  handle.style.cursor = "grab";
  handle.style.touchAction = "none";
  handle.addEventListener("pointerdown", (ev) => {
    dragging = true;
    const r = el.getBoundingClientRect();
    el.style.left = r.left + "px";
    el.style.top = r.top + "px";
    el.style.right = "auto";
    el.style.bottom = "auto";
    sx = ev.clientX;
    sy = ev.clientY;
    ox = r.left;
    oy = r.top;
    handle.setPointerCapture(ev.pointerId);
    ev.stopPropagation();
  });
  handle.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    const nx = Math.min(innerWidth - 60, Math.max(0, ox + ev.clientX - sx));
    const ny = Math.min(innerHeight - 40, Math.max(0, oy + ev.clientY - sy));
    el.style.left = nx + "px";
    el.style.top = ny + "px";
  });
  const stop = () => {
    dragging = false;
  };
  handle.addEventListener("pointerup", stop);
  handle.addEventListener("pointercancel", stop);
}
makeDraggable(
  document.getElementById("panel"),
  document.querySelector("#panel h4")
);
makeDraggable(
  document.getElementById("objs"),
  document.querySelector("#objs .head span")
);
makeDraggable(
  document.getElementById("actions"),
  document.getElementById("actname")
);
makeDraggable(
  document.getElementById("linepanel"),
  document.querySelector("#linepanel h4")
);

// ---- Constraints on a selected line ----
function constrainLine(kind) {
  if (!selLine) return;
  const l = selLine;
  if (l.userData.locked && kind !== "lock") {
    hint.textContent = "This line is locked. Tap Lock length again to unlock.";
    return;
  }
  const A = l.userData.a.clone(),
    B = l.userData.b.clone();
  let nb = B.clone();
  if (kind === "horiz") nb.z = A.z;
  if (kind === "vert") nb.x = A.x;
  if (kind === "horiz" || kind === "vert") {
    perform({
      redo() {
        setLineEnds(l, A, nb);
      },
      undo() {
        setLineEnds(l, A, B);
      }
    });
    ll.value = Math.round(toDisplay(lineLen(l)) * 100) / 100;
    hint.textContent =
      kind === "horiz" ? "Line is now horizontal" : "Line is now vertical";
  }
  if (kind === "lock") {
    l.userData.locked = !l.userData.locked;
    ll.disabled = l.userData.locked;
    document
      .getElementById("cLock")
      .classList.toggle("on", !!l.userData.locked);
    hint.textContent = l.userData.locked ? "Length locked" : "Length unlocked";
  }
  if (kind === "equal") {
    equalFrom = l;
    document.getElementById("cEqual").classList.add("on");
    hint.textContent = "Now tap the line that should match this length.";
  }
}
document.getElementById("cSnap").addEventListener("click", () => {
  snapOn = !snapOn;
  document.getElementById("cSnap").classList.toggle("on", snapOn);
  hint.textContent = snapOn
    ? "Snap on: new lines lock to horizontal or vertical when nearly straight."
    : "Snap off";
});
document
  .getElementById("cHoriz")
  .addEventListener("click", () => constrainLine("horiz"));
document
  .getElementById("cVert")
  .addEventListener("click", () => constrainLine("vert"));
document
  .getElementById("cEqual")
  .addEventListener("click", () => constrainLine("equal"));
document
  .getElementById("cLock")
  .addEventListener("click", () => constrainLine("lock"));
function applyEqual(source, target) {
  if (target.userData.locked) {
    hint.textContent = "That line is locked.";
    return;
  }
  const len = lineLen(source);
  const A = target.userData.a.clone(),
    B = target.userData.b.clone();
  const dir = B.clone().sub(A).normalize();
  const nb = A.clone().add(dir.multiplyScalar(len));
  perform({
    redo() {
      setLineEnds(target, A, nb);
    },
    undo() {
      setLineEnds(target, A, B);
    }
  });
  hint.textContent = "Lines are now equal length";
}
renderer.domElement.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (mode === "pinch" && pointers.size >= 2) {
    const [p, q] = [...pointers.values()];
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    dist = Math.min(60, Math.max(4, (pinchDist * pinchStart) / d));
    updateCamera();
    return;
  }
  if (mode === "stretch" && stretchLine) {
    const gp = groundRaw(e);
    if (gp) {
      const A = stretchStart.a;
      const dir = stretchStart.b.clone().sub(A).normalize();
      const along = Math.max(0.2, gp.clone().sub(A).dot(dir));
      const snapped = Math.round(along * 4) / 4;
      const nb = A.clone().add(dir.multiplyScalar(snapped));
      setLineEnds(stretchLine, A, nb);
      endHandle.position.copy(nb);
      ll.value = Math.round(toDisplay(snapped) * 100) / 100;
      showMeasure("Length: " + fmt(snapped));
    }
    return;
  }
  if (mode === "move" && moveObj) {
    const gp = groundPoint(e);
    if (gp) {
      moveObj.position.x = gp.x - moveGrab.x;
      moveObj.position.z = gp.z - moveGrab.z;
      showArrow(moveObj);
      showMeasure(
        "X: " + fmt(moveObj.position.x) + "   Z: " + fmt(moveObj.position.z)
      );
    }
  } else if (mode === "spin" && moveObj) {
    moveObj.rotation.y = moveFrom.ry + (e.clientX - last.x) * 0.02;
    showMeasure(
      "Angle: " +
        Math.round(
          ((((moveObj.rotation.y * 180) / Math.PI) % 360) + 360) % 360
        ) +
        " deg"
    );
  } else if (mode === "bevel" && bevelObj) {
    bevelSize = Math.max(
      0,
      Math.min(
        2,
        (bevelObj.userData.bevel || 0) + (bevelStartY - e.clientY) * 0.01
      )
    );
    applyBevel(bevelObj, tool, bevelSize, true);
    showMeasure(
      (tool === "chamfer" ? "Chamfer: " : "Fillet: ") + fmt(bevelSize)
    );
  } else if (mode === "orbit") {
    yaw -= (e.clientX - last.x) * 0.008;
    pitch = Math.min(1.5, Math.max(-1.5, pitch + (e.clientY - last.y) * 0.008));
    last = { x: e.clientX, y: e.clientY };
    updateCamera();
  } else if (mode === "arrow" && selected) {
    let h = dragStartH + (dragStartY - e.clientY) * 0.03;
    if (dragStartH >= 0) h = Math.max(h, 0); // pulling an upward shape never goes below the plate
    setHeight(selected, Math.round(h * 4) / 4);
    arrow.position.y = Math.max(selected.userData.height, 0);
    showMeasure("Height: " + fmt(selected.userData.height));
    fh.value =
      Math.round(toDisplay(Math.abs(selected.userData.height)) * 100) / 100;
  } else if (mode === "draw") {
    let p = groundPoint(e);
    if (!p) return;
    if (tool === "line") p = snapEnd(start, p);
    if (preview) {
      scene.remove(preview);
      preview = null;
    }
    if (tool === "line") showMeasure("Length: " + fmt(start.distanceTo(p)));
    else if (tool === "rect")
      showMeasure(
        "Width: " +
          fmt(Math.abs(p.x - start.x)) +
          "   Depth: " +
          fmt(Math.abs(p.z - start.z))
      );
    else
      showMeasure(
        "Radius: " +
          fmt(start.distanceTo(p)) +
          "   Diameter: " +
          fmt(start.distanceTo(p) * 2)
      );
    if (tool === "line") {
      const g = new THREE.BufferGeometry().setFromPoints([
        start.clone().setY(0.02),
        p.clone().setY(0.02)
      ]);
      preview = new THREE.Line(
        g,
        new THREE.LineBasicMaterial({ color: 0x2f8cff })
      );
    } else if (tool === "rect") {
      const w = Math.max(0.1, Math.abs(p.x - start.x)),
        d = Math.max(0.1, Math.abs(p.z - start.z));
      preview = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshBasicMaterial({
          color: 0x2f8cff,
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide
        })
      );
      preview.rotation.x = -Math.PI / 2;
      preview.position.set((p.x + start.x) / 2, 0.02, (p.z + start.z) / 2);
    } else {
      const r = Math.max(0.1, start.distanceTo(p));
      preview = new THREE.Mesh(
        new THREE.CircleGeometry(r, 48),
        new THREE.MeshBasicMaterial({
          color: 0x2f8cff,
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide
        })
      );
      preview.rotation.x = -Math.PI / 2;
      preview.position.set(start.x, 0.02, start.z);
    }
    scene.add(preview);
  }
});
function endPointer(e) {
  if (mode === "stretch" && stretchLine) {
    const l = stretchLine,
      oa = stretchStart.a,
      ob = stretchStart.b,
      na = l.userData.a.clone(),
      nb = l.userData.b.clone();
    if (!ob.equals(nb)) {
      undoStack.push({
        redo() {
          setLineEnds(l, na, nb);
          if (selLine === l) placeHandle();
        },
        undo() {
          setLineEnds(l, oa, ob);
          if (selLine === l) placeHandle();
        }
      });
      redoStack.length = 0;
    }
    stretchLine = null;
  }
  if (mode === "draw") {
    let p = groundPoint(e);
    if (p && tool === "line") p = snapEnd(start, p);
    if (preview) {
      scene.remove(preview);
      preview = null;
    }
    if (p && start && p.distanceTo(start) > 0.1) {
      if (tool === "line") {
        makeLine(start, p);
        tryCloseLoop();
      } else makeShape(tool, start, p);
    }
  }
  if (mode === "move" && moveObj) {
    const m = moveObj,
      from = { x: moveFrom.x, z: moveFrom.z },
      to = { x: m.position.x, z: m.position.z };
    if (from.x !== to.x || from.z !== to.z) {
      undoStack.push({
        redo() {
          m.position.x = to.x;
          m.position.z = to.z;
        },
        undo() {
          m.position.x = from.x;
          m.position.z = from.z;
        }
      });
      redoStack.length = 0;
    }
    moveObj = null;
  }
  if (mode === "spin" && moveObj) {
    const m = moveObj,
      from = moveFrom.ry,
      to = m.rotation.y;
    if (from !== to) {
      undoStack.push({
        redo() {
          m.rotation.y = to;
        },
        undo() {
          m.rotation.y = from;
        }
      });
      redoStack.length = 0;
    }
    moveObj = null;
  }
  if (mode === "bevel" && bevelObj) {
    const m = bevelObj,
      b1 = m.userData.bevel || 0,
      kind = tool;
    undoStack.push({
      redo() {
        applyBevel(m, kind, b1);
      },
      undo() {
        applyBevel(m, kind, 0);
      }
    });
    redoStack.length = 0;
    bevelObj = null;
  }
  if (
    mode === "arrow" &&
    selected &&
    selected.userData.height !== dragStartH
  ) {
    const m = selected,
      from = dragStartH,
      to = m.userData.height;
    undoStack.push({
      redo() {
        setHeight(m, to);
      },
      undo() {
        setHeight(m, from);
      }
    });
    redoStack.length = 0;
  }
  hideMeasure();
  pointers.delete(e.pointerId);
  if (pointers.size < 2 && mode === "pinch") mode = null;
  else if (pointers.size === 0) mode = null;
}
renderer.domElement.addEventListener("pointerup", endPointer);
renderer.domElement.addEventListener("pointercancel", endPointer);

// ---- Closed line loops become faces you can push and pull ----
const EPS = 0.26;
function samePt(p, q) {
  return Math.abs(p.x - q.x) < EPS && Math.abs(p.z - q.z) < EPS;
}
function findLoop() {
  // Walk connected lines to find a closed loop that includes the newest line.
  const segs = lines.filter((l) => !l.userData.used);
  if (segs.length < 3) return null;
  const newest = segs[segs.length - 1];
  const path = [newest];
  const pts = [newest.userData.a.clone(), newest.userData.b.clone()];
  const used = new Set([newest]);
  let guard = 0;
  while (guard++ < 60) {
    const tail = pts[pts.length - 1];
    if (pts.length > 3 && samePt(tail, pts[0])) {
      pts.pop();
      return { path, pts };
    }
    let next = null,
      flip = false;
    for (const s of segs) {
      if (used.has(s)) continue;
      if (samePt(s.userData.a, tail)) {
        next = s;
        flip = false;
        break;
      }
      if (samePt(s.userData.b, tail)) {
        next = s;
        flip = true;
        break;
      }
    }
    if (!next) return null;
    used.add(next);
    path.push(next);
    pts.push(flip ? next.userData.a.clone() : next.userData.b.clone());
  }
  return null;
}
// Solid prism from a flat outline (x,y) pairs. Own ear-clipping so odd outlines (L shapes, collinear points) always fill.
function cadPrismPositions(pts, depth) {
  // drop duplicate neighbours
  let P = [];
  pts.forEach((p) => {
    const q = P[P.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > 1e-6 || Math.abs(q[1] - p[1]) > 1e-6) P.push([p[0], p[1]]);
  });
  if (P.length > 1) {
    const a = P[0], b = P[P.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) P.pop();
  }
  if (P.length < 3) return null;
  let ar = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length];
    ar += p[0] * q[1] - q[0] * p[1];
  }
  if (ar < 0) P.reverse(); // counter-clockwise
  const n = P.length;
  const cr = (a, b, c) => (P[b][0] - P[a][0]) * (P[c][1] - P[b][1]) - (P[b][1] - P[a][1]) * (P[c][0] - P[b][0]);
  const inTri = (a, b, c, p) => {
    const s = (u, v, w) => (P[v][0] - P[u][0]) * (P[w][1] - P[u][1]) - (P[v][1] - P[u][1]) * (P[w][0] - P[u][0]);
    return s(a, b, p) >= -1e-9 && s(b, c, p) >= -1e-9 && s(c, a, p) >= -1e-9;
  };
  const idx = P.map((_, i) => i),
    tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n + 10) {
    let done = false;
    for (let i = 0; i < idx.length && !done; i++) {
      const L = idx.length,
        a = idx[(i + L - 1) % L], b = idx[i], c = idx[(i + 1) % L];
      if (cr(a, b, c) <= 1e-9) continue;
      let ok = true;
      for (const k of idx) {
        if (k === a || k === b || k === c) continue;
        const same = (u) => Math.abs(P[k][0] - P[u][0]) < 1e-9 && Math.abs(P[k][1] - P[u][1]) < 1e-9;
        if (same(a) || same(b) || same(c)) continue;
        if (inTri(a, b, c, k)) { ok = false; break; }
      }
      if (ok) { tris.push([a, b, c]); idx.splice(i, 1); done = true; }
    }
    if (!done) {
      // no ear: drop the flattest vertex
      let bi = 0, bv = Infinity;
      for (let i = 0; i < idx.length; i++) {
        const L = idx.length, v = Math.abs(cr(idx[(i + L - 1) % L], idx[i], idx[(i + 1) % L]));
        if (v < bv) { bv = v; bi = i; }
      }
      idx.splice(bi, 1);
    }
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  const out = [];
  const put = (p, z) => out.push(P[p][0], P[p][1], z);
  tris.forEach(([a, b, c]) => {
    put(a, depth); put(b, depth); put(c, depth);
    put(a, 0); put(c, 0); put(b, 0);
  });
  for (let i = 0; i < n; i++) {
    const p = i, q = (i + 1) % n;
    put(p, 0); put(q, 0); put(q, depth);
    put(p, 0); put(q, depth); put(p, depth);
  }
  return new Float32Array(out);
}

function loopToShape(loop) {
  const pts = loop.pts;
  // Own fill for the outline, so L shapes and odd corners always come out as one clean solid
  const pp = cadPrismPositions(pts.map((p) => [p.x, -p.z]), 1);
  let geo;
  if (pp) {
    geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pp, 3));
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -0.5, 0);
    geo.computeVertexNormals();
  } else {
    const shape = new THREE.Shape();
    shape.moveTo(pts[0].x, -pts[0].z);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, -pts[i].z);
    shape.closePath();
    geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -0.5, 0);
    geo.computeVertexNormals();
  }
  geo.parameters = { width: 1, depth: 1, loop: true };
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: nextColor(),
      metalness: 0.1,
      roughness: 0.6,
      side: THREE.DoubleSide
    })
  );
  mesh.position.set(0, 0.005, 0);
  mesh.scale.y = 0.01;
  mesh.userData.height = 0;
  mesh.userData.imported = true; // reuse the free-form size handling
  mesh.userData.fromLines = true;
  mesh.userData.edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0xffffff })
  );
  mesh.add(mesh.userData.edges);
  return mesh;
}
function tryCloseLoop() {
  const loop = findLoop();
  if (!loop) return;
  const mesh = loopToShape(loop);
  const segs = loop.path;
  if (window.cadToast) window.cadToast("Closed shape with " + loop.pts.length + " corners", true);
  perform({
    redo() {
      segs.forEach((s) => {
        s.userData.used = true;
        removeFromScene(s);
      });
      addToScene(mesh);
    },
    undo() {
      removeFromScene(mesh);
      segs.forEach((s) => {
        s.userData.used = false;
        addToScene(s);
      });
    }
  });
  hint.textContent =
    "Closed shape! Use Select, tap it, then drag the arrow to extrude.";
}

// ---- Chamfer / Fillet (approximate bevels on the top edge) ----
function applyBevel(mesh, kind, size, live) {
  if (mesh.userData.imported) {
    hint.textContent =
      "Chamfer and fillet work on drawn shapes, not imported ones.";
    return;
  }
  const p = mesh.geometry.parameters;
  const isBox = p.width !== undefined;
  const baseW = isBox ? p.width : p.radiusTop * 2;
  const baseD = isBox ? p.depth : p.radiusTop * 2;
  const maxB = Math.min(baseW, baseD) / 2 - 0.01;
  const b = Math.min(size, maxB);
  const hh = Math.max(0.01, Math.abs(mesh.userData.height));
  // Bevel size is in scene units, so divide by the stretched height to keep it round
  const bevelInUnitY = Math.min(b / hh, 0.95);
  const segs = kind === "fillet" ? 8 : 1;
  const hw = baseW / 2,
    hd = baseD / 2;
  const shape = new THREE.Shape();
  if (isBox) {
    shape.moveTo(-hw, -hd);
    shape.lineTo(hw, -hd);
    shape.lineTo(hw, hd);
    shape.lineTo(-hw, hd);
    shape.closePath();
  } else {
    shape.absarc(0, 0, p.radiusTop, 0, Math.PI * 2, false);
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, 1 - bevelInUnitY),
    bevelEnabled: b > 0.001,
    bevelThickness: bevelInUnitY,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: segs,
    curveSegments: 48
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -0.5 + 0, 0);
  geo.computeVertexNormals();
  mesh.geometry.dispose();
  mesh.geometry = geo;
  geo.parameters = { width: baseW, depth: baseD, radiusTop: p.radiusTop };
  mesh.userData.bevel = b;
  if (mesh.userData.edges) {
    mesh.remove(mesh.userData.edges);
    mesh.userData.edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 20),
      new THREE.LineBasicMaterial({ color: 0xffffff })
    );
    mesh.add(mesh.userData.edges);
  }
}

// ---- Split: cut a shape in two halves across its middle ----
function splitShape(mesh) {
  if (mesh.userData.imported || Math.abs(mesh.userData.height) < 0.05) {
    hint.textContent = "Extrude the shape first, then split it.";
    return;
  }
  const p = mesh.geometry.parameters;
  const isBox = p.width !== undefined;
  const h = mesh.userData.height;
  const half = (side) => {
    let geo;
    if (isBox) geo = new THREE.BoxGeometry(p.width / 2, 1, p.depth);
    else
      geo = new THREE.CylinderGeometry(
        p.radiusTop,
        p.radiusTop,
        1,
        48,
        1,
        false,
        side < 0 ? 0 : Math.PI,
        Math.PI
      );
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: nextColor(),
        metalness: 0.1,
        roughness: 0.6,
        side: THREE.DoubleSide
      })
    );
    m.scale.copy(mesh.scale);
    m.rotation.copy(mesh.rotation);
    const off = isBox ? (p.width / 4) * side * mesh.scale.x : 0;
    const dir = new THREE.Vector3(
      Math.cos(mesh.rotation.y),
      0,
      -Math.sin(mesh.rotation.y)
    ).multiplyScalar(off);
    m.position.set(
      mesh.position.x + dir.x + side * 0.15,
      mesh.position.y,
      mesh.position.z + dir.z
    );
    m.userData.height = h;
    m.userData.edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0xffffff })
    );
    m.add(m.userData.edges);
    return m;
  };
  const a = half(-1),
    b = half(1);
  perform({
    redo() {
      removeFromScene(mesh);
      addToScene(a);
      addToScene(b);
    },
    undo() {
      removeFromScene(a);
      removeFromScene(b);
      addToScene(mesh);
    }
  });
  hideArrow();
  hint.textContent = "Split into two pieces. Use Move to pull them apart.";
}

// ---- Cut: subtract one shape from another (approximate, built from the shape outlines) ----
// The hole shape is the footprint of the cutting shape seen from above. We rebuild the solid as an
// extruded outline with that footprint punched out, so you get a real hollow, see-through hole.
function footprint(mesh) {
  // Returns an array of [x, z] points for the shape's outline from above, in world space.
  mesh.updateMatrixWorld(true);
  const p = mesh.geometry.parameters || {};
  const pts = [];
  const toWorld = (x, z) => {
    const v = new THREE.Vector3(x, 0, z).applyMatrix4(mesh.matrixWorld);
    return [v.x, v.z];
  };
  if (p.width !== undefined && !p.loop) {
    const hw = p.width / 2,
      hd = p.depth / 2;
    [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd]
    ].forEach((c) => pts.push(toWorld(c[0], c[1])));
  } else if (p.radiusTop !== undefined) {
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      pts.push(toWorld(Math.cos(a) * p.radiusTop, Math.sin(a) * p.radiusTop));
    }
  } else {
    // Free-form shapes: use the outline of the bounding box as a simple stand-in.
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    [
      [bb.min.x, bb.min.z],
      [bb.max.x, bb.min.z],
      [bb.max.x, bb.max.z],
      [bb.min.x, bb.max.z]
    ].forEach((c) => pts.push(toWorld(c[0], c[1])));
  }
  return pts;
}
function solidOutline(mesh) {
  return footprint(mesh);
}
function cutShapes(tool, solid) {
  if (Math.abs(solid.userData.height) < 0.05) {
    hint.textContent = "Extrude the solid first so there is something to cut.";
    return;
  }
  const outer = solidOutline(solid);
  const hole = footprint(tool);
  const shape = new THREE.Shape();
  outer.forEach((q, i) => {
    if (i === 0) shape.moveTo(q[0], -q[1]);
    else shape.lineTo(q[0], -q[1]);
  });
  shape.closePath();
  const holePath = new THREE.Path();
  hole
    .slice()
    .reverse()
    .forEach((q, i) => {
      if (i === 0) holePath.moveTo(q[0], -q[1]);
      else holePath.lineTo(q[0], -q[1]);
    });
  holePath.closePath();
  shape.holes.push(holePath);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    bevelEnabled: false,
    curveSegments: 48
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -0.5, 0);
  geo.computeVertexNormals();
  geo.parameters = { width: 1, depth: 1, loop: true };
  const h = solid.userData.height;
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: solid.material.color.getHex(),
      metalness: 0.1,
      roughness: 0.6,
      side: THREE.DoubleSide
    })
  );
  mesh.userData.imported = true;
  mesh.userData.cutResult = true;
  mesh.userData.edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0xffffff })
  );
  mesh.add(mesh.userData.edges);
  mesh.position.set(0, 0, 0);
  setHeight(mesh, h);
  const hideCutter = (on) => {
    tool.visible = !on;
    if (tool.userData.edges) tool.userData.edges.visible = !on;
  };
  perform({
    redo() {
      removeFromScene(solid);
      removeFromScene(tool);
      hideCutter(true);
      addToScene(mesh);
    },
    undo() {
      removeFromScene(mesh);
      hideCutter(false);
      addToScene(solid);
      addToScene(tool);
    }
  });
  setGlow(null);
  hideArrow();
  hint.textContent =
    "Cut done. The hole goes all the way through. Undo brings the original shapes back.";
}

// ---- Align: line the first shape up with the second ----
function alignShapes(a, b) {
  const from = { x: a.position.x, z: a.position.z };
  const to = { x: b.position.x, z: b.position.z };
  perform({
    redo() {
      a.position.x = to.x;
      a.position.z = to.z;
    },
    undo() {
      a.position.x = from.x;
      a.position.z = from.z;
    }
  });
  hideArrow();
  hint.textContent = "Aligned to the center of the second shape.";
}

// ---- STL export (binary) ----
function exportSTL() {
  const tris = [];
  shapes.forEach((mesh) => {
    mesh.updateMatrixWorld(true);
    const geo = mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry;
    const pos = geo.attributes.position;
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let i = 0; i < pos.count; i += 3) {
      for (let k = 0; k < 3; k++)
        v[k].fromBufferAttribute(pos, i + k).applyMatrix4(mesh.matrixWorld);
      tris.push([v[0].clone(), v[1].clone(), v[2].clone()]);
    }
  });
  if (!tris.length) {
    hint.textContent = "Nothing to export yet. Draw a shape first.";
    return;
  }
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, tris.length, true);
  let o = 84;
  const n = new THREE.Vector3(),
    e1 = new THREE.Vector3(),
    e2 = new THREE.Vector3();
  tris.forEach((t) => {
    e1.subVectors(t[1], t[0]);
    e2.subVectors(t[2], t[0]);
    n.crossVectors(e1, e2).normalize();
    [n, ...t].forEach((vec) => {
      dv.setFloat32(o, vec.x, true);
      dv.setFloat32(o + 4, vec.y, true);
      dv.setFloat32(o + 8, vec.z, true);
      o += 12;
    });
    o += 2;
  });
  const blob = new Blob([buf], { type: "model/stl" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "model.stl";
  document.body.appendChild(a);
  a.click();
  a.remove();
  hint.textContent = "Exported " + tris.length + " triangles to model.stl";
}

// ---- STL import (binary and ASCII) ----
fileInput.addEventListener("change", () => {
  const f = fileInput.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      importSTL(reader.result, f.name);
    } catch (err) {
      hint.textContent = "Could not read that STL file.";
    }
    fileInput.value = "";
  };
  reader.readAsArrayBuffer(f);
});
function importSTL(buffer, name) {
  let positions = [];
  const dv = new DataView(buffer);
  const count = dv.getUint32(80, true);
  const isBinary = buffer.byteLength === 84 + count * 50;
  if (isBinary) {
    for (let i = 0; i < count; i++) {
      const base = 84 + i * 50 + 12;
      for (let k = 0; k < 9; k++)
        positions.push(dv.getFloat32(base + k * 4, true));
    }
  } else {
    const text = new TextDecoder().decode(buffer);
    const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
    let m;
    while ((m = re.exec(text)))
      positions.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  }
  if (positions.length < 9) throw new Error("empty");
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  const size = new THREE.Vector3();
  geo.boundingBox.getSize(size);
  const center = new THREE.Vector3();
  geo.boundingBox.getCenter(center);
  geo.translate(-center.x, -geo.boundingBox.min.y, -center.z);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: nextColor(),
      metalness: 0.1,
      roughness: 0.6,
      side: THREE.DoubleSide
    })
  );
  const big = Math.max(size.x, size.y, size.z);
  if (big > 0) mesh.scale.setScalar(8 / big);
  mesh.userData.imported = true;
  mesh.userData.height = 0;
  perform({
    redo() {
      addToScene(mesh);
    },
    undo() {
      removeFromScene(mesh);
    }
  });
  hint.textContent = "Imported " + name + " (scaled to fit the grid)";
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
function loop() {
  requestAnimationFrame(loop);
  if (glowBox && selected) glowBox.update();
  if (!selLine) endHandle.visible = false;
  renderer.render(scene, camera);
}
chooseTool("select");
loop();
