import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Loading, Modal, Pill, useAction, useLoad, useStaff } from '../components/ui.jsx';
import { BrandBand, PrintFooter } from '../components/Print.jsx';
import { Money } from './Finance.jsx';

// Payroll for HR and the owner: the monthly sheet, basic salaries and advances.
// Employees see only their own approved payslips (MyPayslips).

const thisMonth = () => new Date().toISOString().slice(0, 7);
const TABS = ['runs', 'salaries', 'advances'];

export default function Payroll() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'runs';
  const runId = params.get('run');
  return (
    <>
      <h1 className="page-title">{t('payrollNav')}</h1>
      <div className="tabs no-print" role="tablist">
        {TABS.map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setParams({ tab: k })}>{t(`pr_${k}`)}</button>)}
      </div>
      {tab === 'runs' && (runId ? <RunSheet id={runId} onBack={() => setParams({ tab: 'runs' })} /> : <Runs onOpen={(id) => setParams({ tab: 'runs', run: id })} />)}
      {tab === 'salaries' && <Salaries />}
      {tab === 'advances' && <Advances />}
    </>
  );
}

function Totals({ totals }) {
  const list = Object.entries(totals || {});
  if (!list.length) return <span className="muted">—</span>;
  return <span className="amounts">{list.map(([c, v], i) => <span key={c}>{i > 0 && <span className="muted"> · </span>}<Money amount={v.net} currency={c} /></span>)}</span>;
}

