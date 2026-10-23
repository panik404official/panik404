// Admin API client. The sign-in token lives in sessionStorage (gone when the tab closes), or in localStorage
// when "Keep me signed in" was ticked.
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN = 'pk_admin_token';

const stores = () => {
  const out = [];
  try {
    out.push(sessionStorage, localStorage);
  } catch {
    /* storage blocked */
  }
  return out;
};
export const getToken = () => {
  for (const s of stores()) {
    const t = s.getItem(TOKEN);
    if (t) return t;
  }
  return '';
};
export const setToken = (token, remember = false) => {
  for (const s of stores()) s.removeItem(TOKEN);
  if (!token) return;
  try {
    (remember ? localStorage : sessionStorage).setItem(TOKEN, token);
  } catch {
    /* storage blocked: the sign-in just won't survive a reload */
  }
};

// The server adds the signed-in user's unread notification count to every panel response, so the bell
// updates as a side effect of normal requests. No polling.
let unreadListener = null;
export const onUnread = (fn) => {
  unreadListener = fn;
};

export class AuthError extends Error {}
export class ForbiddenError extends Error {}

const message = (detail, status) => {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length)
    return detail
      .map((d) => `${d.loc?.slice(-1)[0] ?? 'field'}: ${String(d.msg).replace(/^Value error, /, '')}`)
      .join('; ');
  return status >= 500 ? 'The API is unavailable. Check that the backend is running.' : `HTTP ${status}`;
};

async function request(url, { method = 'GET', body, form, token = getToken() } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : form,
    });
  } catch {
    throw new Error('Could not reach the API. Check that the backend is running and CORS allows this site.');
  }
  const unread = res.headers.get('X-Unread-Notifications');
  if (unread !== null && unreadListener) unreadListener(Number(unread) || 0);
  if (res.status === 401) {
    const detail = (await res.json().catch(() => ({}))).detail;
    throw new AuthError(message(detail, 401) || 'Please sign in again.');
  }
  if (res.status === 403) throw new ForbiddenError(message((await res.json().catch(() => ({}))).detail, 403));
  if (!res.ok) throw new Error(message((await res.json().catch(() => ({}))).detail, res.status));
  return res;
}

const query = (params) =>
  params
    ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))
    : '';

/** /v1/admin/... */
export async function api(path, { params, ...opts } = {}) {
  return (await request(`${API}/v1/admin${path}${query(params)}`, opts)).json();
}
/** /v1/auth/... */
export async function authApi(path, opts = {}) {
  return (await request(`${API}/v1/auth${path}`, opts)).json();
}

/** Fetches a protected file and returns an object URL for <img>. */
export async function apiFileUrl(path) {
  const res = await request(`${API}/v1/admin${path}`);
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), type: blob.type };
}
