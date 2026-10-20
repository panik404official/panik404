import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdmin } from '../ctx';
import { CustomerLink, EVENT_LABELS, Empty, Loader, MILESTONES, Props, ago, short, when } from '../ui';

export default function Activity() {
  const [type, setType] = useState('');
  const [live, setLive] = useState(true);
  const { data, error, loading, reload } = useAdmin('/events', { type, limit: 200 });
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => document.visibilityState === 'visible' && reload(), 10000);
    return () => clearInterval(t);
  }, [live, reload]);
  return (
    <>
      <header className="adm-head">
        <h1>Live activity</h1>
        <label className="adm-check"><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Refresh every 10 s</label>
      </header>
      <div className="adm-toolbar">
        <select aria-label="Event type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All events</option>
          {Object.entries(EVENT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <Loader error={error} loading={loading && !data} onRetry={reload}>
        {data && (data.items.length ? (
          <div className="adm-scroll">
            <table className="adm-table compact">
              <thead><tr><th>When</th><th>Who</th><th>Event</th><th>Page</th><th>Details</th></tr></thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id} className={MILESTONES.has(e.type) ? 'key' : ''}>
                    <td title={when(e.occurred_at)}>{ago(e.occurred_at)}</td>
                    <td>{e.customer_id ? <CustomerLink id={e.customer_id} name={e.customer_name} email={e.customer_email} /> : <Link to={`/admin/visitors/${e.visitor_id}`}>Visitor <code>{short(e.visitor_id)}</code></Link>}</td>
                    <td>{EVENT_LABELS[e.type] || e.type}</td><td>{e.path || '—'}</td><td><Props value={e.props} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No activity in the last 31 days.</Empty>)}
      </Loader>
    </>
  );
}
