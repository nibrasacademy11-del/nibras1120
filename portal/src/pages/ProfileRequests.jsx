import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Loading, Modal, Pill, useAction, useLoad } from '../components/ui.jsx';

// The customers' requests to change their locked data (the data printed on certificates).
// The owner and customer service answer them; an approval applies the change and reissues the
// certificates in force when the name changed. PLAN-V2 §3.

const TONE = { pending: 'gold', approved: 'ok', rejected: 'warn', cancelled: 'muted' };

function Changes({ changes }) {
  const { t } = useI18n();
  return (
    <ul className="prq-changes">
      {changes.map((c) => (
        <li key={c.field}>
          <strong>{t(`prq_f_${c.field}`)}:</strong> <bdi className="prq-from">{c.from || '—'}</bdi> <span aria-hidden="true">←</span> <bdi className="prq-to">{c.to}</bdi>
        </li>
      ))}
    </ul>
  );
}

function Decide({ item, decision, onClose, onDone }) {
  const { t } = useI18n();
  const { busy, error, run } = useAction();
  const [note, setNote] = useState('');
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await api(`/api/v2/profile-requests/${item._id}/decide`, { method: 'POST', body: { decision, note, __v: item.__v } });
      onDone(r);
    }).catch(() => {});
  };
  return (
    <Modal title={decision === 'approve' ? t('prq_approve') : t('prq_reject')} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p><strong>{item.customer?.nameAr}</strong> <small className="muted" dir="ltr">{item.customer?.customerNo}</small></p>
        <Changes changes={item.changes} />
        {decision === 'approve' && item.changes.some((c) => c.field === 'nameAr' || c.field === 'nameEn') && <div className="alert alert--info">{t('prq_reissueNote')}</div>}
        <Field label={decision === 'approve' ? t('prq_note') : t('prq_rejectNote')} wide>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} required={decision === 'reject'} />
        </Field>
        <ErrorBox error={error} />
        <div className="row">
          <button className={`btn ${decision === 'approve' ? 'btn--primary' : 'btn--danger'}`} disabled={busy}>{decision === 'approve' ? t('prq_approve') : t('prq_reject')}</button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function ProfileRequests() {
  const { t, fmtDate } = useI18n();
  const { can } = useAuth();
  const [status, setStatus] = useState('pending');
  const state = useLoad(`/api/v2/profile-requests${status ? `?status=${status}` : ''}`);
  const [deciding, setDeciding] = useState(null);
  const [done, setDone] = useState('');
  const canDecide = can('profile_requests.approve', 'all');

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('prq_title')}</h1>
      </div>
      <p className="muted">{t('prq_hint')}</p>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" className={`tab${status === 'pending' ? ' active' : ''}`} aria-selected={status === 'pending'} onClick={() => setStatus('pending')}>{t('prq_pending')}</button>
        <button type="button" role="tab" className={`tab${status === '' ? ' active' : ''}`} aria-selected={status === ''} onClick={() => setStatus('')}>{t('all')}</button>
      </div>
      {done && <div className="alert alert--ok" role="status">{done}</div>}
      <section className="card">
        <Loading state={state}>
          {(d) => (!d.items.length ? <p className="muted">{t('prq_none')}</p> : (
            <ul className="prq-list">
              {d.items.map((r) => (
                <li key={r._id} className="prq-item">
                  <div className="prq-main">
                    <div className="prq-who">
                      {r.customer ? <Link to={`/customers/${r.customer._id}`}><strong>{r.customer.nameAr}</strong></Link> : <strong>—</strong>}
                      <small className="muted" dir="ltr">{r.customer?.customerNo}</small>
                      <Pill tone={TONE[r.status]}>{t(`prq_s_${r.status}`)}</Pill>
                    </div>
                    <Changes changes={r.changes} />
                    <p className="prq-reason"><span className="muted">{t('prq_reason')}:</span> {r.reason}</p>
                    <small className="muted">
                      {fmtDate(r.createdAt)}
                      {r.decidedAt && r.status !== 'cancelled' ? ` · ${t('prq_decidedBy')} ${r.decidedByName || '—'} (${fmtDate(r.decidedAt)})` : ''}
                      {r.decisionNote ? ` · ${r.decisionNote}` : ''}
                      {r.reissued?.length ? ` · ${t('prq_reissued')}: ${r.reissued.join('، ')}` : ''}
                    </small>
                  </div>
                  {r.status === 'pending' && canDecide && (
                    <div className="prq-actions">
                      <button type="button" className="btn btn--primary btn--small" onClick={() => setDeciding({ item: r, decision: 'approve' })}>{t('prq_approve')}</button>
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => setDeciding({ item: r, decision: 'reject' })}>{t('prq_reject')}</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ))}
        </Loading>
      </section>
      {deciding && (
        <Decide
          {...deciding}
          onClose={() => setDeciding(null)}
          onDone={(r) => { setDeciding(null); setDone(r.item.status === 'approved' ? `${t('prq_doneApproved')}${r.reissued?.length ? ` ${t('prq_reissued')}: ${r.reissued.join('، ')}` : ''}` : t('prq_doneRejected')); state.reload(); }}
        />
      )}
    </>
  );
}

// A line on the customers page while requests wait for an answer
export function ProfileRequestsBanner() {
  const { t } = useI18n();
  const { can } = useAuth();
  const allowed = can('profile_requests.view', 'all');
  const state = useLoad(allowed ? '/api/v2/profile-requests?status=pending' : null);
  const n = state.data?.pending || 0;
  if (!allowed || !n) return null;
  return (
    <Link to="/profile-requests" className="card prq-banner">
      <span className="prq-banner__count">{n}</span>
      <span>{t('prq_banner')}</span>
      <span aria-hidden="true">←</span>
    </Link>
  );
}
