import * as THREE from 'three';
function capsule(r, l) {
  const p = [],
    n = 8;
  for (let i = 0; i <= n; i++) {
    const a = ((i / n) * Math.PI) / 2;
    p.push(new THREE.Vector2(Math.sin(a) * r, -l / 2 - Math.cos(a) * r));
  }
  for (let i = 0; i <= n; i++) {
    const a = ((i / n) * Math.PI) / 2;
    p.push(new THREE.Vector2(Math.cos(a) * r, l / 2 + Math.sin(a) * r));
  }
  return new THREE.LatheGeometry(p, 18);
}
/* illustrated, cel-shaded people with soft outlines, posed with 9 numbers */
const GM = (() => {
    const t = new THREE.DataTexture(new Uint8Array([150, 205, 255]), 3, 1, THREE.LuminanceFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  })(),
  OL = new THREE.MeshBasicMaterial({ color: 0x3b1f6b, side: THREE.BackSide });
export function figure(C) {
  const root = new THREE.Group(),
    S = (g, c, o) => {
      const { nol, ...mo } = o || {},
        m = new THREE.Mesh(g, new THREE.MeshToonMaterial({ color: c, gradientMap: GM, ...mo }));
      if (!nol && !mo.transparent) {
        const l = new THREE.Mesh(g, OL);
        l.scale.setScalar(1.06);
        m.add(l);
      }
      return m;
    },
    sp = (r, c, o) => S(new THREE.SphereGeometry(r, 20, 16), c, o),
    cp = (r, l, c, y) => {
      const m = S(capsule(r, l), c);
      m.position.y = y;
      return m;
    };
  const hips = new THREE.Group();
  root.add(hips);
  const pel = sp(0.3, C.pants);
  pel.scale.set(1.15, 0.6, 0.95);
  pel.position.y = 0.02;
  hips.add(pel);
  const torso = new THREE.Group();
  hips.add(torso);
  const body = S(capsule(0.34, 0.42), C.top);
  body.scale.set(1.3, 1, 0.88);
  body.position.y = 0.52;
  torso.add(body);
  const collar = S(new THREE.TorusGeometry(0.17, 0.07, 12, 24), C.top2);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.03;
  torso.add(collar);
  if (C.hoodie) {
    const pk = sp(0.2, C.top2);
    pk.scale.set(1.15, 0.4, 0.3);
    pk.position.set(0, 0.3, 0.27);
    torso.add(pk);
    [-1, 1].forEach((s) => {
      const d = S(new THREE.CylinderGeometry(0.011, 0.011, 0.22, 6), 0xffffff, { nol: true });
      d.position.set(s * 0.07, 0.82, 0.29);
      torso.add(d);
    });
  }
  if (C.cardigan) {
    [0, 1, 2].forEach((i) => {
      const b = sp(0.02, 0xffffff, { nol: true });
      b.position.set(0, 0.88 - i * 0.17, 0.3);
      torso.add(b);
    });
  }
  const head = new THREE.Group();
  head.position.y = 1.12;
  torso.add(head);
  const nk = S(new THREE.CylinderGeometry(0.085, 0.095, 0.26, 12), C.skin);
  nk.position.y = 0.02;
  head.add(nk);
  const hd = sp(0.34, C.skin);
  hd.scale.set(0.95, 1.05, 1);
  hd.position.y = 0.3;
  head.add(hd);
  [-1, 1].forEach((s) => {
    const e = sp(0.05, C.skin);
    e.scale.set(0.5, 1, 0.7);
    e.position.set(s * 0.33, 0.3, 0);
    head.add(e);
    const ch = sp(0.05, 0xff9fb2, { transparent: true, opacity: 0.5 });
    ch.scale.set(1.1, 0.7, 0.3);
    ch.position.set(s * 0.2, 0.2, 0.26);
    head.add(ch);
  });
  const nose = sp(0.035, 0xe3a98a, { nol: true });
  nose.position.set(0, 0.22, 0.34);
  head.add(nose);
  const hr = sp(0.37, C.hair);
  hr.scale.set(1.03, 1.02, 1);
  hr.position.set(0, 0.36, -0.07);
  head.add(hr);
  const bang = sp(0.3, C.hair);
  bang.scale.set(1.12, 0.45, 0.75);
  bang.position.set(0, 0.62, 0.1);
  head.add(bang);
  if (C.style === 'long') {
    const bk = sp(0.4, C.hair);
    bk.scale.set(0.95, 1.3, 0.55);
    bk.position.set(0, 0, -0.2);
    head.add(bk);
    [-1, 1].forEach((s) => {
      const l = sp(0.12, C.hair);
      l.scale.set(0.7, 2.2, 0.7);
      l.position.set(s * 0.31, 0.15, 0.08);
      head.add(l);
    });
    const bun = sp(0.15, C.hair);
    bun.position.set(0, 0.74, -0.12);
    head.add(bun);
    const tie = S(new THREE.TorusGeometry(0.12, 0.025, 8, 16), 0xffd23f, { nol: true });
    tie.position.set(0, 0.66, -0.12);
    tie.rotation.x = Math.PI / 2;
    head.add(tie);
  } else {
    const bk = sp(0.38, C.hair);
    bk.scale.set(1, 0.8, 0.7);
    bk.position.set(0, 0.2, -0.12);
    head.add(bk);
    [-1, 1].forEach((s) => {
      const l = sp(0.12, C.hair);
      l.scale.set(0.7, 1.4, 0.8);
      l.position.set(s * 0.3, 0.28, 0.05);
      head.add(l);
    });
  }
  const lids = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * 0.125, 0.33, 0.3);
    head.add(g);
    const wh = sp(0.06, 0xffffff, { nol: true });
    wh.scale.set(1, 1.1, 0.5);
    g.add(wh);
    const ir = sp(0.04, 0x3b1f4a, { nol: true });
    ir.position.z = 0.022;
    ir.scale.z = 0.5;
    g.add(ir);
    const hl = new THREE.Mesh(
      new THREE.SphereGeometry(0.011, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    hl.position.set(0.013, 0.015, 0.04);
    g.add(hl);
    const lg = new THREE.Group();
    lg.position.y = 0.115;
    g.add(lg);
    const lid = sp(0.068, C.skin, { nol: true });
    lid.scale.set(1.05, 0.55, 0.75);
    lid.position.z = 0.012;
    lg.add(lid);
    const lash = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.014, 0.012),
      new THREE.MeshBasicMaterial({ color: C.hair }),
    );
    lash.position.set(0, -0.036, 0.05);
    lash.rotation.z = -s * 0.12;
    lg.add(lash);
    return lg;
  });
  const bM = new THREE.MeshBasicMaterial({ color: C.hair }),
    brows = [-1, 1].map((s) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.028, 0.02), bM);
      b.position.set(s * 0.125, 0.43, 0.3);
      head.add(b);
      return b;
    });
  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(0.07, 0.015, 8, 20, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0xb4506e }),
  );
  mouth.position.set(0, 0.14, 0.31);
  head.add(mouth);
  if (C.glasses) {
    const gM = new THREE.MeshBasicMaterial({ color: 0x2e1065 });
    [-1, 1].forEach((s) => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.009, 8, 24), gM);
      r.position.set(s * 0.125, 0.33, 0.325);
      head.add(r);
    });
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.01), gM);
    br.position.set(0, 0.34, 0.335);
    head.add(br);
  }
  const tear = sp(0.025, 0xbfe3ff, { transparent: true, opacity: 0.85 });
  tear.scale.set(1, 1.5, 0.8);
  tear.position.set(0.15, 0.26, 0.3);
  head.add(tear);
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group();
    sh.position.set(s * 0.5, 0.95, 0);
    torso.add(sh);
    sh.add(sp(0.105, C.top), cp(0.085, 0.34, C.top, -0.255));
    const el = new THREE.Group();
    el.position.y = -0.51;
    sh.add(el);
    el.add(sp(0.08, C.top), cp(0.072, 0.24, C.top, -0.2));
    const cuff = S(new THREE.TorusGeometry(0.072, 0.02, 8, 14), C.top2);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.38;
    el.add(cuff);
    const hand = sp(0.078, C.skin);
    hand.scale.set(0.9, 1.1, 0.8);
    hand.position.y = -0.46;
    el.add(hand);
    const tb = sp(0.032, C.skin);
    tb.position.set(-s * 0.07, -0.43, 0.04);
    el.add(tb);
    return { sh, el };
  });
  [-1, 1].forEach((s) => {
    const t2 = new THREE.Group();
    t2.position.set(s * 0.2, 0, 0);
    t2.rotation.x = -Math.PI / 2;
    hips.add(t2);
    t2.add(cp(0.125, 0.36, C.pants, -0.3));
    const kn = new THREE.Group();
    kn.position.y = -0.6;
    kn.rotation.x = Math.PI / 2;
    t2.add(kn);
    kn.add(sp(0.11, C.pants), cp(0.098, 0.36, C.pants, -0.28));
    const sh = sp(0.1, 0xffffff);
    sh.scale.set(0.95, 0.65, 1.7);
    sh.position.set(0, -0.6, 0.1);
    kn.add(sh);
    const so = sp(0.1, 0xc4b5fd);
    so.scale.set(1, 0.2, 1.75);
    so.position.set(0, -0.66, 0.1);
    kn.add(so);
  });
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
    mouth.position.y = s > 0 ? 0.17 : 0.13;
    lids.forEach((l) => (l.position.y = 0.115 - 0.075 * v[8]));
  };
  const bo = Math.random() * 3,
    fx = (t, k) => {
      tear.visible = k > 0.05;
      tear.position.y = 0.26 - ((t * 0.45) % 1) * 0.2;
      tear.material.opacity = 0.85 * k;
      torso.scale.y = 1 + 0.012 * Math.sin(t * 2 + bo);
      if ((t + bo) % 4 < 0.14) lids.forEach((l) => (l.position.y = 0.045));
    };
  return { root, set, arms, fx };
}
