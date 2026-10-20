import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { EVENT_LABELS, Field, MILESTONES, Props, Status, day, device, money, short, time, when } from './ui';

const DETAIL_LABELS = {
  recipient: 'Recipient',
  recipient_email: 'Recipient email',
  delivery: 'Delivery',
  address: 'Postal address',
  message: 'Gift message',
  discount_pct: 'Bundle discount %',
  preferred_date: 'Preferred date',
  preferred_time: 'Preferred time',
  mode: 'Mode',
  request_submitted_at: 'Receipt submitted',
  coupon: 'Coupon',
};

export function OrderDetails({ details }) {
  const entries = Object.entries(details || {}).filter(([, v]) => v !== null && v !== '' && v !== undefined);
  if (!entries.length) return null;
  return (
    <dl className="adm-fields">
      {entries.map(([k, v]) => (
        <Field key={k} label={DETAIL_LABELS[k] || k}>
          {k.endsWith('_at') ? when(v) : typeof v === 'object' ? JSON.stringify(v) : String(v)}
        </Field>
      ))}
    </dl>
  );
}

const NEXT = { pending: ['paid', 'failed', 'cancelled'], paid: ['refunded'], failed: ['pending', 'cancelled'] };
const VERB = { paid: 'Mark paid', failed: 'Mark failed', cancelled: 'Cancel order', refunded: 'Mark refunded', pending: 'Reopen' };

