// Sign-in accounts (16 Nov 2026): every account on the site and in the portal, and anyone's role
// changed from here: a customer becomes an employee, an employee becomes a customer, and so on.
import { useState } from 'react';
import { api, pickMessage } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Loading, Modal, Pager, Pill, useLoad } from '../components/ui.jsx';

const KINDS = ['all', 'staff', 'customers'];
const ROLE_TONE = { super_admin: 'gold', assistant: 'ok', team_leader: 'ok', employee: 'muted', customer: 'muted' };

export default function SignInAccounts() {
  const { t, fmtDay, lang, label } = useI18n();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [page, setPage] = useState(1);
  const state = useLoad(`/api/v2/accounts?page=${page}&kind=${kind === 'all' ? '' : kind}&q=${encodeURIComponent(search)}`);
  const [edit, setEdit] = useState(null);
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/api/v2/users/${edit._id}/role`, { method: 'POST', body: { role } });
      setDone(t('sa_done').replace('{name}', edit.name));
      setEdit(null);
      state.reload();
    } catch (e) {
      setError(pickMessage(e.message, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('userAccountsNav')}</h1>
      </div>
      <p className="muted">{t('sa_hint')}</p>
      {done && <div className="alert alert--ok">{done}</div>}
      <section className="card">
        <form className="row" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q.trim()); }}>
          <input className="grow" placeholder={t('sa_search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="submit" className="btn btn--primary">{t('search')}</button>
        </form>
        <div className="chips" style={{ marginTop: 12 }}>
          {KINDS.map((k) => <button key={k} type="button" className={`chip${kind === k ? ' chip--on' : ''}`} onClick={() => { setKind(k); setPage(1); }}>{t(`sa_kind_${k}`)}</button>)}
        </div>
      </section>
      <section className="card">
        <Loading state={state}>
          {(d) => {
            const roleName = (key) => { const r = d.roles.find((x) => x.key === key); return r ? label({ ar: r.ar, en: r.en }) : key; };
            return (
              <>
                <p className="muted"><small>{t('ca_total').replace('{n}', d.total)}</small></p>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>{t('name')}</th><th>{t('wsEmail')}</th><th>{t('role')}</th><th>{t('registeredAt')}</th><th>{t('ca_lastLogin')}</th><th /></tr></thead>
                    <tbody>{d.items.map((u) => (
                      <tr key={u._id}>
                        <td><strong>{u.name}</strong>{u.phone && <><br /><small className="muted" dir="ltr">{u.phone}</small></>}</td>
                        <td dir="ltr">{u.email}</td>
                        <td>
                          <Pill tone={ROLE_TONE[u.role]}>{roleName(u.role)}</Pill>
                          {u.status === 'disabled' && <> <Pill tone="muted">{t('inactive')}</Pill></>}
                          {u.isPrimaryOwner && <> <Pill tone="gold">{t('dbPrimaryOwner')}</Pill></>}
                        </td>
                        <td>{fmtDay(u.createdAt)}</td>
                        <td>{u.lastLoginAt ? fmtDay(u.lastLoginAt) : '—'}</td>
                        <td>{!u.isPrimaryOwner && (u.role !== 'super_admin' || d.canGiveOwner) && (
                          <button type="button" className="btn btn--small btn--ghost" onClick={() => { setDone(''); setError(''); setRole(u.role); setEdit(u); }}>{t('sa_change')}</button>
                        )}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <Pager page={page} total={d.total} limit={d.limit} onPage={setPage} />

                {edit && (
                  <Modal title={`${t('sa_change')}: ${edit.name}`} onClose={() => setEdit(null)}>
                    <div className="role-pick">
                      {d.roles.filter((r) => r.key !== 'super_admin' || d.canGiveOwner).map((r) => (
                        <label key={r.key} className={`role-pick__opt${role === r.key ? ' on' : ''}`}>
                          <input type="radio" name="role" value={r.key} checked={role === r.key} onChange={() => setRole(r.key)} />
                          <strong>{label({ ar: r.ar, en: r.en })}</strong>
                          <small className="muted">{t(`sa_about_${r.key}`)}</small>
                        </label>
                      ))}
                    </div>
                    <p className="muted"><small>{t('sa_note')}</small></p>
                    {error && <div className="alert alert--error">{error}</div>}
                    <div className="row">
                      <button type="button" className="btn btn--primary" disabled={busy || role === edit.role} onClick={save}>{t('save')}</button>
                      <button type="button" className="btn btn--ghost" onClick={() => setEdit(null)}>{t('cancel')}</button>
                    </div>
                  </Modal>
                )}
              </>
            );
          }}
        </Loading>
      </section>
    </>
  );
}
