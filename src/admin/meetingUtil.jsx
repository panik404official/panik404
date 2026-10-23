import { useState } from 'react';
import { CopyButton } from './consentUtil';

export const MEETING_LABEL = {
  scheduled: 'Upcoming',
  live: 'In progress',
  ended: 'Ended',
  cancelled: 'Cancelled',
};

export function MeetingState({ m }) {
  if (!m) return null;
  return (
    <span className={`adm-status m-${m.status}`}>
      {m.status === 'live' && <i className="adm-live-dot" aria-hidden="true" />}
      {MEETING_LABEL[m.status] || m.status}
    </span>
  );
}

/** "Mon 2 Nov, 16:00 – 17:00" in the viewer's own time zone. */
export function sessionWhen(m) {
  if (!m) return '—';
  const s = new Date(m.starts_at);
  const e = new Date(m.ends_at);
  const d = s.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const t = (x) => x.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${d}, ${t(s)} – ${t(e)}`;
}

/** "in 3 h", "started 10 min ago", … */
export function sessionRelative(m) {
  if (!m) return '';
  const now = Date.now();
  const s = new Date(m.starts_at).getTime();
  const span = (ms) => {
    const min = Math.round(Math.abs(ms) / 60000);
    if (min < 60) return `${min} min`;
    const h = Math.round(min / 60);
    if (h < 48) return `${h} h`;
    return `${Math.round(h / 24)} days`;
  };
  if (m.status === 'scheduled') return s > now ? `starts in ${span(s - now)}` : 'should have started';
  if (m.status === 'live') return `started ${span(now - new Date(m.started_at || s).getTime())} ago`;
  return '';
}

/** The Meet link with Join + Copy, or what's wrong with it. */
export function MeetLink({ m, compact = false }) {
  if (!m) return null;
  if (!m.meet_url)
    return (
      <span className="adm-muted">
        No link yet{!compact && m.link_error ? `: ${m.link_error}` : ''}
      </span>
    );
  const open = m.status === 'scheduled' || m.status === 'live';
  if (compact)
    return open ? (
      <a href={m.meet_url} target="_blank" rel="noreferrer">
        Join
      </a>
    ) : (
      <span className="adm-muted">—</span>
    );
  return (
    <div className="adm-meet">
      <code>{m.meet_url.replace(/^https:\/\//, '')}</code>
      {open && (
        <a className="adm-btn primary" href={m.meet_url} target="_blank" rel="noreferrer">
          Join Google Meet
        </a>
      )}
      <CopyButton text={m.meet_url} />
    </div>
  );
}

/** Tiny hook for one-button-at-a-time actions with an error message. */
export function useBusy() {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const run = async (name, fn) => {
    setBusy(name);
    setErr('');
    try {
      return await fn();
    } catch (e) {
      setErr(e.message);
      return null;
    } finally {
      setBusy('');
    }
  };
  return { busy, err, setErr, run };
}
