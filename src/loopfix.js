// Small patch: fills closed line loops with a clean solid, so any outline (L shapes etc.) turns into
// a blue shape you can tap and extrude. Load after pushpull.js (any place after app.js works).
(function () {
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

  const prev = loopToShape;
  loopToShape = function (loop) {
    const mesh = prev(loop);
    try {
      const pp = cadPrismPositions(loop.pts.map((p) => [p.x, -p.z]), 1);
      if (pp) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pp, 3));
        g.rotateX(-Math.PI / 2);
        g.translate(0, -0.5, 0);
        g.computeVertexNormals();
        g.parameters = { width: 1, depth: 1, loop: true };
        mesh.geometry = g;
        if (mesh.userData.edges) mesh.userData.edges.geometry = new THREE.EdgesGeometry(g);
      }
    } catch (e) {
      console.error("loopfix: " + (e.message || e));
    }
    if (window.cadToast) window.cadToast("Closed shape with " + loop.pts.length + " corners. Tap it, then extrude.", true);
    return mesh;
  };
  if (window.cadToast) window.cadToast("loopfix loaded", true);
})();
