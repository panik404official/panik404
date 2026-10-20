import { Link } from 'react-router-dom';
import { useAdmin } from '../ctx';
import { CustomerLink, Empty, Loader, ago, money } from '../ui';

function Bars({ daily: rows }) {
  if (!rows.length) return <Empty>No orders in the last 30 days.</Empty>;
  const byDay = Object.fromEntries(rows.map((d) => [d.day, d]));
  const daily = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
    return byDay[d] || { day: d, orders: 0, revenue: 0 };
  });
  const max = Math.max(...daily.map((d) => Number(d.revenue)), 1);
  return (
    <div className="adm-bars" role="img" aria-label="Paid revenue per day, last 30 days">
      {daily.map((d) => (
        <div key={d.day} className="adm-bar" title={`${d.day}: ${money(d.revenue)} from ${d.orders} orders`}>
          <span style={{ height: `${Math.max(2, (Number(d.revenue) / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}

export default function Overview() {
  const { data, error, loading, reload } = useAdmin('/overview');
  const t = data?.totals;
  return (
    <>
      <header className="adm-head">
        <h1>Overview</h1>
        <button className="adm-btn" onClick={reload} disabled={loading}>Refresh</button>
      </header>
      <Loader error={error} loading={loading} onRetry={reload}>
        {data && (
          <>
            <dl className="adm-kpis">
              <div><dt>Paid revenue</dt><dd>{money(t.revenue)}</dd><small>{money(t.revenue_30d)} in 30 days</small></div>
              <div><dt>Customers</dt><dd>{t.customers}</dd><small>{t.customers_7d} new this week</small></div>
              <div><dt>Orders</dt><dd>{t.orders}</dd><small>{t.pending_orders} waiting for payment</small></div>
              <div><dt>Visitors</dt><dd>{t.visitors}</dd><small>{t.visitors_24h} active in 24 h</small></div>
              <div><dt>Corporate leads</dt><dd>{t.leads}</dd></div>
            </dl>
            <section className="adm-panel">
              <h2>Paid revenue, last 30 days</h2>
              <Bars daily={data.daily} />
            </section>
            <div className="adm-cols">
              <section className="adm-panel">
                <h2>Waiting for payment</h2>
                {data.pending.length ? (
                  <ul className="adm-list">
                    {data.pending.map((o) => (
                      <li key={o.id}>
                        <Link to={`/admin/orders/${o.id}`}>#{o.order_no}</Link>
                        <CustomerLink id={o.customer_id} name={o.name} email={o.email} />
                        <span>{o.kind}</span>
                        <strong>{money(o.total, o.currency)}</strong>
                        <small>{ago(o.created_at)}</small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>Nothing pending. New bank-transfer orders appear here.</Empty>
                )}
              </section>
              <section className="adm-panel">
                <h2>By order type</h2>
                <table className="adm-table compact">
                  <thead><tr><th>Type</th><th>Orders</th><th>Paid revenue</th></tr></thead>
                  <tbody>
                    {data.by_kind.map((k) => (
                      <tr key={k.kind}><td>{k.kind}</td><td>{k.orders}</td><td>{money(k.revenue)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          </>
        )}
      </Loader>
    </>
  );
}
