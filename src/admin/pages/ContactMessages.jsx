import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdmin } from '../ctx';
import { Empty, Loader, SearchBox, download, toCsv, when } from '../ui';

export default function ContactMessages() {
  const [q, setQ] = useState('');
  const { data, error, loading, reload } = useAdmin('/contact-messages', { q, limit: 200 });
  return (
    <>
      <header className="adm-head">
        <h1>Contact messages</h1>
        <button className="adm-btn" disabled={!data?.items.length} onClick={() => download('panik-contact-messages.csv', toCsv(data.items), 'text/csv')}>
          Export CSV
        </button>
      </header>
      <p className="adm-lede">Sent from the Contact us page. Each one was also emailed to the team.</p>
      <div className="adm-toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search name, email, topic or message" />
      </div>
      <Loader error={error} loading={loading} onRetry={reload}>
        {data &&
          (data.items.length ? (
            <div className="adm-scroll">
              <table className="adm-table">
                <thead>
                  <tr><th>Received</th><th>Name</th><th>Email</th><th>Phone</th><th>Topic</th><th>Message</th></tr>
                </thead>
                <tbody>
                  {data.items.map((m) => (
                    <tr key={m.id}>
                      <td>{when(m.created_at)}</td>
                      <td>{m.customer_id ? <Link to={`/admin/customers/${m.customer_id}`}>{m.name}</Link> : m.name}</td>
                      <td><a href={`mailto:${m.email}`}>{m.email}</a></td>
                      <td>{m.phone || '—'}</td>
                      <td>{m.topic}</td>
                      <td className="wrap">{m.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No messages yet.</Empty>
          ))}
      </Loader>
    </>
  );
}
