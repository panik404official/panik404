import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, loadForm, saveFields, submitForm } from './api';
import { ACK, ACK_CHECK, CONFIRM, INTRO, PANIK_EMAIL, SITE, STEPS, TERMS, checks } from './content';
import { buildPdf, fmtStamp, saveBlob, slug } from './pdf';
import SigPad from './SigPad';
import './consent.css';

// Fields the client fills. Everything here is autosaved as it is typed. The psychologist's part (pname, pqual,
// pcnic, sig_psych) is filled in the panel after the client presses Save.
const FIELDS = [
  'name', 'dob', 'phone', 'email', 'ename', 'ephone', 'date', 'session_time', 'complaint', 'ack', 'gneed', 'gname',
  'grel', 'gift', 'rname', 'rrel', 'rcontact', 'rcode', 'sig_client', 'sig_guardian',
];
const SAVE_DELAY = 700;
const FONTS =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap';

function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const pick = (f) => Object.fromEntries(FIELDS.filter((k) => f[k] !== undefined).map((k) => [k, f[k]]));

function Blocks({ blocks }) {
  return blocks.map((b, i) =>
    typeof b === 'string' ? (
      <p key={i}>{b}</p>
    ) : (
      <ul key={i}>
        {b.ul.map((li) => (
          <li key={li}>{li}</li>
        ))}
      </ul>
    ),
  );
}

function Brand() {
  return (
    <div className="cf-brand">
      <svg width="30" height="16" viewBox="0 0 52 28" fill="none" aria-hidden="true">
        <path d="M7 5 L20 14 L7 23" stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M45 5 L32 14 L45 23" stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <b>PANIK</b>
      <span>Psychological Services &amp; Corporate Wellness</span>
    </div>
  );
}

function Closed({ title, text }) {
  return (
    <div className="cf-page">
      <section className="cf-sheet cf-closed" role="alert">
        <h1>{title}</h1>
        <p>{text}</p>
        <p className="cf-note">
          Need help? Email <a href={`mailto:${PANIK_EMAIL}`}>{PANIK_EMAIL}</a>.
        </p>
      </section>
    </div>
  );
}

