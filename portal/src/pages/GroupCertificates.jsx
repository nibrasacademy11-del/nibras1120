import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Loading, Modal, Pill, useAction, useLoad } from '../components/ui.jsx';

// The group's certificates: the rule for issuing them, approving a module for everyone,
// and each member's certificates with what holds them back

const REASON_TONE = { not_approved: 'muted', low_attendance: 'gold', unpaid: 'warn', issued: 'ok' };
export const owed = (list) => (list || []).map((x) => `${Number(x.remaining).toLocaleString('en-US')} ${x.currency}`).join(' + ');

function RuleForm({ group, data, onSaved }) {
  const { t } = useI18n();
  const r = data.rule;
  const [f, setF] = useState({ mode: r.mode, issue: r.issue, date: r.date ? String(r.date).slice(0, 10) : '', daysAfterEnd: r.daysAfterEnd, minAttendance: r.minAttendance, sendEmail: r.sendEmail });
  const { busy, error, run } = useAction();
  const [saved, setSaved] = useState(false);
  const set = (k) => (e) => { setSaved(false); setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); };
  const submit = (e) => {
    e.preventDefault();
    run(() => api(`/api/v2/groups/${group._id}/certificate-rule`, { method: 'PUT', body: { ...f, date: f.date || null, daysAfterEnd: Number(f.daysAfterEnd), minAttendance: Number(f.minAttendance) } }))
      .then(() => { setSaved(true); onSaved(); }).catch(() => {});
  };
  return (
    <form className="form-grid" onSubmit={submit}>
      <Field label={t('gcMode')}>
        <select value={f.mode} onChange={set('mode')} disabled={!data.canIssue}>{['manual', 'on_approval', 'on_date', 'after_end'].map((m) => <option key={m} value={m}>{t(`mode_${m}`)}</option>)}</select>
      </Field>
      <Field label={t('gcIssueWhat')}>
        <select value={f.issue} onChange={set('issue')} disabled={!data.canIssue}>{['both', 'modules', 'program'].map((m) => <option key={m} value={m}>{t(`issue_${m}`)}</option>)}</select>
      </Field>
      {f.mode === 'on_date' && <Field label={t('gcDate')}><input type="date" required value={f.date} onChange={set('date')} /></Field>}
      {f.mode === 'after_end' && <Field label={t('gcDays')}><input type="number" min={0} max={365} value={f.daysAfterEnd} onChange={set('daysAfterEnd')} /></Field>}
      <Field label={t('gcMinAttendance')}><input type="number" min={0} max={100} value={f.minAttendance} onChange={set('minAttendance')} disabled={!data.canIssue} /></Field>
      <label className="check field--wide"><input type="checkbox" checked={f.sendEmail} onChange={set('sendEmail')} disabled={!data.canIssue} /> {t('gcSendEmail')}</label>
      <p className="muted field--wide"><small>{t('gcPaymentNote')}</small></p>
      <div className="field--wide"><ErrorBox error={error} />{saved && <div className="alert alert--ok">{t('saved')}</div>}</div>
      {data.canIssue && <div className="field--wide"><button className="btn btn--primary" disabled={busy}>{t('gcSaveRule')}</button></div>}
    </form>
  );
}

