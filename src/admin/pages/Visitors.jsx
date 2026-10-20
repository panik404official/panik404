import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAdmin } from '../ctx';
import { CustomerLink, Empty, Loader, SearchBox, ago, device, short, when } from '../ui';

export default function Visitors() {
  const [sp, setSp] = useSearchParams();
  const params = { identified: sp.get('identified') || '', q: sp.get('q') || '', limit: 50 };
  const set = (k, v) => {
    const n = new URLSearchParams(sp);
    v ? n.set(k, v) : n.delete(k);
    setSp(n, { replace: true });
  };
  const { data, error, loading, reload } = useAdmin('/visitors', params);
  const [more, setMore] = useState({ key: '', items: [], next: null });
  const key = JSON.stringify(params);
  const extra = more.key === key ? more.items : [];
  const next = more.key === key ? more.next : data?.next_before;
  const loadMore = async () => {
    const r = await api('/visitors', { params: { ...params, before: next } });
    setMore({ key, items: [...extra, ...r.items], next: r.next_before });
  };
  const rows = data ? [...data.items, ...extra] : [];
  return (
    <>
      <header className="adm-head"><h1>Visitors</h1><button className="adm-btn" onClick={reload} disabled={loading}>Refresh</button></header>
      <p className="adm-lede">Every browser that opened the site. Anonymous visitors become customers when they check out.</p>
      <div className="adm-toolbar">
        <SearchBox value={params.q} onChange={(v) => set('q', v)} placeholder="Search source, landing page, campaign or customer" />
        <select aria-label="Who" value={params.identified} onChange={(e) => set('identified', e.target.value)}>
          <option value="">Everyone</option>
          <option value="true">Known customers</option>
          <option value="false">Anonymous</option>
        </select>
      </div>
      <Loader error={error} loading={loading} onRetry={reload}>
        {data && (rows.length ? (
          <div className="adm-scroll">
            <table className="adm-table">
              <thead><tr><th>Browser</th><th>Who</th><th>Came from</th><th>Landed on</th><th>Device</th><th>Country</th><th>Visits</th><th>First seen</th><th>Last seen</th></tr></thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id}>
                    <td><Link to={`/admin/visitors/${v.id}`}><code>{short(v.id)}</code></Link></td>
                    <td>{v.customer_id ? <CustomerLink id={v.customer_id} name={v.customer_name} email={v.customer_email} /> : <span className="adm-muted">Anonymous</span>}</td>
                    <td>{v.first_source}{v.first_utm_campaign && <small className="block">{v.first_utm_campaign}</small>}</td>
                    <td>{v.first_landing_path || '—'}</td><td>{device(v.user_agent)}</td><td>{v.country || '—'}</td><td>{v.sessions}</td>
                    <td>{when(v.first_seen_at)}</td><td>{ago(v.last_seen_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No visitors match.</Empty>)}
        {next && <div className="adm-pager"><button className="adm-btn" onClick={loadMore}>Load more</button></div>}
      </Loader>
    </>
  );
}