export default function ConsentPage() {
  const { token } = useParams();
  const [phase, setPhase] = useState('loading'); // loading | open | submitted | completed | closed | missing
  const [closedText, setClosedText] = useState('');
  const [f, setF] = useState({});
  const [meta, setMeta] = useState({});
  const [er, setEr] = useState({});
  const [summaryErr, setSummaryErr] = useState('');
  const [save, setSave] = useState({ state: 'idle' }); // idle | saving | saved | error
  const [busy, setBusy] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const [showSigned, setShowSigned] = useState(false);

  const pending = useRef({});
  const timer = useRef(null);
  const inFlight = useRef(null);
  const fRef = useRef(f);
  fRef.current = f;

  useEffect(() => {
    if (document.querySelector(`link[href="${FONTS}"]`)) return;
    document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: FONTS }));
  }, []);
  useEffect(() => {
    document.title = 'Panik consent form';
  }, []);

  const handleApiError = useCallback((e) => {
    if (e instanceof ApiError && (e.status === 410 || e.status === 404)) {
      setClosedText(e.message);
      setPhase(e.status === 404 ? 'missing' : 'closed');
      return true;
    }
    return false;
  }, []);

  const apply = useCallback((res) => {
    setMeta({
      reference: res.reference,
      submittedAt: res.submitted_at,
      completedAt: res.completed_at,
      expiresAt: res.expires_at,
      emailed: res.emailed,
    });
    setF((cur) => ({ ...cur, ...res.data }));
    setPhase(res.status === 'completed' ? 'completed' : res.status === 'submitted' ? 'submitted' : 'open');
  }, []);

  /* ---------- load ---------- */
  const load = useCallback(
    async (first) => {
      try {
        const res = await loadForm(token);
        apply(res);
        if (first && res.status === 'open') {
          const missing = {};
          if (!res.data.date) missing.date = todayISO();
          if (Object.keys(missing).length) {
            setF((cur) => ({ ...cur, ...missing }));
            Object.assign(pending.current, missing);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => flushRef.current(), SAVE_DELAY);
          }
        }
      } catch (e) {
        if (!handleApiError(e) && first) {
          setClosedText(e.message);
          setPhase('missing');
        }
      }
    },
    [token, apply, handleApiError],
  );

  /* ---------- autosave ---------- */
  const flush = useCallback(
    async (keepalive = false) => {
      clearTimeout(timer.current);
      if (inFlight.current) {
        await inFlight.current.catch(() => {});
      }
      const batch = pending.current;
      if (!Object.keys(batch).length) return;
      pending.current = {};
      setSave({ state: 'saving' });
      const p = saveFields(token, batch, keepalive);
      inFlight.current = p;
      try {
        await p;
        setSave({ state: Object.keys(pending.current).length ? 'saving' : 'saved', at: Date.now() });
      } catch (e) {
        if (handleApiError(e)) return;
        if (e instanceof ApiError && e.status === 409) {
          load(false);
          return;
        }
        pending.current = { ...batch, ...pending.current }; // keep for the next try
        setSave({ state: 'error', text: e.message });
        clearTimeout(timer.current);
        timer.current = setTimeout(() => flushRef.current(), 4000);
      } finally {
        if (inFlight.current === p) inFlight.current = null;
      }
    },
    [token, handleApiError, load],
  );
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    load(true);
  }, [load]);

  // Save what is left when the tab is hidden or closed; pick up the other person's changes when it comes back.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') flushRef.current(true);
      else if (phase === 'open' && !Object.keys(pending.current).length && !inFlight.current) load(false);
    };
    const onHide = () => flushRef.current(true);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
    };
  }, [phase, load]);

  const set = (k, v) => {
    setF((cur) => ({ ...cur, [k]: v }));
    if (er[k]) setEr((cur) => ({ ...cur, [k]: '' }));
    pending.current[k] = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), SAVE_DELAY);
  };

  /* ---------- submit ---------- */
  const finish = async (e) => {
    e.preventDefault();
    const bad = checks(f).filter((c) => !c.ok);
    if (bad.length) {
      setEr(Object.fromEntries(bad.map((b) => [b.k, b.msg])));
      setSummaryErr(`${bad.length} ${bad.length === 1 ? 'item needs' : 'items need'} attention before signing.`);
      const el = document.querySelector(`[data-k="${bad[0].k}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.querySelector('input,textarea')?.focus({ preventScroll: true });
      return;
    }
    setSummaryErr('');
    setBusy('submit');
    try {
      await flush();
      apply(await submitForm(token, pick(fRef.current)));
      setJustSaved(true);
      setShowSigned(false);
      window.scrollTo(0, 0);
    } catch (err) {
      if (!handleApiError(err)) setSummaryErr(err.message || 'The form could not be saved. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const downloadPdf = async () => {
    setBusy('pdf');
    try {
      const blob = await buildPdf(f, { reference: meta.reference, completedAt: meta.completedAt });
      saveBlob(blob, `Panik-Consent-${slug(f.name)}.pdf`);
    } finally {
      setBusy('');
    }
  };

  /* ---------- render ---------- */
  if (phase === 'loading')
    return (
      <div className="cf-page">
        <p className="cf-loading">Opening your form…</p>
      </div>
    );
  if (phase === 'closed') return <Closed title="This link is closed" text={closedText} />;
  if (phase === 'missing') return <Closed title="This link does not work" text={closedText} />;

  const list = checks(f);
  const done = list.filter((c) => c.ok).length;
  const locked = phase === 'completed' || phase === 'submitted';

  const field = (k, label, { type = 'text', req, full, area, ...rest } = {}) => (
    <div className={`cf-field${full ? ' full' : ''}${er[k] ? ' invalid' : ''}`} data-k={k}>
      <label htmlFor={`cf-${k}`}>
        {label} {req && <em>*</em>}
      </label>
      {area ? (
        <textarea id={`cf-${k}`} rows="3" value={f[k] || ''} onChange={(e) => set(k, e.target.value)} {...rest} />
      ) : (
        <input
          id={`cf-${k}`}
          type={type}
          value={f[k] || ''}
          aria-invalid={Boolean(er[k])}
          onChange={(e) => set(k, e.target.value)}
          {...rest}
        />
      )}
      {er[k] && <span className="cf-msg">{er[k]}</span>}
    </div>
  );

  const doneView = locked && !showSigned;
  return (
    <div className="cf">
      <div className="cf-top">
        <div className="cf-top-in">
          <Brand />
          <div className="cf-spacer" />
          {!locked && (
            <>
              <span className={`cf-save ${save.state}`} role="status" aria-live="polite">
                {save.state === 'saving' && 'Saving…'}
                {save.state === 'saved' && 'All changes saved'}
                {save.state === 'error' && 'Not saved yet, retrying'}
              </span>
              <div className="cf-progress">
                <span>
                  {done} / {list.length} required
                </span>
                <div className="cf-meter">
                  <i style={{ width: `${Math.round((100 * done) / list.length)}%` }} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="cf-page">
        {doneView ? (
          <section className="cf-sheet cf-done">
            {phase === 'submitted' ? (
              <>
                <h1>{justSaved ? 'Saved' : 'Already saved'}{f.name ? `, thank you ${f.name.split(' ')[0]}` : ''}.</h1>
                <p className="cf-intro">
                  Your consent form reached Panik{meta.submittedAt ? ` on ${fmtStamp(meta.submittedAt)}` : ''}. Your
                  psychologist will review it and add their signature. You’ll get the signed copy by email
                  {f.email ? ` at ${f.email}` : ''}.
                </p>
                <div className="cf-cards">
                  <div className="cf-card ok">
                    <h3>Nothing else to do</h3>
                    <p>If something in your answers needs changing, contact Panik and they can send the form back to you.</p>
                    <div className="cf-row">
                      <button className="cf-btn" type="button" onClick={() => setShowSigned(true)}>
                        View your answers
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h1>Signed{f.name ? `, thank you ${f.name.split(' ')[0]}` : ''}.</h1>
                <p className="cf-intro">
                  Your consent form was signed by you and your psychologist
                  {meta.completedAt ? ` on ${fmtStamp(meta.completedAt)}` : ''}. Reference <b>{meta.reference}</b>.
                </p>
                <div className="cf-cards">
                  <div className="cf-card">
                    <h3>Your signed copy</h3>
                    <p>A PDF with your answers, the full terms you agreed to, and both signatures.</p>
                    <div className="cf-row">
                      <button className="cf-btn primary" type="button" onClick={downloadPdf} disabled={busy === 'pdf'}>
                        {busy === 'pdf' ? 'Preparing…' : 'Save PDF'}
                      </button>
                      <button className="cf-btn" type="button" onClick={() => setShowSigned(true)}>
                        View signed form
                      </button>
                    </div>
                  </div>
                  {meta.emailed && (
                    <div className="cf-card ok">
                      <h3>Emailed to you</h3>
                      <p>A copy of the signed PDF was also sent to your email.</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        ) : (
          <form className="cf-sheet" onSubmit={finish} noValidate>
            {locked && (
              <p className="cf-banner">
                {phase === 'completed'
                  ? `Signed ${meta.completedAt ? fmtStamp(meta.completedAt) : ''}.`
                  : `Saved ${meta.submittedAt ? fmtStamp(meta.submittedAt) : ''}.`}{' '}
                This copy is read-only.{' '}
                <button type="button" className="cf-link" onClick={() => setShowSigned(false)}>
                  Back
                </button>
              </p>
            )}
            <fieldset disabled={locked}>
              <div className="cf-hero">
                <div className="cf-eyebrow">
                  <span className="cf-dot" />
                  Confidential client document
                </div>
                <h1>Informed Consent for Psychological Services</h1>
                <p className="cf-intro">{INTRO}</p>
                <ol className="cf-steps">
                  {STEPS.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                {!locked && (
                  <p className="cf-note">
                    Your answers save automatically as you type, so you can leave and come back to this link. Press
                    Save at the end to send the form to Panik.
                  </p>
                )}
              </div>

              <section className="cf-sec">
                <h2>Client information</h2>
                <div className="cf-grid">
                  {field('name', 'Full name', { req: true, full: true, autoComplete: 'name', maxLength: 200 })}
                  {field('dob', 'Date of birth', { type: 'date', req: true, autoComplete: 'bday' })}
                  {field('phone', 'Phone number', { type: 'tel', req: true, autoComplete: 'tel', maxLength: 32 })}
                  {field('email', 'Email address', { type: 'email', req: true, full: true, autoComplete: 'email', maxLength: 320 })}
                  {field('ename', 'Emergency contact name', { req: true, maxLength: 200 })}
                  {field('ephone', 'Emergency contact number', { type: 'tel', req: true, maxLength: 32 })}
                  {field('date', 'Date', { type: 'date' })}
                  {field('session_time', 'Session date and time', { type: 'datetime-local', req: true })}
                  {field('complaint', 'Presenting complaint', { full: true, area: true, maxLength: 4000 })}
                </div>
              </section>

              {TERMS.map((t) => (
                <section className="cf-sec" key={t.title}>
                  <h2>{t.title}</h2>
                  <div className="cf-body">
                    <Blocks blocks={t.blocks} />
                  </div>
                </section>
              ))}

              <section className="cf-sec">
                <h2>{ACK.title}</h2>
                <div className="cf-body">
                  <Blocks blocks={ACK.blocks} />
                </div>
                <label className={`cf-check${er.ack ? ' invalid' : ''}`} data-k="ack">
                  <input type="checkbox" checked={!!f.ack} onChange={(e) => set('ack', e.target.checked)} />
                  <span>{ACK_CHECK}</span>
                </label>
                {er.ack && <div className="cf-msg">{er.ack}</div>}
                <SigPad
                  id="sig_client"
                  label="Client signature"
                  value={f.sig_client || ''}
                  onChange={(v) => set('sig_client', v)}
                  disabled={locked}
                  error={er.sig_client}
                />
              </section>

              <section className="cf-sec">
                <h2>Psychologist details and declaration</h2>
                {phase === 'completed' ? (
                  <>
                    <div className="cf-grid">
                      {field('pname', 'Psychologist’s full name')}
                      {field('pqual', 'Professional qualification')}
                    </div>
                    <div className="cf-sig">
                      <span className="cf-lab">Psychologist signature</span>
                      {f.sig_psych && <img className="cf-sigimg" src={f.sig_psych} alt="Psychologist signature" />}
                    </div>
                  </>
                ) : (
                  <p className="cf-note">
                    Your psychologist completes this part after you press Save. Panik assigns them and they add their
                    details and signature; then the signed copy is emailed to you.
                  </p>
                )}
              </section>

              <section className="cf-sec">
                <h2>Parent or legal guardian</h2>
                <p className="cf-note">
                  Only for clients who need parent or legal guardian consent under applicable law or professional
                  standards.
                </p>
                <label className="cf-check">
                  <input type="checkbox" checked={!!f.gneed} onChange={(e) => set('gneed', e.target.checked)} />
                  <span>This client needs a parent or guardian to consent.</span>
                </label>
                {f.gneed && (
                  <>
                    <div className="cf-grid">
                      {field('gname', 'Parent / guardian name', { req: true, maxLength: 200 })}
                      {field('grel', 'Relationship to client', { req: true, maxLength: 200 })}
                    </div>
                    <SigPad
                      id="sig_guardian"
                      label="Parent / guardian signature"
                      value={f.sig_guardian || ''}
                      onChange={(v) => set('sig_guardian', v)}
                      disabled={locked}
                      error={er.sig_guardian}
                    />
                  </>
                )}
              </section>

              <section className="cf-sec">
                <h2>Referral or gift information</h2>
                <p className="cf-note">Was this session purchased or gifted by someone else?</p>
                <div className="cf-seg" role="radiogroup" aria-label="Session gifted or purchased by someone else">
                  <input type="radio" name="gift" id="cf-gift-no" checked={!f.gift} onChange={() => set('gift', false)} />
                  <label htmlFor="cf-gift-no">No</label>
                  <input type="radio" name="gift" id="cf-gift-yes" checked={!!f.gift} onChange={() => set('gift', true)} />
                  <label htmlFor="cf-gift-yes">Yes</label>
                </div>
                {f.gift && (
                  <div className="cf-grid">
                    {field('rname', 'Name of person who referred or gifted', { maxLength: 200 })}
                    {field('rrel', 'Relationship to client', { maxLength: 200 })}
                    {field('rcontact', 'Contact information (optional)', { maxLength: 200 })}
                    {field('rcode', 'Gift / referral code', { maxLength: 100 })}
                  </div>
                )}
              </section>

              <section className="cf-sec">
                <h2>{CONFIRM.title}</h2>
                <div className="cf-body">
                  <Blocks blocks={CONFIRM.blocks} />
                </div>
                <p className="cf-note">The psychologist’s signature in the section above covers this confirmation.</p>
              </section>
            </fieldset>

            {!locked && (
              <div className="cf-submit">
                {summaryErr && (
                  <div className="cf-summary-err" role="alert">
                    {summaryErr}
                  </div>
                )}
                <div className="cf-row">
                  <button className="cf-btn lime lg" type="submit" disabled={!!busy}>
                    {busy === 'submit' ? 'Saving…' : 'Save'}
                  </button>
                  <span className="cf-note">
                    Sends your form to Panik. After that it can’t be changed here; your psychologist then signs it and
                    you get the signed copy by email.
                  </span>
                </div>
              </div>
            )}
          </form>
        )}
        <p className="cf-foot">Panik · Psychological Services &amp; Corporate Wellness · {SITE}</p>
      </div>
    </div>
  );
}
