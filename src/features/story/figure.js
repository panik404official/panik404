import * as THREE from 'three';
/* rounded-edge box, so shoes and brows read as soft objects instead of sharp blocks */
function RB(w, h, d) {
  const r = Math.min(0.05, Math.min(w, h, d) * 0.3),
    iw = Math.max(w - 2 * r, 0.002),
    ih = Math.max(h - 2 * r, 0.002),
    cr = Math.min(r, iw / 2, ih / 2) * 0.9,
    s = new THREE.Shape(),
    a = -iw / 2,
    b = -ih / 2;
  s.moveTo(a + cr, b);
  s.lineTo(a + iw - cr, b);
  s.quadraticCurveTo(a + iw, b, a + iw, b + cr);
  s.lineTo(a + iw, b + ih - cr);
  s.quadraticCurveTo(a + iw, b + ih, a + iw - cr, b + ih);
  s.lineTo(a + cr, b + ih);
  s.quadraticCurveTo(a, b + ih, a, b + ih - cr);
  s.lineTo(a, b + cr);
  s.quadraticCurveTo(a, b, a + cr, b);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(d - 2 * r, 0.002),
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments: 3,
    curveSegments: 4,
  });
  g.center();
  return g;
}
/* a soft, rounded person built from simple shapes, posed with 9 numbers */
export function figure(C) {
  const root = new THREE.Group(),
    M = (c, o = {}) => new THREE.MeshStandardMaterial({ roughness: 0.55, ...o, color: c }),
    S = (g, c, o) => new THREE.Mesh(g, M(c, o)),
    sp = (r, c, o) => S(new THREE.SphereGeometry(r, 32, 24), c, o),
    cy = (r, l, c) => {
      const g = new THREE.Group(),
        m = S(new THREE.CylinderGeometry(r, r * 0.9, l, 24), c);
      m.position.y = -l / 2;
      g.add(m);
      const e = sp(r * 0.9, c);
      e.position.y = -l;
      g.add(e);
      return g;
    };
  const hips = new THREE.Group();
  root.add(hips);
  const torso = new THREE.Group();
  hips.add(torso);
  const body = sp(1, C.top, { roughness: 0.85 });
  body.scale.set(0.5, 0.62, 0.36);
  body.position.y = 0.55;
  torso.add(body);
  const neck = S(new THREE.CylinderGeometry(0.09, 0.1, 0.2, 20), C.skin);
  neck.position.y = 1.12;
  torso.add(neck);
  const head = new THREE.Group();
  head.position.y = 1.12;
  torso.add(head);
  const hd = sp(0.34, C.skin, { roughness: 0.6 });
  hd.position.y = 0.3;
  head.add(hd);
  const hr = sp(0.37, C.hair, { roughness: 0.45 });
  hr.scale.set(1.04, 1, 1.02);
  hr.position.set(0, 0.36, -0.1);
  head.add(hr);
  const bun = sp(0.14, C.hair, { roughness: 0.45 });
  bun.position.set(0, 0.7, -0.16);
  head.add(bun);
  const bang = sp(0.3, C.hair, { roughness: 0.45 });
  bang.scale.set(1.1, 0.42, 0.7);
  bang.position.set(0, 0.6, 0.1);
  head.add(bang);
  const eM = new THREE.MeshStandardMaterial({ color: 0x3d3550, roughness: 0.15 }),
    hl = new THREE.MeshBasicMaterial({ color: 0xffffff }),
    eyes = [-1, 1].map((s) => {
      const e = new THREE.Group();
      e.position.set(s * 0.12, 0.34, 0.318);
      head.add(e);
      e.add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 16), eM));
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), hl);
      h.position.set(0.012, 0.012, 0.034);
      e.add(h);
      const ck = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffb7c9, transparent: true, opacity: 0.55, depthWrite: false }),
      );
      ck.scale.set(1, 0.6, 0.3);
      ck.position.set(s * 0.2, 0.24, 0.29);
      head.add(ck);
      return e;
    });
  const nose = sp(0.035, C.skin);
  nose.position.set(0, 0.27, 0.335);
  head.add(nose);
  const bM = new THREE.MeshStandardMaterial({ color: C.hair }),
    brows = [-1, 1].map((s) => {
      const b = new THREE.Mesh(RB(0.12, 0.025, 0.02), bM);
      b.position.set(s * 0.12, 0.44, 0.31);
      head.add(b);
      return b;
    });
  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(0.07, 0.014, 10, 24, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xd9738f, roughness: 0.4 }),
  );
  mouth.position.set(0, 0.17, 0.325);
  head.add(mouth);
  const tear = sp(0.025, 0xbfe3ff, { transparent: true, opacity: 0.85 });
  tear.scale.set(1, 1.5, 0.8);
  tear.position.set(0.15, 0.26, 0.3);
  head.add(tear);
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group();
    sh.position.set(s * 0.52, 0.95, 0);
    torso.add(sh);
    sh.add(sp(0.1, C.top, { roughness: 0.85 }), cy(0.09, 0.5, C.top));
    const el = new THREE.Group();
    el.position.y = -0.5;
    sh.add(el);
    el.add(cy(0.07, 0.45, C.skin));
    const hand = sp(0.08, C.skin);
    hand.position.y = -0.47;
    el.add(hand);
    return { sh, el };
  });
  [-1, 1].forEach((s) => {
    const th = new THREE.Group();
    th.position.set(s * 0.2, 0, 0);
    th.rotation.x = -Math.PI / 2;
    hips.add(th);
    th.add(cy(0.12, 0.6, C.pants));
    const kn = new THREE.Group();
    kn.position.y = -0.6;
    kn.rotation.x = Math.PI / 2;
    th.add(kn);
    kn.add(cy(0.1, 0.55, C.pants));
    const ft = new THREE.Mesh(RB(0.17, 0.1, 0.3), M(C.shoe, { roughness: 0.7 }));
    ft.position.set(0, -0.6, 0.08);
    kn.add(ft);
  });
  let lid = 1;
  const set = (v) => {
    torso.rotation.x = v[0];
    head.rotation.x = v[1];
    arms[0].sh.rotation.x = v[2];
    arms[0].el.rotation.x = v[3];
    arms[1].sh.rotation.x = v[4];
    arms[1].el.rotation.x = v[5];
    brows[0].rotation.z = v[6];
    brows[1].rotation.z = -v[6];
    const s = v[7];
    mouth.rotation.z = s > 0 ? Math.PI : 0;
    mouth.scale.y = 0.12 + 0.88 * Math.min(1, Math.abs(s));
    mouth.position.y = s > 0 ? 0.2 : 0.15;
    lid = 1 - 0.35 * (v[8] || 0);
    eyes.forEach((e) => (e.scale.y = lid));
  };
  const bo = Math.random() * 3,
    fx = (t, k) => {
      tear.visible = k > 0.05;
      tear.position.y = 0.26 - ((t * 0.45) % 1) * 0.2;
      tear.material.opacity = 0.85 * k;
      torso.scale.y = 1 + 0.012 * Math.sin(t * 2 + bo);
      if ((t + bo) % 4 < 0.14) eyes.forEach((e) => (e.scale.y = 0.1));
    };
  return { root, set, arms, fx };
}
