import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, pickMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';

function RecoveryCodes({ codes, onDone }) {
  const { t } = useI18n();
  return (
    <div className="recovery">
      <h3>{t('recoveryTitle')}</h3>
      <p className="muted">{t('recoveryHint')}</p>
      <ol className="codes" dir="ltr">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ol>
      <div className="row">
        <button type="button" className="btn btn--ghost" onClick={() => window.print()}>{t('print')}</button>
        <button type="button" className="btn btn--primary" onClick={onDone}>{t('done')}</button>
      </div>
    </div>
  );
}

function TwoFactorCard() {
  const { me, refresh } = useAuth();
  const { t, lang } = useI18n();
  const { security } = me;
  const [mode, setMode] = useState(null); // setup-password | setup-code | disable | regen
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState(null);
  const [qr, setQr] = useState('');
  const [codes, setCodes] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setMode(null);
    setPassword('');
    setCode('');
    setSetup(null);
    setQr('');
    setError('');
  };

  async function run(fn) {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(pickMessage(err.message, lang));
    } finally {
      setBusy(false);
    }
  }

  const startSetup = (e) => {
    e.preventDefault();
    run(async () => {
      const data = await api('/api/v2/me/2fa/setup', { method: 'POST', body: { password } });
      setSetup(data);
      setQr(await QRCode.toDataURL(data.otpauthUrl, { margin: 1, width: 220 }));
      setPassword('');
      setMode('setup-code');
    });
  };

  const confirmSetup = (e) => {
    e.preventDefault();
    run(async () => {
      const data = await api('/api/v2/me/2fa/enable', { method: 'POST', body: { code } });
      reset();
      setCodes(data.recoveryCodes);
    });
  };

  const disable = (e) => {
    e.preventDefault();
    run(async () => {
      await api('/api/v2/me/2fa/disable', { method: 'POST', body: { password, code } });
      reset();
      await refresh();
    });
  };

  const regenerate = (e) => {
    e.preventDefault();
    run(async () => {
      const data = await api('/api/v2/me/2fa/recovery-codes', { method: 'POST', body: { password, code } });
      reset();
      setCodes(data.recoveryCodes);
    });
  };

  if (codes) {
    return (
      <section className="card">
        <RecoveryCodes codes={codes} onDone={async () => { setCodes(null); await refresh(); }} />
      </section>
    );
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('twoFactor')}</h2>
        <span className={`pill ${security.twoFactorEnabled ? 'pill--ok' : 'pill--warn'}`}>
          {security.twoFactorEnabled ? t('twoFactorOn') : t('twoFactorOff')}
        </span>
      </div>
      {security.mustEnrollTwoFactor && <div className="alert alert--warn">{t('twoFactorMust')}</div>}
      <p className="muted">{t('twoFactorIntro')}</p>
      {security.twoFactorEnabled && (
        <p className="muted">{security.recoveryCodesLeft} {t('recoveryLeft')}</p>
      )}

      {!mode && !security.twoFactorEnabled && (
        <button type="button" className="btn btn--primary" onClick={() => setMode('setup-password')}>{t('enable')}</button>
      )}
      {!mode && security.twoFactorEnabled && (
        <div className="row">
          <button type="button" className="btn btn--ghost" onClick={() => setMode('regen')}>{t('newRecovery')}</button>
          {!security.twoFactorRequired && (
            <button type="button" className="btn btn--danger" onClick={() => setMode('disable')}>{t('disable')}</button>
          )}
        </div>
      )}

      {mode === 'setup-password' && (
        <form className="stack" onSubmit={startSetup}>
          <label className="field">
            {t('confirmPassword')}
            <input type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <div className="row">
            <button className="btn btn--primary" disabled={busy}>{t('enable')}</button>
            <button type="button" className="btn btn--ghost" onClick={reset}>{t('cancel')}</button>
          </div>
        </form>
      )}

      {mode === 'setup-code' && setup && (
        <form className="stack" onSubmit={confirmSetup}>
          <p>{t('scanQr')}</p>
          {qr && <img className="qr" src={qr} alt="QR" width="220" height="220" />}
          <p className="muted">{t('manualKey')} <code dir="ltr">{setup.secret}</code></p>
          <label className="field">
            {t('code')}
            <input className="code-input" dir="ltr" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <div className="row">
            <button className="btn btn--primary" disabled={busy}>{t('verify')}</button>
            <button type="button" className="btn btn--ghost" onClick={reset}>{t('cancel')}</button>
          </div>
        </form>
      )}

      {(mode === 'disable' || mode === 'regen') && (
        <form className="stack" onSubmit={mode === 'disable' ? disable : regenerate}>
          <label className="field">
            {t('confirmPassword')}
            <input type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="field">
            {t('code')}
            <input className="code-input" dir="ltr" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <div className="row">
            <button className={`btn ${mode === 'disable' ? 'btn--danger' : 'btn--primary'}`} disabled={busy}>
              {mode === 'disable' ? t('disable') : t('newRecovery')}
            </button>
            <button type="button" className="btn btn--ghost" onClick={reset}>{t('cancel')}</button>
          </div>
        </form>
      )}

      {error && <div className="alert alert--error" role="alert">{error}</div>}
    </section>
  );
}

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
                  <td><span className={`pill ${a.success ? 'pill--ok' : 'pill--warn'}`}>{a.success ? t('success') : t('failed')}</span> <small className="muted" dir="ltr">{a.reason}</small></td>
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
      <TwoFactorCard />
      {!me.security.mustEnrollTwoFactor && (
        <>
          <DevicesCard />
          <HistoryCard />
        </>
      )}
    </>
  );
}
