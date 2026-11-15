// Customer sign-in accounts: customer service and the owner find a customer's account and give a
// temporary password when the customer forgot theirs (they choose a new one when they sign in).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, pickMessage } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Loading, Modal, Pager, Pill, useLoad } from '../components/ui.jsx';

export default function CustomerAccounts() {
  const { t, fmtDay, lang } = useI18n();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const state = useLoad(`/api/v2/customer-accounts?page=${page}&q=${encodeURIComponent(search)}`);
  const [ask, setAsk] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const reset = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api(`/api/v2/customer-accounts/${ask._id}/reset-password`, { method: 'POST' });
      setDone({ ...r, name: ask.name });
      setAsk(null);
      setCopied(false);
      state.reload();
    } catch (e) {
      setError(pickMessage(e.message, lang));
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(done.password); setCopied(true); } catch { setCopied(false); }
  };

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('ca_title')}</h1>
      </div>
      <p className="muted">{t('ca_hint')}</p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q.trim()); }}>
        <input className="grow" placeholder={t('ca_search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="btn btn--primary">{t('search')}</button>
      </form>
      <section className="card">
        <Loading state={state}>
          {(d) => (
            <>
              <p className="muted"><small>{t('ca_total').replace('{n}', d.total)}</small></p>
              {!d.items.length ? <p className="empty">{t('ca_none')}</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>{t('name')}</th><th>{t('wsEmail')}</th><th>{t('registeredAt')}</th><th>{t('ca_lastLogin')}</th><th>{t('status')}</th><th /></tr></thead>
                    <tbody>{d.items.map((u) => (
                      <tr key={u._id}>
                        <td>
                          {u.customer ? <Link to={`/customers/${u.customer._id}`}>{u.name}</Link> : u.name}
                          {u.customer && <><br /><small className="muted" dir="ltr">{u.customer.customerNo}</small></>}
                          {u.phone && <><br /><small className="muted" dir="ltr">{u.phone}</small></>}
                        </td>
                        <td dir="ltr">{u.email}</td>
                        <td>{fmtDay(u.createdAt)}</td>
                        <td>{u.lastLoginAt ? fmtDay(u.lastLoginAt) : '—'}</td>
                        <td>
                          {u.status === 'disabled' ? <Pill tone="muted">{t('inactive')}</Pill>
                            : u.mustChangePassword ? <Pill tone="warn">{t('ca_temporary')}</Pill>
                              : u.emailVerifiedAt ? <Pill tone="ok">{t('ca_verified')}</Pill>
                                : <Pill tone="muted">{t('ca_notVerified')}</Pill>}
                        </td>
                        <td>
                          {u.status !== 'disabled' && <button type="button" className="btn btn--small btn--ghost" onClick={() => { setError(''); setAsk(u); }}>{t('ca_reset')}</button>}
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              <Pager page={page} total={d.total} limit={d.limit} onPage={setPage} />
            </>
          )}
        </Loading>
      </section>

      {ask && (
        <Modal title={t('ca_reset')} onClose={() => setAsk(null)}>
          <p>{t('ca_confirm').replace('{name}', ask.name).replace('{email}', ask.email)}</p>
          {error && <div className="alert alert--error">{error}</div>}
          <div className="row">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={reset}>{t('ca_reset')}</button>
            <button type="button" className="btn btn--ghost" onClick={() => setAsk(null)}>{t('cancel')}</button>
          </div>
        </Modal>
      )}

      {done && (
        <Modal title={t('ca_doneTitle')} onClose={() => setDone(null)}>
          <p>{t('ca_doneText').replace('{name}', done.name)}</p>
          <p className="temp-password" dir="ltr"><strong>{done.password}</strong></p>
          <p className="muted"><small dir="ltr">{done.email}</small></p>
          <div className="alert alert--warn">{t('ca_doneNote')}</div>
          <div className="row">
            <button type="button" className="btn btn--primary" onClick={copy}>{copied ? t('ca_copied') : t('ca_copy')}</button>
            <button type="button" className="btn btn--ghost" onClick={() => setDone(null)}>{t('close')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
