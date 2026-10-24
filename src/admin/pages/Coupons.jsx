import { useState } from 'react';
import { api } from '../api';
import { useAdmin } from '../ctx';
import { CopyButton } from '../consentUtil';
import { Empty, Loader, money } from '../ui';

const KINDS = [
  ['booking', 'Session bookings'],
  ['gift', 'Gift vouchers'],
  ['product', 'Journals'],
];
const STATE = {
  active: ['Active', 's-paid'],
  scheduled: ['Starts later', 's-pending'],
  expired: ['Expired', 's-cancelled'],
  used_up: ['Used up', 's-cancelled'],
  off: ['Off', 's-cancelled'],
};
const BLANK = { code: '', discount_type: 'percent', value: '', applies_to: ['booking', 'gift', 'product'], max_uses: '', starts: '', ends: '', note: '' };

/** "2026-11-30" (Pakistan date) from a stored time, for <input type="date">. */
const pktDate = (iso) =>
  iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date(iso)) : '';
const dateLabel = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' }) : '';

function CouponForm({ initial, onSaved, onCancel }) {
  const editing = Boolean(initial);
  const [f, setF] = useState(
    initial
      ? {
          ...BLANK,
          ...initial,
          value: String(Number(initial.value)),
          max_uses: initial.max_uses ?? '',
          starts: pktDate(initial.starts_at),
          ends: pktDate(initial.expires_at),
          note: initial.note || '',
        }
      : BLANK,
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleKind = (k) =>
    setF({ ...f, applies_to: f.applies_to.includes(k) ? f.applies_to.filter((x) => x !== k) : [...f.applies_to, k] });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const body = {
      discount_type: f.discount_type,
      value: Number(f.value),
      applies_to: f.applies_to,
      max_uses: f.max_uses === '' ? null : Number(f.max_uses),
      // whole days in Pakistan time: from the start of the first day to the end of the last
      starts_at: f.starts ? `${f.starts}T00:00:00+05:00` : null,
      expires_at: f.ends ? `${f.ends}T23:59:59+05:00` : null,
      note: f.note.trim() || null,
    };
    try {
      const saved = editing
        ? await api(`/coupons/${initial.id}`, { method: 'PATCH', body })
        : await api('/coupons', { method: 'POST', body: { ...body, code: f.code } });
      onSaved(saved);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const pct = f.discount_type === 'percent';
  return (
    <form className="adm-panel adm-form" onSubmit={submit}>
      <h2>{editing ? `Edit ${initial.code}` : 'New coupon'}</h2>
      <div className="adm-form-grid">
        <label>
          Code
          <input
            value={f.code}
            onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/\s+/g, '') })}
            maxLength={40}
            required
            disabled={editing}
            placeholder="e.g. WELCOME20"
            style={{ textTransform: 'uppercase' }}
          />
          {editing && <small className="adm-muted">The code can’t change once it exists.</small>}
        </label>
        <label>
          Discount type
          <select value={f.discount_type} onChange={set('discount_type')}>
            <option value="percent">Percent off (%)</option>
            <option value="amount">Amount off (Rs)</option>
          </select>
        </label>
        <label>
          {pct ? 'Percent off' : 'Rupees off'}
          <input
            type="number"
            inputMode="decimal"
            min={1}
            max={pct ? 100 : undefined}
            step={1}
            value={f.value}
            onChange={set('value')}
            required
            placeholder={pct ? '20' : '500'}
          />
        </label>
        <div className="wide adm-kinds" role="group" aria-labelledby="coupon-kinds">
          <span id="coupon-kinds">Works for</span>
          {KINDS.map(([k, l]) => (
            <label key={k}>
              <input type="checkbox" checked={f.applies_to.includes(k)} onChange={() => toggleKind(k)} /> {l}
            </label>
          ))}
        </div>
        <label>
          Can be used (times, in total)
          <input type="number" min={1} value={f.max_uses} onChange={set('max_uses')} placeholder="No limit" />
        </label>
        <label>
          Starts on
          <input type="date" value={f.starts} onChange={set('starts')} />
        </label>
        <label>
          Last day
          <input type="date" value={f.ends} onChange={set('ends')} min={f.starts || undefined} />
        </label>
        <label className="wide">
          Note (only admins see this)
          <input value={f.note} onChange={set('note')} maxLength={200} placeholder="e.g. Instagram giveaway, March" />
        </label>
      </div>
      {err && <p className="adm-note err" role="alert">{err}</p>}
      <div className="adm-row">
        <button className="adm-btn primary" disabled={busy || !f.applies_to.length}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create coupon'}
        </button>
        <button type="button" className="adm-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function Coupons() {
  const { data, error, loading, reload } = useAdmin('/coupons');
  const [mode, setMode] = useState(null); // null | 'new' | coupon being edited
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({});

  const act = async (id, fn, ok) => {
    setBusy(id);
    setMsg({});
    try {
      await fn();
      setMsg({ ok });
      reload();
    } catch (e) {
      setMsg({ err: e.message });
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <header className="adm-head">
        <h1>Coupons</h1>
        <div className="adm-head-actions">
          <button className="adm-btn primary" onClick={() => setMode('new')} disabled={mode === 'new'}>
            New coupon
          </button>
        </div>
      </header>
      <p className="adm-lede">
        Codes customers type at checkout. The discount comes off the price straight away, and the order shows which code
        was used. A cancelled order gives its use back. Only admins can see this page.
      </p>
      {mode && (
        <CouponForm
          key={mode === 'new' ? 'new' : mode.id}
          initial={mode === 'new' ? null : mode}
          onCancel={() => setMode(null)}
          onSaved={(c) => {
            setMode(null);
            setMsg({ ok: `${c.code} saved: ${c.label}.` });
            reload();
          }}
        />
      )}
      {msg.ok && <p className="adm-note ok" role="status">{msg.ok}</p>}
      {msg.err && <p className="adm-note err" role="alert">{msg.err}</p>}
      <Loader error={error} loading={loading} onRetry={reload}>
        {data &&
          (data.items.length ? (
            <div className="adm-scroll">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Discount</th>
                    <th>Works for</th>
                    <th>Used</th>
                    <th>Paid orders</th>
                    <th>Dates</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((c) => {
                    const [label, cls] = STATE[c.state] || [c.state, ''];
                    return (
                      <tr key={c.id}>
                        <td>
                          <strong className="adm-code">{c.code}</strong> <CopyButton text={c.code} label="Copy" />
                          {c.note && <small className="block adm-muted">{c.note}</small>}
                        </td>
                        <td>{c.label}</td>
                        <td>
                          {c.applies_to.length === 3
                            ? 'Everything'
                            : KINDS.filter(([k]) => c.applies_to.includes(k)).map(([, l]) => l).join(', ')}
                        </td>
                        <td>
                          {c.uses}
                          {c.max_uses ? ` of ${c.max_uses}` : ''}
                        </td>
                        <td>
                          {c.paid_orders}
                          {c.paid_orders > 0 && <small className="block">{money(c.discount_given)} off in total</small>}
                        </td>
                        <td>
                          {c.starts_at || c.expires_at ? (
                            <>
                              {c.starts_at && <small className="block">from {dateLabel(c.starts_at)}</small>}
                              {c.expires_at && <small className="block">until {dateLabel(c.expires_at)}</small>}
                            </>
                          ) : (
                            <span className="adm-muted">Any time</span>
                          )}
                        </td>
                        <td>
                          <span className={`adm-status ${cls}`}>{label}</span>
                        </td>
                        <td>
                          <div className="adm-row" style={{ margin: 0, flexWrap: 'nowrap' }}>
                            <button className="adm-btn" onClick={() => setMode(c)}>
                              Edit
                            </button>
                            <button
                              className="adm-btn"
                              disabled={busy === c.id}
                              onClick={() =>
                                act(c.id, () => api(`/coupons/${c.id}`, { method: 'PATCH', body: { active: !c.active } }),
                                  c.active ? `${c.code} switched off. Customers can’t use it now.` : `${c.code} switched on.`)
                              }
                            >
                              {c.active ? 'Switch off' : 'Switch on'}
                            </button>
                            {c.uses === 0 && (
                              <button
                                className="adm-btn danger"
                                disabled={busy === c.id}
                                onClick={() =>
                                  confirm(`Delete ${c.code}?`) &&
                                  act(c.id, () => api(`/coupons/${c.id}`, { method: 'DELETE' }), `${c.code} deleted.`)
                                }
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No coupons yet. Create one and share the code with customers.</Empty>
          ))}
      </Loader>
    </>
  );
}
