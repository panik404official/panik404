import { useState } from 'react';
import { authApi } from '../api';
import { useMe } from '../ctx';
import { PERMISSIONS, ROLE_LABEL } from '../perms';

export default function Account() {
  const { me } = useMe();
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (f.next !== f.again) return setMsg({ err: 'The new passwords don’t match.' });
    setBusy(true);
    setMsg({});
    try {
      const r = await authApi('/password', { method: 'POST', body: { current_password: f.current, new_password: f.next } });
      setMsg({ ok: r.message });
      setF({ current: '', next: '', again: '' });
    } catch (ex) {
      setMsg({ err: ex.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="adm-head">
        <h1>Your account</h1>
      </header>
      <div className="adm-cols">
        <section className="adm-panel">
          <h2>{me.name}</h2>
          <dl className="adm-fields one">
            <dt>Username</dt>
            <dd>{me.username}</dd>
            <dt>Email</dt>
            <dd>{me.email}</dd>
            <dt>Role</dt>
            <dd>{ROLE_LABEL[me.role] || me.role}</dd>
            {me.qualification && (
              <>
                <dt>Qualification</dt>
                <dd>{me.qualification}</dd>
              </>
            )}
            <dt>Access</dt>
            <dd>
              {me.role === 'admin'
                ? 'Everything, including users'
                : me.permissions.map((p) => PERMISSIONS.find(([k]) => k === p)?.[1] || p).join('; ')}
            </dd>
          </dl>
          <p className="adm-sub">To change your name, email or access, ask an admin.</p>
        </section>
        {me.id && (
          <form className="adm-panel adm-form" onSubmit={submit}>
            <h2>Change password</h2>
            <div className="adm-form-grid one">
              <label>
                Current password
                <input type="password" value={f.current} onChange={set('current')} required autoComplete="current-password" />
              </label>
              <label>
                New password (at least 8 characters)
                <input type="password" value={f.next} onChange={set('next')} required minLength={8} autoComplete="new-password" />
              </label>
              <label>
                New password again
                <input type="password" value={f.again} onChange={set('again')} required minLength={8} autoComplete="new-password" />
              </label>
            </div>
            {msg.err && <p className="adm-note err" role="alert">{msg.err}</p>}
            {msg.ok && <p className="adm-note ok" role="status">{msg.ok}</p>}
            <div className="adm-row">
              <button className="adm-btn primary" disabled={busy}>
                {busy ? 'Saving…' : 'Change password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
