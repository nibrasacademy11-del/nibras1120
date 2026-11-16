// Sign-in accounts (16 Nov 2026): the accounts that are not in the team yet (people who signed up
// on the website). Making one of them an employee, team leader, assistant or owner moves them to
// the team (Team → Employees, where their role changes later). Nobody adds employees by hand.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, pickMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { Loading, Modal, Pager, Pill, useLoad } from '../components/ui.jsx';

const ROLES = ['super_admin', 'assistant', 'team_leader', 'employee', 'customer'];

// Choosing someone's role; used here and on the Employees page
export function RoleDialog({ user, onClose, onSaved }) {
  const { t, en, lang } = useI18n();
  const { me } = useAuth();
  const [role, setRole] = useState(user.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isOwner = me.user.role === 'super_admin';
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/api/v2/users/${user._id}/role`, { method: 'POST', body: { role } });
      onSaved(role);
    } catch (e) {
      setError(pickMessage(e.message, lang));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`${t('sa_change')}: ${user.name}`} onClose={onClose}>
      <div className="role-pick">
        {ROLES.filter((r) => r !== 'super_admin' || isOwner).map((r) => (
          <label key={r} className={`role-pick__opt${role === r ? ' on' : ''}`}>
            <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
            <strong>{en('role', r)}</strong>
            <small className="muted">{t(`sa_about_${r}`)}</small>
          </label>
        ))}
      </div>
      <p className="muted"><small>{t('sa_note')}</small></p>
      {error && <div className="alert alert--error">{error}</div>}
      <div className="row">
        <button type="button" className="btn btn--primary" disabled={busy || role === user.role} onClick={save}>{t('save')}</button>
        <button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button>
      </div>
    </Modal>
  );
}

export default function SignInAccounts() {
  const { t, fmtDay, en } = useI18n();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const state = useLoad(`/api/v2/accounts?page=${page}&kind=customers&q=${encodeURIComponent(search)}`);
  const [edit, setEdit] = useState(null);
  const [done, setDone] = useState(null);

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('userAccountsNav')}</h1>
        <Link className="btn btn--ghost" to="/employees">{t('sa_toTeam')}</Link>
      </div>
      <p className="muted">{t('sa_hint')}</p>
      {done && <div className="alert alert--ok">{t('sa_done').replace('{name}', done.name)} {done.role !== 'customer' && <Link to="/employees">{t('sa_seeTeam')}</Link>}</div>}
      <section className="card">
        <form className="row" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q.trim()); }}>
          <input className="grow" placeholder={t('sa_search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="submit" className="btn btn--primary">{t('search')}</button>
        </form>
      </section>
      <section className="card">
        <Loading state={state}>
          {(d) => (
            <>
              <p className="muted"><small>{t('ca_total').replace('{n}', d.total)}</small></p>
              {!d.items.length ? <p className="muted">{t('ca_none')}</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>{t('name')}</th><th>{t('wsEmail')}</th><th>{t('role')}</th><th>{t('registeredAt')}</th><th>{t('ca_lastLogin')}</th><th /></tr></thead>
                    <tbody>{d.items.map((u) => (
                      <tr key={u._id}>
                        <td><strong>{u.name}</strong>{u.phone && <><br /><small className="muted" dir="ltr">{u.phone}</small></>}</td>
                        <td dir="ltr">{u.email}</td>
                        <td><Pill tone="muted">{en('role', u.role)}</Pill>{u.status === 'disabled' && <> <Pill tone="muted">{t('inactive')}</Pill></>}</td>
                        <td>{fmtDay(u.createdAt)}</td>
                        <td>{u.lastLoginAt ? fmtDay(u.lastLoginAt) : '—'}</td>
                        <td><button type="button" className="btn btn--small btn--primary" onClick={() => { setDone(null); setEdit(u); }}>{t('sa_makeStaff')}</button></td>
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
      {edit && <RoleDialog user={edit} onClose={() => setEdit(null)} onSaved={(role) => { setDone({ name: edit.name, role }); setEdit(null); state.reload(); }} />}
    </>
  );
}
