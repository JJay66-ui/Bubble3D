// Puts a round dot on both ends of every drawn line, so it is easy to see (and snap to) the corners.
(function () {
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = 64;
  const g = cvs.getContext("2d");
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fillStyle = "#ffffff";
  g.fill();
  g.beginPath();
  g.arc(32, 32, 21, 0, Math.PI * 2);
  g.fillStyle = "#ffb800";
  g.fill();
  const tex = new THREE.CanvasTexture(cvs);
  const SIZE = 0.03; // about 3% of the screen height, always the same on screen

  const marks = new Map(); // line -> [sprite, sprite]
  const mk = () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false }));
    s.scale.set(SIZE, SIZE, 1);
    s.renderOrder = 8;
    s.raycast = () => {}; // never blocks taps
    s.userData.endpointDot = true;
    scene.add(s);
    return s;
  };
  const tmpA = new THREE.Vector3(),
    tmpB = new THREE.Vector3();
  function ends(l) {
    const pos = l.geometry && l.geometry.attributes && l.geometry.attributes.position;
    if (!pos || pos.count < 2) return null;
    l.updateMatrixWorld(true);
    tmpA.fromBufferAttribute(pos, 0).applyMatrix4(l.matrixWorld);
    tmpB.fromBufferAttribute(pos, pos.count - 1).applyMatrix4(l.matrixWorld);
    return [tmpA, tmpB];
  }
  (function loop() {
    requestAnimationFrame(loop);
    const live = new Set(lines);
    marks.forEach((pair, l) => {
      if (!live.has(l) || !l.parent) {
        pair.forEach((s) => scene.remove(s));
        marks.delete(l);
      }
    });
    lines.forEach((l) => {
      if (!l.parent) return;
      const e = ends(l);
      if (!e) return;
      let pair = marks.get(l);
      if (!pair) {
        pair = [mk(), mk()];
        marks.set(l, pair);
      }
      pair[0].position.copy(e[0]);
      pair[1].position.copy(e[1]);
      const vis = l.visible !== false;
      pair[0].visible = pair[1].visible = vis;
    });
  })();
})();
