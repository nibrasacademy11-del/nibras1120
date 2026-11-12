import { useState } from 'react';
import { api, pickMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';

export default function Login() {
  const { refresh, zone } = useAuth();
  const { t, lang, toggle } = useI18n();
  const [elsewhere, setElsewhere] = useState('');
  const title = zone === 'staff' ? t('signInStaff') : zone === 'cms' ? t('signInCms') : zone === 'site' ? t('signInCustomer') : t('signInTitle');
  const hint = zone === 'staff' ? t('signInStaffHint') : zone === 'cms' ? t('signInCmsHint') : zone === 'site' ? t('signInCustomerHint') : t('signInHint');
  const [step, setStep] = useState('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setElsewhere('');
    setBusy(true);
    try {
      if (step === 'password') {
        const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
        if (data.twoFactorRequired) {
          setStep('code');
          setPassword('');
          return;
        }
      } else {
        await api('/api/auth/login/2fa', { method: 'POST', body: { code } });
      }
      await refresh();
    } catch (err) {
      if (err.code === 'CHALLENGE_EXPIRED') setStep('password');
      if (err.code === 'WRONG_PORTAL' && err.body && err.body.url) setElsewhere(err.body.url);
      setError(pickMessage(err.message, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-head">
          <img src="/logo.png" alt="" />
          <h1>{title}</h1>
          <p>{hint}</p>
        </div>

        {step === 'password' ? (
          <>
            <label className="field">
              {t('email')}
              <input type="email" dir="ltr" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">
              {t('password')}
              <input type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          </>
        ) : (
          <label className="field">
            {t('code')}
            <input
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="code-input"
            />
            <small>{t('codeHint')}</small>
          </label>
        )}

        {error && <div className="alert alert--error" role="alert">{error}{elsewhere && <div><a className="btn btn--small btn--primary" style={{ marginTop: 8 }} href={elsewhere}>{t('goThere')}</a></div>}</div>}

        <button className="btn btn--primary btn--block" disabled={busy}>
          {step === 'password' ? t('signIn') : t('verify')}
        </button>
        <div className="login-foot">
          {step === 'code' && (
            <button type="button" className="link" onClick={() => { setStep('password'); setCode(''); setError(''); }}>
              {t('back')}
            </button>
          )}
          <button type="button" className="link" onClick={toggle}>{t('language')}</button>
        </div>
        {step === 'password' && (
          <div className="login-links">
            <a href={`/pages/${lang}/forgot-password.html`}>{t('forgotPassword')}</a>
            {(zone === 'site' || zone === 'all') && <a href={`/pages/${lang}/register.html`}>{t('createAccount')}</a>}
            {(zone === 'site' || zone === 'all') && <a href={lang === 'en' ? '/en/index.html' : '/'}>{t('website')}</a>}
          </div>
        )}
      </form>
    </div>
  );
}
