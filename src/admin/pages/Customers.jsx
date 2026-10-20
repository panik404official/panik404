import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAdmin } from '../ctx';
import { Empty, Loader, SearchBox, ago, download, money, toCsv } from '../ui';

const PAGE = 50;

export default function Customers() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') || '';
  const sort = sp.get('sort') || 'recent';
  const offset = Number(sp.get('offset') || 0);
  const nav = useNavigate();
  const set = (k, v) => {
    const n = new URLSearchParams(sp);
    v ? n.set(k, v) : n.delete(k);
    if (k !== 'offset') n.delete('offset');
    setSp(n, { replace: true });
  };
  const { data, error, loading, reload } = useAdmin('/customers', { q, sort, limit: PAGE, offset });

  const exportAll = async () => {
    const rows = [];
    for (let off = 0; ; off += 200) {
      const page = await api('/customers', { params: { q, sort, limit: 200, offset: off } });
      rows.push(...page.items);
      if (rows.length >= page.total || !page.items.length) break;
    }
    download(`panik-customers-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), 'text/csv');
  };

  return (
    <>
      <header className="adm-head">
        <h1>Customers {data && <small>{data.total}</small>}</h1>
        <button className="adm-btn" onClick={exportAll} disabled={!data?.total}>Export CSV</button>
      </header>
      <div className="adm-toolbar">
        <SearchBox value={q} onChange={(v) => set('q', v)} placeholder="Search name, email or phone" />
        <label>
          Sort by{' '}
          <select value={sort} onChange={(e) => set('sort', e.target.value)}>
            <option value="recent">Newest</option>
            <option value="spent">Most spent</option>
            <option value="orders">Most orders</option>
            <option value="last_seen">Last seen</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
      <Loader error={error} loading={loading} onRetry={reload}>
        {data &&
          (data.items.length ? (
            <div className="adm-scroll">
              <table className="adm-table clickable">
                <thead>
                  <tr><th>Customer</th><th>Phone</th><th>Orders</th><th>Spent</th><th>Devices</th><th>Came from</th><th>Last seen</th><th>Joined</th></tr>
                </thead>
                <tbody>
                  {data.items.map((c) => (
                    <tr key={c.id} tabIndex={0} onClick={() => nav(`/admin/customers/${c.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/admin/customers/${c.id}`)}>
                      <td><strong>{c.name || '—'}</strong><small className="block">{c.email}</small></td>
                      <td>{c.phone || '—'}</td>
                      <td>{c.paid_orders}/{c.orders} paid</td>
                      <td>{money(c.spent)}</td>
                      <td>{c.devices}</td>
                      <td>{c.first_source || '—'}</td>
                      <td>{ago(c.last_seen_at)}</td>
                      <td>{ago(c.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>{q ? `No customer matches “${q}”.` : 'No customers yet. They appear after their first checkout.'}</Empty>
          ))}
        {data && data.total > PAGE && (
          <div className="adm-pager">
            <button className="adm-btn" disabled={offset === 0} onClick={() => set('offset', String(Math.max(0, offset - PAGE)))}>Previous</button>
            <span>{offset + 1}–{Math.min(offset + PAGE, data.total)} of {data.total}</span>
            <button className="adm-btn" disabled={offset + PAGE >= data.total} onClick={() => set('offset', String(offset + PAGE))}>Next</button>
          </div>
        )}
      </Loader>
    </>
  );
}
