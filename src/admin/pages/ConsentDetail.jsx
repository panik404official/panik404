import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAdmin, useMe } from '../ctx';
import { ConsentState, CopyButton, consentLink, emailLinkHref } from '../consentUtil';
import { buildPdf, fmtDate, fmtDT, saveBlob, slug } from '../../consent/pdf';
import SigPad from '../../consent/SigPad';
import '../../consent/consent.css';
import { Field, Loader, download, when } from '../ui';

function AssignPanel({ f, onDone }) {
  const { data } = useAdmin('/psychologists');
  const [pick, setPick] = useState(f.assigned_to?.id || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({});
  const save = async () => {
    setBusy(true);
    setMsg({});
    try {
      const r = await api(`/consent-forms/${f.id}/assign`, { method: 'POST', body: { user_id: pick || null } });
      setMsg({ ok: r.assigned_to ? `Assigned to ${r.assigned_to.name}. They’ve been notified.` : 'Unassigned.' });
      onDone();
    } catch (e) {
      setMsg({ err: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={`adm-panel${f.state === 'submitted' && !f.assigned_to ? ' adm-attention' : ''}`}>
      <h2>Psychologist</h2>
      {f.state === 'submitted' && !f.assigned_to && (
        <p className="adm-sub">The client has filled this form. Choose who reviews and signs it.</p>
      )}
      <div className="adm-linkbox">
        <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Psychologist">
          <option value="">Nobody yet</option>
          {data?.items.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
              {u.qualification ? ` · ${u.qualification}` : ''}
            </option>
          ))}
        </select>
        <button className="adm-btn primary" onClick={save} disabled={busy || pick === (f.assigned_to?.id || '')}>
          {busy ? 'Saving…' : f.assigned_to ? 'Reassign' : 'Assign'}
        </button>
      </div>
      {data && !data.items.length && (
        <p className="adm-sub">
          No psychologists yet. Add one on the <Link to="/admin/users">Users</Link> page.
        </p>
      )}
      {f.assigned_at && <p className="adm-sub">Assigned {when(f.assigned_at)}.</p>}
      {msg.ok && <p className="adm-note ok" role="status">{msg.ok}</p>}
      {msg.err && <p className="adm-note err" role="alert">{msg.err}</p>}
    </section>
  );
}

function SignPanel({ f, me, onSigned }) {
  const [p, setP] = useState({ pname: me.name || '', pqual: me.qualification || '', sig_psych: '' });
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const sign = async (e) => {
    e.preventDefault();
    if (!p.pname.trim()) return setErr('Enter your full name.');
    if (!p.sig_psych) return setErr('Draw your signature.');
    setBusy('sign');
    setErr('');
    try {
      const signed = await api(`/consent-forms/${f.id}/sign`, {
        method: 'POST',
        body: { pname: p.pname.trim(), pqual: p.pqual.trim() || null, sig_psych: p.sig_psych },
      });
      // Build the signed PDF here and email it to Panik and the client.
      setBusy('email');
      let emailed = '';
      try {
        const blob = await buildPdf(signed.data, { reference: signed.reference, completedAt: signed.completed_at });
        const form = new FormData();
        form.append('pdf', blob, `Panik-Consent-${slug(signed.data.name)}-${signed.reference}.pdf`);
        const r = await api(`/consent-forms/${f.id}/email`, { method: 'POST', form });
        emailed = `Signed. The PDF was emailed to ${r.to.join(' and ')}.`;
      } catch (mailErr) {
        emailed = `Signed. The email could not be sent (${mailErr.message}); download the PDF and send it yourself.`;
      }
      onSigned(emailed);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy('');
    }
  };
  return (
    <form className="adm-panel adm-attention adm-form" onSubmit={sign}>
      <h2>Your part: review and sign</h2>
      <p className="adm-sub">
        Read the client’s answers, then confirm: you explained the services, the limits of confidentiality and the
        client’s rights, and gave them the chance to ask questions.
      </p>
      <div className="adm-form-grid">
        <label>
          Psychologist’s full name
          <input value={p.pname} onChange={set('pname')} required maxLength={200} />
        </label>
        <label>
          Professional qualification
          <input value={p.pqual} onChange={set('pqual')} maxLength={200} />
        </label>
      </div>
      <div className="cf-embed">
        <SigPad id="sig_psych" label="Psychologist signature" value={p.sig_psych} onChange={(v) => setP((x) => ({ ...x, sig_psych: v }))} />
      </div>
      {err && <p className="adm-note err" role="alert">{err}</p>}
      <div className="adm-row">
        <button className="adm-btn primary" disabled={!!busy}>
          {busy === 'sign' ? 'Signing…' : busy === 'email' ? 'Emailing the PDF…' : 'Sign and complete'}
        </button>
      </div>
    </form>
  );
}

const yes = (v) => (v === true ? 'Yes' : v === false ? 'No' : null);

function Sig({ label, src }) {
  return (
    <figure className="adm-sigimg">
      <figcaption>{label}</figcaption>
      {src ? <img src={src} alt={`${label}`} /> : <span className="adm-muted">Not signed</span>}
    </figure>
  );
}

export default function ConsentDetail() {
  const { id } = useParams();
  const { data: f, error, loading, reload } = useAdmin(`/consent-forms/${id}`);
  const { me, can } = useMe();
  const manage = can('consent_manage');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');

  const reopen = async () => {
    if (!confirm('Send this form back to the client? Their link opens again so they can change answers and press Save again.')) return;
    setBusy('reopen');
    setErr('');
    try {
      await api(`/consent-forms/${id}/reopen`, { method: 'POST' });
      reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const close = async () => {
    if (!confirm('Close this link? It will stop opening for everyone. The saved answers are kept.')) return;
    setBusy('close');
    setErr('');
    try {
      await api(`/consent-forms/${id}/revoke`, { method: 'POST' });
      reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };
  const pdf = async () => {
    setBusy('pdf');
    setErr('');
    try {
      const blob = await buildPdf(f.data, { reference: f.reference, completedAt: f.completed_at });
      saveBlob(blob, `Panik-Consent-${slug(f.data.name)}${f.reference ? '-' + f.reference : '-draft'}.pdf`);
    } catch (e) {
      setErr(`The PDF could not be built: ${e.message}`);
    } finally {
      setBusy('');
    }
  };

  return (
    <Loader error={error} loading={loading} onRetry={reload}>
      {f && (
        <>
          <p className="adm-crumb">
            <Link to="/admin/consent">Consent forms</Link>
          </p>
          <header className="adm-head">
            <div>
              <h1>
                {f.data.name || 'Not filled yet'} <ConsentState form={f} />
              </h1>
              <p className="adm-sub">
                {f.reference ? `Reference ${f.reference} · ` : ''}
                {f.note || 'No note'}
              </p>
            </div>
            <div className="adm-head-actions">
              {manage && f.link_active && <CopyButton text={consentLink(f.token)} />}
              {manage && f.link_active && f.state === 'open' && (
                <a className="adm-btn" href={emailLinkHref(f)}>
                  Email link
                </a>
              )}
              <button className="adm-btn" onClick={pdf} disabled={busy === 'pdf'}>
                {busy === 'pdf' ? 'Building…' : f.status === 'completed' ? 'Download signed PDF' : 'Download draft PDF'}
              </button>
              <button className="adm-btn" onClick={() => download(`consent-${f.reference || f.id}.json`, JSON.stringify(f, null, 2))}>
                Raw JSON
              </button>
              {manage && f.state === 'submitted' && (
                <button className="adm-btn" onClick={reopen} disabled={busy === 'reopen'}>
                  {busy === 'reopen' ? 'Reopening…' : 'Send back to client'}
                </button>
              )}
              {manage && f.status !== 'revoked' && f.status !== 'completed' && (
                <button className="adm-btn danger" onClick={close} disabled={busy === 'close'}>
                  {busy === 'close' ? 'Closing…' : 'Close link'}
                </button>
              )}
            </div>
          </header>
          {err && <p className="adm-note err" role="alert">{err}</p>}
          {flash && <p className="adm-note ok" role="status">{flash}</p>}
          {f.state === 'open' && (
            <p className="adm-note">The client hasn’t pressed Save yet. Answers below update as they type.</p>
          )}

          <div className="adm-cols wide-left">
            <div>
              {f.status === 'submitted' && (manage || f.assigned_to?.id === me.id) && (
                <SignPanel
                  f={f}
                  me={me}
                  onSigned={(text) => {
                    setFlash(text);
                    reload();
                    window.scrollTo(0, 0);
                  }}
                />
              )}
              <section className="adm-panel">
                <h2>Client</h2>
                <dl className="adm-fields">
                  <Field label="Full name">{f.data.name}</Field>
                  <Field label="Date of birth">{fmtDate(f.data.dob) || null}</Field>
                  <Field label="Phone">{f.data.phone}</Field>
                  <Field label="Email">{f.data.email && <a href={`mailto:${f.data.email}`}>{f.data.email}</a>}</Field>
                  <Field label="Emergency contact">{f.data.ename}</Field>
                  <Field label="Emergency number">{f.data.ephone}</Field>
                  <Field label="Date">{fmtDate(f.data.date) || null}</Field>
                  <Field label="Session">{fmtDT(f.data.session_time) || null}</Field>
                  <Field label="Consent box ticked">{yes(f.data.ack)}</Field>
                </dl>
                {f.data.complaint && (
                  <>
                    <h4>Presenting complaint</h4>
                    <p className="adm-quote">{f.data.complaint}</p>
                  </>
                )}
              </section>
              <section className="adm-panel">
                <h2>Psychologist</h2>
                <dl className="adm-fields">
                  <Field label="Name">{f.data.pname}</Field>
                  <Field label="Qualification">{f.data.pqual}</Field>
                </dl>
              </section>
              <section className="adm-panel">
                <h2>Guardian and gift</h2>
                <dl className="adm-fields">
                  <Field label="Needs guardian consent">{yes(f.data.gneed) || 'No'}</Field>
                  {f.data.gneed && <Field label="Guardian">{f.data.gname}</Field>}
                  {f.data.gneed && <Field label="Relationship">{f.data.grel}</Field>}
                  <Field label="Gifted or referred">{yes(f.data.gift) || 'No'}</Field>
                  {f.data.gift && <Field label="By">{f.data.rname}</Field>}
                  {f.data.gift && <Field label="Relationship">{f.data.rrel}</Field>}
                  {f.data.gift && <Field label="Contact">{f.data.rcontact}</Field>}
                  {f.data.gift && <Field label="Code">{f.data.rcode}</Field>}
                </dl>
              </section>
              <section className="adm-panel">
                <h2>Signatures</h2>
                <div className="adm-sigs">
                  <Sig label="Client" src={f.data.sig_client} />
                  <Sig label="Psychologist" src={f.data.sig_psych} />
                  {f.data.gneed && <Sig label="Parent / guardian" src={f.data.sig_guardian} />}
                </div>
              </section>
            </div>
            <div>
            {manage && f.status !== 'completed' && f.status !== 'revoked' && <AssignPanel f={f} onDone={reload} />}
            {(!manage || f.status === 'completed' || f.status === 'revoked') && f.assigned_to && (
              <section className="adm-panel">
                <h2>Psychologist</h2>
                <p>
                  {f.assigned_to.name}
                  {f.assigned_to.qualification ? ` · ${f.assigned_to.qualification}` : ''}
                </p>
              </section>
            )}
            <section className="adm-panel">
              <h2>Link</h2>
              {f.link_active ? (
                manage && (
                  <div className="adm-linkbox">
                    <input readOnly value={consentLink(f.token)} onFocus={(e) => e.target.select()} aria-label="Consent form link" />
                  </div>
                )
              ) : (
                <p className="adm-note">
                  {f.status === 'submitted' || f.status === 'completed'
                    ? 'The client saved the form, so their link shows it read-only now.'
                    : 'This link no longer opens. The answers stay saved.'}
                </p>
              )}
              <dl className="adm-fields one">
                <Field label="Created">{when(f.created_at)}</Field>
                <Field label="Saved by client">{f.submitted_at ? when(f.submitted_at) : 'Not yet'}</Field>
                <Field label="Expires">{f.expires_at ? when(f.expires_at) : 'Never'}</Field>
                <Field label="First opened">{f.first_opened_at ? when(f.first_opened_at) : 'Not yet'}</Field>
                <Field label="Last opened">{f.last_opened_at ? when(f.last_opened_at) : 'Not yet'}</Field>
                <Field label="Last change saved">{when(f.updated_at)}</Field>
                <Field label="Signed">{f.completed_at ? when(f.completed_at) : 'Not yet'}</Field>
                <Field label="PDF emailed">{f.emailed_at ? when(f.emailed_at) : 'No'}</Field>
                {f.revoked_at && <Field label="Closed">{when(f.revoked_at)}</Field>}
              </dl>
            </section>
            </div>
          </div>
        </>
      )}
    </Loader>
  );
}
