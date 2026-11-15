import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';

// The bell in the top bar. Checks for new notifications every minute while the page is visible.
export default function Notifications() {
  const { t, lang, fmtDate } = useI18n();
  const navigate = useNavigate();
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  const load = () => api('/api/v2/notifications').then(setData).catch(() => {});
  useEffect(() => {
    load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const go = async (n) => {
    setOpen(false);
    if (!n.readAt) await api('/api/v2/notifications/read', { method: 'POST', body: { ids: [n._id] } }).catch(() => {});
    load();
    if (n.link) navigate(n.link);
  };
  const readAll = () => api('/api/v2/notifications/read', { method: 'POST', body: {} }).then(load);

  return (
    <div className="bell" ref={box}>
      <button type="button" className="icon-btn" aria-label={t('notifications')} onClick={() => setOpen((o) => !o)}>
        🔔{data.unread > 0 && <span className="badge">{data.unread > 99 ? '99+' : data.unread}</span>}
      </button>
      {open && (
        <div className="bell-panel">
          <div className="card-head"><strong>{t('notifications')}</strong>{data.unread > 0 && <button type="button" className="link" onClick={readAll}>{t('markAllRead')}</button>}</div>
          {!data.items.length ? <p className="muted">{t('noNotifications')}</p> : (
            <ul>
              {data.items.map((n) => (
                <li key={n._id} className={n.readAt ? '' : 'unread'}>
                  <button type="button" onClick={() => go(n)}>
                    <strong>{lang === 'en' && n.titleEn ? n.titleEn : n.titleAr}</strong>
                    {(n.bodyAr || n.bodyEn) && <span>{lang === 'en' && n.bodyEn ? n.bodyEn : n.bodyAr}</span>}
                    <small className="muted">{fmtDate(n.createdAt)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
