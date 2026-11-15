import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, useAction } from '../components/ui.jsx';

export default function ChangePassword({ forced }) {
  const { t } = useI18n();
  const { refresh } = useAuth();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [done, setDone] = useState(false);
  const { busy, error, setError, run } = useAction();
  const submit = (e) => {
    e.preventDefault();
    if (f.newPassword !== f.confirm) return setError(t('password') + ' ≠');
    run(() => api('/api/v2/me/password', { method: 'POST', body: { currentPassword: f.currentPassword, newPassword: f.newPassword } }))
      .then(async () => { setDone(true); setF({ currentPassword: '', newPassword: '', confirm: '' }); await refresh(); })
      .catch(() => {});
  };
  return (
    <section className="card">
      <h2>{t('changePassword')}</h2>
      {forced && <div className="alert alert--warn">{t('mustChangePassword')}</div>}
      <form className="stack" onSubmit={submit}>
        <Field label={t('currentPassword')}><input type="password" dir="ltr" autoComplete="current-password" required value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></Field>
        <Field label={t('newPassword')}><input type="password" dir="ltr" autoComplete="new-password" required minLength={8} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></Field>
        <Field label={t('confirmPassword')}><input type="password" dir="ltr" autoComplete="new-password" required minLength={8} value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
        <ErrorBox error={error} />
        {done && <div className="alert alert--ok">{t('saved')}</div>}
        <div><button className="btn btn--primary" disabled={busy}>{t('save')}</button></div>
      </form>
    </section>
  );
}
