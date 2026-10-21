import { useCallback, useEffect, useRef, useState } from 'react';

const OUT_W = 600,
  OUT_H = 200,
  INK = '#1B1233';

function drawStroke(c, s, w, h) {
  c.beginPath();
  s.forEach((p, i) => (i ? c.lineTo(p[0] * w, p[1] * h) : c.moveTo(p[0] * w, p[1] * h)));
  if (s.length === 1) c.lineTo(s[0][0] * w + 0.1, s[0][1] * h);
  c.stroke();
}

/**
 * Signature pad. `value` is a PNG data URL (or ''), so a signature saved by someone else on the same link
 * shows up here and can be signed over or cleared. onChange receives the new PNG after every stroke.
 */
export default function SigPad({ id, label, value, onChange, disabled, error }) {
  const canvasRef = useRef(null);
  const strokes = useRef([]);
  const cur = useRef(null);
  const base = useRef(null); // HTMLImageElement of a previously saved signature
  const emitted = useRef(value || '');
  const [has, setHas] = useState(!!value);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, r.width, r.height);
    if (base.current?.complete) ctx.drawImage(base.current, 0, 0, r.width, r.height);
    Object.assign(ctx, { lineWidth: 2.4, lineCap: 'round', lineJoin: 'round', strokeStyle: INK });
    strokes.current.forEach((s) => drawStroke(ctx, s, r.width, r.height));
  }, []);

  const size = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const d = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.round(r.width * d),
      h = Math.round(r.height * d);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.getContext('2d').setTransform(d, 0, 0, d, 0, 0);
    redraw();
  }, [redraw]);

  // A new value from outside (loaded from the server) replaces what is on the pad.
  useEffect(() => {
    if ((value || '') === emitted.current) return;
    emitted.current = value || '';
    strokes.current = [];
    base.current = null;
    if (value) {
      const img = new Image();
      img.onload = redraw;
      img.src = value;
      base.current = img;
    }
    setHas(!!value);
    redraw();
  }, [value, redraw]);

  useEffect(() => {
    if (value) {
      const img = new Image();
      img.onload = redraw;
      img.src = value;
      base.current = img;
    }
    const canvas = canvasRef.current;
    const ro = window.ResizeObserver ? new ResizeObserver(size) : null;
    ro?.observe(canvas);
    window.addEventListener('resize', size);
    size();
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', size);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const png = () => {
    const c = document.createElement('canvas');
    c.width = OUT_W;
    c.height = OUT_H;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, OUT_W, OUT_H);
    if (base.current?.complete) g.drawImage(base.current, 0, 0, OUT_W, OUT_H);
    Object.assign(g, { lineWidth: 3.4, lineCap: 'round', lineJoin: 'round', strokeStyle: INK });
    strokes.current.forEach((s) => drawStroke(g, s, OUT_W, OUT_H));
    return c.toDataURL('image/png');
  };

  const pt = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    ];
  };
  const down = (e) => {
    if (disabled || e.button > 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* not supported */
    }
    size();
    cur.current = [pt(e)];
    strokes.current.push(cur.current);
    setHas(true);
    redraw();
  };
  const move = (e) => {
    if (!cur.current) return;
    e.preventDefault();
    cur.current.push(pt(e));
    redraw();
  };
  const up = () => {
    if (!cur.current) return;
    cur.current = null;
    const out = png();
    emitted.current = out;
    onChange(out);
  };
  const clear = () => {
    strokes.current = [];
    base.current = null;
    emitted.current = '';
    setHas(false);
    redraw();
    onChange('');
  };

  return (
    <div className={`cf-sig${error ? ' invalid' : ''}`} data-k={id}>
      <span className="cf-lab">
        {label} <em>*</em>
      </span>
      <div
        className={`cf-pad${has ? ' has' : ''}${disabled ? ' off' : ''}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onLostPointerCapture={up}
      >
        <canvas ref={canvasRef} aria-label={`${label} drawing area`} role="img" />
        <span className="cf-hint">Sign here</span>
      </div>
      <div className="cf-sig-row">
        <span className="cf-msg" role={error ? 'alert' : undefined}>
          {error}
        </span>
        {!disabled && (
          <button className="cf-btn small quiet" type="button" onClick={clear} disabled={!has}>
            Clear signature
          </button>
        )}
      </div>
    </div>
  );
}
