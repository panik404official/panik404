// Client for the Panik API (backend/). In dev, Vite proxies /v1 to the API; in production set VITE_API_URL.
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

// The site uses HashRouter, so the route lives in the hash (#/shop), not in location.pathname.
const currentPath = () =>
  location.hash.startsWith('#/') ? location.hash.slice(1).split('?')[0] : location.pathname;

function newContext() {
  const q = new URLSearchParams(location.search);
  return {
    landing_path: currentPath(),
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
export function track(type, props = {}, path = currentPath()) {
  if (!enabled) return;
  queue.push({ type, path, ts: Date.now(), props });
  if (queue.length >= 20) flush();
  else if (!timer) timer = setTimeout(flush, 2000);
}
export const trackPageView = (path) => track('page_view', {}, path);

addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
addEventListener('pagehide', flush);

// FastAPI returns validation errors as a list of { loc, msg }; turn them into one readable sentence.
const errorText = (detail, status) => {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail
      .map((d) => `${d.loc?.slice(-1)[0] ?? 'field'}: ${String(d.msg).replace(/^Value error, /, '')}`)
      .join('; ');
  }
  return status >= 500 ? 'Our server is unavailable right now. Please try again shortly.' : `HTTP ${status}`;
};

async function post(path, payload, headers = {}) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ ...ids(), context: context(), ...payload }),
  });
  if (!res.ok) throw new Error(errorText((await res.json().catch(() => ({}))).detail, res.status));
  return res.json();
}

// Multipart upload: JSON details in "data" plus the payment receipt file.
async function postWithReceipt(path, data, receipt) {
  const form = new FormData();
  form.append('data', JSON.stringify(data));
  form.append('receipt', receipt);
  const res = await fetch(`${API}${path}`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(errorText((await res.json().catch(() => ({}))).detail, res.status));
  return res.json();
}

/** Emails the team (and the recipient, for emailed gifts) after the gift order exists. */
export const sendGiftRequest = (orderId, { coupon }, receipt) =>
  postWithReceipt('/v1/gifts/request', { order_id: orderId, coupon: coupon || null }, receipt);
/** Emails the screening answers to the team with the receipt. The answers are never stored. */
export const sendBookingRequest = (orderId, fields, receipt) =>
  postWithReceipt('/v1/bookings/request', { order_id: orderId, ...fields }, receipt);

/** Generate the key once per checkout attempt and reuse it when retrying. */
export const createOrder = (payload, idempotencyKey = crypto.randomUUID()) =>
  post('/v1/orders', payload, { 'Idempotency-Key': idempotencyKey });
export const createLead = (payload) => post('/v1/leads', payload);