function ApproveDialog({ group, mod, onClose, onDone }) {
  const { t, label } = useI18n();
  const [note, setNote] = useState('');
  const [result, setResult] = useState(null);
  const { busy, error, run } = useAction();
  const go = (e) => {
    e.preventDefault();
    run(() => api(`/api/v2/groups/${group._id}/approve-module`, { method: 'POST', body: { module: mod.module, note } })).then(setResult).catch(() => {});
  };
  return (
    <Modal title={`${t('gcApproveAll')}: ${label({ ar: mod.titleAr, en: mod.titleEn })}`} onClose={result ? onDone : onClose}>
      {result ? (
        <div className="stack">
          <p>{t('gcApprovedN')}: <strong>{result.approved}</strong> · {t('gcAlreadyN')}: {result.already}</p>
          <button type="button" className="btn btn--primary" onClick={onDone}>{t('close')}</button>
        </div>
      ) : (
        <form className="stack" onSubmit={go}>
          <div className="alert alert--warn">{t('gcApproveConfirm')}</div>
          <Field label={t('gcApproveNote')}><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <ErrorBox error={error} />
          <div className="row"><button className="btn btn--primary" disabled={busy}>{t('gcApproveAll')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
        </form>
      )}
    </Modal>
  );
}

export default function GroupCertificates({ group }) {
  const { t, en, label } = useI18n();
  const state = useLoad(`/api/v2/groups/${group._id}/certificates`);
  const [approve, setApprove] = useState(null);
  const [filter, setFilter] = useState('');
  const [results, setResults] = useState(null);
  const { busy, error, run } = useAction();
  const issue = () => run(() => api(`/api/v2/groups/${group._id}/certificates/issue`, { method: 'POST', body: {} })).then((d) => { setResults(d.results); state.reload(); }).catch(() => {});
  return (
    <Loading state={state}>
      {(d) => {
        const ready = d.items.filter((i) => i.reason === null);
        const shown = d.items.filter((i) => (filter === '' ? true : filter === 'ready' ? i.reason === null : i.reason === filter));
        return (
          <>
            <section className="card">
              <h2>{t('gcRule')}</h2>
              {d.due && d.rule.mode !== 'manual' && <div className="alert alert--info">{t('gcDueNow')}</div>}
              <RuleForm group={group} data={d} onSaved={state.reload} />
            </section>

            {d.modules.length > 0 && (
              <section className="card">
                <h2>{t('gcModules')}</h2>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>{t('lecModule')}</th><th>{t('status')}</th><th /></tr></thead>
                    <tbody>
                      {d.modules.map((m) => (
                        <tr key={m.module}>
                          <td>{label({ ar: m.titleAr, en: m.titleEn })}</td>
                          <td><div className="tags">{Object.entries(m.counts).map(([s, n]) => <span className="tag" key={s}>{en('moduleStatus', s)}: {n}</span>)}</div></td>
                          <td>{d.canApprove && Object.entries(m.counts).some(([s]) => !['approved', 'certificate_issued'].includes(s)) && <button type="button" className="btn btn--small" onClick={() => setApprove(m)}>{t('gcApproveAll')}</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="card">
              <div className="card-head">
                <h2>{t('gcPlan')}</h2>
                <div className="row">
                  <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('status')}>
                    <option value="">{t('gcFilterAll')} ({d.items.length})</option>
                    <option value="ready">{t('gcReady')} ({ready.length})</option>
                    {['unpaid', 'low_attendance', 'not_approved', 'issued'].map((r) => <option key={r} value={r}>{t(`reason_${r}`)} ({d.items.filter((i) => i.reason === r).length})</option>)}
                  </select>
                  {d.canIssue && <button type="button" className="btn btn--primary" disabled={busy || !ready.length} onClick={issue}>{t('gcIssueReady')} ({ready.length})</button>}
                </div>
              </div>
              <ErrorBox error={error} />
              {results && (
                <div className="alert alert--info">
                  {t('gcIssuedN')}: {results.filter((r) => r.ok).length}
                  {results.some((r) => !r.ok) && <> · {t('gcFailedN')}: {results.filter((r) => !r.ok).map((r) => `${r.customerNo} (${r.message})`).join('، ')}</>}
                  {results.some((r) => r.emailError) && <> · {t('cdEmailError')}: {results.filter((r) => r.emailError).length}</>}
                </div>
              )}
              {!shown.length ? <p className="muted">{t('noData')}</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>{t('customerNo')}</th><th>{t('name')}</th><th>{t('certificate')}</th><th>{t('grpAttendanceRate')}</th><th>{t('status')}</th></tr></thead>
                    <tbody>
                      {shown.map((i) => (
                        <tr key={`${i.enrollment}:${i.module || 'p'}`}>
                          <td>{i.customer.canOpen ? <Link to={`/customers/${i.customer._id}`}>{i.customer.customerNo}</Link> : i.customer.customerNo}</td>
                          <td>{i.customer.name}</td>
                          <td>{i.kind === 'program' ? <Pill tone="gold">{t('gcFinal')}</Pill> : label({ ar: i.titleAr, en: i.titleEn })}</td>
                          <td>{i.rate === null ? '—' : `${i.rate}%`}</td>
                          <td>
                            {i.reason === null ? <Pill tone="ok">{t('gcReady')}</Pill> : <Pill tone={REASON_TONE[i.reason]}>{t(`reason_${i.reason}`)}</Pill>}
                            {i.remaining.length > 0 && i.reason !== 'issued' && <><br /><small className="late" dir="ltr">{owed(i.remaining)}</small></>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            {approve && <ApproveDialog group={group} mod={approve} onClose={() => setApprove(null)} onDone={() => { setApprove(null); state.reload(); }} />}
          </>
        );
      }}
    </Loading>
  );
}
