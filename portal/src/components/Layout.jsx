import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import Notifications from './Notifications.jsx';

// Menu entries appear only when the user holds the permission behind them
const NAV = [
  { to: '/', key: 'dashboard', icon: '⌂', end: true, staffOnly: true },
  { to: '/', key: 'myPrograms', icon: '▤', end: true, customerOnly: true },
  { to: '/customers', key: 'customers', icon: '◉', permission: 'customers.view' },
  { to: '/lookup', key: 'lookup', icon: '⌕', permission: 'customer_lookup.view' },
  { to: '/enrollments', key: 'enrollmentsNav', icon: '❖', permission: 'enrollments.view', staffOnly: true },
  { to: '/reviews', key: 'reviews', icon: '✔', permission: 'enrollments.approve', minScope: 'team' },
  { to: '/programs', key: 'programsNav', icon: '▤', permission: 'programs.view', staffOnly: true },
  { to: '/my-payments', key: 'myPayments', icon: '¤', customerOnly: true },
  { to: '/my-certificates', key: 'myCertificates', icon: '✪', customerOnly: true },
  { to: '/certificates', key: 'certificatesNav', icon: '✪', permission: 'certificates.view', staffOnly: true },
  { to: '/finance', key: 'financeNav', icon: '¤', permission: 'payments.view', minScope: 'all' },
  { to: '/payments', key: 'paymentsNav', icon: '⊕', permission: 'payments.view', staffOnly: true },
  { to: '/commissions', key: 'commissionsNav', icon: '%', permission: 'commissions.view' },
  { to: '/approvals', key: 'approvalsNav', icon: '✓', permission: 'payments.approve', minScope: 'all' },
  { to: '/accounts', key: 'accountsNav', icon: '▣', permission: 'accounts.view', minScope: 'all' },
  { to: '/expenses', key: 'expensesNav', icon: '⊖', permission: 'expenses.view', minScope: 'all' },
  { to: '/currencies', key: 'currenciesNav', icon: '⇋', permission: 'currencies.view', minScope: 'all' },
  { to: '/periods', key: 'periodsNav', icon: '▥', permission: 'accounts.view', minScope: 'all' },
  { to: '/tasks', key: 'tasks', icon: '✓', permission: 'tasks.view' },
  { to: '/access-requests', key: 'accessRequests', icon: '⇄', permission: 'access_requests.view' },
  { to: '/employees', key: 'employees', icon: '☺', permission: 'employees.view', minScope: 'team' },
  { to: '/teams', key: 'teams', icon: '▦', permission: 'teams.view', minScope: 'team' },
  { to: '/duplicates', key: 'duplicates', icon: '⧉', permission: 'customers.manage', minScope: 'all' },
  { to: '/roles', key: 'roles', icon: '◈', permission: 'roles.view', minScope: 'all' },
  { to: '/audit', key: 'audit', icon: '☰', permission: 'audit.view', minScope: 'all' },
  { to: '/settings', key: 'settings', icon: '⚙', permission: 'settings.manage', minScope: 'all' },
  { to: '/security', key: 'security', icon: '⚿' }
];

export default function Layout({ children }) {
  const { me, can, signOut } = useAuth();
  const { t, label, toggle } = useI18n();
  const [open, setOpen] = useState(false);
  const isAdmin = ['super_admin', 'admin'].includes(me.user.role);
  const locked = me.security.mustChangePassword;

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
        {!locked && (
          <nav>
            {NAV.filter((n) => (!n.permission || can(n.permission, n.minScope)) && !(n.staffOnly && !me.user.isStaff) && !(n.customerOnly && me.user.isStaff)).map((n) => (
              <NavLink key={n.key} to={n.to} end={n.end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <span className="nav-icon" aria-hidden="true">{n.icon}</span>
                {t(n.key)}
              </NavLink>
            ))}
          </nav>
        )}
        <div className="sidebar-foot">
          {isAdmin && <a className="nav-item" href="/pages/ar/admin.html">{t('oldPanel')}</a>}
          <a className="nav-item" href="/">{t('website')}</a>
        </div>
      </aside>
      <div className="backdrop" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn menu-btn" aria-label="Menu" onClick={() => setOpen((o) => !o)}>☰</button>
          <div className="topbar-user"><span>{me.user.name}</span></div>
          <div className="topbar-actions">
            {!locked && me.user.isStaff && <Notifications />}
            <button type="button" className="btn btn--ghost" onClick={toggle}>{t('language')}</button>
            <button type="button" className="btn btn--ghost" onClick={signOut}>{t('signOut')}</button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
