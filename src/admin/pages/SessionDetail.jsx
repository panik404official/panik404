import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAdmin, useMe } from '../ctx';
import { MeetLink, MeetingState, sessionRelative, sessionWhen, useBusy } from '../meetingUtil';
import { Field, Loader, when } from '../ui';

/** "2026-11-02T16:00" for a datetime-local input, in Pakistan time (what the backend reads it as). */
function pktInput(iso) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function Feedback({ m, canWrite, onSaved }) {
  const [text, setText] = useState(m.feedback || '');
  const [editing, setEditing] = useState(!m.feedback);
  const { busy, err, run } = useBusy();
  useEffect(() => setText(m.feedback || ''), [m.feedback]);

  const save = (e) => {
    e.preventDefault();
    run('save', async () => {
      const r = await api(`/meetings/${m.id}/feedback`, { method: 'POST', body: { feedback: text } });
      setEditing(false);
      onSaved(r);
    });
  };

  if (m.status !== 'ended')
    return (
      <section className="adm-panel">
        <h2>Feedback</h2>
        <p className="adm-muted">
          {m.status === 'cancelled' ? 'This session was cancelled.' : 'Feedback can be added once the session has ended.'}
        </p>
      </section>
    );
  if (!canWrite || (m.feedback && !editing))
    return (
      <section className="adm-panel">
        <h2>Feedback</h2>
        {m.feedback ? (
          <>
            <p className="adm-quote">{m.feedback}</p>
            <p className="adm-sub">
              {m.feedback_by?.name ? `${m.feedback_by.name}, ` : ''}
              {when(m.feedback_at)}
            </p>
            {canWrite && (
              <button className="adm-btn" onClick={() => setEditing(true)}>
                Edit feedback
              </button>
            )}
          </>
        ) : (
          <p className="adm-muted">The psychologist hasn’t written feedback yet.</p>
        )}
      </section>
    );
  return (
    <form className="adm-panel adm-attention adm-form" onSubmit={save}>
      <h2>Your feedback</h2>
      <p className="adm-sub">How the session went, anything to follow up, and suggested next steps. Admins can read this.</p>
      <textarea className="adm-textarea" rows={7} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)}
        aria-label="Session feedback" required />
      {err && <p className="adm-note err" role="alert">{err}</p>}
      <div className="adm-row">
        <button className="adm-btn primary" disabled={busy || !text.trim()}>
          {busy ? 'Saving…' : 'Save feedback'}
        </button>
        {m.feedback && (
          <button type="button" className="adm-btn" onClick={() => { setText(m.feedback); setEditing(false); }}>
            Cancel
          </button>
        )}
        <small className="adm-muted">{text.length} / 5000</small>
      </div>
    </form>
  );
}

function AdminTools({ m, onChanged }) {
  const [link, setLink] = useState('');
  const [start, setStart] = useState(pktInput(m.starts_at));
  const [minutes, setMinutes] = useState(m.minutes);
  const [tell, setTell] = useState(true);
  const { busy, err, run } = useBusy();
  const [ok, setOk] = useState('');
  useEffect(() => {
    setStart(pktInput(m.starts_at));
    setMinutes(m.minutes);
  }, [m.starts_at, m.minutes]);
  const open = m.status === 'scheduled' || m.status === 'live';
  if (!open) return null;

  const act = (name, fn, msg) =>
    run(name, async () => {
      setOk('');
      const r = await fn();
      onChanged(r);
      setOk(msg);
    });

  return (
    <section className="adm-panel">
      <h2>Manage</h2>
      <div className="adm-row">
        <button className="adm-btn" disabled={!!busy} onClick={() => act('regen', () => api(`/meetings/${m.id}/regenerate`, { method: 'POST' }),
          'A new Google Meet link was created and emailed to the client and psychologist.')}>
          {busy === 'regen' ? 'Creating…' : m.meet_url ? 'New Google Meet link' : 'Try Google Meet again'}
        </button>
        {m.meet_url && (
          <button className="adm-btn" disabled={!!busy} onClick={() => act('resend', () => api(`/meetings/${m.id}/resend`, { method: 'POST' }),
            'The link was emailed again to the client and psychologist.')}>
            {busy === 'resend' ? 'Sending…' : 'Email link again'}
          </button>
        )}
      </div>

      <h4>Use another link</h4>
      <div className="adm-linkbox">
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet.google.com/…" aria-label="Meeting link" />
        <button className="adm-btn" disabled={!!busy || !link.trim()} onClick={() => act('link',
          () => api(`/meetings/${m.id}`, { method: 'PATCH', body: { meet_url: link.trim(), notify: tell } }).then((r) => { setLink(''); return r; }),
          tell ? 'Link saved and emailed.' : 'Link saved.')}>
          {busy === 'link' ? 'Saving…' : 'Save link'}
        </button>
      </div>

      <h4>Reschedule</h4>
      <div className="adm-form-grid">
        <label>
          Start (Pakistan time)
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          Length (minutes)
          <input type="number" min={15} max={240} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
        </label>
      </div>
      <div className="adm-row">
        <button className="adm-btn" disabled={!!busy || (start === pktInput(m.starts_at) && minutes === m.minutes)}
          onClick={() => act('time', () => api(`/meetings/${m.id}`, { method: 'PATCH', body: { starts_at: start, minutes, notify: tell } }),
            tell ? 'Rescheduled and emailed.' : 'Rescheduled.')}>
          {busy === 'time' ? 'Saving…' : 'Save new time'}
        </button>
      </div>
      <label className="adm-check">
        <input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} /> Email the client and psychologist about changes
      </label>

      <div className="adm-actions">
        <button className="adm-btn danger" disabled={!!busy} onClick={() =>
          confirm('Cancel this session? The calendar event is removed and the psychologist is told.') &&
          act('cancel', () => api(`/meetings/${m.id}/cancel`, { method: 'POST' }), 'Session cancelled.')}>
          {busy === 'cancel' ? 'Cancelling…' : 'Cancel session'}
        </button>
      </div>
      {err && <p className="adm-note err" role="alert">{err}</p>}
      {ok && <p className="adm-note ok" role="status">{ok}</p>}
    </section>
  );
}

