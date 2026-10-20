import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAdmin } from '../ctx';
import { CustomerLink, Empty, Loader, SearchBox, Status, ago, money, when } from '../ui';

export default function Orders() {
  const [sp, setSp] = useSearchParams();
  const params = { status: sp.get('status') || '', kind: sp.get('kind') || '', q: sp.get('q') || '', limit: 50 };
  const set = (k, v) => {
    const n = new URLSearchParams(sp);
    v ? n.set(k, v) : n.delete(k);
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

  return (
    <>
      <header className="adm-head"><h1>Orders</h1><button className="adm-btn" onClick={reload} disabled={loading}>Refresh</button></header>
      <div className="adm-toolbar">
        <SearchBox value={params.q} onChange={(v) => set('q', v)} placeholder="Search order #, name, email or phone" />
        <select aria-label="Status" value={params.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">All statuses</option>
          {['pending', 'paid', 'failed', 'cancelled', 'refunded'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="Order type" value={params.kind} onChange={(e) => set('kind', e.target.value)}>
          <option value="">All types</option>
          {['product', 'gift', 'booking'].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <Loader error={error} loading={loading} onRetry={reload}>
        {data && (rows.length ? (
          <div className="adm-scroll">
            <table className="adm-table">
              <thead><tr><th>Order</th><th>Customer</th><th>Phone</th><th>Type</th><th>Status</th><th>Total</th><th>Placed</th><th>Paid</th></tr></thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td><Link to={`/admin/orders/${o.id}`}>#{o.order_no}</Link></td>
                    <td><CustomerLink id={o.customer_id} name={o.name} email={o.email} /></td>
                    <td>{o.phone || '—'}</td><td>{o.kind}</td><td><Status value={o.status} /></td>
                    <td>{money(o.total, o.currency)}</td><td title={when(o.created_at)}>{ago(o.created_at)}</td><td>{o.paid_at ? when(o.paid_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No orders match these filters.</Empty>)}
        {next && <div className="adm-pager"><button className="adm-btn" onClick={loadMore}>Load older orders</button></div>}
      </Loader>
    </>
  );
}
