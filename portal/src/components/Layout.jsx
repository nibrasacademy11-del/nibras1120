import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';

// Menu entries appear only when the user holds the permission behind them
const NAV = [
  { to: '/', key: 'dashboard', icon: '⌂', end: true },
  { to: '/roles', key: 'roles', icon: '◈', permission: 'roles.view', minScope: 'all' },
  { to: '/audit', key: 'audit', icon: '☰', permission: 'audit.view', minScope: 'all' },
  { to: '/security', key: 'security', icon: '⚿' }
];

export default function Layout({ children }) {
  const { me, can, signOut } = useAuth();
  const { t, label, toggle } = useI18n();
  const [open, setOpen] = useState(false);
  const isAdmin = ['super_admin', 'admin'].includes(me.user.role);

  return (
    <div className={`shell${open ? ' shell--open' : ''}`}>
      <aside className="sidebar" onClick={() => setOpen(false)}>
        <div className="brand">
          <img src="/logo.png" alt="" />
          <div>
            <strong>{t('portal')}</strong>
            <small>{label(me.user.roleLabel)}</small>
          </div>
        </div>
        <nav>
          {NAV.filter((n) => !n.permission || can(n.permission, n.minScope)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <span className="nav-icon" aria-hidden="true">{n.icon}</span>
              {t(n.key)}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          {isAdmin && <a className="nav-item" href="/pages/ar/admin.html">{t('oldPanel')}</a>}
          <a className="nav-item" href="/">{t('website')}</a>
        </div>
      </aside>
      <div className="backdrop" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn menu-btn" aria-label="Menu" onClick={() => setOpen((o) => !o)}>☰</button>
          <div className="topbar-user">
            <span>{me.user.name}</span>
          </div>
          <div className="topbar-actions">
            <button type="button" className="btn btn--ghost" onClick={toggle}>{t('language')}</button>
            <button type="button" className="btn btn--ghost" onClick={signOut}>{t('signOut')}</button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
