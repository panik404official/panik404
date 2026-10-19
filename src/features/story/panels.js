import * as THREE from 'three';
export const TABS = ['work', 'relationships', 'that text from Tuesday', 'money', 'am I overthinking?'];
/* lavender shades keep the story panels within the site palette */
const TABC = ['#eadfff', '#e3d9ff', '#dcd0ff', '#eee8ff', '#e3d9ff', '#d8c7ff'];
const TABD = ['#bda4ff', '#a78bfa', '#9b7bea', '#c4b5fd', '#a995ee', '#8b6bd6'];
const rr = (x, a, b, w, h, r) => {
  x.beginPath();
  x.moveTo(a + r, b);
  x.arcTo(a + w, b, a + w, b + h, r);
  x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r);
  x.arcTo(a, b, a + w, b, r);
  x.closePath();
};
export function tabTex(label, i, mark = '×') {
  const c = document.createElement('canvas');
  c.width = 520;
  c.height = 320;
  const x = c.getContext('2d'),
    t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  const draw = () => {
    x.clearRect(0, 0, 520, 320);
    rr(x, 6, 6, 508, 308, 26);
    const bg = x.createLinearGradient(0, 0, 0, 320);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(1, '#fbf9ff');
    x.fillStyle = bg;
    x.fill();
    x.lineWidth = 4;
    x.strokeStyle = TABD[i];
    x.stroke();
    x.save();
    rr(x, 6, 6, 508, 308, 26);
    x.clip();
    x.fillStyle = TABC[i];
    x.fillRect(6, 6, 508, 70);
    x.restore();
    [
      ['#c4b5fd', 48],
      ['#a78bfa', 78],
      ['#d8c7ff', 108],
    ].forEach(([c, p]) => {
      x.fillStyle = c;
      x.beginPath();
      x.arc(p, 41, 10, 0, 7);
      x.fill();
    });
    x.fillStyle = TABD[i];
    x.font = '700 40px Nunito,sans-serif';
    x.textAlign = 'right';
    x.fillText(mark, 488, 56);
    x.fillStyle = '#4a3f6b';
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
