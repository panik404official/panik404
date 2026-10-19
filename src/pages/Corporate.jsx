import { useState } from 'react';
import Work from '../components/Work';
import { createLead } from '../utils/tracker';
import { isValidEmail } from '../utils/validation';

export default function Corporate() {
  const [ok, setOk] = useState(false),
    [f, setF] = useState({ name: '', email: '', teamSize: '', message: '' }),
    [er, setEr] = useState({}),
    [sending, setSending] = useState(false),
    [submitError, setSubmitError] = useState('');
  const set = (k, v) => setF({ ...f, [k]: v });

  const submit = async () => {
    const m = {};
    if (!f.name.trim()) m.name = 'This field is required.';
    if (!isValidEmail(f.email)) m.email = 'Enter a valid email address.';
    if (f.teamSize && !(Number.isInteger(+f.teamSize) && +f.teamSize >= 1))
      m.teamSize = 'Enter a whole number.';
    setEr(m);
    if (Object.keys(m).length) return;

    setSending(true);
    setSubmitError('');
    try {
      await createLead({
        name: f.name.trim(),
        email: f.email.trim(),
        team_size: f.teamSize ? +f.teamSize : null,
        message: f.message.trim() || null,
      });
      setOk(true);
    } catch (error) {
      setSubmitError(error.message || 'Unable to send your request. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Work cta={false} />
      <div className="card" style={{ marginTop: 24 }}>
        <h2>Get a quote</h2>
        {ok ? (
          <p>Thanks! We’ll be in touch.</p>
        ) : (
          <>
            <label>Name</label>
            <input value={f.name} maxLength={120} onChange={(e) => set('name', e.target.value)} />
            {er.name && <div className="err">{er.name}</div>}
            <label>Work email</label>
            <input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
            {er.email && <div className="err">{er.email}</div>}
            <label>Team size</label>
            <input
              type="number"
              min="1"
              value={f.teamSize}
              onChange={(e) => set('teamSize', e.target.value)}
            />
            {er.teamSize && <div className="err">{er.teamSize}</div>}
            <label>What would help your team?</label>
            <textarea
              rows="3"
              maxLength={2000}
              value={f.message}
              onChange={(e) => set('message', e.target.value)}
            />
            <div style={{ marginTop: 16 }}>
              <button className="btn" disabled={sending} onClick={submit}>
                {sending ? 'Sending…' : 'Request a quote'}
              </button>
            </div>
            {submitError && (
              <p className="err mail-status error" role="alert">
                {submitError}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
