import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdmin } from '../ctx';
import { Empty, Loader, SearchBox, download, toCsv, when } from '../ui';

export default function Leads() {
  const [q, setQ] = useState('');
  const { data, error, loading, reload } = useAdmin('/leads', { q, limit: 200 });
  return (
    <>
      <header className="adm-head">
        <h1>Corporate leads</h1>
        <button className="adm-btn" disabled={!data?.items.length} onClick={() => download('panik-leads.csv', toCsv(data.items), 'text/csv')}>Export CSV</button>
      </header>
      <div className="adm-toolbar"><SearchBox value={q} onChange={setQ} placeholder="Search name, email or message" /></div>
      <Loader error={error} loading={loading} onRetry={reload}>
        {data && (data.items.length ? (
          <div className="adm-scroll">
            <table className="adm-table">
              <thead><tr><th>Received</th><th>Name</th><th>Email</th><th>Team size</th><th>Message</th><th>Browser</th></tr></thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l.id}>
                    <td>{when(l.created_at)}</td>
                    <td>{l.customer_id ? <Link to={`/admin/customers/${l.customer_id}`}>{l.name}</Link> : l.name}</td>
                    <td><a href={`mailto:${l.email}`}>{l.email}</a></td><td>{l.team_size ?? '—'}</td>
                    <td className="wrap">{l.message || '—'}</td>
                    <td>{l.visitor_id ? <Link to={`/admin/visitors/${l.visitor_id}`}>Journey</Link> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No corporate enquiries yet.</Empty>)}
      </Loader>
    </>
  );
}
