import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, AuthError } from './api';

export const money = (v, cur = 'PKR') => {
  const n = Number(v ?? 0);
  const d = Number.isInteger(n) ? 0 : 2;
  return `${cur === 'PKR' ? 'Rs' : cur} ${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};
export const when = (v) =>
  v
    ? new Date(v).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
export const day = (v) =>
  v ? new Date(v).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const time = (v) => (v ? new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');

export function ago(v) {
  if (!v) return '—';
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return day(v);
}

export const short = (id) => (id ? String(id).slice(0, 8) : '—');

export function device(ua) {
  if (!ua) return 'Unknown device';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${br} on ${os}`;
}

export const EVENT_LABELS = {
  page_view: 'Viewed page',
  product_view: 'Viewed product',
  add_to_cart: 'Added to cart',
  remove_from_cart: 'Removed from cart',
  view_cart: 'Opened cart',
  begin_checkout: 'Started checkout',
  booking_step: 'Booking step',
  gift_configure: 'Configured gift',
  cta_click: 'Clicked',
  scroll_depth: 'Scrolled',
  custom: 'Custom event',
  order_created: 'Placed order',
  order_paid: 'Payment confirmed',
  lead_created: 'Sent corporate enquiry',
};
export const MILESTONES = new Set(['order_created', 'order_paid', 'lead_created', 'begin_checkout']);

export function Status({ value }) {
  return <span className={`adm-status s-${value}`}>{value}</span>;
}

export function CustomerLink({ id, name, email }) {
  if (!id) return <span>{name || email || 'Anonymous'}</span>;
  return (
    <Link to={`/admin/customers/${id}`} className="adm-who">
      <strong>{name || email}</strong>
      {name && email && <small>{email}</small>}
    </Link>
  );
}

/** Loads `path` and reloads when deps change. Auth failures bubble up to the login gate. */
export function useApi(path, params, onAuthFail) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const key = JSON.stringify([path, params]);
  const seq = useRef(0);
  const load = useCallback(async () => {
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(path, { params });
      if (n === seq.current) setState({ data, error: null, loading: false });
    } catch (e) {
      if (e instanceof AuthError) onAuthFail?.();
      if (n === seq.current) setState({ data: null, error: e.message, loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load };
}

export function Loader({ error, loading, children, onRetry }) {
  if (error)
    return (
      <div className="adm-note err" role="alert">
        <p>{error}</p>
        {onRetry && (
          <button className="adm-btn" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    );
  if (loading && !children) return <p className="adm-loading">Loading…</p>;
  return children;
}

export function Empty({ children }) {
  return <p className="adm-empty">{children}</p>;
}

export function Props({ value }) {
  if (!value || typeof value !== 'object' || !Object.keys(value).length) return null;
  return (
    <span className="adm-props">
      {Object.entries(value).map(([k, v]) => (
        <code key={k}>
          {k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}
        </code>
      ))}
    </span>
  );
}

export function Field({ label, children }) {
  return (
    <div className="adm-field">
      <dt>{label}</dt>
      <dd>{children ?? '—'}</dd>
    </div>
  );
}

export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}

export function SearchBox({ value, onChange, placeholder }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => v !== value && onChange(v), 300);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      type="search"
      className="adm-search"
      value={v}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => setV(e.target.value)}
    />
  );
}