export function StatusActions({ order, onChanged }) {
  const [busy, setBusy] = useState('');
  const [ref, setRef] = useState('');
  const [err, setErr] = useState('');
  const next = NEXT[order.status] || [];
  if (!next.length) return null;
  const go = async (status) => {
    if (['cancelled', 'refunded'].includes(status) && !confirm(`${VERB[status]} #${order.order_no}? This cannot be undone.`)) return;
    setBusy(status);
    setErr('');
    try {
      await api(`/orders/${order.id}/status`, {
        method: 'PATCH',
        body: { status, provider: status === 'paid' ? 'bank_transfer' : undefined, provider_ref: ref.trim() || undefined },
      });
      setRef('');
      onChanged?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="adm-actions">
      {next.includes('paid') && (
        <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Bank reference (optional)" aria-label="Bank transfer reference" maxLength={200} />
      )}
      {next.map((s) => (
        <button key={s} className={`adm-btn${s === 'paid' ? ' primary' : ''}`} disabled={!!busy} onClick={() => go(s)}>
          {busy === s ? 'Saving…' : VERB[s]}
        </button>
      ))}
      {err && <p className="adm-note err" role="alert">{err}</p>}
    </div>
  );
}

export function OrderCard({ order, onChanged, linkTitle = true }) {
  return (
    <article className="adm-order">
      <header>
        <h3>
          {linkTitle ? <Link to={`/admin/orders/${order.id}`}>Order #{order.order_no}</Link> : `Order #${order.order_no}`}
        </h3>
        <Status value={order.status} />
        <span className="adm-kind">{order.kind}</span>
        <strong className="adm-total">{money(order.total, order.currency)}</strong>
      </header>
      <p className="adm-sub">
        Placed {when(order.created_at)}
        {order.paid_at && <>, paid {when(order.paid_at)}</>}
      </p>
      <div className="adm-scroll">
        <table className="adm-table compact">
          <thead><tr><th>Item</th><th>Unit price</th><th>Qty</th><th>Line total</th></tr></thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.line_no}><td>{i.name} <small>{i.product_id}</small></td><td>{money(i.unit_price)}</td><td>{i.quantity}</td><td>{money(i.line_total)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={3}>Subtotal</td><td>{money(order.subtotal)}</td></tr>
            {Number(order.discount) > 0 && <tr><td colSpan={3}>Discount</td><td>−{money(order.discount)}</td></tr>}
            <tr><td colSpan={3}><strong>Total</strong></td><td><strong>{money(order.total)}</strong></td></tr>
          </tfoot>
        </table>
      </div>
      <OrderDetails details={order.details} />
      {order.payments.length > 0 && (
        <>
          <h4>Payments</h4>
          <ul className="adm-plain">
            {order.payments.map((p) => (
              <li key={p.id}>
                <Status value={p.status} /> {money(p.amount)} via {p.provider}
                {p.provider_ref && <>, reference <code>{p.provider_ref}</code></>}, {when(p.created_at)}
              </li>
            ))}
          </ul>
        </>
      )}
      <StatusActions order={order} onChanged={onChanged} />
    </article>
  );
}

/** Click-stream grouped by day, then by session. `events` may be in any order. */
export function Timeline({ events, sessions = [], newestFirst = true }) {
  const [onlyKey, setOnlyKey] = useState(false);
  if (!events.length) return <p className="adm-empty">No recorded activity yet.</p>;
  const sMap = Object.fromEntries(sessions.map((s) => [s.id, s]));
  const list = [...events]
    .filter((e) => !onlyKey || MILESTONES.has(e.type) || e.type === 'add_to_cart' || e.type === 'product_view')
    .sort((a, b) => (new Date(a.occurred_at) - new Date(b.occurred_at)) * (newestFirst ? -1 : 1));
  const days = [];
  for (const e of list) {
    const d = day(e.occurred_at);
    let g = days[days.length - 1];
    if (!g || g.day !== d) days.push((g = { day: d, sessions: [] }));
    let s = g.sessions[g.sessions.length - 1];
    if (!s || s.id !== e.session_id) g.sessions.push((s = { id: e.session_id, events: [] }));
    s.events.push(e);
  }
  return (
    <div className="adm-timeline">
      <label className="adm-check">
        <input type="checkbox" checked={onlyKey} onChange={(e) => setOnlyKey(e.target.checked)} /> Key moments only (products, cart, checkout, orders)
      </label>
      {days.map((g) => (
        <section key={g.day}>
          <h3 className="adm-day">{g.day}</h3>
          {g.sessions.map((s, i) => {
            const info = sMap[s.id];
            return (
              <div key={`${s.id}-${i}`} className="adm-session">
                <p className="adm-session-head">
                  <span>Visit <code>{short(s.id)}</code></span>
                  {info && (
                    <>
                      <span>Landed on {info.landing_path || '—'}</span>
                      <span>From {info.utm_source || info.referrer_host || 'direct'}{info.utm_campaign && ` (${info.utm_campaign})`}</span>
                      <span>{device(info.user_agent)}</span>
                      {info.country && <span>{info.country}</span>}
                    </>
                  )}
                </p>
                <ol>
                  {s.events.map((e, j) => (
                    <li key={e.id ?? `${e.occurred_at}-${j}`} className={MILESTONES.has(e.type) ? 'key' : ''}>
                      <time>{time(e.occurred_at)}</time>
                      <span className="adm-ev">{EVENT_LABELS[e.type] || e.type}</span>
                      {e.path && <span className="adm-path">{e.path}</span>}
                      <Props value={e.props} />
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

export function VisitorRow({ v }) {
  return (
    <dl className="adm-fields">
      <Field label="Browser ID"><Link to={`/admin/visitors/${v.id}`}><code>{v.id}</code></Link></Field>
      <Field label="Device">{device(v.user_agent)}</Field>
      <Field label="First seen">{when(v.first_seen_at)}</Field>
      <Field label="Last seen">{when(v.last_seen_at)}</Field>
      <Field label="Came from">{v.first_source}</Field>
      <Field label="Referrer">{v.first_referrer || '—'}</Field>
      <Field label="Landing page">{v.first_landing_path}</Field>
      <Field label="Campaign">{[v.first_utm_source, v.first_utm_medium, v.first_utm_campaign].filter(Boolean).join(' / ') || '—'}</Field>
      <Field label="Country">{v.country}</Field>
      <Field label="IP (hashed)"><code>{v.ip_hash ? short(v.ip_hash) : '—'}</code></Field>
      <Field label="User agent"><small>{v.user_agent}</small></Field>
    </dl>
  );
}
