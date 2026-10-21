// Public consent-form API. The token in the link is the only key, so it is never sent to analytics.
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const text = (detail, status) => {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length)
    return detail.map((d) => `${d.loc?.slice(-1)[0] ?? 'field'}: ${String(d.msg).replace(/^Value error, /, '')}`).join('; ');
  return status >= 500 ? 'Our server is unavailable right now. Please try again shortly.' : `HTTP ${status}`;
};

async function call(path, { method = 'GET', json, form, keepalive } = {}) {
  let res;
  try {
    res = await fetch(`${API}/v1/consent/${path}`, {
      method,
      keepalive,
      headers: json ? { 'Content-Type': 'application/json' } : undefined,
      body: json ? JSON.stringify(json) : form,
    });
  } catch {
    throw new ApiError('No connection. Your answers will save when you are back online.', 0);
  }
  if (!res.ok) throw new ApiError(text((await res.json().catch(() => ({}))).detail, res.status), res.status);
  return res.json();
}

const t = encodeURIComponent;
export const loadForm = (token) => call(t(token));
export const saveFields = (token, fields, keepalive = false) =>
  call(t(token), { method: 'PATCH', json: fields, keepalive });
export const submitForm = (token, fields) => call(`${t(token)}/submit`, { method: 'POST', json: fields });
export function emailCopy(token, pdfBlob, filename) {
  const form = new FormData();
  form.append('pdf', pdfBlob, filename);
  return call(`${t(token)}/email`, { method: 'POST', form });
}
