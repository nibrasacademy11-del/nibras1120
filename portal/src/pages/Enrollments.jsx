import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Loading, Modal, Pager, Pill, StaffSelect, useAction, useLoad } from '../components/ui.jsx';
import { SplitEditor } from './Commissions.jsx';

const ENROLLMENT_STATUSES = ['active', 'on_hold', 'completed', 'withdrawn', 'cancelled'];
const MODULE_STATUSES = ['not_started', 'in_progress', 'ready_for_review', 'approved', 'rejected', 'certificate_issued'];
const NOTE_ACTIONS = ['team_leader_reject', 'reject', 'reopen'];

export function ProgressBar({ progress }) {
  return (
    <span className="progress" title={`${progress.done}/${progress.target}`}>
      <span className="bar"><span className="bar-fill bar--customer" style={{ width: `${progress.percent}%` }} /></span>
      <small>{progress.done}/{progress.target}</small>
    </span>
  );
}

export function ModuleStatus({ status }) {
  const { en } = useI18n();
  return <Pill tone={status}>{en('moduleStatus', status)}</Pill>;
}

// ---- enroll a customer ----

export function EnrollForm({ customer, onClose, onSaved }) {
  const { t, label } = useI18n();
  const { can } = useAuth();
  const programs = useLoad('/api/v2/programs?limit=500');
  const [f, setF] = useState({ program: '', cohort: '', owner: '', notes: '' });
  const cohorts = useLoad(f.program ? `/api/v2/cohorts?program=${f.program}&open=1` : null, [f.program]);
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e, ...(k === 'program' ? { cohort: '' } : {}) });
  const submit = (e) => {
    e.preventDefault();
    run(() => api('/api/v2/enrollments', { method: 'POST', body: { customer: customer.id, program: f.program, cohort: f.cohort || undefined, owner: f.owner || undefined, notes: f.notes } }))
      .then((d) => onSaved(d.item)).catch(() => {});
  };
  return (
    <Modal title={`${t('enroll')}: ${customer.nameAr}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label={t('chooseProgram')}>
          <select required value={f.program} onChange={set('program')}>
            <option value="">—</option>
            {(programs.data?.items || []).map((p) => <option key={p._id} value={p._id}>{label({ ar: p.titleAr, en: p.titleEn })} ({p.modules})</option>)}
          </select>
        </Field>
        {f.program && (
          <Field label={t('cohort')}>
            <select value={f.cohort} onChange={set('cohort')}>
              <option value="">{t('noCohort')}</option>
              {(cohorts.data?.items || []).map((c) => <option key={c._id} value={c._id}>{label({ ar: c.nameAr, en: c.nameEn })}</option>)}
            </select>
          </Field>
        )}
        {can('enrollments.manage', 'team') && <Field label={t('owner')}><StaffSelect value={f.owner || customer.owner?.id} onChange={set('owner')} /></Field>}
        <Field label={t('note')}><input value={f.notes} onChange={set('notes')} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('enroll')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

// ---- one enrollment ----

function ActionDialog({ action, mod, onClose, onSubmit }) {
  const { t } = useI18n();
  const [note, setNote] = useState('');
  const { busy, error, run } = useAction();
  const needsNote = NOTE_ACTIONS.includes(action);
  return (
    <Modal title={`${t(`act_${action}`)}: ${mod.titleAr}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => onSubmit(note)).then(onClose).catch(() => {}); }}>
        <Field label={needsNote ? t('reason') : `${t('note')} (${t('optional')})`}><textarea rows={3} required={needsNote} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button className={`btn ${needsNote ? 'btn--danger' : 'btn--primary'}`} disabled={busy}>{t('confirm')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

export function ModuleCard({ e, m, onChanged, readOnly }) {
  const { t, label, fmtDate } = useI18n();
  const [pending, setPending] = useState(null);
  const run = (action, note) => api(`/api/v2/enrollments/${e._id}/modules/${m.module}`, { method: 'POST', body: { action, note, __v: e.__v } }).then(onChanged);
  const quick = ['start', 'submit', 'rework'];
  return (
    <li className="module-item">
      <div className="module-row">
        <span className="module-order">{m.order || '•'}</span>
        <div className="grow">
          <strong>{label({ ar: m.titleAr, en: m.titleEn })}</strong>
          <div className="module-meta">
            {m.required ? t('requiredModule') : t('optional')}
            {m.submittedAt ? ` · ${t('submittedAt')}: ${fmtDate(m.submittedAt)}` : ''}
            {m.teamLeaderReview && m.status === 'ready_for_review' ? ` · ${t('teamLeaderReview')}: ${m.teamLeaderReview.decision === 'approved' ? '✓' : '✗'} ${m.teamLeaderReview.byName || ''}` : ''}
          </div>
          {m.status === 'rejected' && m.rejectionReason && <div className="alert alert--error">{m.rejectionReason}</div>}
        </div>
        <ModuleStatus status={m.status} />
        {!readOnly && m.actions && m.actions.length > 0 && (
          <div className="module-actions">
            {m.actions.map((a) => (
              <button key={a} type="button" className={`btn btn--small${a === 'approve' || a === 'team_leader_approve' ? ' btn--primary' : ''}`}
                onClick={() => (quick.includes(a) ? run(a, '') : setPending(a))}>{t(`act_${a}`)}</button>
            ))}
          </div>
        )}
      </div>
      {!readOnly && m.history && m.history.length > 0 && (
        <details className="review-log">
          <summary>{t('reviewHistory')} ({m.history.length})</summary>
          <ul>{m.history.slice().reverse().map((h, i) => <li key={i}>{fmtDate(h.at)} · {h.byName}: {h.from} → {h.to}{h.note && h.note !== h.to ? ` — ${h.note}` : ''}</li>)}</ul>
        </details>
      )}
      {pending && <ActionDialog action={pending} mod={m} onClose={() => setPending(null)} onSubmit={(note) => run(pending, note)} />}
    </li>
  );
}

function EditEnrollment({ e, onClose, onSaved }) {
  const { t, en, label } = useI18n();
  const cohorts = useLoad(`/api/v2/cohorts?program=${e.program}`);
  const [f, setF] = useState({ status: e.status, cohort: e.cohort?._id || '', owner: e.owner?._id || '', notes: e.notes || '', reason: '' });
  const { busy, error, run } = useAction();
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target ? ev.target.value : ev });
  const submit = (ev) => {
    ev.preventDefault();
    const body = { __v: e.__v, notes: f.notes, reason: f.reason };
    if (f.status !== e.status) body.status = f.status;
    if (f.cohort !== (e.cohort?._id || '')) body.cohort = f.cohort || null;
    if (f.owner && f.owner !== (e.owner?._id || '')) body.owner = f.owner;
    run(() => api(`/api/v2/enrollments/${e._id}`, { method: 'PUT', body })).then(onSaved).catch(() => {});
  };
  return (
    <Modal title={`${t('edit')}: ${e.enrollmentNo}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label={t('status')}><select value={f.status} onChange={set('status')}>{ENROLLMENT_STATUSES.map((s) => <option key={s} value={s}>{en('enrollmentStatus', s)}</option>)}</select></Field>
        <Field label={t('cohort')}>
          <select value={f.cohort} onChange={set('cohort')}><option value="">{t('noCohort')}</option>{(cohorts.data?.items || []).map((c) => <option key={c._id} value={c._id}>{label({ ar: c.nameAr, en: c.nameEn })}</option>)}</select>
        </Field>
        {e.permissions?.canManage && <Field label={t('owner')}><StaffSelect value={f.owner} onChange={set('owner')} /></Field>}
        <Field label={t('note')}><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
        <Field label={t('reason')}><input value={f.reason} onChange={set('reason')} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

export function EnrollmentDetail() {
  const { id } = useParams();
  const { t, en, label, fmtDay } = useI18n();
  const state = useLoad(`/api/v2/enrollments/${id}`, [id]);
  const [editing, setEditing] = useState(false);
  const sync = () => api(`/api/v2/enrollments/${id}/sync-modules`, { method: 'POST', body: {} }).then(state.reload);
  return (
    <Loading state={state}>
      {({ item: e }) => (
        <>
          <Link to="/enrollments" className="muted">← {t('enrollmentsNav')}</Link>
          <div className="page-head">
            <div>
              <h1 className="page-title">{label({ ar: e.programTitleAr, en: e.programTitleEn })} <small className="muted" dir="ltr">{e.enrollmentNo}</small></h1>
              <div className="row">
                <Pill tone={e.status === 'completed' ? 'ok' : e.status === 'active' ? 'info' : 'muted'}>{en('enrollmentStatus', e.status)}</Pill>
                {e.eligibleForFinalCertificate && <Pill tone="ok">{t('eligible')}</Pill>}
              </div>
            </div>
            <div className="row">
              {e.permissions?.canUpdate && <button type="button" className="btn btn--primary" onClick={() => setEditing(true)}>{t('edit')}</button>}
              {e.permissions?.canUpdate && <button type="button" className="btn btn--ghost" onClick={sync}>{t('syncModules')}</button>}
            </div>
          </div>
          <section className="card">
            <div className="info-grid">
              <div className="info"><small>{t('customer')}</small><div><Link to={`/customers/${e.customer._id}`}>{e.customer.customerNo} — {e.customer.nameAr}</Link></div></div>
              <div className="info"><small>{t('owner')}</small><div>{e.owner ? e.owner.name : t('unassigned')}</div></div>
              <div className="info"><small>{t('team')}</small><div>{e.team ? label({ ar: e.team.nameAr, en: e.team.nameEn }) : '—'}</div></div>
              <div className="info"><small>{t('cohort')}</small><div>{e.cohort ? label({ ar: e.cohort.nameAr, en: e.cohort.nameEn }) : t('noCohort')}</div></div>
              <div className="info"><small>{t('enrolledAt')}</small><div>{fmtDay(e.enrolledAt)}</div></div>
              <div className="info"><small>{t('completedAt')}</small><div>{e.completedAt ? fmtDay(e.completedAt) : '—'}</div></div>
              <div className="info"><small>{t('progress')}</small><div><ProgressBar progress={e.progress} /></div></div>
              {e.statusReason && <div className="info"><small>{t('statusReason')}</small><div>{e.statusReason}</div></div>}
            </div>
            {e.notes && <p className="muted">{e.notes}</p>}
          </section>
          <section className="card">
            <h2>{t('modules')}</h2>
            {!e.modules.length ? <p className="muted">{t('noModules')}</p> : (
              <ol className="module-list">{e.modules.map((m) => <ModuleCard key={m.module} e={e} m={m} onChanged={state.reload} />)}</ol>
            )}
          </section>
          <SplitEditor enrollmentId={e._id} />
          {editing && <EditEnrollment e={e} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); state.reload(); }} />}
        </>
      )}
    </Loading>
  );
}

// ---- lists ----

export default function Enrollments() {
  const { t, en, label, fmtDay } = useI18n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const programs = useLoad('/api/v2/programs?limit=500');
  const page = parseInt(params.get('page') || '1', 10);
  const q = new URLSearchParams(params);
  q.set('limit', '50');
  const state = useLoad(`/api/v2/enrollments?${q}`);
  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };
  return (
    <>
      <h1 className="page-title">{t('enrollmentsNav')}</h1>
      <div className="card filters">
        <Field label={t('program')}>
          <select value={params.get('program') || ''} onChange={(e) => setParam('program', e.target.value)}>
            <option value="">{t('all')}</option>
            {(programs.data?.items || []).map((p) => <option key={p._id} value={p._id}>{label({ ar: p.titleAr, en: p.titleEn })}</option>)}
          </select>
        </Field>
        <Field label={t('status')}>
          <select value={params.get('status') || ''} onChange={(e) => setParam('status', e.target.value)}>
            <option value="">{t('all')}</option>{ENROLLMENT_STATUSES.map((s) => <option key={s} value={s}>{en('enrollmentStatus', s)}</option>)}
          </select>
        </Field>
        <Field label={t('module')}>
          <select value={params.get('moduleStatus') || ''} onChange={(e) => setParam('moduleStatus', e.target.value)}>
            <option value="">{t('all')}</option>{MODULE_STATUSES.map((s) => <option key={s} value={s}>{en('moduleStatus', s)}</option>)}
          </select>
        </Field>
        <Field label={t('owner')}>
          <select value={params.get('mine') || ''} onChange={(e) => setParam('mine', e.target.value)}><option value="">{t('all')}</option><option value="1">{t('mine')}</option></select>
        </Field>
      </div>
      <section className="card">
        <Loading state={state}>
          {(d) => (!d.items.length ? <p className="muted">{t('noResults')}</p> : (
            <>
              <div className="table-wrap">
                <table className="table table--hover">
                  <thead><tr><th>{t('enrollmentNo')}</th><th>{t('customer')}</th><th>{t('program')}</th><th>{t('cohort')}</th><th>{t('owner')}</th><th>{t('progress')}</th><th>{t('status')}</th><th>{t('enrolledAt')}</th></tr></thead>
                  <tbody>
                    {d.items.map((e) => (
                      <tr key={e._id} onClick={() => navigate(`/enrollments/${e._id}`)}>
                        <td dir="ltr">{e.enrollmentNo}</td>
                        <td>{e.customer?.customerNo}<br /><small>{e.customer?.nameAr}</small></td>
                        <td>{label({ ar: e.programTitleAr, en: e.programTitleEn })}</td>
                        <td>{e.cohort ? label({ ar: e.cohort.nameAr, en: e.cohort.nameEn }) : '—'}</td>
                        <td>{e.owner ? e.owner.name : '—'}</td>
                        <td><ProgressBar progress={e.progress} /></td>
                        <td><Pill tone={e.status === 'completed' ? 'ok' : e.status === 'active' ? 'info' : 'muted'}>{en('enrollmentStatus', e.status)}</Pill></td>
                        <td className="nowrap">{fmtDay(e.enrolledAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={page} total={d.total} limit={d.limit} onPage={(p) => setParam('page', String(p))} />
            </>
          ))}
        </Loading>
      </section>
    </>
  );
}

export function Reviews() {
  const { t, fmtDate, label } = useI18n();
  const state = useLoad('/api/v2/reviews');
  const [pending, setPending] = useState(null);
  const run = (r, action, note) => api(`/api/v2/enrollments/${r.enrollmentId}/modules/${r.module.id}`, { method: 'POST', body: { action, note, __v: r.__v } }).then(state.reload);
  return (
    <>
      <h1 className="page-title">{t('reviews')}</h1>
      <section className="card">
        <Loading state={state}>
          {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('module')}</th><th>{t('program')}</th><th>{t('customer')}</th><th>{t('owner')}</th><th>{t('submittedAt')}</th><th>{t('teamLeaderReview')}</th><th /></tr></thead>
                <tbody>
                  {d.items.map((r) => (
                    <tr key={`${r.enrollmentId}-${r.module.id}`}>
                      <td><strong>{label({ ar: r.module.titleAr, en: r.module.titleEn })}</strong></td>
                      <td><Link to={`/enrollments/${r.enrollmentId}`}>{r.program}</Link><br /><small className="muted" dir="ltr">{r.enrollmentNo}</small></td>
                      <td>{r.customer?.customerNo} {r.customer?.nameAr}</td>
                      <td>{r.owner?.name || '—'}</td>
                      <td className="nowrap">{fmtDate(r.module.submittedAt)}</td>
                      <td>{r.module.teamLeaderReview ? `✓ ${r.module.teamLeaderReview.byName || ''}` : '—'}</td>
                      <td className="nowrap">
                        {r.actions.map((a) => (
                          <button key={a} type="button" className={`btn btn--small${a.includes('approve') ? ' btn--primary' : ''}`} onClick={() => (a.includes('approve') ? run(r, a, '') : setPending({ r, a }))}>{t(`act_${a}`)}</button>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </Loading>
      </section>
      {pending && <ActionDialog action={pending.a} mod={pending.r.module} onClose={() => setPending(null)} onSubmit={(note) => run(pending.r, pending.a, note)} />}
    </>
  );
}

// The Programs tab of a customer file
export function CustomerPrograms({ c }) {
  const { t, en, label, fmtDay } = useI18n();
  const { can } = useAuth();
  const navigate = useNavigate();
  const state = useLoad(`/api/v2/customers/${c.id}/enrollments`);
  const [enrolling, setEnrolling] = useState(false);
  return (
    <section className="card">
      {can('enrollments.create') && <div className="card-head"><span /><button type="button" className="btn btn--primary" onClick={() => setEnrolling(true)}>+ {t('enroll')}</button></div>}
      <Loading state={state}>
        {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : d.items.map((e) => (
          <div key={e._id} className="program-card">
            <div className="card-head">
              <div>
                <Link to={`/enrollments/${e._id}`}><strong>{label({ ar: e.programTitleAr, en: e.programTitleEn })}</strong></Link> <small className="muted" dir="ltr">{e.enrollmentNo}</small>
                <div className="module-meta">{fmtDay(e.enrolledAt)}{e.cohort ? ` · ${label({ ar: e.cohort.nameAr, en: e.cohort.nameEn })}` : ''}{e.owner ? ` · ${e.owner.name}` : ''}</div>
              </div>
              <div className="row"><ProgressBar progress={e.progress} /><Pill tone={e.status === 'completed' ? 'ok' : 'info'}>{en('enrollmentStatus', e.status)}</Pill></div>
            </div>
            <div className="mini-modules">{e.modules.map((m) => <span key={m.module} title={en('moduleStatus', m.status)}><ModuleStatus status={m.status} /> {label({ ar: m.titleAr, en: m.titleEn })}</span>)}</div>
          </div>
        )))}
      </Loading>
      {enrolling && <EnrollForm customer={c} onClose={() => setEnrolling(false)} onSaved={(e) => navigate(`/enrollments/${e._id}`)} />}
    </section>
  );
}

// The customer's own view of their programs
export function MyPrograms() {
  const { t, en, label, fmtDay } = useI18n();
  const state = useLoad('/api/v2/my/enrollments');
  return (
    <>
      <h1 className="page-title">{t('myPrograms')}</h1>
      <Loading state={state}>
        {(d) => (!d.items.length ? <section className="card"><p className="muted">{t('noData')}</p></section> : d.items.map((e) => (
          <section className="card" key={e._id}>
            <div className="card-head">
              <div>
                <h2>{label({ ar: e.programTitleAr, en: e.programTitleEn })}</h2>
                <div className="module-meta">{t('enrolledAt')}: {fmtDay(e.enrolledAt)}{e.cohort ? ` · ${label({ ar: e.cohort.nameAr, en: e.cohort.nameEn })}${e.cohort.schedule ? ` (${e.cohort.schedule})` : ''}` : ''}</div>
              </div>
              <div className="row"><ProgressBar progress={e.progress} /><Pill tone={e.status === 'completed' ? 'ok' : 'info'}>{en('enrollmentStatus', e.status)}</Pill></div>
            </div>
            <ol className="module-list">{e.modules.map((m) => <ModuleCard key={m.module} e={e} m={m} readOnly onChanged={() => {}} />)}</ol>
          </section>
        )))}
      </Loading>
    </>
  );
}
