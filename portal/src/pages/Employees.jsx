import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Loading, Modal, Pill, StaffSelect, useAction, useLoad } from '../components/ui.jsx';

const STAFF_ROLES = ['employee', 'team_leader', 'customer_support', 'accountant', 'finance_manager', 'hr_manager', 'admin', 'super_admin'];

function useOrg() {
  const teams = useLoad('/api/v2/teams');
  const departments = useLoad('/api/v2/departments');
  return { teams: teams.data?.items || [], departments: departments.data?.items || [], reload: () => { teams.reload(); departments.reload(); } };
}

function EmployeeForm({ emp, onClose, onSaved }) {
  const { t, en, label } = useI18n();
  const { me, can } = useAuth();
  const org = useOrg();
  const [f, setF] = useState({
    nameAr: emp?.nameAr || '', nameEn: emp?.nameEn || '', email: emp?.user?.email || '', phone: emp?.phone || '', jobTitle: emp?.jobTitle || '',
    department: emp?.department?._id || '', team: emp?.team?._id || '', role: emp?.user?.role || 'employee', hireDate: emp?.hireDate ? emp.hireDate.slice(0, 10) : '', reason: ''
  });
  const [temp, setTemp] = useState(null);
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  // The academy works without an accountant: those roles are offered only to someone who already has one
  const HIDDEN = ['accountant', 'finance_manager'];
  const roles = STAFF_ROLES.filter((r) => (me.user.role === 'super_admin' || !['admin', 'super_admin'].includes(r)) && (!HIDDEN.includes(r) || r === emp?.user?.role));
  const canRole = !emp || can('users.manage', 'all');

  const submit = (e) => {
    e.preventDefault();
    const body = { ...f, department: f.department || null, team: f.team || null };
    if (emp && (!canRole || f.role === emp.user?.role)) delete body.role;
    const req = emp ? api(`/api/v2/employees/${emp._id}`, { method: 'PUT', body: { ...body, __v: emp.__v } }) : api('/api/v2/employees', { method: 'POST', body });
    run(() => req).then((d) => (d.temporaryPassword ? setTemp(d.temporaryPassword) : onSaved())).catch(() => {});
  };

  if (temp) {
    return (
      <Modal title={t('tempPassword')} onClose={onSaved}>
        <div className="stack">
          <p className="muted">{t('tempPasswordHint')}</p>
          <code className="big-code" dir="ltr">{temp}</code>
          <div><button type="button" className="btn btn--primary" onClick={onSaved}>{t('done')}</button></div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={emp ? t('edit') : t('newEmployee')} onClose={onClose} wide>
      <form className="form-grid" onSubmit={submit}>
        <Field label={`${t('nameAr')} *`}><input required value={f.nameAr} onChange={set('nameAr')} /></Field>
        <Field label={t('nameEn')}><input dir="ltr" value={f.nameEn} onChange={set('nameEn')} /></Field>
        {!emp && <Field label={`${t('email')} *`}><input dir="ltr" type="email" required value={f.email} onChange={set('email')} /></Field>}
        <Field label={t('phone')}><input dir="ltr" value={f.phone} onChange={set('phone')} /></Field>
        <Field label={t('jobTitle')}><input value={f.jobTitle} onChange={set('jobTitle')} /></Field>
        <Field label={t('department')}>
          <select value={f.department} onChange={set('department')}><option value="">{t('none')}</option>{org.departments.map((d) => <option key={d._id} value={d._id}>{label({ ar: d.nameAr, en: d.nameEn })}</option>)}</select>
        </Field>
        <Field label={t('team')}>
          <select value={f.team} onChange={set('team')}><option value="">{t('none')}</option>{org.teams.map((x) => <option key={x._id} value={x._id}>{label({ ar: x.nameAr, en: x.nameEn })}</option>)}</select>
        </Field>
        {canRole && <Field label={t('role')}><select value={f.role} onChange={set('role')}>{roles.map((r) => <option key={r} value={r}>{en('role', r)}</option>)}</select></Field>}
        <Field label={t('hireDate')}><input type="date" value={f.hireDate} onChange={set('hireDate')} /></Field>
        {emp && <Field label={`${t('reason')} (${t('optional')})`}><input value={f.reason} onChange={set('reason')} /></Field>}
        <div className="field--wide"><ErrorBox error={error} /></div>
        <div className="row field--wide"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

function Offboard({ emp, onClose, onDone }) {
  const { t } = useI18n();
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Modal title={`${t('offboard')}: ${emp.nameAr}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => api(`/api/v2/employees/${emp._id}/offboard`, { method: 'POST', body: { transferTo: to || undefined, reason } })).then(onDone).catch(() => {}); }}>
        <p className="muted">{t('offboardHint')}</p>
        <Field label={t('transferTo')}><StaffSelect value={to} onChange={setTo} exclude={[emp.user?._id]} allowEmpty /></Field>
        <Field label={t('reason')}><input required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--danger" disabled={busy}>{t('offboard')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

function History({ emp, onClose }) {
  const { t, label, fmtDay } = useI18n();
  const state = useLoad(`/api/v2/employees/${emp._id}`);
  return (
    <Modal title={`${t('history')}: ${emp.nameAr}`} onClose={onClose} wide>
      <Loading state={state}>
        {({ item }) => (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('from')}</th><th>{t('to')}</th><th>{t('department')}</th><th>{t('team')}</th><th>{t('jobTitle')}</th><th>{t('reason')}</th><th>{t('who')}</th></tr></thead>
              <tbody>
                {item.history.slice().reverse().map((h, i) => (
                  <tr key={i}>
                    <td>{fmtDay(h.from)}</td><td>{h.to ? fmtDay(h.to) : '—'}</td>
                    <td>{h.department ? label({ ar: h.department.nameAr, en: h.department.nameEn }) : '—'}</td>
                    <td>{h.team ? label({ ar: h.team.nameAr, en: h.team.nameEn }) : '—'}</td>
                    <td>{h.jobTitle}</td><td>{h.reason}</td><td>{h.by?.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Loading>
    </Modal>
  );
}

export default function Employees() {
  const { t, en, label, fmtDate } = useI18n();
  const { can } = useAuth();
  const [status, setStatus] = useState('active');
  const [dialog, setDialog] = useState(null);
  const state = useLoad(`/api/v2/employees?status=${status}`);
  const close = () => setDialog(null);
  const done = () => { setDialog(null); state.reload(); };
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('employees')}</h1>
        {can('employees.create', 'all') && <button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'new' })}>+ {t('newEmployee')}</button>}
      </div>
      <div className="tabs">
        {['active', 'left'].map((s) => <button key={s} type="button" className={`tab${status === s ? ' active' : ''}`} onClick={() => setStatus(s)}>{t(s)}</button>)}
      </div>
      <section className="card">
        <Loading state={state}>
          {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('employeeNo')}</th><th>{t('name')}</th><th>{t('role')}</th><th>{t('jobTitle')}</th><th>{t('department')}</th><th>{t('team')}</th><th>{t('signedInAt')}</th><th /></tr></thead>
                <tbody>
                  {d.items.map((e) => (
                    <tr key={e._id}>
                      <td dir="ltr">{e.employeeNo}</td>
                      <td><strong>{label({ ar: e.nameAr, en: e.nameEn })}</strong><br /><small className="muted" dir="ltr">{e.user?.email}</small></td>
                      <td>{en('role', e.user?.role)} {e.user?.twoFactor?.enabled && <Pill tone="ok">2FA</Pill>}</td>
                      <td>{e.jobTitle || '—'}</td>
                      <td>{e.department ? label({ ar: e.department.nameAr, en: e.department.nameEn }) : '—'}</td>
                      <td>{e.team ? label({ ar: e.team.nameAr, en: e.team.nameEn }) : '—'}</td>
                      <td className="nowrap">{e.user?.lastLoginAt ? fmtDate(e.user.lastLoginAt) : '—'}</td>
                      <td className="nowrap">
                        <button type="button" className="btn btn--small" onClick={() => setDialog({ kind: 'history', emp: e })}>{t('history')}</button>{' '}
                        {e.status === 'active' && can('employees.update') && <button type="button" className="btn btn--small" onClick={() => setDialog({ kind: 'edit', emp: e })}>{t('edit')}</button>}{' '}
                        {e.status === 'active' && can('employees.manage', 'all') && <button type="button" className="btn btn--small" onClick={() => setDialog({ kind: 'offboard', emp: e })}>{t('offboard')}</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </Loading>
      </section>
      {dialog?.kind === 'new' && <EmployeeForm onClose={close} onSaved={done} />}
      {dialog?.kind === 'edit' && <EmployeeForm emp={dialog.emp} onClose={close} onSaved={done} />}
      {dialog?.kind === 'offboard' && <Offboard emp={dialog.emp} onClose={close} onDone={done} />}
      {dialog?.kind === 'history' && <History emp={dialog.emp} onClose={close} />}
    </>
  );
}

export function Teams() {
  const { t, label } = useI18n();
  const { can } = useAuth();
  const teams = useLoad('/api/v2/teams');
  const departments = useLoad('/api/v2/departments');
  const [dialog, setDialog] = useState(null);
  const canEdit = can('teams.update', 'all');
  const done = () => { setDialog(null); teams.reload(); departments.reload(); };

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('teams')}</h1>
        {canEdit && (
          <div className="row">
            <button type="button" className="btn btn--ghost" onClick={() => setDialog({ kind: 'department' })}>+ {t('newDepartment')}</button>
            <button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'team' })}>+ {t('newTeam')}</button>
          </div>
        )}
      </div>
      <section className="card">
        <h2>{t('teams')}</h2>
        <Loading state={teams}>
          {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('name')}</th><th>{t('department')}</th><th>{t('leader')}</th><th>{t('members')}</th><th /></tr></thead>
                <tbody>
                  {d.items.map((x) => (
                    <tr key={x._id} className={x.active ? '' : 'muted'}>
                      <td><strong>{label({ ar: x.nameAr, en: x.nameEn })}</strong></td>
                      <td>{x.department ? label({ ar: x.department.nameAr, en: x.department.nameEn }) : '—'}</td>
                      <td>{x.leader ? x.leader.name : '—'}</td>
                      <td>{x.members}</td>
                      <td>{canEdit && <button type="button" className="btn btn--small" onClick={() => setDialog({ kind: 'team', item: x })}>{t('edit')}</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </Loading>
      </section>
      <section className="card">
        <h2>{t('departments')}</h2>
        <Loading state={departments}>
          {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
            <ul className="plain-list">
              {d.items.map((x) => (
                <li key={x._id}>{label({ ar: x.nameAr, en: x.nameEn })} {!x.active && <Pill tone="muted">—</Pill>} {canEdit && <button type="button" className="link" onClick={() => setDialog({ kind: 'department', item: x })}>{t('edit')}</button>}</li>
              ))}
            </ul>
          ))}
        </Loading>
      </section>
      {dialog && <OrgForm kind={dialog.kind} item={dialog.item} departments={departments.data?.items || []} onClose={() => setDialog(null)} onSaved={done} />}
    </>
  );
}

function OrgForm({ kind, item, departments, onClose, onSaved }) {
  const { t, label } = useI18n();
  const [f, setF] = useState({ nameAr: item?.nameAr || '', nameEn: item?.nameEn || '', department: item?.department?._id || '', leader: item?.leader?._id || '', active: item ? item.active : true });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e });
  const base = kind === 'team' ? '/api/v2/teams' : '/api/v2/departments';
  const submit = (e) => {
    e.preventDefault();
    const body = { ...f, department: f.department || null, leader: f.leader || null, __v: item?.__v };
    run(() => api(item ? `${base}/${item._id}` : base, { method: item ? 'PUT' : 'POST', body })).then(onSaved).catch(() => {});
  };
  return (
    <Modal title={kind === 'team' ? (item ? t('edit') : t('newTeam')) : (item ? t('edit') : t('newDepartment'))} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label={t('nameAr')}><input required value={f.nameAr} onChange={set('nameAr')} /></Field>
        <Field label={t('nameEn')}><input dir="ltr" value={f.nameEn} onChange={set('nameEn')} /></Field>
        {kind === 'team' && (
          <>
            <Field label={t('department')}><select value={f.department} onChange={set('department')}><option value="">{t('none')}</option>{departments.map((d) => <option key={d._id} value={d._id}>{label({ ar: d.nameAr, en: d.nameEn })}</option>)}</select></Field>
            <Field label={t('leader')}><StaffSelect value={f.leader} onChange={set('leader')} allowEmpty /></Field>
          </>
        )}
        <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> {t('active')}</label>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}
