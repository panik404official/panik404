import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAdmin, useMe } from '../ctx';
import { ConsentState, CopyButton, consentLink, emailLinkHref } from '../consentUtil';
import { MeetingState } from '../meetingUtil';
import { fmtDT } from '../../consent/pdf';
import { Empty, Loader, SearchBox, ago, when } from '../ui';

const FILTERS = [
  ['', 'All'],
  ['open', 'Waiting for client'],
  ['submitted', 'Filled by client'],
  ['unassigned', 'No psychologist yet'],
  ['completed', 'Signed'],
  ['expired', 'Expired'],
  ['revoked', 'Closed'],
];
const MY_FILTERS = [
  ['', 'All'],
  ['submitted', 'Ready to sign'],
  ['open', 'Waiting for client'],
  ['completed', 'Signed'],
];
const EXPIRY = [
  [1, '1 day'],
  [3, '3 days'],
  [7, '7 days'],
  [14, '14 days'],
  [30, '30 days'],
  ['', 'Never'],
];
const BLANK = { note: '', name: '', email: '', session_time: '', assign_to: '', expires: 7 };

function NewLink({ onCreated, onCancel }) {
  const [f, setF] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const { data: psychs } = useAdmin('/psychologists');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const prefill = Object.fromEntries(
        ['name', 'email', 'session_time'].map((k) => [k, f[k].trim()]).filter(([, v]) => v),
      );
      const form = await api('/consent-forms', {
        method: 'POST',
        body: {
          note: f.note.trim() || null,
          expires_in_days: f.expires === '' ? null : +f.expires,
          prefill,
          assign_to: f.assign_to || null,
        },
      });
      onCreated(form);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="adm-panel adm-form" onSubmit={submit}>
      <h2>New consent link</h2>
      <p className="adm-sub">
        Anything you fill in here appears in the form already. The client can change it, and presses Save when done.
        You can choose the psychologist now or after the client saves.
      </p>
      <div className="adm-form-grid">
        <label>
          Client name
          <input value={f.name} onChange={set('name')} maxLength={200} />
        </label>
        <label>
          Client email
          <input type="email" value={f.email} onChange={set('email')} maxLength={320} />
        </label>
        <label>
          Session date and time
          <input type="datetime-local" value={f.session_time} onChange={set('session_time')} />
        </label>
        <label>
          Link stops working after
          <select value={f.expires} onChange={set('expires')}>
            {EXPIRY.map(([v, l]) => (
              <option key={l} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Psychologist (optional)
          <select value={f.assign_to} onChange={set('assign_to')}>
            <option value="">Choose later</option>
            {psychs?.items.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.qualification ? ` · ${u.qualification}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="wide">
          Private note (only admins see this)
          <input value={f.note} onChange={set('note')} maxLength={200} placeholder="e.g. Referred by HR, first session" />
        </label>
      </div>
      {err && <p className="adm-note err" role="alert">{err}</p>}
      <div className="adm-row">
        <button className="adm-btn primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create link'}
        </button>
        <button type="button" className="adm-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Created({ form, onClose }) {
  const link = consentLink(form.token);
  return (
    <div className="adm-panel adm-created" role="status">
      <h2>Link ready{form.client_name ? ` for ${form.client_name}` : ''}</h2>
      <div className="adm-linkbox">
        <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Consent form link" />
        <CopyButton text={link} className="adm-btn primary" />
      </div>
      <div className="adm-row">
        <a className="adm-btn" href={emailLinkHref(form)}>
          Email it to the client
        </a>
        <a className="adm-btn" href={link} target="_blank" rel="noreferrer">
          Open form
        </a>
        <Link className="adm-btn" to={`/admin/consent/${form.id}`}>
          View details
        </Link>
        <button type="button" className="adm-btn" onClick={onClose}>
          Done
        </button>
      </div>
      <p className="adm-sub">
        {form.expires_at ? `Works until ${when(form.expires_at)}.` : 'Works until you close it.'} Anyone with this link
        can open and fill the form.
      </p>
    </div>
  );
}

export default function ConsentForms() {
  const { can } = useMe();
  const manage = can('consent_manage');
  const [state, setState] = useState(manage ? '' : 'submitted');
  const [q, setQ] = useState('');
  const [mode, setMode] = useState(''); // '' | 'new' | created form
  const nav = useNavigate();
  const { data, error, loading, reload } = useAdmin('/consent-forms', { state, q, limit: 200 });
  const filters = manage ? FILTERS : MY_FILTERS;
  const [closing, setClosing] = useState('');

  const close = async (f) => {
    if (!confirm(`Close the link${f.client_name ? ` for ${f.client_name}` : ''}? It will stop opening for everyone. The saved answers are kept.`))
      return;
    setClosing(f.id);
    try {
      await api(`/consent-forms/${f.id}/revoke`, { method: 'POST' });
      reload();
    } catch (e) {
      alert(e.message);
    } finally {
      setClosing('');
    }
  };

  return (
    <>
      <header className="adm-head">
        <h1>{manage ? 'Consent forms' : 'Your consent forms'}</h1>
        {manage && !mode && (
          <button className="adm-btn primary" onClick={() => setMode('new')}>
            New consent link
          </button>
        )}
      </header>
      <p className="adm-lede">
        {manage
          ? 'Send a client a private link. When they press Save you get a notification; assign a psychologist, who is notified to review and sign.'
          : 'Forms assigned to you. You get a notification when a client has filled one in; open it to review and sign.'}
      </p>
      {mode === 'new' && (
        <NewLink
          onCancel={() => setMode('')}
          onCreated={(form) => {
            setMode(form);
            reload();
          }}
        />
      )}
      {mode && mode !== 'new' && <Created form={mode} onClose={() => setMode('')} />}

      <div className="adm-toolbar">
        <div className="adm-seg" role="group" aria-label="Filter by status">
          {filters.map(([v, l]) => (
            <button key={l} className={state === v ? 'on' : ''} aria-pressed={state === v} onClick={() => setState(v)}>
              {l}
            </button>
          ))}
        </div>
        <SearchBox value={q} onChange={setQ} placeholder="Search client, email, note or reference" />
      </div>
      <Loader error={error} loading={loading} onRetry={reload}>
        {data &&
          (data.items.length ? (
            <div className="adm-scroll">
              <table className="adm-table clickable">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Client</th>
                    <th>Session</th>
                    <th>Status</th>
                    <th>Psychologist</th>
                    {manage && <th>Link</th>}
                    {manage && <th />}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((f) => (
                    <tr key={f.id} onClick={(e) => !e.target.closest('button,a') && nav(`/admin/consent/${f.id}`)}>
                      <td>{when(f.created_at)}</td>
                      <td>
                        <Link to={`/admin/consent/${f.id}`} className="adm-who">
                          <strong>{f.client_name || 'Not filled yet'}</strong>
                          {(f.client_email || f.note) && <small>{f.client_email || f.note}</small>}
                        </Link>
                      </td>
                      <td>
                        {fmtDT(f.session_time) || '—'}
                        {f.meeting && (
                          <small className="block">
                            <MeetingState m={f.meeting} />
                            {!f.meeting.meet_url && f.meeting.status === 'scheduled' && <b className="adm-warn"> no link</b>}
                          </small>
                        )}
                      </td>
                      <td>
                        <ConsentState form={f} />
                        {f.state === 'open' && f.expires_at && <small className="block">link until {when(f.expires_at)}</small>}
                        {f.state === 'submitted' && f.submitted_at && <small className="block">saved {ago(f.submitted_at)}</small>}
                      </td>
                      <td>
                        {f.assigned_to ? (
                          f.assigned_to.name
                        ) : f.state === 'submitted' ? (
                          <b className="adm-warn">Assign now</b>
                        ) : (
                          <span className="adm-muted">Not yet</span>
                        )}
                      </td>
                      {manage && (
                        <td>
                          {f.link_active ? <CopyButton text={consentLink(f.token)} /> : <span className="adm-muted">{f.last_opened_at ? `Opened ${ago(f.last_opened_at)}` : 'Inactive'}</span>}
                        </td>
                      )}
                      {manage && (
                        <td>
                          {f.link_active && (
                            <button className="adm-btn danger" disabled={closing === f.id} onClick={() => close(f)}>
                              {closing === f.id ? 'Closing…' : 'Close link'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>
              {state || q
                ? 'No consent forms match.'
                : manage
                  ? 'No consent links yet. Create one to send to a client.'
                  : 'Nothing assigned to you yet.'}
            </Empty>
          ))}
      </Loader>
    </>
  );
}
