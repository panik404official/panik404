import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from './api';
import { useAdmin } from './ctx';
import { CustomerLink, Empty, Loader, SearchBox, Status, ago, money, when } from './ui';

export const KIND_LABEL = { product: 'Journals', gift: 'Gift voucher', booking: 'Session booking' };

function Receipt({ value }) {
  if (value === 'stored') return <span>Uploaded</span>;
  if (value === 'emailed') return <span className="adm-muted">Emailed only</span>;
  return <span className="adm-muted">—</span>;
}

/**
 * Orders of one panel section. group "shop" = journals + gift vouchers, "sessions" = session bookings.
 * Filters live in the URL so a filtered list can be bookmarked or shared.
 */
export default function OrderList({ group, kinds = [], prefix = '' }) {
  const [sp, setSp] = useSearchParams();
  const get = (k) => sp.get(prefix + k) || '';
  const params = { group, status: get('status'), kind: get('kind'), q: get('q'), limit: 50 };
  const set = (k, v) => {
    const n = new URLSearchParams(sp);
    v ? n.set(prefix + k, v) : n.delete(prefix + k);
    setSp(n, { replace: true });
  };
  const { data, error, loading, reload } = useAdmin('/orders', params);
  const [more, setMore] = useState({ key: '', items: [], next: null });
  const key = JSON.stringify(params);
  const extra = more.key === key ? more.items : [];
  const next = more.key === key ? more.next : data?.next_before;
  const loadMore = async () => {
    const r = await api('/orders', { params: { ...params, before: next } });
    setMore({ key, items: [...extra, ...r.items], next: r.next_before });
  };
  const rows = data ? [...data.items, ...extra] : [];
  const sessions = group === 'sessions';

  return (
    <>
      <div className="adm-toolbar">
        <SearchBox value={params.q} onChange={(v) => set('q', v)} placeholder="Search order #, name, email or phone" />
        <select aria-label="Status" value={params.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">All statuses</option>
          {['pending', 'paid', 'failed', 'cancelled', 'refunded'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {kinds.length > 1 && (
          <select aria-label="Order type" value={params.kind} onChange={(e) => set('kind', e.target.value)}>
            <option value="">All types</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        )}
        <button className="adm-btn" onClick={reload} disabled={loading}>
          Refresh
        </button>
      </div>
      <Loader error={error} loading={loading} onRetry={reload}>
        {data &&
          (rows.length ? (
            <div className="adm-scroll">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    {sessions ? <th>Preferred time</th> : <th>Type</th>}
                    <th>Receipt</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link to={`/admin/orders/${o.id}`}>#{o.order_no}</Link>
                      </td>
                      <td>
                        <CustomerLink id={o.customer_id} name={o.name} email={o.email} />
                      </td>
                      <td>{o.phone || '—'}</td>
                      {sessions ? (
                        <td>
                          {o.preferred_date ? `${o.preferred_date} ${o.preferred_time || ''}` : '—'}
                          {o.partner_name && <small className="block">{o.partner_name} partner booking</small>}
                        </td>
                      ) : (
                        <td>
                          {KIND_LABEL[o.kind] || o.kind}
                          {o.kind === 'gift' && o.recipient && <small className="block">for {o.recipient}</small>}
                        </td>
                      )}
                      <td>{o.kind === 'product' ? <span className="adm-muted">—</span> : <Receipt value={o.receipt} />}</td>
                      <td>
                        <Status value={o.status} />
                      </td>
                      <td>{money(o.total, o.currency)}</td>
                      <td title={when(o.created_at)}>{ago(o.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>{params.q || params.status || params.kind ? 'Nothing matches these filters.' : 'Nothing here yet.'}</Empty>
          ))}
        {next && (
          <div className="adm-pager">
            <button className="adm-btn" onClick={loadMore}>
              Load older
            </button>
          </div>
        )}
      </Loader>
    </>
  );
}
