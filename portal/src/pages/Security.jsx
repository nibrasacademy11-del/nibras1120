import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, pickMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import ChangePassword from './ChangePassword.jsx';

// Sign-in results in words (the codes come from the server's sign-in log)
const REASONS = { ok: 'rs_ok', unknown_email: 'rs_unknown_email', bad_password: 'rs_bad_password', locked: 'rs_locked', disabled: 'rs_disabled', '2fa_pending': 'rs_2fa_pending', '2fa_failed': 'rs_2fa_failed', wrong_portal: 'rs_wrong_portal' };

function shortAgent(ua) {
  const s = String(ua || '');
  const browser = /Edg\//.test(s) ? 'Edge' : /Chrome\//.test(s) ? 'Chrome' : /Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : /Electron/.test(s) ? 'Desktop app' : 'Browser';
  const os = /Windows/.test(s) ? 'Windows' : /Android/.test(s) ? 'Android' : /iPhone|iPad/.test(s) ? 'iOS' : /Mac OS/.test(s) ? 'macOS' : /Linux/.test(s) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

function DevicesCard() {
  const { t, fmtDate, lang } = useI18n();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('/api/v2/me/sessions').then((d) => setList(d.sessions)).catch((e) => setError(pickMessage(e.message, lang)));
  }, [lang]);
  useEffect(load, [load]);

  const revoke = async (id) => {
    await api(`/api/v2/me/sessions/${id}`, { method: 'DELETE' });
    load();
  };
  const revokeOthers = async () => {
    await api('/api/v2/me/sessions/revoke-others', { method: 'POST' });
    load();
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('devices')}</h2>
        {list && list.length > 1 && <button type="button" className="btn btn--ghost" onClick={revokeOthers}>{t('signOutOthers')}</button>}
      </div>
      {error && <div className="alert alert--error">{error}</div>}
      {!list ? <p className="muted">{t('loading')}</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('devices')}</th><th>IP</th><th>{t('signedInAt')}</th><th>{t('lastSeen')}</th><th /></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td>{shortAgent(s.userAgent)} {s.current && <span className="pill pill--ok">{t('thisDevice')}</span>}</td>
                  <td dir="ltr">{s.ip}</td>
                  <td>{fmtDate(s.createdAt)}</td>
                  <td>{fmtDate(s.lastSeenAt)}</td>
                  <td>{!s.current && <button type="button" className="btn btn--small" onClick={() => revoke(s.id)}>{t('signOutDevice')}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function HistoryCard() {
  const { t, fmtDate } = useI18n();
  const [list, setList] = useState(null);
  useEffect(() => {
    api('/api/v2/me/login-history').then((d) => setList(d.attempts)).catch(() => setList([]));
  }, []);
  return (
    <section className="card">
      <h2>{t('loginHistory')}</h2>
      {!list ? <p className="muted">{t('loading')}</p> : !list.length ? <p className="muted">{t('noData')}</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('when')}</th><th>{t('details')}</th><th>IP</th><th>{t('devices')}</th></tr></thead>
            <tbody>
              {list.map((a, i) => (
                <tr key={i}>
                  <td>{fmtDate(a.at)}</td>
                  <td><span className={`pill ${a.success ? 'pill--ok' : 'pill--warn'}`}>{a.success ? t('success') : t('failed')}</span> <small className="muted">{REASONS[a.reason] ? t(REASONS[a.reason]) : a.reason}</small></td>
                  <td dir="ltr">{a.ip}</td>
                  <td>{shortAgent(a.userAgent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function Security() {
  const { me } = useAuth();
  const { t } = useI18n();
  return (
    <>
      <h1 className="page-title">{t('security')}</h1>
      <ChangePassword />
      <DevicesCard />
      <HistoryCard />
    </>
  );
}
