import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAdmin, useMe } from '../ctx';
import { MeetLink, MeetingState, sessionRelative, sessionWhen } from '../meetingUtil';
import OrderList from '../OrderList';
import { Empty, Loader, SearchBox } from '../ui';

const VIEWS = [
  ['upcoming', 'Upcoming'],
  ['today', 'Today'],
  ['needs_feedback', 'Needs feedback'],
  ['no_link', 'No link'],
  ['past', 'Past'],
  ['all', 'All'],
];

function OnlineSessions({ manage }) {
  const [view, setView] = useState('upcoming');
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const params = {
    when: ['upcoming', 'today', 'past'].includes(view) ? view : '',
    status: ['needs_feedback', 'no_link'].includes(view) ? view : '',
    q,
    limit: 200,
  };
  const { data, error, loading, reload } = useAdmin('/meetings', params);
  const c = data?.counts || {};
  const badge = { upcoming: c.upcoming, needs_feedback: c.needs_feedback, no_link: c.no_link };

  return (
    <>
      <div className="adm-toolbar">
        <div className="adm-seg" role="group" aria-label="Show">
          {VIEWS.filter(([v]) => manage || v !== 'no_link').map(([v, l]) => (
            <button key={v} className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
              {l}
              {badge[v] ? <small className="adm-count">{badge[v]}</small> : null}
            </button>
          ))}
        </div>
        <SearchBox value={q} onChange={setQ} placeholder={manage ? 'Search client or psychologist' : 'Search client'} />
        <button className="adm-btn" onClick={reload} disabled={loading}>
          Refresh
        </button>
      </div>
      {c.live > 0 && view !== 'past' && (
        <p className="adm-note ok" role="status">
          {c.live === 1 ? 'A session is in progress right now.' : `${c.live} sessions are in progress right now.`}
        </p>
      )}
      <Loader error={error} loading={loading} onRetry={reload}>
        {data &&
          (data.items.length ? (
            <div className="adm-scroll">
              <table className="adm-table clickable">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Client</th>
                    {manage && <th>Psychologist</th>}
                    <th>Status</th>
                    <th>Meet</th>
                    <th>Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((m) => (
                    <tr key={m.id} className={m.status === 'live' ? 'adm-row-live' : ''}
                      onClick={(e) => !e.target.closest('a,button') && nav(`/admin/sessions/${m.id}`)}>
                      <td>
                        <Link to={`/admin/sessions/${m.id}`}>{sessionWhen(m)}</Link>
                        {sessionRelative(m) && <small className="block">{sessionRelative(m)}</small>}
                      </td>
                      <td>
                        <strong>{m.client_name || '—'}</strong>
                        {m.client_email && <small className="block">{m.client_email}</small>}
                      </td>
                      {manage && <td>{m.psychologist?.name || <span className="adm-muted">Nobody</span>}</td>}
                      <td>
                        <MeetingState m={m} />
                      </td>
                      <td>
                        <MeetLink m={m} compact />
                      </td>
                      <td>
                        {m.has_feedback ? 'Written' : m.status === 'ended' ? <strong className="adm-warn">Missing</strong> : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>
              {view === 'upcoming'
                ? 'No upcoming sessions. A session appears here once a client has saved their consent form and a psychologist is assigned.'
                : 'Nothing here.'}
            </Empty>
          ))}
      </Loader>
    </>
  );
}

export default function Sessions() {
  const { can } = useMe();
  const seeMeetings = can(['consent_manage', 'consent_assigned']);
  const seeBookings = can('orders');
  const manage = can('consent_manage');
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') === 'bookings' && seeBookings) || !seeMeetings ? 'bookings' : 'online';
  const go = (t) => setSp(t === 'bookings' ? { tab: 'bookings' } : {}, { replace: true });

  return (
    <>
      <header className="adm-head">
        <h1>Sessions</h1>
      </header>
      {seeMeetings && seeBookings && (
        <div className="adm-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'online'} className={tab === 'online' ? 'on' : ''} onClick={() => go('online')}>
            Online sessions
          </button>
          <button role="tab" aria-selected={tab === 'bookings'} className={tab === 'bookings' ? 'on' : ''} onClick={() => go('bookings')}>
            Booking requests
          </button>
        </div>
      )}
      {tab === 'online' ? (
        <>
          <p className="adm-lede">
            {manage
              ? 'Every Google Meet session. Each one starts and ends on its own at the scheduled time; the psychologist can also start or end it by hand and add feedback afterwards.'
              : 'Your Google Meet sessions. They start and end on their own at the scheduled time, or you can start and end them yourself. Add feedback once a session has ended.'}
          </p>
          <OnlineSessions manage={manage} />
        </>
      ) : (
        <>
          <p className="adm-lede">
            Session bookings paid by bank transfer. Check the receipt, mark the booking paid, then send the client
            their consent form link.
          </p>
          <OrderList group="sessions" prefix="b_" />
        </>
      )}
    </>
  );
}
