import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdmin } from '../ctx';
import { Empty, Loader, SearchBox, Status, download, money, toCsv, when } from '../ui';

const STATUS = [
  ['', 'All'],
  ['pending', 'To check'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
];
export const CHECK_LABEL = { pending: 'To check', approved: 'Approved', rejected: 'Rejected' };

export function CheckState({ value }) {
  return <span className={`adm-status v-${value}`}>{CHECK_LABEL[value] || value}</span>;
}

export default function PartnerVerifications() {
  const [status, setStatus] = useState('');
  const [booked, setBooked] = useState('');
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const { data, error, loading, reload } = useAdmin('/partner-verifications', { status, booked, q, limit: 300 });

  const csv = () =>
    download(
      'panik-partner-bookings.csv',
      toCsv(
        data.items.map((r) => ({
          submitted: r.created_at, partner: r.partner_name, id_check: r.status, name: r.name ?? '', email: r.email ?? '',
          phone: r.phone ?? '', employee_id: r.employee_id, order_no: r.order?.order_no ?? '',
          order_status: r.order?.status ?? '', total: r.order?.total ?? '', preferred_date: r.order?.preferred_date ?? '',
          preferred_time: r.order?.preferred_time ?? '', note: r.admin_note,
        })),
      ),
      'text/csv',
    );

  return (
    <>
      <header className="adm-head">
        <h1>
          Partner bookings {data?.pending ? <small>{data.pending} to check</small> : null}
        </h1>
        <button className="adm-btn" disabled={!data?.items.length} onClick={csv}>
          Export CSV
        </button>
      </header>
      <p className="adm-lede">
        Employees of partner companies (Ibex) upload their details and ID card first, then book at the partner discount.
        Check the ID, then mark the booking paid once the transfer arrives.
      </p>
      <div className="adm-toolbar">
        <div className="adm-seg" role="group" aria-label="ID check">
          {STATUS.map(([v, l]) => (
            <button key={l} className={status === v ? 'on' : ''} aria-pressed={status === v} onClick={() => setStatus(v)}>
              {l}
            </button>
          ))}
        </div>
        <label>
          Booking{' '}
          <select value={booked} onChange={(e) => setBooked(e.target.value)}>
            <option value="">Any</option>
            <option value="true">Booked</option>
            <option value="false">Not booked yet</option>
          </select>
        </label>
        <SearchBox value={q} onChange={setQ} placeholder="Search employee ID, or name / email once booked" />
      </div>
      <Loader error={error} loading={loading} onRetry={reload}>
        {data &&
          (data.items.length ? (
            <div className="adm-scroll">
              <table className="adm-table clickable">
                <thead>
                  <tr>
                    <th>Submitted</th>
                    <th>Employee</th>
                    <th>Employee ID</th>
                    <th>ID check</th>
                    <th>Booking</th>
                    <th>Preferred time</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.id} onClick={(e) => !e.target.closest('a,button') && nav(`/admin/partners/${r.id}`)}>
                      <td>{when(r.created_at)}</td>
                      <td>
                        <Link to={`/admin/partners/${r.id}`} className="adm-who">
                          <strong>{r.name || 'Not booked yet'}</strong>
                          <small>{r.email ? `${r.partner_name} · ${r.email}` : r.partner_name}</small>
                        </Link>
                      </td>
                      <td>
                        <code>{r.employee_id}</code>
                      </td>
                      <td>
                        <CheckState value={r.status} />
                      </td>
                      <td>
                        {r.order ? (
                          <>
                            <Link to={`/admin/orders/${r.order.id}`}>#{r.order.order_no}</Link> <Status value={r.order.status} />
                            {!r.order.request_submitted_at && <small className="block">receipt not sent yet</small>}
                          </>
                        ) : (
                          <span className="adm-muted">Not booked yet</span>
                        )}
                      </td>
                      <td>{r.order ? `${r.order.preferred_date || '—'} ${r.order.preferred_time || ''}` : '—'}</td>
                      <td>{r.order ? money(r.order.total) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>{status || booked || q ? 'Nothing matches these filters.' : 'No partner verifications yet.'}</Empty>
          ))}
      </Loader>
    </>
  );
}
