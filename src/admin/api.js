// Admin API client. The key lives in sessionStorage only, so it is gone when the tab closes.
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const KEY = 'pk_admin_key';

export const getKey = () => {
  try {
    return sessionStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
};
export const setKey = (k) => {
  try {
    if (k) sessionStorage.setItem(KEY, k);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the key just won't survive a reload */
  }
};

export class AuthError extends Error {}

const message = (detail, status) => {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length)
    return detail.map((d) => `${d.loc?.slice(-1)[0] ?? 'field'}: ${d.msg}`).join('; ');
  return status >= 500 ? 'The API is unavailable. Check that the backend is running.' : `HTTP ${status}`;
};

export async function api(path, { params, method = 'GET', body, key = getKey() } = {}) {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
      )
    : '';
  let res;
  try {
    res = await fetch(`${API}/v1/admin${path}${qs}`, {
      method,
      headers: { 'X-Admin-Key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not reach the API. Check that the backend is running and CORS allows this site.');
  }
  if (res.status === 401) throw new AuthError('That admin key was not accepted.');
  if (!res.ok) throw new Error(message((await res.json().catch(() => ({}))).detail, res.status));
  return res.json();
}
