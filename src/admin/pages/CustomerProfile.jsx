import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAdmin } from '../ctx';
import { OrderCard, Timeline, VisitorRow } from '../parts';
import { EVENT_LABELS, Empty, Field, Loader, Props, ago, day, device, download, money, short, toCsv, when } from '../ui';

const TABS = ['Timeline', 'Orders', 'Devices & visits', 'All events', 'Enquiries', 'Raw data'];

function waLink(phone) {
  const digits = (phone || '').replace(/[^\d]/g, '').replace(/^0/, '92');
  return digits ? `https://wa.me/${digits}` : null;
}

export default function CustomerProfile() {
  const { id } = useParams();
  const [tab, setTab] = useState(TABS[0]);
  const { data, error, loading, reload } = useAdmin(`/customers/${id}`);
  const c = data?.customer;
  const s = data?.stats;

  return (
    <Loader error={error} loading={loading} onRetry={reload}>
      {data && (
        <>
          <p className="adm-crumb"><Link to="/admin/customers">Customers</Link></p>
          <header className="adm-profile">
            <div className="adm-avatar" aria-hidden="true">{(c.name || c.email)[0].toUpperCase()}</div>
            <div>
              <h1>{c.name || c.email}</h1>
              <p className="adm-contact">
                <a href={`mailto:${c.email}`}>{c.email}</a>
                {c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>}
                {waLink(c.phone) && <a href={waLink(c.phone)} target="_blank" rel="noreferrer">WhatsApp</a>}
              </p>
              <p className="adm-sub">Customer since {day(c.created_at)}, last active {ago(s.last_seen_at)}</p>
            </div>
            <div className="adm-head-actions">
              <button className="adm-btn" onClick={reload} disabled={loading}>Refresh</button>
              <button className="adm-btn" onClick={() => download(`customer-${c.email}.json`, JSON.stringify(data, null, 2))}>Download all data</button>
            </div>
          </header>

          <dl className="adm-kpis small">
            <div><dt>Lifetime value</dt><dd>{money(s.lifetime_value)}</dd></div>
            <div><dt>Paid orders</dt><dd>{s.paid_orders} <small>of {s.orders}</small></dd></div>
            <div><dt>Average order</dt><dd>{s.average_order ? money(s.average_order) : '—'}</dd></div>
            <div><dt>Awaiting payment</dt><dd>{money(s.pending_value)}</dd></div>
            <div><dt>Came from</dt><dd>{s.acquisition_source || '—'}</dd></div>
            <div><dt>First visit to first order</dt><dd>{s.days_to_first_order ?? '—'}{s.days_to_first_order !== null && <small> days</small>}</dd></div>
            <div><dt>Devices / visits / events</dt><dd>{s.devices} / {s.sessions} / {s.events}</dd></div>
          </dl>

          <div className="adm-cols three">
            <section className="adm-panel">
              <h2>Bought</h2>
              {s.products_bought.length ? (
                <ul className="adm-plain">
                  {s.products_bought.map((p) => <li key={p.product_id}>{p.quantity} × {p.name} <small>{money(p.spent)}</small></li>)}
                </ul>
              ) : <Empty>No paid purchases yet.</Empty>}
            </section>
            <section className="adm-panel">
              <h2>Most viewed products</h2>
              {s.products_viewed.length ? (
                <ul className="adm-plain">{s.products_viewed.map((p) => <li key={p.product_id}>{p.product_id} <small>{p.views} views</small></li>)}</ul>
              ) : <Empty>No product views recorded.</Empty>}
            </section>
            <section className="adm-panel">
              <h2>Most visited pages</h2>
              {s.top_pages.length ? (
                <ul className="adm-plain">{s.top_pages.map((p) => <li key={p.path}>{p.path} <small>{p.views}</small></li>)}</ul>
              ) : <Empty>No page views recorded.</Empty>}
            </section>
          </div>

          <div className="adm-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                {t}
                {t === 'Orders' && <small>{data.orders.length}</small>}
                {t === 'Devices & visits' && <small>{data.visitors.length}</small>}
                {t === 'All events' && <small>{s.events}</small>}
                {t === 'Enquiries' && <small>{data.leads.length}</small>}
              </button>
            ))}
          </div>

          <div role="tabpanel" className="adm-tabpanel">
            {tab === 'Timeline' && (
              <>
                {s.events > data.events.length && (
                  <p className="adm-note">Showing the latest {data.events.length} of {s.events} events.</p>
                )}
                <Timeline events={data.events} sessions={data.sessions} />
              </>
            )}

            {tab === 'Orders' &&
              (data.orders.length ? data.orders.map((o) => <OrderCard key={o.id} order={o} onChanged={reload} />) : <Empty>No orders.</Empty>)}

            {tab === 'Devices & visits' && (
              <>
                {data.visitors.map((v) => (
                  <section key={v.id} className="adm-panel">
                    <h2>{device(v.user_agent)}</h2>
                    <VisitorRow v={v} />
                  </section>
                ))}
                <h2 className="adm-h2">Visits</h2>
                <div className="adm-scroll">
                  <table className="adm-table compact">
                    <thead><tr><th>Started</th><th>Last activity</th><th>Landing page</th><th>Source</th><th>Campaign</th><th>Referrer</th><th>Device</th><th>Country</th><th>Events</th></tr></thead>
                    <tbody>
                      {data.sessions.map((x) => (
                        <tr key={x.id}>
                          <td>{when(x.started_at)}</td><td>{when(x.last_seen_at)}</td><td>{x.landing_path || '—'}</td>
                          <td>{x.utm_source || x.referrer_host || 'direct'}</td><td>{x.utm_campaign || '—'}</td>
                          <td className="wrap">{x.referrer || '—'}</td><td>{device(x.user_agent)}</td><td>{x.country || '—'}</td><td>{x.events_loaded}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {tab === 'All events' && (
              <>
                <div className="adm-toolbar">
                  <button className="adm-btn" onClick={() => download(`events-${c.email}.csv`, toCsv(data.events), 'text/csv')} disabled={!data.events.length}>Export events CSV</button>
                </div>
                <div className="adm-scroll">
                  <table className="adm-table compact">
                    <thead><tr><th>When</th><th>Event</th><th>Page</th><th>Details</th><th>Visit</th><th>Browser</th></tr></thead>
                    <tbody>
                      {data.events.map((e) => (
                        <tr key={e.id}>
                          <td>{when(e.occurred_at)}</td><td>{EVENT_LABELS[e.type] || e.type}</td><td>{e.path || '—'}</td>
                          <td><Props value={e.props} /></td><td><code>{short(e.session_id)}</code></td><td><code>{short(e.visitor_id)}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {tab === 'Enquiries' &&
              (data.leads.length ? (
                data.leads.map((l) => (
                  <section key={l.id} className="adm-panel">
                    <h2>Corporate enquiry, {when(l.created_at)}</h2>
                    <dl className="adm-fields">
                      <Field label="Name">{l.name}</Field>
                      <Field label="Email">{l.email}</Field>
                      <Field label="Team size">{l.team_size}</Field>
                    </dl>
                    {l.message && <blockquote className="adm-quote">{l.message}</blockquote>}
                  </section>
                ))
              ) : <Empty>No corporate enquiries from this customer.</Empty>)}

            {tab === 'Raw data' && <pre className="adm-raw">{JSON.stringify(data, null, 2)}</pre>}
          </div>
        </>
      )}
    </Loader>
  );
}
