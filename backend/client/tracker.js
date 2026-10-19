// Drop into the React app as src/utils/tracker.js.  Set VITE_API_URL (e.g. https://api.panik404.com).
// Only call track()/createOrder() after any consent you need has been given (see setTracking).
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const SESSION_TTL_MS = 30 * 60 * 1000;
const K = { vid: 'pk_vid', sid: 'pk_sid', seen: 'pk_seen', ctx: 'pk_ctx' };

const safe = (fn, fallback = null) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};
let enabled = true;
export const setTracking = (on) => {
  enabled = !!on;
};

function newContext() {
  const q = new URLSearchParams(location.search);
  return {
    landing_path: location.pathname,
    referrer: document.referrer || undefined,
    utm_source: q.get('utm_source') || undefined,
    utm_medium: q.get('utm_medium') || undefined,
    utm_campaign: q.get('utm_campaign') || undefined,
  };
}

export function ids() {
  const now = Date.now();
  let vid = safe(() => localStorage.getItem(K.vid));
  if (!vid) {
    vid = crypto.randomUUID();
    safe(() => localStorage.setItem(K.vid, vid));
  }
  let sid = safe(() => localStorage.getItem(K.sid));
  const seen = Number(safe(() => localStorage.getItem(K.seen), 0));
  if (!sid || now - seen > SESSION_TTL_MS) {
    sid = crypto.randomUUID();
    safe(() => localStorage.setItem(K.sid, sid));
    safe(() => localStorage.setItem(K.ctx, JSON.stringify(newContext())));
  }
  safe(() => localStorage.setItem(K.seen, String(now)));
  return { visitor_id: vid, session_id: sid };
}

const context = () => safe(() => JSON.parse(localStorage.getItem(K.ctx)), undefined) || undefined;

let queue = [];
let timer = null;

export function flush() {
  clearTimeout(timer);
  timer = null;
  if (!queue.length) return;
  const events = queue.splice(0, 50);
  const body = JSON.stringify({ ...ids(), context: context(), events });
  fetch(`${API}/v1/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true, // survives page unload
  }).catch(() => {});
  if (queue.length) flush();
}

/** track('add_to_cart', { product_id: 'x', qty: 1 }) — never put personal or health data in props. */
export function track(type, props = {}, path = location.pathname) {
  if (!enabled) return;
  queue.push({ type, path, ts: Date.now(), props });
  if (queue.length >= 20) flush();
  else if (!timer) timer = setTimeout(flush, 2000);
}
export const trackPageView = () => track('page_view');

addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
addEventListener('pagehide', flush);

async function post(path, payload, headers = {}) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ ...ids(), context: context(), ...payload }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
  return res.json();
}

/** Generate the key once per checkout attempt and reuse it when retrying. */
export const createOrder = (payload, idempotencyKey = crypto.randomUUID()) =>
  post('/v1/orders', payload, { 'Idempotency-Key': idempotencyKey });
export const createLead = (payload) => post('/v1/leads', payload);