export default function SessionDetail() {
  const { id } = useParams();
  const { data, error, loading, reload } = useAdmin(`/meetings/${id}`);
  const { me, can } = useMe();
  const [m, setM] = useState(null);
  const { busy, err, run } = useBusy();
  useEffect(() => setM(data), [data]);

  // Keep the status current while the page is open around the session time (the server moves it on its own).
  useEffect(() => {
    if (!m || !['scheduled', 'live'].includes(m.status)) return undefined;
    const t = setInterval(() => {
      const edge = m.status === 'scheduled' ? m.starts_at : m.ends_at;
      if (new Date(edge).getTime() <= Date.now()) reload();
    }, 30000);
    return () => clearInterval(t);
  }, [m, reload]);

  const manage = can('consent_manage');
  const mineToRun = m && (manage || m.psychologist?.id === me.id);
  const canWrite = m && (me.role === 'admin' || m.psychologist?.id === me.id);
  const action = (name) =>
    run(name, async () => setM(await api(`/meetings/${id}/${name}`, { method: 'POST' })));

  return (
    <Loader error={error} loading={loading} onRetry={reload}>
      {m && (
        <>
          <p className="adm-crumb">
            <Link to="/admin/sessions">Sessions</Link>
          </p>
          <header className="adm-head">
            <div>
              <h1>
                {m.client_name || 'Session'} <MeetingState m={m} />
              </h1>
              <p className="adm-sub">
                {sessionWhen(m)} ({m.minutes} min){sessionRelative(m) ? `, ${sessionRelative(m)}` : ''}
              </p>
            </div>
            {mineToRun && (m.status === 'scheduled' || m.status === 'live') && (
              <div className="adm-head-actions">
                {m.status === 'scheduled' && (
                  <button className="adm-btn primary" disabled={!!busy} onClick={() => action('start')}>
                    {busy === 'start' ? 'Starting…' : 'Mark as started'}
                  </button>
                )}
                <button className={`adm-btn${m.status === 'live' ? ' primary' : ''}`} disabled={!!busy}
                  onClick={() => (m.status === 'live' || confirm('End this session before it started?')) && action('end')}>
                  {busy === 'end' ? 'Ending…' : 'Mark as ended'}
                </button>
              </div>
            )}
          </header>
          {err && <p className="adm-note err" role="alert">{err}</p>}

          <div className="adm-cols wide-left">
            <div>
              <section className={`adm-panel${m.status === 'live' ? ' adm-live-panel' : ''}`}>
                <h2>Google Meet</h2>
                <MeetLink m={m} />
                {m.link_error && !m.meet_url && (
                  <p className="adm-note err">
                    {manage ? m.link_error : 'The meeting link isn’t ready yet. An admin has been told.'}
                  </p>
                )}
                <p className="adm-sub">
                  {m.status === 'scheduled' && 'This session is marked as started automatically at its start time, and as ended at its end time.'}
                  {m.status === 'live' && `It will be marked as ended automatically at ${new Date(m.ends_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}, or press “Mark as ended” when you finish.`}
                  {m.status === 'ended' && 'The session has ended.'}
                  {m.status === 'cancelled' && 'This session was cancelled.'}
                </p>
              </section>
              <Feedback m={m} canWrite={canWrite} onSaved={setM} />
            </div>
            <div>
              <section className="adm-panel">
                <h2>Details</h2>
                <dl className="adm-fields one">
                  <Field label="Client">{m.client_name}</Field>
                  <Field label="Client email">{m.client_email && <a href={`mailto:${m.client_email}`}>{m.client_email}</a>}</Field>
                  {m.consent?.phone && <Field label="Client phone"><a href={`tel:${m.consent.phone}`}>{m.consent.phone}</a></Field>}
                  <Field label="Psychologist">{m.psychologist?.name}</Field>
                  <Field label="Link sent">{m.invited_at ? when(m.invited_at) : 'Not yet'}</Field>
                  <Field label="Link">{m.link_source === 'manual' ? 'Added by hand' : m.link_source === 'google' ? 'Google Calendar' : 'None'}</Field>
                  <Field label="Started">{m.started_at ? `${when(m.started_at)} (${m.started_how === 'manual' ? 'by hand' : 'automatically'})` : 'Not yet'}</Field>
                  <Field label="Ended">{m.ended_at ? `${when(m.ended_at)} (${m.ended_how === 'manual' ? 'by hand' : 'automatically'})` : 'Not yet'}</Field>
                  {m.cancelled_at && <Field label="Cancelled">{when(m.cancelled_at)}</Field>}
                </dl>
                {m.consent && (
                  <Link className="adm-btn" to={`/admin/consent/${m.consent.id}`}>
                    Open consent form{m.consent.reference ? ` ${m.consent.reference}` : ''}
                  </Link>
                )}
              </section>
              {manage && <AdminTools m={m} onChanged={setM} />}
            </div>
          </div>
        </>
      )}
    </Loader>
  );
}
