import { useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { itemFor, menuItems } from './navigation.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import Notifications from './Notifications.jsx';

export default function Layout({ children }) {
  const { me, signOut, zone, urls, can } = useAuth();
  const location = useLocation();
  const { t, label, toggle } = useI18n();
  const [open, setOpen] = useState(false);
  const locked = me.security.mustChangePassword;

  return (
    <div className={`shell${open ? ' shell--open' : ''}`}>
      <aside className="sidebar" onClick={() => setOpen(false)}>
        <div className="brand">
          <img src="/logo.png" alt="" />
          <div>
            <strong>{zone === 'cms' ? t('signInCms') : t('portal')}</strong>
            <small>{label(me.user.roleLabel)}</small>
          </div>
        </div>
        {!locked && <SideNav />}
        <div className="sidebar-foot">
          {zone === 'staff' && urls.cms && can('website.manage', 'all') && <a className="nav-item" href={`${urls.cms}/portal/website`}>{t('openCms')} ↗</a>}
          {zone === 'cms' && <a className="nav-item" href={`${urls.staff}/portal/`}>{t('openStaff')} ↗</a>}
          <a className="nav-item" href={zone === 'staff' || zone === 'cms' ? `${urls.site}/` : '/'}>{t('website')}</a>
        </div>
      </aside>
      <div className="backdrop" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn menu-btn" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div className="topbar-user">
            <span className="avatar" aria-hidden="true">{(me.user.name || '?').trim().charAt(0)}</span>
            <span className="topbar-user__name">{me.user.name}</span>
          </div>
          <div className="topbar-actions">
            {!locked && me.user.isStaff && zone !== 'cms' && <Notifications />}
            <button type="button" className="btn btn--ghost" onClick={toggle} title={t('language')}>
              <span className="hide-sm">{t('language')}</span><span className="show-sm" aria-hidden="true">{t('language') === 'English' ? 'EN' : 'ع'}</span>
            </button>
            <button type="button" className="btn btn--ghost" onClick={signOut} title={t('signOut')} aria-label={t('signOut')}>
              <svg className="btn-ico" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg><span className="hide-sm">{t('signOut')}</span>
            </button>
          </div>
        </header>
        <main className="content">
          {!locked && <SectionTabs />}
          {/* a fresh key per page plays the short entrance animation on every page change */}
          <div key={location.pathname} className="page-enter">{children}</div>
        </main>
      </div>
    </div>
  );
}

// The pages that belong together, as tabs on top of the page (Customers: customers, sign-in
// accounts, data change requests, data access requests)
function SectionTabs() {
  const { me, zone } = useAuth();
  const { t } = useI18n();
  const { pathname } = useLocation();
  const items = useMemo(() => menuItems({ role: me.user.role, zone }), [me, zone]);
  const item = itemFor(items, pathname);
  if (!item || !item.tabs || item.tabs.length < 2) return null;
  return (
    <nav className="section-tabs no-print" aria-label={t(item.key)}>
      {item.tabs.map((x) => (
        <NavLink key={x.to} to={x.to} end={x.to === '/'} className={({ isActive }) => `section-tab${isActive ? ' active' : ''}`}>{t(x.key)}</NavLink>
      ))}
    </nav>
  );
}

// The menu: one short list, always open
function SideNav() {
  const { me, zone } = useAuth();
  const { t } = useI18n();
  const { pathname } = useLocation();
  const items = useMemo(() => menuItems({ role: me.user.role, zone }), [me, zone]);
  const current = itemFor(items, pathname);
  return (
    <nav className="side-nav side-nav--flat">
      {items.map((n) => (
        <NavLink key={n.to + n.key} to={n.to} end={n.end} className={() => `nav-item${current === n ? ' active' : ''}`}>
          <span className="nav-icon" aria-hidden="true">{n.icon}</span>
          {t(n.key)}
        </NavLink>
      ))}
    </nav>
  );
}
