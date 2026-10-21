import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAdmin } from '../ctx';
import { ConsentState, CopyButton, consentLink, emailLinkHref } from '../consentUtil';
import { buildPdf, fmtDate, fmtDT, saveBlob, slug } from '../../consent/pdf';
import { Field, Loader, download, when } from '../ui';

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
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

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
              {f.link_active && <CopyButton text={consentLink(f.token)} />}
              {f.link_active && f.state === 'open' && (
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
              {f.link_active && (
                <button className="adm-btn danger" onClick={close} disabled={busy === 'close'}>
                  {busy === 'close' ? 'Closing…' : 'Close link'}
                </button>
              )}
            </div>
          </header>
          {err && <p className="adm-note err" role="alert">{err}</p>}

          <div className="adm-cols wide-left">
            <div>
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
                  <Field label="CNIC">{f.data.pcnic}</Field>
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
            <section className="adm-panel">
              <h2>Link</h2>
              {f.link_active ? (
                <div className="adm-linkbox">
                  <input readOnly value={consentLink(f.token)} onFocus={(e) => e.target.select()} aria-label="Consent form link" />
                </div>
              ) : (
                <p className="adm-note">This link no longer opens. The answers below stay saved.</p>
              )}
              <dl className="adm-fields one">
                <Field label="Created">{when(f.created_at)}</Field>
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
        </>
      )}
    </Loader>
  );
}
