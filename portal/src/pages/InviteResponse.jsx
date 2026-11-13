import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, pickMessage } from '../api.js';
import { useI18n } from '../i18n.jsx';

// The page behind an invitation link: the invited person sees who invites them to which team,
// and accepts (confirming their phone number and choosing a password) or rejects.
export default function InviteResponse() {
  const { token } = useParams();
  const { t, lang, toggle } = useI18n();
  const [info, setInfo] = useState(null);
  const [f, setF] = useState({ phone: '', email: '', password: '' });
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api(`/api/v2/invitations/${encodeURIComponent(token)}`).then(setInfo).catch(() => setInfo({ status: 'invalid' })); }, [token]);

  const send = async (what) => {
    setError('');
    setBusy(true);
    try {
      const r = await api(`/api/v2/invitations/${encodeURIComponent(token)}/${what}`, { method: 'POST', body: what === 'accept' ? f : {} });
      setDone(r.status);
    } catch (e) {
      setError(pickMessage(e.message, lang));
    } finally {
      setBusy(false);
    }
  };

  const card = (children) => (
    <div className="login">
      <div className="login-card">
        <div className="login-head"><img src="/logo.png" alt="" /><h1>{info?.academy || t('portal')}</h1></div>
        {children}
        <div className="login-foot"><span /><button type="button" className="link" onClick={toggle}>{t('language')}</button></div>
      </div>
    </div>
  );

  if (!info) return card(<p className="muted">{t('loading')}</p>);
  if (done === 'accepted') return card(<div className="alert alert--ok">{t('iv_acceptedWait')}</div>);
  if (done === 'active') return card(<><div className="alert alert--ok">{t('iv_active')}</div><a className="btn btn--primary btn--block" href="/portal/login">{t('signIn')}</a></>);
  if (done === 'rejected') return card(<div className="alert alert--info">{t('iv_rejected')}</div>);
  if (info.status !== 'pending') return card(<div className="alert alert--warn">{t(info.status === 'invalid' ? 'iv_invalid' : `iv_closed_${info.status}`) || t('iv_invalid')}</div>);

  return card(
    <>
      <div className="invite-box">
        <p style={{ margin: 0 }}>{t('iv_hello')} <strong>{info.name}</strong>،</p>
        <p style={{ margin: '6px 0 0' }}><strong>{info.invitedBy}</strong> {t('iv_invites')} <strong>{info.team}</strong>{info.jobTitle ? ` (${info.jobTitle})` : ''}.</p>
        <p className="muted" style={{ margin: '6px 0 0' }}><small>{t('iv_leader')}: {info.leader} · {t('iv_valid')} {new Date(info.expiresAt).toLocaleDateString(lang === 'en' ? 'en-GB' : 'ar-EG')}</small></p>
      </div>
      <form className="stack" style={{ maxWidth: 'none', margin: 0 }} onSubmit={(e) => { e.preventDefault(); send('accept'); }}>
        <label className="field">{t('iv_phone')}<input required dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /><small>{t('iv_phoneHint')}</small></label>
        {info.needsEmail && <label className="field">{t('email')}<input required type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>}
        <label className="field">{t('password')}<input required type="password" dir="ltr" minLength={8} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /><small>{t('iv_passwordHint')}</small></label>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <button className="btn btn--primary btn--block" disabled={busy}>{t('iv_accept')}</button>
        <button type="button" className="btn btn--ghost btn--block" disabled={busy} onClick={() => window.confirm(t('iv_rejectConfirm')) && send('reject')}>{t('iv_reject')}</button>
      </form>
    </>
  );
}
