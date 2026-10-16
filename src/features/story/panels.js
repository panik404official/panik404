import * as THREE from 'three';
export const TABS = ['work', 'relationships', 'that text from Tuesday', 'money', 'am I overthinking?'];
const rr = (x, a, b, w, h, r) => {
  x.beginPath();
  x.moveTo(a + r, b);
  x.arcTo(a + w, b, a + w, b + h, r);
  x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r);
  x.arcTo(a, b, a + w, b, r);
  x.closePath();
};
export function tabTex(label, mark = '×') {
  const c = document.createElement('canvas');
  c.width = 520;
  c.height = 320;
  const x = c.getContext('2d'),
    t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  const draw = () => {
    x.clearRect(0, 0, 520, 320);
    rr(x, 6, 6, 508, 308, 26);
    x.fillStyle = '#fff';
    x.fill();
    x.lineWidth = 5;
    x.strokeStyle = '#c4b5fd';
    x.stroke();
    x.save();
    rr(x, 6, 6, 508, 308, 26);
    x.clip();
    x.fillStyle = '#ede9fe';
    x.fillRect(6, 6, 508, 70);
    x.restore();
    [
      ['#8b5cf6', 48],
      ['#c4b5fd', 78],
      ['#ddd6fe', 108],
    ].forEach(([c, p]) => {
      x.fillStyle = c;
      x.beginPath();
      x.arc(p, 41, 10, 0, 7);
      x.fill();
    });
    x.fillStyle = mark === '×' ? '#7c3aed' : '#34c38f';
    x.font = '700 40px Nunito,sans-serif';
    x.textAlign = 'right';
    x.fillText(mark, 488, 56);
    x.fillStyle = '#2e1065';
    x.font = '700 42px Nunito,sans-serif';
    x.textAlign = 'center';
    const ls = [];
    let cur = '';
    label.split(' ').forEach((w) => {
      const n = cur ? cur + ' ' + w : w;
      if (x.measureText(n).width > 420 && cur) {
        ls.push(cur);
        cur = w;
      } else cur = n;
    });
    ls.push(cur);
    ls.forEach((l, i) => x.fillText(l, 260, 200 + (i - (ls.length - 1) / 2) * 52));
    t.needsUpdate = true;
  };
  return { t, draw };
}
