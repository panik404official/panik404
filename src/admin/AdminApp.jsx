import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api, AuthError, authApi, getToken, setToken } from './api';
import { AdminCtx } from './ctx';
import { ROLE_LABEL } from './perms';
import Overview from './pages/Overview';
import Customers from './pages/Customers';
import CustomerProfile from './pages/CustomerProfile';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Visitors from './pages/Visitors';
import VisitorJourney from './pages/VisitorJourney';
import Activity from './pages/Activity';
import Leads from './pages/Leads';
import Catalogue from './pages/Catalogue';
import ConsentForms from './pages/ConsentForms';
import ConsentDetail from './pages/ConsentDetail';
import ContactMessages from './pages/ContactMessages';
import PartnerVerifications from './pages/PartnerVerifications';
import PartnerVerificationDetail from './pages/PartnerVerificationDetail';
import Users from './pages/Users';
import Account from './pages/Account';
import Notifications from './pages/Notifications';
import './admin.css';

// [path, label, needs (permission, list of permissions = any, or 'admin'), end]
const NAV = [
  ['/admin', 'Overview', 'overview', true],
  ['/admin/consent', 'Consent forms', ['consent_manage', 'consent_assigned']],
  ['/admin/customers', 'Customers', 'customers'],
  ['/admin/orders', 'Orders', 'orders'],
  ['/admin/visitors', 'Visitors', 'visitors'],
  ['/admin/activity', 'Live activity', 'visitors'],
  ['/admin/partners', 'Partner bookings', 'partners'],
  ['/admin/messages', 'Contact messages', 'leads'],
  ['/admin/leads', 'Corporate leads', 'leads'],
  ['/admin/catalogue', 'Products & payments', 'catalogue'],
  ['/admin/users', 'Users', 'admin'],
];
const BELL_EVERY_MS = 30000;

