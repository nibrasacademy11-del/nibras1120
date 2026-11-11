import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { visibleSections } from './navigation.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import Notifications from './Notifications.jsx';

export default function Layout({ children }) {
  const { me, signOut } = useAuth();
  const { t, label, toggle } = useI18n();
  const [open, setOpen] = useState(false);
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
        {!locked && <SideNav />}
        <div className="sidebar-foot">
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

const OPEN_KEY = 'nibras_nav_open';
const readOpen = () => { try { return JSON.parse(localStorage.getItem(OPEN_KEY) || '[]'); } catch { return []; } };

// The menu in sections. The section of the current page is always open; the others open and
// close on a click and are remembered. The search box finds any page by name.
function SideNav() {
  const { me } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const sections = useMemo(() => visibleSections({ role: me.user.role, isStaff: me.user.isStaff, grants: me.grants }), [me]);
  const [opened, setOpened] = useState(readOpen);
  const [q, setQ] = useState('');
  const path = location.pathname;
  const current = sections.find((sec) => sec.items.some((i) => (i.end ? path === i.to : path === i.to || path.startsWith(`${i.to}/`))));
  useEffect(() => { try { localStorage.setItem(OPEN_KEY, JSON.stringify(opened)); } catch { /* storage may be blocked */ } }, [opened]);
  const toggleSection = (key) => setOpened((o) => (o.includes(key) ? o.filter((k) => k !== key) : [...o, key]));
  const term = q.trim().toLowerCase();
  const few = sections.reduce((n, sec) => n + sec.items.length, 0) <= 8;
  return (
    <nav className="side-nav">
      {!few && <input className="nav-search" type="search" placeholder={t('navSearch')} value={q} onChange={(e) => setQ(e.target.value)} onClick={(e) => e.stopPropagation()} aria-label={t('navSearch')} />}
      {sections.map((sec) => {
        const items = term ? sec.items.filter((i) => t(i.key).toLowerCase().includes(term)) : sec.items;
        if (!items.length) return null;
        const isOpen = few || !!term || sec === current || opened.includes(sec.key) || sections.length === 1;
        return (
          <div key={sec.key} className={`nav-section${isOpen ? ' nav-section--open' : ''}`}>
            {!few && (
              <button type="button" className="nav-section__head" aria-expanded={isOpen} onClick={(e) => { e.stopPropagation(); toggleSection(sec.key); }}>
                <span>{t(sec.key)}</span><span className="nav-section__count">{items.length}</span><span aria-hidden="true" className="nav-section__chev">▾</span>
              </button>
            )}
            {isOpen && items.map((n) => (
              <NavLink key={n.to + n.key} to={n.to} end={n.end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <span className="nav-icon" aria-hidden="true">{n.icon}</span>
                {t(n.key)}
              </NavLink>
            ))}
          </div>
        );
      })}
    </nav>
  );
}
