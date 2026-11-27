// Rounder look: smooth shading on curved parts, no stray lines on curves, finer cylinders and fillets.
// Load right after the three.js script and before app.js.
(function () {
  // 1. Outline lines: only draw real creases (30 degrees and up), so curves have no lines on them
  const OrigEdges = THREE.EdgesGeometry;
  THREE.EdgesGeometry = function (g, t) {
    return new OrigEdges(g, Math.max(t === undefined ? 0 : t, 30));
  };

  // 2. Cylinders get more sides
  const OrigCyl = THREE.CylinderGeometry;
  THREE.CylinderGeometry = function (rt, rb, h, seg, hs, open, ts, tl) {
    if (seg >= 32) seg = 128;
    return new OrigCyl(rt, rb, h, seg, hs, open, ts, tl);
  };

  // 3. Smooth shading across gentle angles for triangle soups (OCCT results, merged solids)
  const orig = THREE.BufferGeometry.prototype.computeVertexNormals;
  const COS = Math.cos((35 * Math.PI) / 180);
  THREE.BufferGeometry.prototype.computeVertexNormals = function () {
    const pos = this.attributes.position;
    if (this.index || !pos || pos.count < 3 || pos.count > 600000) return orig.call(this);
    const n = Math.floor(pos.count / 3),
      fn = new Float32Array(n * 3),
      area = new Float32Array(n),
      groups = new Map(),
      key = (i) =>
        Math.round(pos.getX(i) * 1e4) + "," + Math.round(pos.getY(i) * 1e4) + "," + Math.round(pos.getZ(i) * 1e4);
    for (let t = 0; t < n; t++) {
      const a = 3 * t;
      const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
      const ux = pos.getX(a + 1) - ax, uy = pos.getY(a + 1) - ay, uz = pos.getZ(a + 1) - az;
      const vx = pos.getX(a + 2) - ax, vy = pos.getY(a + 2) - ay, vz = pos.getZ(a + 2) - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      area[t] = l / 2;
      if (l > 1e-12) {
        fn[3 * t] = nx / l;
        fn[3 * t + 1] = ny / l;
        fn[3 * t + 2] = nz / l;
      }
      for (let c = 0; c < 3; c++) {
        const k = key(a + c);
        let g = groups.get(k);
        if (!g) groups.set(k, (g = []));
        g.push(t);
      }
    }
    const out = new Float32Array(pos.count * 3);
    for (let t = 0; t < n; t++) {
      for (let c = 0; c < 3; c++) {
        const g = groups.get(key(3 * t + c));
        let sx = 0, sy = 0, sz = 0;
        for (const u of g) {
          const d = fn[3 * t] * fn[3 * u] + fn[3 * t + 1] * fn[3 * u + 1] + fn[3 * t + 2] * fn[3 * u + 2];
          if (d >= COS) {
            sx += fn[3 * u] * area[u];
            sy += fn[3 * u + 1] * area[u];
            sz += fn[3 * u + 2] * area[u];
          }
        }
        const l = Math.hypot(sx, sy, sz) || 1,
          o = 3 * (3 * t + c);
        out[o] = sx / l;
        out[o + 1] = sy / l;
        out[o + 2] = sz / l;
      }
    }
    this.setAttribute("normal", new THREE.BufferAttribute(out, 3));
  };

  // 4. Finer meshing for OCCT results (fillets and curves)
  function patchKernel() {
    const k = window.occtKernel;
    if (!k || k.__fine || !k.tessellate) return !!(k && k.__fine);
    const t = k.tessellate.bind(k);
    k.tessellate = (s, a, b) => t(s, Math.min(a || 0.05, 0.01), Math.min(b || 0.3, 0.08));
    k.__fine = true;
    return true;
  }
  if (!patchKernel()) {
    addEventListener("cadkernelready", patchKernel);
    const iv = setInterval(() => patchKernel() && clearInterval(iv), 500);
    setTimeout(() => clearInterval(iv), 30000);
  }
})();
