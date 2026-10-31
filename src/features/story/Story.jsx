import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import Link from '../../components/Link';
import { figure } from './figure';
import { TABS, tabTex } from './panels';

const CAPS = [
  ['11:47 pm', 'Her brain has twenty-three tabs open. Work, money, that text from Tuesday.'],
  ['Still scrolling', 'It’s not that she can’t cope. It’s that she’s been coping alone.'],
  ['One small decision', 'A few lines on a booking form. No profile-scrolling, no therapist-shopping.'],
  ['Later', 'Panik matched her with a licensed professional. The tabs started closing.'],
  ['The session', 'Someone finally listens. She doesn’t have to hold it all on her own anymore.'],
];
export default function Story() {
  const wr = useRef(),
    st = useRef(),
    cv = useRef(),
    hero = useRef(),
    end = useRef(),
    cut = useRef(),
    prog = useRef(),
    [ch, setCh] = useState(-1);
  useEffect(() => {
    const el = cv.current,
      stg = st.current,
      wrap = wr.current,
      w = () => stg.clientWidth,
      h = () => stg.clientHeight;
    let headerHeight = 0;
    const hd = document.querySelector('header'),
      fit = () => {
        headerHeight = hd.offsetHeight + (parseFloat(getComputedStyle(hd).top) || 0);
        wrap.style.setProperty(
          '--header-height',
          headerHeight + 'px',
        );
      };
    fit();
    const sc = new THREE.Scene(),
      cam = new THREE.PerspectiveCamera(42, w() / h(), 0.1, 100),
      rd = new THREE.WebGLRenderer({ canvas: el, antialias: true });
    rd.setPixelRatio(Math.min(devicePixelRatio, 2));
    const bgN = new THREE.Color(0xffffff),
      bgM = new THREE.Color(0xffffff),
      bgD = new THREE.Color(0xffffff),
      bg = new THREE.Color();
    const amb = new THREE.AmbientLight(0xffffff, 0.5),
      dl = new THREE.DirectionalLight(0xffffff, 0.45);
    dl.position.set(3, 6, 5);
    sc.add(amb, dl);
    const M = (c, o) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o }),
      B = (a, b, c, col, x, y, z, g, o) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(a, b, c), M(col, o));
        m.position.set(x, y, z);
        g.add(m);
        return m;
      };
    const off = new THREE.Group(),
      room = new THREE.Group();
    sc.add(off, room);
    /* ---- night office ---- */
    const f1 = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), M(0xf6f2fc, { emissive: 0xf6f2fc }));
    f1.rotation.x = -Math.PI / 2;
    off.add(f1);
    const nrug = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.02, 48), M(0xefe6ff));
    nrug.position.y = 0.01;
    off.add(nrug);
    B(18, 8, 0.1, 0xfbf9ff, 0, 3, -2.8, off, { emissive: 0xfbf9ff });
    B(3, 2.3, 0.05, 0xd9e0ff, -2.4, 2.7, -2.7, off, { emissive: 0xd9e0ff });
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xcdbbff }),
    );
    moon.position.set(-2.1, 3.1, -2.62);
    off.add(moon);
    const sg = new THREE.BufferGeometry(),
      sa = new Float32Array(90);
    for (let i = 0; i < 30; i++) sa.set([-3.7 + Math.random() * 2.6, 1.7 + Math.random() * 2, -2.64], i * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(sa, 3));
    off.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.06 })));
    B(2.6, 0.08, 1, 0xe9defc, 0, 1, 1.1, off);
    [
      [-1.2, 0.65],
      [1.2, 0.65],
      [-1.2, 1.55],
      [1.2, 1.55],
    ].forEach(([x, z]) => B(0.08, 1, 0.08, 0xd7c8f0, x, 0.5, z, off));
    B(1, 0.1, 0.9, 0xe2d6fa, 0, 0.45, 0, off);
    B(1, 1.2, 0.1, 0xe2d6fa, 0, 1.05, -0.45, off);
    B(1, 0.04, 0.7, 0xe9e6f2, 0, 1.06, 1.1, off);
    const scr = B(1, 0.65, 0.03, 0xeef3ff, 0, 1.4, 1.45, off, { emissive: 0xcfe0ff, emissiveIntensity: 0.7 });
    scr.rotation.x = 0.18;
    const lp = new THREE.PointLight(0xcfe0ff, 0.3, 6);
    lp.position.set(0, 1.6, 1.1);
    off.add(lp);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.18, 14), M(0xffc8dd));
    mug.position.set(1, 1.14, 1);
    off.add(mug);
    const tabs = TABS.map((l, i) => {
      const { t, draw } = tabTex(l, i),
        m = new THREE.Mesh(
          new THREE.PlaneGeometry(1.6, 0.99),
          new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide }),
        );
      m.userData = {
        i,
        s: 1,
        was: true,
        a0: (i / 5) * 6.28,
        rad: 2.1 + (i % 2) * 0.4,
        sp: (0.28 + 0.05 * i) * (i % 2 ? -1 : 1),
      };
      off.add(m);
      draw();
      return { m, draw };
    });
    const bk = tabTex('Book a session', 5, '✓'),
      book = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 1.11),
        new THREE.MeshBasicMaterial({ map: bk.t, transparent: true, side: THREE.DoubleSide }),
      );
    book.position.set(1.5, 2.1, 0.9);
    off.add(book);
    bk.draw();
    document.fonts &&
      document.fonts.ready.then(() => {
        tabs.forEach((o) => o.draw());
        bk.draw();
      });
    const cloud = new THREE.Group(),
      cM = M(0xddd3f3, { emissive: 0x4a4560, roughness: 0.95, transparent: true });
    cloud.position.set(0, 3.5, 0);
    off.add(cloud);
    [
      [0, 0, 0, 0.7],
      [0.7, -0.1, 0.1, 0.55],
      [-0.7, -0.05, 0, 0.55],
      [0.3, 0.35, -0.1, 0.5],
      [-0.35, 0.3, 0.1, 0.45],
    ].forEach(([x, y, z, r]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), cM);
      m.position.set(x, y, z);
      cloud.add(m);
    });
    const bolt = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xc4b5fd, transparent: true }),
    );
    cloud.add(bolt);
    /* ---- morning therapy room ---- */
    const f2 = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), M(0xf7f3ff, { emissive: 0xf7f3ff }));
    f2.rotation.x = -Math.PI / 2;
    room.add(f2);
    B(18, 8, 0.1, 0xffffff, 0, 3, -3.3, room, { emissive: 0xffffff });
    B(3.6, 2.5, 0.05, 0xf2ecff, 0, 2.5, -3.2, room, { emissive: 0xf2ecff });
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xc4b5fd }),
    );
    sun.position.z = -3.1;
    room.add(sun);
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 0.02, 48), M(0xefe6ff, { roughness: 1 }));
    rug.position.y = 0.01;
    room.add(rug);
    const chair = (c, x, ry) => {
      const g = new THREE.Group();
      g.position.x = x;
      g.rotation.y = ry;
      room.add(g);
      B(1.1, 0.35, 1.1, c, 0, 0.25, 0, g);
      B(1.1, 1, 0.2, c, 0, 0.85, -0.5, g);
      B(0.16, 0.55, 1, c, -0.63, 0.5, 0, g);
      B(0.16, 0.55, 1, c, 0.63, 0.5, 0, g);
    };
    chair(0xd4c3fa, -1.5, Math.PI / 2);
    chair(0xbfe8d6, 1.5, -Math.PI / 2);
    const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 24), M(0xffffff, { roughness: 0.3 }));
    tb.position.set(0, 0.6, -1.3);
    room.add(tb);
    B(0.08, 0.6, 0.08, 0xe3d9ff, 0, 0.3, -1.3, room);
    B(0.3, 0.14, 0.2, 0xffe0ec, -0.1, 0.7, -1.3, room);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.45, 16), M(0xffd3e4));
    pot.position.set(-3.5, 0.22, -1.8);
    room.add(pot);
    for (let i = 0; i < 8; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), M(i % 3 ? 0xa7dcb6 : 0x8ecfa4));
      l.scale.set(0.35, 1, 0.2);
      const a = (i / 8) * 6.28;
      l.position.set(-3.5 + Math.cos(a) * 0.25, 0.95 + (i % 3) * 0.2, -1.8 + Math.sin(a) * 0.25);
      l.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.6);
      room.add(l);
    }
    B(0.06, 2, 0.06, 0xe3d9ff, 3.5, 1, -1.6, room);
    const shade = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xcdbbff }),
    );
    shade.position.set(3.5, 2.1, -1.6);
    room.add(shade);
    const wl = new THREE.PointLight(0xc4b5fd, 0.6, 9);
    wl.position.set(3.4, 2.2, -1);
    room.add(wl);
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xcdbbff, transparent: true, opacity: 0.9 }),
    );
    orb.position.set(0, 2.7, 0);
    room.add(orb);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd6e8, transparent: true, opacity: 0.35 }),
    );
    halo.position.copy(orb.position);
    room.add(halo);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.025, 10, 80),
      new THREE.MeshBasicMaterial({ color: 0x9fe3c2, transparent: true }),
    );
    ring.position.copy(orb.position);
    ring.rotation.x = Math.PI / 2.4;
    room.add(ring);
    const N = 60,
      DUST = [0xd8c7ff, 0xbda4ff, 0xe3d9ff, 0xc4b5fd, 0xdcd0ff, 0xa78bfa],
      dg = new THREE.BufferGeometry(),
      da = new Float32Array(N * 3),
      dc = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      da.set([(Math.random() - 0.5) * 9, Math.random() * 4, (Math.random() - 0.5) * 4], i * 3);
      const c = new THREE.Color(DUST[i % DUST.length]);
      dc.set([c.r, c.g, c.b], i * 3);
    }
    dg.setAttribute('position', new THREE.BufferAttribute(da, 3));
    dg.setAttribute('color', new THREE.BufferAttribute(dc, 3));
    room.add(
      new THREE.Points(
        dg,
        new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, opacity: 0.85 }),
      ),
    );
    /* ---- people ---- */
    const girl = figure({
        skin: 0xf6cfb3,
        hair: 0x6b4f3f,
        top: 0xdccdfc,
        pants: 0xbcd5f2,
        shoe: 0xffd3e4,
      }),
      th = figure({
        skin: 0xd9aa8a,
        hair: 0x3f3232,
        top: 0xc2ead8,
        pants: 0xb3aecb,
        shoe: 0xdcd0ff,
      });
    sc.add(girl.root, th.root);
    const phone = B(0.12, 0.2, 0.02, 0xf2ecff, 0, -0.5, 0.06, girl.arms[1].el, {
        emissive: 0xd4c6ff,
        emissiveIntensity: 0.6,
      }),
      note = B(0.2, 0.26, 0.03, 0xffffff, 0, -0.5, 0.06, th.arms[1].el);
    const PT = [0.3, 0.25, -0.7, -0.65, -0.7, -0.65, 0.35, -0.7, 0.5],
      PH = [0.45, 0.55, -0.5, -2.4, -0.5, -2.4, 0.45, -1, 0.8],
      PP = [0.2, 0.35, -0.3, -0.4, -0.6, -2, 0.25, -0.2, 0.4],
      PR = [-0.02, 0, -0.15, -0.9, -0.15, -0.9, 0.05, 0.2, 0.1];
    /* ---- bursts when a tab closes ---- */
    const bursts = [],
      PAL = [0xcdb4ff, 0xa78bfa, 0xe3d9ff, 0xbda4ff, 0xcdb4ff, 0x9b7bea];
    const burst = (p) => {
      const n = 40,
        bg2 = new THREE.BufferGeometry(),
        pos = new Float32Array(n * 3),
        col = new Float32Array(n * 3),
        vel = [];
      for (let i = 0; i < n; i++) {
        pos.set([p.x, p.y, p.z], i * 3);
        vel.push(
          new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5)
            .normalize()
            .multiplyScalar(1 + Math.random() * 2),
        );
        const c = new THREE.Color(PAL[Math.floor(Math.random() * PAL.length)]);
        col.set([c.r, c.g, c.b], i * 3);
      }
      bg2.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      bg2.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(
        bg2,
        new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true }),
      );
      sc.add(pts);
      bursts.push({ pts, vel, life: 1 });
    };
    const ss = (a, b, x) => {
        x = Math.min(1, Math.max(0, (x - a) / (b - a)));
        return x * x * (3 - 2 * x);
      },
      lerp = (a, b, t) => a + (b - a) * t;
    const K = [
      [0, [3, 1.7, 5.6], [-1.3, 1.05, 0.3]],
      [0.1, [2.4, 1.6, 4.6], [-0.2, 1.1, 0.3]],
      [0.3, [1.2, 1.5, 3.3], [0, 1.2, 0.4]],
      [0.5, [-0.4, 1.6, 3.5], [0, 1.2, 0.5]],
      [0.57, [0, 1.6, 3.7], [0, 1.2, 0.5]],
      [0.58, [0, 1.5, 7.4], [0, 1, 0]],
      [0.8, [0, 1.4, 6.2], [0, 1.1, 0]],
      [1, [0.5, 1.3, 5.3], [0, 1.2, 0]],
    ];
    const camAt = (p) => {
      let i = 0;
      while (i < K.length - 2 && p > K[i + 1][0]) i++;
      const [p0, a0, l0] = K[i],
        [p1, a1, l1] = K[i + 1],
        t = ss(p0, p1, p);
      return [a0.map((v, k) => lerp(v, a1[k], t)), l0.map((v, k) => lerp(v, l1[k], t))];
    };
    const rs = () => {
      fit();
      rd.setSize(w(), h(), false);
      const a = w() / h();
      K[0][2][0] = -Math.min(2.6, Math.max(1.3, (a - 0.6) * 1.8));
      cam.aspect = a;
      cam.fov = a < 0.9 ? 62 : 42;
      sc.position.y = a < 0.9 ? -0.9 : 0;
      cam.updateProjectionMatrix();
    };
    addEventListener('resize', rs);
    rs();
    const ck = new THREE.Clock();
    let ps = 0,
      id,
      lastCh = -9,
      boltT = 0;
    const loop = () => {
      const dt = Math.min(ck.getDelta(), 0.05),
        t = ck.elapsedTime,
        r = wrap.getBoundingClientRect();
      // the last 100vh of .story is a hold: progress stays at 1 so the end panel lingers before the stage scrolls away
      const span = r.height - stg.clientHeight,
        hold = Math.min(innerHeight, span * 0.5),
        raw = (headerHeight - r.top) / Math.max(1, span - hold);
      hd.classList.toggle('over-story', headerHeight - r.top < span);
      ps += (Math.min(1, Math.max(0, raw)) - ps) * 0.1;
      const p = ps,
        day = p >= 0.575;
      off.visible = !day;
      room.visible = day;
      th.root.visible = day;
      rd.setClearColor(day ? bgD : bg.copy(bgN).lerp(bgM, ss(0.2, 0.56, p)));
      amb.intensity = day ? 0.6 : 0.5 + 0.1 * ss(0.45, 0.56, p);
      /* her pose */
      let wT = 0,
        wH = 0,
        wP = 0,
        wR = 0;
      if (day) wR = 1;
      else {
        const a = ss(0.1, 0.2, p),
          b = ss(0.38, 0.46, p);
        wT = 1 - a;
        wH = a * (1 - b);
        wP = a * b;
      }
      const stress = day ? 0 : 1 - ss(0.47, 0.56, p),
        pose = PT.map((_, k) => PT[k] * wT + PH[k] * wH + PP[k] * wP + PR[k] * wR);
      pose[0] += Math.sin(t * 9) * 0.012 * stress;
      pose[1] += Math.sin(t * 11) * 0.02 * stress + (day ? Math.sin(t * 1.1) * 0.04 : 0);
      pose[3] += Math.sin(t * 14) * 0.06 * wT;
      pose[5] += Math.sin(t * 14 + 1) * 0.06 * wT + (day ? Math.sin(t * 1.8) * 0.12 : 0);
      if (day) pose[7] = 0.15 + 0.65 * ss(0.75, 0.95, p);
      girl.set(pose);
      girl.fx(t, stress * ss(0.12, 0.22, p) * (1 - ss(0.38, 0.46, p)));
      phone.visible = !day && wP > 0.2;
      girl.root.position.set(day ? -1.5 : 0, 0.55, 0);
      girl.root.rotation.y = day ? Math.PI / 2 : 0;
      th.set([-0.02, 0.05 + Math.sin(t * 1.2) * 0.05, -0.15, -0.9, -0.5, -1.3, 0, 0.35, 0.1]);
      th.fx(t, 0);
      th.root.position.set(1.5, 0.55, 0);
      th.root.rotation.y = -Math.PI / 2;
      if (!day) {
        tabs.forEach(({ m }) => {
          const u = m.userData,
            on = p < 0.47 + 0.02 * u.i;
          if (u.was && !on) burst(m.position);
          u.was = on;
          u.s += ((on ? 1 : 0) - u.s) * 0.14;
          m.visible = u.s > 0.02;
          m.scale.setScalar(Math.max(u.s, 0.001));
          const a = u.a0 + t * u.sp * (0.4 + 0.6 * stress);
          m.position.set(
            Math.cos(a) * u.rad + Math.sin(t * 3 + u.i * 5) * 0.15 * stress,
            2.3 + Math.sin(t * 0.6 + u.i) * 0.45,
            Math.sin(a) * u.rad * 0.6 + 0.3,
          );
          m.lookAt(cam.position);
          m.rotateZ(Math.sin(t * 1.7 + u.i) * 0.15 * stress);
        });
        cM.opacity = 0.9 * stress;
        cloud.visible = stress > 0.02;
        cloud.scale.setScalar(0.6 + 0.4 * stress);
        cloud.position.y = 3.5 + Math.sin(t * 0.8) * 0.1;
        if (t > boltT) {
          boltT = t + 0.18 + Math.random() * 0.3;
          const q = [];
          let x = 0;
          for (let i = 0; i < 6; i++) {
            q.push(new THREE.Vector3(x, -0.5 - i * 0.28, 0));
            x += (Math.random() - 0.5) * 0.3;
          }
          bolt.geometry.setFromPoints(q);
        }
        bolt.material.opacity = (Math.sin(t * 20) > 0.3 ? 1 : 0.2) * stress;
        const bs = ss(0.38, 0.43, p) * (1 - ss(0.5, 0.56, p));
        book.visible = bs > 0.02;
        book.scale.setScalar(Math.max(bs, 0.001));
        book.position.y = 2.1 + Math.sin(t * 1.2) * 0.05;
        book.lookAt(cam.position);
      } else {
        sun.position.set(0, lerp(1.4, 2.5, ss(0.58, 1, p)), -3.1);
        const os = ss(0.86, 0.97, p);
        orb.scale.setScalar(Math.max(os, 0.001) * (1 + 0.06 * Math.sin(t * 1.6)));
        halo.scale.setScalar(Math.max(os, 0.001) * (1 + 0.1 * Math.sin(t * 1.6)));
        ring.material.opacity = os * 0.7;
        ring.rotation.z = t * 0.2;
        ring.scale.setScalar(Math.max(os, 0.001));
        for (let i = 0; i < N; i++) {
          let y = da[i * 3 + 1] + dt * 0.12;
          if (y > 4) y = 0;
          da[i * 3 + 1] = y;
        }
        dg.attributes.position.needsUpdate = true;
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.life -= dt * 0.8;
        const q = b.pts.geometry.attributes.position;
        b.vel.forEach((v, k) =>
          q.setXYZ(k, q.getX(k) + v.x * dt, q.getY(k) + v.y * dt, q.getZ(k) + v.z * dt),
        );
        q.needsUpdate = true;
        b.pts.material.opacity = Math.max(b.life, 0);
        if (b.life <= 0 || day) {
          sc.remove(b.pts);
          b.pts.geometry.dispose();
          b.pts.material.dispose();
          bursts.splice(i, 1);
        }
      }
      const [cp, lk] = camAt(p);
      cam.position.set(cp[0] + Math.sin(t * 0.3) * 0.1, cp[1], cp[2]);
      cam.lookAt(lk[0], lk[1], lk[2]);
      rd.render(sc, cam);
      const ho = 1 - ss(0.04, 0.1, p);
      hero.current.style.opacity = ho;
      hero.current.style.visibility = ho < 0.02 ? 'hidden' : 'visible';
      cut.current.style.opacity = Math.max(0, 1 - Math.abs(p - 0.575) / 0.03);
      prog.current.style.height = p * 100 + '%';
      const c = p < 0.12 ? -1 : p < 0.32 ? 0 : p < 0.46 ? 1 : p < 0.6 ? 2 : p < 0.78 ? 3 : p < 0.94 ? 4 : 5;
      if (c !== lastCh) {
        lastCh = c;
        setCh(c);
      }
      const eo = ss(0.93, 0.985, p);
      end.current.style.opacity = eo;
      end.current.style.visibility = eo < 0.02 ? 'hidden' : 'visible';
      id = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(id);
      hd.classList.remove('over-story');
      removeEventListener('resize', rs);
      rd.dispose();
    };
  }, []);
  return (
    <div className="story" ref={wr}>
      <div className="sstage" ref={st}>
        <canvas
          ref={cv}
          aria-label="Illustrated story: a stressed young woman books a session and starts therapy"
        />
        <div className="shero" ref={hero}>
          <span className="tag accent">Mental health, minus the awkwardness</span>
          <h1 style={{ margin: '14px 0' }}>Your brain has enough tabs open.</h1>
          <p>
            Your brain has enough tabs open. Let’s help you close a few.
            Connect with a licensed professional who can help you untangle your thoughts, quiet the mental noise, and feel more in control - one tab at a time.
          </p>
          <div className="row">
            <Link className="btn" to="/book-a-session">
              Talk to someone
            </Link>
            <Link className="btn ghost" to="/shop">
              Explore journals
            </Link>
          </div>
          <p className="scrollhint">
            Licensed professionals • Confidential • Online
            <br />↓ scroll to follow her story
          </p>
        </div>
        {CAPS[ch] && (
          <div className="cap" key={ch}>
            <small>{CAPS[ch][0]}</small>
            <p>{CAPS[ch][1]}</p>
          </div>
        )}
        <div className="cut" ref={cut}>
          later…
        </div>
        <div className="prog">
          <i ref={prog} />
        </div>
        <div className="endp" ref={end}>
          <span className="tag">Your story can start here</span>
          <h1 style={{ margin: '14px 0' }}>Ready to close a few tabs?</h1>
          <p>
            Tell us what’s going on and we’ll match you with a licensed professional. No profile-scrolling, no
            pressure.
          </p>
          <div className="row">
            <Link className="btn" to="/book-a-session">
              Book a session
            </Link>
            <Link className="btn ghost" to="/shop">
              Explore journals
            </Link>
          </div>
          <p style={{ fontSize: '.88rem', marginTop: 18 }}>Licensed professionals • Confidential • Online</p>
        </div>
      </div>
    </div>
  );
}
