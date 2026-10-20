import { Link, useParams } from 'react-router-dom';
import { useAdmin } from '../ctx';
import { Timeline, VisitorRow } from '../parts';
import { Empty, Loader, Status, device, money, short, when } from '../ui';

export default function VisitorJourney() {
  const { id } = useParams();
  const { data, error, loading, reload } = useAdmin(`/visitors/${id}/journey`, { limit: 5000 });
  const v = data?.visitor;
  return (
    <Loader error={error} loading={loading} onRetry={reload}>
      {data && (
        <>
          <p className="adm-crumb"><Link to="/admin/visitors">Visitors</Link></p>
          <header className="adm-head">
            <h1>Browser <code>{short(v.id)}</code></h1>
            {v.customer_id && <Link className="adm-btn primary" to={`/admin/customers/${v.customer_id}`}>Open {v.customer_name || v.customer_email}’s profile</Link>}
          </header>
          <section className="adm-panel"><h2>{device(v.user_agent)}</h2><VisitorRow v={v} /></section>
          {data.orders.length > 0 && (
            <section className="adm-panel">
              <h2>Orders from this browser</h2>
              <ul className="adm-plain">
                {data.orders.map((o) => (
                  <li key={o.id}><Link to={`/admin/orders/${o.id}`}>#{o.order_no}</Link> {o.kind} <Status value={o.status} /> {money(o.total, o.currency)} <small>{when(o.created_at)}</small></li>
                ))}
              </ul>
            </section>
          )}
          <h2 className="adm-h2">Activity ({data.events.length} events, {data.sessions.length} visits)</h2>
          {data.events.length ? <Timeline events={data.events} sessions={data.sessions} /> : <Empty>No events recorded.</Empty>}
        </>
      )}
    </Loader>
  );
}
