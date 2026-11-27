// Drawn lines: a little thicker, in the same orange as the chamfer / fillet highlight,
// with a small dot on both ends so corners are easy to see and connect to.
(function () {
  const ORANGE = 0xffb020,
    GREEN = 0x3ddc84;
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = 64;
  const g = cvs.getContext("2d");
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fillStyle = "#ffffff";
  g.fill();
  g.beginPath();
  g.arc(32, 32, 20, 0, Math.PI * 2);
  const grad = g.createLinearGradient(0, 12, 0, 52);
  grad.addColorStop(0, "#4aa3ff");
  grad.addColorStop(1, "#1f7aff");
  g.fillStyle = grad;
  g.fill();
  const tex = new THREE.CanvasTexture(cvs);
  const DOT_PX = 6.5; // dot width on screen: just a little bigger than the line
  const THICK_PX = 2.6; // line thickness on screen

  const dots = new Map(); // source -> [sprite, sprite]
  const tubes = new Map(); // source -> [mesh...]
  const UP = new THREE.Vector3(0, 1, 0);
  const unitGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
  const mkDot = () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false }));
    s.renderOrder = 9;
    s.raycast = () => {};
    scene.add(s);
    return s;
  };
  const mkTube = () => {
    const m = new THREE.Mesh(unitGeo, new THREE.MeshBasicMaterial({ color: ORANGE, depthTest: false, depthWrite: false }));
    m.renderOrder = 7;
    m.raycast = () => {};
    scene.add(m);
    return m;
  };
  function worldPts(l) {
    const pos = l.geometry && l.geometry.attributes && l.geometry.attributes.position;
    if (!pos || pos.count < 2) return null;
    l.updateMatrixWorld(true);
    const out = [];
    for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(l.matrixWorld));
    return out;
  }
  const perPx = (p) => (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.distanceTo(p)) / innerHeight;
  const tmp = new THREE.Vector3();

  function update(src, hidden) {
    const pts = hidden ? null : worldPts(src);
    let ts = tubes.get(src) || [];
    const segs = [];
    if (pts) {
      for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]);
      if (src.isLineLoop && pts.length > 2) segs.push([pts[pts.length - 1], pts[0]]);
    }
    while (ts.length < segs.length) ts.push(mkTube());
    while (ts.length > segs.length) scene.remove(ts.pop());
    tubes.set(src, ts);
    const c = src.material && src.material.color && src.material.color.getHex() === GREEN ? GREEN : ORANGE;
    segs.forEach(([a, b], i) => {
      const len = a.distanceTo(b);
      const t = ts[i];
      if (len < 1e-6) return (t.visible = false);
      t.visible = true;
      t.material.color.setHex(c);
      tmp.copy(a).add(b).multiplyScalar(0.5);
      const r = (perPx(tmp) * THICK_PX) / 2;
      t.position.copy(tmp);
      t.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
      t.scale.set(r, len, r);
    });
    // dots only on real lines (not on the rectangle / circle preview)
    if (src.isLineLoop || !pts) {
      const d = dots.get(src);
      if (d) {
        d.forEach((s) => scene.remove(s));
        dots.delete(src);
      }
      return;
    }
    let d = dots.get(src);
    if (!d) {
      d = [mkDot(), mkDot()];
      dots.set(src, d);
    }
    d[0].position.copy(pts[0]);
    d[1].position.copy(pts[pts.length - 1]);
  }
  function drop(src) {
    (tubes.get(src) || []).forEach((m) => scene.remove(m));
    tubes.delete(src);
    (dots.get(src) || []).forEach((s) => scene.remove(s));
    dots.delete(src);
  }
  (function loop() {
    requestAnimationFrame(loop);
    const src = new Set();
    lines.forEach((l) => l.parent && src.add(l));
    try {
      if (typeof preview !== "undefined" && preview && preview.isLine && preview.parent) src.add(preview);
    } catch (e) {}
    if (window.cadPrevObj && window.cadPrevObj.isLine && window.cadPrevObj.parent) src.add(window.cadPrevObj);
    [...tubes.keys()].forEach((s) => !src.has(s) && drop(s));
    src.forEach((s) => update(s, s.visible === false));
    // keep the dots the same small size on screen (a sprite's size is its scale times its distance)
    const k = DOT_PX / (innerHeight * 2 * Math.tan((camera.fov * Math.PI) / 360)) / 0.875;
    dots.forEach((d) => d.forEach((s) => s.scale.set(k, k, 1)));
  })();
})();