function Runs({ onOpen }) {
  const { t, fmtDay } = useI18n();
  const { can } = useAuth();
  const state = useLoad('/api/v2/payroll/runs');
  const [month, setMonth] = useState(thisMonth());
  const { busy, error, run } = useAction();
  const create = () => run(async () => { const r = await api('/api/v2/payroll/runs', { method: 'POST', body: { month } }); onOpen(r.item._id); });
  return (
    <>
      {can('payroll.create', 'all') && (
        <section className="card">
          <div className="row">
            <label className="field" style={{ minWidth: 200 }}>{t('pr_month')}<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
            <button type="button" className="btn btn--primary" disabled={busy || !month} onClick={create} style={{ alignSelf: 'flex-end' }}>{t('pr_newRun')}</button>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>{t('pr_newRunHint')}</p>
          <ErrorBox error={error} />
        </section>
      )}
      <section className="card">
        <Loading state={state}>
          {(d) => (!d.items.length ? <p className="empty">{t('pr_noRuns')}</p> : (
            <div className="table-wrap">
              <table className="table table--hover">
                <thead><tr><th>{t('pr_month')}</th><th>{t('status')}</th><th>{t('pr_people')}</th><th>{t('pr_net')}</th><th>{t('pr_approvedAt')}</th></tr></thead>
                <tbody>{d.items.map((r) => (
                  <tr key={r._id} onClick={() => onOpen(r._id)}>
                    <td><strong dir="ltr">{r.month}</strong></td>
                    <td><Pill tone={r.status === 'approved' ? 'ok' : 'gold'}>{t(`pr_st_${r.status}`)}</Pill></td>
                    <td>{r.people}</td>
                    <td><Totals totals={r.totals} /></td>
                    <td>{r.approvedAt ? fmtDay(r.approvedAt) : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ))}
        </Loading>
      </section>
    </>
  );
}

function RunSheet({ id, onBack }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const state = useLoad(`/api/v2/payroll/runs/${id}`, [id]);
  const [editing, setEditing] = useState(null);
  const [slip, setSlip] = useState(null);
  const { busy, error, run } = useAction();
  const act = (path, method = 'POST', body) => run(async () => { await api(path, { method, body }); state.reload(); });
  return (
    <Loading state={state}>
      {({ item: r }) => (
        <>
          <div className="page-head no-print">
            <div>
              <button type="button" className="link" onClick={onBack}>← {t('pr_runs')}</button>
              <h2 style={{ margin: '6px 0 0' }}>{t('pr_sheetOf')} <span dir="ltr">{r.month}</span> <Pill tone={r.status === 'approved' ? 'ok' : 'gold'}>{t(`pr_st_${r.status}`)}</Pill></h2>
            </div>
            <div className="row">
              {r.status === 'draft' && can('payroll.update', 'all') && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => act(`/api/v2/payroll/runs/${id}/refresh`)}>{t('pr_refresh')}</button>}
              {r.status === 'draft' && can('payroll.approve', 'all') && <button type="button" className="btn btn--primary" disabled={busy} onClick={() => window.confirm(t('pr_approveConfirm')) && act(`/api/v2/payroll/runs/${id}/approve`, 'POST', { __v: r.__v })}>{t('pr_approve')}</button>}
              {r.status === 'draft' && can('payroll.archive', 'all') && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => window.confirm(t('pr_deleteConfirm')) && run(async () => { await api(`/api/v2/payroll/runs/${id}`, { method: 'DELETE' }); onBack(); })}>{t('wsDelete')}</button>}
              <button type="button" className="btn btn--ghost" onClick={() => window.print()}>{t('printPdf')}</button>
            </div>
          </div>
          <ErrorBox error={error} />
          {r.status === 'draft' && <div className="alert alert--info no-print">{t('pr_draftHint')}</div>}
          <div className="print-only"><BrandBand title={`${t('pr_sheetOf')} ${r.month}`} /></div>
          <section className="card">
            <div className="table-wrap">
              <table className="table">
                <thead><tr>
                  <th>{t('name')}</th><th>{t('pr_basic')}</th><th>{t('pr_commission')}</th><th>{t('pr_attendance')}</th>
                  <th>{t('pr_bonus')}</th><th>{t('pr_advance')}</th><th>{t('pr_deduction')}</th><th>{t('pr_net')}</th><th className="no-print" />
                </tr></thead>
                <tbody>{r.lines.map((l) => (
                  <tr key={l.user}>
                    <td><strong>{l.name}</strong><br /><small className="muted">{l.employeeNo}{l.teamName ? ` · ${l.teamName}` : ''}</small></td>
                    <td><Money amount={l.basic} currency={l.currency} /></td>
                    <td><Money amount={l.commission} currency={l.currency} />{l.otherCommissions?.map((o) => <div key={o.currency}><small className="muted">+ <Money amount={o.amount} currency={o.currency} /></small></div>)}</td>
                    <td><small>{t('pr_absent')}: <b className={l.attendance.absent ? 'late' : ''}>{l.attendance.absent}</b> · {t('pr_lateMin')}: <b className={l.attendance.lateMinutes ? 'late' : ''}>{l.attendance.lateMinutes}</b><br />{t('pr_earlyMin')}: {l.attendance.earlyLeaveMinutes} · {t('pr_leaveDays')}: {l.attendance.leave}</small></td>
                    <td><Money amount={l.bonus} currency={l.currency} />{l.bonusNote && <div><small className="muted">{l.bonusNote}</small></div>}</td>
                    <td>{l.advanceDeduction ? <Money amount={-l.advanceDeduction} currency={l.currency} /> : '—'}</td>
                    <td>{l.deduction ? <Money amount={-l.deduction} currency={l.currency} /> : '—'}{l.deductionNote && <div><small className="muted">{l.deductionNote}</small></div>}</td>
                    <td><Money amount={l.net} currency={l.currency} strong /></td>
                    <td className="actions no-print">
                      {r.status === 'draft' && can('payroll.update', 'all') && <button type="button" className="btn btn--small" onClick={() => setEditing(l)}>{t('edit')}</button>}
                      {r.status === 'approved' && <button type="button" className="btn btn--small btn--ghost" onClick={() => setSlip(l)}>{t('pr_payslip')}</button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p className="report-foot"><strong>{t('pr_total')}:</strong> <Totals totals={r.totals} /></p>
          </section>
          {editing && <LineDialog run={r} line={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); state.reload(); }} />}
          {slip && <Modal title={t('pr_payslip')} wide onClose={() => setSlip(null)}><Payslip month={r.month} line={slip} /><div className="row no-print" style={{ marginTop: 12 }}><button type="button" className="btn btn--primary" onClick={() => window.print()}>{t('printPdf')}</button></div></Modal>}
        </>
      )}
    </Loading>
  );
}

function LineDialog({ run: r, line, onClose, onSaved }) {
  const { t } = useI18n();
  const [f, setF] = useState({ bonus: line.bonus, bonusNote: line.bonusNote, deduction: line.deduction, deductionNote: line.deductionNote });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = (e) => { e.preventDefault(); run(async () => { await api(`/api/v2/payroll/runs/${r._id}/lines/${line.user}`, { method: 'PUT', body: { ...f, __v: r.__v } }); onSaved(); }); };
  const a = line.attendance;
  return (
    <Modal title={`${line.name} · ${r.month}`} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <div className="alert alert--info" style={{ margin: 0 }}>
          <strong>{t('pr_attendance')}:</strong> {t('pr_present')} {a.present}/{a.workingDays} · {t('pr_absent')} {a.absent} · {t('pr_lateMin')} {a.lateMinutes} · {t('pr_earlyMin')} {a.earlyLeaveMinutes} · {t('pr_leaveDays')} {a.leave}
          <div><small>{t('pr_deductionHint')}</small></div>
        </div>
        <div className="form-grid">
          <Field label={`${t('pr_bonus')} (${line.currency})`}><input type="number" min="0" step="0.01" value={f.bonus} onChange={set('bonus')} /></Field>
          <Field label={t('pr_bonusNote')}><input value={f.bonusNote} onChange={set('bonusNote')} /></Field>
          <Field label={`${t('pr_deduction')} (${line.currency})`}><input type="number" min="0" step="0.01" value={f.deduction} onChange={set('deduction')} /></Field>
          <Field label={t('pr_deductionNote')}><input value={f.deductionNote} onChange={set('deductionNote')} required={Number(f.deduction) > 0} /></Field>
        </div>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

// The payslip itself (also printed)
export function Payslip({ month, line }) {
  const { t } = useI18n();
  const rows = [
    [t('pr_basic'), line.basic],
    [t('pr_commission'), line.commission],
    [`${t('pr_bonus')}${line.bonusNote ? ` (${line.bonusNote})` : ''}`, line.bonus],
    [t('pr_advance'), -line.advanceDeduction],
    [`${t('pr_deduction')}${line.deductionNote ? ` (${line.deductionNote})` : ''}`, -line.deduction]
  ];
  return (
    <div className="receipt">
      <BrandBand title={t('pr_payslip')} subtitle={<span dir="ltr">{month}</span>} />
      <p className="receipt-line"><strong>{line.name}</strong> · {line.employeeNo}{line.jobTitle ? ` · ${line.jobTitle}` : ''}{line.teamName ? ` · ${line.teamName}` : ''}</p>
      <table className="table receipt-table">
        <tbody>
          {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td><Money amount={v} currency={line.currency} /></td></tr>)}
          {line.otherCommissions?.length > 0 && <tr><th>{t('pr_otherCommissions')}</th><td>{line.otherCommissions.map((o) => <div key={o.currency}><Money amount={o.amount} currency={o.currency} /></div>)}</td></tr>}
          <tr className="receipt-total"><th>{t('pr_net')}</th><td><Money amount={line.net} currency={line.currency} strong /></td></tr>
        </tbody>
      </table>
      <p className="muted"><small>{t('pr_attendance')}: {t('pr_present')} {line.attendance.present}/{line.attendance.workingDays} · {t('pr_absent')} {line.attendance.absent} · {t('pr_lateMin')} {line.attendance.lateMinutes} · {t('pr_leaveDays')} {line.attendance.leave}</small></p>
      <div className="receipt-bottom"><div className="receipt-sign"><span>{t('pr_signHr')}</span><span>{t('pr_signEmployee')}</span></div></div>
      <PrintFooter />
    </div>
  );
}

function Salaries() {
  const { t } = useI18n();
  const { can } = useAuth();
  const state = useLoad('/api/v2/payroll/salaries');
  const [editing, setEditing] = useState(null);
  return (
    <section className="card">
      <p className="muted">{t('pr_salariesHint')}</p>
      <Loading state={state}>
        {(d) => (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('name')}</th><th>{t('jobTitle')}</th><th>{t('pr_basic')}</th><th /></tr></thead>
              <tbody>{d.items.map((e) => (
                <tr key={e._id}>
                  <td><strong>{e.nameAr}</strong><br /><small className="muted">{e.employeeNo}{e.team ? ` · ${e.team}` : ''}</small></td>
                  <td>{e.jobTitle || '—'}</td>
                  <td>{e.salary.basic ? <Money amount={e.salary.basic} currency={e.salary.currency} /> : <span className="late">{t('pr_noSalary')}</span>}</td>
                  <td className="actions">{can('payroll.update', 'all') && <button type="button" className="btn btn--small" onClick={() => setEditing(e)}>{t('edit')}</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Loading>
      {editing && <SalaryDialog emp={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); state.reload(); }} />}
    </section>
  );
}

function SalaryDialog({ emp, onClose, onSaved }) {
  const { t } = useI18n();
  const [f, setF] = useState({ basic: emp.salary.basic || '', currency: emp.salary.currency || 'EGP', reason: '' });
  const { busy, error, run } = useAction();
  const save = (e) => { e.preventDefault(); run(async () => { await api(`/api/v2/payroll/salaries/${emp._id}`, { method: 'PUT', body: f }); onSaved(); }); };
  return (
    <Modal title={`${t('pr_basic')} · ${emp.nameAr}`} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <div className="form-grid">
          <Field label={t('pr_basic')}><input type="number" min="0" step="0.01" required value={f.basic} onChange={(e) => setF({ ...f, basic: e.target.value })} /></Field>
          <Field label={t('currency')}><input dir="ltr" maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /></Field>
          <Field label={t('reason')} wide><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder={t('pr_salaryReason')} /></Field>
        </div>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

function Advances() {
  const { t } = useI18n();
  const { can } = useAuth();
  const state = useLoad('/api/v2/payroll/advances');
  const [creating, setCreating] = useState(false);
  const { busy, error, run } = useAction();
  const cancel = (a) => {
    const reason = window.prompt(t('pr_cancelReason'));
    if (reason) run(async () => { await api(`/api/v2/payroll/advances/${a._id}/cancel`, { method: 'POST', body: { reason } }); state.reload(); });
  };
  return (
    <section className="card">
      <div className="card-head"><h2>{t('pr_advances')}</h2>{can('payroll.create', 'all') && <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>+ {t('pr_newAdvance')}</button>}</div>
      <p className="muted">{t('pr_advancesHint')}</p>
      <ErrorBox error={error} />
      <Loading state={state}>
        {(d) => (!d.items.length ? <p className="empty">{t('pr_noAdvances')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('name')}</th><th>{t('amount')}</th><th>{t('pr_installments')}</th><th>{t('pr_repaid')}</th><th>{t('status')}</th><th /></tr></thead>
              <tbody>{d.items.map((a) => (
                <tr key={a._id}>
                  <td><strong>{a.user?.name}</strong>{a.reason && <><br /><small className="muted">{a.reason}</small></>}</td>
                  <td><Money amount={a.amount} currency={a.currency} /></td>
                  <td>{a.installments} · {t('pr_from')} <span dir="ltr">{a.startMonth}</span></td>
                  <td><Money amount={a.repaid} currency={a.currency} /></td>
                  <td><Pill tone={a.status === 'active' ? 'gold' : a.status === 'repaid' ? 'ok' : 'muted'}>{t(`pr_adv_${a.status}`)}</Pill></td>
                  <td className="actions">{a.status === 'active' && can('payroll.update', 'all') && <button type="button" className="btn btn--small btn--ghost" disabled={busy} onClick={() => cancel(a)}>{t('cancel')}</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ))}
      </Loading>
      {creating && <AdvanceDialog onClose={() => setCreating(false)} onSaved={() => { setCreating(false); state.reload(); }} />}
    </section>
  );
}

function AdvanceDialog({ onClose, onSaved }) {
  const { t } = useI18n();
  const staff = useStaff();
  const [f, setF] = useState({ user: '', amount: '', installments: 3, startMonth: thisMonth(), reason: '' });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = (e) => { e.preventDefault(); run(async () => { await api('/api/v2/payroll/advances', { method: 'POST', body: f }); onSaved(); }); };
  return (
    <Modal title={t('pr_newAdvance')} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <div className="form-grid">
          <Field label={t('pr_employee')} wide><select required value={f.user} onChange={set('user')}><option value="">—</option>{(staff || []).map((s) => <option key={s.id || s._id} value={s.id || s._id}>{s.name}</option>)}</select></Field>
          <Field label={t('amount')}><input type="number" min="1" step="0.01" required value={f.amount} onChange={set('amount')} /></Field>
          <Field label={t('pr_installments')}><input type="number" min="1" max="60" required value={f.installments} onChange={set('installments')} /></Field>
          <Field label={t('pr_startMonth')}><input type="month" required value={f.startMonth} onChange={set('startMonth')} /></Field>
          <Field label={t('reason')}><input value={f.reason} onChange={set('reason')} /></Field>
        </div>
        {f.amount && f.installments ? <p className="muted">{t('pr_perMonth')}: {(Number(f.amount) / Number(f.installments)).toFixed(2)}</p> : null}
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

// ---- an employee's own payslips ----
export function MyPayslips() {
  const { t } = useI18n();
  const { month } = useParams();
  const state = useLoad('/api/v2/payroll/mine');
  const advances = useLoad('/api/v2/payroll/my-advances');
  return (
    <>
      <h1 className="page-title no-print">{t('myPayslipsNav')}</h1>
      <Loading state={state}>
        {(d) => {
          if (!d.items.length) return <p className="card empty">{t('pr_noPayslips')}</p>;
          const open = d.items.find((x) => x.month === month);
          if (open) return (<><p className="no-print"><Link to="/my-payslips">← {t('myPayslipsNav')}</Link></p><section className="card"><Payslip month={open.month} line={open.line} /></section><button type="button" className="btn btn--primary no-print" onClick={() => window.print()}>{t('printPdf')}</button></>);
          return (
            <section className="card">
              <h2>{t('pr_payslips')}</h2>
              <div className="table-wrap">
                <table className="table table--hover">
                  <thead><tr><th>{t('pr_month')}</th><th>{t('pr_net')}</th><th /></tr></thead>
                  <tbody>{d.items.map((x) => <tr key={x.month}><td dir="ltr"><strong>{x.month}</strong></td><td><Money amount={x.line.net} currency={x.line.currency} strong /></td><td className="actions"><Link className="btn btn--small" to={`/my-payslips/${x.month}`}>{t('pr_payslip')}</Link></td></tr>)}</tbody>
                </table>
              </div>
            </section>
          );
        }}
      </Loading>
      <section className="card">
        <h2>{t('pr_myAdvances')}</h2>
        <Loading state={advances}>
          {(d) => (!d.items.length ? <p className="muted">{t('pr_noAdvances')}</p> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>{t('amount')}</th><th>{t('pr_installments')}</th><th>{t('pr_repaid')}</th><th>{t('status')}</th></tr></thead>
              <tbody>{d.items.map((a) => <tr key={a._id}><td><Money amount={a.amount} currency={a.currency} /></td><td>{a.installments} · {t('pr_from')} <span dir="ltr">{a.startMonth}</span></td><td><Money amount={a.repaid} currency={a.currency} /></td><td><Pill tone={a.status === 'active' ? 'gold' : a.status === 'repaid' ? 'ok' : 'muted'}>{t(`pr_adv_${a.status}`)}</Pill></td></tr>)}</tbody>
            </table></div>
          ))}
        </Loading>
        <p className="muted" style={{ marginBottom: 0 }}><small>{t('pr_myMoneyNote')}</small></p>
      </section>
    </>
  );
}
