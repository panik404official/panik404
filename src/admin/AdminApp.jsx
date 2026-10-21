import { useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api, AuthError, getKey, setKey } from './api';
import { AdminCtx } from './ctx';
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
import './admin.css';

const NAV = [
  ['/admin', 'Overview', true],
  ['/admin/customers', 'Customers'],
  ['/admin/orders', 'Orders'],
  ['/admin/visitors', 'Visitors'],
  ['/admin/activity', 'Live activity'],
  ['/admin/partners', 'Partner bookings'],
  ['/admin/consent', 'Consent forms'],
  ['/admin/messages', 'Contact messages'],
  ['/admin/leads', 'Corporate leads'],
  ['/admin/catalogue', 'Products & payments'],
];

function Login({ onIn }) {
  const [key, setK] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api('/overview', { key: key.trim() });
      setKey(key.trim());
      onIn();
    } catch (ex) {
      setErr(ex instanceof AuthError ? 'That key is not the ADMIN_API_KEY from backend/.env.' : ex.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="adm adm-login">
      <form onSubmit={submit}>
        <h1>Panik admin</h1>
        <p>Enter the admin key from <code>backend/.env</code> to see customers, orders and activity.</p>
        <label htmlFor="adm-key">Admin key</label>
        <input id="adm-key" type="password" autoComplete="current-password" value={key} onChange={(e) => setK(e.target.value)} autoFocus required />
        {err && <p className="adm-note err" role="alert">{err}</p>}
        <button className="adm-btn primary" disabled={busy || !key.trim()}>
          {busy ? 'Checking…' : 'Open admin panel'}
        </button>
      </form>
    </div>
  );
}

export default function AdminApp() {
  const [authed, setAuthed] = useState(!!getKey());
  const [menu, setMenu] = useState(false);
  const logout = () => {
    setKey('');
    setAuthed(false);
  };
  if (!authed) return <Login onIn={() => setAuthed(true)} />;

  return (
    <AdminCtx.Provider value={{ logout }}>
      <div className="adm">
        <aside className={`adm-side${menu ? ' open' : ''}`}>
          <div className="adm-brand">
            <span>Panik</span> admin
          </div>
          <nav aria-label="Admin">
            {NAV.map(([to, label, end]) => (
              <NavLink key={to} to={to} end={end} onClick={() => setMenu(false)}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="adm-side-foot">
            <a href="#/">View site</a>
            <button onClick={logout}>Sign out</button>
          </div>
        </aside>
        <button className="adm-menu" aria-expanded={menu} aria-label="Toggle admin menu" onClick={() => setMenu(!menu)}>
          {menu ? 'Close' : 'Menu'}
        </button>
        <main className="adm-main">
          <Routes>
            <Route path="/admin" element={<Overview />} />
            <Route path="/admin/customers" element={<Customers />} />
            <Route path="/admin/customers/:id" element={<CustomerProfile />} />
            <Route path="/admin/orders" element={<Orders />} />
            <Route path="/admin/orders/:id" element={<OrderDetail />} />
            <Route path="/admin/visitors" element={<Visitors />} />
            <Route path="/admin/visitors/:id" element={<VisitorJourney />} />
            <Route path="/admin/activity" element={<Activity />} />
            <Route path="/admin/leads" element={<Leads />} />
            <Route path="/admin/catalogue" element={<Catalogue />} />
            <Route path="/admin/consent" element={<ConsentForms />} />
            <Route path="/admin/consent/:id" element={<ConsentDetail />} />
            <Route path="/admin/messages" element={<ContactMessages />} />
            <Route path="/admin/partners" element={<PartnerVerifications />} />
            <Route path="/admin/partners/:id" element={<PartnerVerificationDetail />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </div>
    </AdminCtx.Provider>
  );
}
