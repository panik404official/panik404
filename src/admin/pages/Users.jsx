import { useState } from 'react';
import { api } from '../api';
import { useAdmin, useMe } from '../ctx';
import { DEFAULT_PSYCHOLOGIST, PERMISSIONS, ROLE_LABEL } from '../perms';
import { Empty, Loader, SearchBox, ago } from '../ui';

const BLANK = { name: '', username: '', email: '', password: '', role: 'psychologist', qualification: 'Clinical Psychologist', permissions: DEFAULT_PSYCHOLOGIST, is_active: true };

function UserForm({ user, onSaved, onCancel }) {
  const editing = !!user;
  const [f, setF] = useState(
    editing ? { ...user, password: '', permissions: user.granted, qualification: user.qualification || '' } : BLANK,
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const toggle = (p) =>
    setF({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p] });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const body = {
      name: f.name.trim(),
      username: f.username.trim(),
      email: f.email.trim(),
      role: f.role,
      qualification: f.qualification.trim() || null,
      permissions: f.role === 'admin' ? [] : f.permissions,
    };
    if (f.password) body.password = f.password;
    if (editing) body.is_active = f.is_active;
    try {
      const saved = editing
        ? await api(`/users/${user.id}`, { method: 'PATCH', body })
        : await api('/users', { method: 'POST', body });
      onSaved(saved, editing);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="adm-panel adm-form" onSubmit={submit}>
      <h2>{editing ? `Edit ${user.name}` : 'New user'}</h2>
      <div className="adm-form-grid">
        <label>
          Full name
          <input value={f.name} onChange={set('name')} required maxLength={120} />
        </label>
        <label>
          Username
          <input value={f.username} onChange={set('username')} required minLength={3} maxLength={40} pattern="[A-Za-z0-9._\-]+" title="Letters, numbers, dots, dashes and underscores" autoComplete="off" />
        </label>
        <label>
          Email
          <input type="email" value={f.email} onChange={set('email')} required autoComplete="off" />
        </label>
        <label>
          {editing ? 'New password (leave empty to keep)' : 'Password (at least 8 characters)'}
          <input type="password" value={f.password} onChange={set('password')} required={!editing} minLength={8} autoComplete="new-password" />
        </label>
        <label>
          Role
          <select value={f.role} onChange={set('role')}>
            <option value="psychologist">Psychologist</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label>
          Qualification (shown on consent forms)
          <input value={f.qualification} onChange={set('qualification')} maxLength={120} />
        </label>
      </div>
      <fieldset className="adm-perms">
        <legend>What they can see and do</legend>
        {f.role === 'admin' ? (
          <p className="adm-sub">Admins can do everything, including managing users.</p>
        ) : (
          PERMISSIONS.map(([key, label]) => (
            <label key={key} className="adm-check">
              <input type="checkbox" checked={f.permissions.includes(key)} onChange={() => toggle(key)} /> {label}
            </label>
          ))
        )}
      </fieldset>
      {editing && (
        <label className="adm-check">
          <input type="checkbox" checked={f.is_active} onChange={set('is_active')} /> Account switched on (unticked: they can’t sign in)
        </label>
      )}
      {err && <p className="adm-note err" role="alert">{err}</p>}
      <div className="adm-row">
        <button className="adm-btn primary" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create user'}
        </button>
        <button type="button" className="adm-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {editing && f.password && <p className="adm-sub">Changing the password signs them out everywhere.</p>}
    </form>
  );
}

export default function Users() {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | user
  const [flash, setFlash] = useState('');
  const { me } = useMe();
  const { data, error, loading, reload } = useAdmin('/users', { q });

  return (
    <>
      <header className="adm-head">
        <h1>Users</h1>
        {!editing && (
          <button className="adm-btn primary" onClick={() => setEditing('new')}>
            New user
          </button>
        )}
      </header>
      <p className="adm-lede">
        Everyone who signs in to this panel. Psychologists only see the sections you tick for them; by default that’s
        the consent forms assigned to them.
      </p>
      {flash && <p className="adm-note ok" role="status">{flash}</p>}
      {editing && (
        <UserForm
          user={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(u, wasEdit) => {
            setEditing(null);
            setFlash(wasEdit ? `Saved ${u.name}.` : `Created ${u.name}. Give them their username and password.`);
            reload();
          }}
        />
      )}
      <div className="adm-toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search name, username or email" />
      </div>
      <Loader error={error} loading={loading} onRetry={reload}>
        {data &&
          (data.items.length ? (
            <div className="adm-scroll">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Access</th>
                    <th>Last sign-in</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr key={u.id} className={u.is_active ? '' : 'adm-off'}>
                      <td>
                        <span className="adm-who">
                          <strong>
                            {u.name}
                            {u.id === me.id ? ' (you)' : ''}
                          </strong>
                          <small>{u.email}</small>
                        </span>
                      </td>
                      <td>
                        <code>{u.username}</code>
                      </td>
                      <td>
                        {ROLE_LABEL[u.role]}
                        {!u.is_active && <small className="block">switched off</small>}
                      </td>
                      <td className="wrap">
                        {u.role === 'admin'
                          ? 'Everything'
                          : u.granted.map((p) => PERMISSIONS.find(([k]) => k === p)?.[1].split(' (')[0] || p).join(', ') || 'Nothing yet'}
                      </td>
                      <td>{u.last_login_at ? ago(u.last_login_at) : 'Never'}</td>
                      <td>
                        <button className="adm-btn" onClick={() => setEditing(u)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No users match.</Empty>
          ))}
      </Loader>
    </>
  );
}