function SignIn({ onIn }) {
  const [mode, setMode] = useState('loading'); // loading | login | setup
  const [f, setF] = useState({ login: '', password: '', remember: false, admin_key: '', name: '', username: '', email: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  useEffect(() => {
    authApi('/setup')
      .then((r) => setMode(r.needs_setup ? 'setup' : 'login'))
      .catch((e) => {
        setErr(e.message);
        setMode('login');
      });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r =
        mode === 'setup'
          ? await authApi('/setup', {
              method: 'POST',
              token: '',
              body: { admin_key: f.admin_key.trim(), name: f.name.trim(), username: f.username.trim(), email: f.email.trim(), password: f.password },
            })
          : await authApi('/login', {
              method: 'POST',
              token: '',
              body: { login: f.login.trim(), password: f.password, remember: f.remember },
            });
      setToken(r.token, mode === 'login' && f.remember);
      onIn(r.user);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'loading') return <div className="adm adm-login"><p className="adm-loading">Loading…</p></div>;
  return (
    <div className="adm adm-login">
      <form onSubmit={submit}>
        <h1>Panik panel</h1>
        {mode === 'setup' ? (
          <>
            <p>
              Create the first admin account. You need the <code>ADMIN_API_KEY</code> from the backend settings once;
              after this everyone signs in with their own password.
            </p>
            <label htmlFor="adm-key">Admin key</label>
            <input id="adm-key" type="password" value={f.admin_key} onChange={set('admin_key')} autoComplete="off" required />
            <label htmlFor="adm-name">Your name</label>
            <input id="adm-name" value={f.name} onChange={set('name')} autoComplete="name" required maxLength={120} />
            <label htmlFor="adm-username">Username</label>
            <input id="adm-username" value={f.username} onChange={set('username')} autoComplete="username" required minLength={3} maxLength={40} pattern="[A-Za-z0-9._\-]+" title="Letters, numbers, dots, dashes and underscores" />
            <label htmlFor="adm-email">Email</label>
            <input id="adm-email" type="email" value={f.email} onChange={set('email')} autoComplete="email" required />
            <label htmlFor="adm-pass">Password (at least 8 characters)</label>
            <input id="adm-pass" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" required minLength={8} />
          </>
        ) : (
          <>
            <p>Sign in with your username or email.</p>
            <label htmlFor="adm-login">Username or email</label>
            <input id="adm-login" value={f.login} onChange={set('login')} autoComplete="username" autoFocus required />
            <label htmlFor="adm-pass">Password</label>
            <input id="adm-pass" type="password" value={f.password} onChange={set('password')} autoComplete="current-password" required />
            <label className="adm-check">
              <input type="checkbox" checked={f.remember} onChange={set('remember')} /> Keep me signed in on this device
            </label>
          </>
        )}
        {err && <p className="adm-note err" role="alert">{err}</p>}
        <button className="adm-btn primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'setup' ? 'Create admin account' : 'Sign in'}
        </button>
        {mode === 'login' && <p className="adm-sub">Forgot your password? Ask an admin to reset it.</p>}
      </form>
    </div>
  );
}

export default function AdminApp() {
  const [me, setMe] = useState(null);
  const [booting, setBooting] = useState(!!getToken());
  const [menu, setMenu] = useState(false);
  const [unread, setUnread] = useState(0);

  const logout = useCallback(() => {
    const t = getToken();
    setToken('');
    setMe(null);
    if (t) authApi('/logout', { method: 'POST', token: t }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    authApi('/me')
      .then(setMe)
      .catch(() => setToken(''))
      .finally(() => setBooting(false));
  }, []);

  const refreshBell = useCallback(() => {
    api('/notifications/count')
      .then((r) => setUnread(r.unread))
      .catch((e) => e instanceof AuthError && logout());
  }, [logout]);

  useEffect(() => {
    if (!me) return undefined;
    refreshBell();
    const id = setInterval(() => document.visibilityState === 'visible' && refreshBell(), BELL_EVERY_MS);
    return () => clearInterval(id);
  }, [me, refreshBell]);

  if (booting) return <div className="adm adm-login"><p className="adm-loading">Loading…</p></div>;
  if (!me) return <SignIn onIn={setMe} />;

  const can = (need) =>
    need === 'admin' ? me.role === 'admin' : Array.isArray(need) ? need.some((p) => me.permissions.includes(p)) : me.permissions.includes(need);
  const nav = NAV.filter(([, , need]) => can(need));
  const home = nav[0]?.[0] || '/admin/account';
  const guard = (need, el) => (can(need) ? el : <Navigate to={home} replace />);

  return (
    <AdminCtx.Provider value={{ logout, me, can, refreshBell }}>
      <div className="adm">
        <aside className={`adm-side${menu ? ' open' : ''}`}>
          <div className="adm-brand">
            <span>Panik</span> panel
          </div>
          <NavLink to="/admin/notifications" className="adm-bell" onClick={() => setMenu(false)}>
            Notifications
            {unread > 0 && (
              <b className="adm-badge" aria-label={`${unread} unread`}>
                {unread > 99 ? '99+' : unread}
              </b>
            )}
          </NavLink>
          <nav aria-label="Panel">
            {nav.map(([to, label, , end]) => (
              <NavLink key={to} to={to} end={end} onClick={() => setMenu(false)}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="adm-side-foot">
            <NavLink to="/admin/account" className="adm-me" onClick={() => setMenu(false)}>
              <strong>{me.name}</strong>
              <small>{ROLE_LABEL[me.role] || me.role} · account</small>
            </NavLink>
            <a href="#/">View site</a>
            <button onClick={logout}>Sign out</button>
          </div>
        </aside>
        <button className="adm-menu" aria-expanded={menu} aria-label="Toggle panel menu" onClick={() => setMenu(!menu)}>
          {menu ? 'Close' : unread ? `Menu (${unread})` : 'Menu'}
        </button>
        <main className="adm-main">
          <Routes>
            <Route path="/admin" element={can('overview') ? <Overview /> : <Navigate to={home} replace />} />
            <Route path="/admin/customers" element={guard('customers', <Customers />)} />
            <Route path="/admin/customers/:id" element={guard('customers', <CustomerProfile />)} />
            <Route path="/admin/orders" element={guard('orders', <Orders />)} />
            <Route path="/admin/orders/:id" element={guard('orders', <OrderDetail />)} />
            <Route path="/admin/visitors" element={guard('visitors', <Visitors />)} />
            <Route path="/admin/visitors/:id" element={guard('visitors', <VisitorJourney />)} />
            <Route path="/admin/activity" element={guard('visitors', <Activity />)} />
            <Route path="/admin/leads" element={guard('leads', <Leads />)} />
            <Route path="/admin/messages" element={guard('leads', <ContactMessages />)} />
            <Route path="/admin/catalogue" element={guard('catalogue', <Catalogue />)} />
            <Route path="/admin/partners" element={guard('partners', <PartnerVerifications />)} />
            <Route path="/admin/partners/:id" element={guard('partners', <PartnerVerificationDetail />)} />
            <Route path="/admin/consent" element={guard(['consent_manage', 'consent_assigned'], <ConsentForms />)} />
            <Route path="/admin/consent/:id" element={guard(['consent_manage', 'consent_assigned'], <ConsentDetail />)} />
            <Route path="/admin/users" element={guard('admin', <Users />)} />
            <Route path="/admin/account" element={<Account />} />
            <Route path="/admin/notifications" element={<Notifications />} />
            <Route path="*" element={<Navigate to={home} replace />} />
          </Routes>
        </main>
      </div>
    </AdminCtx.Provider>
  );
}
